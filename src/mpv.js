const { spawn, execFile } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const { app } = require('electron');
const { findChildHwndByPid, positionEmbeddedWindow, listChildWindows } = require('./native-embed');
const logger = require('./services/logger');
const LiveDetector = require('./live/live-detector');
const NetworkMonitor = require('./live/network-monitor');
const BufferManager = require('./live/buffer-manager');
const StreamHealth = require('./live/stream-health');
const LatencyManager = require('./live/latency-manager');
const RecoveryManager = require('./live/recovery-manager');
const ReconnectManager = require('./live/reconnect-manager');

const appRoot = (app && app.isPackaged) ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..');
// Unica fonte do mpv usado pelo app inteiro (player e miniaturas da
// biblioteca) — de proposito SEM fallback pro mpv instalado no sistema/PATH.
// Isso garante que o app sempre roda a mesma versao testada, empacotada
// junto no instalador (ver build.extraFiles no package.json), em vez de um
// comportamento que varia dependendo do que o usuario tem instalado (ou nao)
// na maquina.
const MPV_BINARY_PATH = path.join(appRoot, 'bin', 'mpv.exe');
const MPV_CONFIG_DIR = path.join(appRoot, 'mpv-config');
const HAS_UOSC = fs.existsSync(path.join(MPV_CONFIG_DIR, 'scripts', 'uosc', 'main.lua'));

const AUTOSAVE_INTERVAL_MS = 8000;
const STATUS_INTERVAL_MS = 1000;
const RESUME_MIN_POSITION = 5;
const RESUME_END_MARGIN = 8;
// Backoff exponencial (ver ReconnectManager): com teto de 15s por tentativa,
// 40 tentativas cobrem varios minutos tentando antes de desistir de vez —
// antes eram so 5 tentativas de 3s (15s no total), tempo curto demais pra
// uma queda de rede real se resolver sozinha.
const MAX_RECONNECT_ATTEMPTS = 40;
// time-pos parado por mais que isso, com o player supostamente tocando (nao
// pausado, mpv nao reportando paused-for-cache), e tratado como stall
// "silencioso" — o watchdog do item 21/22 do pedido: nao basta o processo
// existir e nao pausar sozinho, a posicao precisa estar avancando de fato.
const WATCHDOG_STALL_MS = 4000;
// Timeouts de IPC consecutivos (5s cada, ver command()) antes de considerar
// o PROCESSO do mpv travado (nao so a rede) e reinicia-lo — IPC e um pipe
// local, entao lentidao de internet nunca deveria atrasar essas respostas.
const COMMAND_TIMEOUT_RESTART_THRESHOLD = 3;
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
  return MPV_BINARY_PATH;
}

// Info do mecanismo de reproducao pra exibir em Configuracoes > Avancado —
// confirma pro usuario que o app esta usando o mpv empacotado (nao um
// instalado a parte) e em qual versao. `--version` e um comando local
// instantaneo, sem qualquer relacao com o processo do player (que so existe
// depois do primeiro play), entao pode ser chamado a qualquer momento.
function getMpvInfo() {
  return new Promise((resolve) => {
    const binPath = resolveMpvBinary();
    if (!fs.existsSync(binPath)) {
      resolve({ available: false, path: binPath, version: null });
      return;
    }
    execFile(binPath, ['--version'], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve({ available: true, path: binPath, version: null });
        return;
      }
      const firstLine = String(stdout).split(/\r?\n/, 1)[0] || '';
      const match = firstLine.match(/mpv\s+(\S+)/i);
      resolve({ available: true, path: binPath, version: match ? match[1] : firstLine.trim() || null });
    });
  });
}

// Helpers de formatacao pros logs do Live Engine (item 33 do pedido) — dois
// helpers separados de proposito: raw-input-rate/cache-speed do mpv vem em
// BYTES/s, enquanto video-bitrate/audio-bitrate vem em BITS/s. Misturar os
// dois na mesma conta da um numero errado por 8x.
function bytesPerSecToMbps(bytesPerSec) {
  return ((bytesPerSec || 0) * 8) / 1e6;
}

function bitsPerSecToMbps(bitsPerSec) {
  return (bitsPerSec || 0) / 1e6;
}

