const ovRoot = document.getElementById('ov-root');
const nowPlayingTitle = document.getElementById('now-playing-title');
const bufferingEl = document.getElementById('buffering-indicator');
const castSourceEl = document.getElementById('ov-cast-source');

const btnPlayPause = document.getElementById('btn-playpause');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const btnMute = document.getElementById('btn-mute');
const iconVolHigh = document.getElementById('icon-vol-high');
const iconVolLow = document.getElementById('icon-vol-low');
const iconVolMute = document.getElementById('icon-vol-mute');
const volumeEl = document.getElementById('volume');
const volumeBadge = document.getElementById('volume-badge');
const ovVolume = document.getElementById('ov-volume');

function updatePlayPauseIcon(paused) {
  if (iconPlay) iconPlay.hidden = !paused;
  if (iconPause) iconPause.hidden = paused;
  if (btnPlayPause) {
    btnPlayPause.title = paused ? 'Reproduzir (Espaço)' : 'Pausar (Espaço)';
    btnPlayPause.setAttribute('aria-label', paused ? 'Reproduzir' : 'Pausar');
  }
}

function updateVolumeUI(vol, isMuted) {
  const v = Math.round(Math.max(0, vol ?? 100));
  if (volumeBadge) {
    volumeBadge.textContent = isMuted ? 'Mudo' : `${v}%`;
  }
  if (volumeEl && document.activeElement !== volumeEl) {
    volumeEl.value = v;
  }
  if (iconVolHigh && iconVolLow && iconVolMute) {
    if (isMuted || v === 0) {
      iconVolHigh.hidden = true;
      iconVolLow.hidden = true;
      iconVolMute.hidden = false;
    } else if (v <= 50) {
      iconVolHigh.hidden = true;
      iconVolLow.hidden = false;
      iconVolMute.hidden = true;
    } else {
      iconVolHigh.hidden = false;
      iconVolLow.hidden = true;
      iconVolMute.hidden = true;
    }
  }
}
const qualityContainer = document.getElementById('ov-quality-container');
const btnQuality = document.getElementById('ov-btn-quality');
const qualityMenu = document.getElementById('ov-quality-menu');
const dvrBtn = document.getElementById('ov-live-dvr-btn');
const btnPip = document.getElementById('btn-pip');
const btnFullscreen = document.getElementById('btn-fullscreen');
const iconFsEnter = document.getElementById('icon-fs-enter');
const iconFsExit = document.getElementById('icon-fs-exit');

const osdEl = document.getElementById('ov-osd');
const osdIconEl = document.getElementById('ov-osd-icon');
const osdTitleEl = document.getElementById('ov-osd-title');
const osdBarWrap = document.getElementById('ov-osd-bar-wrap');
const osdBar = document.getElementById('ov-osd-bar');

const timeCurrentEl = document.getElementById('time-current');
const timeDurationEl = document.getElementById('time-duration');

const progressHit = document.getElementById('ov-progress-hit');
const progressBuffered = document.getElementById('ov-progress-buffered');
const progressPlayed = document.getElementById('ov-progress-played');
const progressThumb = document.getElementById('ov-progress-thumb');
const progressSegments = document.getElementById('ov-progress-segments');
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

const modalEl = document.getElementById('ov-modal');
const modalBackdrop = document.getElementById('ov-modal-backdrop');
const modalTitleEl = document.getElementById('ov-modal-title');
const modalBodyEl = document.getElementById('ov-modal-body');
const modalCloseBtn = document.getElementById('ov-modal-close');

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
  liveState: document.getElementById('dbg-live-state'),
  healthScore: document.getElementById('dbg-health-score'),
  buffer: document.getElementById('dbg-buffer'),
  latency: document.getElementById('dbg-latency'),
  target: document.getElementById('dbg-target'),
  confidence: document.getElementById('dbg-confidence'),
  health: document.getElementById('dbg-health'),
  speed: document.getElementById('dbg-speed'),
  throughput: document.getElementById('dbg-throughput'),
  throughputInst: document.getElementById('dbg-throughput-inst'),
  stability: document.getElementById('dbg-stability'),
  trend: document.getElementById('dbg-trend'),
  fps: document.getElementById('dbg-fps'),
  dropped: document.getElementById('dbg-dropped'),
  bitrate: document.getElementById('dbg-bitrate'),
  download: document.getElementById('dbg-download'),
  dvr: document.getElementById('dbg-dvr'),
  healing: document.getElementById('dbg-healing'),
  reconnects: document.getElementById('dbg-reconnects'),
  stalls: document.getElementById('dbg-stalls'),
};
let debugVisible = false;

function renderDebug(info) {
  if (!debugVisible || !info) return;
  const state = info.state || {};
  const net = info.network || null;
  dbg.state.textContent = state.status || '—';
  dbg.mode.textContent = state.mode || (info.isLive ? 'LIVE' : 'VOD');
  dbg.liveState.textContent = info.healthState || '—';
  dbg.healthScore.textContent = typeof info.healthScore === 'number' ? `${info.healthScore}/100` : '—';
  dbg.buffer.textContent = typeof info.cacheAmount === 'number' ? `${info.cacheAmount.toFixed(2)}s` : '—';
  dbg.latency.textContent = typeof info.liveDelay === 'number' ? `${info.liveDelay.toFixed(2)}s` : '—';
  dbg.target.textContent = typeof info.targetLiveDelay === 'number' ? `${info.targetLiveDelay.toFixed(1)}s` : '—';
  const conf = info.bufferConfidence;
  dbg.confidence.textContent = conf
    ? `-${conf.discountSecs.toFixed(1)}s (${conf.stableMinutes.toFixed(1)}min limpo)`
    : '—';
  dbg.health.textContent = info.liveHealth || '—';
  dbg.speed.textContent = typeof info.currentSpeed === 'number' ? info.currentSpeed.toFixed(2) + 'x' : '—';
  dbg.throughput.textContent = net && net.hasData ? `${(net.avg10sBps * 8 / 1e6).toFixed(2)} Mbps` : '—';
  dbg.throughputInst.textContent = net && net.hasData ? `${(net.instantBps * 8 / 1e6).toFixed(2)} Mbps` : '—';
  dbg.stability.textContent = net && net.hasData ? `${Math.round(net.stability * 100)}%` : '—';
  dbg.trend.textContent = net ? (net.trend || '—') : '—';
  dbg.fps.textContent = info.fps ? info.fps.toFixed(2) : '—';
  dbg.dropped.textContent = info.droppedFrames ?? '—';
  dbg.bitrate.textContent = info.bitrate ? `${(info.bitrate / 1e6).toFixed(2)} Mbps` : '—';
  dbg.download.textContent = info.downloadSpeed ? `${(info.downloadSpeed / 1e6).toFixed(2)} MB/s` : '—';
  dbg.dvr.textContent = info.dvrMode ? 'ON' : 'OFF';
  dbg.healing.textContent = state.isRecovering ? 'RECUPERANDO' : state.isReconnecting ? 'RECONECTANDO' : 'PRONTO';
  dbg.reconnects.textContent = info.reconnectAttempt
    ? `${info.reconnectAttempt}/${info.reconnectMax}${info.reconnectDelayMs ? ` (proxima em ${(info.reconnectDelayMs / 1000).toFixed(0)}s)` : ''}`
    : '0';
  dbg.stalls.textContent = typeof info.recentStallCount === 'number' ? String(info.recentStallCount) : '—';
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

// --- Qualidade da conexão (Configurações > Ao Vivo) ---
let showQualityLabel = true;
window.api.getSettings().then((s) => { showQualityLabel = s.showLiveQualityLabel !== false; }).catch(() => {});
window.api.onShowLiveQualityLabelChanged((value) => { showQualityLabel = value !== false; });

// Traduz o estado interno do StreamHealth (HEALTHY/DEGRADING/CRITICAL/
// BUFFERING/RECOVERING) pro rotulo simples que o usuario comum ve — dados
// tecnicos detalhados ficam so no overlay de debug (Ctrl+Shift+D).
function qualityLabelFor(healthState) {
  switch (healthState) {
    case 'HEALTHY': return 'Excelente';
    case 'DEGRADING': return 'Boa';
    default: return 'Instável';
  }
}

// --- Pop-ups do sistema de live (Configurações > Ao Vivo > Notificações) ---
// Pilha pequena no canto superior direito: cada acao notavel do Live Engine
// (mudanca de velocidade, salto pra borda, stall/recuperacao, reconexao)
// emite um evento 'player:live-event' (mpv.js -> main.js -> aqui), so em
// TRANSICOES de estado — nunca a cada tick — entao a frequencia natural ja
// e baixa; o limite de itens visiveis abaixo e so uma garantia extra pra
// uma sequencia rapida de tentativas de reconexao nao lotar a tela.
const liveToastsContainer = document.getElementById('ov-live-toasts');
const LIVE_TOAST_MAX_VISIBLE = 3;
const LIVE_TOAST_DURATION_MS = 3800;
let showLiveEventToasts = true;
window.api.getSettings().then((s) => { showLiveEventToasts = s.showLiveEventToasts !== false; }).catch(() => {});
window.api.onShowLiveEventToastsChanged((value) => { showLiveEventToasts = value !== false; });

function dismissLiveToast(el, immediate) {
  if (!el || !el.parentNode) return;
  clearTimeout(el._dismissTimer);
  el.classList.remove('ov-live-toast-in');
  el.classList.add('ov-live-toast-out');
  const removeNow = () => { if (el.parentNode) el.parentNode.removeChild(el); };
  if (immediate) removeNow();
  else setTimeout(removeNow, 220);
}

function showLiveToast({ type, message } = {}) {
  if (!showLiveEventToasts || !message) return;
  while (liveToastsContainer.children.length >= LIVE_TOAST_MAX_VISIBLE) {
    dismissLiveToast(liveToastsContainer.lastElementChild, true);
  }
  const el = document.createElement('div');
  el.className = `ov-live-toast ov-live-toast-${type || 'info'}`;
  const dot = document.createElement('span');
  dot.className = 'ov-live-toast-dot';
  const text = document.createElement('span');
  text.textContent = message;
  el.appendChild(dot);
  el.appendChild(text);
  liveToastsContainer.insertBefore(el, liveToastsContainer.firstChild);
  requestAnimationFrame(() => el.classList.add('ov-live-toast-in'));
  el._dismissTimer = setTimeout(() => dismissLiveToast(el), LIVE_TOAST_DURATION_MS);
}

window.api.onLiveEvent((info) => showLiveToast(info));

// --- Play/pause, transporte, volume, legenda, aspecto, fullscreen ---
btnPlayPause.addEventListener('click', () => {
  lastPaused = !lastPaused;
  updatePlayPauseIcon(lastPaused);
  window.api.togglePlayPause().catch(() => {});
});
document.getElementById('btn-back10').addEventListener('click', withErr(() => window.api.seek(-10)));
document.getElementById('btn-fwd10').addEventListener('click', withErr(() => window.api.seek(10)));
document.getElementById('btn-stop').addEventListener('click', withErr(() => window.api.stop()));
btnMute.addEventListener('click', withErr(() => window.api.toggleMute()));
volumeEl.addEventListener('input', (e) => {
  const val = Number(e.target.value);
  updateVolumeUI(val, false);
  window.api.setVolume(val).catch(() => {});
});
if (ovVolume) {
  ovVolume.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = e.deltaY < 0 ? 5 : -5;
    const current = Number(volumeEl.value) || 0;
    const next = Math.max(0, Math.min(150, current + step));
    updateVolumeUI(next, false);
    window.api.setVolume(next).catch(() => {});
  }, { passive: false });
}

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

