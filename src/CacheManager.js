const { execFile, spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

class CacheManager {
    constructor() {
        this.cacheDir = path.resolve(__dirname, '../music_cache');
        this.binPath = path.resolve(__dirname, '../bin/yt-dlp');
        
        this.ffmpegBundlePath = path.resolve(__dirname, '../bin/ffmpeg-bundle');
        this.ffmpegPath = path.join(this.ffmpegBundlePath, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
        
        // Setup directories and binaries
        try {
            if (!fs.existsSync(this.ffmpegBundlePath)) {
                fs.mkdirSync(this.ffmpegBundlePath, { recursive: true });
            }

            // Remove unneeded ffprobe if present to immediately free ~75MB disk space
            const bundledFfprobe = path.join(this.ffmpegBundlePath, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
            if (fs.existsSync(bundledFfprobe)) {
                try {
                    fs.unlinkSync(bundledFfprobe);
                    console.log('[CacheManager] Removed unneeded ffprobe to save disk space.');
                } catch {}
            }

            // Check if ffmpeg is in system PATH first
            let systemFfmpeg = null;
            try {
                const checkCmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
                const output = execSync(checkCmd, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim().split('\n')[0].trim();
                if (output && fs.existsSync(output)) {
                    systemFfmpeg = output;
                }
            } catch {}

            if (systemFfmpeg) {
                this.ffmpegPath = systemFfmpeg;
                console.log(`[CacheManager] Using system FFmpeg: ${this.ffmpegPath}`);
            } else if (!fs.existsSync(this.ffmpegPath) && process.platform !== 'win32') {
                // Download standalone ffmpeg (only ffmpeg, NOT ffprobe)
                console.log('[CacheManager] Downloading standalone ffmpeg binary...');
                execSync(`curl -L "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64" -o "${this.ffmpegPath}"`);
                fs.chmodSync(this.ffmpegPath, 0o755);
            }
        } catch (err) {
            console.error('[CacheManager] FFmpeg setup notice:', err.message);
        }

        this.downloadPromises = new Map();

        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    getTrackPath(identifier) {
        return path.join(this.cacheDir, `${identifier}.opus`);
    }

    isCached(identifier) {
        const filePath = this.getTrackPath(identifier);
        return fs.existsSync(filePath) && fs.statSync(filePath).size > 1024;
    }

    _buildYtDlpArgs(source, isStreamOutput = false, outTemplate = null) {
        const args = [
            '--no-cache-dir',
            '--no-playlist',
            '--no-warnings',
            '--no-progress',
            '--retries', '5',
            '--fragment-retries', '5',
            '--retry-sleep', '1',
            '--buffer-size', '16K',
            '-f', '251/bestaudio/best'
        ];

        const isSoundCloud = source.includes('soundcloud.com') || source.startsWith('scsearch');
        const cookiesPath = path.resolve(__dirname, '../cookies.txt');
        const hasCookies = fs.existsSync(cookiesPath);

        if (process.env.PROXY_URL && !isSoundCloud) {
            args.push('--proxy', process.env.PROXY_URL);
        }

        if (hasCookies && !isSoundCloud) {
            args.push('--cookies', cookiesPath);
        } else if (!isSoundCloud) {
            args.push('--extractor-args', 'youtube:player_client=android,web');
        }

        if (isStreamOutput) {
            args.push('-o', '-');
        } else if (outTemplate) {
            args.push('--ffmpeg-location', this.ffmpegBundlePath);
            args.push('-x', '--audio-format', 'opus');
            args.push('--force-overwrites');
            args.push('-o', outTemplate);
        }

        args.push(source);
        return args;
    }

    _getSoundCloudFallback(track) {
        const title = track.title || '';
        const author = track.author || '';
        const cleanTitle = title
            .replace(/\[.*?\]|\(.*?\)|【.*?】|MV|Official|Music Video|Audio|Lyrics/gi, '')
            .replace(/[|/\\#~!?@$%^&*_+<>{}=]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const query = `${cleanTitle || title} ${author}`.trim();
        return query ? `scsearch1:${query}` : null;
    }

    /**
     * True Real-time Direct Streaming:
     * Pipes yt-dlp stdout directly into ffmpeg stdin, and ffmpeg outputs Ogg Opus
     * directly into Discord Voice. Playback starts in 1-2 seconds with zero full-disk writes.
     * Automatically falls back to SoundCloud if YouTube blocks the server.
     */
    async createTrackStream(track, seekSeconds = 0) {
        const identifier = track.identifier || Buffer.from(track.uri || '').toString('hex').slice(0, 20);
        const targetPath = this.getTrackPath(identifier);

        // 1. Play from cached file if present
        if (this.isCached(identifier)) {
            const ffmpegArgs = ['-nostdin', '-loglevel', 'quiet'];
            if (seekSeconds > 0) {
                ffmpegArgs.push('-ss', seekSeconds.toString());
            }
            ffmpegArgs.push('-i', targetPath, '-f', 'opus', '-c:a', 'copy', 'pipe:1');

            const ffmpegProc = spawn(this.ffmpegPath, ffmpegArgs);
            ffmpegProc.on('error', (err) => console.error('[CacheManager] ffmpeg cached stream error:', err.message));
            ffmpegProc.stdout.kill = () => {
                try { ffmpegProc.kill('SIGKILL'); } catch {}
            };
            return ffmpegProc.stdout;
        }

        // 2. Direct streaming via yt-dlp -> ffmpeg
        return this._spawnPipedStream(track, track.uri, seekSeconds, false);
    }

    _spawnPipedStream(track, sourceUri, seekSeconds = 0, isFallback = false) {
        return new Promise((resolve, reject) => {
            const ytdlpArgs = this._buildYtDlpArgs(sourceUri, true);
            const ytdlpProc = spawn(this.binPath, ytdlpArgs);

            const ffmpegArgs = ['-nostdin', '-loglevel', 'quiet'];
            if (seekSeconds > 0) {
                ffmpegArgs.push('-ss', seekSeconds.toString());
            }
            ffmpegArgs.push(
                '-i', 'pipe:0',
                '-vn',
                '-c:a', 'libopus',
                '-b:a', '96k',
                '-vbr', 'on',
                '-ar', '48000',
                '-ac', '2',
                '-f', 'opus',
                'pipe:1'
            );

            const ffmpegProc = spawn(this.ffmpegPath, ffmpegArgs);

            // Pipe yt-dlp stdout into ffmpeg stdin
            ytdlpProc.stdout.pipe(ffmpegProc.stdin);

            let hasOutput = false;
            let stderrBuffer = '';
            let streamTimeout = null;

            ytdlpProc.stderr.on('data', (chunk) => {
                stderrBuffer += chunk.toString();
                if (stderrBuffer.length > 3000) stderrBuffer = stderrBuffer.slice(-3000);
            });

            const stream = ffmpegProc.stdout;

            // Combined kill helper for clean termination
            stream.kill = () => {
                if (streamTimeout) {
                    clearTimeout(streamTimeout);
                    streamTimeout = null;
                }
                try { ytdlpProc.kill('SIGKILL'); } catch {}
                try { ffmpegProc.kill('SIGKILL'); } catch {}
            };

            // Detect if stream started outputting audio bytes
            stream.once('data', () => {
                hasOutput = true;
                if (streamTimeout) {
                    clearTimeout(streamTimeout);
                    streamTimeout = null;
                }
                resolve(stream);
            });

            // Handle premature failures
            ytdlpProc.on('error', async (err) => {
                console.error(`[CacheManager] yt-dlp error on "${track.title}":`, err.message);
                stream.kill();
                if (!hasOutput && !isFallback) {
                    const fallback = this._trySoundCloudFallback(track, seekSeconds);
                    if (fallback) return resolve(fallback);
                }
                reject(err);
            });

            ffmpegProc.on('error', (err) => {
                console.error(`[CacheManager] ffmpeg error on "${track.title}":`, err.message);
                stream.kill();
                if (!hasOutput && !isFallback) {
                    const fallback = this._trySoundCloudFallback(track, seekSeconds);
                    if (fallback) return resolve(fallback);
                }
                reject(err);
            });

            ytdlpProc.on('close', async (code) => {
                if (streamTimeout) {
                    clearTimeout(streamTimeout);
                    streamTimeout = null;
                }
                if (code !== 0 && !hasOutput) {
                    const isBotBan = stderrBuffer.includes('Sign in to confirm') || 
                                     stderrBuffer.includes('bot') || 
                                     stderrBuffer.includes('429') ||
                                     stderrBuffer.includes('403') ||
                                     stderrBuffer.includes('Private video');

                    console.warn(`[CacheManager] yt-dlp exited (code ${code})${isBotBan ? ' [YouTube Anti-Bot detected]' : ''}`);
                    if (stderrBuffer) {
                        console.warn(`[CacheManager yt-dlp stderr]:\n${stderrBuffer.trim()}`);
                    }
                    stream.kill();

                    if (!isFallback) {
                        console.log(`[CacheManager] Auto-switching to SoundCloud stream for: ${track.title}`);
                        try {
                            const fallbackStream = await this._trySoundCloudFallback(track, seekSeconds);
                            return resolve(fallbackStream);
                        } catch (fbErr) {
                            return reject(new Error(`Stream failed: ${stderrBuffer || fbErr.message}`));
                        }
                    } else {
                        return reject(new Error(`Stream failed: ${stderrBuffer || 'Exit code ' + code}`));
                    }
                }
            });

            // Allow up to 30s for proxy handshake and audio buffering
            streamTimeout = setTimeout(async () => {
                if (!hasOutput && !isFallback) {
                    console.warn(`[CacheManager] Primary stream timed out (30s limit) for "${track.title}"`);
                    if (stderrBuffer) {
                        console.warn(`[CacheManager yt-dlp stderr]:\n${stderrBuffer.trim()}`);
                    }
                    stream.kill();
                    try {
                        const fallbackStream = await this._trySoundCloudFallback(track, seekSeconds);
                        resolve(fallbackStream);
                    } catch (fbErr) {
                        reject(new Error(`Primary timed out and fallback failed: ${fbErr.message}`));
                    }
                }
            }, 30000);
            streamTimeout.unref();
        });
    }

    async _trySoundCloudFallback(track, seekSeconds = 0) {
        const fallbackQuery = this._getSoundCloudFallback(track);
        if (!fallbackQuery) {
            throw new Error('No valid fallback search query could be generated.');
        }
        return this._spawnPipedStream(track, fallbackQuery, seekSeconds, true);
    }

    /**
     * Download and cache track on-disk if needed (e.g. for loop mode).
     * Protected by Memory & Disk size constraints.
     */
    async prepareTrack(track) {
        const identifier = track.identifier || Buffer.from(track.uri || '').toString('hex').slice(0, 20);
        const targetPath = this.getTrackPath(identifier);

        if (this.isCached(identifier)) {
            return targetPath;
        }

        // Memory Guard: If RSS memory > 180MB, do not spawn background downloads
        const mem = process.memoryUsage();
        if (mem.rss > 180 * 1024 * 1024) {
            if (global.gc) global.gc();
            console.warn('[CacheManager] High memory usage (>180MB). Skipping full disk pre-cache.');
            return targetPath;
        }

        if (this.downloadPromises.has(identifier)) {
            return this.downloadPromises.get(identifier);
        }

        const downloadPromise = (async () => {
            const outTemplate = path.join(this.cacheDir, `${identifier}.%(ext)s`);
            const args = this._buildYtDlpArgs(track.uri, false, outTemplate);

            try {
                await new Promise((resolve, reject) => {
                    execFile(this.binPath, args, { maxBuffer: 2 * 1024 * 1024, timeout: 60000 }, (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                });
            } catch (err) {
                // Try SoundCloud fallback download
                const fallback = this._getSoundCloudFallback(track);
                if (fallback && !track.uri.includes('soundcloud.com')) {
                    const fbArgs = this._buildYtDlpArgs(fallback, false, outTemplate);
                    await new Promise((resolve, reject) => {
                        execFile(this.binPath, fbArgs, { maxBuffer: 2 * 1024 * 1024, timeout: 60000 }, (fbErr) => {
                            if (fbErr) return reject(fbErr);
                            resolve();
                        });
                    });
                } else {
                    throw err;
                }
            } finally {
                this.downloadPromises.delete(identifier);
                if (global.gc) global.gc();
            }

            if (fs.existsSync(targetPath)) {
                return targetPath;
            }
            throw new Error(`Cached file not found at ${targetPath}`);
        })();

        this.downloadPromises.set(identifier, downloadPromise);
        return downloadPromise;
    }

    /**
     * Strict Disk LRU Sweeper:
     * Enforces strict 50MB disk quota to protect the 512MB container from ENOSPC errors.
     */
    cleanOldCache(maxAgeHours = 2) {
        try {
            if (!fs.existsSync(this.cacheDir)) return;
            const now = Date.now();
            const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
            const files = fs.readdirSync(this.cacheDir);

            let totalSizeBytes = 0;
            const fileStats = [];

            for (const file of files) {
                const fullPath = path.join(this.cacheDir, file);
                try {
                    const stats = fs.statSync(fullPath);
                    if (now - stats.mtimeMs > maxAgeMs) {
                        fs.unlinkSync(fullPath);
                    } else {
                        totalSizeBytes += stats.size;
                        fileStats.push({ path: fullPath, size: stats.size, mtime: stats.mtimeMs });
                    }
                } catch {}
            }

            // If total cache exceeds 50MB, delete oldest files until under 30MB
            const maxCacheBytes = 50 * 1024 * 1024;
            const targetBytes = 30 * 1024 * 1024;
            if (totalSizeBytes > maxCacheBytes) {
                fileStats.sort((a, b) => a.mtime - b.mtime);
                for (const item of fileStats) {
                    if (totalSizeBytes <= targetBytes) break;
                    try {
                        fs.unlinkSync(item.path);
                        totalSizeBytes -= item.size;
                    } catch {}
                }
                console.log(`[CacheManager] LRU cache clean reduced cache size to ${(totalSizeBytes / 1024 / 1024).toFixed(1)}MB`);
            }
        } catch (err) {
            console.error('[CacheManager] Cache cleanup error:', err.message);
        }
    }
}

module.exports = new CacheManager();
