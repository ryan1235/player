const ovRoot = document.getElementById('ov-root');
const nowPlayingTitle = document.getElementById('now-playing-title');
const bufferingEl = document.getElementById('buffering-indicator');
const castSourceEl = document.getElementById('ov-cast-source');

const btnPlayPause = document.getElementById('btn-playpause');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const btnMute = document.getElementById('btn-mute');
const iconVolOn = document.getElementById('icon-vol-on');
const iconVolOff = document.getElementById('icon-vol-off');
const volumeEl = document.getElementById('volume');
const qualityContainer = document.getElementById('ov-quality-container');
const btnQuality = document.getElementById('ov-btn-quality');
const qualityMenu = document.getElementById('ov-quality-menu');
const dvrBtn = document.getElementById('ov-live-dvr-btn');
const btnFullscreen = document.getElementById('btn-fullscreen');
const iconFsEnter = document.getElementById('icon-fs-enter');
const iconFsExit = document.getElementById('icon-fs-exit');

const timeCurrentEl = document.getElementById('time-current');
const timeDurationEl = document.getElementById('time-duration');

const progressHit = document.getElementById('ov-progress-hit');
const progressBuffered = document.getElementById('ov-progress-buffered');
const progressPlayed = document.getElementById('ov-progress-played');
const progressThumb = document.getElementById('ov-progress-thumb');
const tooltipEl = document.getElementById('ov-tooltip');

const qualityInfoEl = document.getElementById('ov-quality-info');

const audioWrap = document.getElementById('ov-audio-wrap');
const btnAudioMenu = document.getElementById('btn-audio-menu');
const audioMenu = document.getElementById('ov-audio-menu');

const subtitleWrap = document.getElementById('ov-subtitle-wrap');
const btnSubtitleMenu = document.getElementById('btn-subtitle-menu');
const subtitleMenu = document.getElementById('ov-subtitle-menu');

const speedCluster = document.getElementById('ov-speed-cluster');
const btnSpeed = document.getElementById('btn-speed');
const speedMenu = document.getElementById('ov-speed-menu');

const btnMore = document.getElementById('btn-more');
const moreMenu = document.getElementById('ov-more-menu');

const modalBackdrop = document.getElementById('ov-modal-backdrop');
const modalTitleEl = document.getElementById('ov-modal-title');
const modalBodyEl = document.getElementById('ov-modal-body');
const modalCloseBtn = document.getElementById('ov-modal-close');

// Nomes amigaveis pros codigos de idioma mais comuns que o mpv reporta
// (ISO 639-1/639-2) — cai no codigo bruto em maiusculas se nao reconhecer.
const LANG_NAMES = {
  pt: 'Português', 'pt-br': 'Português', por: 'Português',
  en: 'English', eng: 'English',
  es: 'Español', spa: 'Español',
  ja: '日本語', jpn: '日本語',
  fr: 'Français', fra: 'Français', fre: 'Français',
  de: 'Deutsch', deu: 'Deutsch', ger: 'Deutsch',
  it: 'Italiano', ita: 'Italiano',
  ru: 'Русский', rus: 'Русский',
  ko: '한국어', kor: '한국어',
  zh: '中文', chi: '中文', zho: '中文',
};

function trackLabel(t) {
  if (t.title) return t.title;
  if (t.lang) return LANG_NAMES[t.lang.toLowerCase()] || t.lang.toUpperCase();
  return `Faixa ${t.id}`;
}

// --- Debug Overlay (Ctrl+Shift+D) ---
const debugEl = document.getElementById('ov-debug');
const dbg = {
  state: document.getElementById('dbg-state'),
  mode: document.getElementById('dbg-mode'),
  buffer: document.getElementById('dbg-buffer'),
  latency: document.getElementById('dbg-latency'),
  target: document.getElementById('dbg-target'),
  health: document.getElementById('dbg-health'),
  speed: document.getElementById('dbg-speed'),
  fps: document.getElementById('dbg-fps'),
  dropped: document.getElementById('dbg-dropped'),
  bitrate: document.getElementById('dbg-bitrate'),
  download: document.getElementById('dbg-download'),
  dvr: document.getElementById('dbg-dvr'),
  healing: document.getElementById('dbg-healing'),
  reconnects: document.getElementById('dbg-reconnects'),
};
let debugVisible = false;

