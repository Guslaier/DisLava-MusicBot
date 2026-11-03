const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const https = require('https');
const execAsync = promisify(exec);

class SmartProxyPool {
    constructor() {
        this.dataPath = path.resolve(__dirname, '../../data/proxy_pool.json');
        this.proxies = new Map(); // url -> proxyObject
        this.isScanning = false;
        this.lastScanTime = 0;
        this._healthInterval = null;
        this._scrapeInterval = null;
        this.enabled = process.env.ENABLE_SMART_PROXY !== 'false';
    }

    async init() {
        if (!this.enabled) {
            console.log('[SmartProxyPool] Smart Proxy Pool is disabled via configuration.');
            return;
        }

        this._loadPool();

        // VIP/Configured Proxy from .env (always given priority if healthy)
        if (process.env.PROXY_URL) {
            const vipUrl = process.env.PROXY_URL.trim();
            if (!this.proxies.has(vipUrl)) {
                this.proxies.set(vipUrl, {
                    url: vipUrl,
                    score: 90,
                    latency: 200,
                    successCount: 0,
                    failCount: 0,
                    consecutiveFails: 0,
                    isVip: true,
                    lastChecked: 0,
                    lastSuccess: 0
                });
            }
        }

        console.log(`[SmartProxyPool] Loaded ${this.proxies.size} proxies from cache.`);

        // Initial background scan/validation
        setTimeout(() => {
            this.refreshPool(false).catch(() => {});
        }, 3000);

        // Health check top candidates every 45s
        this._healthInterval = setInterval(() => {
            this.checkTopProxies().catch(() => {});
        }, 45 * 1000);
        this._healthInterval.unref();

        // Auto-scrape new Thai proxies every 15 minutes
        this._scrapeInterval = setInterval(() => {
            this.refreshPool(false).catch(() => {});
        }, 15 * 60 * 1000);
        this._scrapeInterval.unref();
    }

