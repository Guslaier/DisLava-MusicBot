const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const smartProxyPool = require('./smartProxyPool');

class ProxyManager {
    constructor() {
        this.vpnEnabled = process.env.ENABLE_VPN !== 'false';
        this.configuredProxyUrl = process.env.PROXY_URL ? process.env.PROXY_URL.trim() : null;
        this.isOnline = false;
        this.lastCheckTime = 0;
        this.lastError = null;
        this.vpnHealthy = true;
        this.consecutiveVpnFailures = 0;
        this.isRepairingVpn = false;
        this.lastVpnEgressTest = 0;
    }

    /**
     * Synchronizes system VPN service based on ENABLE_VPN in .env.
     */
    _syncVpnService() {
        if (process.platform !== 'linux') return;

        // Auto-update auth.txt if credentials provided in .env
        const vpnUser = process.env.VPN_USERNAME;
        const vpnPass = process.env.VPN_PASSWORD;
        if (vpnUser && vpnPass) {
            try {
                if (!fs.existsSync('/root/vpn')) fs.mkdirSync('/root/vpn', { mode: 0o700, recursive: true });
                fs.writeFileSync('/root/vpn/auth.txt', `${vpnUser.trim()}\n${vpnPass.trim()}\n`, { mode: 0o600 });
            } catch (err) {
                console.warn('[ProxyManager] [VPN] Failed to update auth.txt:', err.message);
            }
        }

        const serviceFile = '/etc/systemd/system/protonvpn-isolated.service';
        if (!fs.existsSync(serviceFile)) return;

        execFile('systemctl', ['is-active', '--quiet', 'protonvpn-isolated'], (err) => {
            const isActive = !err;
            if (this.vpnEnabled && !isActive) {
                console.log('[ProxyManager] [VPN] Starting protonvpn-isolated service...');
                execFile('systemctl', ['start', 'protonvpn-isolated'], () => {});
            } else if (!this.vpnEnabled && isActive) {
                console.log('[ProxyManager] [VPN] Stopping protonvpn-isolated service (disabled via ENABLE_VPN=false)...');
                execFile('systemctl', ['stop', 'protonvpn-isolated'], () => {});
            }
        });
    }

    /**
     * Resolves active VPN client IPv4 address if tun interface is up.
     */
    getVpnSourceIp() {
        if (!this.vpnEnabled) return null;

        if (process.env.VPN_SOURCE_IP) {
            return process.env.VPN_SOURCE_IP.trim();
        }
        try {
            if (fs.existsSync('/root/vpn/vpn_ip.txt')) {
                const ip = fs.readFileSync('/root/vpn/vpn_ip.txt', 'utf8').trim();
                if (ip) return ip;
            }
        } catch {}
        try {
            const ifaces = os.networkInterfaces();
            for (const name of Object.keys(ifaces)) {
                if (/^tun\d+$/i.test(name)) {
                    const ipv4 = ifaces[name].find(x => x.family === 'IPv4' || x.family === 4);
                    if (ipv4 && ipv4.address) return ipv4.address;
                }
            }
        } catch {}
        return null;
    }

    isVpnActive() {
        return this.vpnEnabled && this.vpnHealthy && !!this.getVpnSourceIp();
    }

    /**
     * Resolves the current active ProtonVPN server name.
     */
    getVpnServerName() {
        try {
            if (fs.existsSync('/root/vpn/current_config.txt')) {
                const raw = fs.readFileSync('/root/vpn/current_config.txt', 'utf8').trim();
                const m = raw.match(/^(sg-free-\d+)/i);
                if (m) {
                    return m[1].toUpperCase();
                }
                return raw.replace('.protonvpn.udp.ovpn', '');
            }
        } catch {}
        return 'SG-Default';
    }

    /**
     * Verifies that Linux policy routing table 100 is intact, restores if missing (Async non-blocking).
     */
    async verifyAndRepairVpnRoute() {
        if (process.platform !== 'linux' || !this.vpnEnabled) return false;
        const vpnIp = this.getVpnSourceIp();
        if (!vpnIp) return false;

        return new Promise((resolve) => {
            execFile('ip', ['rule', 'show'], (err, stdout) => {
                if (err) return resolve(false);
                const hasRule = (stdout || '').includes('lookup 100') || (stdout || '').includes('table 100');
                if (!hasRule) {
                    console.warn(`[ProxyManager:SelfHealing] Missing Linux policy route rule for ${vpnIp}! Auto-restoring...`);
                    execFile('ip', ['rule', 'add', 'from', vpnIp, 'table', '100'], () => {
                        execFile('ip', ['route', 'replace', 'default', 'dev', 'tun0', 'table', '100'], () => {
                            console.log('[ProxyManager:SelfHealing] Successfully restored policy routing table 100.');
                            resolve(true);
                        });
                    });
                } else {
                    resolve(false);
                }
            });
        });
    }

