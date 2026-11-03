const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus, 
    entersState, 
    StreamType 
} = require('@discordjs/voice');
const CacheManager = require('./CacheManager');

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
        this.volume = typeof options.volume === 'number' ? options.volume : 100;
        this.loop = 'none'; // 'none' | 'track' | 'queue'
        this.paused = false;
        this.playing = false;
        this._position = 0;
        this.playbackStartTime = 0;

        this.queue = new PlayerQueue(this);
        this.audioPlayer = createAudioPlayer();
        this.connection = null;
        this.currentResource = null;
        this.currentProcess = null;
        this._playToken = 0;
        this._advancing = false;
        this._starting = false; // in-flight guard

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
            }
        });

        this.audioPlayer.on(AudioPlayerStatus.Idle, async () => {
            if (this._starting) return;
            if (this._advancing) return;
            this._advancing = true;
            try {
                if (this.currentProcess) {
                    try { this.currentProcess.kill(); } catch {}
                    this.currentProcess = null;
                }

                const finishedTrack = this.queue.current;
                this.playing = false;
                this._position = 0;

                if (finishedTrack) {
                    this.queue.previous = finishedTrack;
                    this.manager.emit('playerEnd', this, finishedTrack);

                    if (this.loop === 'track') {
                        await this.playTrack(finishedTrack);
                        return;
                    } else if (this.loop === 'queue') {
                        this.queue.add(finishedTrack);
                    }
                }

                if (this.queue.length > 0) {
                    const nextTrack = this.queue.shift();
                    await this.playTrack(nextTrack);
                } else {
                    this.queue.current = null;
                    this.manager.emit('playerEmpty', this);
                }
            } catch (error) {
                console.error('[Player] Idle advance error:', error);
                this.manager.emit('playerException', this, this.queue.current, error);
            } finally {
                this._advancing = false;
                if (this.audioPlayer.state.status === AudioPlayerStatus.Idle && this.queue.length > 0) {
                    this.audioPlayer.emit(AudioPlayerStatus.Idle);
                }
            }
        });

        this.audioPlayer.on('error', (error) => {
            console.error(`AudioPlayer error in guild ${this.guildId}:`, error.message);
            this.manager.emit('playerException', this, this.queue.current, error);
            this.skip();
        });
    }

    get position() {
        if (!this.playing || this.paused) return this._position || 0;
        return (this._position || 0) + (Date.now() - this.playbackStartTime);
    }

    set position(val) {
        this._position = val;
    }

    async play() {
        if (this.playing) return;
        if (this.queue.length > 0) {
            const track = this.queue.shift();
            await this.playTrack(track);
        } else if (this.queue.current) {
            await this.playTrack(this.queue.current);
        }
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

            console.log(`[Player] Preparing stream: "${track.title}"`);

            if (this.currentProcess) {
                try { this.currentProcess.kill(); } catch {}
                this.currentProcess = null;
            }

            // Direct Real-time Streaming
            const stream = await CacheManager.createTrackStream(track);

            if (token !== this._playToken) {
                if (stream && stream.kill) {
                    try { stream.kill(); } catch {}
                }
                return;
            }

            this.currentProcess = stream;

            const resource = createAudioResource(stream, {
                inputType: StreamType.OggOpus,
                inlineVolume: true
            });

            // Persist user-selected volume across tracks
            if (resource.volume) {
                resource.volume.setVolume(this.volume / 100);
            }

            this.currentResource = resource;
            this.audioPlayer.play(resource);
            this._starting = false;
            this.manager.emit('playerStart', this, track);
            this._preCacheNextTrack();
        } catch (error) {
            if (token !== this._playToken) return;
            console.error(`Failed to play track ${track.title}:`, error.message);
            this.manager.emit('playerException', this, track, error);
            this.playing = false;
            this.audioPlayer.stop();
        } finally {
            if (this._starting) {
                this._starting = false;
                if (this.audioPlayer.state.status === AudioPlayerStatus.Idle && this.queue.length > 0) {
                    this.audioPlayer.emit(AudioPlayerStatus.Idle);
                }
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
        this._playToken++;
        if (this.currentProcess) {
            try { this.currentProcess.kill(); } catch {}
            this.currentProcess = null;
        }
        this.audioPlayer.stop(true);
    }

    stop() {
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
        if (this.currentResource && this.currentResource.volume) {
            this.currentResource.volume.setVolume(this.volume / 100);
        }
    }

    setLoop(mode) {
        this.loop = mode;
        return this.loop;
    }

    async seek(positionMs) {
        if (!this.queue.current) return;
        try {
            if (this.currentProcess) {
                try { this.currentProcess.kill(); } catch {}
                this.currentProcess = null;
            }

            const seekSeconds = Math.max(0, Math.floor(positionMs / 1000));
            const stream = await CacheManager.createTrackStream(this.queue.current, seekSeconds);

            this.currentProcess = stream;

            const resource = createAudioResource(stream, {
                inputType: StreamType.OggOpus,
                inlineVolume: true
            });

            if (resource.volume) {
                resource.volume.setVolume(this.volume / 100);
            }

            this.currentResource = resource;
            this.position = positionMs;
            this.playbackStartTime = Date.now();
            this.audioPlayer.play(resource);
        } catch (error) {
            console.error('[Player] Seek error:', error.message);
        }
    }

    _preCacheNextTrack() {
        // Pre-cache only if RAM usage is healthy (<150MB) and loop mode is track
        const mem = process.memoryUsage();
        if (mem.rss > 150 * 1024 * 1024) return;

        if (this.queue.length > 0 && this.playing) {
            const nextTrack = this.queue[0];
            // Only prepare file if not already cached
            const identifier = nextTrack.identifier || Buffer.from(nextTrack.uri || '').toString('hex').slice(0, 20);
            if (!CacheManager.isCached(identifier)) {
                CacheManager.prepareTrack(nextTrack).catch(() => {});
            }
        }
    }

    destroy() {
        this.stop();
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