if (btnPip) {
  btnPip.addEventListener('click', () => {
    window.api.togglePip().catch(() => {});
  });
}

let osdTimer = null;
const ICON_VOL_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M4 10v4h4l5 4V6L8 10H4Z" fill="currentColor"/><path d="M17 9a4 4 0 0 1 0 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_BRIGHT_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none"><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_FWD_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M13 6l6 6-6 6M19 12h-9a5 5 0 1 0 0 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_BACK_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M11 6 5 12l6 6M5 12h9a5 5 0 1 1 0 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function showOsd(iconSvg, title, percent = null) {
  if (!osdEl) return;
  osdIconEl.innerHTML = iconSvg;
  osdTitleEl.textContent = title;
  if (percent !== null && percent !== undefined) {
    osdBarWrap.style.display = 'block';
    osdBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  } else {
    osdBarWrap.style.display = 'none';
  }
  osdEl.hidden = false;
  void osdEl.offsetWidth;
  osdEl.classList.add('show');
  if (osdTimer) clearTimeout(osdTimer);
  osdTimer = setTimeout(() => {
    osdEl.classList.remove('show');
    setTimeout(() => {
      if (!osdEl.classList.contains('show')) osdEl.hidden = true;
    }, 200);
  }, 1200);
}
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

// --- Menu de Áudio Avançado (Faixas + Modo Noturno + Delay + Equalizador) ---
let audioTracks = [];
let audioNightMode = false;
let audioDelaySecs = 0;
let audioPreset = 'flat';

const AUDIO_PRESETS_UI = [
  { id: 'flat', label: 'Padrão (Sem filtros)' },
  { id: 'cinema', label: 'Modo Cinema' },
  { id: 'dialogue', label: 'Voz Clara (Diálogos)' },
  { id: 'bass', label: 'Reforço de Graves' },
  { id: 'music', label: 'Música' },
];

async function initAudioSettings() {
  try {
    audioNightMode = await window.api.getNightMode();
    audioDelaySecs = await window.api.getAudioDelay();
    audioPreset = await window.api.getAudioPreset();
  } catch {}
}
initAudioSettings();

function renderAudioMenu() {
  audioMenu.innerHTML = '';

  // 1. Faixas de áudio (se houver mais de 1)
  if (audioTracks.length > 1) {
    const secTracks = document.createElement('div');
    secTracks.className = 'ov-menu-section-header';
    secTracks.textContent = 'Faixas de Áudio';
    audioMenu.appendChild(secTracks);

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

    const div1 = document.createElement('div');
    div1.className = 'ov-menu-divider';
    audioMenu.appendChild(div1);
  }

  // 2. Ajustes de áudio (Modo Noturno e Delay)
  const secProc = document.createElement('div');
  secProc.className = 'ov-menu-section-header';
  secProc.textContent = 'Ajustes de Áudio';
  audioMenu.appendChild(secProc);

  // Modo Noturno (Voz clara / Compressão dinâmica)
  const nightItem = document.createElement('button');
  nightItem.type = 'button';
  nightItem.className = 'ov-menu-item' + (audioNightMode ? ' active' : '');
  nightItem.innerHTML = `<span>Modo Noturno (Voz Clara)</span><span class="ov-menu-check">${audioNightMode ? 'ON' : 'OFF'}</span>`;
  nightItem.addEventListener('click', async (e) => {
    e.stopPropagation();
    audioNightMode = !audioNightMode;
    await window.api.setNightMode(audioNightMode);
    renderAudioMenu();
    showOsd(ICON_VOL_SVG, `Modo Noturno: ${audioNightMode ? 'Ativado' : 'Desativado'}`);
  });
  audioMenu.appendChild(nightItem);

  // Sincronia / Delay de áudio
  const delayRow = document.createElement('div');
  delayRow.className = 'ov-menu-control-row';
  const delayMs = Math.round(audioDelaySecs * 1000);
  delayRow.innerHTML = `
    <span>Sincronia (Delay)</span>
    <div class="ov-menu-stepper">
      <button type="button" class="ov-menu-stepper-btn" id="btn-delay-dec" title="-50ms">-</button>
      <span class="ov-menu-stepper-val">${delayMs > 0 ? '+' : ''}${delayMs}ms</span>
      <button type="button" class="ov-menu-stepper-btn" id="btn-delay-inc" title="+50ms">+</button>
    </div>
  `;
  delayRow.querySelector('#btn-delay-dec').addEventListener('click', async (e) => {
    e.stopPropagation();
    audioDelaySecs = Math.max(-5, Math.round((audioDelaySecs - 0.05) * 100) / 100);
    await window.api.setAudioDelay(audioDelaySecs);
    renderAudioMenu();
    showOsd(ICON_VOL_SVG, `Delay de Áudio: ${Math.round(audioDelaySecs * 1000)}ms`);
  });
  delayRow.querySelector('#btn-delay-inc').addEventListener('click', async (e) => {
    e.stopPropagation();
    audioDelaySecs = Math.min(5, Math.round((audioDelaySecs + 0.05) * 100) / 100);
    await window.api.setAudioDelay(audioDelaySecs);
    renderAudioMenu();
    showOsd(ICON_VOL_SVG, `Delay de Áudio: ${Math.round(audioDelaySecs * 1000)}ms`);
  });
  audioMenu.appendChild(delayRow);

  // 3. Equalizador & Presets
  const div2 = document.createElement('div');
  div2.className = 'ov-menu-divider';
  audioMenu.appendChild(div2);

  const secEq = document.createElement('div');
  secEq.className = 'ov-menu-section-header';
  secEq.textContent = 'Equalizador';
  audioMenu.appendChild(secEq);

  AUDIO_PRESETS_UI.forEach((p) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'ov-menu-item' + (audioPreset === p.id ? ' active' : '');
    item.innerHTML = `<span>${p.label}</span><span class="ov-menu-check">✓</span>`;
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      audioPreset = p.id;
      await window.api.setAudioPreset(p.id);
      renderAudioMenu();
      showOsd(ICON_VOL_SVG, `Equalizador: ${p.label}`);
    });
    audioMenu.appendChild(item);
  });
}
registerDropdown('audio', btnAudioMenu, audioMenu, renderAudioMenu);

// --- Menu de Legendas ---
let subtitleTracks = [];
let lastSubVisible = false;
let currentSubState = null;

function escapeHtml(str) {
  return String(str || '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;' }[c]));
}

window.api.getSubtitlesState().then((st) => { currentSubState = st; }).catch(() => {});
window.api.onSubtitlesStateChanged((st) => {
  currentSubState = st;
  if (subtitleMenu && subtitleMenu.classList.contains('open')) renderSubtitleMenu();
});

function renderSubtitleMenu() {
  subtitleMenu.innerHTML = '';
  const anySelected = subtitleTracks.some((t) => t.selected) && lastSubVisible;

  // Se houver uma série ativa vinculada à sessão, exibe no topo
  if (currentSubState && currentSubState.activeSeries) {
    const s = currentSubState.activeSeries;
    const seriesBadge = document.createElement('div');
    seriesBadge.className = 'ov-menu-item';
    seriesBadge.style.background = 'rgba(56, 189, 248, 0.12)';
    seriesBadge.style.borderBottom = '1px solid rgba(56, 189, 248, 0.25)';
    seriesBadge.style.color = '#38bdf8';
    seriesBadge.style.fontSize = '11.5px';
    seriesBadge.style.fontWeight = '600';
    seriesBadge.innerHTML = `<span>📺 ${escapeHtml(s.title)} (S${s.season}E${s.currentEpisode})</span>`;
    seriesBadge.title = 'Série ativa na sessão. Clique para gerenciar.';
    seriesBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      closeDropdowns();
      openSubtitlesModal(true);
    });
    subtitleMenu.appendChild(seriesBadge);
  }

  // Opção: Buscar legenda online
  const searchOnlineItem = document.createElement('button');
  searchOnlineItem.type = 'button';
  searchOnlineItem.className = 'ov-menu-item';
  searchOnlineItem.innerHTML = '<span>🔍 Buscar legenda online...</span>';
  searchOnlineItem.addEventListener('click', (e) => {
    e.stopPropagation();
    closeDropdowns();
    openSubtitlesModal(false);
  });
  subtitleMenu.appendChild(searchOnlineItem);

  // Opção: Vincular Série
  const bindItem = document.createElement('button');
  bindItem.type = 'button';
  bindItem.className = 'ov-menu-item';
  bindItem.innerHTML = '<span>📺 Vincular Série (Sessão)...</span>';
  bindItem.addEventListener('click', (e) => {
    e.stopPropagation();
    closeDropdowns();
    openSubtitlesModal(true);
  });
  subtitleMenu.appendChild(bindItem);

  // Divisor
  const sepTop = document.createElement('div');
  sepTop.style.height = '1px';
  sepTop.style.background = 'rgba(255, 255, 255, 0.1)';
  sepTop.style.margin = '4px 0';
  subtitleMenu.appendChild(sepTop);

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

  if (subtitleTracks.length === 0) {
    const emptyItem = document.createElement('div');
    emptyItem.className = 'ov-menu-item';
    emptyItem.style.opacity = '0.5';
    emptyItem.style.pointerEvents = 'none';
    emptyItem.innerHTML = '<span>Nenhuma faixa embutida</span>';
    subtitleMenu.appendChild(emptyItem);
  } else {
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

  // Divisor e opção para adicionar arquivo externo
  const sep = document.createElement('div');
  sep.style.height = '1px';
  sep.style.background = 'rgba(255, 255, 255, 0.1)';
  sep.style.margin = '4px 0';
  subtitleMenu.appendChild(sep);

  const addItem = document.createElement('button');
  addItem.type = 'button';
  addItem.className = 'ov-menu-item';
  addItem.innerHTML = '<span>+ Carregar arquivo (.srt, .vtt)...</span>';
  addItem.addEventListener('click', async (e) => {
    e.stopPropagation();
    closeDropdowns();
    try {
      const file = await window.api.addSubtitleFile();
      if (file) {
        showToast('Legenda carregada com sucesso');
      }
    } catch (err) {
      showToast('Erro ao carregar legenda: ' + err.message);
    }
  });
  subtitleMenu.appendChild(addItem);
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

function openModal(title, wide = false) {
  closeDropdowns();
  modalTitleEl.textContent = title;
  if (modalEl) modalEl.classList.toggle('ov-modal-wide', !!wide);
  modalOpen = true;
  modalBackdrop.hidden = false;
  if (window.api && window.api.focusOverlay) {
    window.api.focusOverlay().catch(() => {});
  }
  // requestAnimationFrame garante que o browser aplique o estado inicial
  // (hidden removido) antes de disparar a transicao de entrada.
  requestAnimationFrame(() => {
    modalBackdrop.classList.add('open');
    window.focus();
  });
}

function closeModal() {
  modalOpen = false;
  statsModalOpen = false;
  modalBackdrop.classList.remove('open');
  if (modalEl) modalEl.classList.remove('ov-modal-wide');
  if (window.api && window.api.focusMainWindow) {
    window.api.focusMainWindow().catch(() => {});
  }
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
    ['Saúde da conexão', typeof info.healthScore === 'number' ? `${info.healthScore}/100` : '—'],
    ['Buffer', typeof info.cacheAmount === 'number' ? `${info.cacheAmount.toFixed(2)}s` : '—'],
    ['Latência', typeof info.liveDelay === 'number' ? `${info.liveDelay.toFixed(2)}s` : '—'],
    ['Download', info.downloadSpeed ? `${(info.downloadSpeed / 1e6).toFixed(2)} MB/s` : '—'],
    ['Bitrate', info.bitrate ? `${(info.bitrate / 1e6).toFixed(2)} Mbps` : '—'],
    ['FPS', info.fps ? info.fps.toFixed(2) : '—'],
    ['Frames perdidos', info.droppedFrames ?? '—'],
    ['Reconexões', info.reconnectAttempt
      ? `${info.reconnectAttempt}/${info.reconnectMax}${info.reconnectDelayMs ? ` — próxima em ${(info.reconnectDelayMs / 1000).toFixed(0)}s` : ''}`
      : '0'],
  ];
  modalBodyEl.innerHTML = rows.map(([k, v]) => `<div class="ov-stat-row"><span>${k}</span><span>${v}</span></div>`).join('');
}

