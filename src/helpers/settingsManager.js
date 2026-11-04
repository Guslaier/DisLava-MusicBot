const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '../../data');
const filePath = path.join(dataDir, 'guildSettings.json');

const DEFAULT_VOLUME = parseInt(process.env.DEFAULT_VOLUME, 10) || 100;

class SettingsManager {
    constructor() {
        this.cache = new Map();
        this._init();
    }

    _init() {
        try {
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            if (fs.existsSync(filePath)) {
                const raw = fs.readFileSync(filePath, 'utf8');
                const parsed = JSON.parse(raw);
                for (const [guildId, settings] of Object.entries(parsed)) {
                    this.cache.set(guildId, settings);
                }
            }
        } catch (err) {
            console.error('[SettingsManager] Init error:', err.message);
        }
    }

    _save() {
        try {
            const obj = {};
            for (const [guildId, settings] of this.cache.entries()) {
                obj[guildId] = settings;
            }
            fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
        } catch (err) {
            console.error('[SettingsManager] Save error:', err.message);
        }
    }

    getGuildSettings(guildId) {
        if (!guildId) return { volume: DEFAULT_VOLUME };
        let settings = this.cache.get(guildId);
        if (!settings) {
            settings = { volume: DEFAULT_VOLUME };
            this.cache.set(guildId, settings);
        }
        return settings;
    }

    getGuildVolume(guildId) {
        const settings = this.getGuildSettings(guildId);
        return typeof settings.volume === 'number' ? settings.volume : DEFAULT_VOLUME;
    }

    setGuildVolume(guildId, volume) {
        if (!guildId || typeof volume !== 'number' || isNaN(volume)) return DEFAULT_VOLUME;
        const boundedVolume = Math.min(150, Math.max(0, Math.round(volume)));
        const settings = this.getGuildSettings(guildId);
        settings.volume = boundedVolume;
        this.cache.set(guildId, settings);
        this._save();
        return boundedVolume;
    }

    getGuildAutoplay(guildId) {
        const settings = this.getGuildSettings(guildId);
        return Boolean(settings.autoplay);
    }

    setGuildAutoplay(guildId, autoplay) {
        if (!guildId) return false;
        const settings = this.getGuildSettings(guildId);
        settings.autoplay = Boolean(autoplay);
        this.cache.set(guildId, settings);
        this._save();
        return settings.autoplay;
    }
}

module.exports = new SettingsManager();

