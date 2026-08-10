const fs = require('fs');

const DEFAULTS = {
  autoStartRenderer: false,
  preferredInterface: null,
  videoFitMode: 'original',
};

class Settings {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = { ...DEFAULTS, ...this._load() };
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
      // nao foi possivel gravar as configuracoes, segue sem persistir
    }
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this._persist();
  }

  getAll() {
    return { ...this.data };
  }
}

module.exports = Settings;