function openStatsModal() {
  openModal('ESTATÍSTICAS');
  statsModalOpen = true;
  renderStatsBody();
}

// Helper para verificar se um título é válido e não um hash/URL de streaming do YouCine/DLNA
function isCleanMediaTitle(str) {
  if (!str || typeof str !== 'string') return false;
  const s = str.trim();
  if (!s || s.length < 2) return false;
  if (/^https?:\/\//i.test(s)) return false;
  if (/content_auth|auth_token|sign=|token=|auth=/i.test(s)) return false;
  if (/^[0-9a-fA-F]{24,}/i.test(s)) return false;
  if (/^dlna-video/i.test(s)) return false;
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-/i.test(s)) return false;
  if (/^videoplayback/i.test(s)) return false;
  return true;
}

// Helper inteligente para detectar título, temporada e episódio do fluxo/URL/série ativa/histórico
function detectCandidateMediaInfo(activeSeries, recentSeries, targetUrl, npTitle, castTitle) {
  let title = '';
  let season = 1;
  let episode = 1;
  let found = false;

  // 1. Se já tem série ativa válida
  if (activeSeries && activeSeries.title && isCleanMediaTitle(activeSeries.title)) {
    return {
      title: activeSeries.title,
      season: Number(activeSeries.season) || 1,
      episode: Number(activeSeries.currentEpisode) || 1,
      imdbId: activeSeries.imdbId || null,
      found: true,
      source: 'active',
    };
  }

  // 2. Extrai de URLs ou nomes de exibição
  const candidates = [castTitle, npTitle, targetUrl].filter(Boolean);
  for (const rawStr of candidates) {
    if (!rawStr || typeof rawStr !== 'string') continue;
    const clean = (rawStr.split(/[?#]/)[0].split(/[\\/]/).pop() || '').replace(/\.[a-z0-9]{2,4}$/i, '');
    if (!clean || isGarbageTitle(clean)) continue;

    // Padrão S01E02 ou 1x02
    const seMatch = /(.*?)[ ._\-]+(?:s(\d{1,2})[ ._\-]*e(\d{1,3})|(\d{1,2})x(\d{1,3}))/i.exec(clean);
    if (seMatch) {
      const rawTitle = (seMatch[1] || '').replace(/[\._\-]/g, ' ').replace(/\s+(1080p|720p|bluray|web-dl|x264|x265|hevc|aac).*$/i, '').trim();
      if (isCleanMediaTitle(rawTitle)) {
        title = rawTitle;
        season = parseInt(seMatch[2] || seMatch[4], 10);
        episode = parseInt(seMatch[3] || seMatch[5], 10);
        found = true;
        break;
      }
    }

    // Padrão Temporada X Episodio Y
    const tempEpMatch = /(.*?)[ ._\-]+(?:temp(?:orada)?[ ._\-]*(\d{1,2}))[ ._\-]+(?:ep(?:is[oó]dio)?|e)[ ._\-]*(\d{1,3})/i.exec(clean);
    if (tempEpMatch) {
      const rawTitle = (tempEpMatch[1] || '').replace(/[\._\-]/g, ' ').replace(/\s+(1080p|720p|bluray|web-dl|x264|x265|hevc|aac).*$/i, '').trim();
      if (isCleanMediaTitle(rawTitle)) {
        title = rawTitle;
        season = parseInt(tempEpMatch[2], 10);
        episode = parseInt(tempEpMatch[3], 10);
        found = true;
        break;
      }
    }

    // Padrão Ep 02 ou E02 sem temporada explícita
    const epMatch = /(.*?)[ ._\-]+(?:ep(?:is[oó]dio)?|e)[ ._\-]*(\d{1,3})/i.exec(clean);
    if (epMatch) {
      const rawTitle = (epMatch[1] || '').replace(/[\._\-]/g, ' ').replace(/\s+(1080p|720p|bluray|web-dl|x264|x265|hevc|aac).*$/i, '').trim();
      if (isCleanMediaTitle(rawTitle)) {
        title = rawTitle;
        season = 1;
        episode = parseInt(epMatch[2], 10);
        found = true;
        break;
      }
    }

    // Fallback: tenta pegar apenas título limpo
    const plainTitle = clean.replace(/[\._\-]/g, ' ').replace(/\s+(1080p|720p|bluray|web-dl|x264|x265|hevc|aac).*$/i, '').trim();
    if (isCleanMediaTitle(plainTitle) && !title) {
      title = plainTitle;
    }
  }

  // 3. Se não achou temporada/episódio, mas tem série recente compatível no histórico
  if (Array.isArray(recentSeries) && recentSeries.length > 0) {
    const top = recentSeries[0];
    if (!title && top.title) {
      title = top.title;
    }
    if (!found && top.title && (!title || title.toLowerCase().includes(top.title.toLowerCase()) || top.title.toLowerCase().includes(title.toLowerCase()))) {
      season = Number(top.season) || 1;
      episode = (Number(top.episode) || 0) + 1;
      return {
        title: top.title,
        season,
        episode,
        imdbId: top.imdbId || null,
        found: true,
        source: 'recent',
      };
    }
  }

  return {
    title,
    season,
    episode,
    imdbId: null,
    found,
    source: found ? 'parsed' : 'default',
  };
}

// --- Modal de Legendas Online & Sessão de Séries ---
async function openSubtitlesModal(autoFocusBind = false) {
  openModal(autoFocusBind ? 'VINCULAR SÉRIE' : 'LEGENDAS ONLINE', true);
  modalBodyEl.innerHTML = '<div class="ov-info-row"><span>Carregando dados...</span></div>';

  const state = await window.api.getSubtitlesState().catch(() => null);
  currentSubState = state;

  const isConfigured = state && (state.subdlConfigured || state.openSubtitlesConfigured);
  const activeSeries = state ? state.activeSeries : null;
  const recentSeries = (state && state.recentSeries) || [];
  const quota = state && state.quota;

  const npText = nowPlayingTitle && nowPlayingTitle.textContent ? nowPlayingTitle.textContent : '';
  const detected = detectCandidateMediaInfo(
    activeSeries,
    recentSeries,
    currentTargetUrl,
    npText,
    pendingCastTitle
  );

  let candidateTitle = detected.title || '';
  if (!candidateTitle && currentTargetUrl) {
    const raw = (currentTargetUrl.split(/[\\/]/).pop() || '').replace(/\.[a-z0-9]{2,4}$/i, '');
    if (isCleanMediaTitle(raw)) {
      const cleaned = raw.replace(/[\._\-]/g, ' ').replace(/\s+(s\d+e\d+|\d+p|1080p|720p|bluray|web-dl|x264|x265|hevc|aac).*$/i, '').trim();
      if (isCleanMediaTitle(cleaned)) {
        candidateTitle = cleaned;
      }
    }
  }

  let html = '<div class="ov-sub-box">';

  // 1. Quota Bar ou Aviso de Configuração
  if (!isConfigured) {
    html += `
      <div class="ov-sub-banner">
        💡 Configure suas chaves gratuitas do <strong>SubDL</strong> ou <strong>OpenSubtitles</strong> em <strong>Configurações &gt; Legendas</strong> para buscar e baixar legendas online.
      </div>
    `;
  } else if (quota) {
    html += `
      <div class="ov-sub-quotas-bar">
        ${state.subdlConfigured ? `<span class="ov-sub-quota-pill ov-sub-quota-subdl">SubDL: ${quota.subdl.remaining}/${quota.subdl.max} hoje</span>` : ''}
        ${state.openSubtitlesConfigured ? `<span class="ov-sub-quota-pill ov-sub-quota-os">OpenSubtitles: ${quota.openSubtitles.remaining}/${quota.openSubtitles.max} hoje</span>` : ''}
      </div>
    `;
  }

  // 2. Série Ativa (se houver)
  if (activeSeries) {
    html += `
      <div class="ov-sub-active-bar">
        <div>
          <span style="color:#38bdf8; font-weight:600;">📺 Série Ativa:</span>
          <strong>${escapeHtml(activeSeries.title)}</strong> (T${activeSeries.season} E${activeSeries.currentEpisode})
        </div>
        <div style="display:flex; gap:6px;">
          <button type="button" class="ov-sub-btn-primary" id="btn-sub-advance" style="padding:4px 8px; font-size:11px;" title="Avançar para o próximo episódio">Próximo Ep (+1)</button>
          <button type="button" class="ov-sub-btn-secondary" id="btn-sub-unbind" style="padding:4px 8px; font-size:11px;">Desvincular</button>
        </div>
      </div>
    `;
  }

  // 3. Séries Recentes
  if (recentSeries.length > 0) {
    html += `
      <div>
        <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">Séries Recentes:</div>
        <div class="ov-sub-chips-wrap">
          ${recentSeries.map((s) => `
            <button type="button" class="ov-sub-chip" data-title="${escapeHtml(s.title)}" data-season="${s.season}" data-episode="${s.episode}" data-imdb="${escapeHtml(s.imdbId || '')}">
              ${escapeHtml(s.title)} (Ep ${s.episode})
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  // 4. Seção de Busca no Catálogo Cinemeta com Auto Seleção de Temp e Ep
  html += `
    <div>
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
        <div class="ov-sub-section-title">Buscar no Catálogo &amp; Vincular</div>
        ${detected.source === 'parsed' ? `<span style="font-size:11px; color:#38bdf8; font-weight:500;">✨ Detectado: T${detected.season} E${detected.episode}</span>` : (detected.source === 'recent' ? `<span style="font-size:11px; color:#38bdf8; font-weight:500;">🔄 Sugerido: Ep ${detected.episode}</span>` : '')}
      </div>
      <div class="ov-sub-search-row" style="margin-top:4px; flex-wrap:wrap; gap:8px;">
        <div class="ov-sub-search-field" style="flex:2; min-width:180px;">
          <svg class="ov-sub-search-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="text" class="ov-sub-input ov-sub-input-catalog" id="catalog-search-input" placeholder="Ex: Solo Leveling, Frieren, Game of Thrones..." value="${escapeHtml(candidateTitle)}" />
          <button type="button" class="ov-sub-clear-btn" id="catalog-clear-btn" title="Limpar" ${candidateTitle ? '' : 'hidden'}>&times;</button>
        </div>
        <div style="display:flex; align-items:center; gap:4px;">
          <label for="quick-input-season" style="font-size:11.5px; color:var(--text-muted); font-weight:600;">Temp:</label>
          <input type="number" id="quick-input-season" class="ov-sub-input ov-sub-input-small" style="width:52px; padding:7px 4px; text-align:center;" min="1" max="99" value="${detected.season}" title="Temporada auto-selecionada (editável)" />
        </div>
        <div style="display:flex; align-items:center; gap:4px;">
          <label for="quick-input-episode" style="font-size:11.5px; color:var(--text-muted); font-weight:600;">Ep:</label>
          <input type="number" id="quick-input-episode" class="ov-sub-input ov-sub-input-small" style="width:58px; padding:7px 4px; text-align:center;" min="1" max="999" value="${detected.episode}" title="Episódio auto-selecionado (editável)" />
        </div>
        <button type="button" class="ov-sub-btn-primary" id="btn-catalog-search">Buscar</button>
      </div>
    </div>

    <!-- Resultados do Catálogo (sugestões com poster) -->
    <div id="catalog-results-box" class="ov-catalog-results-box" hidden></div>

    <!-- Painel da Obra Selecionada -->
    <div id="selected-show-box" class="ov-sub-selected-card" hidden>
      <div class="ov-sub-selected-header">
        <img id="sel-show-poster" class="ov-sub-selected-poster" src="" onerror="this.style.display='none'" />
        <div style="flex:1; min-width:0;">
          <div id="sel-show-title" class="ov-sub-selected-title">Nome da Obra</div>
          <div id="sel-show-meta" class="ov-sub-selected-meta">Ano · Tipo</div>
        </div>
        <button type="button" id="btn-change-show" class="ov-sub-btn-secondary" style="padding:4px 8px; font-size:11px;">Trocar</button>
      </div>
      <div id="sel-series-controls" class="ov-sub-series-controls">
        <div class="ov-sub-control-group">
          <label for="sel-season-dropdown">Temporada:</label>
          <select id="sel-season-dropdown" class="ov-sub-select"></select>
        </div>
        <div class="ov-sub-control-group" style="flex:2;">
          <label for="sel-episode-dropdown">Episódio:</label>
          <select id="sel-episode-dropdown" class="ov-sub-select"></select>
        </div>
      </div>
      <label class="ov-sub-checkbox-label">
        <input type="checkbox" id="chk-auto-bind" checked />
        <span>Vincular como série ativa (avança ep automaticamente no YouCine/DLNA)</span>
      </label>
      <button type="button" id="btn-fetch-subtitles" class="ov-sub-btn-primary ov-sub-btn-block">
        🔍 Buscar Legendas (SubDL + OpenSubtitles)
      </button>
    </div>

    <!-- Barra de Filtros e Modo de Legenda -->
    <div class="ov-sub-filter-row" id="ov-sub-filter-row" style="display:none;">
      <div class="ov-sub-filter-pills" id="ov-sub-filter-pills">
        <button type="button" class="ov-sub-filter-pill active" data-filter="all">Todas (<span id="cnt-sub-all">0</span>)</button>
        <button type="button" class="ov-sub-filter-pill ov-sub-filter-pill-signs" data-filter="signs">✨ Signs Only (<span id="cnt-sub-signs">0</span>)</button>
        <button type="button" class="ov-sub-filter-pill ov-sub-filter-pill-forced" data-filter="forced">⚡ Forced (<span id="cnt-sub-forced">0</span>)</button>
        <button type="button" class="ov-sub-filter-pill" data-filter="full">💬 Completas (<span id="cnt-sub-full">0</span>)</button>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <label for="sub-mode-quick-select" style="font-size:10.5px; color:var(--text-muted);">Modo:</label>
        <select id="sub-mode-quick-select" class="ov-sub-select-inline" title="Modo padrão de filtro e prioridade de legendas">
          <option value="signs_priority">✨ Priorizar Signs Only</option>
          <option value="signs_only">✨ Apenas Signs Only</option>
          <option value="all">🌐 Todas as Legendas</option>
        </select>
      </div>
    </div>

    <!-- Lista de Resultados de Legendas Encontradas -->
    <div class="ov-sub-results-list" id="sub-results-container">
      <div style="text-align:center; padding:12px; color:rgba(255,255,255,0.4); font-size:11.5px;">
        Busque uma série ou filme acima para selecionar o episódio e baixar a legenda.
      </div>
    </div>

    <!-- Modo Manual Avulso (Accordion) -->
    <details class="ov-sub-manual-details">
      <summary>Busca manual direta (sem catálogo)</summary>
      <div class="ov-sub-manual-inputs">
        <input type="text" id="manual-input-title" class="ov-sub-input ov-sub-input-main" placeholder="Título exato..." value="${escapeHtml(candidateTitle)}" />
        <input type="number" id="manual-input-season" class="ov-sub-input ov-sub-input-small" placeholder="Temp" value="${detected.season}" min="1" />
        <input type="number" id="manual-input-episode" class="ov-sub-input ov-sub-input-small" placeholder="Ep" value="${detected.episode}" min="1" />
        <button type="button" id="btn-manual-search" class="ov-sub-search-btn">Buscar</button>
      </div>
    </details>
  </div>`;

  modalBodyEl.innerHTML = html;

  // Elementos do DOM
  const btnUnbind = document.getElementById('btn-sub-unbind');
  const btnAdvance = document.getElementById('btn-sub-advance');
  const catalogInput = document.getElementById('catalog-search-input');
  const catalogClearBtn = document.getElementById('catalog-clear-btn');
  const quickInputSeason = document.getElementById('quick-input-season');
  const quickInputEpisode = document.getElementById('quick-input-episode');
  const btnCatalogSearch = document.getElementById('btn-catalog-search');
  const catalogResultsBox = document.getElementById('catalog-results-box');

  const selectedShowBox = document.getElementById('selected-show-box');
  const selShowPoster = document.getElementById('sel-show-poster');
  const selShowTitle = document.getElementById('sel-show-title');
  const selShowMeta = document.getElementById('sel-show-meta');
  const btnChangeShow = document.getElementById('btn-change-show');
  const selSeriesControls = document.getElementById('sel-series-controls');
  const selSeasonDropdown = document.getElementById('sel-season-dropdown');
  const selEpisodeDropdown = document.getElementById('sel-episode-dropdown');
  const chkAutoBind = document.getElementById('chk-auto-bind');
  const btnFetchSubtitles = document.getElementById('btn-fetch-subtitles');

  const subFilterRow = document.getElementById('ov-sub-filter-row');
  const subFilterPills = document.getElementById('ov-sub-filter-pills');
  const subModeQuickSelect = document.getElementById('sub-mode-quick-select');
  const cntSubAll = document.getElementById('cnt-sub-all');
  const cntSubSigns = document.getElementById('cnt-sub-signs');
  const cntSubForced = document.getElementById('cnt-sub-forced');
  const cntSubFull = document.getElementById('cnt-sub-full');
  const resultsContainer = document.getElementById('sub-results-container');

  const btnManualSearch = document.getElementById('btn-manual-search');
  const manualInputTitle = document.getElementById('manual-input-title');
  const manualInputSeason = document.getElementById('manual-input-season');
  const manualInputEpisode = document.getElementById('manual-input-episode');

  let currentSelectedShow = null;
  let lastSearchResults = [];
  let currentSearchQuery = '';
  let currentSearchSeason = 1;
  let currentSearchEpisode = 1;
  let currentSubtitlesMode = (state && state.subtitlesMode) || 'signs_priority';
  let currentFilter = currentSubtitlesMode === 'signs_only' ? 'signs' : 'all';

  if (subModeQuickSelect) {
    subModeQuickSelect.value = currentSubtitlesMode;
    subModeQuickSelect.addEventListener('change', async () => {
      currentSubtitlesMode = subModeQuickSelect.value;
      try {
        await window.api.saveSubtitlesConfig({ subtitlesMode: currentSubtitlesMode });
        showToast(`Modo alterado: ${subModeQuickSelect.options[subModeQuickSelect.selectedIndex].text}`);
      } catch (e) {
        // ignore
      }
      if (currentSubtitlesMode === 'signs_only') {
        currentFilter = 'signs';
      } else if (currentFilter === 'signs' && currentSubtitlesMode === 'all') {
        currentFilter = 'all';
      }
      updateFilterPillUi();
      renderSubtitleResults();
    });
  }

  function updateFilterPillUi() {
    if (!subFilterPills) return;
    subFilterPills.querySelectorAll('.ov-sub-filter-pill').forEach((pill) => {
      if (pill.getAttribute('data-filter') === currentFilter) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }

  if (subFilterPills) {
    subFilterPills.querySelectorAll('.ov-sub-filter-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        currentFilter = pill.getAttribute('data-filter') || 'all';
        updateFilterPillUi();
        renderSubtitleResults();
      });
    });
  }

  if (btnUnbind) {
    btnUnbind.addEventListener('click', async () => {
      await window.api.unbindSeries();
      showToast('Série desvinculada');
      openSubtitlesModal(autoFocusBind);
    });
  }

  if (btnAdvance && activeSeries) {
    btnAdvance.addEventListener('click', async () => {
      const nextEp = activeSeries.currentEpisode + 1;
      await window.api.bindSeries({
        title: activeSeries.title,
        season: activeSeries.season,
        episode: nextEp,
        imdbId: activeSeries.imdbId,
      });
      showToast(`Avançado para Ep ${nextEp}`);
      openSubtitlesModal(autoFocusBind);
    });
  }

  if (catalogClearBtn) {
    catalogClearBtn.addEventListener('click', () => {
      catalogInput.value = '';
      catalogClearBtn.hidden = true;
      catalogResultsBox.hidden = true;
      catalogResultsBox.innerHTML = '';
      catalogInput.focus();
    });
  }

  if (btnChangeShow) {
    btnChangeShow.addEventListener('click', () => {
      selectedShowBox.hidden = true;
      currentSelectedShow = null;
      catalogResultsBox.hidden = false;
      catalogInput.focus();
    });
  }

  if (catalogInput) {
    setTimeout(() => {
      catalogInput.focus();
      if (catalogInput.value && catalogInput.select) {
        catalogInput.select();
      }
    }, 60);
  }

  function renderSubtitleResults() {
    if (!lastSearchResults || lastSearchResults.length === 0) return;

    let filtered = lastSearchResults;
    if (currentFilter === 'signs') {
      filtered = lastSearchResults.filter((item) => item.classification && item.classification.isSignsOnly);
    } else if (currentFilter === 'forced') {
      filtered = lastSearchResults.filter((item) => item.classification && (item.classification.isForced || item.classification.type === 'foreign_parts') && !item.classification.isSignsOnly);
    } else if (currentFilter === 'full') {
      filtered = lastSearchResults.filter((item) => !item.classification || (!item.classification.isSignsOnly && !item.classification.isForced && item.classification.type !== 'foreign_parts'));
    }

    if (filtered.length === 0) {
      const filterLabels = {
        signs: 'Signs Only (apenas placas/textos visuais)',
        forced: 'Forced (forçada)',
        full: 'Completas / Diálogos',
      };
      const label = filterLabels[currentFilter] || currentFilter;
      resultsContainer.innerHTML = `
        <div style="text-align:center; padding:16px; color:rgba(255,255,255,0.7); font-size:12px;">
          Nenhuma legenda encontrada na categoria <strong>${escapeHtml(label)}</strong>.<br>
          <button type="button" class="ov-sub-btn-secondary" id="btn-fallback-show-all" style="margin-top:10px; font-size:11.5px; padding:6px 12px;">
            Exibir todas as ${lastSearchResults.length} legendas encontradas
          </button>
        </div>
      `;
      const btnFallback = document.getElementById('btn-fallback-show-all');
      if (btnFallback) {
        btnFallback.addEventListener('click', () => {
          currentFilter = 'all';
          updateFilterPillUi();
          renderSubtitleResults();
        });
      }
      return;
    }

    resultsContainer.innerHTML = '';
    filtered.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'ov-sub-result-item';
      const providerBadge = item.provider === 'subdl'
        ? '<span class="ov-sub-badge ov-sub-badge-subdl">SubDL</span>'
        : '<span class="ov-sub-badge ov-sub-badge-os">OpenSub</span>';
      const langBadge = `<span class="ov-sub-badge ov-sub-badge-lang">${escapeHtml(item.lang || 'PT-BR')}</span>`;

      let typeBadge = '';
      if (item.classification && item.classification.type) {
        const type = item.classification.type;
        if (type.startsWith('signs') || type === 'forced_signs' || type === 'text_only') {
          typeBadge = `<span class="ov-sub-badge ov-sub-badge-signs" title="${escapeHtml(item.classification.reason)}">✨ ${escapeHtml(item.classification.category)}</span>`;
        } else if (type === 'forced' || type === 'foreign_parts') {
          typeBadge = `<span class="ov-sub-badge ov-sub-badge-forced" title="${escapeHtml(item.classification.reason)}">⚡ ${escapeHtml(item.classification.category)}</span>`;
        } else if (type === 'hi_sdh') {
          typeBadge = `<span class="ov-sub-badge ov-sub-badge-hi" title="${escapeHtml(item.classification.reason)}">👂 CC/SDH</span>`;
        }
      }

      row.innerHTML = `
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:3px; flex-wrap:wrap;">
            ${providerBadge}
            ${langBadge}
            ${typeBadge}
            ${item.downloads ? `<span style="font-size:10.5px; opacity:0.6;">${item.downloads} downloads</span>` : ''}
          </div>
          <div style="font-size:12px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(item.release || item.title)}">
            ${escapeHtml(item.release || item.title)}
          </div>
        </div>
        <button type="button" class="ov-sub-btn-primary" style="padding:6px 10px; font-size:11.5px; white-space:nowrap;">Aplicar</button>
      `;

      const applyBtn = row.querySelector('button');
      applyBtn.addEventListener('click', async () => {
        applyBtn.disabled = true;
        applyBtn.textContent = 'Baixando...';
        try {
          await window.api.downloadAndApplySubtitle({
            provider: item.provider,
            downloadPayload: item.downloadPayload,
            seriesTitle: currentSearchQuery,
            season: currentSearchSeason || 1,
            episode: currentSearchEpisode || 1,
          });
          closeModal();
          showToast('Legenda PT-BR aplicada com sucesso!');
        } catch (err) {
          applyBtn.disabled = false;
          applyBtn.textContent = 'Erro';
          showToast('Erro ao aplicar: ' + err.message);
        }
      });

      resultsContainer.appendChild(row);
    });
  }

  // Busca e aplica legendas
  const executeSubtitleSearch = async ({ query, imdbId, season, episode, aliases = [] }) => {
    if (!query) return;
    currentSearchQuery = query;
    currentSearchSeason = season;
    currentSearchEpisode = episode;

    resultsContainer.innerHTML = '<div style="text-align:center; padding:16px; color:rgba(255,255,255,0.7);">Buscando legendas PT-BR no SubDL e OpenSubtitles...</div>';
    if (subFilterRow) subFilterRow.style.display = 'none';
    if (btnFetchSubtitles) btnFetchSubtitles.disabled = true;

    try {
      if (chkAutoBind && chkAutoBind.checked && season && episode) {
        await window.api.bindSeries({
          title: query,
          season,
          episode,
          imdbId,
        });
      }

      const results = await window.api.searchSubtitles({
        query,
        imdbId,
        season,
        episode,
        aliases,
      });
      if (btnFetchSubtitles) btnFetchSubtitles.disabled = false;

      if (!results || results.length === 0) {
        resultsContainer.innerHTML = `
          <div style="text-align:center; padding:14px; color:rgba(255,255,255,0.5);">
            Nenhuma legenda encontrada para este episódio.<br>
            <small style="opacity:0.7">Tente a busca manual com variações do nome se necessário.</small>
          </div>
        `;
        return;
      }

      lastSearchResults = results;

      // Atualiza contadores
      const countAll = results.length;
      const countSigns = results.filter((r) => r.classification && r.classification.isSignsOnly).length;
      const countForced = results.filter((r) => r.classification && (r.classification.isForced || r.classification.type === 'foreign_parts') && !r.classification.isSignsOnly).length;
      const countFull = results.filter((r) => !r.classification || (!r.classification.isSignsOnly && !r.classification.isForced && r.classification.type !== 'foreign_parts')).length;

      if (cntSubAll) cntSubAll.textContent = countAll;
      if (cntSubSigns) cntSubSigns.textContent = countSigns;
      if (cntSubForced) cntSubForced.textContent = countForced;
      if (cntSubFull) cntSubFull.textContent = countFull;

      // Se o modo for 'signs_only', seleciona 'signs' se houver
      if (currentSubtitlesMode === 'signs_only') {
        currentFilter = countSigns > 0 ? 'signs' : 'all';
      }
      updateFilterPillUi();

      if (subFilterRow) subFilterRow.style.display = 'flex';
      renderSubtitleResults();
    } catch (err) {
      if (btnFetchSubtitles) btnFetchSubtitles.disabled = false;
      resultsContainer.innerHTML = `<div style="text-align:center; padding:12px; color:#f87171;">Erro na busca: ${escapeHtml(err.message)}</div>`;
    }
  };

  // Seleciona um item do catálogo e carrega suas temporadas/episódios
  const selectShow = async (item, options = null) => {
    catalogResultsBox.hidden = true;
    selectedShowBox.hidden = false;
    selShowTitle.textContent = item.name;
    selShowMeta.textContent = `${item.year || ''} · ${item.type === 'series' ? 'Série' : 'Filme'}`;
    if (item.poster) {
      selShowPoster.src = item.poster;
      selShowPoster.style.display = 'block';
    } else {
      selShowPoster.style.display = 'none';
    }

    selectedShowBox.style.opacity = '0.7';
    const details = await window.api.getCatalogDetails(item.id, item.type).catch(() => null);
    selectedShowBox.style.opacity = '1';

    currentSelectedShow = details || item;
    const isSeries = (currentSelectedShow.type || item.type) === 'series';

    if (details && (details.ptTitle || details.originalTitle)) {
      selShowTitle.innerHTML = `
        ${escapeHtml(details.name)}
        ${details.ptTitle ? `<span style="display:block; font-size:12px; font-weight:500; color:#38bdf8; margin-top:2px;">🇧🇷 ${escapeHtml(details.ptTitle)}</span>` : ''}
      `;
      const metaParts = [`${item.year || ''}`, isSeries ? 'Série' : 'Filme'];
      if (details.originalTitle && details.originalTitle !== details.name) {
        metaParts.push(details.originalTitle);
      }
      selShowMeta.textContent = metaParts.filter(Boolean).join(' · ');
    } else {
      selShowTitle.textContent = item.name;
      selShowMeta.textContent = `${item.year || ''} · ${isSeries ? 'Série' : 'Filme'}`;
    }

    if (!isSeries) {
      selSeriesControls.hidden = true;
    } else {
      selSeriesControls.hidden = false;
      selSeasonDropdown.innerHTML = '';
      selEpisodeDropdown.innerHTML = '';

      const seasons = (currentSelectedShow.seasons && currentSelectedShow.seasons.length > 0)
        ? currentSelectedShow.seasons
        : [1];

      seasons.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = `Temporada ${s}`;
        selSeasonDropdown.appendChild(opt);
      });

      const populateEpisodes = (sNum) => {
        selEpisodeDropdown.innerHTML = '';
        const eps = (currentSelectedShow.episodesBySeason && currentSelectedShow.episodesBySeason[sNum]) || [];
        if (eps.length > 0) {
          eps.forEach((ep) => {
            const opt = document.createElement('option');
            opt.value = ep.episode;
            const label = ep.title ? `Ep ${ep.episode} — ${ep.title}` : `Episódio ${ep.episode}`;
            opt.textContent = label;
            selEpisodeDropdown.appendChild(opt);
          });
        } else {
          for (let i = 1; i <= 25; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `Episódio ${i}`;
            selEpisodeDropdown.appendChild(opt);
          }
        }
      };

      const targetSeason = (options && options.autoSeason) || (quickInputSeason ? parseInt(quickInputSeason.value, 10) : 1) || (activeSeries ? activeSeries.season : 1);
      if (seasons.includes(Number(targetSeason))) {
        selSeasonDropdown.value = targetSeason;
      }
      populateEpisodes(selSeasonDropdown.value);

      const targetEpisode = (options && options.autoEpisode) || (quickInputEpisode ? parseInt(quickInputEpisode.value, 10) : 1) || (activeSeries ? activeSeries.currentEpisode : 1);
      selEpisodeDropdown.value = targetEpisode;

      selSeasonDropdown.onchange = () => {
        populateEpisodes(selSeasonDropdown.value);
        if (quickInputSeason) quickInputSeason.value = selSeasonDropdown.value;
      };
    }

    // Busca legendas automaticamente para o episódio selecionado
    executeSubtitleSearch({
      query: currentSelectedShow.name || item.name,
      imdbId: currentSelectedShow.id || item.id,
      season: isSeries ? parseInt(selSeasonDropdown.value, 10) : undefined,
      episode: isSeries ? parseInt(selEpisodeDropdown.value, 10) : undefined,
      aliases: currentSelectedShow.aliases || [],
    });
  };

  // Executa busca no catálogo Cinemeta
  const executeCatalogSearch = async (query, autoSelectOptions = null) => {
    const q = (query || '').trim();
    if (!q) {
      catalogResultsBox.hidden = true;
      catalogResultsBox.innerHTML = '';
      return;
    }

    catalogClearBtn.hidden = false;
    catalogResultsBox.hidden = false;
    catalogResultsBox.innerHTML = '<div style="padding:10px; text-align:center; color:rgba(255,255,255,0.6); font-size:12px;">Buscando obras no catálogo...</div>';

    try {
      const metas = await window.api.searchCatalog(q);
      if (!metas || metas.length === 0) {
        catalogResultsBox.innerHTML = '<div style="padding:10px; text-align:center; color:rgba(255,255,255,0.4); font-size:11.5px;">Nenhuma obra encontrada no catálogo. Tente outro nome ou use a busca manual abaixo.</div>';
        return;
      }

      catalogResultsBox.innerHTML = '';
      metas.forEach((m) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'ov-catalog-item';
        itemEl.innerHTML = `
          ${m.poster ? `<img class="ov-catalog-poster" src="${escapeHtml(m.poster)}" onerror="this.style.display='none'" />` : '<div class="ov-catalog-poster" style="display:flex;align-items:center;justify-content:center;font-size:9px;color:#94a3b8;">SEM POSTER</div>'}
          <div class="ov-catalog-info">
            <div class="ov-catalog-title">${escapeHtml(m.name)}</div>
            ${m.altName ? `<div style="font-size:11px; color:#38bdf8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:1px;">${escapeHtml(m.altName)}</div>` : ''}
            <div class="ov-catalog-meta">
              <span>${m.year || ''}</span>
              <span class="ov-catalog-tag">${m.type === 'series' ? 'Série' : 'Filme'}</span>
            </div>
          </div>
          <button type="button" class="ov-catalog-pick-btn">Selecionar</button>
        `;
        itemEl.addEventListener('click', () => {
          const autoSeason = quickInputSeason ? parseInt(quickInputSeason.value, 10) : (autoSelectOptions && autoSelectOptions.autoSeason);
          const autoEpisode = quickInputEpisode ? parseInt(quickInputEpisode.value, 10) : (autoSelectOptions && autoSelectOptions.autoEpisode);
          selectShow(m, { ...(autoSelectOptions || {}), autoSeason, autoEpisode });
        });
        catalogResultsBox.appendChild(itemEl);
      });

      if (autoSelectOptions && autoSelectOptions.selectImdbId) {
        const match = metas.find((m) => m.id === autoSelectOptions.selectImdbId);
        if (match) {
          selectShow(match, autoSelectOptions);
        }
      }
    } catch (err) {
      catalogResultsBox.innerHTML = `<div style="padding:10px; text-align:center; color:#f87171; font-size:11.5px;">Erro no catálogo: ${escapeHtml(err.message)}</div>`;
    }
  };

  btnCatalogSearch.addEventListener('click', () => {
    const s = quickInputSeason ? parseInt(quickInputSeason.value, 10) || 1 : 1;
    const e = quickInputEpisode ? parseInt(quickInputEpisode.value, 10) || 1 : 1;
    executeCatalogSearch(catalogInput.value, { autoSeason: s, autoEpisode: e });
  });

  let debounceTimer = null;
  catalogInput.addEventListener('input', () => {
    catalogClearBtn.hidden = !catalogInput.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const s = quickInputSeason ? parseInt(quickInputSeason.value, 10) || 1 : 1;
      const e = quickInputEpisode ? parseInt(quickInputEpisode.value, 10) || 1 : 1;
      executeCatalogSearch(catalogInput.value, { autoSeason: s, autoEpisode: e });
    }, 380);
  });

  catalogInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      const s = quickInputSeason ? parseInt(quickInputSeason.value, 10) || 1 : 1;
      const e = quickInputEpisode ? parseInt(quickInputEpisode.value, 10) || 1 : 1;
      executeCatalogSearch(catalogInput.value, { autoSeason: s, autoEpisode: e });
    }
  });

  btnFetchSubtitles.addEventListener('click', () => {
    if (!currentSelectedShow) return;
    const isSeries = (currentSelectedShow.type) === 'series';
    executeSubtitleSearch({
      query: currentSelectedShow.name,
      imdbId: currentSelectedShow.id,
      season: isSeries ? parseInt(selSeasonDropdown.value, 10) : undefined,
      episode: isSeries ? parseInt(selEpisodeDropdown.value, 10) : undefined,
      aliases: currentSelectedShow.aliases || [],
    });
  });

  if (selEpisodeDropdown) {
    selEpisodeDropdown.addEventListener('change', () => {
      if (quickInputEpisode) quickInputEpisode.value = selEpisodeDropdown.value;
      if (!currentSelectedShow) return;
      executeSubtitleSearch({
        query: currentSelectedShow.name,
        imdbId: currentSelectedShow.id,
        season: parseInt(selSeasonDropdown.value, 10),
        episode: parseInt(selEpisodeDropdown.value, 10),
        aliases: currentSelectedShow.aliases || [],
      });
    });
  }

  if (quickInputSeason) {
    quickInputSeason.addEventListener('change', () => {
      if (selSeasonDropdown) {
        selSeasonDropdown.value = quickInputSeason.value;
      }
    });
  }

  if (quickInputEpisode) {
    quickInputEpisode.addEventListener('change', () => {
      if (selEpisodeDropdown) {
        selEpisodeDropdown.value = quickInputEpisode.value;
      }
    });
  }

  // Séries recentes
  modalBodyEl.querySelectorAll('.ov-sub-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const title = chip.getAttribute('data-title');
      const season = parseInt(chip.getAttribute('data-season'), 10) || 1;
      const episode = parseInt(chip.getAttribute('data-episode'), 10) || 1;
      const imdbId = chip.getAttribute('data-imdb') || null;

      catalogInput.value = title;
      if (quickInputSeason) quickInputSeason.value = season;
      if (quickInputEpisode) quickInputEpisode.value = episode;
      catalogClearBtn.hidden = false;
      executeCatalogSearch(title, { selectImdbId: imdbId, autoSeason: season, autoEpisode: episode });
    });
  });

  // Busca manual avulsa
  if (btnManualSearch) {
    btnManualSearch.addEventListener('click', () => {
      const title = manualInputTitle.value.trim();
      if (!title) return;
      const season = parseInt(manualInputSeason.value, 10) || 1;
      const episode = parseInt(manualInputEpisode.value, 10) || 1;
      executeSubtitleSearch({
        query: title,
        season,
        episode,
      });
    });
  }

  // Auto busca inicial se tiver título candidato
  if (candidateTitle) {
    const opts = {
      selectImdbId: detected.imdbId || (activeSeries ? activeSeries.imdbId : null),
      autoSeason: detected.season,
      autoEpisode: detected.episode,
    };
    executeCatalogSearch(candidateTitle, opts);
  }
}

