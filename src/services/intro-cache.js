/**
 * Cache em memória de resultados de varredura acústica de episódios recentes.
 * Resposta instantânea (0ms) para episódios já escaneados.
 */
class IntroCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  _getKey(mediaUrl) {
    if (!mediaUrl) return '';
    try {
      // Remove query parameters temporários de autenticação se houver
      const u = new URL(mediaUrl);
      return u.origin + u.pathname;
    } catch {
      return String(mediaUrl);
    }
  }

  get(mediaUrl) {
    const key = this._getKey(mediaUrl);
    if (!key || !this.cache.has(key)) return null;
    const item = this.cache.get(key);
    // Refresh LRU order
    this.cache.delete(key);
    this.cache.set(key, item);
    return item;
  }

  set(mediaUrl, result) {
    const key = this._getKey(mediaUrl);
    if (!key || !result) return;
    if (this.cache.size >= this.maxSize) {
      // Remove oldest key
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      ...result,
      cachedAt: Date.now(),
    });
  }

  clear() {
    this.cache.clear();
  }
}

module.exports = new IntroCache();
