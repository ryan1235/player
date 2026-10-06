const logger = require('./logger');

const SKIPDB_BASE_URL = 'https://api.skipdb.tv/api/segments';

function formatImdbId(id) {
  if (!id) return null;
  const s = String(id).trim();
  return s.startsWith('tt') ? s : `tt${s}`;
}

class SkipDbService {
  constructor(settings) {
    this.settings = settings;
    this.cache = new Map();
  }

  async resolveImdbIdByTitle(title) {
    if (!title || typeof title !== 'string') return null;
    const clean = title.trim();
    if (!clean) return null;
    try {
      const url = `https://v3-cinemeta.strem.io/catalog/series/top/search=${encodeURIComponent(clean)}.json`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      const data = await res.json();
      const first = data?.metas?.[0];
      return first?.id || null;
    } catch {
      return null;
    }
  }

  async getSegments({ imdbId = null, title = null, season = 1, episode = 1, duration = null }) {
    const enabled = this.settings ? this.settings.get('skipIntroEnabled') !== false : true;
    if (!enabled) return null;

    let targetImdbId = formatImdbId(imdbId);
    if (!targetImdbId && title) {
      targetImdbId = await this.resolveImdbIdByTitle(title);
    }

    if (!targetImdbId) {
      return null;
    }

    const sNum = parseInt(season, 10) || 1;
    const eNum = parseInt(episode, 10) || 1;
    const cacheKey = `${targetImdbId}_s${sNum}_e${eNum}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      let queryUrl = `${SKIPDB_BASE_URL}?imdb_id=${encodeURIComponent(targetImdbId)}&season=${sNum}&episode=${eNum}`;
      if (duration && Number(duration) > 0) {
        queryUrl += `&duration=${Math.round(Number(duration))}`;
      }

      const res = await fetch(queryUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AuraPlayer/1.0.2',
        },
      });

      if (!res.ok) {
        logger.network(`[skipdb-service] HTTP ${res.status} para ${targetImdbId} S${sNum}E${eNum}`);
        return null;
      }

      const data = await res.json();
      const segs = data?.segments || {};

      const intro = segs.intro ? {
        start: segs.intro.start_ms / 1000,
        end: segs.intro.end_ms / 1000,
      } : null;

      const recap = segs.recap ? {
        start: segs.recap.start_ms / 1000,
        end: segs.recap.end_ms / 1000,
      } : null;

      const outro = segs.outro ? {
        start: segs.outro.start_ms / 1000,
        end: segs.outro.end_ms / 1000,
      } : null;

      const result = {
        imdbId: targetImdbId,
        season: sNum,
        episode: eNum,
        intro,
        recap,
        outro,
      };

      this.cache.set(cacheKey, result);

      if (intro || recap || outro) {
        logger.network(`[skipdb-service] Segmentos encontrados para ${targetImdbId} S${sNum}E${eNum}:`, {
          intro: intro ? `${intro.start.toFixed(1)}s - ${intro.end.toFixed(1)}s` : null,
          outro: outro ? `${outro.start.toFixed(1)}s - ${outro.end.toFixed(1)}s` : null,
        });
      }

      return result;
    } catch (err) {
      logger.network('[skipdb-service] Erro ao consultar SkipDB:', err.message);
      return null;
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

module.exports = {
  SkipDbService,
  formatImdbId,
};
