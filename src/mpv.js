const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const { app } = require('electron');
const { findChildHwndByPid, positionEmbeddedWindow, listChildWindows } = require('./native-embed');
const logger = require('./services/logger');
const LiveDetector = require('./live/live-detector');
const LatencyManager = require('./live/latency-manager');
const RecoveryManager = require('./live/recovery-manager');
const ReconnectManager = require('./live/reconnect-manager');

const COMMON_MPV_PATHS = [
  'C:\\Program Files\\MPV Player\\mpv.exe',
  'C:\\Program Files (x86)\\MPV Player\\mpv.exe',
  'C:\\Program Files\\mpv\\mpv.exe',
  'C:\\Program Files (x86)\\mpv\\mpv.exe',
  `${process.env.LOCALAPPDATA}\\Programs\\mpv\\mpv.exe`,
];

const appRoot = (app && app.isPackaged) ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..');
const MPV_CONFIG_DIR = path.join(appRoot, 'mpv-config');
const HAS_UOSC = fs.existsSync(path.join(MPV_CONFIG_DIR, 'scripts', 'uosc', 'main.lua'));

const AUTOSAVE_INTERVAL_MS = 8000;
const STATUS_INTERVAL_MS = 1000;
const RESUME_MIN_POSITION = 5;
const RESUME_END_MARGIN = 8;
const MAX_RECONNECT_ATTEMPTS = 5;
const DEFAULT_FIT_MODE = { id: 'original', aspect: '-1', panscan: 0 };

// Mesma lista de extensoes do filtro de "Abrir arquivo" (main.js). Um arquivo
// com uma dessas extensoes tem duração fixa por definição — mesmo chegando
// via DLNA/HTTP progressivo (onde o mpv reporta a "duração conhecida até
// agora" oscilando enquanto ainda baixa), nunca deve ser tratado como live.
const FINITE_MEDIA_EXTENSIONS = /\.(mp4|mkv|avi|mov|webm|flv|m4v|ts)(\?.*)?$/i;

function isFiniteMediaFile(target) {
  if (!target) return false;
  return FINITE_MEDIA_EXTENSIONS.test(target);
}

function resolveMpvBinary() {
  const localMpv = path.join(appRoot, 'bin', 'mpv.exe');
  if (fs.existsSync(localMpv)) return localMpv;

  for (const p of COMMON_MPV_PATHS) {
    if (p && fs.existsSync(p)) return p;
  }
  return 'mpv';
}

class MPVPlayer extends EventEmitter {
  constructor(history = null, options = {}) {
    super();
    this.proc = null;
    this.socket = null;
    this.pipeName = `\\\\.\\pipe\\mpv-player-${process.pid}`;
    this.requestId = 0;
    this.pending = new Map();
    this.buffer = '';
    this.history = history;
    // Buffer bruto de getNativeWindowHandle() da janela principal (nao mais
    // uma janela dedicada) — usado tanto pro --wid quanto pra descobrir o
    // hwnd que o mpv cria ao ser embutido nele (ver _discoverEmbeddedWindow).
    this.embedHwnd = options.embedHwnd || null;
    // Valor numerico do HWND (os handles do Windows sempre cabem nos 32 bits
    // baixos, mesmo em processos 64-bit) — extraido UMA vez aqui e reusado
    // tanto no --wid quanto nas chamadas de FindWindowExW. Antes, a busca da
    // janela embutida passava o Buffer bruto direto pro koffi, que o trata
    // como "ponteiro PARA os bytes do buffer" em vez de "o HWND contido
    // nesses bytes" — resultado: a busca nunca encontrava filho nenhum,
    // sempre, mesmo com o video renderizando normalmente (o --wid ja
    // funcionava porque sempre fez essa conversao pra numero manualmente).
    this._embedHwndValue = this.embedHwnd ? this.embedHwnd.readUInt32LE(0) : null;
    this._embeddedChildHwnd = null;
    this._pendingBounds = null;
    this.currentTarget = null;
    this._autosaveTimer = null;
    this._statusTimer = null;
    this.fitMode = options.fitMode || DEFAULT_FIT_MODE;
    this.screenshotDir = options.screenshotDir || null;
    // Fonte unica de verdade do estado de reproducao/live — antes eram varios
    // booleans soltos na instancia (isLive, dvrMode, _reconnecting,
    // wasBuffering, liveModeLocked, _stopRequested), dificeis de auditar em
    // conjunto e faceis de dessincronizar. getState() deriva um resumo desse
    // objeto (mais o que os managers do Live Engine abaixo sabem) pra quem
    // precisar de uma leitura oficial (ex.: debug overlay, IPC
    // player:get-state).
    this.state = {
      isLive: false,
      dvrMode: false,
      liveModeLocked: false,
      buffering: false,
      stopRequested: false,
      // Setado por quit(): impede command() de reiniciar o mpv a partir de um
      // setTimeout de reconexao/healing que ainda estava pendente quando o
      // app fechou.
      quitting: false,
    };
    // Live Engine: cada aspecto de "manter a live saudavel" isolado no seu
    // proprio modulo (src/live/*), em vez de tudo dentro de um unico loop.
    // Nenhum deles mexe direto no this.state — devolvem resultados/expõem
    // getters, e quem decide o que fazer com isso e o loop de status abaixo.
    this._liveDetector = new LiveDetector();
    this._latency = new LatencyManager();
    this._recovery = new RecoveryManager({
      command: (args) => this.command(args),
      latencyManager: this._latency,
    });
    this._reconnect = new ReconnectManager({ maxAttempts: MAX_RECONNECT_ATTEMPTS });
  }

