const EventEmitter = require('events');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const Player = require('./Player');

const binPath = path.resolve(__dirname, '../bin/yt-dlp');
const cacheDir = path.resolve(__dirname, '../music_cache');

function fetchYtDlpJson(query) {
    return new Promise((resolve) => {
        execFile(binPath, ['-J', '--flat-playlist', '--playlist-items', '1:25', query], { maxBuffer: 10 * 1024 * 1024, timeout: 30000, killSignal: 'SIGKILL' }, (err, stdout) => {
            if (err || !stdout) return resolve(null);
            try {
                const data = JSON.parse(stdout);
                resolve(data);
            } catch {
                resolve(null);
            }
        });
    });
}

class Track {
    constructor(data, requester) {
        this.title = data.title || 'Unknown Title';
        this.author = data.uploader || data.channel || data.author || 'Unknown Artist';
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

    async search(query, options = {}) {
        const requester = options.requester;
        const cleanQuery = query ? query.trim() : '';

        if (!cleanQuery) {
            return { type: 'SEARCH', tracks: [] };
        }

        try {
            if (cleanQuery.startsWith('http')) {
                const data = await fetchYtDlpJson(cleanQuery);
                if (data) {
                    if (data._type === 'playlist' && data.entries && data.entries.length > 0) {
                        const tracks = data.entries.slice(0, 25).map(e => new Track(e, requester));
                        return {
                            type: 'PLAYLIST',
                            playlistName: data.title || 'YouTube Playlist',
                            tracks
                        };
                    }
                    return {
                        type: 'TRACK',
                        tracks: [new Track(data, requester)]
                    };
                }
            } else {
                const data = await fetchYtDlpJson(`ytsearch5:${cleanQuery}`);
                if (data && data.entries && data.entries.length > 0) {
                    const tracks = data.entries.map(e => new Track(e, requester));
                    return {
                        type: 'SEARCH',
                        tracks
                    };
                }
            }
        } catch (error) {
            console.error('QueueManager search error:', error.message);
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

        fs.unlink(cachePath, (err) => {
            if (err && err.code !== 'ENOENT') {
                console.error(`[QueueManager] Cache delete failed ${cachePath}:`, err.message);
            }
        });
    }
}

module.exports = QueueManager;