function renderDebug(info) {
  if (!debugVisible || !info) return;
  const state = info.state || {};
  dbg.state.textContent = state.status || '—';
  dbg.mode.textContent = state.mode || (info.isLive ? 'LIVE' : 'VOD');
  dbg.buffer.textContent = typeof info.cacheAmount === 'number' ? `${info.cacheAmount.toFixed(2)}s` : '—';
  dbg.latency.textContent = typeof info.liveDelay === 'number' ? `${info.liveDelay.toFixed(2)}s` : '—';
  dbg.target.textContent = typeof info.targetLiveDelay === 'number' ? `${info.targetLiveDelay.toFixed(1)}s` : '—';
  dbg.health.textContent = info.liveHealth || '—';
  dbg.speed.textContent = typeof info.currentSpeed === 'number' ? info.currentSpeed.toFixed(2) + 'x' : '—';
  dbg.fps.textContent = info.fps ? info.fps.toFixed(2) : '—';
  dbg.dropped.textContent = info.droppedFrames ?? '—';
  dbg.bitrate.textContent = info.bitrate ? `${(info.bitrate / 1e6).toFixed(2)} Mbps` : '—';
  dbg.download.textContent = info.downloadSpeed ? `${(info.downloadSpeed / 1e6).toFixed(2)} MB/s` : '—';
  dbg.dvr.textContent = info.dvrMode ? 'ON' : 'OFF';
  dbg.healing.textContent = state.isRecovering ? 'RECUPERANDO' : state.isReconnecting ? 'RECONECTANDO' : 'PRONTO';
  dbg.reconnects.textContent = info.reconnectAttempt ? `${info.reconnectAttempt}/${info.reconnectMax}` : '0';
}

function toggleDebugOverlay() {
  debugVisible = !debugVisible;
  debugEl.hidden = !debugVisible;
}

const withErr = (fn) => (...args) => fn(...args).catch((err) => console.error(err));

function formatClock(totalSeconds) {
  const n = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// --- Estado local ---
let lastPaused = true;
let duration = 0;
let position = 0;
let scrubbing = false;

// --- Play/pause, transporte, volume, legenda, aspecto, fullscreen ---
btnPlayPause.addEventListener('click', withErr(() => window.api.togglePlayPause()));
document.getElementById('btn-back10').addEventListener('click', withErr(() => window.api.seek(-10)));
document.getElementById('btn-fwd10').addEventListener('click', withErr(() => window.api.seek(10)));
document.getElementById('btn-stop').addEventListener('click', withErr(() => window.api.stop()));
btnMute.addEventListener('click', withErr(() => window.api.toggleMute()));
volumeEl.addEventListener('input', (e) => {
  window.api.setVolume(Number(e.target.value)).catch(() => {});
});

document.getElementById('btn-screenshot').addEventListener('click', async () => {
  try {
    await window.api.screenshot();
    showToast('Captura salva');
  } catch {
    showToast('Erro ao capturar tela');
  }
});

btnFullscreen.addEventListener('click', () => {
  window.api.toggleFullscreen().catch(() => {});
});
// --- Sistema generico de menus dropdown (Qualidade/Proporção/Áudio/
// Legenda/Velocidade/Mais) — abrir um fecha os outros, clique fora fecha,
// Escape fecha. Substitui o padrao antigo onde cada menu tinha sua propria
// variavel *Open e logica de abrir/fechar repetida.
const dropdownMenus = new Map(); // id -> { button, menu, onBeforeOpen }
let openDropdownId = null;

function registerDropdown(id, button, menu, onBeforeOpen) {
  dropdownMenus.set(id, { button, menu, onBeforeOpen });
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (openDropdownId === id) {
      closeDropdowns();
      return;
    }
    if (onBeforeOpen) onBeforeOpen();
    openDropdown(id);
  });
}

function openDropdown(id) {
  closeDropdowns();
  const entry = dropdownMenus.get(id);
  if (!entry) return;
  entry.menu.classList.add('open');
  entry.button.setAttribute('aria-expanded', 'true');
  openDropdownId = id;
}

function closeDropdowns() {
  if (!openDropdownId) return;
  const entry = dropdownMenus.get(openDropdownId);
  if (entry) {
    entry.menu.classList.remove('open');
    entry.button.setAttribute('aria-expanded', 'false');
  }
  openDropdownId = null;
}

document.addEventListener('click', () => closeDropdowns());

dvrBtn.addEventListener('click', () => {
  window.api.playerReturnToLiveEdge();
});