    _loadPool() {
        try {
            if (fs.existsSync(this.dataPath)) {
                const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
                if (Array.isArray(data)) {
                    for (const p of data) {
                        if (p && p.url) {
                            this.proxies.set(p.url, p);
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('[SmartProxyPool] Notice loading pool:', err.message);
        }
    }

    _savePool() {
        try {
            const dir = path.dirname(this.dataPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const list = Array.from(this.proxies.values());
            fs.writeFileSync(this.dataPath, JSON.stringify(list, null, 2), 'utf-8');
        } catch (err) {
            console.error('[SmartProxyPool] Failed to save pool:', err.message);
        }
    }

    /**
     * Returns the highest-ranked proxy URL currently alive.
     * Ranked by Score DESC, Latency ASC.
     */
    getBestProxy() {
        if (!this.enabled || this.proxies.size === 0) return null;

        const candidates = Array.from(this.proxies.values()).filter(p => {
            return p.score >= 30 && p.consecutiveFails < 2;
        });

        if (candidates.length === 0) return null;

        candidates.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return (a.latency || 9999) - (b.latency || 9999);
        });

        return candidates[0].url;
    }

    /**
     * Report successful usage of a proxy.
     */
    reportSuccess(proxyUrl, latencyMs = 0) {
        if (!proxyUrl) return;
        const p = this.proxies.get(proxyUrl);
        if (p) {
            p.score = Math.min(100, (p.score || 50) + 10);
            p.consecutiveFails = 0;
            p.successCount = (p.successCount || 0) + 1;
            p.lastSuccess = Date.now();
            p.lastChecked = Date.now();
            if (latencyMs > 0) {
                p.latency = p.latency ? Math.round((p.latency * 0.7) + (latencyMs * 0.3)) : latencyMs;
            }
            this._savePool();
        }
    }

    /**
     * Report failed request through a proxy (e.g. timeout, 403, network drop).
     */
    reportFailure(proxyUrl, reason = '') {
        if (!proxyUrl) return;
        const p = this.proxies.get(proxyUrl);
        if (p) {
            p.consecutiveFails = (p.consecutiveFails || 0) + 1;
            p.failCount = (p.failCount || 0) + 1;
            p.score = Math.max(0, (p.score || 50) - 25);
            p.lastChecked = Date.now();
            p.lastError = reason;

            if (p.consecutiveFails >= 2) {
                console.warn(`[SmartProxyPool] Proxy demoted (${p.url}) [Score: ${p.score}, Fails: ${p.consecutiveFails}] - ${reason}`);
            }
            this._savePool();
        }
    }

    /**
     * Probes a proxy with a fast 3-second connect timeout against Google/YouTube.
     */
    async probeProxy(proxyUrl) {
        const start = Date.now();
        try {
            // Probe against Google to verify egress
            await execAsync(`curl -x "${proxyUrl}" -I -s --connect-timeout 3 -m 4 https://www.google.com`);
            const latency = Date.now() - start;
            return { ok: true, latency };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    }

    /**
     * Checks the top 3 proxies in background to maintain fresh health scores.
     */
    async checkTopProxies() {
        if (this.proxies.size === 0) return;

        const list = Array.from(this.proxies.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

        for (const p of list) {
            const res = await this.probeProxy(p.url);
            if (res.ok) {
                this.reportSuccess(p.url, res.latency);
            } else {
                this.reportFailure(p.url, 'Health check failed');
            }
        }
    }

    /**
     * Scrapes public APIs for fresh Thailand proxies and benchmarks them.
     */
    async refreshPool(force = false) {
        if (this.isScanning) return;
        if (!force && Date.now() - this.lastScanTime < 5 * 60 * 1000) return;

        this.isScanning = true;
        this.lastScanTime = Date.now();
        console.log('[SmartProxyPool] Auto-discovering fresh Thailand proxies...');

        const candidates = new Set();

        try {
            // Source 1: Proxyscrape API (HTTP/SOCKS)
            const rawList = await this._httpGet('https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http,socks4,socks5&country=TH&timeout=4000');
            if (rawList) {
                rawList.split(/\r?\n/).forEach(line => {
                    const clean = line.trim();
                    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5}$/.test(clean)) {
                        candidates.add(`http://${clean}`);
                    }
                });
            }
        } catch {}

        try {
            // Source 2: Geonode API
            const jsonText = await this._httpGet('https://proxylist.geonode.com/api/proxy-list?country=TH&limit=25&page=1&sort_by=lastChecked&sort_type=desc');
            if (jsonText) {
                const parsed = JSON.parse(jsonText);
                if (parsed && Array.isArray(parsed.data)) {
                    for (const item of parsed.data) {
                        if (item.ip && item.port) {
                            candidates.add(`http://${item.ip}:${item.port}`);
                        }
                    }
                }
            }
        } catch {}

        console.log(`[SmartProxyPool] Found ${candidates.size} potential candidate proxies. Benchmarking...`);

        // Test in parallel batches of 5 to preserve CPU/RAM
        const candidateList = Array.from(candidates).slice(0, 20);
        let aliveCount = 0;

        for (let i = 0; i < candidateList.length; i += 5) {
            const batch = candidateList.slice(i, i + 5);
            await Promise.all(batch.map(async (proxyUrl) => {
                const res = await this.probeProxy(proxyUrl);
                if (res.ok) {
                    aliveCount++;
                    const existing = this.proxies.get(proxyUrl);
                    if (existing) {
                        existing.score = Math.max(existing.score, 75);
                        existing.latency = res.latency;
                        existing.consecutiveFails = 0;
                    } else {
                        this.proxies.set(proxyUrl, {
                            url: proxyUrl,
                            score: 75,
                            latency: res.latency,
                            successCount: 1,
                            failCount: 0,
                            consecutiveFails: 0,
                            lastChecked: Date.now(),
                            lastSuccess: Date.now()
                        });
                    }
                }
            }));
        }

        // Clean dead entries (score <= 0)
        for (const [url, p] of this.proxies.entries()) {
            if (p.score <= 0 && p.consecutiveFails >= 4 && !p.isVip) {
                this.proxies.delete(url);
            }
        }

        this._savePool();
        this.isScanning = false;

        const best = this.getBestProxy();
        console.log(`[SmartProxyPool] Discovery complete. ${aliveCount} alive. Total in pool: ${this.proxies.size} (Best: ${best || 'None'})`);
    }

    _httpGet(urlStr) {
        return new Promise((resolve) => {
            const req = https.get(urlStr, { timeout: 6000 }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve(body));
            });
            req.on('error', () => resolve(null));
            req.on('timeout', () => { req.destroy(); resolve(null); });
        });
    }

    getStatus() {
        const total = this.proxies.size;
        const active = Array.from(this.proxies.values()).filter(p => p.score >= 30 && p.consecutiveFails < 2);
        const best = this.getBestProxy();
        const bestObj = best ? this.proxies.get(best) : null;

        return {
            enabled: this.enabled,
            total,
            activeCount: active.length,
            bestProxy: best,
            bestScore: bestObj ? bestObj.score : 0,
            bestLatency: bestObj ? `${bestObj.latency}ms` : 'N/A',
            isScanning: this.isScanning
        };
    }
}

module.exports = new SmartProxyPool();
