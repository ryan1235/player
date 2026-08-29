const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const MPV_BIN = path.resolve(__dirname, '../../bin/mpv.exe');
const SAMPLE_RATE_HZ = 20; // 20 pontos de energia por segundo

/**
 * Calcula o envelope de energia acústica com compressão logarítmica e curva de novidade (onsets/transientes rítmicos).
 */
function computeEnergyEnvelope(pcmBuffer, pcmSampleRate = 8000, targetHz = SAMPLE_RATE_HZ) {
  const numSamples = Math.floor(pcmBuffer.length / 2);
  const samplesPerBin = Math.floor(pcmSampleRate / targetHz);
  const numBins = Math.floor(numSamples / samplesPerBin);
  const envelope = new Float32Array(numBins);
  const novelty = new Float32Array(numBins);

  let prevRms = 0;
  for (let b = 0; b < numBins; b++) {
    let sumSq = 0;
    const startIdx = b * samplesPerBin;
    for (let i = 0; i < samplesPerBin; i++) {
      const byteOffset = (startIdx + i) * 2;
      const sample = pcmBuffer.readInt16LE(byteOffset) / 32768.0;
      sumSq += sample * sample;
    }
    const rms = Math.sqrt(sumSq / samplesPerBin);
    const logRms = Math.log1p(9 * rms);
    envelope[b] = logRms;
    novelty[b] = Math.max(0, logRms - prevRms);
    prevRms = logRms;
  }

  // Normalização
  let maxEnv = 0;
  let maxNov = 0;
  for (let i = 0; i < numBins; i++) {
    if (envelope[i] > maxEnv) maxEnv = envelope[i];
    if (novelty[i] > maxNov) maxNov = novelty[i];
  }
  if (maxEnv > 0) for (let i = 0; i < numBins; i++) envelope[i] /= maxEnv;
  if (maxNov > 0) for (let i = 0; i < numBins; i++) novelty[i] /= maxNov;

  // Fusão híbrida: 60% envelope de energia + 40% transientes rítmicos (onsets)
  const combined = new Float32Array(numBins);
  for (let i = 0; i < numBins; i++) {
    combined[i] = envelope[i] * 0.6 + novelty[i] * 0.4;
  }

  return Array.from(combined);
}

/**
 * Ajuste Fino Magnético ("Snap to Silence / Beat"):
 * Procura um vale de energia mínima / micro-silêncio (queda de som) em uma janela de ±1.2s
 * para alinhar o corte cirurgicamente na transição entre cenas/música sem cortar palavras.
 */
function snapToSilence(envelope, targetBin, searchRadiusBins = 24) {
  if (!envelope || envelope.length === 0) return targetBin;
  const minBin = Math.max(0, targetBin - searchRadiusBins);
  const maxBin = Math.min(envelope.length - 1, targetBin + searchRadiusBins);
  let bestBin = targetBin;
  let minEnergy = envelope[targetBin] ?? 1.0;

  for (let b = minBin; b <= maxBin; b++) {
    if (envelope[b] < minEnergy) {
      minEnergy = envelope[b];
      bestBin = b;
    }
  }

  // Snap magnético se houver uma atenuação clara de som (< 0.30)
  if (minEnergy < 0.30) {
    return bestBin;
  }
  return targetBin;
}

/**
 * Realiza Correlação Cruzada Normalizada (NCC) com validação de saliência de pico e snap magnético.
 * Retorna o segundo onde a abertura começa no episódio e o grau de confiança (0.0 a 1.0).
 */
function crossCorrelate(refSignature, epAudioEnvelope, targetHz = SAMPLE_RATE_HZ) {
  const L = refSignature.length;
  const M = epAudioEnvelope.length;

  if (L === 0 || M < L) {
    return { matched: false, startTime: 0, endTime: 0, duration: 0, confidence: 0 };
  }

  // Média e desvio padrão da assinatura de referência
  let refMean = 0;
  for (let i = 0; i < L; i++) refMean += refSignature[i];
  refMean /= L;

  let refVar = 0;
  for (let i = 0; i < L; i++) {
    const diff = refSignature[i] - refMean;
    refVar += diff * diff;
  }
  const refStd = Math.sqrt(refVar);
  if (refStd === 0) return { matched: false, startTime: 0, endTime: 0, duration: 0, confidence: 0 };

  let bestScore = -1;
  let bestOffset = 0;

  const maxShift = M - L;
  const scores = new Float32Array(maxShift + 1);

  for (let k = 0; k <= maxShift; k++) {
    let epMean = 0;
    for (let i = 0; i < L; i++) epMean += epAudioEnvelope[k + i];
    epMean /= L;

    let epVar = 0;
    let cov = 0;
    for (let i = 0; i < L; i++) {
      const epDiff = epAudioEnvelope[k + i] - epMean;
      const refDiff = refSignature[i] - refMean;
      epVar += epDiff * epDiff;
      cov += refDiff * epDiff;
    }

    const epStd = Math.sqrt(epVar);
    if (epStd > 0) {
      const score = cov / (refStd * epStd);
      scores[k] = score;
      if (score > bestScore) {
        bestScore = score;
        bestOffset = k;
      }
    }
  }

  // Saliência em relação ao ruído de fundo
  let meanScore = 0;
  for (let k = 0; k <= maxShift; k++) meanScore += Math.max(0, scores[k]);
  meanScore /= (maxShift + 1);
  const prominence = meanScore > 0 ? bestScore / meanScore : 1;

  // Ajuste magnético de silêncio (±1.2s)
  const searchBins = Math.round(1.2 * targetHz);
  const snappedStartBin = snapToSilence(epAudioEnvelope, bestOffset, searchBins);
  const snappedEndBin = snapToSilence(epAudioEnvelope, bestOffset + L, searchBins);

  const startTime = snappedStartBin / targetHz;
  const endTime = Math.max(startTime + 1, snappedEndBin / targetHz);
  const duration = endTime - startTime;

  // Detecção robusta com limiar adaptativo
  const matched = (bestScore >= 0.42) || (bestScore >= 0.32 && prominence >= 1.8);

  return {
    matched,
    startTime: Math.round(startTime * 10) / 10,
    endTime: Math.round(endTime * 10) / 10,
    duration: Math.round(duration * 10) / 10,
    confidence: Math.round(bestScore * 100) / 100,
    prominence: Math.round(prominence * 10) / 10,
  };
}

