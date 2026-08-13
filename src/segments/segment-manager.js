const EventEmitter = require('events');
const { spawn } = require('child_process');
const { generateVideoId, extractVideoName } = require('./video-identifier');
const { generateAudioFingerprint } = require('./audio-fingerprint');
const { matchAudioFingerprint } = require('./audio-matcher');

// ffmpeg-static fornece o caminho do binario ffmpeg embutido no projeto.
// Se nao estiver disponivel, as funcionalidades de captura/analise de audio
// ficam desabilitadas (o sistema manual continua funcionando normalmente).
let ffmpegPath;
try {
  ffmpegPath = require('ffmpeg-static');
} catch {
  ffmpegPath = null;
}

class SegmentManager extends EventEmitter {
  constructor(player, storage, settings) {
    super();
    this.player = player;
    this.storage = storage;
    this.settings = settings;

    this.currentVideoId = null;
    this.currentTarget = null;
    this.currentDuration = null;

    // Rastreia o segmento detectado no momento para nao re-emitir o evento
    // repetidamente enquanto a posicao permanecer dentro do mesmo segmento.
    this._activeSegmentId = null;
    // Flag para preview: quando ativo, nao deteccao automatica nao deve
    // disparar (o usuario esta testando manualmente o segmento).
    this._previewing = false;
    this._previewListener = null;

    this._setupListeners();
  }

  _setupListeners() {
    // O player emite 'load' com { target } — atualiza o contexto de video.
    // Precisamos esperar a duracao ficar disponivel antes de gerar o videoId
    // (a duracao pode levar alguns segundos pra aparecer em arquivos grandes).
    this.player.on('load', ({ target }) => {
      this.currentTarget = target;
      this._activeSegmentId = null;
      this.currentVideoId = null;
      this.currentDuration = null;
      this._scanCompleted = false; // Flag para garantir que o scan so roda uma vez por video
    });

    // O status loop do MPV emite a cada ~1s com posicao, duracao, etc.
    // Aproveitamos esse tick para atualizar o videoId (se ainda nao temos)
    // e monitorar se a posicao entrou num segmento salvo.
    this.player.on('status', (info) => {
      // Segmentos nao se aplicam a lives
      if (info.isLive || info.idle) return;

      // Se temos target mas ainda nao temos videoId, tentar gerar agora
      if (this.currentTarget && !this.currentVideoId && info.duration > 0) {
        this.currentDuration = info.duration;
        this.currentVideoId = generateVideoId(this.currentTarget, info.duration);
        
        // Disparar scan em background para encontrar segmentos conhecidos
        if (!this._scanCompleted) {
          this._scanCompleted = true;
          this._runBackgroundScan();
        }
      }

      if (!this.currentVideoId) return;
      if (this._previewing) return;

      const detectEnabled = this.settings.get('segmentDetectEnabled') !== false;
      if (!detectEnabled) return;

      const position = info.position;
      if (typeof position !== 'number') return;

      const segments = this.storage.getEnabledSegments(this.currentVideoId);
      const currentSegment = segments.find(s => position >= s.startTime && position <= s.endTime);

      if (currentSegment) {
        if (this._activeSegmentId !== currentSegment.id) {
          this._activeSegmentId = currentSegment.id;
          this.emit('segment:detected', currentSegment);

          // Auto-skip se habilitado
          const autoSkip = this.settings.get('segmentAutoSkip') === true;
          if (autoSkip) {
            this.skip(currentSegment.id);
          }
        }
      } else {
        this._activeSegmentId = null;
      }
    });
  }

  // --- Identificacao ---

  getVideoId() {
    return this.currentVideoId;
  }

  // --- CRUD de segmentos ---

  addSegment(segmentData) {
    if (!this.currentVideoId) return null;
    const videoName = extractVideoName(this.currentTarget);
    const videoId = this.currentVideoId;
    const targetFile = this.currentTarget;

    const segment = {
      name: segmentData.name || 'Segmento',
      type: segmentData.type || 'custom',
      startTime: segmentData.startTime,
      endTime: segmentData.endTime,
      enabled: true,
      hasMusic: segmentData.hasMusic || false,
      musicStartOffset: segmentData.musicStartOffset || null,
      musicEndOffset: segmentData.musicEndOffset || null,
      audioFingerprint: null,
      visualFingerprint: null,
      signatures: [],
    };

    const savedSegment = this.storage.addSegment(videoId, videoName, this.currentDuration, segment);
    
    // Processamento assincrono de fingerprints
    this._generateFingerprintsForSegment(videoId, savedSegment, targetFile);
    
    return savedSegment;
  }

  async _generateFingerprintsForSegment(videoId, segment, targetFile) {
    if (segment.hasMusic && !segment.audioFingerprint) {
      try {
        const start = segment.startTime + (segment.musicStartOffset || 0);
        const end = segment.endTime - (segment.musicEndOffset || 0);
        const duration = end - start;
        if (duration > 0) {
          const hashes = await generateAudioFingerprint(targetFile, start, duration);
          this.storage.updateSegment(videoId, segment.id, { audioFingerprint: hashes });
          console.log(`[Segments] Fingerprint gerado para ${segment.name} (${hashes.length} hashes)`);
        }
      } catch (err) {
        console.error('[Segments] Erro ao gerar fingerprint:', err);
      }
    }
  }

