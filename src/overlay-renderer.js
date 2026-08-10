const ovRoot = document.getElementById('ov-root');
const nowPlayingTitle = document.getElementById('now-playing-title');
const bufferingEl = document.getElementById('buffering-indicator');

const btnPlayPause = document.getElementById('btn-playpause');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const btnMute = document.getElementById('btn-mute');
const iconVolOn = document.getElementById('icon-vol-on');
const iconVolOff = document.getElementById('icon-vol-off');
const volumeEl = document.getElementById('volume');
const btnSubtitles = document.getElementById('btn-subtitles');
const qualityContainer = document.getElementById('ov-quality-container');
const btnQuality = document.getElementById('ov-btn-quality');
const qualityMenu = document.getElementById('ov-quality-menu');
const dvrBtn = document.getElementById('ov-live-dvr-btn');
const btnDebug = document.getElementById('ov-btn-debug');
const debugWindow = document.getElementById('ov-debug-window');
const dbgRatio = document.getElementById('dbg-ratio');
const dbgTarget = document.getElementById('dbg-target');
const dbgCurrent = document.getElementById('dbg-current');
const dbgSpeed = document.getElementById('dbg-speed');
const dbgHealth = document.getElementById('dbg-health');
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
btnSubtitles.addEventListener('click', withErr(() => window.api.toggleSubtitles()));
document.getElementById('btn-subtitle-track').addEventListener('click', withErr(() => window.api.cycleSubtitleTrack()));
const btnPopout = document.getElementById('btn-popout');
btnPopout.addEventListener('click', async () => {
  btnPopout.classList.toggle('active');
  const isPopout = await window.api.togglePopout();
  showTooltip(isPopout ? 'Modo Discord (Pop-out) Ativado' : 'Modo Integrado Ativado');
  if (isPopout) btnPopout.style.color = 'var(--accent)';
  else btnPopout.style.color = '';
});

btnFullscreen.addEventListener('click', () => {
  window.api.toggleFullscreen().catch(() => {});
});
// --- Menu de Qualidade ---
let qualityOpen = false;
let currentTracks = [];
btnQuality.addEventListener('click', () => {
  qualityOpen = !qualityOpen;
  qualityMenu.classList.toggle('open', qualityOpen);
  if (qualityOpen) fitMenuOpen = false;
  fitMenu.classList.remove('open');
});

dvrBtn.addEventListener('click', () => {
  window.api.playerReturnToLiveEdge();
});

let debugOpen = false;
btnDebug.addEventListener('click', () => {
  debugOpen = !debugOpen;
  debugWindow.style.display = debugOpen ? 'block' : 'none';
});

const btnToggleLive = document.getElementById('ov-btn-toggle-live');
btnToggleLive.addEventListener('click', () => {
  window.api.toggleLiveMode();
});

// --- Menu de proporção / ajuste de imagem (evita ficar "adivinhando" clicando
// varias vezes num botao de ciclar: mostra as opcoes com a atual marcada) ---
const btnAspect = document.getElementById('btn-aspect');
const fitMenu = document.getElementById('ov-fit-menu');
let fitModes = [];
let currentFitId = 'original';
let fitMenuOpen = false;

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
      closeFitMenu();
    });
    fitMenu.appendChild(item);
  });
}

function openFitMenu() {
  fitMenuOpen = true;
  fitMenu.classList.add('open');
  btnAspect.setAttribute('aria-expanded', 'true');
}

function closeFitMenu() {
  fitMenuOpen = false;
  fitMenu.classList.remove('open');
  btnAspect.setAttribute('aria-expanded', 'false');
}

btnAspect.addEventListener('click', (e) => {
  e.stopPropagation();
  if (fitMenuOpen) closeFitMenu();
  else openFitMenu();
});
document.addEventListener('click', () => { if (fitMenuOpen) closeFitMenu(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && fitMenuOpen) closeFitMenu();
  if ((e.key === 'a' || e.key === 'A') && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (fitModes && fitModes.length > 0) {
      const currentIndex = fitModes.findIndex(m => m.id === currentFitId);
      const nextIndex = (currentIndex + 1) % fitModes.length;
      const nextMode = fitModes[nextIndex];
      window.api.setFitMode(nextMode.id).then(id => {
        currentFitId = id;
        renderFitMenu();
        showTooltip(`Proporção: ${nextMode.label}`);
      });
    }
  }
});

window.api.getFitModes().then(({ modes, current }) => {
  fitModes = modes;
  currentFitId = current;
  renderFitMenu();
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
window.api.onNowPlaying(({ target }) => {
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

window.api.onPlayerStatus((info) => {
  if (info.idle) {
    bufferingEl.hidden = true;
    return;
  }
  bufferingEl.hidden = !info.buffering;

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

    // Atualiza Painel DNSO
    if (debugOpen) {
      dbgRatio.textContent = typeof info.cacheAmount === 'number' ? info.cacheAmount.toFixed(1) + 's' : '--';
      dbgTarget.textContent = info.targetLiveDelay ? info.targetLiveDelay.toFixed(1) + 's' : '--';
      dbgCurrent.textContent = info.liveDelay ? info.liveDelay.toFixed(1) + 's' : '--';
      dbgSpeed.textContent = info.currentSpeed ? info.currentSpeed.toFixed(2) + 'x' : '1.00x';
      dbgHealth.textContent = info.liveHealth || '--';
      dbgHealth.style.color = info.liveHealth === 'danger' ? '#f87171' : info.liveHealth === 'warning' ? '#facc15' : '#4ade80';
    }
  } else {
    ovRoot.classList.remove('ov-live');
    ovRoot.classList.remove('ov-dvr');
    dvrBtn.classList.add('ov-hidden');
    debugWindow.style.display = 'none';
  }

  if (!scrubbing) {
    position = info.position || 0;
    renderProgress(duration ? position / duration : 0);
    timeCurrentEl.textContent = formatClock(position);
  }
  const bufferedPct = duration ? Math.min(100, (info.cacheTime / duration) * 100) : 0;
  progressBuffered.style.width = bufferedPct + '%';
  timeDurationEl.textContent = formatClock(duration);
  btnSubtitles.classList.toggle('ov-btn-active', !!info.subVisible);

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
    if (!lastPaused && !fitMenuOpen) ovRoot.classList.add('idle');
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
  if (!tracksInfo || !tracksInfo.video || tracksInfo.video.length <= 1) {
    qualityContainer.style.display = 'none';
    currentTracks = [];
    return;
  }
  qualityContainer.style.display = 'block';
  currentTracks = tracksInfo.video;
  renderQualityMenu();
});

function renderQualityMenu() {
  qualityMenu.innerHTML = '';
  const autoEl = document.createElement('div');
  autoEl.className = 'ov-menu-item';
  autoEl.textContent = 'Automático';
  if (!currentTracks.some(t => t.selected)) autoEl.classList.add('active');
  autoEl.addEventListener('click', () => {
    window.api.playerSetVideoTrack('auto');
    qualityOpen = false;
    qualityMenu.classList.remove('open');
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
      qualityOpen = false;
      qualityMenu.classList.remove('open');
    });
    qualityMenu.appendChild(el);
  });
}