  // Leitura oficial e consolidada do estado do player — os modulos que
  // precisarem saber "o que o player esta fazendo agora" devem consultar
  // isto em vez de ler flags individuais ou instanciar os managers por conta
  // propria.
  getState() {
    const s = this.state;
    const mode = s.isLive ? 'LIVE' : 'VOD';
    let status;
    if (s.quitting) status = 'IDLE';
    else if (!this.currentTarget) status = 'IDLE';
    else if (this._reconnect.exhausted) status = 'ERROR';
    else if (this._reconnect.pending) status = 'RECONNECTING';
    else if (s.isLive && s.dvrMode) status = 'DVR';
    else if (s.isLive && this._recovery.isRecovering) status = 'LIVE_RECOVERING';
    else if (s.isLive && s.buffering) status = 'LIVE_BUFFERING';
    else if (s.isLive) status = 'LIVE_STABLE';
    else if (s.buffering) status = 'BUFFERING';
    else status = 'PLAYING';
    return {
      mode,
      status,
      isDVR: s.dvrMode,
      isBuffering: s.buffering,
      isRecovering: this._recovery.isRecovering,
      isReconnecting: this._reconnect.pending,
    };
  }

  isRunning() {
    return !!this.proc && !this.proc.killed;
  }

  start() {
    if (this.isRunning()) return;
    const args = [
      `--input-ipc-server=${this.pipeName}`,
      `--config-dir=${MPV_CONFIG_DIR}`,
      '--idle=yes',
      '--msg-level=all=no,ipc=v',
      '--no-terminal',
      '--force-window=yes',
      '--osc=no',
      '--osd-level=0',
      '--keep-open=yes',
      '--alang=pt-br,pt,por,eng',
      '--slang=pt-br,pt,por,eng',
      '--volume-max=150',
      '--cache=yes',
      '--demuxer-max-bytes=1000M',
      '--demuxer-max-back-bytes=200M',
      // Decodificacao por hardware quando disponivel (auto-safe cai pra
      // software sozinho se o driver/codec nao suportar) — reduz uso de CPU
      // e ajuda a evitar frames perdidos, principalmente em live 1080p.
      '--hwdec=auto-safe',
      // Por padrao o mpv usa apresentacao "flip model" no D3D11 (entrega os
      // frames direto pra GPU/compositor), que a maioria dos softwares de
      // captura de tela (Discord, OBS, etc.) nao consegue enxergar e mostra
      // como video preto. Desligar o flip forca o modelo antigo (blit), que
      // e capturavel por qualquer metodo, ao custo de uma vsync um pouco
      // menos eficiente — imperceptivel pra reproducao de video.
      '--vo=gpu',
      '--gpu-context=d3d11',
      '--d3d11-flip=no',
      `--video-aspect-override=${this.fitMode.aspect}`,
      `--panscan=${this.fitMode.panscan}`,
    ];
    if (this.screenshotDir) {
      args.push(`--screenshot-directory=${this.screenshotDir}`, '--screenshot-format=png');
    }
    if (this._embedHwndValue !== null) {
      args.push(`--wid=${this._embedHwndValue}`);
    } else {
      args.push('--title=${filename} — Player');
    }
    if (HAS_UOSC) {
      args.push('--osc=no', '--osd-bar=no');
    } else {
      args.push(
        '--osc=yes',
        '--osd-bar=no',
        '--osd-font-size=32',
        '--script-opts=osc-scalewindowed=1.3,osc-scalefullscreen=1.3,osc-deadzonesize=0,osc-minmousemove=2,osc-visibility=auto,osc-seekbarstyle=bar,osc-seekbarkeyframes=yes,osc-title=${filename}'
      );
    }
    this.proc = spawn(resolveMpvBinary(), args, { stdio: 'ignore' });
    this._embeddedChildHwnd = null;
    if (this.embedHwnd) {
      this._discoverEmbeddedWindow(this.proc.pid);
    }
    this.proc.on('exit', () => {
      this.proc = null;
      this._embeddedChildHwnd = null;
      if (this.socket) {
        this.socket.destroy();
        this.socket = null;
      }
      if (this._autosaveTimer) {
        clearInterval(this._autosaveTimer);
        this._autosaveTimer = null;
      }
      if (this._statusTimer) {
        clearInterval(this._statusTimer);
        this._statusTimer = null;
      }
    });
    this.proc.on('error', (err) => {
      logger.error('Falha ao iniciar mpv:', err.message);
      this.proc = null;
    });
    this._startAutosave();
    this._startStatusLoop();
  }

