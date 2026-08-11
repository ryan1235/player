const fs = require('fs');

const DEFAULTS = {
  autoStartRenderer: false,
  preferredInterface: null,
  videoFitMode: 'original',
  dlnaDiscoveryTimeout: 4000,
  defaultVolume: 100,
  autoPlayNext: false,
  autoReconnectCast: false,
  checkUpdatesAutomatically: false,
  // Sistema de Live (Configuracoes > Ao Vivo) — ver src/live/buffer-manager.js.
  // 'auto' e o padrao recomendado; os demais existem pra usuario avancado.
  liveBufferProfile: 'auto',
  liveCustomTargetSecs: 5,
  showLiveQualityLabel: true,
  showLiveEventToasts: true,
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