/**
 * Extrai um trecho de áudio PCM mono (8000Hz) usando mpv em segundo plano.
 */
function extractAudioPcm(mediaUrl, startSec, lengthSec) {
  return new Promise((resolve) => {
    const tempPcmPath = path.join(os.tmpdir(), `aura-pcm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.raw`);
    const args = [
      '--no-config',
      '--load-scripts=no',
      '--ytdl=no',
      '--ao=pcm',
      '--ao-pcm-waveheader=no',
      `--ao-pcm-file=${tempPcmPath}`,
      '--untimed',
      '--no-video',
      '--no-sub',
      '--no-cache',
      '--hr-seek=no',
      '--demuxer-lavf-analyzeduration=0.1',
      '--demuxer-lavf-probesize=32768',
      '--network-timeout=6',
      '--msg-level=all=no',
      '--audio-samplerate=8000',
      '--audio-channels=mono',
      '--audio-format=s16',
      `--start=${Math.max(0, startSec || 0)}`,
      `--length=${Math.max(1, lengthSec || 1)}`,
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      mediaUrl,
    ];

    let resolved = false;
    const proc = spawn(MPV_BIN, args, { stdio: 'ignore' });
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { proc.kill(); } catch {}
        try { fs.unlinkSync(tempPcmPath); } catch {}
        resolve(Buffer.alloc(0));
      }
    }, 12000);

    proc.on('close', () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      try {
        if (fs.existsSync(tempPcmPath)) {
          const buf = fs.readFileSync(tempPcmPath);
          fs.unlinkSync(tempPcmPath);
          resolve(buf);
        } else {
          resolve(Buffer.alloc(0));
        }
      } catch {
        resolve(Buffer.alloc(0));
      }
    });

    proc.on('error', () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve(Buffer.alloc(0));
    });
  });
}

/**
 * Extrai a assinatura acústica de um trecho marcado (ex: início ao fim da abertura).
 */
async function generateIntroSignature(mediaUrl, startSec, endSec) {
  const duration = Math.max(1, endSec - startSec);
  try {
    const pcmBuf = await extractAudioPcm(mediaUrl, startSec, duration);
    if (pcmBuf && pcmBuf.length >= 500) {
      const envelope = computeEnergyEnvelope(pcmBuf, 8000, SAMPLE_RATE_HZ);
      return {
        duration,
        sampleRate: SAMPLE_RATE_HZ,
        signature: envelope,
        acousticLearned: true,
      };
    }
  } catch {}
  return {
    duration,
    sampleRate: SAMPLE_RATE_HZ,
    signature: [],
    acousticLearned: false,
  };
}

const introCache = require('./intro-cache');

/**
 * Escaneia os primeiros 8 minutos de um episódio e compara contra múltiplas assinaturas salvas (ex: últimas 5).
 * Extrai o áudio do episódio uma única vez e roda a correlação cruzada em paralelo/sequencial super rápida (< 30ms total).
 * Utiliza cache em memória para responder em 0ms para episódios já escaneados.
 */
async function scanEpisodeAgainstProfiles(mediaUrl, profilesList, scanDurationSec = 480) {
  if (!Array.isArray(profilesList) || profilesList.length === 0) {
    return { matched: false };
  }

  const cached = introCache.get(mediaUrl);
  if (cached) {
    return cached;
  }

  const validProfiles = profilesList.filter((p) => p && Array.isArray(p.signature) && p.signature.length > 0);
  if (validProfiles.length === 0) {
    return { matched: false };
  }

  const pcmBuf = await extractAudioPcm(mediaUrl, 0, scanDurationSec);
  if (!pcmBuf || pcmBuf.length < 1000) {
    return { matched: false };
  }

  const epEnvelope = computeEnergyEnvelope(pcmBuf, 8000, SAMPLE_RATE_HZ);

  let bestMatch = null;
  for (const profile of validProfiles) {
    const result = crossCorrelate(profile.signature, epEnvelope, profile.sampleRate || SAMPLE_RATE_HZ);
    if (result.matched) {
      if (!bestMatch || result.confidence > bestMatch.confidence) {
        bestMatch = {
          ...result,
          profile,
        };
      }
    }
  }

  if (bestMatch) {
    introCache.set(mediaUrl, bestMatch);
    return bestMatch;
  }
  const notFound = { matched: false };
  introCache.set(mediaUrl, notFound);
  return notFound;
}

async function scanEpisodeForIntro(mediaUrl, refSignature, scanDurationSec = 480) {
  if (!refSignature) return { matched: false };
  return scanEpisodeAgainstProfiles(mediaUrl, [refSignature], scanDurationSec);
}

module.exports = {
  SAMPLE_RATE_HZ,
  computeEnergyEnvelope,
  crossCorrelate,
  extractAudioPcm,
  generateIntroSignature,
  scanEpisodeForIntro,
  scanEpisodeAgainstProfiles,
};
