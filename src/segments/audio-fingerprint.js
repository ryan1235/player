const { spawn } = require('child_process');
const FFT = require('fft.js');

let ffmpegPath;
try {
  ffmpegPath = require('ffmpeg-static');
} catch {
  ffmpegPath = null;
}

const SAMPLE_RATE = 11025;
const WINDOW_SIZE = 1024;
const HOP_SIZE = 512;
const NUM_BANDS = 32;

// Frequências para as bandas logarítmicas (aprox 20Hz a 5500Hz)
const MIN_FREQ = 20;
const MAX_FREQ = 5500;

// Pré-calcula os limites dos bins da FFT para as bandas logarítmicas
const bandLimits = [];
const logMin = Math.log(MIN_FREQ);
const logMax = Math.log(MAX_FREQ);
const freqPerBin = SAMPLE_RATE / WINDOW_SIZE;

for (let i = 0; i <= NUM_BANDS; i++) {
  const freq = Math.exp(logMin + (logMax - logMin) * (i / NUM_BANDS));
  const bin = Math.round(freq / freqPerBin);
  bandLimits.push(Math.max(1, Math.min(bin, WINDOW_SIZE / 2 - 1)));
}

// Janela de Hann pré-calculada
const hannWindow = new Float64Array(WINDOW_SIZE);
for (let i = 0; i < WINDOW_SIZE; i++) {
  hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (WINDOW_SIZE - 1)));
}

const fft = new FFT(WINDOW_SIZE);

/**
 * Gera assinatura acústica de um trecho de vídeo
 * @param {string} target Caminho do arquivo ou URL
 * @param {number} startTime Tempo de início em segundos
 * @param {number} duration Duração do trecho em segundos
 * @returns {Promise<Array<number>>} Array de hashes de 32 bits
 */
function generateAudioFingerprint(target, startTime, duration) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('FFmpeg indisponível'));

    const args = [
      '-ss', String(startTime),
      '-i', target,
      '-t', String(duration),
      '-vn', // Sem vídeo
      '-ac', '1', // Mono
      '-ar', String(SAMPLE_RATE), // Sample rate 11025 Hz
      '-f', 's16le', // PCM 16-bit little endian
      '-loglevel', 'error',
      'pipe:1'
    ];

    const proc = spawn(ffmpegPath, args);
    const buffers = [];

    proc.stdout.on('data', (chunk) => buffers.push(chunk));
    
    proc.on('close', (code) => {
      if (code !== 0 && buffers.length === 0) {
        return reject(new Error(`FFmpeg falhou com código ${code}`));
      }
      
      try {
        const pcmData = Buffer.concat(buffers);
        const hashes = processPCMToHashes(pcmData);
        resolve(hashes);
      } catch (err) {
        reject(err);
      }
    });

    proc.on('error', reject);
  });
}

function processPCMToHashes(pcmBuffer) {
  const samples = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);
  const numFrames = Math.floor((samples.length - WINDOW_SIZE) / HOP_SIZE);
  
  if (numFrames <= 0) return [];

  const hashes = [];
  const realInput = new Array(WINDOW_SIZE);
  const complexOutput = fft.createComplexArray();
  
  let prevEnergies = new Float64Array(NUM_BANDS);

  for (let i = 0; i < numFrames; i++) {
    const offset = i * HOP_SIZE;
    
    // Aplicar janela de Hann e normalizar amostras
    for (let j = 0; j < WINDOW_SIZE; j++) {
      realInput[j] = (samples[offset + j] / 32768.0) * hannWindow[j];
    }
    
    fft.realTransform(complexOutput, realInput);
    fft.completeSpectrum(complexOutput);

    // Calcular energia por banda
    const currentEnergies = new Float64Array(NUM_BANDS);
    for (let b = 0; b < NUM_BANDS; b++) {
      const startBin = bandLimits[b];
      const endBin = bandLimits[b + 1];
      let energy = 0;
      
      // Se startBin == endBin, pega só 1 bin, senão soma no intervalo
      const end = Math.max(startBin + 1, endBin);
      
      for (let bin = startBin; bin < end; bin++) {
        const real = complexOutput[bin * 2];
        const imag = complexOutput[bin * 2 + 1];
        energy += (real * real + imag * imag);
      }
      currentEnergies[b] = energy;
    }

    // Gerar hash de 32 bits (1 bit por banda)
    // Se a energia aumentou em relação ao frame anterior, bit = 1, senão 0
    let hash = 0;
    for (let b = 0; b < NUM_BANDS; b++) {
      if (currentEnergies[b] > prevEnergies[b]) {
        hash |= (1 << b);
      }
    }
    
    // Salvar o hash se não for o primeiro frame
    if (i > 0) {
      hashes.push(hash >>> 0); // Assegura Uint32
    }
    
    prevEnergies = currentEnergies;
  }

  return hashes;
}

module.exports = { generateAudioFingerprint };