// --- Card de Próximo Episódio ---
const nextEpCard = document.getElementById('ov-next-ep-card');
const nextEpTitle = document.getElementById('ov-next-ep-title');
const btnNextEpDownload = document.getElementById('btn-next-ep-download');
const btnNextEpDismiss = document.getElementById('btn-next-ep-dismiss');
let pendingNextEp = null;

if (btnNextEpDismiss) {
  btnNextEpDismiss.addEventListener('click', () => {
    if (nextEpCard) nextEpCard.hidden = true;
    pendingNextEp = null;
  });
}

if (btnNextEpDownload) {
  btnNextEpDownload.addEventListener('click', async () => {
    if (!pendingNextEp) return;
    btnNextEpDownload.disabled = true;
    btnNextEpDownload.textContent = 'Buscando...';
    try {
      const results = await window.api.searchSubtitles({
        query: pendingNextEp.title,
        imdbId: pendingNextEp.imdbId,
        season: pendingNextEp.season,
        episode: pendingNextEp.currentEpisode,
      });
      if (results && results.length > 0) {
        results.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
        const best = results[0];
        await window.api.downloadAndApplySubtitle({
          provider: best.provider,
          downloadPayload: best.downloadPayload,
          seriesTitle: pendingNextEp.title,
          season: pendingNextEp.season,
          episode: pendingNextEp.currentEpisode,
        });
        showToast(`Legenda aplicada: ${pendingNextEp.title} Ep ${pendingNextEp.currentEpisode}`);
      } else {
        showToast(`Nenhuma legenda encontrada para o Ep ${pendingNextEp.currentEpisode}`);
      }
    } catch (err) {
      showToast('Erro ao baixar legenda: ' + err.message);
    } finally {
      if (nextEpCard) nextEpCard.hidden = true;
      btnNextEpDownload.disabled = false;
      btnNextEpDownload.textContent = 'Baixar Legenda';
      pendingNextEp = null;
    }
  });
}