  // O mpv, ao ser embutido via --wid, vira uma janela filha nativa dentro da
  // janela principal — mas nao existe nenhuma forma dele "avisar" qual hwnd
  // acabou criando. Descobrimos procurando, entre os filhos diretos da
  // janela principal, um que pertenca ao PID do processo do mpv que acabamos
  // de iniciar. Isso pode levar uma fracao de segundo depois do spawn.
  async _discoverEmbeddedWindow(pid) {
    const stillWaiting = () => this.proc && this.proc.pid === pid;

    // Fase rapida: cobre o caso comum (janela aparece em menos de 1s).
    for (let attempt = 0; attempt < 50; attempt++) {
      await new Promise((r) => setTimeout(r, 100));
      if (!stillWaiting()) return; // processo trocou/morreu nesse meio tempo
      const hwnd = findChildHwndByPid(this._embedHwndValue, pid);
      if (hwnd) {
        this._embeddedChildHwnd = hwnd;
        if (this._pendingBounds) this.positionEmbedded(...this._pendingBounds);
        return;
      }
    }

    // Fase lenta: antes, depois desses 5s o app desistia PRA SEMPRE — se a
    // janela aparecesse um instante depois, o video nunca mais era
    // posicionado por toda a sessao desse processo do mpv (tela preta ate
    // reiniciar o app). Continua tentando, so que num ritmo bem mais lento
    // (nao ha motivo pra martelar a API do Windows a 10x/s indefinidamente).
    logger.mpv(`[embed] janela nao apareceu em 5s (pid alvo=${pid}). Filhos vistos agora: ${this._describeChildWindows()}`);
    for (let attempt = 0; attempt < 25; attempt++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (!stillWaiting()) return;
      const hwnd = findChildHwndByPid(this._embedHwndValue, pid);
      if (hwnd) {
        this._embeddedChildHwnd = hwnd;
        if (this._pendingBounds) this.positionEmbedded(...this._pendingBounds);
        logger.mpv('[embed] janela encontrada apos espera adicional.');
        return;
      }
    }
    logger.error(`[embed] nao encontrei a janela do mpv embutida na janela principal a tempo (30s). Filhos vistos no final: ${this._describeChildWindows()}`);
  }

  // So pra diagnostico: lista os filhos diretos da janela principal com seus
  // PIDs, pra entender por que a busca pelo hwnd do mpv nao esta batendo.
  _describeChildWindows() {
    try {
      const children = listChildWindows(this._embedHwndValue);
      if (!children.length) return '(nenhum filho encontrado)';
      return children.map((c) => `hwnd=${c.hwnd} pid=${c.pid}`).join(', ');
    } catch (err) {
      return `(falha ao listar: ${err.message})`;
    }
  }

  // Reposiciona a janela do mpv dentro da janela principal (equivalente ao
  // BrowserWindow.setBounds() que usariamos se o mpv estivesse embutido numa
  // janela do Electron). x/y/width/height ja devem vir em pixels fisicos
  // (main.js e responsavel por multiplicar pelo scaleFactor do monitor).
  // Se a descoberta do hwnd ainda nao terminou, guarda pra aplicar depois.
  positionEmbedded(x, y, width, height) {
    this._pendingBounds = [x, y, width, height];
    if (!this._embeddedChildHwnd) return;
    positionEmbeddedWindow(this._embeddedChildHwnd, x, y, width, height);
  }

