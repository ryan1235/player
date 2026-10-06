const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class PosterService {
  constructor(postersDir) {
    this.postersDir = postersDir;
    try {
      fs.mkdirSync(this.postersDir, { recursive: true });
    } catch {
      // segue sem erro se já existir ou sem permissão
    }
    this.memoryCache = new Map();
  }

  getLocalPath(id) {
    if (!id) return null;
    const clean = String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const webpPath = path.join(this.postersDir, `${clean}.webp`);
    if (fs.existsSync(webpPath)) return webpPath;
    const jpgPath = path.join(this.postersDir, `${clean}.jpg`);
    if (fs.existsSync(jpgPath)) return jpgPath;
    return null;
  }

  async resolveAndDownload(title, imdbId = null) {
    const key = (imdbId || title || '').toLowerCase().trim();
    if (!key) return null;
    if (this.memoryCache.has(key)) {
      const cached = this.memoryCache.get(key);
      const local = this.getLocalPath(cached.imdbId);
      if (local) {
        cached.posterUrl = 'file:///' + local.replace(/\\/g, '/');
      }
      return cached;
    }

    let targetId = imdbId ? String(imdbId).trim() : null;
    let remotePoster = null;

    // Se não tiver IMDb ID ou poster remoto, busca via Cinemeta
    if (!targetId || !remotePoster) {
      try {
        const queryTerm = targetId || title;
        if (queryTerm) {
          const queryUrl = `https://v3-cinemeta.strem.io/catalog/series/top/search=${encodeURIComponent(queryTerm.trim())}.json`;
          const res = await fetch(queryUrl, { headers: { Accept: 'application/json' } });
          if (res.ok) {
            const data = await res.json();
            const first = data?.metas?.[0];
            if (first) {
              if (!targetId) targetId = first.id || first.imdb_id;
              remotePoster = first.poster || null;
            }
          }
        }
      } catch (err) {
        logger.network('[poster-service] erro na busca Cinemeta:', err.message);
      }
    }

    if (!targetId && !remotePoster) {
      return null;
    }

    if (targetId && !remotePoster) {
      remotePoster = `https://images.metahub.space/poster/medium/${targetId}/img`;
    }

    // Verifica se já existe em disco
    const existing = this.getLocalPath(targetId);
    if (existing) {
      const fileUrl = 'file:///' + existing.replace(/\\/g, '/');
      const result = {
        imdbId: targetId,
        localPath: existing,
        posterUrl: fileUrl,
        remoteUrl: remotePoster,
      };
      this.memoryCache.set(key, result);
      return result;
    }

    // Se não existe, inicia download assíncrono em segundo plano
    const cleanId = String(targetId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const savePath = path.join(this.postersDir, `${cleanId}.webp`);

    this._downloadFile(remotePoster, savePath).catch(() => {});

    const result = {
      imdbId: targetId,
      localPath: savePath,
      posterUrl: remotePoster,
      remoteUrl: remotePoster,
    };
    this.memoryCache.set(key, result);
    return result;
  }

  async _downloadFile(url, destPath) {
    if (!url || !destPath) return;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const arrayBuffer = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuffer);
      if (buf.length > 500) {
        await fs.promises.writeFile(destPath, buf);
        logger.network(`[poster-service] Poster salvo com sucesso: ${path.basename(destPath)} (${Math.round(buf.length / 1024)} KB)`);
      }
    } catch (err) {
      logger.network(`[poster-service] Falha ao baixar poster (${url}):`, err.message);
    }
  }
}

module.exports = { PosterService };