window.api.onSubtitlesAutoApplied((info) => {
  if (!info || !info.series) return;
  const cachedTxt = info.cached ? ' (do cache local)' : '';
  showToast(`💬 ${info.series.title} Ep ${info.series.currentEpisode}: Legenda PT-BR aplicada${cachedTxt}`);
});

window.api.onNextEpisodePrompt((info) => {
  if (!info || !info.series || !nextEpCard) return;
  pendingNextEp = info.series;
  if (nextEpTitle) nextEpTitle.textContent = `${info.series.title} — Ep ${info.series.currentEpisode}`;
  nextEpCard.hidden = false;
});

// --- Pular Abertura (SkipDB) ---
const skipContainer = document.getElementById('ov-skip-container');
const btnSkipIntro = document.getElementById('btn-skip-intro');
const skipBtnLabel = document.getElementById('skip-btn-label');
let currentSkipSegments = null;
let introAutoSkipped = false;
let autoSkipIntroConfig = false;

window.api.getSettings().then((s) => {
  autoSkipIntroConfig = s.skipIntroAuto === true;
}).catch(() => {});

window.api.onSkipIntroSettingsChanged((cfg) => {
  if (cfg) autoSkipIntroConfig = cfg.skipIntroAuto === true;
});

window.api.onSkipSegments((data) => {
  currentSkipSegments = data;
  introAutoSkipped = false;
  renderSkipSegmentsOnTrack();
});