// --- Menu de Qualidade (video) ---
let currentTracks = [];
function renderQualityMenuItems() { renderQualityMenu(); }
registerDropdown('quality', btnQuality, qualityMenu, renderQualityMenuItems);

// --- Menu de proporção / ajuste de imagem ---
const btnAspect = document.getElementById('btn-aspect');
const fitMenu = document.getElementById('ov-fit-menu');
let fitModes = [];
let currentFitId = 'original';

function renderFitMenu() {
  fitMenu.innerHTML = '';
  fitModes.forEach((mode) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'ov-menu-item' + (mode.id === currentFitId ? ' active' : '');
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', mode.id === currentFitId ? 'true' : 'false');
    item.innerHTML = `<span>${mode.label}</span><span class="ov-menu-check">✓</span>`;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      currentFitId = mode.id;
      window.api.setFitMode(mode.id).catch(() => {});
      renderFitMenu();
      closeDropdowns();
    });
    fitMenu.appendChild(item);
  });
}
registerDropdown('fit', btnAspect, fitMenu);

window.api.getFitModes().then(({ modes, current }) => {
  fitModes = modes;
  currentFitId = current;
  renderFitMenu();
});

// --- Menu de Áudio (contextual: só aparece com 2+ faixas) ---
let audioTracks = [];
function renderAudioMenu() {
  audioMenu.innerHTML = '';
  audioTracks.forEach((t) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'ov-menu-item' + (t.selected ? ' active' : '');
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', t.selected ? 'true' : 'false');
    item.innerHTML = `<span>${trackLabel(t)}</span><span class="ov-menu-check">✓</span>`;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      window.api.setAudioTrack(t.id).catch(() => {});
      closeDropdowns();
    });
    audioMenu.appendChild(item);
  });
}
registerDropdown('audio', btnAudioMenu, audioMenu, renderAudioMenu);

// --- Menu de Legendas (contextual: só aparece se houver alguma faixa) ---
let subtitleTracks = [];
let lastSubVisible = false;
function renderSubtitleMenu() {
  subtitleMenu.innerHTML = '';
  const anySelected = subtitleTracks.some((t) => t.selected) && lastSubVisible;

  const offItem = document.createElement('button');
  offItem.type = 'button';
  offItem.className = 'ov-menu-item' + (!anySelected ? ' active' : '');
  offItem.setAttribute('role', 'menuitemradio');
  offItem.setAttribute('aria-checked', !anySelected ? 'true' : 'false');
  offItem.innerHTML = '<span>Desativadas</span><span class="ov-menu-check">✓</span>';
  offItem.addEventListener('click', (e) => {
    e.stopPropagation();
    window.api.setSubtitleTrack('off').catch(() => {});
    closeDropdowns();
  });
  subtitleMenu.appendChild(offItem);

  subtitleTracks.forEach((t) => {
    const active = anySelected && t.selected;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'ov-menu-item' + (active ? ' active' : '');
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', active ? 'true' : 'false');
    item.innerHTML = `<span>${trackLabel(t)}</span><span class="ov-menu-check">✓</span>`;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      window.api.setSubtitleTrack(t.id).catch(() => {});
      closeDropdowns();
    });
    subtitleMenu.appendChild(item);
  });
}
registerDropdown('subtitle', btnSubtitleMenu, subtitleMenu, renderSubtitleMenu);

// --- Menu de Velocidade (contextual: oculto em live — o "cérebro" de
// latência já controla speed automaticamente nesse caso) ---
const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
let lastSpeed = 1.0;
function renderSpeedMenu() {
  speedMenu.innerHTML = '';
  SPEED_OPTIONS.forEach((v) => {
    const active = Math.abs(v - lastSpeed) < 0.01;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'ov-menu-item' + (active ? ' active' : '');
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('aria-checked', active ? 'true' : 'false');
    item.innerHTML = `<span>${v}x</span><span class="ov-menu-check">✓</span>`;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      window.api.setSpeed(v).catch(() => {});
      closeDropdowns();
    });
    speedMenu.appendChild(item);
  });
}
registerDropdown('speed', btnSpeed, speedMenu, renderSpeedMenu);

// --- Menu "Mais" (ações secundárias) ---
let alwaysOnTop = false;
let currentTargetUrl = null;

