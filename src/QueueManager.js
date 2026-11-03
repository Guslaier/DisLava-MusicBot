const EventEmitter = require('events');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const Player = require('./Player');
const proxyManager = require('./helpers/proxyManager');

const binPath = path.resolve(__dirname, process.platform === 'win32' ? '../bin/yt-dlp.exe' : '../bin/yt-dlp');
const cacheDir = path.resolve(__dirname, '../music_cache');

class Track {
    constructor(data, requester) {
        this.title = data.title || 'Unknown Title';
        this.author = data.uploader || data.channel || data.author || data.artist || 'Unknown Artist';
        this.uri = data.url || (data.id ? `https://www.youtube.com/watch?v=${data.id}` : data.uri);
        this.identifier = data.id || data.identifier || '';
        this.length = (data.duration ? data.duration * 1000 : (data.length || 0));
        this.thumbnail = data.thumbnails && data.thumbnails.length ? data.thumbnails[data.thumbnails.length - 1].url : (data.thumbnail || null);
        this.isStream = data.is_live || false;
        this.requester = requester;
    }
}

class QueueManager extends EventEmitter {
    constructor(client) {
        super();
        this.client = client;
        this.players = new Map();
        this.isYouTubeBlocked = false;
        this.lastYouTubeCheckTime = 0;
        this._searchQueue = [];
        this._activeSearches = 0;
        this._maxConcurrentSearches = 2; // Limit concurrent yt-dlp child processes to preserve 256MB RAM

        // Fire-and-forget cache cleanup when a track finishes (non-blocking)
        this.on('playerEnd', (player, track) => this._deleteTrackCacheAsync(player, track));
    }

    createPlayer(options) {
        return this.create(options);
    }

    create(options) {
        let player = this.players.get(options.guildId);
        if (player) {
            if (options.textId) player.textId = options.textId;
            if (options.voiceId && player.voiceId !== options.voiceId) {
                player.voiceId = options.voiceId;
                player._setupVoiceConnection(options);
            }
            return player;
        }

        player = new Player(this, options);
        this.players.set(options.guildId, player);
        return player;
    }

    getPlayer(guildId) {
        return this.players.get(guildId) || null;
    }

    /**
     * Executes yt-dlp metadata extraction with concurrency limiter and anti-bot arguments.
     * Omits heavy JS runtimes to save ~50MB RAM per call.
     */
    _fetchYtDlpJson(query) {
        return new Promise((resolve) => {
            const execute = () => {
                this._activeSearches++;
                const args = [
                    '-J',
                    '--flat-playlist',
                    '--playlist-items', '1:25',
                    '--no-warnings',
                    '--no-playlist-reverse'
                ];

                const isSoundCloud = query.includes('soundcloud.com') || query.startsWith('scsearch');
                const cookiesPath = path.resolve(__dirname, '../cookies.txt');
                const hasCookies = fs.existsSync(cookiesPath);
                const activeProxy = proxyManager.getProxyUrl();
                const useIPv6 = process.env.USE_IPV6 === 'true';

                if (useIPv6 && !isSoundCloud) {
                    args.push('--force-ipv6');
                }

                if (activeProxy && !isSoundCloud) {
                    args.push('--proxy', activeProxy);
                }

                if (!isSoundCloud) {
                    args.push('--extractor-args', 'youtube:player_client=android,ios');
                }

                if (hasCookies && !isSoundCloud) {
                    args.push('--cookies', cookiesPath);
                }

                args.push(query);

                execFile(binPath, args, { maxBuffer: 4 * 1024 * 1024, timeout: 25000, killSignal: 'SIGKILL' }, (err, stdout, stderr) => {
                    this._activeSearches--;
                    this._processNextSearch();

                    const outputErr = (stderr || '') + (err?.message || '');
                    if (outputErr.includes('Sign in to confirm') || outputErr.includes('bot') || outputErr.includes('429')) {
                        this.isYouTubeBlocked = true;
                        this.lastYouTubeCheckTime = Date.now();
                        console.warn('[QueueManager] YouTube Anti-Bot IP block detected. Switching to fallback search mode.');
                    }

                    if (err || !stdout) return resolve(null);
                    try {
                        const data = JSON.parse(stdout);
                        resolve(data);
                    } catch {
                        resolve(null);
                    }
                });
            };

            if (this._activeSearches < this._maxConcurrentSearches) {
                execute();
            } else {
                this._searchQueue.push(execute);
            }
        });
    }

    _processNextSearch() {
        if (this._searchQueue.length > 0 && this._activeSearches < this._maxConcurrentSearches) {
            const next = this._searchQueue.shift();
            next();
        }
    }

