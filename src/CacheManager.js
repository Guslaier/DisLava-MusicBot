const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class CacheManager {
    constructor() {
        this.cacheDir = path.resolve(__dirname, '../music_cache');
        this.binPath = path.resolve(__dirname, '../bin/yt-dlp');
        this.ffmpegPath = path.resolve(__dirname, '../node_modules/ffmpeg-static/ffmpeg');
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

    async prepareTrack(track) {
        const identifier = track.identifier || Buffer.from(track.uri || '').toString('hex').slice(0, 20);
        const targetPath = this.getTrackPath(identifier);

        if (this.isCached(identifier)) {
            return targetPath;
        }

        if (this.downloadPromises.has(identifier)) {
            return this.downloadPromises.get(identifier);
        }

        const downloadPromise = new Promise((resolve, reject) => {
            const outTemplate = path.join(this.cacheDir, `${identifier}.%(ext)s`);
            const args = [
                '--ffmpeg-location', this.ffmpegPath,
                '-f', 'bestaudio/best',
                '-x',
                '--audio-format', 'opus',
                '--no-playlist',
                '--force-overwrites',
                '-o', outTemplate,
                track.uri
            ];

            execFile(this.binPath, args, { maxBuffer: 10 * 1024 * 1024, timeout: 300_000 }, (error, stdout, stderr) => {
                this.downloadPromises.delete(identifier);
                if (error) {
                    console.error(`CacheManager download error for ${track.uri}:`, stderr || error.message);
                    return reject(new Error(stderr || error.message));
                }

                if (fs.existsSync(targetPath)) {
                    resolve(targetPath);
                } else {
                    reject(new Error(`Cached file not found at ${targetPath}`));
                }
            });
        });

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
