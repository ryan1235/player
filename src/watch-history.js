const fs = require('fs');
const { atomicWriteFileSync, atomicWriteFile } = require('./services/atomic-write');

class WatchHistory {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this._load();
    this._persistTimer = null;
    this._isPersisting = false;
    this._pendingPersist = false;
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch {
      return {};
    }
  }

  // Gravação assíncrona com debounce (1.5s): evita que o autosave de 8s durante a
  // reprodução bloqueie a thread principal do Electron com escrita síncrona em disco.
  _persist() {
    if (this._persistTimer) return;
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      this._flushAsync().catch(() => {});
    }, 1500);
  }

  async _flushAsync() {
    if (this._isPersisting) {
      this._pendingPersist = true;
      return;
    }
    this._isPersisting = true;
    try {
      await atomicWriteFile(this.filePath, JSON.stringify(this.data));
    } catch {
      // segue sem persistir se falhar
    } finally {
      this._isPersisting = false;
      if (this._pendingPersist) {
        this._pendingPersist = false;
        this._flushAsync().catch(() => {});
      }
    }
  }

  flushSync() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
    }
    try {
      atomicWriteFileSync(this.filePath, JSON.stringify(this.data));
    } catch {}
  }

  get(key) {
    return this.data[key] || null;
  }

  set(key, entry) {
    const prev = this.data[key] || {};
    this.data[key] = { ...prev, ...entry, updatedAt: Date.now() };
    this._persist();
  }

  removeSeriesMetadata(key, defaultTitle) {
    if (!this.data[key]) return;
    const item = this.data[key];
    delete item.seriesTitle;
    delete item.season;
    delete item.episode;
    delete item.imdbId;
    delete item.poster;
    if (defaultTitle) item.title = defaultTitle;
    this._persist();
  }

  clear(key) {
    delete this.data[key];
    this._persist();
  }

  getAll() {
    return { ...this.data };
  }
}

module.exports = WatchHistory;