// Toasts (item "pop-ups pequenos") pra cada faixa de velocidade que o
// LatencyManager pode reportar (ver src/live/latency-manager.js) — so as
// faixas de "recuperando atraso" tem mensagem; 'ahead'/'on-target' sao
// rotina demais pra virar toast (ver uso mais abaixo).
const SPEED_TIER_TOASTS = {
  gentle: { type: 'speed-up', message: 'Pequeno atraso — ajustando suavemente (1.03x).' },
  firm: { type: 'speed-up', message: 'Recuperando atraso — acelerando (1.08x).' },
  'max-speed': { type: 'warning', message: 'Muito atrasado — acelerando ao máximo (1.1x).' },
  jump: { type: 'warning', message: 'Muito atrasado — recuperando para o Ao Vivo.' },
};
const CATCHUP_SPEED_TIERS = new Set(['gentle', 'firm', 'max-speed', 'jump']);

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
    this._network = new NetworkMonitor();
    this._buffer = new BufferManager({
      profile: options.liveBufferProfile || 'auto',
      customTargetSecs: options.liveCustomTargetSecs,
    });
    this._health = new StreamHealth();
    this._latency = new LatencyManager();
    this._recovery = new RecoveryManager({
      command: (args) => this.command(args),
      bufferManager: this._buffer,
    });
    this._reconnect = new ReconnectManager({ maxAttempts: MAX_RECONNECT_ATTEMPTS });
    // Watchdog de "falso funcionamento" (item 21/22): posicao parada mesmo
    // com o player supostamente tocando.
    this._watchdogLastPosition = null;
    this._watchdogLastAdvanceAt = null;
    // Ultima "fase" logada do desconto de confianca por historico limpo
    // (0=nenhum, 1=testando, 2=maximo) — so pra nao logar a cada tick.
    this._lastConfidenceTier = 0;
    // Ultimo valor de demuxer-readahead-secs aplicado — evita mandar
    // set_property pro mpv a cada tick quando o alvo de buffer nao mudou.
    this._lastReadaheadSecs = null;
    // Watchdog de processo travado (item 17/23): timeouts de IPC seguidos.
    this._consecutiveCommandTimeouts = 0;
    this._restartingProcess = false;
    // Estado usado so pra detectar TRANSICOES e disparar os toasts do Live
    // Engine ('live-event', ver _notifyLiveEvent) — sem isso cada tick (1x/s)
    // repetiria o mesmo toast enquanto a condicao persistisse.
    this._lastSpeedTier = 'on-target';
    this._lastRecoveringFlag = false;
    this._exhaustedNotified = false;
    this._initialJumpDone = true;
    this._initialJumpDeadlineAt = 0;
  }

  // Notificacao pontual de uma acao do Live Engine (mudanca de velocidade,
  // salto pra borda, stall/recuperacao, reconexao...) pra UI mostrar como
  // toast — ver overlay-renderer.js. So emite (sem decidir nada sobre
  // exibicao — isso e responsabilidade da UI, que respeita a preferencia do
  // usuario em Configuracoes > Ao Vivo).
  _notifyLiveEvent(type, message) {
    this.emit('live-event', { type, message, at: Date.now() });
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
      // Timeout de rede do proprio mpv/ffmpeg pra streams travados (protocolo
      // lavf, usado por http/https/hls) — reduzido do padrao (60s) pra
      // detectar uma conexao morta bem mais rapido.
      '--network-timeout=10',
      // Reconexao no nivel do stream HTTP (ffmpeg/avio), ANTES de qualquer
      // logica de reconexao do app: uma queda breve de TCP se resolve aqui
      // sozinha, sem precisar derrubar o arquivo carregado e recomecar do
      // zero via loadfile (o que o ReconnectManager so faz quando o mpv
      // realmente desiste e fica idle).
      '--stream-lavf-o=reconnect=1,reconnect_streamed=1,reconnect_delay_max=10,reconnect_at_eof=1',
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
    const spawnedProc = spawn(resolveMpvBinary(), args, { stdio: 'ignore' });
    this.proc = spawnedProc;
    this._embeddedChildHwnd = null;
    if (this.embedHwnd) {
      this._discoverEmbeddedWindow(spawnedProc.pid);
    }
    // Guardas `this.proc === spawnedProc` nos handlers abaixo: sem isso, um
    // restart forcado (watchdog de processo travado, ver _onCommandTimeout)
    // mata o processo velho e ja spawna um novo antes do evento 'exit' do
    // velho chegar — quando esse 'exit' tardio finalmente dispara, ele NAO
    // pode zerar this.proc/timers do processo NOVO que ja esta rodando.
    spawnedProc.on('exit', () => {
      if (this.proc !== spawnedProc) return;
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
    spawnedProc.on('error', (err) => {
      logger.error('Falha ao iniciar mpv:', err.message);
      if (this.proc === spawnedProc) this.proc = null;
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
            if (!this._exhaustedNotified) {
              this._exhaustedNotified = true;
              this._notifyLiveEvent('error', 'Não foi possível reconectar — conexão perdida.');
            }
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
            this._notifyLiveEvent('reconnecting', `Reconectando... tentativa ${this._reconnect.attempts}/${this._reconnect.maxAttempts}`);
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
        this._notifyLiveEvent('recovered', 'Reconectado — reprodução retomada.');
      }
      this._exhaustedNotified = false;
      this._reconnect.reset();
      const [position, duration, paused, buffering, volume, mute, subVisible, cacheTime, partiallySeekable, fps, droppedFrames, bitrate, downloadSpeed, videoWidth, videoHeight, cacheState, audioBitrate] = await Promise.all([
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
        // demuxer-cache-state.raw-input-rate = throughput real de download
        // (bytes/s) medido pelo proprio mpv/ffmpeg — a fonte mais confiavel
        // de "velocidade de internet" que temos, ja que o app nunca ve os
        // bytes brutos (isso acontece dentro do processo do mpv). Usado pelo
        // NetworkMonitor pra medias moveis/estabilidade (Live Engine).
        this.getProperty('demuxer-cache-state', null),
        this.getProperty('audio-bitrate', null),
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
        // Zera o Live Engine inteiro pra essa sessao de live nova — sem
        // isso, estabilidade/stalls medidos de uma transmissao anterior (ou
        // de um VOD que virou live por engano) vazariam pro calculo do
        // buffer-alvo desta.
        this._network.reset();
        this._buffer.reset();
        this._health.reset();
        this._latency.reset();
        this._lastReadaheadSecs = null;
        this._lastConfidenceTier = 0;
        this._lastSpeedTier = 'on-target';
        this.command(['set_property', 'cache-pause', false]).catch(()=>{});
        // O pulo inicial pra borda ao vivo e tentado a cada tick mais abaixo
        // (ver _initialJumpDone), nao so nessa transicao — streams .ts
        // brutos costumam demorar alguns ticks pra ficarem seekable.
        this._extractTracks();
        this._logMediaDiagnostics();
        logger.live('Stream detectado como AO VIVO.');
      } else if (liveChange === 'became-not-live') {
        // Duração parou de crescer por alguns segundos: nao e (ou nao e mais) live
        s.isLive = false;
        s.dvrMode = false;
        this.command(['set_property', 'cache-pause', true]).catch(()=>{});
        this.command(['set_property', 'speed', 1.0]).catch(()=>{});
        this.command(['set_property', 'demuxer-readahead-secs', 60]).catch(()=>{});
        this._lastReadaheadSecs = null;
        this.emit('tracks', { video: [], audio: [], sub: [] }); // limpa trilhas
        logger.live('Stream deixou de ser AO VIVO.');
      }

      let liveHealth = 'good';
      let cacheAmount = 0;
      let liveDelay = 0;
      let healthScore = 100;
      let healthState = 'HEALTHY';
      let networkStats = null;
      let bufferTarget = 0;
      let bufferConfidence = null;

      // "Cérebro" da live: watchdog -> monitor de rede -> buffer adaptativo
      // -> saude/estado -> recuperacao -> mecanica de convergencia pra borda.
      if (s.isLive && !s.dvrMode) {
        // Sincronizacao inicial com a borda ao vivo — tentada a cada tick
        // (nao so uma vez) enquanto nao for bem sucedida, por ate 20s. Sem
        // isso, um stream que nao esta partially-seekable logo no primeiro
        // tick ficava PRA SEMPRE sem o pulo inicial, sobrando so o ajuste de
        // velocidade (3-8%/s) pra fechar um atraso inicial de 20-30s — o que
        // leva minutos. Streams raw .ts (comum em DLNA/IPTV) costumam
        // demorar alguns segundos pra reportar seekable=true.
        if (!this._initialJumpDone) {
          if (partiallySeekable) {
            this._initialJumpDone = true;
            this.command(['seek', 999999, 'absolute']).catch(()=>{});
            logger.live('[LIVE] sincronizacao inicial com a borda ao vivo.');
            this._notifyLiveEvent('jump', 'Sincronizando com o Ao Vivo...');
          } else if (Date.now() > this._initialJumpDeadlineAt) {
            this._initialJumpDone = true;
            logger.live('[LIVE] stream sem suporte a seek — sincronizacao inicial via ajuste de velocidade.');
          }
        }
        // Watchdog de "falso funcionamento" (item 21/22 do pedido): o
        // processo esta rodando, nao esta pausado e o mpv nao reportou
        // buffering — mas se a posicao simplesmente parou de andar, e um
        // stall silencioso que o resto do sistema nunca veria sozinho.
        if (!paused && typeof position === 'number') {
          if (this._watchdogLastPosition === null || Math.abs(position - this._watchdogLastPosition) > 0.05) {
            this._watchdogLastPosition = position;
            this._watchdogLastAdvanceAt = Date.now();
          }
        } else {
          this._watchdogLastPosition = null;
          this._watchdogLastAdvanceAt = null;
        }
        const watchdogStalled = !paused && !buffering && this._watchdogLastAdvanceAt !== null
          && (Date.now() - this._watchdogLastAdvanceAt > WATCHDOG_STALL_MS);
        const effectiveBuffering = !!buffering || watchdogStalled;
        if (watchdogStalled) {
          logger.live(`[watchdog] posicao parada ha >${WATCHDOG_STALL_MS}ms sem pause/buffering oficiais — tratando como stall.`);
        }

        // Throughput real (raw-input-rate do demuxer, com cache-speed como
        // fallback pra quando o campo nao vem preenchido) alimentando as
        // medias moveis/estabilidade do NetworkMonitor.
        const rawInputRate = (cacheState && typeof cacheState['raw-input-rate'] === 'number')
          ? cacheState['raw-input-rate']
          : (typeof downloadSpeed === 'number' ? downloadSpeed : 0);
        this._network.sample(rawInputRate);
        networkStats = this._network.getStats();

        const streamBitrateBps = (bitrate || 0) + (audioBitrate || 0);
        // Sem bitrate conhecido ainda (primeiros segundos de uma live) nao
        // ha como calcular margem real — assume neutro em vez de "otimo" ou
        // "critico" ate ter dado de verdade.
        const margin = (networkStats.hasData && streamBitrateBps > 0)
          ? (networkStats.avg10sBps * 8) / streamBitrateBps
          : 1.5;

        // Buffer-alvo adaptativo (BufferManager) a partir da margem e
        // estabilidade reais — substitui o passo fixo de 0.5s de antes.
        bufferTarget = this._buffer.computeTarget({ margin, stability: networkStats.stability });
        // "Confianca" por historico: quanto tempo limpo (sem stall) o
        // BufferManager ja acumulou e quanto isso ja descontou do alvo —
        // ver src/live/buffer-manager.js. So informativo aqui (o desconto ja
        // foi aplicado dentro de computeTarget); usado no log/debug/UI pra
        // o usuario acompanhar o "teste" de latencia acontecendo.
        bufferConfidence = {
          stableMinutes: this._buffer.stableMs / 60000,
          discountSecs: this._buffer.confidenceDiscount,
        };

        // O teto de leitura-adiante do demuxer precisa acompanhar o alvo —
        // senao um alvo maior (rede instavel pedindo bastante margem) fica
        // artificialmente limitado por um teto fixo menor que ele mesmo.
        const desiredReadahead = Math.min(40, Math.ceil(bufferTarget + 5));
        if (this._lastReadaheadSecs === null || Math.abs(desiredReadahead - this._lastReadaheadSecs) >= 1) {
          this._lastReadaheadSecs = desiredReadahead;
          this.command(['set_property', 'demuxer-readahead-secs', desiredReadahead]).catch(()=>{});
        }

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

        this._recovery.onTick(
          { buffering: effectiveBuffering, cacheAmount, target: bufferTarget },
          () => s.isLive && !s.stopRequested && !s.dvrMode && !s.quitting
        );
        if (this._recovery.isRecovering !== this._lastRecoveringFlag) {
          this._lastRecoveringFlag = this._recovery.isRecovering;
          this._notifyLiveEvent(
            this._lastRecoveringFlag ? 'stall' : 'recovered',
            this._lastRecoveringFlag ? 'Conexão instável — recuperando buffer...' : 'Buffer recuperado — retomando reprodução.'
          );
        }

        const bufferFillRatio = bufferTarget > 0 ? cacheAmount / bufferTarget : 1;
        const healthResult = this._health.update({
          margin,
          stability: networkStats.stability,
          bufferFillRatio,
          recentStallCount: this._buffer.recentStallCount,
          isBuffering: effectiveBuffering,
        });
        healthScore = healthResult.score;
        healthState = healthResult.state;
        liveHealth = this._health.liveHealthLabel;

        // Transicoes de estado sao raras e de alto valor — logadas sempre.
        // O detalhamento por tick (throughput/margem/etc.) fica atras do
        // debug flag pra nao poluir o log normal (item 33/39 do pedido).
        if (healthResult.changed) {
          logger.live(
            `[LIVE] state=${healthState} health=${healthScore} throughput=${bytesPerSecToMbps(networkStats.avg10sBps).toFixed(1)}Mbps ` +
            `bitrate=${bitsPerSecToMbps(streamBitrateBps).toFixed(1)}Mbps buffer=${cacheAmount.toFixed(1)}s alvo=${bufferTarget.toFixed(1)}s latencia=${liveDelay.toFixed(1)}s ` +
            `(desconto por historico limpo: ${bufferConfidence.discountSecs.toFixed(1)}s apos ${bufferConfidence.stableMinutes.toFixed(1)}min sem stall)`
          );
        }
        // Log dedicado (fora do AURA_DEBUG_LIVE) so quando o "teste" de
        // latencia baseado em historico muda de fase — util pro usuario
        // acompanhar isso em Configuracoes > Avancado > Logs sem precisar
        // rodar com variavel de ambiente de debug.
        const confidenceTier = bufferConfidence.discountSecs <= 0 ? 0 : (bufferConfidence.discountSecs >= 4.0 - 0.05 ? 2 : 1);
        if (confidenceTier !== this._lastConfidenceTier) {
          if (confidenceTier === 1) {
            logger.live(`[LIVE] ${bufferConfidence.stableMinutes.toFixed(1)}min sem travar — testando reduzir o buffer-alvo gradualmente.`);
            this._notifyLiveEvent('confidence', `${Math.round(bufferConfidence.stableMinutes)}min sem travar — testando reduzir o delay.`);
          } else if (confidenceTier === 2) {
            logger.live(`[LIVE] historico limpo sustentado — desconto de latencia no maximo (${bufferConfidence.discountSecs.toFixed(1)}s).`);
            this._notifyLiveEvent('confidence', `Delay reduzido ao mínimo testado (-${bufferConfidence.discountSecs.toFixed(1)}s).`);
          } else if (this._lastConfidenceTier > 0) {
            logger.live('[LIVE] desconto de latencia por historico zerado (stall novo ou perfil Estável).');
          }
          this._lastConfidenceTier = confidenceTier;
        }
        if (process.env.AURA_DEBUG_LIVE) {
          logger.live(
            `throughput=${bytesPerSecToMbps(networkStats.avg10sBps).toFixed(2)}Mbps(inst=${bytesPerSecToMbps(networkStats.instantBps).toFixed(2)} min10s=${bytesPerSecToMbps(networkStats.minRecentBps).toFixed(2)}) ` +
            `estabilidade=${(networkStats.stability * 100).toFixed(0)}% bitrate=${bitsPerSecToMbps(streamBitrateBps).toFixed(2)}Mbps margem=${margin.toFixed(2)} ` +
            `buffer=${cacheAmount.toFixed(1)}s alvo=${bufferTarget.toFixed(1)}s latencia=${liveDelay.toFixed(1)}s health=${healthScore} state=${healthState} ` +
            `estavel_ha=${bufferConfidence.stableMinutes.toFixed(1)}min desconto_confianca=${bufferConfidence.discountSecs.toFixed(1)}s`
          );
        }

        if (!paused && !effectiveBuffering && !this._recovery.isRecovering) {
          const tick = this._latency.computeTick({ liveDelay, target: bufferTarget, seekable: !!partiallySeekable });
          if (tick.tier !== this._lastSpeedTier) {
            if (CATCHUP_SPEED_TIERS.has(tick.tier)) {
              const toast = SPEED_TIER_TOASTS[tick.tier];
              if (toast) this._notifyLiveEvent(toast.type, toast.message);
            } else if (CATCHUP_SPEED_TIERS.has(this._lastSpeedTier)) {
              this._notifyLiveEvent('speed-normal', 'Velocidade normalizada — acompanhando o Ao Vivo.');
            }
            this._lastSpeedTier = tick.tier;
          }
          if (tick.seekJumpSecs > 0) {
            logger.recovery(`Atraso grande (${liveDelay.toFixed(1)}s, alvo ${bufferTarget.toFixed(1)}s). Pulando pra ponta!`);
            this._notifyLiveEvent('jump', `Pulando ${tick.seekJumpSecs.toFixed(0)}s para o Ao Vivo.`);
            this.command(['seek', tick.seekJumpSecs, 'relative']).catch(()=>{});
          }
          this.command(['set_property', 'speed', tick.speed]).catch(()=>{});
          this.currentSpeed = tick.speed;
        }
      } else {
        this._watchdogLastPosition = null;
        this._watchdogLastAdvanceAt = null;
        if (s.isLive && s.dvrMode) {
          this.command(['set_property', 'speed', 1.0]).catch(()=>{});
          this.currentSpeed = 1.0;
        }
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
        healthScore,
        healthState,
        network: networkStats,
        bufferConfidence,
        cacheAmount: cacheAmount || 0,
        targetLiveDelay: bufferTarget || 0,
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
        // Qualquer resposta valida prova que o processo ainda esta vivo e
        // respondendo — zera o contador de timeouts consecutivos (watchdog
        // de processo travado, ver _onCommandTimeout).
        this._consecutiveCommandTimeouts = 0;
        const { resolve, reject } = this.pending.get(msg.request_id);
        this.pending.delete(msg.request_id);
        if (msg.error && msg.error !== 'success') reject(new Error(msg.error));
        else resolve(msg.data);
      }
    }
  }

  // Varios timeouts de IPC SEGUIDOS (nao um isolado, que pode ser so uma
  // resposta pontual lenta) indicam que o PROCESSO do mpv travou de verdade
  // — IPC e um named pipe local, entao lentidao de internet/stream nunca
  // deveria atrasar essas respostas. Mata o processo e deixa a proxima
  // chamada de command() respawnar sozinha (start() ja faz isso quando
  // !isRunning()); o loop de status detecta idle-active=true no processo
  // novo e reconecta o alvo atual pelo caminho normal de reconexao.
  _onCommandTimeout() {
    this._consecutiveCommandTimeouts++;
    if (this._consecutiveCommandTimeouts < COMMAND_TIMEOUT_RESTART_THRESHOLD) return;
    if (this._restartingProcess || this.state.quitting) return;
    this._restartingProcess = true;
    this._consecutiveCommandTimeouts = 0;
    logger.recovery('[watchdog] processo do mpv parou de responder ao IPC — reiniciando processo.');
    try {
      if (this.proc) this.proc.kill();
    } catch {}
    setTimeout(() => { this._restartingProcess = false; }, 2000);
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
          this._onCommandTimeout();
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
    this._network.reset();
    this._buffer.reset();
    this._health.reset();
    this._latency.reset();
    this._watchdogLastPosition = null;
    this._watchdogLastAdvanceAt = null;
    this._lastReadaheadSecs = null;
    this._lastConfidenceTier = 0;
    this._lastSpeedTier = 'on-target';
    this._lastRecoveringFlag = false;
    this._exhaustedNotified = false;
    // Sincronizacao inicial com a borda ao vivo (item "20-30s de delay ja no
    // inicio" do pedido): tentada a CADA tick enquanto nao for bem sucedida,
    // nao so uma vez em 'became-live' — muitas fontes (raw .ts de IPTV/DLNA
    // em particular) so ficam partially-seekable alguns ticks depois de
    // comecar, e a tentativa unica de antes desistia pra sempre se o
    // primeiro tick nao desse certo, deixando so o ramp de velocidade
    // (3-8%/tick) pra fechar um buraco de 20-30s — o que leva minutos.
    this._initialJumpDone = false;
    this._initialJumpDeadlineAt = Date.now() + 20000;
    // Uma reconexao interna (depois de uma queda) preserva a contagem de
    // tentativas — so um load "de verdade" (arquivo novo, cast novo do
    // celular) zera o contador. Cancelar aqui tambem evita que um reconnect
    // ainda pendente de um alvo ANTERIOR dispare por cima deste load novo.
    this._reconnect.cancel();
    if (!opts.internal) this._reconnect.reset();
    this.currentSpeed = 1.0;
    // Arquivos com extensao de midia finita (mp4, mkv, etc.) nunca sao
    // tratados como live, mesmo que a duracao demore a aparecer (comum em
    // DLNA/HTTP progressivo) — evita o falso positivo que travava filmes
    // transmitidos do celular marcados como "AO VIVO".
    this._treatAsFinite = isFiniteMediaFile(target);
    // Comeca CAUTELOSO (nao os 60s de padrao do mpv, pensados pra
    // navegacao/seek em VOD) — dar 60s de teto de leitura-adiante pro
    // demuxer ANTES de sabermos se e live ou VOD deixava o mpv encher o
    // cache bem a frente da posicao de reproducao logo nos primeiros
    // segundos, exatamente a causa mais provavel do delay inicial de
    // 20-30s relatado. So alarga de volta pra 60s no ramo VOD confirmado
    // abaixo; pra live, o calculo dinamico por tick assume a partir daqui.
    this._lastReadaheadSecs = 15;
    this.command(['set_property', 'demuxer-readahead-secs', 15]).catch(()=>{});
    this.emit('load', { target });
    await this.command(['loadfile', target, 'replace']);
    const dur = await this._waitForDuration(6000);
    if (!dur && !this._treatAsFinite) {
      this.state.isLive = true;
      // Desativa cache-pause para evitar que o mpv acumule delay propositalmente
      await this.command(['set_property', 'cache-pause', false]).catch(()=>{});
    } else {
      // VOD confirmado: agora sim vale a pena um teto de leitura-adiante
      // generoso, pra seeks/scrub ficarem suaves.
      this._lastReadaheadSecs = 60;
      this.command(['set_property', 'demuxer-readahead-secs', 60]).catch(()=>{});
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

  // Perfil de buffer ao vivo (Configuracoes > Ao Vivo): auto/low/balanced/
  // stable/custom. Pode ser trocado em tempo real, com ou sem live em
  // andamento — BufferManager.setProfile so muda os limites usados no
  // proximo tick.
  setBufferProfile(profile) {
    this._buffer.setProfile(profile);
  }

  // Latencia-alvo do perfil "Personalizado" (segundos) — ver
  // BufferManager.setCustomTarget.
  setCustomTargetSecs(secs) {
    this._buffer.setCustomTarget(secs);
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
    // O buffer-alvo agora e recalculado pelo BufferManager a cada tick a
    // partir das condicoes reais de rede — nao precisa (nem deve) ser
    // sobrescrito aqui manualmente, ele volta a convergir sozinho assim que
    // sair do DVR.
    this._latency.reset();
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
  // Precisa atualizar this.currentSpeed aqui: o loop de status so o
  // reescreve automaticamente durante live/DVR — sem essa linha, o comando
  // ate mudava a velocidade de verdade no mpv, mas o proximo tick de status
  // reportava o valor antigo (1.0) pra UI, que "voltava" pra 1x visualmente
  // mesmo com o video tocando mais rapido de fato.
  setSpeed(value) {
    this.currentSpeed = value;
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
// Reaproveitado por src/library.js pra gerar miniaturas com uma instancia de
// mpv separada e headless (sem --wid, sem IPC) — mesma logica de "achar o
// executavel do mpv" usada pro player principal, sem duplicar.
module.exports.resolveMpvBinary = resolveMpvBinary;
module.exports.getMpvInfo = getMpvInfo;