  _startAutosave() {
    if (this._autosaveTimer || !this.history) return;
    this._autosaveTimer = setInterval(async () => {
      if (!this.isRunning() || !this.currentTarget) return;
      const idle = await this.getProperty('idle-active', true);
      if (idle) return;
      const pos = await this.getProperty('time-pos', null);
      const dur = await this.getProperty('duration', null);
      if (pos == null || pos < RESUME_MIN_POSITION) return;
      this.history.set(this.currentTarget, { position: pos, duration: dur });
    }, AUTOSAVE_INTERVAL_MS);
  }

  _startStatusLoop() {
    if (this._statusTimer) return;
    this._statusTimer = setInterval(async () => {
      if (!this.isRunning()) return;
      const s = this.state;
      const idle = await this.getProperty('idle-active', true);
      if (idle) {
        // Com --keep-open=yes o mpv nunca fica idle-active ao terminar um
        // arquivo normalmente (so pausa no ultimo frame) — entao ficar idle
        // com um currentTarget ainda setado significa que a transmissao caiu
        // de verdade (rede caiu, celular travou a tela, app de cast fechou),
        // nao que o video acabou. Vale tanto pra live quanto pra arquivo
        // finito recebido via DLNA, que e o caso mais comum na pratica.
        const canReconnect = this.currentTarget && !s.stopRequested && (s.isLive || this._treatAsFinite);
        if (canReconnect) {
          if (this._reconnect.exhausted) {
            this.emit('status', { idle: true, connectionLost: true, state: this.getState() });
            return;
          }
          // Trava contra reconexao sobreposta: esse loop roda a cada 1s, sem
          // essa trava uma reconexao que demora mais que 1s pra terminar
          // disparava outra tentativa por cima a cada tick (stop/loadFile
          // empilhados e conflitando entre si), deixando o player instavel.
          if (!this._reconnect.pending) {
            this.command(['stop']).catch(()=>{});
            this._reconnect.scheduleAttempt(
              () => this.currentTarget && !s.stopRequested && !s.quitting,
              () => this.loadFile(this.currentTarget, { internal: true })
            );
            logger.recovery(`Transmissao caiu! Tentativa ${this._reconnect.attempts}/${this._reconnect.maxAttempts}...`);
          }
          this.emit('status', {
            idle: false,
            buffering: true,
            isLive: s.isLive,
            liveHealth: 'danger',
            dvrMode: s.dvrMode,
            reconnecting: true,
            reconnectAttempt: this._reconnect.attempts,
            reconnectMax: this._reconnect.maxAttempts,
            state: this.getState(),
          });
          return;
        }
        this.emit('status', { idle: true, state: this.getState() });
        return;
      }
      // Chegou ate aqui com dados reais de reproducao: qualquer sequencia de
      // quedas anterior ja foi superada, entao zera o contador de tentativas.
      if (this._reconnect.attempts > 0) {
        logger.recovery('Reconexao bem-sucedida.');
      }
      this._reconnect.reset();
      const [position, duration, paused, buffering, volume, mute, subVisible, cacheTime, partiallySeekable, fps, droppedFrames, bitrate, downloadSpeed, videoWidth, videoHeight] = await Promise.all([
        this.getProperty('time-pos', 0),
        this.getProperty('duration', 0),
        this.getProperty('pause', false),
        this.getProperty('paused-for-cache', false),
        this.getProperty('volume', 100),
        this.getProperty('mute', false),
        this.getProperty('sub-visibility', true),
        this.getProperty('demuxer-cache-time', 0),
        this.getProperty('partially-seekable', false),
        // Usados so pelo Debug Overlay (Fase 5) — propriedades nativas do mpv,
        // as mesmas que scripts como stats.lua/uosc leem.
        this.getProperty('estimated-vf-fps', null),
        this.getProperty('frame-drop-count', null),
        this.getProperty('video-bitrate', null),
        this.getProperty('cache-speed', null),
        // Resolucao atual — pro indicador de qualidade no topo da toolbar.
        this.getProperty('video-params/w', null),
        this.getProperty('video-params/h', null),
      ]);
      s.buffering = !!buffering;

      if (process.env.AURA_DEBUG_LIVE) {
        const diff = duration > 0 && this._liveDetector.lastDuration !== null
          ? Math.abs(duration - this._liveDetector.lastDuration)
          : 0;
        logger.live(`debug pos=${position?.toFixed(2)} dur=${duration?.toFixed(2)} diff=${diff?.toFixed(3)} cacheTime=${cacheTime?.toFixed(2)} partSeek=${partiallySeekable} isLive=${s.isLive} msSinceGrowth=${this._liveDetector.msSinceGrowth}`);
      }

      // Detecção de live: a duração real de uma live cresce a cada tick (a
      // transmissão vai avançando). "partially-seekable" sozinho NÃO é um
      // Detecção de live robusta: se a duração flutua ou se a stream é parcialmente procurável
      const liveChange = this._liveDetector.update(duration, s.isLive, s.liveModeLocked);
      if (liveChange === 'became-live') {
        s.isLive = true;
        s.dvrMode = false;
        this._latency.reset(1.5); // Começa querendo 1.5s de gordura
        this.command(['set_property', 'cache-pause', false]).catch(()=>{});
        // Reduz o teto de leitura-adiante do demuxer: sem isso o mpv pode
        // deixar o cache crescer bem a frente da posicao de reproducao,
        // aumentando silenciosamente a distancia real ate a borda ao vivo
        // (o "cerebro" de latencia so reage ao que ja foi calculado, nao
        // impede o cache de inflar). 10s da folga suficiente pro auto-healing
        // sem deixar a live acumular atraso desnecessario.
        this.command(['set_property', 'demuxer-readahead-secs', 10]).catch(()=>{});
        // Streams .ts brutos (ex.: IPTV) costumam vir com partially-seekable
        // false — nesse caso o seek nao tem efeito confiavel, entao nem
        // tentamos o pulo inicial (o "cerebro" de latencia mais abaixo ainda
        // vai puxar a reproducao pra borda via ajuste de velocidade).
        if (partiallySeekable) {
          this.command(['seek', 999999, 'absolute']).catch(()=>{}); // Pulo inicial
        }
        this._extractTracks();
        this._logMediaDiagnostics();
        logger.live('Stream detectado como AO VIVO.');
      } else if (liveChange === 'became-not-live') {
        // Duração parou de crescer por alguns segundos: nao e (ou nao e mais) live
        s.isLive = false;
        s.dvrMode = false;
        this.command(['set_property', 'cache-pause', true]).catch(()=>{});
        this.command(['set_property', 'speed', 1.0]).catch(()=>{});
        this.emit('tracks', { video: [], audio: [], sub: [] }); // limpa trilhas
        logger.live('Stream deixou de ser AO VIVO.');
      }

      let liveHealth = 'good';
      let cacheAmount = 0;
      let liveDelay = 0;

      // "Cérebro" de Latência Adaptativa
      if (s.isLive && !s.dvrMode) {
        this._recovery.onTick(buffering, () => s.isLive && !s.stopRequested && !s.dvrMode && !s.quitting);

        const hasDur = (duration && duration > 0);

        if (hasDur && typeof position === 'number') {
          liveDelay = duration - position;
        } else if (typeof cacheTime === 'number') {
          liveDelay = cacheTime;
        }

        if (typeof cacheTime === 'number' && typeof position === 'number') {
            cacheAmount = cacheTime - position;
            if (cacheAmount < 0 || cacheAmount > 100000) {
               cacheAmount = cacheTime;
            }
        }

        if (!paused && !buffering) {
          const tick = this._latency.computeTick({ liveDelay, cacheAmount, seekable: !!partiallySeekable });
          liveHealth = tick.liveHealth;
          if (tick.seekJumpSecs > 0) {
            logger.recovery(`Atraso gigante (${liveDelay.toFixed(1)}s). Pulando pra ponta!`);
            this.command(['seek', tick.seekJumpSecs, 'relative']).catch(()=>{});
          }
          this.command(['set_property', 'speed', tick.speed]).catch(()=>{});
          this.currentSpeed = tick.speed;
        }
      } else if (s.isLive && s.dvrMode) {
        this.command(['set_property', 'speed', 1.0]).catch(()=>{});
        this.currentSpeed = 1.0;
      }
      this.emit('status', {
        idle: false,
        position,
        duration,
        paused,
        buffering,
        volume,
        mute,
        subVisible,
        cacheTime,
        isLive: s.isLive,
        dvrMode: s.dvrMode,
        liveHealth,
        cacheAmount: cacheAmount || 0,
        targetLiveDelay: this._latency.targetLiveDelay,
        liveDelay: liveDelay || 0,
        currentSpeed: this.currentSpeed || 1.0,
        fps: fps || 0,
        droppedFrames: droppedFrames || 0,
        bitrate: bitrate || 0,
        downloadSpeed: downloadSpeed || 0,
        videoWidth: videoWidth || 0,
        videoHeight: videoHeight || 0,
        state: this.getState(),
      });
    }, STATUS_INTERVAL_MS);
  }

