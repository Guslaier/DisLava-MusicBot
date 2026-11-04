const { execFile, spawn, execSync } = require('child_process');
const { PassThrough } = require('stream');
const path = require('path');
const fs = require('fs');
const proxyManager = require('./helpers/proxyManager');
const youtubeCircuit = require('./helpers/youtubeCircuit');

class CacheManager {
    constructor() {
        this.cacheDir = path.resolve(__dirname, '../music_cache');
        this.binPath = path.resolve(__dirname, process.platform === 'win32' ? '../bin/yt-dlp.exe' : '../bin/yt-dlp');
        
        this.ffmpegBundlePath = path.resolve(__dirname, '../bin/ffmpeg-bundle');
        this.ffmpegPath = path.join(this.ffmpegBundlePath, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
        this.scMatchCache = new Map(); // identifier -> scsearch query
        
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
        const bufferSize = process.env.STREAM_BUFFER_SIZE || '512K';
        const chunkSize = process.env.STREAM_CHUNK_SIZE || '512K';
        const socketTimeout = process.env.STREAM_SOCKET_TIMEOUT || '10';

        const args = [
            '--no-cache-dir',
            '--no-playlist',
            '--no-warnings',
            '--no-progress',
            '--retries', '2',
            '--fragment-retries', '3',
            '--retry-sleep', '1',
            '--socket-timeout', socketTimeout,
            '--buffer-size', bufferSize,
            '--http-chunk-size', chunkSize,
            '--js-runtimes', 'node',
            '-f', '251/bestaudio/best'
        ];

        const isSoundCloud = source.includes('soundcloud.com') || source.startsWith('scsearch');
        const cookiesPath = path.resolve(__dirname, '../cookies.txt');
        const hasCookies = fs.existsSync(cookiesPath);
        const useIPv6 = process.env.USE_IPV6 === 'true';

        if (!isSoundCloud) {
            const netArgs = proxyManager.getNetworkArgs();
            if (netArgs.length > 0) {
                args.push(...netArgs);
            } else if (useIPv6) {
                args.push('--force-ipv6');
            }
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
        const identifier = track.identifier || track.uri;
        if (identifier && this.scMatchCache.has(identifier)) {
            return this.scMatchCache.get(identifier);
        }

        const title = track.title || '';
        const author = track.author || '';
        const cleanTitle = title
            .replace(/\[.*?\]|\(.*?\)|【.*?】|MV|Official|Music Video|Audio|Lyrics/gi, '')
            .replace(/[-|/\\#~!?@$%^&*_+<>{}=]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Avoid appending generic channel names or record labels that break search
        const isTopicOrLabel = /topic|gmm|rs|genie|records|music|vevo|i am/i.test(author);
        let query = cleanTitle || title;
        if (author && !isTopicOrLabel && !query.toLowerCase().includes(author.toLowerCase())) {
            query = `${query} ${author}`;
        }
        const res = query ? `scsearch1:${query.trim()}` : null;
        if (identifier && res) {
            if (this.scMatchCache.size > 200) {
                const firstKey = this.scMatchCache.keys().next().value;
                this.scMatchCache.delete(firstKey);
            }
            this.scMatchCache.set(identifier, res);
        }
        return res;
    }

    _streamFromDisk(targetPath, seekSeconds = 0, volume = 100, onSpawn = null) {
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
        if (typeof onSpawn === 'function') {
            onSpawn(ffmpegProc.stdout);
        }
        return ffmpegProc.stdout;
    }

    async createTrackStream(track, seekSeconds = 0, volume = 100, onSpawn = null) {
        const identifier = track.identifier || Buffer.from(track.uri || '').toString('hex').slice(0, 20);
        const targetPath = this.getTrackPath(identifier);

        // 1. Play from cached file if present (<0.1s latency)
        if (this.isCached(identifier)) {
            console.log(`[CacheManager:Stream] Cache HIT for "${track.title}" (Serving from disk)`);
            return this._streamFromDisk(targetPath, seekSeconds, volume, onSpawn);
        }

        const isYouTube = !track.uri?.includes('soundcloud.com');

        // 2. FAST PATH: If YouTube circuit is OPEN, do not waste time attempting YouTube!
        // Immediately pipe from SoundCloud (latency ~2-3s).
        if (isYouTube && youtubeCircuit.isOpen()) {
            console.log(`[CacheManager:Stream] Circuit OPEN -> Fast-tracking "${track.title}" directly via SoundCloud pipe`);
            return this._trySoundCloudFallback(track, seekSeconds, volume, onSpawn);
        }

        const streamMode = (process.env.STREAM_MODE || 'cache').toLowerCase().trim();
        const durationSec = track.duration || (track.length ? Math.round(track.length / 1000) : 0);

        // 1. Live Pipe Mode: stream directly via live pipe (<2.5s start latency)
        if (streamMode === 'pipe') {
            console.log(`[CacheManager:Stream] Live pipe stream for "${track.title}" (Mode: pipe, Duration: ${durationSec}s, Seek: ${seekSeconds}s)`);
            return this._spawnPipedStream(track, track.uri, seekSeconds, volume, false, onSpawn);
        }

        // 2. Auto Mode: Direct live pipe for long tracks (>6 min), seeking, or live streams
        if (streamMode === 'auto' && (track.isStream || durationSec > 360 || seekSeconds > 0)) {
            console.log(`[CacheManager:Stream] Live pipe stream for long/live track "${track.title}" (Mode: auto, Duration: ${durationSec}s)`);
            return this._spawnPipedStream(track, track.uri, seekSeconds, volume, false, onSpawn);
        }

        // 3. Cache Mode (Default, Zero-Stutter): Download full track to NVMe disk before playback
        try {
            console.log(`[CacheManager:Stream] Caching track to disk before playback: "${track.title}" (Mode: ${streamMode})`);
            await this.prepareTrack(track, false, onSpawn);
            if (this.isCached(identifier)) {
                return this._streamFromDisk(targetPath, seekSeconds, volume, onSpawn);
            }
        } catch (err) {
            if (youtubeCircuit.constructor.isBotBlock(err.message)) {
                console.warn(`[CacheManager] Anti-bot block detected: ${err.message}. Fast-switching to SoundCloud...`);
                youtubeCircuit.trip(err.message);
                return this._trySoundCloudFallback(track, seekSeconds, volume, onSpawn);
            }
            console.log(`[CacheManager] Disk caching timed out or failed for "${track.title}". Streaming directly via live pipe...`);
            return this._spawnPipedStream(track, track.uri, seekSeconds, volume, false, onSpawn);
        }

        // 4. Fallback to direct streaming
        return this._spawnPipedStream(track, track.uri, seekSeconds, volume, false, onSpawn);
    }

    _spawnPipedStream(track, sourceUri, seekSeconds = 0, volume = 100, isFallback = false, onSpawn = null) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const ytdlpArgs = this._buildYtDlpArgs(sourceUri, true);
            const ytdlpProc = spawn(this.binPath, ytdlpArgs);

            const threadQueueSize = process.env.THREAD_QUEUE_SIZE || '1024';
            const opusBitrate = process.env.OPUS_BITRATE || '96k';
            const passThroughKb = parseInt(process.env.PASSTHROUGH_BUFFER_KB || '512', 10);
            const preBufferKb = parseInt(process.env.PRE_BUFFER_KB || '32', 10);
            const preBufferTimeoutMs = parseInt(process.env.PRE_BUFFER_TIMEOUT_MS || '200', 10);

            const ffmpegArgs = [
                '-nostdin',
                '-loglevel', 'error',
                '-thread_queue_size', threadQueueSize
            ];
            if (seekSeconds > 0) {
                ffmpegArgs.push('-ss', seekSeconds.toString());
            }
            ffmpegArgs.push('-i', 'pipe:0', '-vn');
            if (typeof volume === 'number' && volume !== 100) {
                ffmpegArgs.push('-af', `volume=${(volume / 100).toFixed(2)}`);
            }
            ffmpegArgs.push(
                '-c:a', 'libopus',
                '-b:a', opusBitrate,
                '-vbr', 'on',
                '-application', 'audio',
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

            // High-capacity PassThrough stream buffer configured via env
            const outputStream = new PassThrough({ highWaterMark: 1024 * passThroughKb });
            ffmpegProc.stdout.pipe(outputStream);

            let hasOutput = false;
            let isHandled = false;
            let stderrBuffer = '';
            let ffmpegStderr = '';
            let streamTimeout = null;
            let releaseTimer = null;

            ytdlpProc.stderr.on('data', (chunk) => {
                stderrBuffer += chunk.toString();
                if (stderrBuffer.length > 3000) stderrBuffer = stderrBuffer.slice(-3000);
            });

            ffmpegProc.stderr.on('data', (chunk) => {
                ffmpegStderr += chunk.toString();
                if (ffmpegStderr.length > 2000) ffmpegStderr = ffmpegStderr.slice(-2000);
            });

            // Combined kill helper for clean termination
            outputStream.kill = () => {
                if (streamTimeout) {
                    clearTimeout(streamTimeout);
                    streamTimeout = null;
                }
                if (releaseTimer) {
                    clearTimeout(releaseTimer);
                    releaseTimer = null;
                }
                try { ytdlpProc.kill('SIGKILL'); } catch {}
                try { ffmpegProc.kill('SIGKILL'); } catch {}
                try { outputStream.destroy(); } catch {}
            };

            if (typeof onSpawn === 'function') {
                onSpawn(outputStream);
            }

            const triggerFallbackOrReject = async (reason, isBotBan = false) => {
                if (isHandled || hasOutput) return;
                isHandled = true;

                const activeProxy = proxyManager.getYouTubeProxy();
                if (activeProxy && !isFallback) {
                    proxyManager.reportFailure(activeProxy, reason);
                } else if (proxyManager.isVpnActive() && !isFallback) {
                    proxyManager.reportVpnFailure(reason);
                }

                if (isBotBan) {
                    youtubeCircuit.trip(reason);
                }

                if (streamTimeout) {
                    clearTimeout(streamTimeout);
                    streamTimeout = null;
                }
                if (releaseTimer) {
                    clearTimeout(releaseTimer);
                    releaseTimer = null;
                }
                outputStream.kill();

                if (!isFallback) {
                    console.log(`[CacheManager] Auto-switching to SoundCloud stream for: ${track.title}${isBotBan ? ' (Anti-Bot detected)' : ''}`);
                    try {
                        const fallbackStream = await this._trySoundCloudFallback(track, seekSeconds, volume, onSpawn);
                        return resolve(fallbackStream);
                    } catch (fbErr) {
                        return reject(new Error(`Stream failed: ${reason || fbErr.message}`));
                    }
                } else {
                    return reject(new Error(`Stream failed: ${reason || 'Playback failed'}`));
                }
            };

            let bufferedBytes = 0;
            const initialChunks = [];

            const releaseStream = () => {
                if (hasOutput || isHandled) return;
                hasOutput = true;
                isHandled = true;
                outputStream.off('data', onData);
                if (releaseTimer) {
                    clearTimeout(releaseTimer);
                    releaseTimer = null;
                }
                if (streamTimeout) {
                    clearTimeout(streamTimeout);
                    streamTimeout = null;
                }
                const activeProxy = proxyManager.getYouTubeProxy();
                if (activeProxy && !isFallback) {
                    proxyManager.reportSuccess(activeProxy, Date.now() - startTime);
                }
                track.realSource = isFallback ? 'SoundCloud (Bypass Fallback)' : (track.uri && track.uri.includes('soundcloud.com') ? 'SoundCloud (Direct)' : 'YouTube (Direct)');
                console.log(`[CacheManager:Stream] First audio buffer dispatched for "${track.title}" in ${Date.now() - startTime}ms (${bufferedBytes} bytes pre-buffered) | Real Source: ${track.realSource}`);
                outputStream.pause();
                for (let i = initialChunks.length - 1; i >= 0; i--) {
                    outputStream.unshift(initialChunks[i]);
                }
                resolve(outputStream);
            };

            const onData = (chunk) => {
                bufferedBytes += chunk.length;
                initialChunks.push(chunk);

                if (!releaseTimer) {
                    releaseTimer = setTimeout(releaseStream, preBufferTimeoutMs);
                    releaseTimer.unref();
                }

                if (bufferedBytes >= preBufferKb * 1024) {
                    releaseStream();
                }
            };

            outputStream.on('data', onData);

            // Handle premature failures
            ytdlpProc.on('error', async (err) => {
                console.error(`[CacheManager] yt-dlp error on "${track.title}":`, err.message);
                await triggerFallbackOrReject(err.message);
            });

            ffmpegProc.on('error', async (err) => {
                console.error(`[CacheManager] ffmpeg error on "${track.title}":`, err.message);
                await triggerFallbackOrReject(err.message);
            });

            ytdlpProc.on('close', async (code) => {
                if (code !== 0 && !hasOutput) {
                    const isBotBan = youtubeCircuit.constructor.isBotBlock(stderrBuffer);

                    console.warn(`[CacheManager] yt-dlp exited (code ${code})${isBotBan ? ' [YouTube Anti-Bot detected]' : ''}`);
                    if (stderrBuffer) {
                        console.warn(`[CacheManager yt-dlp stderr]:\n${stderrBuffer.trim()}`);
                    }
                    await triggerFallbackOrReject(stderrBuffer || `yt-dlp exit code ${code}`, isBotBan);
                }
            });

            ffmpegProc.on('close', async (code) => {
                if (!hasOutput) {
                    if (ffmpegStderr) {
                        console.warn(`[CacheManager ffmpeg stderr]:\n${ffmpegStderr.trim()}`);
                    }
                    await triggerFallbackOrReject(ffmpegStderr || `ffmpeg exit code ${code}`);
                }
            });

            // 12s primary timeout (fast failover instead of 30s)
            streamTimeout = setTimeout(async () => {
                if (!hasOutput && !isFallback) {
                    console.warn(`[CacheManager] Primary stream timed out (12s limit) for "${track.title}"`);
                    await triggerFallbackOrReject('Primary stream timed out');
                }
            }, 12000);
            streamTimeout.unref();
        });
    }

    async _trySoundCloudFallback(track, seekSeconds = 0, volume = 100, onSpawn = null) {
        const fallbackQuery = this._getSoundCloudFallback(track);
        if (!fallbackQuery) {
            throw new Error('No valid fallback search query could be generated.');
        }
        return this._spawnPipedStream(track, fallbackQuery, seekSeconds, volume, true, onSpawn);
    }

    /**
     * Download and cache track on-disk.
     */
    async prepareTrack(track, isBackground = false, onSpawn = null) {
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
            const isYouTube = !track.uri?.includes('soundcloud.com');

            // If circuit is open, download directly from SoundCloud
            if (isYouTube && youtubeCircuit.isOpen()) {
                const fallback = this._getSoundCloudFallback(track);
                if (fallback) {
                    const fbArgs = this._buildYtDlpArgs(fallback, false, outTemplate);
                    await new Promise((resolve, reject) => {
                        const fbChild = execFile(this.binPath, fbArgs, { maxBuffer: 8 * 1024 * 1024, timeout: 35000 }, (fbErr) => {
                            if (fbErr) return reject(fbErr);
                            resolve();
                        });
                        if (typeof onSpawn === 'function') {
                            onSpawn({
                                kill: () => {
                                    try { fbChild.kill('SIGKILL'); } catch {}
                                }
                            });
                        }
                    });
                    track.realSource = 'SoundCloud (Bypass Fallback)';
                    if (fs.existsSync(targetPath)) return targetPath;
                }
            }

            const args = this._buildYtDlpArgs(track.uri, false, outTemplate);
            const activeProxy = isYouTube ? proxyManager.getYouTubeProxy() : null;
            const startTime = Date.now();
            const downloadTimeout = isBackground 
                ? parseInt(process.env.DOWNLOAD_TIMEOUT_BG_MS || '50000', 10) 
                : parseInt(process.env.DOWNLOAD_TIMEOUT_MS || '35000', 10);

            try {
                await new Promise((resolve, reject) => {
                    const child = execFile(this.binPath, args, { maxBuffer: 8 * 1024 * 1024, timeout: downloadTimeout }, (err, stdout, stderr) => {
                        if (err) {
                            const errMsg = (stderr || '') + (err.message || '');
                            return reject(new Error(errMsg));
                        }
                        resolve();
                    });
                    if (typeof onSpawn === 'function') {
                        onSpawn({
                            kill: () => {
                                try { child.kill('SIGKILL'); } catch {}
                            }
                        });
                    }
                });
                if (activeProxy) {
                    proxyManager.reportSuccess(activeProxy, Date.now() - startTime);
                }
                track.realSource = track.uri && track.uri.includes('soundcloud.com') ? 'SoundCloud (Direct)' : 'YouTube (Direct)';
            } catch (err) {
                if (activeProxy) {
                    proxyManager.reportFailure(activeProxy, err.message);
                }
                if (youtubeCircuit.constructor.isBotBlock(err.message)) {
                    youtubeCircuit.trip(err.message);
                }
                // Try SoundCloud fallback download
                const fallback = this._getSoundCloudFallback(track);
                if (fallback && !track.uri.includes('soundcloud.com')) {
                    const fbArgs = this._buildYtDlpArgs(fallback, false, outTemplate);
                    await new Promise((resolve, reject) => {
                        const fbChild = execFile(this.binPath, fbArgs, { maxBuffer: 8 * 1024 * 1024, timeout: 35000 }, (fbErr) => {
                            if (fbErr) return reject(fbErr);
                            resolve();
                        });
                        if (typeof onSpawn === 'function') {
                            onSpawn({
                                kill: () => {
                                    try { fbChild.kill('SIGKILL'); } catch {}
                                }
                            });
                        }
                    });
                    track.realSource = 'SoundCloud (Bypass Fallback)';
                    console.log(`[CacheManager] Track cached via SoundCloud: "${track.title}"`);
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
     * Enforces strict 50MB disk quota to protect container from ENOSPC errors.
     */
    cleanOldCache(maxAgeHours = null) {
        try {
            if (!fs.existsSync(this.cacheDir)) return;
            const now = Date.now();
            const ageHours = maxAgeHours !== null 
                ? maxAgeHours 
                : parseFloat(process.env.CACHE_MAX_AGE_HOURS || '2');
            const maxAgeMs = ageHours * 60 * 60 * 1000;
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

            const maxMb = parseInt(process.env.CACHE_MAX_SIZE_MB || '100', 10);
            const maxCacheBytes = maxMb * 1024 * 1024;
            const targetBytes = Math.round(maxCacheBytes * 0.6);
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