    /**
     * Resolves basic track metadata via YouTube's public oEmbed API.
     * This endpoint NEVER blocks datacenter IPs and does not require cookies/login.
     */
    async _fetchYouTubeOEmbed(url) {
        try {
            const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);
            const res = await fetch(oembedUrl, { signal: controller.signal });
            clearTimeout(timeout);

            if (res.ok) {
                const data = await res.json();
                let videoId = '';
                const match = url.match(/(?:v=|\/embed\/|\/17\/|\/v\/|https:\/\/youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
                if (match) videoId = match[1];

                return {
                    title: data.title,
                    author: data.author_name,
                    id: videoId,
                    url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : url,
                    thumbnails: [{ url: data.thumbnail_url }]
                };
            }
        } catch {}
        return null;
    }

    /**
     * Smart Multi-Tier Search Engine:
     * Fast, resilient to YouTube IP bans, with automatic fallback to SoundCloud.
     */
    async search(query, options = {}) {
        const requester = options.requester;
        const cleanQuery = query ? query.trim() : '';

        if (!cleanQuery) {
            return { type: 'SEARCH', tracks: [] };
        }

        // Reset YouTube block status after 10 minutes to re-test if unblocked
        if (this.isYouTubeBlocked && Date.now() - this.lastYouTubeCheckTime > 10 * 60 * 1000) {
            this.isYouTubeBlocked = false;
        }

        const isUrl = cleanQuery.startsWith('http://') || cleanQuery.startsWith('https://');

        // --- Case 1: Direct URL provided ---
        if (isUrl) {
            let targetUrl = cleanQuery;
            const isPlaylist = cleanQuery.includes('list=') || cleanQuery.includes('/playlist');
            if (!isPlaylist) {
                const ytMatch = cleanQuery.match(/(?:v=|\/embed\/|\/17\/|\/v\/|https:\/\/youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
                if (ytMatch) {
                    targetUrl = `https://www.youtube.com/watch?v=${ytMatch[1]}`;
                }
            }

            let data = await this._fetchYtDlpJson(targetUrl);

            // If yt-dlp metadata failed on YouTube URL (e.g. server IP blocked), use oEmbed bypass
            if (!data && (cleanQuery.includes('youtube.com') || cleanQuery.includes('youtu.be'))) {
                console.log('[QueueManager] yt-dlp blocked on URL. Using YouTube oEmbed anti-ban bypass...');
                data = await this._fetchYouTubeOEmbed(targetUrl);
            }

            if (data) {
                if (data._type === 'playlist' && data.entries && data.entries.length > 0) {
                    const validEntries = data.entries.filter(e => e && (e.id || e.url) && e.title && !e.title.includes('[Private video]') && !e.title.includes('[Deleted video]'));
                    const tracks = validEntries.slice(0, 25).map(e => new Track(e, requester));
                    return {
                        type: 'PLAYLIST',
                        playlistName: data.title || 'Playlist',
                        tracks
                    };
                }
                return {
                    type: 'TRACK',
                    tracks: [new Track(data, requester)]
                };
            }

            return { type: 'SEARCH', tracks: [] };
        }

        // --- Case 2: Keyword Search ---
        const sanitized = cleanQuery
            .replace(/\[.*?\]|\(.*?\)|【.*?】|MV|Official|Music Video|Audio|Lyrics/gi, '')
            .replace(/[|/\\#~!?@$%^&*_+<>{}=]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const searchKeyword = sanitized || cleanQuery;

        // If YouTube is known to be IP-blocked, jump directly to SoundCloud for sub-second search
        if (this.isYouTubeBlocked || options.engine === 'soundcloud') {
            console.log(`[QueueManager] Fast SoundCloud search for: "${searchKeyword}"`);
            const scData = await this._fetchYtDlpJson(`scsearch5:${searchKeyword}`);
            if (scData && scData.entries && scData.entries.length > 0) {
                return {
                    type: 'SEARCH',
                    tracks: scData.entries.map(e => new Track(e, requester))
                };
            }
        }

        // Primary: YouTube Search
        let data = await this._fetchYtDlpJson(`ytsearch5:${cleanQuery}`);

        // If YouTube search failed or blocked, immediately fallback to SoundCloud search
        if (!data || !data.entries || data.entries.length === 0) {
            console.log(`[QueueManager] YouTube search missed or blocked. Falling back to SoundCloud for: "${searchKeyword}"`);
            data = await this._fetchYtDlpJson(`scsearch5:${searchKeyword}`);
        }

        if (data && data.entries && data.entries.length > 0) {
            return {
                type: 'SEARCH',
                tracks: data.entries.map(e => new Track(e, requester))
            };
        }

        return { type: 'SEARCH', tracks: [] };
    }

    /**
     * Delete the cache file of a finished track asynchronously (fire-and-forget).
     * Callback-based fs.unlink so it never blocks the queue advance.
     */
    _deleteTrackCacheAsync(player, track) {
        if (!track) return;
        // Keep the cache when looping the same track: the replay needs it
        if (player && player.loop === 'track') return;

        const identifier = track.identifier || Buffer.from(track.uri || '').toString('hex').slice(0, 20);
        if (!identifier) return;

        const cachePath = path.resolve(cacheDir, `${identifier}.opus`);
        // Path safety: only delete files inside the cache directory
        if (!cachePath.startsWith(cacheDir + path.sep)) return;

        setTimeout(() => {
            fs.unlink(cachePath, (err) => {
                if (err && err.code !== 'ENOENT' && err.code !== 'EBUSY') {
                    console.error(`[QueueManager] Cache delete failed ${cachePath}:`, err.message);
                }
            });
        }, 1500).unref();
    }
}

module.exports = QueueManager;