function renderSkipSegmentsOnTrack() {
  if (!progressSegments) return;
  progressSegments.innerHTML = '';
  if (!currentSkipSegments || !duration || duration <= 0) return;
  const segs = [
    { seg: currentSkipSegments.recap, type: 'recap' },
    { seg: currentSkipSegments.intro, type: 'intro' },
    { seg: currentSkipSegments.outro, type: 'outro' },
  ];
  segs.forEach(({ seg, type }) => {
    if (!seg || typeof seg.start !== 'number' || typeof seg.end !== 'number') return;
    const startSec = Math.max(0, seg.start);
    const endSec = Math.min(duration, seg.end);
    if (endSec <= startSec) return;
    const leftPct = (startSec / duration) * 100;
    const widthPct = Math.max(0.4, ((endSec - startSec) / duration) * 100);
    const el = document.createElement('div');
    el.className = `ov-progress-segment ov-progress-segment-${type}`;
    el.style.left = `${leftPct}%`;
    el.style.width = `${widthPct}%`;
    progressSegments.appendChild(el);
  });
}

function getActiveSkipSegment(pos) {
  if (!currentSkipSegments) return null;
  const intro = currentSkipSegments.intro;
  const recap = currentSkipSegments.recap;
  const outro = currentSkipSegments.outro;

  if (intro && pos >= intro.start && pos < intro.end) {
    return { type: 'intro', label: 'Pular Abertura', end: intro.end };
  }
  if (recap && pos >= recap.start && pos < recap.end) {
    return { type: 'recap', label: 'Pular Recapitulação', end: recap.end };
  }
  if (outro && pos >= outro.start && pos < outro.end) {
    return { type: 'outro', label: 'Pular Encerramento', end: outro.end };
  }
  return null;
}

