const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class CacheManager {
    constructor() {
        this.cacheDir = path.resolve(__dirname, '../music_cache');
        this.binPath = path.resolve(__dirname, '../bin/yt-dlp');
        
        this.ffmpegBundlePath = path.resolve(__dirname, '../bin/ffmpeg-bundle');
        this.ffmpegPath = path.join(this.ffmpegBundlePath, 'ffmpeg');
        
        try {
            if (!fs.existsSync(this.ffmpegBundlePath)) {
                fs.mkdirSync(this.ffmpegBundlePath, { recursive: true });
            }
            
            const bundledFfprobe = path.join(this.ffmpegBundlePath, 'ffprobe');
            if (!fs.existsSync(this.ffmpegPath)) {
                console.log('[CacheManager] Downloading ffmpeg binary...');
                require('child_process').execSync(`curl -L "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64" -o "${this.ffmpegPath}"`);
                fs.chmodSync(this.ffmpegPath, 0o755);
            }
            if (!fs.existsSync(bundledFfprobe)) {
                console.log('[CacheManager] Downloading ffprobe binary...');
                require('child_process').execSync(`curl -L "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffprobe-linux-x64" -o "${bundledFfprobe}"`);
                fs.chmodSync(bundledFfprobe, 0o755);
            }
        } catch (err) {
            console.error('[CacheManager] Failed to setup ffmpeg/ffprobe:', err.message);
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

    _buildArgs(source, outTemplate) {
        const args = [
            '--ffmpeg-location', this.ffmpegBundlePath,
            '--js-runtimes', `node:${process.execPath}`,
            '-f', '251/bestaudio/best',
            '-x',
            '--audio-format', 'opus',
            '--concurrent-fragments', '1',
            '--buffer-size', '16K',
            '--retries', '10',
            '--fragment-retries', '10',
            '--retry-sleep', '2',
            '--no-cache-dir',
            '--no-playlist',
            '--force-overwrites',
            '--no-warnings'
        ];

        if (process.env.PROXY_URL) {
            args.push('--proxy', process.env.PROXY_URL);
        }

        const cookiesPath = path.resolve(__dirname, '../cookies.txt');
        if (fs.existsSync(cookiesPath)) {
            args.push('--cookies', cookiesPath);
        }

        args.push('-o', outTemplate, source);
        return args;
    }

    _execDownload(source, outTemplate, printJson = false) {
        return new Promise((resolve, reject) => {
            const args = this._buildArgs(source, outTemplate);
            if (printJson) args.push('--dump-json');
            execFile(this.binPath, args, { maxBuffer: 2 * 1024 * 1024, timeout: 300_000 }, (error, stdout, stderr) => {
                if (error) {
                    return reject(new Error(stderr || error.message));
                }
                resolve(stdout);
            });
        });
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

    async prepareTrack(track) {
        const identifier = track.identifier || Buffer.from(track.uri || '').toString('hex').slice(0, 20);
        const targetPath = this.getTrackPath(identifier);

        if (this.isCached(identifier)) {
            return targetPath;
        }

        if (this.downloadPromises.has(identifier)) {
            return this.downloadPromises.get(identifier);
        }

        const downloadPromise = (async () => {
            const outTemplate = path.join(this.cacheDir, `${identifier}.%(ext)s`);

            try {
                await this._execDownload(track.uri, outTemplate);
            } catch (err) {
                console.warn(`[CacheManager] Primary download failed for "${track.title || track.uri}": ${err.message.split('\n')[0]}`);
                const fallback = this._getSoundCloudFallback(track);
                if (fallback && !track.uri.includes('soundcloud.com')) {
                    console.log(`[CacheManager] Attempting SoundCloud fallback: ${fallback}`);
                    try {
                        const stdout = await this._execDownload(fallback, outTemplate, true);
                        try {
                            const data = JSON.parse(stdout);
                            track.title = data.title || track.title;
                            track.author = data.uploader || data.uploader_id || data.channel || track.author;
                            track.uri = data.webpage_url || data.url || track.uri;
                            if (data.thumbnails && data.thumbnails.length) {
                                track.thumbnail = data.thumbnails[data.thumbnails.length - 1].url;
                            } else if (data.thumbnail) {
                                track.thumbnail = data.thumbnail;
                            }
                            console.log(`[CacheManager] Fallback mapped to real song: ${track.title}`);
                        } catch (parseErr) {
                            console.warn('[CacheManager] Could not parse fallback JSON metadata');
                        }
                    } catch (fbErr) {
                        console.error(`[CacheManager] SoundCloud fallback also failed: ${fbErr.message.split('\n')[0]}`);
                        throw new Error(`Download failed (primary: ${err.message}, fallback: ${fbErr.message})`);
                    }
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
 * Create a streaming audio source for a track.
 * If the track is cached, stream from the cached file via ffmpeg.
 * Otherwise, download and convert the track to a file first
 * (file-first), then stream from that file via ffmpeg. This avoids
 * the slow pipe path (yt-dlp stdout -> ffmpeg stdin) that delays
 * the first bytes on a cache miss.
 * The returned stream has a kill() helper to terminate spawned processes.
 */
async createTrackStream(track) {
    const identifier = track.identifier || Buffer.from(track.uri || '').toString('hex').slice(0, 20);
    const targetPath = this.getTrackPath(identifier);

    if (this.isCached(identifier)) {
        const ffmpegProc = spawn(this.ffmpegPath, [
            '-nostdin',
            '-loglevel', 'quiet',
            '-i', targetPath,
            '-f', 'opus',
            '-c:a', 'copy',
            'pipe:1'
        ]);
        ffmpegProc.on('error', (err) => console.error('[CacheManager] ffmpeg error:', err.message));
        ffmpegProc.stdout.kill = () => {
            try { ffmpegProc.kill(); } catch {}
        };
        return ffmpegProc.stdout;
    }

    return this.prepareTrack(track).then((filePath) => {
        const ffmpegProc = spawn(this.ffmpegPath, [
            '-nostdin',
            '-loglevel', 'quiet',
            '-i', filePath,
            '-f', 'opus',
            '-c:a', 'copy',
            'pipe:1'
        ]);
        ffmpegProc.on('error', (err) => console.error('[CacheManager] ffmpeg error:', err.message));
        ffmpegProc.stdout.kill = () => {
            try { ffmpegProc.kill(); } catch {}
        };
        return ffmpegProc.stdout;
    });
}

cleanOldCache(maxAgeHours = 24) {
        try {
            const now = Date.now();
            const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
            const files = fs.readdirSync(this.cacheDir);
            for (const file of files) {
                const fullPath = path.join(this.cacheDir, file);
                const stats = fs.statSync(fullPath);
                if (now - stats.mtimeMs > maxAgeMs) {
                    fs.unlinkSync(fullPath);
                }
            }
        } catch (err) {
            console.error('Cache cleanup error:', err.message);
        }
    }
}

module.exports = new CacheManager();
