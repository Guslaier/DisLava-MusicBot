const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class ProxyManager {
    constructor() {
        this.configuredProxyUrl = process.env.PROXY_URL || null;
        this.isOnline = false;
        this.lastCheckTime = 0;
        this.lastError = null;
        this._interval = null;
    }

    async init() {
        if (!this.configuredProxyUrl) {
            this.isOnline = false;
            return;
        }

        // Initial check
        await this.checkHealth(true);

        // Periodic background polling every 45 seconds (non-blocking)
        if (this._interval) clearInterval(this._interval);
        this._interval = setInterval(() => {
            this.checkHealth(false).catch(() => {});
        }, 45 * 1000);
        this._interval.unref();
    }

    async checkHealth(isStartup = false) {
        if (!this.configuredProxyUrl) {
            this.isOnline = false;
            return false;
        }

        const wasOnline = this.isOnline;
        this.lastCheckTime = Date.now();

        try {
            // Fast 4s timeout probe to test proxy egress
            await execAsync(`curl -x "${this.configuredProxyUrl}" -I -s --connect-timeout 4 https://www.google.com`);
            this.isOnline = true;
            this.lastError = null;

            if (!wasOnline && !isStartup) {
                console.log(`[ProxyManager] Proxy connection RECOVERED: ${this.configuredProxyUrl} (Active again!)`);
            }
            return true;
        } catch (err) {
            this.isOnline = false;
            this.lastError = err.message;

            if (wasOnline && !isStartup) {
                console.warn(`[ProxyManager] Proxy connection LOST! Falling back to direct/bypass mode.`);
            }
            return false;
        }
    }

    getProxyUrl() {
        return this.isOnline ? this.configuredProxyUrl : null;
    }

    getStatus() {
        if (!this.configuredProxyUrl) {
            return {
                configured: false,
                isOnline: false,
                label: 'None Configured'
            };
        }
        return {
            configured: true,
            isOnline: this.isOnline,
            url: this.configuredProxyUrl,
            lastCheckTime: this.lastCheckTime,
            label: this.isOnline ? 'Online (Active)' : 'Offline (Auto-Reconnecting...)'
        };
    }
}

module.exports = new ProxyManager();