    /**
     * Checks VPN egress health asynchronously without blocking the event loop.
     */
    async checkVpnHealth(force = false) {
        if (process.platform !== 'linux' || !this.vpnEnabled) return true;
        const now = Date.now();
        if (!force && now - this.lastVpnEgressTest < 30000) {
            return this.vpnHealthy;
        }
        this.lastVpnEgressTest = now;

        const vpnIp = this.getVpnSourceIp();
        if (!vpnIp) {
            this.vpnHealthy = false;
            return false;
        }

        this.verifyAndRepairVpnRoute().catch(() => {});

        return new Promise((resolve) => {
            execFile('curl', ['-s', '-m', '3', '--interface', vpnIp, 'https://api.ipify.org'], (err, stdout) => {
                const ip = (stdout || '').trim();
                if (!err && ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
                    if (!this.vpnHealthy) {
                        console.log(`[ProxyManager:SelfHealing] VPN tunnel online! (Server: ${this.getVpnServerName()}, Exit IP: ${ip})`);
                    }
                    this.vpnHealthy = true;
                    this.consecutiveVpnFailures = 0;
                    return resolve(true);
                }

                this.consecutiveVpnFailures++;
                console.warn(`[ProxyManager:SelfHealing] VPN egress probe failed (${this.consecutiveVpnFailures} consecutive fails)`);

                if (this.consecutiveVpnFailures >= 2 && !this.isRepairingVpn) {
                    this.isRepairingVpn = true;
                    this.vpnHealthy = false;
                    console.warn('[ProxyManager:SelfHealing] Failing over to next SG VPN server in pool...');
                    setTimeout(async () => {
                        await this.switchVpnServer('next');
                        this.isRepairingVpn = false;
                    }, 1000).unref();
                }
                resolve(false);
            });
        });
    }

    /**
     * Switches to the next or specified VPN server asynchronously.
     */
    async switchVpnServer(target = 'next') {
        if (process.platform !== 'linux') {
            return { ok: false, reason: 'VPN switching is supported on Linux only' };
        }
        if (!fs.existsSync('/root/vpn/vpn-switch.sh')) {
            return { ok: false, reason: 'vpn-switch.sh not found' };
        }

        console.log(`[ProxyManager:VPN] Initiating VPN switch (target: ${target})...`);
        return new Promise((resolve) => {
            execFile('/root/vpn/vpn-switch.sh', [target], { timeout: 20000 }, (err, stdout) => {
                if (err) {
                    console.error('[ProxyManager:VPN] Switch failed:', err.message);
                    return resolve({ ok: false, reason: err.message });
                }
                const out = (stdout || '').trim();
                console.log(`[ProxyManager:VPN] Switch output:\n${out}`);
                this.vpnHealthy = true;
                this.consecutiveVpnFailures = 0;
                const newServer = this.getVpnServerName();
                const newIp = this.getVpnSourceIp();
                resolve({ ok: true, server: newServer, ip: newIp, output: out });
            });
        });
    }

    /**
     * Reports a network failure when using VPN to trigger fast self-healing.
     */
    reportVpnFailure(reason = '') {
        if (!this.vpnEnabled) return;
        console.warn(`[ProxyManager:SelfHealing] Triggering immediate VPN health check due to failure: ${reason}`);
        this.checkVpnHealth(true).catch(() => {});
    }

    /**
     * Returns network arguments for yt-dlp (VPN source address or proxy).
     */
    getNetworkArgs() {
        const vpnIp = this.getVpnSourceIp();
        if (vpnIp) {
            return ['--source-address', vpnIp];
        }
        const proxy = this.getYouTubeProxy();
        if (proxy) {
            return ['--proxy', proxy];
        }
        return [];
    }

    /**
     * Returns network arguments formatted as a CLI string.
     */
    getNetworkArgString() {
        const vpnIp = this.getVpnSourceIp();
        if (vpnIp) {
            return `--source-address "${vpnIp}"`;
        }
        const proxy = this.getYouTubeProxy();
        if (proxy) {
            return `--proxy "${proxy}"`;
        }
        return '';
    }

