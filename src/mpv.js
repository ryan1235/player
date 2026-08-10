const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const { app } = require('electron');

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
    this.embedHwnd = options.embedHwnd || null;
    this.currentTarget = null;
    this._autosaveTimer = null;
    this._statusTimer = null;
    this.fitMode = options.fitMode || DEFAULT_FIT_MODE;
    this.isLive = false;
    this.dvrMode = false;
    this.popoutMode = false;
    this._stopRequested = false;
    this._reconnecting = false;
    this.wasBuffering = false;
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
    if (this.embedHwnd && !this.popoutMode) {
      args.push(`--wid=${this.embedHwnd}`);
    } else {
      args.push('--title=Aura Player - Pop-out (Discord)', '--border=yes');
    }
    if (HAS_UOSC && !this.popoutMode) {
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
    this.proc.on('exit', () => {
      this.proc = null;
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
      console.error('Falha ao iniciar mpv:', err.message);
      this.proc = null;
    });
    this._startAutosave();
    this._startStatusLoop();
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
      const idle = await this.getProperty('idle-active', true);
      if (idle) {
        if (this.isLive && !this._stopRequested) {
          // Zumbi Mode: A live caiu ou desconectou, vamos tentar reviver.
          // Como esse loop roda a cada 1s, sem essa trava uma reconexao que
          // demora mais que 1s pra terminar disparava outra tentativa por
          // cima a cada tick (stop/loadFile empilhados e conflitando entre
          // si), deixando o player instavel ate travar de vez.
          if (!this._reconnecting) {
            this._reconnecting = true;
            console.log('[zumbi] Live caiu! Tentando reconectar...');
            this.command(['stop']).catch(()=>{});
            setTimeout(() => {
              this._reconnecting = false;
              if (this.currentTarget && !this._stopRequested) {
                this.loadFile(this.currentTarget);
              }
            }, 3000);
          }
          this.emit('status', { idle: false, buffering: true, isLive: true, liveHealth: 'danger', dvrMode: this.dvrMode });
          return;
        }
        this.emit('status', { idle: true });
        return;
      }
      const [position, duration, paused, buffering, volume, mute, subVisible, cacheTime, partiallySeekable] = await Promise.all([
        this.getProperty('time-pos', 0),
        this.getProperty('duration', 0),
        this.getProperty('pause', false),
        this.getProperty('paused-for-cache', false),
        this.getProperty('volume', 100),
        this.getProperty('mute', false),
        this.getProperty('sub-visibility', true),
        this.getProperty('demuxer-cache-time', 0),
        this.getProperty('partially-seekable', false),
      ]);
      
      let diff = 0;
      if (duration > 0 && this.lastDuration !== null) {
         diff = Math.abs(duration - this.lastDuration);
      }
      
      console.log(`[mpv-live-debug] pos=${position?.toFixed(2)} dur=${duration?.toFixed(2)} diff=${diff?.toFixed(3)} cacheTime=${cacheTime?.toFixed(2)} partSeek=${partiallySeekable} isLive=${this.isLive} stableTicks=${this.liveStableTicks}`);
      
      // Detecção de live: a duração real de uma live cresce a cada tick (a
      // transmissão vai avançando). "partially-seekable" sozinho NÃO é um
      // Detecção de live robusta: se a duração flutua ou se a stream é parcialmente procurável
      if (duration > 0 && !this.liveModeLocked) {
        if (partiallySeekable || (diff > 0.01 && diff < 30)) {
          if (!this.isLive) {
            this.isLive = true;
            this.dvrMode = false;
            this.targetLiveDelay = 1.5; // Começa querendo 1.5s de gordura
            this.command(['set_property', 'cache-pause', false]).catch(()=>{});
            this.command(['seek', 999999, 'absolute']).catch(()=>{}); // Pulo inicial
            this._extractTracks();
          }
          this.liveStableTicks = 0;
        } else {
          this.liveStableTicks++;
          if (this.isLive && this.liveStableTicks > 3) {
            // Duração parou de crescer por alguns segundos: nao e (ou nao e mais) live
            this.isLive = false;
            this.dvrMode = false;
            this.command(['set_property', 'cache-pause', true]).catch(()=>{});
            this.command(['set_property', 'speed', 1.0]).catch(()=>{});
            this.emit('tracks', { video: [], audio: [], sub: [] }); // limpa trilhas
          }
        }
      }
      if (duration > 0) this.lastDuration = duration;

      let liveHealth = 'good';
      let cacheAmount = 0;
      let liveDelay = 0;

      // "Cérebro" de Latência Adaptativa
      if (this.isLive && !this.dvrMode) {
        if (buffering) {
          if (!this.wasBuffering) {
            this.wasBuffering = true;
            // Se travou, aumenta a margem de segurança (máximo de 15s)
            this.targetLiveDelay = Math.min((this.targetLiveDelay || 1.5) + 2.0, 15.0);
            console.log(`[live-brain] Travou! Aumentando alvo de buffer para ${this.targetLiveDelay}s`);
            
            // Força uma pausa real de 1.5s para acumular gordura e evitar micro-travamentos "pausa-play"
            this.command(['set_property', 'pause', true]).catch(()=>{});
            setTimeout(() => {
              if (this.isLive && !this._stopRequested && !this.dvrMode) {
                this.command(['set_property', 'pause', false]).catch(()=>{});
              }
            }, 1500);
          }
        } else {
          this.wasBuffering = false;
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

        if (!paused && !buffering) {
          if (this.isLive) {
            this.targetLiveDelay = this.targetLiveDelay || 3.0;
            
            if (cacheAmount < 2.0 && liveDelay > 5.0) {
              this.targetLiveDelay = Math.min(this.targetLiveDelay + 0.5, 12.0);
            } else if (cacheAmount >= 5.0) {
              this.targetLiveDelay = Math.max(this.targetLiveDelay - 0.5, 1.5);
            }

            const target = this.targetLiveDelay;

            if (liveDelay > target + 15) {
              liveHealth = 'danger';
              console.log(`[live-brain] Atraso gigante (${liveDelay.toFixed(1)}s). Pulando pra ponta!`);
              const jumpSecs = Math.max(0, liveDelay - target);
              if (jumpSecs > 0) this.command(['seek', jumpSecs, 'relative']).catch(()=>{});
              this.command(['set_property', 'speed', 1.0]).catch(()=>{});
              this.currentSpeed = 1.0;
            } else if (liveDelay > target + 2.0) {
              liveHealth = 'good';
              this.command(['set_property', 'speed', 1.1]).catch(()=>{});
              this.currentSpeed = 1.1;
            } else if (liveDelay < target - 0.5) {
              liveHealth = 'warning';
              this.command(['set_property', 'speed', 0.95]).catch(()=>{});
              this.currentSpeed = 0.95;
            } else {
              liveHealth = 'good';
              this.command(['set_property', 'speed', 1.0]).catch(()=>{});
              this.currentSpeed = 1.0;
            }
          }
        }
      } else if (this.isLive && this.dvrMode) {
        this.command(['set_property', 'speed', 1.0]).catch(()=>{});
        this.currentSpeed = 1.0;
      }
      this.emit('status', { idle: false, position, duration, paused, buffering, volume, mute, subVisible, cacheTime, isLive: this.isLive, dvrMode: this.dvrMode, liveHealth, cacheAmount: cacheAmount || 0, targetLiveDelay: this.targetLiveDelay, liveDelay: liveDelay || 0, currentSpeed: this.currentSpeed || 1.0 });
    }, STATUS_INTERVAL_MS);
  }

  async _extractTracks() {
    try {
      const tracks = await this.getProperty('track-list', []);
      const video = tracks.filter(t => t.type === 'video').map(t => ({
        id: t.id,
        title: t.title || (t['demux-h'] ? `${t['demux-h']}p` : 'Desconhecido'),
        bitrate: t['hls-bitrate'],
        selected: t.selected
      }));
      if (video.length > 0) {
        this.emit('tracks', { video });
      }
    } catch {}
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
    if (!this.isRunning()) this.start();
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

  async loadFile(target) {
    this.currentTarget = target;
    this.isLive = false;
    this.liveModeLocked = false;
    this.dvrMode = false;
    this._stopRequested = false;
    this._reconnecting = false;
    this.wasBuffering = false;
    this.networkHistory = [];
    this.lastNetworkTime = Date.now();
    this.lastCacheTime = 0;
    this.currentSpeed = 1.0;
    this.lastDuration = null;
    this.liveStableTicks = 0;
    // Arquivos com extensao de midia finita (mp4, mkv, etc.) nunca sao
    // tratados como live, mesmo que a duracao demore a aparecer (comum em
    // DLNA/HTTP progressivo) — evita o falso positivo que travava filmes
    // transmitidos do celular marcados como "AO VIVO".
    this._treatAsFinite = isFiniteMediaFile(target);
    this.emit('load', { target });
    await this.command(['loadfile', target, 'replace']);
    const dur = await this._waitForDuration(6000);
    if (!dur && !this._treatAsFinite) {
      this.isLive = true;
      // Desativa cache-pause para evitar que o mpv acumule delay propositalmente
      await this.command(['set_property', 'cache-pause', false]).catch(()=>{});
    } else {
      await this._tryResume(target);
    }
    // video-aspect-override/panscan sao recalculados quando o video muda,
    // entao reaplicamos o modo de ajuste escolhido pelo usuario por garantia.
    await this.applyFitMode(this.fitMode).catch(() => {});
    return true;
  }

  play() {
    return this.command(['set_property', 'pause', false]);
  }

  async togglePopoutMode() {
    this.popoutMode = !this.popoutMode;
    const pos = await this.getProperty('time-pos', 0).catch(() => 0);
    const vol = await this.getProperty('volume', 100).catch(() => 100);
    
    this.quit();
    
    return new Promise((resolve) => {
      setTimeout(() => {
        this.start();
        if (this.currentTarget) {
          this.command(['loadfile', this.currentTarget, 'replace', `start=${pos}`]);
          this.command(['set_property', 'volume', vol]);
        }
        resolve(this.popoutMode);
      }, 500);
    });
  }

  toggleLiveMode() {
    this.isLive = !this.isLive;
    this.dvrMode = false;
    this.liveModeLocked = true; // Lock the manual toggle so auto-detect doesn't revert it
    this.command(['set_property', 'cache-pause', !this.isLive]).catch(()=>{});
    if (!this.isLive) {
      this.command(['set_property', 'speed', 1.0]).catch(()=>{});
    }
  }

  pause() {
    return this.command(['set_property', 'pause', true]);
  }

  seek(seconds) {
    if (this.isLive) this.dvrMode = true;
    return this.command(['seek', seconds, 'relative']);
  }

  setVolume(vol) {
    return this.command(['set_property', 'volume', vol]);
  }

  stop() {
    this._stopRequested = true;
    this._reconnecting = false;
    this.isLive = false;
    this.dvrMode = false;
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
    if (this.isLive) this.dvrMode = true;
    return this.command(['seek', seconds, 'absolute']);
  }

  returnToLiveEdge() {
    this.dvrMode = false;
    this.targetLiveDelay = 3.0;
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

  applyFitMode(mode) {
    this.fitMode = mode;
    return Promise.all([
      this.command(['set_property', 'video-aspect-override', mode.aspect]),
      this.command(['set_property', 'panscan', mode.panscan]),
    ]);
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