  // Le o track-list e separa por tipo — usado tanto pro menu de Qualidade
  // (video) quanto pros novos menus contextuais de Audio/Legenda da toolbar.
  // Emite sempre (mesmo com listas vazias), pra UI saber que ja tem uma
  // resposta e decidir o que mostrar/esconder.
  async _extractTracks() {
    try {
      const tracks = await this.getProperty('track-list', []);
      const video = tracks.filter(t => t.type === 'video').map(t => ({
        id: t.id,
        title: t.title || (t['demux-h'] ? `${t['demux-h']}p` : 'Desconhecido'),
        bitrate: t['hls-bitrate'],
        selected: t.selected
      }));
      const mapTrack = (t) => ({
        id: t.id,
        lang: t.lang || null,
        title: t.title || null,
        codec: t.codec || null,
        selected: !!t.selected,
        default: !!t.default,
        external: !!t.external,
      });
      const audio = tracks.filter(t => t.type === 'audio').map(mapTrack);
      const sub = tracks.filter(t => t.type === 'sub').map(mapTrack);
      this.emit('tracks', { video, audio, sub });
    } catch {}
  }

  // Dados de qualidade/faixas sob demanda (ex.: modal de Informacoes) — nao
  // roda a cada tick, so quando pedido, pra nao pesar o loop de status com
  // coisa que nao muda a cada segundo.
  async getMediaInfo() {
    const tracks = await this.getProperty('track-list', []);
    const [vw, vh, vformat, vfps, vbitrate, hwdec, acodec, achannels, arate, abitrate] = await Promise.all([
      this.getProperty('video-params/w', null),
      this.getProperty('video-params/h', null),
      this.getProperty('video-format', null),
      this.getProperty('container-fps', null),
      this.getProperty('video-bitrate', null),
      this.getProperty('hwdec-current', null),
      this.getProperty('audio-codec-name', null),
      this.getProperty('audio-params/channel-count', null),
      this.getProperty('audio-params/samplerate', null),
      this.getProperty('audio-bitrate', null),
    ]);
    return {
      target: this.currentTarget,
      tracks,
      video: { width: vw, height: vh, format: vformat, fps: vfps, bitrate: vbitrate, hwdec },
      audio: { codec: acodec, channels: achannels, sampleRate: arate, bitrate: abitrate },
    };
  }

