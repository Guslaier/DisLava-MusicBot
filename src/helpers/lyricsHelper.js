const { execFile } = require('child_process');
const path = require('path');
const proxyManager = require('./proxyManager');

class LyricsHelper {
    constructor() {
        this.cache = new Map();
        this.binPath = path.resolve(__dirname, process.platform === 'win32' ? '../../bin/yt-dlp.exe' : '../../bin/yt-dlp');
    }

    cleanTitle(rawTitle) {
        if (!rawTitle) return '';
        return rawTitle
            .replace(/\[.*?\]|\(.*?\)|【.*?】/g, ' ')
            .replace(/\b(official\s*(?:mv|music\s*video|video|audio|lyrics|visualizer)?)\b/gi, ' ')
            .replace(/\b(mv|hd|hq|audio|lyrics|lyric\s*video|remastered)\b/gi, ' ')
            .replace(/[-|/\\#~!?@$%^&*_+<>{}=]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    cleanLyrics(text) {
        if (!text) return '';
        return text
            .replace(/\[\d+:\d+(?:\.\d+)?\]\s*/g, '') // Strip LRC timestamps
            .trim();
    }

    async getLyrics(track) {
        if (!track) return null;
        const identifier = track.identifier || Buffer.from(track.uri || '').toString('hex').slice(0, 20);

        // 1. In-memory Cache check
        if (this.cache.has(identifier)) {
            return this.cache.get(identifier);
        }

        const rawTitle = track.title || '';
        const author = (track.author && track.author !== 'Unknown') ? track.author : '';
        const cleanTitle = this.cleanTitle(rawTitle);

        // Tier 1: Try LRCLIB API (Best for international, pop, K-pop, and major Thai hits)
        const lrcResult = await this._fetchFromLrclib(cleanTitle, author);
        if (lrcResult) {
            const res = {
                title: cleanTitle || rawTitle,
                artist: author,
                lyrics: this.cleanLyrics(lrcResult),
                source: 'LRCLIB Database'
            };
            this._saveCache(identifier, res);
            return res;
        }

        // Tier 2: Try YouTube Video Description (Best for Thai Hip-Hop, Indie & Official MVs)
        if (track.uri && (track.uri.includes('youtube.com') || track.uri.includes('youtu.be'))) {
            const ytResult = await this._fetchFromYouTube(track.uri);
            if (ytResult) {
                const res = {
                    title: cleanTitle || rawTitle,
                    artist: author,
                    lyrics: ytResult,
                    source: 'YouTube Official Description'
                };
                this._saveCache(identifier, res);
                return res;
            }
        }

        return null;
    }

    async _fetchFromLrclib(title, author) {
        const queryCandidates = [];
        if (title && author && !title.toLowerCase().includes(author.toLowerCase())) {
            queryCandidates.push(`${title} ${author}`);
        }
        if (title) {
            queryCandidates.push(title);
        }

        for (const q of queryCandidates) {
            try {
                const url = `https://lrclib.net/api/search?q=${encodeURIComponent(q.trim())}`;
                const res = await fetch(url, { 
                    headers: { 'User-Agent': 'DisLava-MusicBot/1.0 (Discord Audio Engine)' },
                    signal: AbortSignal.timeout(4000)
                });
                if (!res.ok) continue;
                const list = await res.json();
                if (Array.isArray(list) && list.length > 0) {
                    const hit = list.find(x => x.plainLyrics || x.syncedLyrics);
                    if (hit) {
                        return hit.plainLyrics || hit.syncedLyrics;
                    }
                }
            } catch {}
        }
        return null;
    }

    async _fetchFromYouTube(uri) {
        return new Promise((resolve) => {
            const args = [
                '--js-runtimes', 'node',
                '--dump-json',
                '--no-playlist',
                '--no-warnings',
                '--socket-timeout', '6'
            ];

            const networkArgs = proxyManager.getNetworkArgs();
            if (networkArgs.length > 0) {
                args.push(...networkArgs);
            }

            args.push(uri);

            execFile(this.binPath, args, { maxBuffer: 4 * 1024 * 1024, timeout: 12000 }, (err, stdout) => {
                if (err || !stdout) return resolve(null);
                try {
                    const j = JSON.parse(stdout);
                    const desc = j.description || '';
                    const lyrics = this._extractLyricsFromDescription(desc);
                    resolve(lyrics);
                } catch {
                    resolve(null);
                }
            });
        });
    }

    _extractLyricsFromDescription(desc) {
        if (!desc) return null;
        const patterns = [
            /(?:[*_~#]*\s*เนื้อเพลง\s*[:*~_#]*|[\r\n]\s*Lyrics\s*[:\r\n])([\s\S]+)/i,
            /(?:[*_~#]*\s*(?:Music\s*Lyrics|Song\s*Lyrics)\s*[*_~#]*)([\s\S]+)/i
        ];

        for (const p of patterns) {
            const m = desc.match(p);
            if (m && m[1] && m[1].trim().length > 40) {
                let l = m[1].trim();
                // Strip common promo/social/copyright footers
                l = l.replace(/(?:ติดตามผลงาน|ติดต่องาน|Contact\s*:|Download\s*on|Available\s*on|Streaming\s*:|Follow\s*:|Spotify\s*:|Apple\s*Music\s*:|JOOX\s*:)[\s\S]*/i, '');
                if (l.trim().length > 30) {
                    return l.trim();
                }
            }
        }
        return null;
    }

    _saveCache(identifier, data) {
        if (this.cache.size > 200) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(identifier, data);
    }
}

module.exports = new LyricsHelper();
