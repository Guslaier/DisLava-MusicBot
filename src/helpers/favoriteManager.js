const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '../../data');
const filePath = path.join(dataDir, 'favorites.json');

class FavoriteManager {
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
                for (const [userId, tracks] of Object.entries(parsed)) {
                    this.cache.set(userId, tracks);
                }
            }
        } catch (err) {
            console.error('[FavoriteManager] Init error:', err.message);
        }
    }

    _save() {
        try {
            const obj = {};
            for (const [userId, tracks] of this.cache.entries()) {
                obj[userId] = tracks;
            }
            fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
        } catch (err) {
            console.error('[FavoriteManager] Save error:', err.message);
        }
    }

    getFavorites(userId) {
        return this.cache.get(userId) || [];
    }

    isFavorite(userId, track) {
        const list = this.getFavorites(userId);
        const id = track.identifier || track.uri;
        return list.some(item => (item.identifier && item.identifier === id) || item.uri === track.uri);
    }

    addFavorite(userId, track) {
        let list = this.cache.get(userId);
        if (!list) {
            list = [];
            this.cache.set(userId, list);
        }

        const id = track.identifier || track.uri;
        if (list.some(item => (item.identifier && item.identifier === id) || item.uri === track.uri)) {
            return false; // already exists
        }

        list.push({
            identifier: track.identifier || '',
            title: track.title || 'Unknown Title',
            author: track.author || 'Unknown Artist',
            uri: track.uri || '',
            length: track.length || 0,
            thumbnail: track.thumbnail || null,
            addedAt: Date.now()
        });

        this._save();
        return true;
    }

    removeFavorite(userId, identifierOrUri) {
        let list = this.cache.get(userId);
        if (!list || list.length === 0) return false;

        const initialLength = list.length;
        list = list.filter(item => item.identifier !== identifierOrUri && item.uri !== identifierOrUri);
        this.cache.set(userId, list);

        if (list.length !== initialLength) {
            this._save();
            return true;
        }
        return false;
    }
}

module.exports = new FavoriteManager();