    async init() {
        this._syncVpnService();

        const vpnIp = this.getVpnSourceIp();
        if (vpnIp) {
            await this.verifyAndRepairVpnRoute();
            console.log(`[ProxyManager] [VPN] VPN Egress Active (Server: ${this.getVpnServerName()} | Interface IP: ${vpnIp})`);
        } else if (!this.vpnEnabled) {
            console.log('[ProxyManager] [VPN] VPN Egress Disabled via ENABLE_VPN=false');
        }

        // Initialize Smart Proxy Pool
        await smartProxyPool.init();

        if (this.configuredProxyUrl) {
            console.log(`[ProxyManager] Static VIP proxy configured: ${this.configuredProxyUrl}`);
        } else if (!vpnIp && smartProxyPool.enabled) {
            console.log('[ProxyManager] Running in Dynamic Smart Proxy Pool mode.');
        } else if (!vpnIp && !smartProxyPool.enabled) {
            console.log('[ProxyManager] Running in Direct / Bypass mode (No VPN / Free Proxy Pool disabled).');
        }
    }

    /**
     * Returns the active proxy URL to use.
     * Prioritizes the best verified proxy from SmartProxyPool.
     */
    getProxyUrl() {
        const bestPoolProxy = smartProxyPool.getBestProxy();
        if (bestPoolProxy) {
            return bestPoolProxy;
        }
        return null;
    }

    /**
     * Returns a proxy only if verified against YouTube or configured statically.
     */
    getYouTubeProxy() {
        if (this.configuredProxyUrl && !smartProxyPool.isBlacklisted(this.configuredProxyUrl)) {
            return this.configuredProxyUrl;
        }
        return smartProxyPool.getYouTubeVerifiedProxy();
    }

    /**
     * Reports successful completion of a request through the proxy.
     */
    reportSuccess(proxyUrl, latencyMs = 0) {
        if (!proxyUrl) return;
        smartProxyPool.reportSuccess(proxyUrl, latencyMs);
    }

    /**
     * Reports failure of a request through the proxy.
     */
    reportFailure(proxyUrl, reason = '') {
        if (!proxyUrl) return;
        smartProxyPool.reportFailure(proxyUrl, reason);
    }

    /**
     * Tests a proxy specifically against YouTube.
     */
    async testYouTube(proxyUrl) {
        return await smartProxyPool.testProxyYouTube(proxyUrl);
    }

    /**
     * Manually blacklists a proxy.
     */
    blacklistProxy(proxyUrl, reason, durationMs) {
        return smartProxyPool.blacklistProxy(proxyUrl, reason, durationMs);
    }

    /**
     * Unblacklists a proxy.
     */
    unblacklist(proxyUrl) {
        return smartProxyPool.unblacklist(proxyUrl);
    }

    /**
     * Clears all blacklisted proxies.
     */
    clearBlacklist() {
        return smartProxyPool.clearBlacklist();
    }

    getStatus() {
        const poolStatus = smartProxyPool.getStatus();
        const best = poolStatus.bestProxy;
        const vpnIp = this.getVpnSourceIp();
        const serverName = this.getVpnServerName();

        return {
            isVpn: !!vpnIp,
            vpnIp: vpnIp,
            serverName: serverName,
            vpnEnabled: this.vpnEnabled,
            freeProxyEnabled: smartProxyPool.enabled,
            configured: !!vpnIp || poolStatus.activeCount > 0,
            isOnline: !!vpnIp || poolStatus.activeCount > 0,
            url: vpnIp ? `VPN: ${serverName} (${vpnIp})` : (best || 'None'),
            poolSize: poolStatus.total,
            activeCount: poolStatus.activeCount,
            blacklistCount: poolStatus.blacklistCount,
            bestScore: poolStatus.bestScore,
            bestLatency: poolStatus.bestLatency,
            isYoutubeVerified: !!vpnIp || poolStatus.isYoutubeVerified,
            blacklisted: poolStatus.blacklisted,
            label: vpnIp 
                ? `ProtonVPN ${serverName} (${vpnIp})`
                : (poolStatus.activeCount > 0 
                    ? `Pool Active (${poolStatus.activeCount} online | Best: ${best} [${poolStatus.bestLatency}]${poolStatus.isYoutubeVerified ? ' Verified' : ''})`
                    : 'Direct (Bypass Mode)')
        };
    }
}

module.exports = new ProxyManager();