  // Diagnostico temporario: dump de todas as faixas (video/audio/legenda —
  // idioma, codec, resolucao, bitrate) e da qualidade do que esta tocando de
  // fato agora. Nao afeta nenhuma decisao do player, so loga.
  async _logMediaDiagnostics() {
    try {
      const info = await this.getMediaInfo();
      logger.player(`[diagnostico] ${info.tracks.length} faixa(s) em ${info.target}:`);
      for (const t of info.tracks) {
        const parts = [`#${t.id}`, t.type];
        if (t.lang) parts.push(`lang=${t.lang}`);
        if (t.title) parts.push(`title="${t.title}"`);
        if (t.codec) parts.push(`codec=${t.codec}`);
        if (t['demux-w'] && t['demux-h']) parts.push(`${t['demux-w']}x${t['demux-h']}`);
        if (t['demux-fps']) parts.push(`${Number(t['demux-fps']).toFixed(2)}fps`);
        if (t['demux-channel-count']) parts.push(`${t['demux-channel-count']}ch`);
        if (t['demux-samplerate']) parts.push(`${t['demux-samplerate']}Hz`);
        if (t['hls-bitrate']) parts.push(`${Math.round(t['hls-bitrate'] / 1000)}kbps`);
        if (t.forced) parts.push('forced');
        if (t.default) parts.push('default');
        if (t.external) parts.push('externa');
        if (t.selected) parts.push('[SELECIONADA]');
        logger.player('  ' + parts.join(' | '));
      }
      const { video: v, audio: a } = info;
      logger.player(
        `[diagnostico] video atual: ${v.width || '?'}x${v.height || '?'} ${v.format || '?'} @ ${v.fps ? Number(v.fps).toFixed(2) : '?'}fps, ` +
        `${v.bitrate ? Math.round(v.bitrate / 1000) + 'kbps' : 'bitrate desconhecido'}, hwdec=${v.hwdec || 'no'}`
      );
      logger.player(
        `[diagnostico] audio atual: ${a.codec || '?'} ${a.channels || '?'}ch @ ${a.sampleRate || '?'}Hz, ` +
        `${a.bitrate ? Math.round(a.bitrate / 1000) + 'kbps' : 'bitrate desconhecido'}`
      );
    } catch (err) {
      logger.error('[diagnostico] falha ao coletar informacoes de midia:', err.message);
    }
  }