function checkSkipSegments(pos) {
  if (!skipContainer) return;
  const activeSeg = getActiveSkipSegment(pos);
  if (!activeSeg) {
    skipContainer.hidden = true;
    return;
  }

  // Se configurado para pular abertura automaticamente e ainda não pulou nesta abertura
  if (activeSeg.type === 'intro' && autoSkipIntroConfig && !introAutoSkipped) {
    introAutoSkipped = true;
    skipContainer.hidden = true;
    window.api.seekAbsolute(activeSeg.end).catch(() => {});
    showToast('⏭ Abertura pulada automaticamente (SkipDB)');
    return;
  }

  if (skipBtnLabel) {
    skipBtnLabel.textContent = activeSeg.label;
  }
  skipContainer.hidden = false;
}

function executeSkipSegment() {
  const activeSeg = getActiveSkipSegment(position);
  if (activeSeg) {
    window.api.seekAbsolute(activeSeg.end).catch(() => {});
    if (skipContainer) skipContainer.hidden = true;
    showToast(`⏭ ${activeSeg.label.replace('Pular ', '')} pulada`);
  }
}

if (btnSkipIntro) {
  btnSkipIntro.addEventListener('click', executeSkipSegment);
}

// --- Smart Series Bar (Banner Inteligente no Topo) ---
const smartBanner = document.getElementById('ov-smart-banner');
const smartBannerContent = document.getElementById('ov-smart-banner-content');
let smartBannerDismissTimer = null;

function dismissSmartBanner() {
  clearTimeout(smartBannerDismissTimer);
  if (!smartBanner || smartBanner.hidden) return;
  smartBanner.classList.add('dismissing');
  setTimeout(() => {
    smartBanner.hidden = true;
    smartBanner.classList.remove('dismissing');
    if (smartBannerContent) smartBannerContent.innerHTML = '';
  }, 220);
}

function showSmartBanner(html, autoDismissMs = 12000) {
  clearTimeout(smartBannerDismissTimer);
  if (!smartBanner || !smartBannerContent) return;
  smartBannerContent.innerHTML = html;
  smartBanner.classList.remove('dismissing');
  smartBanner.hidden = false;

  let remaining = autoDismissMs;
  let startTime = Date.now();

  const startTimer = (ms) => {
    clearTimeout(smartBannerDismissTimer);
    if (ms > 0) {
      smartBannerDismissTimer = setTimeout(() => {
        dismissSmartBanner();
      }, ms);
    }
  };

  // Pausa o auto-dismiss se o mouse passar por cima para não sumir enquanto o usuário vai clicar
  smartBanner.onmouseenter = () => {
    clearTimeout(smartBannerDismissTimer);
    remaining -= (Date.now() - startTime);
  };
  smartBanner.onmouseleave = () => {
    startTime = Date.now();
    startTimer(Math.max(3000, remaining));
  };

  startTimer(autoDismissMs);
}

// Quando o usuário muda para o próximo episódio na mesma sessão
window.api.onEpisodeAdvanced((data) => {
  const series = data?.series;
  if (!series || !series.title) return;

  const appliedSubtitle = !!data.appliedSubtitle;
  const sTitle = escapeHtml(series.title);
  const sEp = `T${series.season || 1} Ep ${series.currentEpisode || 1}`;

  const html = `
    <div class="ov-smart-pill">
      <span class="ov-smart-pill-icon">📺</span>
      <span class="ov-smart-pill-text">
        Você mudou para: <strong>${sTitle}</strong> — ${sEp}
      </span>
      ${appliedSubtitle ? '<span class="ov-smart-pill-tag">Legenda PT-BR ✓</span>' : ''}
      <button type="button" class="ov-smart-btn-confirm" id="btn-smart-ok" title="Confirmar">✓ Ok</button>
      <button type="button" class="ov-smart-btn-undo" id="btn-smart-undo" title="Desvincular e remover legenda caso seja outro conteúdo">Não é esse</button>
      <button type="button" class="ov-smart-btn-close" id="btn-smart-close" aria-label="Fechar">✕</button>
    </div>
  `;

  showSmartBanner(html, 14000);

  const btnOk = document.getElementById('btn-smart-ok');
  const btnUndo = document.getElementById('btn-smart-undo');
  const btnClose = document.getElementById('btn-smart-close');

  if (btnOk) {
    btnOk.addEventListener('click', () => {
      dismissSmartBanner();
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      dismissSmartBanner();
    });
  }

  if (btnUndo) {
    btnUndo.addEventListener('click', async () => {
      btnUndo.disabled = true;
      btnUndo.style.opacity = '0.6';
      try {
        await window.api.notThisSeries();
        showToast('Desvinculado: legenda e histórico revertidos');
      } catch (err) {
        showToast(`Erro ao desvincular: ${err.message}`);
      }
      dismissSmartBanner();
    });
  }
});

// Sugestão de vinculação rápida no topo no início do vídeo se há séries recentes
window.api.onDlnaIdentifyPrompt((data) => {
  const recents = data?.recentSeries || [];
  if (!recents.length) return;

  const chipsHtml = recents.slice(0, 3).map((s, idx) => `
    <button type="button" class="ov-smart-chip" data-idx="${idx}">
      ${escapeHtml(s.title)} · T${s.season} Ep ${s.suggestedEpisode}
    </button>
  `).join('');

  const html = `
    <div class="ov-smart-card">
      <div class="ov-smart-card-header">
        <div class="ov-smart-card-title">
          <span>📺</span>
          <span>Transmissão detectada. Continuar assistindo?</span>
        </div>
        <button type="button" class="ov-smart-btn-close" id="btn-smart-identify-close" aria-label="Fechar">✕</button>
      </div>
      <div class="ov-smart-chips-row">
        ${chipsHtml}
        <button type="button" class="ov-smart-chip ov-smart-chip-search" id="btn-smart-search">
          🔍 Outra série / Buscar...
        </button>
      </div>
    </div>
  `;

  showSmartBanner(html, 14000);

  const btnClose = document.getElementById('btn-smart-identify-close');
  if (btnClose) {
    btnClose.addEventListener('click', () => {
      dismissSmartBanner();
    });
  }

  const btnSearch = document.getElementById('btn-smart-search');
  if (btnSearch) {
    btnSearch.addEventListener('click', () => {
      dismissSmartBanner();
      openSubtitlesModal(true);
    });
  }

  const chips = smartBannerContent ? smartBannerContent.querySelectorAll('.ov-smart-chip[data-idx]') : [];
  chips.forEach((chip) => {
    chip.addEventListener('click', async () => {
      const idx = parseInt(chip.getAttribute('data-idx'), 10);
      const s = recents[idx];
      if (!s) return;

      chip.disabled = true;
      chip.style.opacity = '0.6';

      try {
        const res = await window.api.bindAndApply({
          title: s.title,
          season: s.season,
          episode: s.suggestedEpisode,
          imdbId: s.imdbId,
        });
        dismissSmartBanner();
        showToast(`📺 ${s.title} Ep ${s.suggestedEpisode} vinculado`);
        if (res?.subResult?.applied) {
          const cachedTxt = res.subResult.cached ? ' (do cache)' : '';
          showToast(`💬 Legenda PT-BR aplicada${cachedTxt}`);
        }
      } catch (err) {
        dismissSmartBanner();
        showToast(`Erro ao vincular: ${err.message}`);
      }
    });
  });
});

window.api.onSubtitlesAutoApplied((info) => {
  if (smartBanner && !smartBanner.hidden) return;
  const cachedTxt = info?.cached ? ' (do cache)' : '';
  showToast(`💬 Legenda PT-BR aplicada automaticamente${cachedTxt}`);
});

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

