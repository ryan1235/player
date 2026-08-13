// Biblioteca de midia: escaneia uma pasta escolhida pelo usuario em busca de
// videos e gera uma miniatura de cada um (via uma instancia headless do mpv,
// separada da instancia principal usada pra reproducao — nao interfere no
// que estiver tocando). O indice (lista de arquivos + caminho da miniatura)
// e persistido em disco pra nao precisar re-escanear/re-gerar tudo a cada
// abertura do app.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { resolveMpvBinary } = require('./mpv');
const { atomicWriteFileSync } = require('./services/atomic-write');

const VIDEO_EXTENSIONS = /\.(mp4|mkv|avi|mov|webm|flv|m4v|ts)$/i;
const THUMB_TIMEOUT_MS = 15000;
const THUMB_SEEK_SECONDS = 10;
const MAX_SCAN_DEPTH = 8;

// Async (nao *Sync) de proposito: isso roda no processo principal do
// Electron, que tambem responde IPC do mpv e o servidor HTTP do modo
// Receber — uma pasta grande ou montada em rede (SMB) com readdirSync/
// statSync travava tudo isso ate o scan inteiro terminar. Continua andando
// uma subpasta de cada vez (nao paralelo), so nao trava o event loop entre
// uma chamada de fs e outra.
async function walk(dir, results, depth) {
  if (depth > MAX_SCAN_DEPTH) return;
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return; // pasta sem permissao de leitura ou removida durante o scan
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, results, depth + 1);
    } else if (entry.isFile() && VIDEO_EXTENSIONS.test(entry.name)) {
      try {
        const stat = await fs.promises.stat(full);
        results.push({ path: full, name: entry.name, size: stat.size, mtimeMs: stat.mtimeMs });
      } catch {
        // arquivo sumiu entre o readdir e o stat, ignora
      }
    }
  }
}

function hashPath(p) {
  return crypto.createHash('sha1').update(p).digest('hex');
}

class Library {
  constructor(indexFilePath, thumbnailsDir) {
    this.indexFilePath = indexFilePath;
    this.thumbnailsDir = thumbnailsDir;
    try {
      fs.mkdirSync(thumbnailsDir, { recursive: true });
    } catch {
      // segue sem miniaturas persistidas se nao conseguir criar a pasta
    }
    this.index = this._load();
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(this.indexFilePath, 'utf8'));
    } catch {
      return { folder: null, scannedAt: null, items: [] };
    }
  }

  _persist() {
    try {
      atomicWriteFileSync(this.indexFilePath, JSON.stringify(this.index));
    } catch {
      // sem permissao de escrita — a sessao atual continua funcionando em memoria
    }
  }

  getIndex() {
    return this.index;
  }

  async _generateThumbnail(videoPath) {
    const outFinal = path.join(this.thumbnailsDir, hashPath(videoPath) + '.jpg');
    let tmpDir;
    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-thumb-'));
    } catch {
      return null;
    }
    try {
      await new Promise((resolve) => {
        let proc;
        try {
          proc = spawn(
            resolveMpvBinary(),
            [
              videoPath,
              '--no-config',
              '--vo=image',
              `--vo-image-outdir=${tmpDir}`,
              '--vo-image-format=jpg',
              '--frames=1',
              `--start=${THUMB_SEEK_SECONDS}`,
              '--really-quiet',
              '--no-terminal',
            ],
            { stdio: 'ignore' }
          );
        } catch {
          resolve();
          return;
        }
        const killTimer = setTimeout(() => {
          try {
            proc.kill();
          } catch {
            // processo ja pode ter terminado sozinho
          }
        }, THUMB_TIMEOUT_MS);
        proc.on('exit', () => {
          clearTimeout(killTimer);
          resolve();
        });
        proc.on('error', () => {
          clearTimeout(killTimer);
          resolve();
        });
      });
      const produced = fs.readdirSync(tmpDir).find((f) => /\.jpe?g$/i.test(f));
      if (!produced) return null;
      fs.renameSync(path.join(tmpDir, produced), outFinal);
      return outFinal;
    } catch {
      return null;
    } finally {
      fs.rm(tmpDir, { recursive: true, force: true }, () => {});
    }
  }

  async scan(folder, onProgress) {
    const found = [];
    await walk(folder, found, 0);

    const previousByPath = new Map((this.index.items || []).map((i) => [i.path, i]));
    const items = new Array(found.length);
    let doneCount = 0;

    // Cada miniatura sobe uma instancia headless do mpv e espera ate 15s
    // (THUMB_TIMEOUT_MS) por ela — gerando uma por vez, uma biblioteca de
    // centenas de arquivos podia levar horas. Um pool pequeno (cada mpv
    // headless e independente, sem estado compartilhado entre eles) reduz
    // isso proporcionalmente sem lotar a maquina de processos ao mesmo tempo.
    const POOL_SIZE = 3;
    let nextIndex = 0;
    const worker = async () => {
      while (true) {
        const i = nextIndex++;
        if (i >= found.length) return;
        const file = found[i];
        const prev = previousByPath.get(file.path);
        let thumbnail =
          prev && prev.mtimeMs === file.mtimeMs && prev.thumbnail && fs.existsSync(prev.thumbnail) ? prev.thumbnail : null;
        if (!thumbnail) {
          thumbnail = await this._generateThumbnail(file.path);
        }
        items[i] = { ...file, thumbnail };
        doneCount++;
        if (onProgress) onProgress({ done: doneCount, total: found.length, currentName: file.name });
      }
    };
    await Promise.all(Array.from({ length: Math.min(POOL_SIZE, found.length) }, () => worker()));

    // Miniaturas de arquivos que sairam da pasta (renomeados/apagados) nao sao
    // mais referenciadas por nenhum item — remove pra nao acumular lixo.
    const stillReferenced = new Set(items.map((i) => i.thumbnail).filter(Boolean));
    for (const prev of previousByPath.values()) {
      if (prev.thumbnail && !stillReferenced.has(prev.thumbnail)) {
        fs.unlink(prev.thumbnail, () => {});
      }
    }

    items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    this.index = { folder, scannedAt: Date.now(), items };
    this._persist();
    return this.index;
  }

  clearFolder() {
    for (const item of this.index.items || []) {
      if (item.thumbnail) fs.unlink(item.thumbnail, () => {});
    }
    this.index = { folder: null, scannedAt: null, items: [] };
    this._persist();
  }
}

module.exports = Library;
