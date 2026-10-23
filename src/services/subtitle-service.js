const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const logger = require('./logger');
const { prioritizeSubtitles, classifySubtitle, SUBTITLE_TYPES } = require('./subtitle-classifier');

const SUBDL_API_URL = 'https://api.subdl.com/api/v1/subtitles';
const OPENSUBTITLES_API_URL = 'https://api.opensubtitles.com/api/v1/subtitles';
const OPENSUBTITLES_DOWNLOAD_URL = 'https://api.opensubtitles.com/api/v1/download';
const CINEMETA_URL = 'https://v3-cinemeta.strem.io';

const MAX_SUBDL_DAILY_DOWNLOADS = 50;
const MAX_OPENSUBTITLES_DAILY_DOWNLOADS = 20;

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sanitizeFilename(str) {
  return String(str || '').replace(/[\\/:*?"<>|]/g, '_').trim();
}

function isGarbageTitle(str) {
  if (!str || typeof str !== 'string') return true;
  const s = str.trim();
  if (!s || s.length < 2) return true;
  if (/^https?:\/\//i.test(s)) return true;
  if (/[?&=]/.test(s)) return true;
  if (/content_auth|content_license|_media\.mp4/i.test(s)) return true;
  if (/^[a-f0-9_\-]{20,}$/i.test(s)) return true;
  if (/^[a-f0-9]{32}/i.test(s)) return true;
  if (/^dlna-video$/i.test(s)) return true;
  return false;
}

function extractSrtFromZip(zipBuffer) {
  try {
    let offset = 0;
    while (offset < zipBuffer.length - 30) {
      if (zipBuffer.readUInt32LE(offset) !== 0x04034b50) {
        offset++;
        continue;
      }
      const compression = zipBuffer.readUInt16LE(offset + 8);
      const compSize = zipBuffer.readUInt32LE(offset + 18);
      const nameLen = zipBuffer.readUInt16LE(offset + 26);
      const extraLen = zipBuffer.readUInt16LE(offset + 28);
      const fileName = zipBuffer.slice(offset + 30, offset + 30 + nameLen).toString('utf8');
      const dataOffset = offset + 30 + nameLen + extraLen;
      const compData = zipBuffer.slice(dataOffset, dataOffset + compSize);

      if (/\.(srt|vtt|ass)$/i.test(fileName)) {
        if (compression === 0) {
          return { fileName, content: compData };
        } else if (compression === 8) {
          const decompressed = zlib.inflateRawSync(compData);
          return { fileName, content: decompressed };
        }
      }
      offset = dataOffset + compSize;
    }
  } catch (err) {
    logger.error('[subtitle-service] erro ao descompactar zip:', err.message);
  }
  return null;
}

function guessMediaInfo(name) {
  if (!name || typeof name !== 'string') return null;
  if (isGarbageTitle(name)) return null;

  const clean = name.replace(/\.[a-z0-9]{2,4}$/i, '');
  if (isGarbageTitle(clean)) return null;

  const seMatch = /(.*?)[ ._\-]+(?:s(\d{1,2})[ ._\-]*e(\d{1,3})|(\d{1,2})x(\d{1,3}))/i.exec(clean);
  if (seMatch) {
    const rawTitle = (seMatch[1] || '').replace(/[\._\-]/g, ' ').trim();
    if (isGarbageTitle(rawTitle)) return null;
    const season = parseInt(seMatch[2] || seMatch[4], 10);
    const episode = parseInt(seMatch[3] || seMatch[5], 10);
    return { title: rawTitle, season, episode };
  }

  const epMatch = /(.*?)[ ._\-]+(?:ep|e|episodio)[ ._\-]*(\d{1,3})/i.exec(clean);
  if (epMatch) {
    const rawTitle = (epMatch[1] || '').replace(/[\._\-]/g, ' ').trim();
    if (isGarbageTitle(rawTitle)) return null;
    const episode = parseInt(epMatch[2], 10);
    return { title: rawTitle, season: 1, episode };
  }
  return null;
}

class SubtitleService {
  constructor(settings, cacheDir, player) {
    this.settings = settings;
    this.cacheDir = cacheDir;
    this.player = player;
    this.activeSeries = null;
    this.lastLoadedTarget = null;

    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    } catch {}

    // Limpa quaisquer séries com hashes inválidos salvas anteriormente
    const rawRecent = this.settings.get('recentSeries') || [];
    const sanitizedRecent = rawRecent.filter((s) => s && s.title && !isGarbageTitle(s.title));
    if (rawRecent.length !== sanitizedRecent.length) {
      this.settings.set('recentSeries', sanitizedRecent);
    }

    this._ensureQuotaReset();
  }

  _ensureQuotaReset() {
    const today = getTodayString();
    let quota = this.settings.get('subtitlesQuota');
    if (!quota || quota.date !== today) {
      quota = {
        date: today,
        subdlDownloads: 0,
        openSubtitlesDownloads: 0,
      };
      this.settings.set('subtitlesQuota', quota);
    }
    return quota;
  }

  getQuotaStatus() {
    const quota = this._ensureQuotaReset();
    return {
      date: quota.date,
      subdl: {
        used: quota.subdlDownloads,
        max: MAX_SUBDL_DAILY_DOWNLOADS,
        remaining: Math.max(0, MAX_SUBDL_DAILY_DOWNLOADS - quota.subdlDownloads),
      },
      openSubtitles: {
        used: quota.openSubtitlesDownloads,
        max: MAX_OPENSUBTITLES_DAILY_DOWNLOADS,
        remaining: Math.max(0, MAX_OPENSUBTITLES_DAILY_DOWNLOADS - quota.openSubtitlesDownloads),
      },
    };
  }

  _incrementQuota(provider) {
    const quota = this._ensureQuotaReset();
    if (provider === 'subdl') {
      quota.subdlDownloads = (quota.subdlDownloads || 0) + 1;
    } else if (provider === 'opensubtitles') {
      quota.openSubtitlesDownloads = (quota.openSubtitlesDownloads || 0) + 1;
    }
    this.settings.set('subtitlesQuota', quota);
  }

  getRecentSeries() {
    const list = this.settings.get('recentSeries') || [];
    return list.filter((s) => s && s.title && !isGarbageTitle(s.title));
  }

  _saveRecentSeries(title, season, episode, imdbId = null) {
    if (isGarbageTitle(title)) return;
    let list = this.getRecentSeries().filter((s) => s.title.toLowerCase() !== title.toLowerCase());
    list.unshift({
      title,
      season: Number(season) || 1,
      episode: Number(episode) || 1,
      imdbId: imdbId || null,
      lastUsed: Date.now(),
    });
    if (list.length > 6) list = list.slice(0, 6);
    this.settings.set('recentSeries', list);
  }

  bindSeries(title, season = 1, episode = 1, imdbId = null) {
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle || isGarbageTitle(cleanTitle)) {
      this.activeSeries = null;
      return null;
    }
    this.activeSeries = {
      title: cleanTitle,
      season: Math.max(1, parseInt(season, 10) || 1),
      currentEpisode: Math.max(1, parseInt(episode, 10) || 1),
      imdbId: imdbId || null,
      boundAt: Date.now(),
    };
    this._saveRecentSeries(cleanTitle, this.activeSeries.season, this.activeSeries.currentEpisode, imdbId);
    logger.network(`[subtitle-service] Série vinculada: "${this.activeSeries.title}" S${this.activeSeries.season}E${this.activeSeries.currentEpisode}${imdbId ? ` [${imdbId}]` : ''}`);
    return this.activeSeries;
  }

  unbindSeries() {
    this.activeSeries = null;
    this.lastLoadedTarget = null;
  }

  getActiveSeries() {
    return this.activeSeries ? { ...this.activeSeries } : null;
  }

  getState() {
    return {
      activeSeries: this.getActiveSeries(),
      recentSeries: this.getRecentSeries(),
      quota: this.getQuotaStatus(),
      autoDownloadNext: !!this.settings.get('subtitlesAutoDownloadNext'),
      subdlConfigured: !!(this.settings.get('subdlApiKey') || '').trim(),
      openSubtitlesConfigured: !!(this.settings.get('openSubtitlesApiKey') || '').trim(),
      language: this.settings.get('subtitlesLanguage') || 'pob',
      subtitlesMode: this.settings.get('subtitlesMode') || 'signs_priority',
    };
  }

  // Busca no catálogo Cinemeta e TVMaze (bilingue: títulos em inglês, português e original)
  async searchCatalog(query) {
    const q = String(query || '').trim();
    if (!q || isGarbageTitle(q)) return [];

    try {
      const [seriesRes, movieRes, tvRes] = await Promise.all([
        fetch(`${CINEMETA_URL}/catalog/series/top/search=${encodeURIComponent(q)}.json`, { headers: { Accept: 'application/json' } })
          .then((r) => r.json()).catch(() => ({ metas: [] })),
        fetch(`${CINEMETA_URL}/catalog/movie/top/search=${encodeURIComponent(q)}.json`, { headers: { Accept: 'application/json' } })
          .then((r) => r.json()).catch(() => ({ metas: [] })),
        fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } })
          .then((r) => r.json()).catch(() => []),
      ]);

      const tvMap = new Map();
      if (Array.isArray(tvRes)) {
        for (const item of tvRes) {
          if (item.show?.externals?.imdb) {
            tvMap.set(item.show.externals.imdb, item.show);
          }
        }
      }

      const seriesResults = (seriesRes.metas || []).slice(0, 8).map((m) => {
        const tvShow = tvMap.get(m.id);
        return {
          id: m.id,
          name: m.name,
          altName: tvShow && tvShow.name !== m.name ? tvShow.name : null,
          year: m.year || '',
          poster: m.poster || (tvShow?.image?.medium || null),
          type: 'series',
        };
      });

      // Se achou pouca série, busca filme também
      if (seriesResults.length < 5 && Array.isArray(movieRes.metas)) {
        const movieResults = movieRes.metas.slice(0, 4).map((m) => ({
          id: m.id,
          name: m.name,
          altName: null,
          year: m.year || '',
          poster: m.poster || null,
          type: 'movie',
        }));
        seriesResults.push(...movieResults);
      }

      // Adiciona séries relevantes do TVMaze que não vieram do Cinemeta
      if (Array.isArray(tvRes)) {
        for (const item of tvRes.slice(0, 4)) {
          const imdb = item.show?.externals?.imdb;
          if (imdb && !seriesResults.some((s) => s.id === imdb)) {
            seriesResults.push({
              id: imdb,
              name: item.show.name,
              altName: null,
              year: item.show.premiered ? item.show.premiered.slice(0, 4) : '',
              poster: item.show.image?.medium || null,
              type: 'series',
            });
          }
        }
      }

      return seriesResults;
    } catch (err) {
      logger.network('[subtitle-service] erro na busca do catálogo:', err.message);
      return [];
    }
  }

  // Busca nomes alternativos (PT-BR, original, inglês) via TVMaze
  async getSeriesAliases(imdbId) {
    if (!imdbId) return null;
    const cleanId = String(imdbId).startsWith('tt') ? imdbId : `tt${imdbId}`;
    try {
      const lookupRes = await fetch(`https://api.tvmaze.com/lookup/shows?imdb=${cleanId}`, {
        headers: { Accept: 'application/json' },
      });
      if (!lookupRes.ok) return null;
      const show = await lookupRes.json();
      const akasRes = await fetch(`https://api.tvmaze.com/shows/${show.id}/akas`, {
        headers: { Accept: 'application/json' },
      }).catch(() => null);

      let ptTitle = null;
      const otherAliases = [];

      if (akasRes && akasRes.ok) {
        const akas = await akasRes.json();
        for (const a of akas) {
          if (!a || !a.name) continue;
          const code = a.country?.code;
          if (code === 'BR' || code === 'PT') {
            if (!ptTitle) ptTitle = a.name;
          } else if (!otherAliases.includes(a.name) && a.name !== show.name) {
            otherAliases.push(a.name);
          }
        }
      }

      return {
        originalName: show.name || null,
        ptTitle,
        aliases: [ptTitle, show.name, ...otherAliases].filter(Boolean),
      };
    } catch {
      return null;
    }
  }

  // Detalhes de temporadas e episódios do catálogo com títulos bilíngues
  async getCatalogDetails(id, type = 'series') {
    if (!id) return null;
    try {
      const url = `https://v3-cinemeta.strem.io/meta/${type}/${encodeURIComponent(id)}.json`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      const data = await res.json();
      const meta = data.meta;
      if (!meta) return null;

      const seasonsMap = {};
      if (Array.isArray(meta.videos)) {
        for (const v of meta.videos) {
          const s = v.season != null ? Number(v.season) : 1;
          if (!seasonsMap[s]) seasonsMap[s] = [];
          seasonsMap[s].push({
            episode: v.episode != null ? Number(v.episode) : v.number || 1,
            title: v.title || v.name || `Episódio ${v.episode || 1}`,
          });
        }
      }

      const seasons = Object.keys(seasonsMap).map(Number).sort((a, b) => a - b);
      for (const s of seasons) {
        seasonsMap[s].sort((a, b) => a.episode - b.episode);
      }

      let ptTitle = null;
      let originalTitle = null;
      let aliases = [];

      if (type === 'series') {
        const aliasData = await this.getSeriesAliases(meta.id).catch(() => null);
        if (aliasData) {
          ptTitle = aliasData.ptTitle || null;
          originalTitle = aliasData.originalName && aliasData.originalName !== meta.name ? aliasData.originalName : null;
          aliases = aliasData.aliases || [];
        }
      }

      return {
        id: meta.id,
        name: meta.name,
        ptTitle,
        originalTitle,
        aliases,
        year: meta.year || '',
        poster: meta.poster || null,
        type: meta.type || type,
        description: meta.description || '',
        seasons,
        episodesBySeason: seasonsMap,
      };
    } catch (err) {
      logger.network('[subtitle-service] erro ao obter detalhes do catálogo:', err.message);
      return null;
    }
  }

  getCachePath(seriesTitle, season, episode) {
    const folder = path.join(this.cacheDir, sanitizeFilename(seriesTitle));
    const filename = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}.srt`;
    return path.join(folder, filename);
  }

  getCachedSubtitle(seriesTitle, season, episode) {
    const targetPath = this.getCachePath(seriesTitle, season, episode);
    if (fs.existsSync(targetPath)) {
      return targetPath;
    }
    return null;
  }

  clearCache() {
    try {
      if (fs.existsSync(this.cacheDir)) {
        fs.rmSync(this.cacheDir, { recursive: true, force: true });
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
      return true;
    } catch (err) {
      logger.error('[subtitle-service] erro ao limpar cache:', err.message);
      return false;
    }
  }

  async searchSubtitles({ query, imdbId, season, episode, language, aliases = [] }) {
    const results = [];
    const lang = language || this.settings.get('subtitlesLanguage') || 'pob';
    const subdlKey = (this.settings.get('subdlApiKey') || '').trim();
    const osKey = (this.settings.get('openSubtitlesApiKey') || '').trim();

    // Se aliases não foram passados mas temos imdbId, busca nomes alternativos (PT / Original / Inglês)
    let searchAliases = Array.isArray(aliases) ? [...aliases] : [];
    if (searchAliases.length === 0 && imdbId && season != null) {
      const aliasData = await this.getSeriesAliases(imdbId).catch(() => null);
      if (aliasData && Array.isArray(aliasData.aliases)) {
        searchAliases = aliasData.aliases;
      }
    }

    // 1. Tenta OpenSubtitles se configurado
    if (osKey) {
      try {
        const osResults = await this._searchOpenSubtitles(query, imdbId, season, episode, lang, osKey, searchAliases);
        results.push(...osResults);
      } catch (err) {
        logger.network('[subtitle-service] OpenSubtitles search falhou:', err.message);
      }
    }

    // 2. Tenta SubDL se configurado
    if (subdlKey) {
      try {
        const subdlResults = await this._searchSubdl(query, imdbId, season, episode, lang, subdlKey, searchAliases);
        results.push(...subdlResults);
      } catch (err) {
        logger.network('[subtitle-service] SubDL search falhou:', err.message);
      }
    }

    return prioritizeSubtitles(results, { preferredType: SUBTITLE_TYPES.SIGNS_ONLY });
  }

  async _searchSubdl(query, imdbId, season, episode, language, apiKey, aliases = []) {
    const subdlLangs = language === 'pob' ? 'PT-BR,PT,Portuguese' : language.toUpperCase();
    let subtitles = [];

    // 1. Tenta com imdb_id
    if (imdbId) {
      try {
        const params = new URLSearchParams({
          api_key: apiKey,
          languages: subdlLangs,
          subs_per_page: '20',
          imdb_id: imdbId,
        });
        if (season != null && episode != null) {
          params.append('type', 'tv');
          params.append('season_number', String(season));
          params.append('episode_number', String(episode));
        }
        const res = await fetch(`${SUBDL_API_URL}?${params.toString()}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status && Array.isArray(data.subtitles) && data.subtitles.length > 0) {
            subtitles = data.subtitles;
          }
        }
      } catch (err) {
        logger.network('[subtitle-service] SubDL imdb_id falhou:', err.message);
      }
    }

    // 2. Se não achou com imdb_id, tenta com film_name (query ou aliases)
    if (subtitles.length === 0 && (query || (aliases && aliases.length > 0))) {
      const candidates = [query, ...(aliases || [])].filter(Boolean);
      for (const cand of candidates.slice(0, 3)) {
        const cleanCand = cand.split(/[:\-–]/)[0].trim();
        if (!cleanCand) continue;
        try {
          const params = new URLSearchParams({
            api_key: apiKey,
            languages: subdlLangs,
            subs_per_page: '20',
            film_name: cleanCand,
          });
          if (season != null && episode != null) {
            params.append('type', 'tv');
            params.append('season_number', String(season));
            params.append('episode_number', String(episode));
          }
          const res = await fetch(`${SUBDL_API_URL}?${params.toString()}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.status && Array.isArray(data.subtitles) && data.subtitles.length > 0) {
              subtitles = data.subtitles;
              break;
            }
          }
        } catch {}
      }
    }

    return subtitles.map((item, idx) => ({
      id: `subdl_${item.url || idx}`,
      provider: 'subdl',
      title: item.release_name || item.name || query || 'SubDL Legenda',
      release: item.release_name || item.name || '',
      lang: item.lang || 'PT-BR',
      downloads: item.download_count || 0,
      rating: item.rating || 0,
      hi: !!item.hi,
      downloadPayload: {
        url: item.url,
      },
    }));
  }

  async _searchOpenSubtitles(query, imdbId, season, episode, language, apiKey, aliases = []) {
    const osLangs = language === 'pob' ? 'pt-br,pt,pt-pt,por,pob' : language.toLowerCase();
    const cleanImdb = imdbId ? String(imdbId).replace(/^tt/i, '') : null;

    let items = [];

    // Busca de série com temporada e episódio
    if (season != null && episode != null) {
      // 1. Tenta com parent_imdb_id (padrão oficial da API v1 do OpenSubtitles para episódios)
      if (cleanImdb) {
        try {
          const params = new URLSearchParams({
            languages: osLangs,
            type: 'episode',
            season_number: String(season),
            episode_number: String(episode),
            parent_imdb_id: cleanImdb,
          });
          const res = await fetch(`${OPENSUBTITLES_API_URL}?${params.toString()}`, {
            method: 'GET',
            headers: {
              'Api-Key': apiKey,
              'User-Agent': 'AuraPlayer v1.1.1',
              'Accept': 'application/json',
            },
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.data) && data.data.length > 0) {
              items = data.data;
            }
          }
        } catch (err) {
          logger.network('[subtitle-service] OpenSubtitles parent_imdb_id falhou:', err.message);
        }
      }

      // 2. Se não achou com parent_imdb_id, tenta busca textual por query e aliases
      if (items.length === 0 && (query || (aliases && aliases.length > 0))) {
        const candidates = [query, ...(aliases || [])].filter(Boolean);
        for (const cand of candidates.slice(0, 3)) {
          const cleanCand = cand.replace(/[:\-–!]/g, ' ').replace(/\s+/g, ' ').trim();
          if (!cleanCand) continue;
          try {
            const params = new URLSearchParams({
              languages: osLangs,
              type: 'episode',
              season_number: String(season),
              episode_number: String(episode),
              query: cleanCand,
            });
            const res = await fetch(`${OPENSUBTITLES_API_URL}?${params.toString()}`, {
              method: 'GET',
              headers: {
                'Api-Key': apiKey,
                'User-Agent': 'AuraPlayer v1.1.1',
                'Accept': 'application/json',
              },
            });
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data.data) && data.data.length > 0) {
                items = data.data;
                break;
              }
            }
          } catch {}
        }
      }
    } else {
      // Busca de filme
      if (cleanImdb) {
        try {
          const params = new URLSearchParams({
            languages: osLangs,
            imdb_id: cleanImdb,
          });
          const res = await fetch(`${OPENSUBTITLES_API_URL}?${params.toString()}`, {
            method: 'GET',
            headers: {
              'Api-Key': apiKey,
              'User-Agent': 'AuraPlayer v1.1.1',
              'Accept': 'application/json',
            },
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.data) && data.data.length > 0) {
              items = data.data;
            }
          }
        } catch {}
      }

      if (items.length === 0 && query) {
        try {
          const params = new URLSearchParams({
            languages: osLangs,
            query: query,
          });
          const res = await fetch(`${OPENSUBTITLES_API_URL}?${params.toString()}`, {
            method: 'GET',
            headers: {
              'Api-Key': apiKey,
              'User-Agent': 'AuraPlayer v1.1.1',
              'Accept': 'application/json',
            },
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.data)) {
              items = data.data;
            }
          }
        } catch {}
      }
    }

    return items.map((item) => {
      const attr = item.attributes || {};
      const file = attr.files?.[0] || {};
      return {
        id: `opensubtitles_${item.id}`,
        provider: 'opensubtitles',
        title: attr.release || file.file_name || query || 'OpenSubtitles Legenda',
        release: attr.release || file.file_name || '',
        lang: attr.language || 'pt-br',
        downloads: attr.download_count || 0,
        rating: attr.ratings || 0,
        hi: !!attr.hearing_impaired,
        foreign_parts_only: !!attr.foreign_parts_only,
        downloadPayload: {
          file_id: file.file_id,
        },
      };
    });
  }

  async downloadAndSave({ provider, downloadPayload, seriesTitle, season, episode }) {
    let srtBuffer = null;
    let finalFileName = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}.srt`;

    if (provider === 'subdl') {
      const quota = this.getQuotaStatus().subdl;
      if (quota.remaining <= 0) {
        throw new Error('Limite diário de downloads do SubDL (50) atingido.');
      }

      let subdlUrl = downloadPayload.url;
      if (!subdlUrl.startsWith('http')) {
        subdlUrl = `https://dl.subdl.com${subdlUrl}`;
      }

      const res = await fetch(subdlUrl);
      if (!res.ok) throw new Error(`Falha ao baixar do SubDL: HTTP ${res.status}`);
      const arrayBuf = await res.arrayBuffer();
      const rawBuf = Buffer.from(arrayBuf);

      if (rawBuf.length >= 4 && rawBuf.readUInt32LE(0) === 0x04034b50) {
        const extracted = extractSrtFromZip(rawBuf);
        if (!extracted) throw new Error('Não foi possível encontrar arquivo de legenda (.srt/.vtt) no ZIP do SubDL.');
        srtBuffer = extracted.content;
      } else {
        srtBuffer = rawBuf;
      }

      this._incrementQuota('subdl');
    } else if (provider === 'opensubtitles') {
      const quota = this.getQuotaStatus().openSubtitles;
      if (quota.remaining <= 0) {
        throw new Error('Limite diário de downloads do OpenSubtitles (20) atingido.');
      }

      const apiKey = (this.settings.get('openSubtitlesApiKey') || '').trim();
      if (!apiKey) throw new Error('Chave de API do OpenSubtitles não configurada.');

      const postRes = await fetch(OPENSUBTITLES_DOWNLOAD_URL, {
        method: 'POST',
        headers: {
          'Api-Key': apiKey,
          'User-Agent': 'AuraPlayer v1.1.1',
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ file_id: downloadPayload.file_id }),
      });

      if (!postRes.ok) throw new Error(`OpenSubtitles download init falhou: HTTP ${postRes.status}`);
      const initData = await postRes.json();
      if (!initData.link) throw new Error('Link de download não retornado pelo OpenSubtitles.');

      const fileRes = await fetch(initData.link);
      if (!fileRes.ok) throw new Error(`OpenSubtitles arquivo falhou: HTTP ${fileRes.status}`);
      const arrayBuf = await fileRes.arrayBuffer();
      srtBuffer = Buffer.from(arrayBuf);

      this._incrementQuota('opensubtitles');
    } else {
      throw new Error(`Provedor desconhecido: ${provider}`);
    }

    if (!srtBuffer || srtBuffer.length === 0) {
      throw new Error('Arquivo de legenda baixado está vazio.');
    }

    const targetDir = path.join(this.cacheDir, sanitizeFilename(seriesTitle));
    fs.mkdirSync(targetDir, { recursive: true });
    const fullPath = path.join(targetDir, finalFileName);
    fs.writeFileSync(fullPath, srtBuffer);

    logger.network(`[subtitle-service] Legenda salva em disco: ${fullPath} (${srtBuffer.length} bytes)`);
    return fullPath;
  }

  async autoFetchForEpisode(seriesTitle, season, episode, imdbId = null) {
    const cached = this.getCachedSubtitle(seriesTitle, season, episode);
    if (cached) {
      logger.network(`[subtitle-service] Usando legenda do cache local: ${cached}`);
      return { path: cached, cached: true, provider: 'local' };
    }

    const results = await this.searchSubtitles({
      query: seriesTitle,
      imdbId,
      season,
      episode,
    });

    if (results.length === 0) {
      return null;
    }

    results.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    const best = results[0];

    const savedPath = await this.downloadAndSave({
      provider: best.provider,
      downloadPayload: best.downloadPayload,
      seriesTitle,
      season,
      episode,
    });

    return { path: savedPath, cached: false, provider: best.provider, release: best.release };
  }

  async handleMediaLoad(target) {
    if (!target || target === this.lastLoadedTarget) return null;
    const isFirstLoad = !this.lastLoadedTarget;
    this.lastLoadedTarget = target;

    // Se não há série ativa vinculada, tenta deduzir do nome do arquivo (se não for URL/hash lixo)
    if (!this.activeSeries) {
      const cleanName = path.basename(target);
      if (!isGarbageTitle(cleanName)) {
        const guessed = guessMediaInfo(cleanName);
        if (guessed) {
          this.bindSeries(guessed.title, guessed.season, guessed.episode);
        }
      }
    } else if (!isFirstLoad) {
      // Já existe uma série ativa e um novo vídeo começou na mesma sessão:
      // incrementa o episódio!
      this.activeSeries.currentEpisode += 1;
      this._saveRecentSeries(
        this.activeSeries.title,
        this.activeSeries.season,
        this.activeSeries.currentEpisode,
        this.activeSeries.imdbId
      );
      logger.network(`[subtitle-service] Nova mídia na sessão! Avançando para Ep ${this.activeSeries.currentEpisode}`);
    }

    if (!this.activeSeries) return null;

    const currentSeries = { ...this.activeSeries };
    const autoDownload = !!this.settings.get('subtitlesAutoDownloadNext');

    if (autoDownload) {
      try {
        const fetched = await this.autoFetchForEpisode(
          currentSeries.title,
          currentSeries.season,
          currentSeries.currentEpisode,
          currentSeries.imdbId
        );
        if (fetched && fetched.path && this.player) {
          await this.player.command(['sub-add', fetched.path, 'select']).catch(() => {});
          await this.player._extractTracks().catch(() => {});
          return {
            status: 'applied',
            series: currentSeries,
            cached: fetched.cached,
            provider: fetched.provider,
            path: fetched.path,
            advanced: !isFirstLoad,
          };
        }
      } catch (err) {
        logger.network('[subtitle-service] autoFetch falhou:', err.message);
      }
    }

    return {
      status: 'prompt',
      series: currentSeries,
      advanced: !isFirstLoad,
    };
  }
}

module.exports = {
  SubtitleService,
  guessMediaInfo,
  extractSrtFromZip,
  isGarbageTitle,
};