function renderMoreMenu() {
  moreMenu.innerHTML = '';
  const items = [
    { label: 'Forçar modo VOD/Live', onClick: () => window.api.toggleLiveMode() },
    { label: 'Informações', onClick: () => openInfoModal() },
    { label: 'Estatísticas', onClick: () => openStatsModal() },
    {
      label: 'Sempre no topo',
      state: alwaysOnTop ? 'ON' : 'OFF',
      onClick: async () => {
        alwaysOnTop = await window.api.toggleAlwaysOnTop();
      },
    },
    {
      label: 'Copiar URL',
      onClick: () => {
        if (!currentTargetUrl) return;
        window.api.copyText(currentTargetUrl);
        showToast('URL copiada');
      },
    },
  ];
  items.forEach((it) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'ov-menu-item';
    item.innerHTML = `<span>${it.label}</span>${it.state ? `<span class="ov-menu-item-state">${it.state}</span>` : ''}`;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      it.onClick();
      closeDropdowns();
    });
    moreMenu.appendChild(item);
  });
}
registerDropdown('more', btnMore, moreMenu, renderMoreMenu);

window.api.getAlwaysOnTop().then((v) => { alwaysOnTop = v; }).catch(() => {});

// --- Modal genérico (Informações / Estatísticas) ---
let modalOpen = false;
let statsModalOpen = false;

function openModal(title) {
  closeDropdowns();
  modalTitleEl.textContent = title;
  modalOpen = true;
  modalBackdrop.hidden = false;
  // requestAnimationFrame garante que o browser aplique o estado inicial
  // (hidden removido) antes de disparar a transicao de entrada.
  requestAnimationFrame(() => modalBackdrop.classList.add('open'));
}

function closeModal() {
  modalOpen = false;
  statsModalOpen = false;
  modalBackdrop.classList.remove('open');
  setTimeout(() => { if (!modalOpen) modalBackdrop.hidden = true; }, 160);
}

modalCloseBtn.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) closeModal();
});

async function openInfoModal() {
  openModal('INFORMAÇÕES');
  modalBodyEl.innerHTML = '<div class="ov-info-row"><span>Carregando…</span></div>';
  try {
    const info = await window.api.getMediaInfo();
    const rows = [];
    if (currentTargetUrl) rows.push(['Arquivo', currentTargetUrl]);
    if (info.video && info.video.width && info.video.height) {
      rows.push(['Resolução', `${info.video.width} × ${info.video.height}`]);
    }
    if (info.video && info.video.fps) rows.push(['FPS', Number(info.video.fps).toFixed(2)]);
    if (info.video && info.video.format) rows.push(['Codec de vídeo', String(info.video.format).toUpperCase()]);
    if (info.video && info.video.bitrate) rows.push(['Bitrate de vídeo', `${(info.video.bitrate / 1e6).toFixed(2)} Mbps`]);
    if (info.video && info.video.hwdec && info.video.hwdec !== 'no') rows.push(['Decodificação', info.video.hwdec]);
    if (info.audio && info.audio.codec) rows.push(['Codec de áudio', String(info.audio.codec).toUpperCase()]);
    if (info.audio && info.audio.channels) rows.push(['Canais de áudio', String(info.audio.channels)]);
    if (info.audio && info.audio.bitrate) rows.push(['Bitrate de áudio', `${Math.round(info.audio.bitrate / 1000)} kbps`]);
    rows.push(['Tipo', lastStatusInfo && lastStatusInfo.isLive ? 'AO VIVO' : 'VOD']);
    if (lastStatusInfo && lastStatusInfo.isLive && typeof lastStatusInfo.liveDelay === 'number') {
      rows.push(['Latência', `${lastStatusInfo.liveDelay.toFixed(1)}s`]);
    }
    modalBodyEl.innerHTML = rows.length
      ? rows.map(([k, v]) => `<div class="ov-info-row"><span>${k}</span><span>${v}</span></div>`).join('')
      : '<div class="ov-info-row"><span>Sem dados disponíveis.</span></div>';
  } catch (err) {
    modalBodyEl.innerHTML = '<div class="ov-info-row"><span>Erro ao carregar informações.</span></div>';
  }
}