  async _waitForDuration(timeoutMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const dur = await this.getProperty('duration', null);
      if (dur) return dur;
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  }

  async _tryResume(target) {
    if (!this.history) return;
    const saved = this.history.get(target);
    if (!saved || !saved.position || saved.position < RESUME_MIN_POSITION) return;
    const duration = await this._waitForDuration();
    if (duration && saved.position > duration - RESUME_END_MARGIN) return;
    try {
      await this.command(['seek', saved.position, 'absolute']);
    } catch {
      // se o seek falhar so continua do inicio
    }
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.socket && !this.socket.destroyed) return resolve();
      const attempt = (retriesLeft) => {
        const sock = net.connect(this.pipeName);
        sock.once('connect', () => {
          this.socket = sock;
          this.buffer = '';
          this.socket.on('data', (chunk) => this._onData(chunk));
          this.socket.on('error', () => {});
          resolve();
        });
        sock.once('error', () => {
          sock.destroy();
          if (retriesLeft > 0) {
            setTimeout(() => attempt(retriesLeft - 1), 300);
          } else {
            reject(new Error('Nao foi possivel conectar ao mpv. Ele esta instalado e no PATH?'));
          }
        });
      };
      attempt(20);
    });
  }

  _onData(chunk) {
    this.buffer += chunk.toString('utf8');
    let idx;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.request_id !== undefined && this.pending.has(msg.request_id)) {
        const { resolve, reject } = this.pending.get(msg.request_id);
        this.pending.delete(msg.request_id);
        if (msg.error && msg.error !== 'success') reject(new Error(msg.error));
        else resolve(msg.data);
      }
    }
  }

  async command(args) {
    if (!this.isRunning()) {
      // Um callback assincrono (reconexao/healing) pode chegar aqui depois
      // que quit() ja rodou; sem essa trava ele reiniciaria o mpv.exe por
      // baixo do pano mesmo com o app encerrando.
      if (this.state.quitting) throw new Error('Player esta encerrando, mpv nao sera reiniciado');
      this.start();
    }
    await this.connect();
    const id = ++this.requestId;
    const payload = JSON.stringify({ command: args, request_id: id }) + '\n';
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.write(payload, (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('Timeout aguardando resposta do mpv'));
        }
      }, 5000);
    });
  }

  async loadFile(target, opts = {}) {
    this.currentTarget = target;
    Object.assign(this.state, {
      isLive: false,
      liveModeLocked: false,
      dvrMode: false,
      stopRequested: false,
      buffering: false,
    });
    this._liveDetector.reset();
    this._recovery.reset();
    // Uma reconexao interna (depois de uma queda) preserva a contagem de
    // tentativas — so um load "de verdade" (arquivo novo, cast novo do
    // celular) zera o contador. Cancelar aqui tambem evita que um reconnect
    // ainda pendente de um alvo ANTERIOR dispare por cima deste load novo.
    this._reconnect.cancel();
    if (!opts.internal) this._reconnect.reset();
    this.networkHistory = [];
    this.lastNetworkTime = Date.now();
    this.lastCacheTime = 0;
    this.currentSpeed = 1.0;
    // Arquivos com extensao de midia finita (mp4, mkv, etc.) nunca sao
    // tratados como live, mesmo que a duracao demore a aparecer (comum em
    // DLNA/HTTP progressivo) — evita o falso positivo que travava filmes
    // transmitidos do celular marcados como "AO VIVO".
    this._treatAsFinite = isFiniteMediaFile(target);
    // Restaura o teto de leitura-adiante do demuxer pro padrao do mpv (60s)
    // no inicio de todo load — se a sessao anterior era uma live (que reduz
    // isso pra 10s, ver 'became-live' abaixo), esse valor persistiria no
    // processo do mpv (que fica vivo entre loads) e limitaria sem necessidade
    // o buffer de um VOD carregado em seguida.
    this.command(['set_property', 'demuxer-readahead-secs', 60]).catch(()=>{});
    this.emit('load', { target });
    await this.command(['loadfile', target, 'replace']);
    const dur = await this._waitForDuration(6000);
    if (!dur && !this._treatAsFinite) {
      this.state.isLive = true;
      // Desativa cache-pause para evitar que o mpv acumule delay propositalmente
      await this.command(['set_property', 'cache-pause', false]).catch(()=>{});
    } else {
      await this._tryResume(target);
      this._extractTracks();
      this._logMediaDiagnostics();
    }
    // video-aspect-override/panscan sao recalculados quando o video muda,
    // entao reaplicamos o modo de ajuste escolhido pelo usuario por garantia.
    await this.applyFitMode(this.fitMode).catch(() => {});
    return true;
  }

  play() {
    return this.command(['set_property', 'pause', false]);
  }

  toggleLiveMode() {
    const s = this.state;
    s.isLive = !s.isLive;
    s.dvrMode = false;
    s.liveModeLocked = true; // Lock the manual toggle so auto-detect doesn't revert it
    this.command(['set_property', 'cache-pause', !s.isLive]).catch(()=>{});
    if (!s.isLive) {
      this.command(['set_property', 'speed', 1.0]).catch(()=>{});
    }
  }

  pause() {
    return this.command(['set_property', 'pause', true]);
  }

  seek(seconds) {
    if (this.state.isLive) this.state.dvrMode = true;
    return this.command(['seek', seconds, 'relative']);
  }

  setVolume(vol) {
    return this.command(['set_property', 'volume', vol]);
  }

  stop() {
    Object.assign(this.state, {
      stopRequested: true,
      isLive: false,
      dvrMode: false,
    });
    this._reconnect.cancel();
    this._reconnect.reset();
    this._recovery.cancel();
    return this.command(['stop']);
  }

  setMute(muted) {
    return this.command(['set_property', 'mute', !!muted]);
  }

  async toggleMute() {
    const muted = await this.getProperty('mute', false);
    return this.setMute(!muted);
  }

  seekAbsolute(seconds) {
    if (this.state.isLive) this.state.dvrMode = true;
    return this.command(['seek', seconds, 'absolute']);
  }

  returnToLiveEdge() {
    this.state.dvrMode = false;
    this._latency.targetLiveDelay = 3.0;
    // Pula para a borda dinamicamente, já que absolute pode falhar.
    this.command(['seek', 999999, 'relative']).catch(()=>{});
    this.command(['set_property', 'speed', 1.0]).catch(()=>{});
  }

  setVideoTrack(trackId) {
    return this.command(['set_property', 'vid', trackId]);
  }

  async toggleSubtitles() {
    const visible = await this.getProperty('sub-visibility', true);
    return this.command(['set_property', 'sub-visibility', !visible]);
  }

  cycleSubtitleTrack() {
    return this.command(['cycle', 'sub']);
  }

  cycleAudioTrack() {
    return this.command(['cycle', 'audio']);
  }

  // Selecao direta de faixa (menus de Audio/Legenda) — cycle sozinho obriga
  // o usuario a ficar clicando ate achar a faixa certa.
  setAudioTrack(trackId) {
    return this.command(['set_property', 'aid', trackId]);
  }

  setSubtitleTrack(trackId) {
    if (trackId === 'off' || trackId == null) {
      return this.command(['set_property', 'sub-visibility', false]);
    }
    return Promise.all([
      this.command(['set_property', 'sid', trackId]),
      this.command(['set_property', 'sub-visibility', true]),
    ]);
  }

  // Velocidade manual (so faz sentido em VOD — a UI oculta esse controle em
  // live, ja que o "cerebro" de latencia reescreve `speed` a cada tick).
  setSpeed(value) {
    return this.command(['set_property', 'speed', value]);
  }

  applyFitMode(mode) {
    this.fitMode = mode;
    return Promise.all([
      this.command(['set_property', 'video-aspect-override', mode.aspect]),
      this.command(['set_property', 'panscan', mode.panscan]),
    ]);
  }

  // Salva em screenshotDir (--screenshot-directory), com o nome definido
  // pelo template padrao do mpv. Em versoes recentes o comando retorna o
  // caminho do arquivo salvo em data.filename; se nao vier, quem chamou so
  // sabe que a captura foi tentada.
  async screenshot() {
    const data = await this.command(['screenshot', 'video']);
    return { filename: data?.filename || null };
  }

  async getProperty(name, fallback = null) {
    try {
      const value = await this.command(['get_property', name]);
      return value === undefined ? fallback : value;
    } catch {
      return fallback;
    }
  }

  quit() {
    this.state.quitting = true;
    this.state.stopRequested = true;
    this._reconnect.cancel();
    this._recovery.cancel();
    if (this._autosaveTimer) {
      clearInterval(this._autosaveTimer);
      this._autosaveTimer = null;
    }
    if (this._statusTimer) {
      clearInterval(this._statusTimer);
      this._statusTimer = null;
    }
    if (this.isRunning()) {
      this.command(['quit']).catch(() => {});
      try { this.proc.kill(); } catch (e) {}
      this.proc = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}

module.exports = MPVPlayer;
