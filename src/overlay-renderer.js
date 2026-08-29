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
const tooltipEl = document.getElementById('ov-tooltip');

const qualityInfoEl = document.getElementById('ov-quality-info');

const btnSkipIntro = document.getElementById('btn-skip-intro');
const progressIntro = document.getElementById('ov-progress-intro');
const introHud = document.getElementById('ov-intro-hud');
const btnCloseIntroHud = document.getElementById('btn-close-intro-hud');
const btnMarkStart = document.getElementById('btn-mark-start');
const btnMarkEnd = document.getElementById('btn-mark-end');
const lblIntroStart = document.getElementById('lbl-intro-start');
const lblIntroEnd = document.getElementById('lbl-intro-end');
const btnSaveIntro = document.getElementById('btn-save-intro');

const ovSeekFlash = document.getElementById('ov-seek-flash');
const ovSkipRing = document.getElementById('ov-skip-ring');
const ovSkipRingBar = document.getElementById('ov-skip-ring-bar');
const ovSkipText = document.getElementById('ov-skip-text');
const ovSkipKey = document.getElementById('ov-skip-key');
const ovSkipCancelHint = document.getElementById('ov-skip-cancel-hint');

let detectedIntro = null;
let autoSkipIntro = false;
let hasAutoSkipped = false;
let autoSkipCancelledForCurrentMedia = false;
let markedStartSec = null;
let markedEndSec = null;

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
    { label: 'Marcar Abertura (Episódio 1)', onClick: () => { introHud.hidden = false; } },
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
  if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (!btnSkipIntro.hidden && autoSkipIntro && !autoSkipCancelledForCurrentMedia && (position || 0) < (detectedIntro?.startTime || 0)) {
      autoSkipCancelledForCurrentMedia = true;
      if (ovSkipRing) ovSkipRing.hidden = true;
      if (ovSkipText) ovSkipText.textContent = 'Pular Abertura';
      if (ovSkipCancelHint) ovSkipCancelHint.hidden = true;
      if (ovSkipKey) ovSkipKey.hidden = false;
      showToast('⚡ Auto-skip cancelado (Abertura mantida)');
      return;
    }
  }
  if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.altKey && !e.metaKey) {
    window.api.togglePip().catch(() => {});
    return;
  }
  if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.altKey && !e.metaKey) {
    skipIntroAction();
    return;
  }
  if ((e.key === 'i' || e.key === 'I') && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (introHud && !introHud.hidden) {
      window.api.markIntroStart().then((pos) => {
        markedStartSec = pos;
        updateIntroHudUI();
        showToast(`Início marcado: ${formatClock(pos)}`);
      });
      return;
    }
  }
  if ((e.key === 'o' || e.key === 'O') && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (introHud && !introHud.hidden) {
      window.api.markIntroEnd().then((pos) => {
        markedEndSec = pos;
        updateIntroHudUI();
        showToast(`Fim marcado: ${formatClock(pos)}`);
      });
      return;
    }
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
    const countdown = info.reconnectDelayMs > 0 ? ` em ${Math.ceil(info.reconnectDelayMs / 1000)}s` : '';
    bufferingEl.textContent = `Reconectando${countdown}… (${info.reconnectAttempt}/${info.reconnectMax})`;
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

  // Verificação e exibição do botão Pular Abertura (aparece 5s antes do início e some no final ou ao pular)
  if (detectedIntro && !info.isLive && duration > 0) {
    const pos = info.position || 0;
    const startWindow = Math.max(0, detectedIntro.startTime - 5);
    const endWindow = detectedIntro.endTime;

    if (pos >= startWindow && pos < endWindow) {
      btnSkipIntro.hidden = false;

      // Contagem regressiva se autoSkipIntro estiver ativo e o usuário estiver nos 5s antes do início
      if (autoSkipIntro && !autoSkipCancelledForCurrentMedia && pos < detectedIntro.startTime) {
        const remainingSec = Math.max(0, detectedIntro.startTime - pos);
        const progressPct = Math.min(1, Math.max(0, (5 - remainingSec) / 5)); // 0.0 a 1.0
        const circumference = 81.68;
        if (ovSkipRing) ovSkipRing.hidden = false;
        if (ovSkipRingBar) ovSkipRingBar.style.strokeDashoffset = String(circumference * (1 - progressPct));
        if (ovSkipText) ovSkipText.textContent = `Pular em ${Math.ceil(remainingSec)}s`;
        if (ovSkipCancelHint) ovSkipCancelHint.hidden = false;
        if (ovSkipKey) ovSkipKey.hidden = true;
      } else {
        if (ovSkipRing) ovSkipRing.hidden = true;
        if (ovSkipText) ovSkipText.textContent = 'Pular Abertura';
        if (ovSkipCancelHint) ovSkipCancelHint.hidden = true;
        if (ovSkipKey) ovSkipKey.hidden = false;
      }

      // Disparo do pulo automático ao atingir o início exato da abertura
      if (autoSkipIntro && !hasAutoSkipped && !autoSkipCancelledForCurrentMedia && pos >= detectedIntro.startTime) {
        hasAutoSkipped = true;
        skipIntroAction();
      }
    } else {
      btnSkipIntro.hidden = true;
    }
  } else {
    btnSkipIntro.hidden = true;
  }
});