function renderStatsBody() {
  const info = lastStatusInfo || {};
  const state = info.state || {};
  const rows = [
    ['Estado', state.status || '—'],
    ['Buffer', typeof info.cacheAmount === 'number' ? `${info.cacheAmount.toFixed(2)}s` : '—'],
    ['Latência', typeof info.liveDelay === 'number' ? `${info.liveDelay.toFixed(2)}s` : '—'],
    ['Download', info.downloadSpeed ? `${(info.downloadSpeed / 1e6).toFixed(2)} MB/s` : '—'],
    ['Bitrate', info.bitrate ? `${(info.bitrate / 1e6).toFixed(2)} Mbps` : '—'],
    ['FPS', info.fps ? info.fps.toFixed(2) : '—'],
    ['Frames perdidos', info.droppedFrames ?? '—'],
    ['Reconexões', info.reconnectAttempt ? `${info.reconnectAttempt}/${info.reconnectMax}` : '0'],
  ];
  modalBodyEl.innerHTML = rows.map(([k, v]) => `<div class="ov-stat-row"><span>${k}</span><span>${v}</span></div>`).join('');
}

function openStatsModal() {
  openModal('ESTATÍSTICAS');
  statsModalOpen = true;
  renderStatsBody();
}

function updateQualityInfo(info) {
  if (!info || info.idle || !info.videoWidth || !info.videoHeight) {
    qualityInfoEl.hidden = true;
    return;
  }
  const parts = [`${info.videoWidth}×${info.videoHeight}`];
  if (info.fps) parts.push(`${Math.round(info.fps)}fps`);
  if (info.bitrate) parts.push(`${(info.bitrate / 1e6).toFixed(1)} Mbps`);
  qualityInfoEl.textContent = parts.join(' · ');
  qualityInfoEl.hidden = false;
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
    e.preventDefault();
    toggleDebugOverlay();
    return;
  }
  if (e.key === 'Escape') {
    if (modalOpen) closeModal();
    else if (openDropdownId) closeDropdowns();
    return;
  }
  if ((e.key === 'a' || e.key === 'A') && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (fitModes && fitModes.length > 0) {
      const currentIndex = fitModes.findIndex(m => m.id === currentFitId);
      const nextIndex = (currentIndex + 1) % fitModes.length;
      const nextMode = fitModes[nextIndex];
      window.api.setFitMode(nextMode.id).then(id => {
        currentFitId = id;
        renderFitMenu();
        showToast(`Proporção: ${nextMode.label}`);
      });
    }
  }
});

window.api.onFullscreenChanged((isFullscreen) => {
  iconFsEnter.hidden = isFullscreen;
  iconFsExit.hidden = !isFullscreen;
});

// --- Barra de progresso custom (Pointer Events: mouse + touch) ---
function pctFromEvent(e) {
  const rect = progressHit.getBoundingClientRect();
  const pct = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
  return Math.min(1, Math.max(0, pct));
}

function renderProgress(pct) {
  const clamped = Math.min(1, Math.max(0, pct));
  progressPlayed.style.width = `${clamped * 100}%`;
  progressThumb.style.left = `${clamped * 100}%`;
}

function showTooltip(pct, clientX) {
  if (!duration) return;
  const rect = progressHit.getBoundingClientRect();
  tooltipEl.textContent = formatClock(pct * duration);
  tooltipEl.style.left = `${Math.min(rect.width, Math.max(0, clientX - rect.left))}px`;
  tooltipEl.classList.add('visible');
}

function hideTooltip() {
  tooltipEl.classList.remove('visible');
}

// Toast generico de status (ex.: "Proporção: 16:9", "Captura salva") —
// diferente do tooltip de tempo da barra de progresso: aparece centralizado
// e some sozinho depois de um tempo, em vez de seguir o mouse.
let toastTimer = null;
function showToast(message, duration = 1600) {
  tooltipEl.textContent = message;
  tooltipEl.style.left = '50%';
  tooltipEl.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => tooltipEl.classList.remove('visible'), duration);
}

progressHit.addEventListener('pointermove', (e) => {
  if (!scrubbing) showTooltip(pctFromEvent(e), e.clientX);
});
progressHit.addEventListener('pointerleave', () => {
  if (!scrubbing) hideTooltip();
});

progressHit.addEventListener('pointerdown', (e) => {
  if (!duration) return;
  scrubbing = true;
  progressHit.classList.add('scrubbing');
  progressHit.setPointerCapture(e.pointerId);
  const pct = pctFromEvent(e);
  renderProgress(pct);
  showTooltip(pct, e.clientX);
  timeCurrentEl.textContent = formatClock(pct * duration);
});

progressHit.addEventListener('pointermove', (e) => {
  if (!scrubbing || !duration) return;
  const pct = pctFromEvent(e);
  renderProgress(pct);
  showTooltip(pct, e.clientX);
  timeCurrentEl.textContent = formatClock(pct * duration);
});

