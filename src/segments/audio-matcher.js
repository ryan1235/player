function popcnt32(n) {
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}

/**
 * Compara dois arrays de hashes e encontra o melhor alinhamento (menor erro).
 * A janela menor (queryHashes) desliza sobre a janela maior (targetHashes).
 * 
 * @param {Array<number>} queryHashes Hashes extraídos do trecho atual (ao vivo)
 * @param {Array<number>} targetHashes Hashes salvos do segmento completo
 * @param {number} maxOffset Offset máximo para buscar. Se null, busca em todo o target
 * @returns {Object} { confidence: number, matchTimeOffset: number }
 */
function matchAudioFingerprint(queryHashes, targetHashes, maxOffset = null) {
  if (!queryHashes || !queryHashes.length || !targetHashes || !targetHashes.length) {
    return { confidence: 0, matchTimeOffset: 0 };
  }

  const qLen = queryHashes.length;
  const tLen = targetHashes.length;

  if (qLen > tLen) {
    // O trecho ao vivo não pode ser maior que o segmento
    return { confidence: 0, matchTimeOffset: 0 };
  }

  const searchEnd = maxOffset !== null ? Math.min(maxOffset, tLen - qLen) : tLen - qLen;
  let minErrors = qLen * 32; // máximo de erros possível (1 bit por banda)
  let bestOffset = 0;

  for (let offset = 0; offset <= searchEnd; offset++) {
    let errors = 0;
    for (let i = 0; i < qLen; i++) {
      errors += popcnt32(queryHashes[i] ^ targetHashes[offset + i]);
      // Early exit optimization
      if (errors >= minErrors) break;
    }

    if (errors < minErrors) {
      minErrors = errors;
      bestOffset = offset;
    }
  }

  const totalBits = qLen * 32;
  const errorRate = minErrors / totalBits;
  
  // Se forem hashes completamente aleatórios, a taxa de erro esperada é 0.5.
  // Reescalamos a confiança para que 0.5 erro = 0 confiança.
  const confidence = Math.max(0, 1 - (2 * errorRate));

  // Cada hash representa ~46ms (1024 amostras com 50% overlap @ 11025Hz)
  // HOP_SIZE = 512, SAMPLE_RATE = 11025 -> 512 / 11025 = 0.04644 segundos
  const matchTimeOffset = bestOffset * (512 / 11025);

  return { confidence, matchTimeOffset };
}

module.exports = { matchAudioFingerprint, popcnt32 };
