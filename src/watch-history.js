const fs = require('fs');

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
      fs.writeFileSync(this.filePath, JSON.stringify(this.data));
    } catch {
      // nao foi possivel gravar o historico, segue sem persistir
    }
  }

  get(key) {
    return this.data[key] || null;
  }

  set(key, entry) {
    this.data[key] = { ...entry, updatedAt: Date.now() };
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
