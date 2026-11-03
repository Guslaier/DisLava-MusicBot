const { execFile, spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const proxyManager = require('./helpers/proxyManager');

class CacheManager {
    constructor() {
        this.cacheDir = path.resolve(__dirname, '../music_cache');
        this.binPath = path.resolve(__dirname, process.platform === 'win32' ? '../bin/yt-dlp.exe' : '../bin/yt-dlp');
        
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
        const activeProxy = proxyManager.getProxyUrl();

        if (activeProxy && !isSoundCloud) {
            args.push('--proxy', activeProxy);
        }

        if (!isSoundCloud) {
            args.push('--extractor-args', 'youtube:player_client=android,ios');
        }

        if (hasCookies && !isSoundCloud) {
            args.push('--cookies', cookiesPath);
        }

        if (isStreamOutput) {
            args.push('-o', '-');
        } else if (outTemplate) {
            args.push('--ffmpeg-location', path.dirname(this.ffmpegPath));
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

    async createTrackStream(track, seekSeconds = 0, volume = 100) {
        const identifier = track.identifier || Buffer.from(track.uri || '').toString('hex').slice(0, 20);
        const targetPath = this.getTrackPath(identifier);

        // 1. If not cached and not a live stream, download cleanly to disk (100% immune to stream socket dropouts)
        if (!this.isCached(identifier) && !track.isStream) {
            try {
                await this.prepareTrack(track);
            } catch (err) {
                console.warn(`[CacheManager] Prepare track fallback notice (${err.message}). Trying direct stream...`);
            }
        }

        // 2. Play from cached file if present
        if (this.isCached(identifier)) {
            const ffmpegArgs = ['-nostdin', '-loglevel', 'error'];
            if (seekSeconds > 0) {
                ffmpegArgs.push('-ss', seekSeconds.toString());
            }
            ffmpegArgs.push('-i', targetPath);
            if (typeof volume === 'number' && volume !== 100) {
                ffmpegArgs.push('-af', `volume=${(volume / 100).toFixed(2)}`, '-c:a', 'libopus', '-b:a', '96k');
            } else {
                ffmpegArgs.push('-c:a', 'copy');
            }
            ffmpegArgs.push('-f', 'opus', 'pipe:1');

            const ffmpegProc = spawn(this.ffmpegPath, ffmpegArgs);
            ffmpegProc.on('error', (err) => console.error('[CacheManager] ffmpeg cached stream error:', err.message));
            ffmpegProc.stdout.kill = () => {
                try { ffmpegProc.kill('SIGKILL'); } catch {}
            };
            return ffmpegProc.stdout;
        }

        // 3. Fallback to direct streaming (e.g. for Live Streams)
        return this._spawnPipedStream(track, track.uri, seekSeconds, volume, false);
    }

    _spawnPipedStream(track, sourceUri, seekSeconds = 0, volume = 100, isFallback = false) {
        return new Promise((resolve, reject) => {
            const ytdlpArgs = this._buildYtDlpArgs(sourceUri, true);
            const ytdlpProc = spawn(this.binPath, ytdlpArgs);

            const ffmpegArgs = ['-nostdin', '-loglevel', 'error'];
            if (seekSeconds > 0) {
                ffmpegArgs.push('-ss', seekSeconds.toString());
            }
            ffmpegArgs.push('-i', 'pipe:0', '-vn');
            if (typeof volume === 'number' && volume !== 100) {
                ffmpegArgs.push('-af', `volume=${(volume / 100).toFixed(2)}`);
            }
            ffmpegArgs.push(
                '-c:a', 'libopus',
                '-b:a', '96k',
                '-vbr', 'on',
                '-ar', '48000',
                '-ac', '2',
                '-f', 'opus',
                'pipe:1'
            );

            const ffmpegProc = spawn(this.ffmpegPath, ffmpegArgs);

            // Prevent unhandled EPIPE errors
            ytdlpProc.stdout.on('error', () => {});
            ffmpegProc.stdin.on('error', () => {});
            ffmpegProc.stdout.on('error', () => {});

            // Pipe yt-dlp stdout into ffmpeg stdin
            ytdlpProc.stdout.pipe(ffmpegProc.stdin);

            let hasOutput = false;
            let stderrBuffer = '';
            let ffmpegStderr = '';
            let streamTimeout = null;

            ytdlpProc.stderr.on('data', (chunk) => {
                stderrBuffer += chunk.toString();
                if (stderrBuffer.length > 3000) stderrBuffer = stderrBuffer.slice(-3000);
            });

            ffmpegProc.stderr.on('data', (chunk) => {
                ffmpegStderr += chunk.toString();
                if (ffmpegStderr.length > 2000) ffmpegStderr = ffmpegStderr.slice(-2000);
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

            // Detect if stream started outputting audio bytes without consuming Ogg headers
            stream.once('data', (chunk) => {
                hasOutput = true;
                track.realSource = isFallback ? 'SoundCloud (Bypass Fallback)' : (track.uri && track.uri.includes('soundcloud.com') ? 'SoundCloud (Direct)' : 'YouTube (Direct)');
                if (streamTimeout) {
                    clearTimeout(streamTimeout);
                    streamTimeout = null;
                }
                stream.pause();
                stream.unshift(chunk);
                resolve(stream);
            });

            // Handle premature failures
            ytdlpProc.on('error', async (err) => {
                console.error(`[CacheManager] yt-dlp error on "${track.title}":`, err.message);
                stream.kill();
                if (!hasOutput && !isFallback) {
                    try {
                        const fallbackStream = await this._trySoundCloudFallback(track, seekSeconds, volume);
                        return resolve(fallbackStream);
                    } catch (fbErr) {
                        return reject(fbErr);
                    }
                }
                reject(err);
            });

            ffmpegProc.on('error', async (err) => {
                console.error(`[CacheManager] ffmpeg error on "${track.title}":`, err.message);
                stream.kill();
                if (!hasOutput && !isFallback) {
                    try {
                        const fallbackStream = await this._trySoundCloudFallback(track, seekSeconds, volume);
                        return resolve(fallbackStream);
                    } catch (fbErr) {
                        return reject(fbErr);
                    }
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
                    if (ffmpegStderr) {
                        console.warn(`[CacheManager ffmpeg stderr]:\n${ffmpegStderr.trim()}`);
                    }
                    stream.kill();

                    if (!isFallback) {
                        console.log(`[CacheManager] Auto-switching to SoundCloud stream for: ${track.title}`);
                        try {
                            const fallbackStream = await this._trySoundCloudFallback(track, seekSeconds, volume);
                            return resolve(fallbackStream);
                        } catch (fbErr) {
                            return reject(new Error(`Stream failed: ${stderrBuffer || fbErr.message}`));
                        }
                    } else {
                        return reject(new Error(`Stream failed: ${stderrBuffer || 'Exit code ' + code}`));
                    }
                }
            });

            ffmpegProc.on('close', async (code) => {
                if (!hasOutput) {
                    if (streamTimeout) {
                        clearTimeout(streamTimeout);
                        streamTimeout = null;
                    }
                    stream.kill();
                    if (!isFallback) {
                        console.log(`[CacheManager] ffmpeg closed before audio output. Falling back to SoundCloud for: ${track.title}`);
                        try {
                            const fallbackStream = await this._trySoundCloudFallback(track, seekSeconds, volume);
                            return resolve(fallbackStream);
                        } catch (fbErr) {
                            return reject(new Error(`Stream failed: ${stderrBuffer || ffmpegStderr || fbErr.message}`));
                        }
                    } else {
                        return reject(new Error(`Stream failed: ${stderrBuffer || ffmpegStderr || 'Exit code ' + code}`));
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
                        const fallbackStream = await this._trySoundCloudFallback(track, seekSeconds, volume);
                        resolve(fallbackStream);
                    } catch (fbErr) {
                        reject(new Error(`Primary timed out and fallback failed: ${fbErr.message}`));
                    }
                }
            }, 30000);
            streamTimeout.unref();
        });
    }

    async _trySoundCloudFallback(track, seekSeconds = 0, volume = 100) {
        const fallbackQuery = this._getSoundCloudFallback(track);
        if (!fallbackQuery) {
            throw new Error('No valid fallback search query could be generated.');
        }
        return this._spawnPipedStream(track, fallbackQuery, seekSeconds, volume, true);
    }

    /**
     * Download and cache track on-disk.
     * Guarantees 100% immune to stream socket timeouts and network stalls.
     */
    async prepareTrack(track, isBackground = false) {
        const identifier = track.identifier || Buffer.from(track.uri || '').toString('hex').slice(0, 20);
        const targetPath = this.getTrackPath(identifier);

        if (this.isCached(identifier)) {
            return targetPath;
        }

        // Memory Guard: Only applies to background pre-cache
        if (isBackground) {
            const mem = process.memoryUsage();
            if (mem.rss > 180 * 1024 * 1024) {
                if (global.gc) global.gc();
                console.warn('[CacheManager] High memory usage (>180MB). Skipping background pre-cache.');
                return targetPath;
            }
        }

        if (this.downloadPromises.has(identifier)) {
            return this.downloadPromises.get(identifier);
        }

        const downloadPromise = (async () => {
            const outTemplate = path.join(this.cacheDir, `${identifier}.%(ext)s`);
            const args = this._buildYtDlpArgs(track.uri, false, outTemplate);

            try {
                await new Promise((resolve, reject) => {
                    execFile(this.binPath, args, { maxBuffer: 8 * 1024 * 1024, timeout: 120000 }, (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                });
                track.realSource = track.uri && track.uri.includes('soundcloud.com') ? 'SoundCloud (Direct)' : 'YouTube (Direct)';
            } catch (err) {
                // Try SoundCloud fallback download
                const fallback = this._getSoundCloudFallback(track);
                if (fallback && !track.uri.includes('soundcloud.com')) {
                    const fbArgs = this._buildYtDlpArgs(fallback, false, outTemplate);
                    await new Promise((resolve, reject) => {
                        execFile(this.binPath, fbArgs, { maxBuffer: 8 * 1024 * 1024, timeout: 120000 }, (fbErr) => {
                            if (fbErr) return reject(fbErr);
                            resolve();
                        });
                    });
                    track.realSource = 'SoundCloud (Bypass Fallback)';
                    console.log(`[CacheManager] 🔀 YouTube blocked. Successfully streamed from SoundCloud (Bypass): "${track.title}"`);
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
