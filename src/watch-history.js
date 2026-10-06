const fs = require('fs');
const { atomicWriteFileSync } = require('./services/atomic-write');

class WatchHistory {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this._load();
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch {
      return {};
    }
  }

  _persist() {
    try {
      atomicWriteFileSync(this.filePath, JSON.stringify(this.data));
    } catch {
      // nao foi possivel gravar o historico, segue sem persistir
    }
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