// --- Sistema de Reconhecimento e Pular Aberturas ---
window.api.getAutoSkipIntro().then(v => { autoSkipIntro = !!v; }).catch(() => {});
window.api.onAutoSkipIntroChanged(v => { autoSkipIntro = !!v; });

function updateIntroMarker(info) {
  detectedIntro = info;
  hasAutoSkipped = false;
  autoSkipCancelledForCurrentMedia = false;
  if (info && typeof info.startTime === 'number' && duration > 0) {
    const leftPct = (info.startTime / duration) * 100;
    const widthPct = Math.max(1, ((info.endTime - info.startTime) / duration) * 100);
    progressIntro.style.left = leftPct + '%';
    progressIntro.style.width = widthPct + '%';
    progressIntro.hidden = false;
  } else {
    progressIntro.hidden = true;
    btnSkipIntro.hidden = true;
  }
}

window.api.getIntroDetected().then(info => updateIntroMarker(info)).catch(() => {});
window.api.onIntroDetected(info => updateIntroMarker(info));

if (window.api.onIntroDiffDetected) {
  window.api.onIntroDiffDetected((data) => {
    showToast(`🎵 Abertura diferente de "${data?.recentTitle || 'Salva'}"? Abra o menu (...) para marcar a OP 2.`);
  });
}

function skipIntroAction() {
  if (ovSeekFlash) {
    ovSeekFlash.classList.add('active');
    setTimeout(() => ovSeekFlash.classList.remove('active'), 180);
  }
  if (detectedIntro && typeof detectedIntro.endTime === 'number') {
    const currentPos = position || 0;
    const seekDelta = detectedIntro.endTime - currentPos;
    if (seekDelta > 0) {
      window.api.seek(seekDelta).catch(() => {});
    }
    btnSkipIntro.hidden = true;
    showToast(`⚡ Abertura pulada (${Math.round(detectedIntro.duration || seekDelta)}s)`);
  } else {
    window.api.seek(85).catch(() => {});
    showToast('⚡ Pulou 85s (Abertura)');
  }
}

if (btnSkipIntro) {
  btnSkipIntro.addEventListener('click', (e) => {
    e.stopPropagation();
    skipIntroAction();
  });
}

if (btnCloseIntroHud) {
  btnCloseIntroHud.addEventListener('click', () => {
    introHud.hidden = true;
  });
}

function updateIntroHudUI() {
  if (markedStartSec !== null) {
    lblIntroStart.textContent = formatClock(markedStartSec);
    btnMarkStart.classList.add('marked');
  } else {
    lblIntroStart.textContent = '--:--';
    btnMarkStart.classList.remove('marked');
  }
  if (markedEndSec !== null) {
    lblIntroEnd.textContent = formatClock(markedEndSec);
    btnMarkEnd.classList.add('marked');
  } else {
    lblIntroEnd.textContent = '--:--';
    btnMarkEnd.classList.remove('marked');
  }
  if (markedStartSec !== null && markedEndSec !== null && markedEndSec > markedStartSec) {
    btnSaveIntro.disabled = false;
    const dur = Math.round(markedEndSec - markedStartSec);
    btnSaveIntro.textContent = `💾 Salvar Assinatura (${dur}s)`;
  } else {
    btnSaveIntro.disabled = true;
    btnSaveIntro.textContent = '💾 Salvar & Extrair Assinatura';
  }
}

if (btnMarkStart) {
  btnMarkStart.addEventListener('click', async () => {
    const pos = await window.api.markIntroStart();
    markedStartSec = pos;
    updateIntroHudUI();
    showToast(`Início marcado: ${formatClock(pos)}`);
  });
}

if (btnMarkEnd) {
  btnMarkEnd.addEventListener('click', async () => {
    const pos = await window.api.markIntroEnd();
    markedEndSec = pos;
    updateIntroHudUI();
    showToast(`Fim marcado: ${formatClock(pos)}`);
  });
}

if (btnSaveIntro) {
  btnSaveIntro.addEventListener('click', async () => {
    btnSaveIntro.disabled = true;
    btnSaveIntro.textContent = 'Extraindo áudio da abertura...';
    try {
      await window.api.saveIntroProfile();
      showToast('✅ Assinatura de áudio aprendida para os próximos episódios!');
      introHud.hidden = true;
      markedStartSec = null;
      markedEndSec = null;
      updateIntroHudUI();
    } catch (err) {
      showToast(`Erro: ${err.message}`);
      updateIntroHudUI();
    }
  });
}

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
