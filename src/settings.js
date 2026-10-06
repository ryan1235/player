const fs = require('fs');
const { atomicWriteFileSync } = require('./services/atomic-write');

const DEFAULTS = {
  autoStartRenderer: false,
  preferredInterface: null,
  videoFitMode: 'original',
  videoQualityProfile: 'high',
  videoDeband: true,
  dlnaDiscoveryTimeout: 4000,
  dlnaFriendlyName: '',
  defaultVolume: 100,
  audioNightMode: false,
  audioDelaySecs: 0,
  audioPreset: 'flat',
  autoPlayNext: false,
  autoReconnectCast: false,
  checkUpdatesAutomatically: false,
  // Sistema de Live (Configuracoes > Ao Vivo) — ver src/live/buffer-manager.js.
  // 'auto' e o padrao recomendado; os demais existem pra usuario avancado.
  liveBufferProfile: 'auto',
  liveCustomTargetSecs: 5,
  showLiveQualityLabel: true,
  showLiveEventToasts: true,
  // Sistema de Legendas Online e Rastreamento de Sessão
  subdlApiKey: '',
  openSubtitlesApiKey: '',
  subtitlesLanguage: 'pob',
  subtitlesAutoDownloadNext: true,
  subtitlesMode: 'signs_priority',
  subtitlesQuota: null,
  recentSeries: [],
  // Pular Abertura (SkipDB)
  skipIntroEnabled: true,
  skipIntroAuto: false,
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
      atomicWriteFileSync(this.filePath, JSON.stringify(this.data));
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