function isTypingTarget(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

document.addEventListener('keydown', (e) => {
  if (isTypingTarget(document.activeElement)) {
    if (e.key === 'Escape') {
      if (modalOpen) closeModal();
      else document.activeElement.blur();
    }
    return;
  }

  if (e.ctrlKey && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
    e.preventDefault();
    toggleDebugOverlay();
    return;
  }
  if (e.key === 'Escape') {
    if (modalOpen) closeModal();
    else if (openDropdownId) closeDropdowns();
    else {
      window.api.toggleFullscreen().catch(() => {});
    }
    return;
  }
  if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    window.api.togglePlayPause().catch(() => {});
    return;
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    window.api.seek(-10).catch(() => {});
    return;
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    window.api.seek(10).catch(() => {});
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    const currentVol = volumeEl ? Number(volumeEl.value) : 100;
    const nextVol = Math.min(150, currentVol + 5);
    if (volumeEl) volumeEl.value = nextVol;
    window.api.setVolume(nextVol).catch(() => {});
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const currentVol = volumeEl ? Number(volumeEl.value) : 100;
    const nextVol = Math.max(0, currentVol - 5);
    if (volumeEl) volumeEl.value = nextVol;
    window.api.setVolume(nextVol).catch(() => {});
    return;
  }
  if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.altKey && !e.metaKey) {
    window.api.toggleMute().catch(() => {});
    return;
  }
  if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.altKey && !e.metaKey) {
    window.api.toggleFullscreen().catch(() => {});
    return;
  }
  if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (skipContainer && !skipContainer.hidden) {
      e.preventDefault();
      executeSkipSegment();
      return;
    }
  }
  if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.altKey && !e.metaKey) {
    window.api.toggleSubtitles().catch(() => {});
    return;
  }
  if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.altKey && !e.metaKey) {
    window.api.togglePip().catch(() => {});
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
  const hoverSec = pct * duration;
  let text = formatClock(hoverSec);
  const activeSeg = getActiveSkipSegment(hoverSec);
  if (activeSeg) {
    text += ` · ${activeSeg.label.replace('Pular ', '')}`;
  }
  tooltipEl.textContent = text;
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

function isGarbageTitle(str) {
  if (!str || typeof str !== 'string') return true;
  const s = str.trim();
  if (!s || s.length < 2) return true;
  if (/^https?:\/\//i.test(s)) return true;
  if (/[?&=]/.test(s)) return true;
  if (/content_auth|content_license|_media\.mp4/i.test(s)) return true;
  if (/^[a-f0-9_\-]{20,}$/i.test(s)) return true;
  if (/^[a-f0-9]{32}/i.test(s)) return true;
  if (/^dlna-video$/i.test(s)) return true;
  return false;
}

window.api.onNowPlaying(({ target, title: cleanTitle } = {}) => {
  currentTargetUrl = target || null;
  currentSkipSegments = null;
  if (progressSegments) progressSegments.innerHTML = '';
  if (pendingCastTitle) {
    nowPlayingTitle.textContent = pendingCastTitle;
    nowPlayingTitle.title = target;
    pendingCastTitle = null;
    return;
  }
  if (cleanTitle) {
    nowPlayingTitle.textContent = cleanTitle;
    nowPlayingTitle.title = target;
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
  if (isGarbageTitle(title)) {
    title = 'Transmissão YouCine (DLNA)';
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
    lastPaused = true;
    updatePlayPauseIcon(true);
    return;
  }

  if (info.reconnecting) {
    bufferingEl.hidden = false;
    const countdown = info.reconnectDelayMs > 0 ? ` em ${Math.ceil(info.reconnectDelayMs / 1000)}s` : '';
    bufferingEl.textContent = `Reconectando${countdown}… (${info.reconnectAttempt}/${info.reconnectMax})`;
    bufferingEl.className = 'ov-buffering ov-buffering-warn';
  } else {
    bufferingEl.hidden = !info.buffering;
    bufferingEl.textContent = 'Carregando…';
    bufferingEl.className = 'ov-buffering';
  }

  const prevDuration = duration;
  duration = info.duration || 0;
  if (duration !== prevDuration && duration > 0) {
    renderSkipSegmentsOnTrack();
  }
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
    const qualityPrefix = showQualityLabel ? `${qualityLabelFor(info.healthState)} · ` : '';
    statsEl.textContent = `${qualityPrefix}(Buffer: ${cacheStr})`;
    statsEl.className = `ov-live-stats ${info.liveHealth || 'good'}`;
  } else {
    ovRoot.classList.remove('ov-live');
    ovRoot.classList.remove('ov-dvr');
    dvrBtn.classList.add('ov-hidden');
    const statsEl = document.getElementById('ov-live-stats');
    if (statsEl) {
      statsEl.textContent = '';
      statsEl.className = 'ov-live-stats';
    }
  }

  if (!scrubbing) {
    position = info.position || 0;
    renderProgress(duration ? position / duration : 0);
    timeCurrentEl.textContent = formatClock(position);
    checkSkipSegments(position);
  }
  if (!info.isLive && duration > 0) {
    const cacheSecs = typeof info.cacheTime === 'number' ? info.cacheTime : 0;
    const bufferedEnd = (info.position || 0) + cacheSecs;
    const bufferedPct = Math.min(100, Math.max(0, (bufferedEnd / duration) * 100));
    progressBuffered.style.width = bufferedPct + '%';
  } else {
    progressBuffered.style.width = '0%';
  }
  timeDurationEl.textContent = formatClock(duration);
  lastSubVisible = !!info.subVisible;
  btnSubtitleMenu.classList.toggle('ov-btn-active', lastSubVisible);

  const wasPaused = lastPaused;
  lastPaused = !!info.paused;
  updatePlayPauseIcon(lastPaused);
  if (lastPaused) {
    clearIdleTimer();
  } else if (wasPaused) {
    armIdleTimer();
  }

  const curVol = typeof info.volume === 'number' ? info.volume : (Number(volumeEl.value) || 100);
  updateVolumeUI(curVol, !!info.mute);
});

// --- Mostrar/esconder controles automaticamente ---
let idleTimer = null;

function showControls() {
  document.documentElement.classList.remove('idle');
  document.body.classList.remove('idle');
  ovRoot.classList.remove('idle');
}

function setIdle() {
  document.documentElement.classList.add('idle');
  document.body.classList.add('idle');
  ovRoot.classList.add('idle');
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
    if (!lastPaused && !openDropdownId && !modalOpen) {
      setIdle();
    }
  }, 2500);
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
    setIdle();
    clearTimeout(idleTimer);
  }
});

// Duplo clique no vídeo alterna tela cheia
ovRoot.addEventListener('dblclick', (e) => {
  if (e.target !== ovRoot) return;
  window.api.toggleFullscreen().catch(() => {});
});

// Gestos do mouse:
// - Roda no lado direito: Ajustar volume (0-150%) com OSD
// - Roda no lado esquerdo: Ajustar brilho do vídeo (-100 a +100%) com OSD
let currentBrightness = 0;
window.api.getBrightness().then((b) => { currentBrightness = b || 0; }).catch(() => {});

ovRoot.addEventListener(
  'wheel',
  (e) => {
    if (e.target.closest('.ov-bottom') || e.target.closest('.ov-menu') || e.target.closest('.ov-modal')) return;
    e.preventDefault();
    armIdleTimer();
    const isRightSide = e.clientX >= window.innerWidth / 2;
    if (isRightSide) {
      const step = e.deltaY < 0 ? 5 : -5;
      const next = Math.min(150, Math.max(0, Number(volumeEl.value) + step));
      volumeEl.value = next;
      window.api.setVolume(next).catch(() => {});
      showOsd(ICON_VOL_SVG, `Volume: ${next}%`, (next / 150) * 100);
    } else {
      const step = e.deltaY < 0 ? 5 : -5;
      currentBrightness = Math.max(-100, Math.min(100, currentBrightness + step));
      window.api.setBrightness(currentBrightness).catch(() => {});
      const displayPercent = Math.round(((currentBrightness + 100) / 200) * 100);
      showOsd(ICON_BRIGHT_SVG, `Brilho: ${currentBrightness > 0 ? '+' : ''}${currentBrightness}%`, displayPercent);
    }
  },
  { passive: false }
);

// Gesto de Arraste Horizontal para Busca Rápida (Click & Drag Seek)
let dragStartX = null;
let dragStartY = null;
let isDraggingSeek = false;
let dragSeekDelta = 0;

ovRoot.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (e.target.closest('.ov-bottom') || e.target.closest('.ov-top') || e.target.closest('.ov-menu') || e.target.closest('.ov-modal')) return;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  isDraggingSeek = false;
  dragSeekDelta = 0;
});

window.addEventListener('mousemove', (e) => {
  if (dragStartX === null) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  if (!isDraggingSeek && Math.abs(dx) > 15 && Math.abs(dx) > Math.abs(dy)) {
    isDraggingSeek = true;
  }
  if (isDraggingSeek) {
    const fraction = dx / Math.max(300, window.innerWidth);
    dragSeekDelta = Math.round(fraction * 120);
    const targetPos = Math.max(0, Math.min(duration || Infinity, (position || 0) + dragSeekDelta));
    showOsd(
      dragSeekDelta >= 0 ? ICON_FWD_SVG : ICON_BACK_SVG,
      `${dragSeekDelta >= 0 ? '+' : ''}${dragSeekDelta}s (${formatClock(targetPos)})`
    );
  }
});

window.addEventListener('mouseup', () => {
  if (isDraggingSeek && dragSeekDelta !== 0) {
    window.api.seek(dragSeekDelta).catch(() => {});
  }
  dragStartX = null;
  dragStartY = null;
  isDraggingSeek = false;
  dragSeekDelta = 0;
});

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
  audioWrap.hidden = false; // Sempre disponível para acesso ao Modo Noturno, Delay e Equalizador
  renderAudioMenu();

  subtitleTracks = tracksInfo.sub || [];
  subtitleWrap.hidden = false; // Sempre disponível para seleção de faixas ou carregamento externo
  renderSubtitleMenu();
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

// Previne que cliques na barra de controle tragam a barra de tarefas do Windows à frente.
// Mantém a janela principal (mainWindow) como a janela de primeiro plano em foco,
// exceto quando o usuário estiver interagindo com modais ou campos de texto (input/select/textarea).
document.addEventListener('pointerdown', (e) => {
  if (
    !e.target.closest('#ov-modal') &&
    !e.target.closest('input, select, textarea, [contenteditable="true"]')
  ) {
    if (window.api && window.api.focusMainWindow) {
      window.api.focusMainWindow().catch(() => {});
    }
  }
}, { passive: true });

