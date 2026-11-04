const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus, 
    NoSubscriberBehavior,
    entersState, 
    StreamType 
} = require('@discordjs/voice');
const prism = require('prism-media');
const CacheManager = require('./CacheManager');
const settingsManager = require('./helpers/settingsManager');

class PlayerQueue extends Array {
    static get [Symbol.species]() {
        return Array;
    }

    constructor(player) {
        super();
        this.player = player;
        this.current = null;
        this.previous = null;
    }

    add(track) {
        if (Array.isArray(track)) {
            this.push(...track);
        } else {
            this.push(track);
        }
        this._triggerPreCache();
    }

    unshift(...items) {
        const result = super.unshift(...items);
        this._triggerPreCache();
        return result;
    }

    shift() {
        const result = super.shift();
        this._triggerPreCache();
        return result;
    }

    _triggerPreCache() {
        if (this.player && this.player._preCacheNextTrack) {
            this.player._preCacheNextTrack();
        }
    }

    clear() {
        this.length = 0;
    }

    shuffle() {
        for (let i = this.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this[i], this[j]] = [this[j], this[i]];
        }
    }

    remove(index) {
        if (index >= 0 && index < this.length) {
            return this.splice(index, 1)[0];
        }
        return null;
    }

    get totalSize() {
        return this.length + (this.current ? 1 : 0);
    }
}