  async _runBackgroundScan() {
    if (!ffmpegPath || !this.currentTarget) return;
    
    // Obter todas as assinaturas globais (todos os segmentos de todos os videos)
    // No futuro, isso pode ser otimizado para um banco de dados global separado
    const allVideos = this.storage.getAllVideoIds();
    const globalSignatures = [];
    for (const vid of allVideos) {
      if (vid === this.currentVideoId) continue; // ignora video atual
      const segments = this.storage.getEnabledSegments(vid);
      for (const seg of segments) {
        if (seg.audioFingerprint && seg.audioFingerprint.length > 0) {
          globalSignatures.push(seg);
        }
      }
    }

    if (globalSignatures.length === 0) return; // Nenhuma assinatura conhecida

    try {
      console.log(`[Segments] Iniciando scan para ${globalSignatures.length} assinaturas...`);
      
      // Para simplificar a Fase 2, vamos extrair os primeiros 600 segundos (10 minutos)
      // e os ultimos 600 segundos, que cobrem 99% das vinhetas e creditos.
      const headDuration = Math.min(600, this.currentDuration);
      const headHashes = await generateAudioFingerprint(this.currentTarget, 0, headDuration);
      
      const tailStart = Math.max(0, this.currentDuration - 600);
      const tailDuration = this.currentDuration - tailStart;
      let tailHashes = [];
      if (tailDuration > 0 && tailStart > headDuration) {
        tailHashes = await generateAudioFingerprint(this.currentTarget, tailStart, tailDuration);
      }

      for (const sig of globalSignatures) {
        // Tenta matching no inicio do video
        let bestMatch = matchAudioFingerprint(sig.audioFingerprint, headHashes);
        let matchBaseTime = 0;
        
        // Se nao encontrou no inicio com confianca alta, tenta no final
        if (bestMatch.confidence < 0.85 && tailHashes.length > 0) {
          const tailMatch = matchAudioFingerprint(sig.audioFingerprint, tailHashes);
          if (tailMatch.confidence > bestMatch.confidence) {
            bestMatch = tailMatch;
            matchBaseTime = tailStart;
          }
        }

        if (bestMatch.confidence >= 0.85) {
          // Ja existe um segmento igual (mesmo nome+tipo) neste video? O scan
          // roda de novo a cada load, inclusive replays do mesmo video ja
          // escaneado antes — sem essa checagem, cada replay inseria outro
          // "Auto-detectado" idêntico por cima do anterior.
          const alreadyDetected = this.storage.getSegments(this.currentVideoId)
            .some((s) => s.name === sig.name && s.type === sig.type);
          if (alreadyDetected) continue;

          // Detecao positiva!
          const sigMusicDuration = (sig.endTime - (sig.musicEndOffset||0)) - (sig.startTime + (sig.musicStartOffset||0));
          const newStart = matchBaseTime + bestMatch.matchTimeOffset - (sig.musicStartOffset || 0);
          const newEnd = newStart + (sig.endTime - sig.startTime);

          console.log(`[Segments] Auto-detectado: ${sig.name} (Conf: ${bestMatch.confidence.toFixed(2)}) em ${newStart}s`);

          // Adiciona ao video atual silenciosamente
          this.storage.addSegment(this.currentVideoId, "Auto-detectado", this.currentDuration, {
            name: sig.name,
            type: sig.type,
            startTime: newStart,
            endTime: newEnd,
            enabled: true,
            hasMusic: true,
            audioFingerprint: sig.audioFingerprint // Reutiliza
          });
          
          // Dispara re-render da UI (via broadcast de deteccao de novo segmento salvo)
          this.emit('segment:detected', { id: 'auto', name: `Nova ${sig.name} detectada!` });
        }
      }
    } catch (err) {
      console.error('[Segments] Falha no scan em background:', err);
    }
  }

  updateSegment(segmentId, updates) {
    if (!this.currentVideoId) return null;
    
    // Se alterou os tempos ou offset e tem musica, zera o fingerprint para ser re-gerado
    if (updates.startTime !== undefined || updates.endTime !== undefined || 
        updates.musicStartOffset !== undefined || updates.musicEndOffset !== undefined ||
        updates.hasMusic !== undefined) {
      updates.audioFingerprint = null;
    }
    
    const updated = this.storage.updateSegment(this.currentVideoId, segmentId, updates);
    if (updated && updated.hasMusic && !updated.audioFingerprint) {
      this._generateFingerprintsForSegment(this.currentVideoId, updated, this.currentTarget);
    }
    return updated;
  }

  deleteSegment(segmentId) {
    if (!this.currentVideoId) return false;
    return this.storage.deleteSegment(this.currentVideoId, segmentId);
  }

  listSegments() {
    if (!this.currentVideoId) return [];
    return this.storage.getSegments(this.currentVideoId);
  }

