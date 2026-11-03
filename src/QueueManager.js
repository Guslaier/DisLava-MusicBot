const EventEmitter = require('events');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const Player = require('./Player');
const proxyManager = require('./helpers/proxyManager');
const youtubeCircuit = require('./helpers/youtubeCircuit');

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
        this._searchQueue = [];
        this._activeSearches = 0;
        this._maxConcurrentSearches = 2; // Limit concurrent yt-dlp child processes to preserve RAM

        // Fire-and-forget cache cleanup when a track finishes
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
     * Executes yt-dlp metadata extraction with concurrency limiter.
     * Uses 10s fast timeout and verified proxy only.
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
                    '--no-playlist-reverse',
                    '--socket-timeout', '6'
                ];

                const isSoundCloud = query.includes('soundcloud.com') || query.startsWith('scsearch');
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

                if (!isSoundCloud) {
                    args.push('--extractor-args', 'youtube:player_client=android,ios');
                }

                if (hasCookies && !isSoundCloud) {
                    args.push('--cookies', cookiesPath);
                }

                args.push(query);

                const startTime = Date.now();
                execFile(binPath, args, { maxBuffer: 4 * 1024 * 1024, timeout: 10000, killSignal: 'SIGKILL' }, (err, stdout, stderr) => {
                    this._activeSearches--;
                    this._processNextSearch();

                    const outputErr = (stderr || '') + (err?.message || '');
                    if (youtubeCircuit.constructor.isBotBlock(outputErr)) {
                        youtubeCircuit.trip(outputErr);
                    }

                    if (err || !stdout) {
                        if (activeProxy) {
                            proxyManager.reportFailure(activeProxy, outputErr || err?.message);
                        }
                        return resolve(null);
                    }
                    try {
                        const data = JSON.parse(stdout);
                        if (activeProxy) {
                            proxyManager.reportSuccess(activeProxy, Date.now() - startTime);
                        }
                        resolve(data);
                    } catch {
                        if (activeProxy) {
                            proxyManager.reportFailure(activeProxy, 'JSON parse error');
                        }
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
     * Resolves basic track metadata via YouTube public oEmbed API (~0.3s).
     * Never blocked by datacenter IPs.
     */
    async _fetchYouTubeOEmbed(url) {
        try {
            const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3500);
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
     * Multi-Tier Search Engine with Circuit Breaker and Instant Fallback.
     */
    async search(query, options = {}) {
        const requester = options.requester;
        const cleanQuery = query ? query.trim() : '';

        if (!cleanQuery) {
            return { type: 'SEARCH', tracks: [] };
        }

        const searchStartTime = Date.now();
        console.log(`[Search:Start] Query: "${cleanQuery}" | Engine: ${options.engine || 'auto'}`);

        const isUrl = cleanQuery.startsWith('http://') || cleanQuery.startsWith('https://');

        // --- Case 1: Direct URL provided ---
        if (isUrl) {
            let targetUrl = cleanQuery;
            const ytMatch = cleanQuery.match(/(?:v=|\/embed\/|\/17\/|\/v\/|https:\/\/youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
            const singleVideoUrl = ytMatch ? `https://www.youtube.com/watch?v=${ytMatch[1]}` : null;
            const isPlaylist = cleanQuery.includes('list=') || cleanQuery.includes('/playlist');

            if (!isPlaylist && singleVideoUrl) {
                targetUrl = singleVideoUrl;
            }

            const isYouTubeUrl = cleanQuery.includes('youtube.com') || cleanQuery.includes('youtu.be');

            // FAST-TRACK: If circuit is OPEN and it's a YouTube single video URL, directly use oEmbed (<0.5s)
            if (isYouTubeUrl && !isPlaylist && youtubeCircuit.isOpen()) {
                console.log('[QueueManager] YouTube circuit open. Instant oEmbed metadata bypass...');
                const oembedData = await this._fetchYouTubeOEmbed(targetUrl);
                if (oembedData) {
                    return {
                        type: 'TRACK',
                        tracks: [new Track(oembedData, requester)]
                    };
                }
            }

            let data = await this._fetchYtDlpJson(targetUrl);

            // If playlist extraction failed or returned 0 items, graceful fallback to the single video ID
            if ((!data || (data._type === 'playlist' && (!data.entries || data.entries.length === 0))) && singleVideoUrl) {
                console.log(`[QueueManager] Playlist extraction missed/blocked. Graceful fallback to single video: ${singleVideoUrl}`);
                data = await this._fetchYouTubeOEmbed(singleVideoUrl) || await this._fetchYtDlpJson(singleVideoUrl);
            }

            // Fallback to oEmbed if yt-dlp metadata failed on YouTube URL
            if (!data && isYouTubeUrl) {
                console.log('[QueueManager] yt-dlp blocked on URL. Using YouTube oEmbed anti-ban bypass...');
                data = await this._fetchYouTubeOEmbed(singleVideoUrl || targetUrl);
            }

            if (data) {
                if (data._type === 'playlist' && data.entries && data.entries.length > 0) {
                    const validEntries = data.entries.filter(e => e && (e.id || e.url) && e.title && !e.title.includes('[Private video]') && !e.title.includes('[Deleted video]'));
                    if (validEntries.length > 0) {
                        const tracks = validEntries.slice(0, 25).map(e => new Track(e, requester));
                        return {
                            type: 'PLAYLIST',
                            playlistName: data.title || 'Playlist',
                            tracks
                        };
                    }
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

        // If explicit soundcloud engine requested
        if (options.engine === 'soundcloud') {
            const scData = await this._fetchYtDlpJson(`scsearch5:${searchKeyword}`);
            if (scData && scData.entries && scData.entries.length > 0) {
                return {
                    type: 'SEARCH',
                    tracks: scData.entries.map(e => new Track(e, requester))
                };
            }
        }

        let data = null;

        // If YouTube Circuit is OPEN, fast-track directly to SoundCloud search (<2s)
        if (youtubeCircuit.isOpen()) {
            console.log(`[QueueManager] Circuit OPEN -> Fast-tracking search directly to SoundCloud for: "${searchKeyword}"`);
            data = await this._fetchYtDlpJson(`scsearch5:${searchKeyword}`);
        } else {
            // Primary: YouTube Search (fast flat metadata search ~1.5s)
            data = await this._fetchYtDlpJson(`ytsearch5:${cleanQuery}`);

            // If YouTube search failed or returned 0 entries, search SoundCloud
            if (!data || !data.entries || data.entries.length === 0) {
                console.log(`[QueueManager] YouTube search missed or blocked. Falling back to SoundCloud for: "${searchKeyword}"`);
                data = await this._fetchYtDlpJson(`scsearch5:${searchKeyword}`);
            }
        }

        // If still 0 entries, retry SoundCloud with sanitized query
        if ((!data || !data.entries || data.entries.length === 0) && sanitized && sanitized !== cleanQuery) {
            console.log(`[QueueManager] Secondary search attempt with sanitized keyword: "${sanitized}"`);
            data = await this._fetchYtDlpJson(`scsearch5:${sanitized}`);
        }

        if (data && data.entries && data.entries.length > 0) {
            console.log(`[Search:Done] Query: "${cleanQuery}" | Found ${data.entries.length} tracks in ${Date.now() - searchStartTime}ms`);
            return {
                type: 'SEARCH',
                tracks: data.entries.map(e => new Track(e, requester))
            };
        }

        console.log(`[Search:Miss] Query: "${cleanQuery}" | 0 tracks found in ${Date.now() - searchStartTime}ms`);
        return { type: 'SEARCH', tracks: [] };
    }

    /**
     * Delete cache file of a finished track asynchronously (fire-and-forget).
     */
    _deleteTrackCacheAsync(player, track) {
        if (!track) return;
        if (player && player.loop === 'track') return;

        const identifier = track.identifier || Buffer.from(track.uri || '').toString('hex').slice(0, 20);
        if (!identifier) return;

        const cachePath = path.resolve(cacheDir, `${identifier}.opus`);
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
