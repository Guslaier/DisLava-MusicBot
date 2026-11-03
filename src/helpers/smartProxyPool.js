const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const https = require('https');
const http = require('http');
const execAsync = promisify(exec);

class SmartProxyPool {
    constructor() {
        this.dataPath = path.resolve(__dirname, '../../data/proxy_pool.json');
        this.blacklistPath = path.resolve(__dirname, '../../data/proxy_blacklist.json');
        this.binPath = path.resolve(__dirname, process.platform === 'win32' ? '../../bin/yt-dlp.exe' : '../../bin/yt-dlp');
        
        this.proxies = new Map(); // url -> proxyObject
        this.blacklist = new Map(); // url -> { url, reason, blacklistedAt, expiresAt }
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

        this._loadBlacklist();
        this._loadPool();

        // VIP/Configured Proxy from .env (always given priority if healthy and not blacklisted)
        if (process.env.PROXY_URL) {
            const vipUrl = process.env.PROXY_URL.trim();
            if (!this.isBlacklisted(vipUrl) && !this.proxies.has(vipUrl)) {
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

        console.log(`[SmartProxyPool] Loaded ${this.proxies.size} proxies, ${this.blacklist.size} blacklisted.`);

        // Initial background scan/validation
        setTimeout(() => {
            this.refreshPool(false).catch(() => {});
        }, 2000);

        // Relaxed health check every 3 minutes
        this._healthInterval = setInterval(() => {
            this.checkTopProxies().catch(() => {});
        }, 3 * 60 * 1000);
        this._healthInterval.unref();

        // Auto-scrape fresh regional proxies every 15 minutes
        this._scrapeInterval = setInterval(() => {
            this.refreshPool(false).catch(() => {});
        }, 15 * 60 * 1000);
        this._scrapeInterval.unref();
    }

    _loadBlacklist() {
        try {
            if (fs.existsSync(this.blacklistPath)) {
                const data = JSON.parse(fs.readFileSync(this.blacklistPath, 'utf-8'));
                if (Array.isArray(data)) {
                    const now = Date.now();
                    for (const item of data) {
                        if (item && item.url && item.expiresAt > now) {
                            this.blacklist.set(item.url, item);
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('[SmartProxyPool] Notice loading blacklist:', err.message);
        }
    }

    _saveBlacklist() {
        try {
            const dir = path.dirname(this.blacklistPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const list = Array.from(this.blacklist.values());
            fs.writeFileSync(this.blacklistPath, JSON.stringify(list, null, 2), 'utf-8');
        } catch (err) {
            console.error('[SmartProxyPool] Failed to save blacklist:', err.message);
        }
    }

    _loadPool() {
        try {
            if (fs.existsSync(this.dataPath)) {
                const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
                if (Array.isArray(data)) {
                    for (const p of data) {
                        if (p && p.url && !this.isBlacklisted(p.url)) {
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
     * Checks if a proxy URL is currently blacklisted.
     * Auto-cleans expired entries.
     */
    isBlacklisted(proxyUrl) {
        if (!proxyUrl) return false;
        const item = this.blacklist.get(proxyUrl);
        if (!item) return false;

        if (Date.now() > item.expiresAt) {
            this.blacklist.delete(proxyUrl);
            this._saveBlacklist();
            return false;
        }
        return true;
    }

    /**
     * Blacklists a proxy that triggered a YouTube anti-bot or 429 block.
     * Removes it from active pool immediately.
     */
    blacklistProxy(proxyUrl, reason = 'YouTube Anti-Bot Block', durationMs = 6 * 60 * 60 * 1000) {
        if (!proxyUrl) return;

        const cleanReason = (reason || 'YouTube Anti-Bot Block').slice(0, 120);
        this.blacklist.set(proxyUrl, {
            url: proxyUrl,
            reason: cleanReason,
            blacklistedAt: Date.now(),
            expiresAt: Date.now() + durationMs
        });

        // Remove from active pool
        this.proxies.delete(proxyUrl);

        this._saveBlacklist();
        this._savePool();

        console.warn(`[SmartProxyPool] 🚫 Blacklisted (${proxyUrl}) for ${Math.round(durationMs / 3600000)}h - ${cleanReason}`);
    }

    /**
     * Unblacklists a proxy URL manually.
     */
    unblacklist(proxyUrl) {
        if (!proxyUrl) return false;
        const exists = this.blacklist.delete(proxyUrl);
        if (exists) this._saveBlacklist();
        return exists;
    }

    /**
     * Clears all entries in the blacklist.
     */
    clearBlacklist() {
        const count = this.blacklist.size;
        this.blacklist.clear();
        this._saveBlacklist();
        return count;
    }

    /**
     * Returns the highest-ranked proxy URL currently alive and not blacklisted.
     */
    getBestProxy() {
        if (!this.enabled || this.proxies.size === 0) return null;

        // Normal candidates: score >= 15, consecutive fails < 3, not blacklisted
        const candidates = Array.from(this.proxies.values()).filter(p => {
            return !this.isBlacklisted(p.url) && p.score >= 15 && p.consecutiveFails < 3;
        });

        if (candidates.length > 0) {
            candidates.sort((a, b) => {
                // Verified YouTube working proxies prioritized
                if (b.youtubeVerified !== a.youtubeVerified) {
                    return (b.youtubeVerified ? 1 : 0) - (a.youtubeVerified ? 1 : 0);
                }
                if (b.score !== a.score) {
                    return b.score - a.score;
                }
                return (a.latency || 9999) - (b.latency || 9999);
            });
            return candidates[0].url;
        }

        // Emergency fallback: Trigger auto-refresh immediately
        if (!this.isScanning) {
            this.refreshPool(true).catch(() => {});
        }

        // Best effort: Return candidate with lowest consecutiveFails and highest score
        const allList = Array.from(this.proxies.values()).filter(p => !this.isBlacklisted(p.url));
        if (allList.length === 0) return null;

        allList.sort((a, b) => {
            if (a.consecutiveFails !== b.consecutiveFails) {
                return a.consecutiveFails - b.consecutiveFails;
            }
            return (b.score || 0) - (a.score || 0);
        });

        return allList[0].consecutiveFails < 5 ? allList[0].url : null;
    }

    /**
     * Report successful usage of a proxy.
     */
    reportSuccess(proxyUrl, latencyMs = 0) {
        if (!proxyUrl || this.isBlacklisted(proxyUrl)) return;
        const p = this.proxies.get(proxyUrl);
        if (p) {
            p.score = Math.min(100, (p.score || 50) + 15);
            p.consecutiveFails = 0;
            p.successCount = (p.successCount || 0) + 1;
            p.lastSuccess = Date.now();
            p.lastChecked = Date.now();
            p.youtubeVerified = true;
            if (latencyMs > 0) {
                p.latency = p.latency ? Math.round((p.latency * 0.7) + (latencyMs * 0.3)) : latencyMs;
            }
            this._savePool();
        }
    }

    /**
     * Report failed request through a proxy.
     * Auto-blacklists if reason indicates YouTube bot ban or rate-limit.
     */
    reportFailure(proxyUrl, reason = '') {
        if (!proxyUrl) return;

        // Auto-blacklist on anti-bot detection
        const isBotBlock = /Sign in to confirm|bot|unusual traffic|429|captcha|blocked/i.test(reason);
        if (isBotBlock) {
            this.blacklistProxy(proxyUrl, reason, 6 * 60 * 60 * 1000);
            return;
        }

        const p = this.proxies.get(proxyUrl);
        if (p) {
            p.consecutiveFails = (p.consecutiveFails || 0) + 1;
            p.failCount = (p.failCount || 0) + 1;
            p.score = Math.max(0, (p.score || 50) - 10);
            p.lastChecked = Date.now();
            p.lastError = reason;

            if (p.consecutiveFails >= 3) {
                console.warn(`[SmartProxyPool] Proxy demoted (${p.url}) [Score: ${p.score}, Fails: ${p.consecutiveFails}] - ${reason}`);
            }
            this._savePool();
        }
    }

    /**
     * Tests a proxy specifically against YouTube to verify bypass capability.
     * Returns { ok: boolean, isBotBlock: boolean, reason: string, latency: number }
     */
    async testProxyYouTube(proxyUrl, timeoutMs = 7000) {
        const start = Date.now();
        try {
            const cmd = `"${this.binPath}" --no-warnings --socket-timeout 5 --no-playlist -g "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --proxy "${proxyUrl}"`;
            const { stdout } = await execAsync(cmd, { timeout: timeoutMs });
            const latency = Date.now() - start;
            if (stdout && stdout.trim().startsWith('http')) {
                return { ok: true, isBotBlock: false, latency };
            }
            return { ok: false, isBotBlock: false, reason: 'Invalid stream URL' };
        } catch (err) {
            const stderr = (err.stderr || err.stdout || err.message || '').toString();
            const isBotBlock = /Sign in to confirm|bot|unusual traffic|429|captcha|blocked/i.test(stderr);
            const reason = isBotBlock ? 'YouTube Anti-Bot Block' : (stderr.split('\n')[0].slice(0, 80) || err.message);

            if (isBotBlock) {
                this.blacklistProxy(proxyUrl, reason, 6 * 60 * 60 * 1000);
            }
            return { ok: false, isBotBlock, reason };
        }
    }

    /**
     * Probes a proxy using Google 204 endpoint with a 6-second timeout (Stage 1 Filter).
     */
    async probeProxy(proxyUrl) {
        const start = Date.now();
        try {
            const { stdout } = await execAsync(
                `curl -s -o /dev/null -w "%{http_code}" --connect-timeout 6 -m 8 -x "${proxyUrl}" http://www.google.com/generate_204`
            );
            const code = parseInt(stdout.trim(), 10);
            const latency = Date.now() - start;
            if (code === 204 || code === 200 || code === 301 || code === 302) {
                return { ok: true, latency };
            }
            return { ok: false, error: `HTTP ${code}` };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    }

    /**
     * Checks proxies periodically, skipping those that were successfully used recently.
     */
    async checkTopProxies() {
        if (this.proxies.size === 0) return;

        const list = Array.from(this.proxies.values())
            .filter(p => !this.isBlacklisted(p.url))
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

        for (const p of list) {
            if (Date.now() - (p.lastSuccess || 0) < 120000) {
                continue;
            }

            const res = await this.probeProxy(p.url);
            if (res.ok) {
                this.reportSuccess(p.url, res.latency);
            } else {
                this.reportFailure(p.url, 'Health check failed');
            }
        }
    }

    /**
     * Scrapes public APIs for fresh regional proxies, benchmarks with 2-stage verification.
     */
    async refreshPool(force = false) {
        if (this.isScanning) return;
        if (!force && Date.now() - this.lastScanTime < 5 * 60 * 1000) return;

        this.isScanning = true;
        this.lastScanTime = Date.now();
        console.log('[SmartProxyPool] Auto-discovering fresh regional proxies (TH, SG, MY, JP, HK)...');

        const candidates = new Set();

        try {
            // Source 1: Proxyscrape HTTP (Regional Asian nodes)
            const rawListHttp = await this._httpGet('https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=3500&country=TH,SG,MY,JP,HK');
            if (rawListHttp) {
                rawListHttp.split(/\r?\n/).forEach(line => {
                    const clean = line.trim();
                    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5}$/.test(clean)) {
                        const url = `http://${clean}`;
                        if (!this.isBlacklisted(url)) candidates.add(url);
                    }
                });
            }
        } catch {}

        try {
            // Source 2: Geonode API (TH, SG)
            const jsonText = await this._httpGet('https://proxylist.geonode.com/api/proxy-list?country=TH,SG&limit=30&page=1&sort_by=lastChecked&sort_type=desc');
            if (jsonText) {
                const parsed = JSON.parse(jsonText);
                if (parsed && Array.isArray(parsed.data)) {
                    for (const item of parsed.data) {
                        if (item.ip && item.port) {
                            const url = `http://${item.ip}:${item.port}`;
                            if (!this.isBlacklisted(url)) candidates.add(url);
                        }
                    }
                }
            }
        } catch {}

        try {
            // Source 3: Proxyscrape SOCKS5 (Regional Asian nodes)
            const rawListSocks = await this._httpGet('https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=3500&country=TH,SG,MY,JP,HK');
            if (rawListSocks) {
                rawListSocks.split(/\r?\n/).forEach(line => {
                    const clean = line.trim();
                    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5}$/.test(clean)) {
                        const url = `socks5://${clean}`;
                        if (!this.isBlacklisted(url)) candidates.add(url);
                    }
                });
            }
        } catch {}

        console.log(`[SmartProxyPool] Found ${candidates.size} potential candidate proxies. Benchmarking...`);

        // Stage 1: Fast HTTP connectivity check in parallel batches
        const candidateList = Array.from(candidates).slice(0, 25);
        const stage1Passed = [];

        for (let i = 0; i < candidateList.length; i += 5) {
            const batch = candidateList.slice(i, i + 5);
            await Promise.all(batch.map(async (proxyUrl) => {
                const res = await this.probeProxy(proxyUrl);
                if (res.ok) {
                    stage1Passed.push({ url: proxyUrl, latency: res.latency });
                }
            }));
        }

        // Stage 2: Verify YouTube bypass on top 5 candidates
        stage1Passed.sort((a, b) => a.latency - b.latency);
        const topToVerify = stage1Passed.slice(0, 5);
        let aliveCount = 0;

        for (const item of topToVerify) {
            const ytRes = await this.testProxyYouTube(item.url);
            if (ytRes.ok) {
                aliveCount++;
                const existing = this.proxies.get(item.url);
                if (existing) {
                    existing.score = 95;
                    existing.latency = ytRes.latency || item.latency;
                    existing.consecutiveFails = 0;
                    existing.youtubeVerified = true;
                    existing.lastSuccess = Date.now();
                    existing.lastChecked = Date.now();
                } else {
                    this.proxies.set(item.url, {
                        url: item.url,
                        score: 95,
                        latency: ytRes.latency || item.latency,
                        successCount: 1,
                        failCount: 0,
                        consecutiveFails: 0,
                        youtubeVerified: true,
                        lastChecked: Date.now(),
                        lastSuccess: Date.now()
                    });
                }
            } else if (!ytRes.isBotBlock) {
                // Not bot blocked, but network/stream issue: store with moderate score
                aliveCount++;
                this.proxies.set(item.url, {
                    url: item.url,
                    score: 50,
                    latency: item.latency,
                    successCount: 0,
                    failCount: 1,
                    consecutiveFails: 1,
                    youtubeVerified: false,
                    lastChecked: Date.now(),
                    lastSuccess: 0
                });
            }
        }

        // Add remaining Stage 1 proxies with neutral score (if pool is sparse)
        for (const item of stage1Passed.slice(5)) {
            if (!this.proxies.has(item.url) && !this.isBlacklisted(item.url)) {
                this.proxies.set(item.url, {
                    url: item.url,
                    score: 60,
                    latency: item.latency,
                    successCount: 0,
                    failCount: 0,
                    consecutiveFails: 0,
                    youtubeVerified: false,
                    lastChecked: Date.now(),
                    lastSuccess: 0
                });
            }
        }

        // Clean obsolete dead entries
        for (const [url, p] of this.proxies.entries()) {
            if (this.isBlacklisted(url) || (p.score <= 0 && p.consecutiveFails >= 6 && !p.isVip)) {
                this.proxies.delete(url);
            }
        }

        this._savePool();
        this.isScanning = false;

        const best = this.getBestProxy();
        console.log(`[SmartProxyPool] Discovery complete. ${aliveCount} verified alive. Total in pool: ${this.proxies.size}, Blacklisted: ${this.blacklist.size} (Best: ${best || 'None'})`);
    }

    _httpGet(urlStr) {
        return new Promise((resolve) => {
            const client = urlStr.startsWith('https') ? https : http;
            const req = client.get(urlStr, { timeout: 6000 }, (res) => {
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
        const active = Array.from(this.proxies.values()).filter(p => !this.isBlacklisted(p.url) && p.score >= 15 && p.consecutiveFails < 3);
        const best = this.getBestProxy();
        const bestObj = best ? this.proxies.get(best) : null;

        return {
            enabled: this.enabled,
            total,
            activeCount: active.length,
            blacklistCount: this.blacklist.size,
            bestProxy: best,
            bestScore: bestObj ? bestObj.score : 0,
            bestLatency: bestObj ? `${bestObj.latency}ms` : 'N/A',
            isYoutubeVerified: bestObj ? !!bestObj.youtubeVerified : false,
            isScanning: this.isScanning,
            blacklisted: Array.from(this.blacklist.values())
        };
    }
}

module.exports = new SmartProxyPool();
