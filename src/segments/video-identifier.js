const fs = require('fs');
const crypto = require('crypto');

// Tamanho do bloco lido para gerar o hash parcial do arquivo — 64KB é
// suficiente para diferenciar arquivos distintos sem ler o arquivo inteiro
// (que pode ter dezenas de GB). O hash combina cabeçalho (primeiros 64KB)
// com um trecho do meio do arquivo para cobrir o caso (raro) de arquivos
// diferentes com cabeçalhos idênticos.
const HASH_BLOCK_SIZE = 64 * 1024;

/**
 * Gera um identificador estável para um vídeo.
 *
 * Arquivos locais: hash MD5 dos primeiros 64KB + bloco do meio + tamanho + duração.
 * URLs/streams: hash da URL normalizada + duração.
 *
 * O ID é determinístico: o mesmo arquivo sempre gera o mesmo ID,
 * mesmo que renomeado, desde que o conteúdo não mude.
 */
function generateVideoId(target, duration) {
  if (!target) return null;

  // Verifica se é arquivo local
  const isLocal = !target.startsWith('http://') && !target.startsWith('https://') && !target.startsWith('rtsp://');

  if (isLocal) {
    return _generateLocalId(target, duration);
  }
  return _generateUrlId(target, duration);
}

function _generateLocalId(filePath, duration) {
  try {
    const stat = fs.statSync(filePath);
    const size = stat.size;
    const fd = fs.openSync(filePath, 'r');

    const hash = crypto.createHash('md5');

    // Ler primeiros HASH_BLOCK_SIZE bytes (cabeçalho)
    const headerBuf = Buffer.alloc(Math.min(HASH_BLOCK_SIZE, size));
    fs.readSync(fd, headerBuf, 0, headerBuf.length, 0);
    hash.update(headerBuf);

    // Ler bloco do meio do arquivo (se grande o bastante)
    if (size > HASH_BLOCK_SIZE * 3) {
      const midOffset = Math.floor(size / 2);
      const midBuf = Buffer.alloc(HASH_BLOCK_SIZE);
      fs.readSync(fd, midBuf, 0, midBuf.length, midOffset);
      hash.update(midBuf);
    }

    fs.closeSync(fd);

    // Incluir tamanho e duração no hash final
    hash.update(`|size=${size}`);
    if (duration != null) {
      hash.update(`|dur=${Math.round(duration)}`);
    }

    return 'v_' + hash.digest('hex').slice(0, 16);
  } catch (err) {
    // Fallback: hash do caminho + duração
    return _generateUrlId(filePath, duration);
  }
}

function _generateUrlId(url, duration) {
  const hash = crypto.createHash('md5');
  // Normalizar URL removendo parâmetros de sessão comuns
  let normalized = url;
  try {
    const u = new URL(url);
    // Remover parâmetros que mudam entre sessões
    u.searchParams.delete('token');
    u.searchParams.delete('session');
    u.searchParams.delete('t');
    u.searchParams.delete('_');
    normalized = u.toString();
  } catch {
    // Não é URL válida, usar como está
  }
  hash.update(normalized);
  if (duration != null) {
    hash.update(`|dur=${Math.round(duration)}`);
  }
  return 'v_' + hash.digest('hex').slice(0, 16);
}

/**
 * Extrai um nome legível do target para exibição.
 */
function extractVideoName(target) {
  if (!target) return 'Desconhecido';
  try {
    const url = new URL(target);
    const last = url.pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : target;
  } catch {
    const parts = target.split(/[\\/]/);
    return parts[parts.length - 1] || target;
  }
}

module.exports = { generateVideoId, extractVideoName };
