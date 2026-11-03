const smartProxyPool = require('./smartProxyPool');

class ProxyManager {
    constructor() {
        this.configuredProxyUrl = process.env.PROXY_URL ? process.env.PROXY_URL.trim() : null;
        this.isOnline = false;
        this.lastCheckTime = 0;
        this.lastError = null;
    }

    async init() {
        // Initialize Smart Proxy Pool
        await smartProxyPool.init();

        if (this.configuredProxyUrl) {
            console.log(`[ProxyManager] Static VIP proxy configured: ${this.configuredProxyUrl}`);
        } else {
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

        return {
            configured: poolStatus.activeCount > 0,
            isOnline: poolStatus.activeCount > 0,
            url: best || 'None',
            poolSize: poolStatus.total,
            activeCount: poolStatus.activeCount,
            blacklistCount: poolStatus.blacklistCount,
            bestScore: poolStatus.bestScore,
            bestLatency: poolStatus.bestLatency,
            isYoutubeVerified: poolStatus.isYoutubeVerified,
            blacklisted: poolStatus.blacklisted,
            label: poolStatus.activeCount > 0 
                ? `Pool Active (${poolStatus.activeCount} online | Best: ${best} [${poolStatus.bestLatency}]${poolStatus.isYoutubeVerified ? ' Verified' : ''})`
                : 'Direct (Bypass Mode)'
        };
    }
}

module.exports = new ProxyManager();
