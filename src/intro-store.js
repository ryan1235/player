const fs = require('fs');
const { atomicWriteFileSync } = require('./services/atomic-write');

class IntroStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.profiles = this._load();
    this.activeProfileId = null;
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      }
    } catch {}
    return {};
  }

  _persist() {
    try {
      atomicWriteFileSync(this.filePath, JSON.stringify(this.profiles, null, 2));
    } catch (err) {
      console.error('[intro-store] Falha ao persistir perfis de abertura:', err.message);
    }
  }

  saveProfile(profileData) {
    const id = profileData.id || `profile_${Date.now()}`;
    const entry = {
      id,
      title: profileData.title || 'Abertura Salva',
      duration: Number(profileData.duration) || 90,
      defaultStart: Number(profileData.defaultStart) || 0,
      signature: profileData.signature || [],
      sampleRate: profileData.sampleRate || 20,
      createdAt: profileData.createdAt || Date.now(),
      lastUsed: Date.now(),
    };
    this.profiles[id] = entry;
    this.activeProfileId = id;
    this._persist();
    return entry;
  }

  getActiveProfile() {
    if (this.activeProfileId && this.profiles[this.activeProfileId]) {
      return this.profiles[this.activeProfileId];
    }
    // Retorna o perfil mais recente
    const all = Object.values(this.profiles);
    if (all.length === 0) return null;
    all.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    return all[0];
  }

  getRecentProfiles(limit = 5) {
    const all = Object.values(this.profiles);
    all.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    return all.slice(0, limit);
  }

  setActiveProfileId(id) {
    if (this.profiles[id]) {
      this.activeProfileId = id;
      this.profiles[id].lastUsed = Date.now();
      this._persist();
      return true;
    }
    return false;
  }

  getProfile(id) {
    return this.profiles[id] || null;
  }

  listProfiles() {
    return Object.values(this.profiles).sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
  }

  deleteProfile(id) {
    if (this.profiles[id]) {
      delete this.profiles[id];
      if (this.activeProfileId === id) this.activeProfileId = null;
      this._persist();
      return true;
    }
    return false;
  }
}

module.exports = IntroStore;