  toggleSegment(segmentId, enabled) {
    if (!this.currentVideoId) return null;
    return this.storage.toggleSegment(this.currentVideoId, segmentId, enabled);
  }

  // --- Operacoes de player ---

  /**
   * Pula para o final (endTime) do segmento especificado.
   * O seek eh absoluto e exato.
   */
  skip(segmentId) {
    const segments = this.listSegments();
    const segment = segments.find(s => s.id === segmentId);
    if (segment) {
      this.player.seekAbsolute(segment.endTime);
      this._activeSegmentId = null; // evitar re-deteccao imediata
    }
  }

  /**
   * Pre-visualiza um segmento: faz seek pro startTime, toca, e pausa
   * automaticamente quando chegar no endTime. Ideal para o usuario
   * verificar se a selecao esta correta antes de salvar.
   */
  preview(segmentId) {
    const segments = this.listSegments();
    const segment = segments.find(s => s.id === segmentId);
    if (!segment) return;

    // Remove listener de preview anterior, se existir
    if (this._previewListener) {
      this.player.removeListener('status', this._previewListener);
      this._previewListener = null;
    }

    this._previewing = true;
    this.player.seekAbsolute(segment.startTime);
    this.player.play();

    this._previewListener = (state) => {
      if (state.position >= segment.endTime) {
        this.player.pause();
        this.player.removeListener('status', this._previewListener);
        this._previewListener = null;
        this._previewing = false;
      }
    };
    this.player.on('status', this._previewListener);
  }

  /**
   * Pre-visualiza um segmento inline — variante usada pelo editor onde o
   * segmento ainda nao foi salvo. Recebe startTime/endTime diretamente.
   */
  previewRange(startTime, endTime) {
    if (this._previewListener) {
      this.player.removeListener('status', this._previewListener);
      this._previewListener = null;
    }

    this._previewing = true;
    this.player.seekAbsolute(startTime);
    this.player.play();

    this._previewListener = (state) => {
      if (state.position >= endTime) {
        this.player.pause();
        this.player.removeListener('status', this._previewListener);
        this._previewListener = null;
        this._previewing = false;
      }
    };
    this.player.on('status', this._previewListener);
  }

  // --- Configuracoes de segmentos ---

  getSettings() {
    return {
      detectEnabled: this.settings.get('segmentDetectEnabled') !== false,
      autoSkip: this.settings.get('segmentAutoSkip') === true,
      minConfidence: this.settings.get('segmentMinConfidence') || 0.9,
    };
  }

  setSettings(newSettings) {
    if ('detectEnabled' in newSettings) this.settings.set('segmentDetectEnabled', newSettings.detectEnabled);
    if ('autoSkip' in newSettings) this.settings.set('segmentAutoSkip', newSettings.autoSkip);
    if ('minConfidence' in newSettings) this.settings.set('segmentMinConfidence', newSettings.minConfidence);
    return this.getSettings();
  }

  // --- Captura de frames via FFmpeg ---

  /**
   * Captura um frame num instante especifico do video atual usando FFmpeg.
   * O FFmpeg executa em background — nao afeta a reproducao do MPV.
   * Retorna uma Promise\<string\> com a imagem em base64 Data URI.
   */
  captureFrameAt(time) {
    return new Promise((resolve, reject) => {
      if (!ffmpegPath) {
        return reject(new Error('FFmpeg nao disponivel.'));
      }
      if (!this.currentTarget) {
        return reject(new Error('Nenhum video carregado.'));
      }

      const args = [
        '-ss', String(time),
        '-i', this.currentTarget,
        '-vframes', '1',
        '-vf', 'scale=160:-1',
        '-f', 'image2pipe',
        '-vcodec', 'png',
        '-loglevel', 'error',
        'pipe:1'
      ];

      const proc = spawn(ffmpegPath, args);
      const buffers = [];

      proc.stdout.on('data', (chunk) => buffers.push(chunk));

      proc.on('close', (code) => {
        if (code === 0 && buffers.length > 0) {
          const imgData = Buffer.concat(buffers).toString('base64');
          resolve(`data:image/png;base64,${imgData}`);
        } else {
          reject(new Error(`FFmpeg saiu com codigo ${code}`));
        }
      });

      proc.on('error', (err) => reject(err));
    });
  }

  /**
   * Captura varios frames distribuidos ao longo de um intervalo temporal.
   * Util para gerar a strip de thumbnails do editor de segmentos.
   */
  async captureFrameStrip(startTime, endTime, count = 6) {
    if (!ffmpegPath || !this.currentTarget) return [];

    const segDuration = endTime - startTime;
    const times = [];
    for (let i = 0; i < count; i++) {
      times.push(startTime + (segDuration * i / (count - 1)));
    }

    const results = [];
    for (const t of times) {
      try {
        const dataUri = await this.captureFrameAt(t);
        results.push({ time: t, image: dataUri });
      } catch {
        results.push({ time: t, image: null });
      }
    }
    return results;
  }
}

module.exports = SegmentManager;
