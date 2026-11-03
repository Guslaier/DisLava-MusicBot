const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class YouTubeCircuit {
    constructor() {
        this.openUntil = 0;
        this.cooldownMs = parseInt(process.env.YT_CIRCUIT_COOLDOWN_MS || '600000', 10); // default 10 minutes
        this.lastReason = null;
        this.lastTripTime = 0;
        this._probing = false;
        this._probeInterval = null;
    }

    isOpen() {
        return Date.now() < this.openUntil;
    }

    trip(reason = 'Anti-Bot detected') {
        const cleanReason = (reason || 'Anti-Bot block').toString().slice(0, 100);
        this.lastReason = cleanReason;
        this.lastTripTime = Date.now();
        this.openUntil = Date.now() + this.cooldownMs;
        console.warn(`[YouTubeCircuit] Circuit OPEN (Bypassing YouTube to SoundCloud for ${Math.round(this.cooldownMs / 60000)}m) - ${cleanReason}`);
    }

    reset() {
        if (this.openUntil !== 0) {
            console.log('[YouTubeCircuit] Circuit CLOSED (YouTube unblocked/recovered).');
        }
        this.openUntil = 0;
        this.lastReason = null;
    }

    static isBotBlock(text) {
        if (!text) return false;
        const str = typeof text === 'string' ? text : text.toString();
        return /Sign in to confirm|not a bot|unusual traffic|HTTP Error 429|captcha/i.test(str);
    }

    startProbe(binPath, getProxyFn) {
        if (this._probeInterval) return;

        // Run non-blocking probe on startup
        setTimeout(() => {
            this._runProbe(binPath, getProxyFn).catch(() => {});
        }, 1500);

        // Run probe periodically every cooldown interval
        this._probeInterval = setInterval(() => {
            if (this.isOpen()) {
                this._runProbe(binPath, getProxyFn).catch(() => {});
            }
        }, this.cooldownMs);
        this._probeInterval.unref();
    }

    async _runProbe(binPath, getProxyFn) {
        if (this._probing) return;
        this._probing = true;
        try {
            const proxy = typeof getProxyFn === 'function' ? getProxyFn() : null;
            const proxyArg = proxy ? `--proxy "${proxy}"` : '';
            const cmd = `"${binPath}" --no-warnings --socket-timeout 5 --no-playlist -g "https://www.youtube.com/watch?v=dQw4w9WgXcQ" ${proxyArg}`;
            const { stdout } = await execAsync(cmd, { timeout: 8000 });
            if (stdout && stdout.trim().startsWith('http')) {
                this.reset();
            } else {
                this.trip('Startup/Probe check failed');
            }
        } catch (err) {
            const stderr = (err.stderr || err.stdout || err.message || '').toString();
            if (YouTubeCircuit.isBotBlock(stderr)) {
                this.trip('Probe detected YouTube bot block');
            } else {
                this.trip(stderr.split('\n')[0] || 'Probe error');
            }
        } finally {
            this._probing = false;
        }
    }

    getStatus() {
        const open = this.isOpen();
        const remainingMs = Math.max(0, this.openUntil - Date.now());
        const remainingMin = Math.ceil(remainingMs / 60000);
        return {
            isOpen: open,
            status: open ? `Open (Bypass Active, retry in ${remainingMin}m)` : 'Closed (YouTube Active)',
            lastReason: this.lastReason,
            remainingMinutes: remainingMin
        };
    }
}

module.exports = new YouTubeCircuit();

