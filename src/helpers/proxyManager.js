const fs = require('fs');
const os = require('os');
const smartProxyPool = require('./smartProxyPool');

class ProxyManager {
    constructor() {
        this.configuredProxyUrl = process.env.PROXY_URL ? process.env.PROXY_URL.trim() : null;
        this.isOnline = false;
        this.lastCheckTime = 0;
        this.lastError = null;
    }

    /**
     * Resolves active VPN client IPv4 address if tun interface is up.
     */
    getVpnSourceIp() {
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
        return !!this.getVpnSourceIp();
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
        const vpnIp = this.getVpnSourceIp();
        if (vpnIp) {
            console.log(`[ProxyManager] [VPN] VPN Egress Active (Interface IP: ${vpnIp})`);
        }

        // Initialize Smart Proxy Pool
        await smartProxyPool.init();

        if (this.configuredProxyUrl) {
            console.log(`[ProxyManager] Static VIP proxy configured: ${this.configuredProxyUrl}`);
        } else if (!vpnIp) {
            console.log('[ProxyManager] Running in Dynamic Smart Proxy Pool mode.');
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

        return {
            isVpn: !!vpnIp,
            vpnIp: vpnIp,
            configured: !!vpnIp || poolStatus.activeCount > 0,
            isOnline: !!vpnIp || poolStatus.activeCount > 0,
            url: vpnIp ? `VPN: ${vpnIp}` : (best || 'None'),
            poolSize: poolStatus.total,
            activeCount: poolStatus.activeCount,
            blacklistCount: poolStatus.blacklistCount,
            bestScore: poolStatus.bestScore,
            bestLatency: poolStatus.bestLatency,
            isYoutubeVerified: !!vpnIp || poolStatus.isYoutubeVerified,
            blacklisted: poolStatus.blacklisted,
            label: vpnIp 
                ? `ProtonVPN Tunnel (${vpnIp})`
                : (poolStatus.activeCount > 0 
                    ? `Pool Active (${poolStatus.activeCount} online | Best: ${best} [${poolStatus.bestLatency}]${poolStatus.isYoutubeVerified ? ' Verified' : ''})`
                    : 'Direct (Bypass Mode)')
        };
    }
}

module.exports = new ProxyManager();