function endScrub(e) {
  if (!scrubbing) return;
  scrubbing = false;
  progressHit.classList.remove('scrubbing');
  hideTooltip();
  if (duration) {
    const pct = pctFromEvent(e);
    window.api.seekAbsolute(pct * duration).catch(() => {});
  }
}
progressHit.addEventListener('pointerup', endScrub);
progressHit.addEventListener('pointercancel', endScrub);

// --- Estado vindo do processo principal ---
// Titulo "bonito" que o celular manda via DIDL-Lite ao castear (ver
// cast:source abaixo) — quando existe, tem prioridade sobre o nome de
// arquivo bruto extraido da URL. Os dois eventos disparam em sequencia
// sincrona pro mesmo load (source sempre antes de now-playing), entao
// isso nunca fica "grudado" de um video pro seguinte.
let pendingCastTitle = null;

window.api.onCastSource(({ remote, title } = {}) => {
  pendingCastTitle = title || null;
  if (!remote) {
    castSourceEl.hidden = true;
    return;
  }
  castSourceEl.hidden = false;
  castSourceEl.textContent = `Recebendo de ${remote}`;
});

window.api.onNowPlaying(({ target }) => {
  currentTargetUrl = target || null;
  if (pendingCastTitle) {
    nowPlayingTitle.textContent = pendingCastTitle;
    nowPlayingTitle.title = target;
    pendingCastTitle = null;
    return;
  }
  let title = target;
  try {
    const url = new URL(target);
    const last = url.pathname.split('/').filter(Boolean).pop();
    title = last ? decodeURIComponent(last) : target;
  } catch {
    const parts = target.split(/[\\/]/);
    title = parts[parts.length - 1] || target;
  }
  nowPlayingTitle.textContent = title;
  nowPlayingTitle.title = target;
});

let lastStatusInfo = null;

window.api.onPlayerStatus((info) => {
  lastStatusInfo = info;
  renderDebug(info);
  updateQualityInfo(info);
  if (statsModalOpen) renderStatsBody();

  speedCluster.hidden = !!info.isLive;
  if (!info.isLive && typeof info.currentSpeed === 'number') {
    lastSpeed = info.currentSpeed;
    btnSpeed.textContent = `${Math.round(lastSpeed * 100) / 100}x`;
    if (openDropdownId === 'speed') renderSpeedMenu();
  }

  if (info.idle) {
    if (info.connectionLost) {
      bufferingEl.hidden = false;
      bufferingEl.textContent = 'Conexão perdida';
      bufferingEl.className = 'ov-buffering ov-buffering-lost';
    } else {
      bufferingEl.hidden = true;
    }
    return;
  }

  if (info.reconnecting) {
    bufferingEl.hidden = false;
    bufferingEl.textContent = `Reconectando… (${info.reconnectAttempt}/${info.reconnectMax})`;
    bufferingEl.className = 'ov-buffering ov-buffering-warn';
  } else {
    bufferingEl.hidden = !info.buffering;
    bufferingEl.textContent = 'Carregando…';
    bufferingEl.className = 'ov-buffering';
  }

  duration = info.duration || 0;
  if (info.isLive) {
    ovRoot.classList.add('ov-live');
    if (info.dvrMode) {
      ovRoot.classList.add('ov-dvr');
      dvrBtn.classList.remove('ov-hidden');
    } else {
      ovRoot.classList.remove('ov-dvr');
      dvrBtn.classList.add('ov-hidden');
    }
    
    let cacheStr = '';
    const amt = typeof info.cacheAmount === 'number' ? info.cacheAmount : (info.liveDelay || 0);
    if (amt >= 60) {
      cacheStr = formatClock(amt);
    } else {
      cacheStr = amt.toFixed(1) + 's';
    }
    const statsEl = document.getElementById('ov-live-stats');
    statsEl.textContent = `(Buffer: ${cacheStr})`;
    statsEl.className = `ov-live-stats ${info.liveHealth || 'good'}`;
  } else {
    ovRoot.classList.remove('ov-live');
    ovRoot.classList.remove('ov-dvr');
    dvrBtn.classList.add('ov-hidden');
  }

  if (!scrubbing) {
    position = info.position || 0;
    renderProgress(duration ? position / duration : 0);
    timeCurrentEl.textContent = formatClock(position);
  }
  const bufferedPct = duration ? Math.min(100, (info.cacheTime / duration) * 100) : 0;
  progressBuffered.style.width = bufferedPct + '%';
  timeDurationEl.textContent = formatClock(duration);
  lastSubVisible = !!info.subVisible;

  const wasPaused = lastPaused;
  lastPaused = !!info.paused;
  iconPlay.hidden = !lastPaused;
  iconPause.hidden = lastPaused;
  btnPlayPause.title = lastPaused ? 'Play (Espaço)' : 'Pause (Espaço)';
  if (lastPaused) {
    clearIdleTimer();
  } else if (wasPaused) {
    armIdleTimer();
  }

  iconVolOn.hidden = !!info.mute;
  iconVolOff.hidden = !info.mute;
  if (!scrubbing && document.activeElement !== volumeEl) {
    volumeEl.value = info.volume ?? volumeEl.value;
  }
});

