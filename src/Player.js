const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus, 
    entersState, 
    StreamType 
} = require('@discordjs/voice');
const fs = require('fs');
const CacheManager = require('./CacheManager');

class PlayerQueue extends Array {
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
        this.volume = options.volume || 100;
        this.loop = 'none'; // 'none' | 'track' | 'queue'
        this.paused = false;
        this.playing = false;
        this.position = 0;
        this.playbackStartTime = 0;

        this.queue = new PlayerQueue(this);
        this.audioPlayer = createAudioPlayer();
        this.connection = null;
        this.currentResource = null;
        this._playToken = 0;
        this._advancing = false;
        this._starting = false; // in-flight guard: true while playTrack is starting (stream not yet playing)

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

        this.connection.on('debug', message => console.log(`[VoiceConnection DEBUG] ${message}`));
        this.connection.on('error', error => console.error(`[VoiceConnection ERROR]`, error));

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
        this.audioPlayer.on('debug', message => console.log(`[AudioPlayer DEBUG] ${message}`));
        
        this.audioPlayer.on('stateChange', (oldState, newState) => {
            console.log(`[AudioPlayer STATE] ${oldState.status} -> ${newState.status}`);
            if (newState.status === AudioPlayerStatus.Playing) {
                this.playing = true;
                this.paused = false;
                this.playbackStartTime = Date.now();
                console.log(`[AudioPlayer] Now sending audio packets!`);
            }
        });

        this.audioPlayer.on(AudioPlayerStatus.Idle, async () => {
            if (this._starting) return; // don't shift queue / emit playerEmpty / destroy while a track is mid-start
            if (this._advancing) return;
            this._advancing = true;
            try {
                if (this.currentProcess) {
                    try { this.currentProcess.kill(); } catch {}
                    this.currentProcess = null;
                }

                const finishedTrack = this.queue.current;
                this.playing = false;
                this.position = 0;

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
                this.manager.emit('playerException', this, error);
            } finally {
                this._advancing = false;
                // Recovery: skip/stop during load can leave the player Idle
                // with queued tracks; re-trigger the advance to continue.
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
        this._starting = true; // guard the Idle handler until play() succeeds or this call aborts
        try {
            this.queue.current = track;
            this._position = 0;
            this.playing = true;

            if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Ready) {
                console.log(`[Player] Waiting for voice connection Ready on guild ${this.guildId}...`);
                await entersState(this.connection, VoiceConnectionStatus.Ready, 15_000);
                if (token !== this._playToken) return; // stale: superseded by a newer playTrack/skip
                console.log(`[Player] Voice connection is now Ready!`);
            }

            console.log(`[Player] Preparing track for playback: ${track.title}`);

            if (this.currentProcess) {
                try { this.currentProcess.kill(); } catch {}
                this.currentProcess = null;
            }

            let stream;
            try {
                // Stream yt-dlp -> ffmpeg (raw Opus) so playback starts before full download
                stream = await CacheManager.createTrackStream(track);
            } catch (streamError) {
                // Fallback: play from the fully cached file
                console.warn(`[Player] Streaming failed (${streamError.message}), falling back to cached file...`);
                const filePath = await CacheManager.prepareTrack(track);
                if (token !== this._playToken) return; // stale: abort before spawning fallback process
                const { spawn } = require('child_process');
                const proc = spawn(CacheManager.ffmpegPath, [
                    '-nostdin',
                    '-loglevel', 'quiet',
                    '-i', filePath,
                    '-f', 'opus',
                    '-c:a', 'copy',
                    'pipe:1'
                ]);
                proc.on('error', (err) => console.error('[ffmpeg error]:', err.message));
                proc.stdout.kill = () => {
                    try { proc.kill(); } catch {}
                };
                stream = proc.stdout;
            }

            if (token !== this._playToken) {
                // Stale: kill any spawned stream and abort instead of overwriting currentProcess
                if (stream && stream.kill) {
                    try { stream.kill(); } catch {}
                }
                return; // finally clears _starting and re-triggers advance if needed
            }

            this.currentProcess = stream;

            const resource = createAudioResource(stream, {
                inputType: StreamType.OggOpus,
                inlineVolume: true // Enable volume control for streams
            });

            this.currentResource = resource;
            this.audioPlayer.play(resource);
            this._starting = false; // playback started; the Idle handler may advance again
            this.manager.emit('playerStart', this, track);
            console.log(`[Player] Audio resource playing via FFmpeg on Discord voice gateway`);
            this._preCacheNextTrack();
        } catch (error) {
            if (token !== this._playToken) return; // stale failure: ignore, a newer call owns playback
            console.error(`Failed to play track ${track.title}:`, error);
            this.manager.emit('playerException', this, track, error);
            this.playing = false;
            this.audioPlayer.stop();
        } finally {
            if (this._starting) {
                this._starting = false; // start aborted/failed: release the Idle guard
                // Recovery: a skip/stop during the start window can leave the player
                // Idle with queued tracks (the Idle handler bailed on _starting);
                // re-trigger the advance so playback continues.
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
        this._playToken++; // invalidate any in-flight playTrack so it aborts instead of double-playing
        if (this.currentProcess) {
            try { this.currentProcess.kill(); } catch {}
            this.currentProcess = null;
        }
        this.audioPlayer.stop(true);
    }

    stop() {
        this._playToken++; // invalidate any in-flight playTrack (defensive, same pattern as skip)
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
            const filePath = await CacheManager.prepareTrack(this.queue.current);
            const { spawn } = require('child_process');
            const ffmpegProc = spawn(CacheManager.ffmpegPath, [
                '-nostdin',
                '-loglevel', 'quiet',
                '-ss', (positionMs / 1000).toString(),
                '-i', filePath,
                '-f', 'opus',
                '-c:a', 'copy',
                'pipe:1'
            ]);
            this.currentProcess = ffmpegProc;

            const resource = createAudioResource(ffmpegProc.stdout, {
                inputType: StreamType.OggOpus,
                inlineVolume: true // Enable volume control for streams
            });

            this.currentResource = resource;
            this.position = positionMs;
            this.playbackStartTime = Date.now();
            this.audioPlayer.play(resource);
        } catch (error) {
            console.error('Seek error:', error);
        }
    }

    _preCacheNextTrack() {
        if (this.queue.length > 0 && this.playing) {
            const nextTrack = this.queue[0];
            CacheManager.prepareTrack(nextTrack).catch(err => {
                console.warn(`[Player] Background pre-cache warning: ${err.message.split('\n')[0]}`);
            });
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
        this.manager.players.delete(this.guildId);
        if (global.gc) global.gc();
    }
}

module.exports = Player;