class Player {
    constructor(manager, options) {
        this.manager = manager;
        this.guildId = options.guildId;
        this.voiceId = options.voiceId;
        this.textId = options.textId;
        this.volume = typeof options.volume === 'number' ? options.volume : settingsManager.getGuildVolume(this.guildId);
        this.loop = 'none'; // 'none' | 'track' | 'queue'
        this.autoplay = false;
        this.paused = false;
        this.playing = false;
        this.nowPlayingMessage = null;
        this._position = 0;
        this.playbackStartTime = 0;

        this.queue = new PlayerQueue(this);
        const maxMissedFrames = parseInt(process.env.MAX_MISSED_FRAMES || '350', 10);
        this.audioPlayer = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Play,
                maxMissedFrames: maxMissedFrames
            }
        });
        this.connection = null;
        this.currentResource = null;
        this.currentProcess = null;
        this._playToken = 0;
        this._advancing = false;
        this._starting = false; // in-flight guard
        this._isSkipping = false;

        this._setupVoiceConnection(options);
        this._setupAudioPlayer();
    }

    _setupVoiceConnection(options) {
        const guild = this.manager.client.guilds.cache.get(this.guildId);
        if (!guild) return;

        this.connection = joinVoiceChannel({
            channelId: this.voiceId,
            guildId: this.guildId,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: options.deaf !== false
        });

        this.connection.subscribe(this.audioPlayer);

        this.connection.on('error', error => console.error(`[VoiceConnection ERROR] guild ${this.guildId}:`, error.message));

        entersState(this.connection, VoiceConnectionStatus.Ready, 20_000)
            .then(() => console.log(`[Player] Voice connection ready for guild ${this.guildId}`))
            .catch(err => console.error(`[Player] Voice connection error:`, err.message));

        this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch {
                this.destroy();
            }
        });
    }

    _setupAudioPlayer() {
        this.audioPlayer.on('stateChange', (oldState, newState) => {
            if (newState.status === AudioPlayerStatus.Playing) {
                this.playing = true;
                this.paused = false;
                this.playbackStartTime = Date.now();
                console.log(`[Player] Audio playback started for: "${this.queue.current?.title}"`);
            } else if (newState.status === AudioPlayerStatus.Idle) {
                this.playing = false;
            }
        });

        this.audioPlayer.on(AudioPlayerStatus.Idle, async () => {
            if (this._starting) return;
            if (this._advancing) return;
            await this._advanceQueue();
        });

        this.audioPlayer.on('error', (error) => {
            console.error(`AudioPlayer error in guild ${this.guildId}:`, error.message);
            this.manager.emit('playerException', this, this.queue.current, error);
            this.skip();
        });
    }

    async _advanceQueue() {
        if (this._advancing) return;
        this._advancing = true;
        try {
            if (this.currentProcess) {
                try { this.currentProcess.kill(); } catch {}
                this.currentProcess = null;
            }

            const isSkip = this._isSkipping;
            this._isSkipping = false;

            const finishedTrack = this.queue.current;
            this.playing = false;
            this._position = 0;

            if (finishedTrack) {
                this.queue.previous = finishedTrack;
                this.manager.emit('playerEnd', this, finishedTrack);

                if (this.loop === 'track' && !isSkip) {
                    await this.playTrack(finishedTrack);
                    return;
                } else if (this.loop === 'queue' && !isSkip) {
                    this.queue.add(finishedTrack);
                }
            }

            if (this.queue.length > 0) {
                const nextTrack = this.queue.shift();
                await this.playTrack(nextTrack);
            } else if (this.autoplay && finishedTrack && !isSkip) {
                const played = await this._handleAutoplay(finishedTrack);
                if (!played) {
                    this.queue.current = null;
                    this.manager.emit('playerEmpty', this);
                }
            } else {
                this.queue.current = null;
                this.manager.emit('playerEmpty', this);
            }
        } catch (error) {
            console.error('[Player] Advance error:', error);
            this.manager.emit('playerException', this, this.queue.current, error);
        } finally {
            this._advancing = false;
        }
    }

    get position() {
        if (!this.playing || this.paused) return this._position || 0;
        return (this._position || 0) + (Date.now() - this.playbackStartTime);
    }

    set position(val) {
        this._position = val;
    }

    async play() {
        if (this.playing || this._starting || this._advancing) return;
        await this._advanceQueue();
    }

    _createBufferedResource(stream) {
        // High-capacity Opus demuxer buffer: buffers up to 250 Opus frames (~5-7s) in RAM (~180 KB)
        // Prevents audio stutter caused by the default tiny 16-frame buffer in @discordjs/voice
        const demuxer = new prism.opus.OggDemuxer({ readableHighWaterMark: 250 });
        stream.on('error', (err) => {
            try { demuxer.destroy(err); } catch {}
        });
        demuxer.on('error', (err) => {
            console.error('[AudioDemuxer] Demuxer stream error:', err.message);
        });

        const demuxed = stream.pipe(demuxer);
        demuxed.kill = () => {
            try {
                if (stream.kill) stream.kill();
                else if (stream.destroy) stream.destroy();
            } catch {}
            try { demuxer.destroy(); } catch {}
        };

        return {
            resource: createAudioResource(demuxed, { inputType: StreamType.Opus }),
            stream: demuxed
        };
    }

    async playTrack(track) {
        const token = ++this._playToken;
        this._starting = true;
        try {
            this.queue.current = track;
            this._position = 0;
            this.playbackStartTime = Date.now();

            if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Ready) {
                await entersState(this.connection, VoiceConnectionStatus.Ready, 15_000);
                if (token !== this._playToken) return;
            }

            const streamPrepStart = Date.now();
            console.log(`[Player] Preparing stream: "${track.title}" (Guild: ${this.guildId})`);

            if (this.currentProcess) {
                try { this.currentProcess.kill(); } catch {}
                this.currentProcess = null;
            }

            // Direct real-time streaming with early process tracker
            const stream = await CacheManager.createTrackStream(track, 0, this.volume, (proc) => {
                if (token !== this._playToken) {
                    try { proc.kill(); } catch {}
                    return;
                }
                this.currentProcess = proc;
            });

            if (token !== this._playToken) {
                if (stream && stream.kill) {
                    try { stream.kill(); } catch {}
                }
                return;
            }

            const buffered = this._createBufferedResource(stream);
            this.currentProcess = buffered.stream;
            const resource = buffered.resource;

            this.currentResource = resource;
            this.audioPlayer.play(resource);
            console.log(`[Player] Audio resource dispatched to voice channel in ${Date.now() - streamPrepStart}ms: "${track.title}"`);
            this.manager.emit('playerStart', this, track);
            this._preCacheNextTrack();
        } catch (error) {
            if (token !== this._playToken) return;
            console.error(`Failed to play track ${track.title}:`, error.message);
            this.manager.emit('playerException', this, track, error);
            this.playing = false;
            this.audioPlayer.stop();
        } finally {
            this._starting = false;
            if (token !== this._playToken && this.audioPlayer.state.status === AudioPlayerStatus.Idle && this.queue.length > 0) {
                this._advanceQueue().catch(() => {});
            }
        }
    }

    pause(pause = true) {
        if (pause) {
            this.audioPlayer.pause();
            this._position = this.position;
            this.paused = true;
        } else {
            this.audioPlayer.unpause();
            this.playbackStartTime = Date.now();
            this.paused = false;
        }
        return this.paused;
    }

    resume() {
        return this.pause(false);
    }

    skip() {
        this._isSkipping = true;
        this._playToken++;
        if (this.currentProcess) {
            try { this.currentProcess.kill(); } catch {}
            this.currentProcess = null;
        }
        this.audioPlayer.stop(true);
    }

    stop() {
        if (this._preCacheTimer) {
            clearTimeout(this._preCacheTimer);
            this._preCacheTimer = null;
        }
        this._isSkipping = false;
        this._playToken++;
        if (this.currentProcess) {
            try { this.currentProcess.kill(); } catch {}
            this.currentProcess = null;
        }
        this.queue.clear();
        this.audioPlayer.stop(true);
    }

    setVolume(volume) {
        this.volume = volume;
        settingsManager.setGuildVolume(this.guildId, volume);
        if (this.playing && this.queue.current) {
            this.seek(this.position);
        }
    }

    setLoop(mode) {
        this.loop = mode;
        return this.loop;
    }

    cycleLoop() {
        if (this.loop === 'none') this.loop = 'track';
        else if (this.loop === 'track') this.loop = 'queue';
        else this.loop = 'none';
        return this.loop;
    }

    async playPrevious() {
        if (!this.queue.previous) return false;
        const prev = this.queue.previous;
        if (this.queue.current) {
            this.queue.unshift(this.queue.current);
        }
        await this.playTrack(prev);
        return true;
    }

    async _handleAutoplay(lastTrack) {
        try {
            const query = `${lastTrack.author || ''} song`.trim() || `${lastTrack.title} related`;
            const result = await this.manager.search(query, {
                requester: lastTrack.requester
            });

            if (result && result.tracks && result.tracks.length > 0) {
                const nextTrack = result.tracks.find(t => t.uri !== lastTrack.uri && t.identifier !== lastTrack.identifier) || result.tracks[0];
                if (nextTrack) {
                    console.log(`[Player] Autoplay queued: "${nextTrack.title}"`);
                    await this.playTrack(nextTrack);
                    return true;
                }
            }
        } catch (err) {
            console.warn('[Player] Autoplay failed:', err.message);
        }
        return false;
    }

    async seek(positionMs) {
        if (!this.queue.current) return;
        try {
            if (this.currentProcess) {
                try { this.currentProcess.kill(); } catch {}
                this.currentProcess = null;
            }

            const seekSeconds = Math.max(0, Math.floor(positionMs / 1000));
            const stream = await CacheManager.createTrackStream(this.queue.current, seekSeconds, this.volume, (proc) => {
                this.currentProcess = proc;
            });

            const buffered = this._createBufferedResource(stream);
            this.currentProcess = buffered.stream;
            const resource = buffered.resource;

            this.currentResource = resource;
            this.position = positionMs;
            this.playbackStartTime = Date.now();
            this.audioPlayer.play(resource);
        } catch (error) {
            console.error('[Player] Seek error:', error.message);
        }
    }

    _preCacheNextTrack() {
        const streamMode = (process.env.STREAM_MODE || 'auto').toLowerCase().trim();
        if (streamMode === 'pipe') return;

        if (this._preCacheTimer) {
            clearTimeout(this._preCacheTimer);
            this._preCacheTimer = null;
        }

        // Delay pre-caching by 8s so current track playback stabilizes first
        this._preCacheTimer = setTimeout(() => {
            // Pre-cache only if RAM usage is healthy (<150MB) and player is still active
            const mem = process.memoryUsage();
            if (mem.rss > 150 * 1024 * 1024) return;

            if (this.queue.length > 0 && this.playing) {
                const nextTrack = this.queue[0];
                const identifier = nextTrack.identifier || Buffer.from(nextTrack.uri || '').toString('hex').slice(0, 20);
                if (!CacheManager.isCached(identifier)) {
                    CacheManager.prepareTrack(nextTrack, true).catch(() => {});
                }
            }
        }, 8000);
    }

    destroy() {
        this.stop();
        if (this.nowPlayingMessage) {
            try { this.nowPlayingMessage.delete().catch(() => {}); } catch {}
            this.nowPlayingMessage = null;
        }
        if (this.connection) {
            try {
                this.connection.destroy();
            } catch {}
            this.connection = null;
        }
        if (this.manager && this.manager.players) {
            this.manager.players.delete(this.guildId);
        }
        if (global.gc) global.gc();
    }
}

module.exports = Player;