// --- Mostrar/esconder controles automaticamente ---
let idleTimer = null;

function showControls() {
  ovRoot.classList.remove('idle');
}

function clearIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = null;
  showControls();
}

function armIdleTimer() {
  showControls();
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!lastPaused && !openDropdownId && !modalOpen) ovRoot.classList.add('idle');
  }, 3000);
}

window.addEventListener('mousemove', () => {
  if (!lastPaused) armIdleTimer();
  else showControls();
});

window.api.onActivity(() => {
  if (!lastPaused) armIdleTimer();
  else showControls();
});

// Clique numa área vazia do vídeo (não num botão/barra) alterna a exibição
// dos controles — igual ao comportamento comum em players em telas de toque
// (e agora funciona com mouse tambem, ja que o overlay e sempre interativo).
ovRoot.addEventListener('click', (e) => {
  if (e.target !== ovRoot) return;
  if (ovRoot.classList.contains('idle')) {
    armIdleTimer();
  } else if (!lastPaused) {
    ovRoot.classList.add('idle');
    clearTimeout(idleTimer);
  }
});

// Duplo clique no vídeo alterna tela cheia e a roda do mouse ajusta o volume
// — gestos convencionais que o mpv ofereceria nativamente, mas que dependiam
// do clique atravessar o overlay (removido por travar o mouse as vezes).
ovRoot.addEventListener('dblclick', (e) => {
  if (e.target !== ovRoot) return;
  window.api.toggleFullscreen().catch(() => {});
});

ovRoot.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const next = Math.min(150, Math.max(0, Number(volumeEl.value) + (e.deltaY < 0 ? 5 : -5)));
    window.api.setVolume(next).catch(() => {});
  },
  { passive: false }
);

window.api.onPlayerTracks((tracksInfo) => {
  if (!tracksInfo) return;

  if (!tracksInfo.video || tracksInfo.video.length <= 1) {
    qualityContainer.style.display = 'none';
    currentTracks = [];
  } else {
    qualityContainer.style.display = 'block';
    currentTracks = tracksInfo.video;
    renderQualityMenu();
  }

  audioTracks = tracksInfo.audio || [];
  const audioHidden = audioTracks.length <= 1;
  audioWrap.hidden = audioHidden;
  if (!audioHidden) renderAudioMenu();

  subtitleTracks = tracksInfo.sub || [];
  const subtitleHidden = subtitleTracks.length === 0;
  subtitleWrap.hidden = subtitleHidden;
  if (!subtitleHidden) renderSubtitleMenu();
});

function renderQualityMenu() {
  qualityMenu.innerHTML = '';
  const autoEl = document.createElement('div');
  autoEl.className = 'ov-menu-item';
  autoEl.textContent = 'Automático';
  if (!currentTracks.some(t => t.selected)) autoEl.classList.add('active');
  autoEl.addEventListener('click', () => {
    window.api.playerSetVideoTrack('auto');
    closeDropdowns();
  });
  qualityMenu.appendChild(autoEl);

  currentTracks.forEach((t) => {
    const el = document.createElement('div');
    el.className = 'ov-menu-item';
    if (t.selected) el.classList.add('active');
    
    let bitrateStr = '';
    if (t.bitrate) bitrateStr = ` (${Math.round(t.bitrate / 1024)} kbps)`;
    el.textContent = `${t.title}${bitrateStr}`;
    
    el.addEventListener('click', () => {
      window.api.playerSetVideoTrack(t.id);
      closeDropdowns();
    });
    qualityMenu.appendChild(el);
  });
}
