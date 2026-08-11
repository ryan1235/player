// --- Idioma (aplicado antes de tudo pra nao piscar texto em portugues) ---
applyLanguage(getCurrentLang());

// --- Navegação principal (sidebar) ---
const navItems = document.querySelectorAll('.nav-item[data-tab]');
const contents = document.querySelectorAll('.tab-content');

function activateTab(name) {
  navItems.forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  contents.forEach((c) => c.classList.toggle('active', c.id === `tab-${name}`));
  sendVideoRect();
}

navItems.forEach((btn) => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

// Elementos com data-goto (cards do Início, link dentro do estado "Receber")
// navegam pra outra aba e, opcionalmente, abrem uma categoria de configurações.
document.querySelectorAll('[data-goto]').forEach((el) => {
  el.addEventListener('click', () => {
    activateTab(el.dataset.goto);
    if (el.dataset.settingsPanel) activateSettingsPanel(el.dataset.settingsPanel);
  });
});

document.getElementById('home-goto-player').addEventListener('click', () => activateTab('player'));

// --- Sub-abas "Dispositivos": Servidores DLNA / Receber ---
const deviceViewTabs = document.querySelectorAll('.pill-tab[data-device-view]');
const deviceViewPanels = document.querySelectorAll('.device-view[data-device-view-panel]');

deviceViewTabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    deviceViewTabs.forEach((b) => {
      const active = b === btn;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    deviceViewPanels.forEach((p) => p.classList.toggle('active', p.dataset.deviceViewPanel === btn.dataset.deviceView));
  });
});

// --- Sub-navegação "Configurações" ---
const settingsNavItems = document.querySelectorAll('.settings-nav-item[data-settings]');
const settingsPanels = document.querySelectorAll('.settings-panel[data-panel]');

function activateSettingsPanel(name) {
  settingsNavItems.forEach((b) => b.classList.toggle('active', b.dataset.settings === name));
  settingsPanels.forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
}

settingsNavItems.forEach((btn) => {
  btn.addEventListener('click', () => activateSettingsPanel(btn.dataset.settings));
});

// --- Sidebar recolhível (responsiva) ---
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
let sidebarManuallySet = localStorage.getItem('sidebarCollapsed') !== null;

function setSidebarCollapsed(collapsed) {
  sidebar.classList.toggle('collapsed', collapsed);
  sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
}

function applyInitialSidebarState() {
  const stored = localStorage.getItem('sidebarCollapsed');
  const collapsed = stored !== null ? stored === '1' : window.innerWidth < 900;
  setSidebarCollapsed(collapsed);
}
applyInitialSidebarState();

sidebarToggle.addEventListener('click', () => {
  const collapsed = !sidebar.classList.contains('collapsed');
  sidebarManuallySet = true;
  localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0');
  setSidebarCollapsed(collapsed);
});

window.addEventListener('resize', () => {
  if (sidebarManuallySet) return;
  setSidebarCollapsed(window.innerWidth < 900);
});

// --- Tema (claro / escuro / automático) ---
const themeButtons = document.querySelectorAll('.segmented-btn[data-theme-choice]');
const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');

function resolveTheme(pref) {
  if (pref === 'auto') return darkMedia.matches ? 'dark' : 'light';
  return pref;
}

function applyTheme(pref) {
  document.documentElement.setAttribute('data-theme', resolveTheme(pref));
  themeButtons.forEach((b) => b.classList.toggle('active', b.dataset.themeChoice === pref));
}

let themePref = localStorage.getItem('theme') || 'dark';
applyTheme(themePref);

themeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    themePref = btn.dataset.themeChoice;
    localStorage.setItem('theme', themePref);
    applyTheme(themePref);
  });
});

darkMedia.addEventListener('change', () => {
  if (themePref === 'auto') applyTheme('auto');
});

// --- Reduzir animações ---
const reduceMotionChk = document.getElementById('chk-reduce-motion');
function applyReduceMotion(enabled) {
  document.documentElement.classList.toggle('reduce-motion', enabled);
  reduceMotionChk.checked = enabled;
}
applyReduceMotion(localStorage.getItem('reduceMotion') === '1');
reduceMotionChk.addEventListener('change', () => {
  localStorage.setItem('reduceMotion', reduceMotionChk.checked ? '1' : '0');
  applyReduceMotion(reduceMotionChk.checked);
});

// --- Area de video embutida (janela nativa sobreposta, controlada pelo main process) ---
const videoHost = document.getElementById('video-host');

function sendVideoRect() {
  const playerTabActive = document.getElementById('tab-player').classList.contains('active');
  if (!playerTabActive) {
    window.api.setVideoRect({ x: 0, y: 0, width: 0, height: 0 });
    return;
  }
  const rect = videoHost.getBoundingClientRect();
  window.api.setVideoRect({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
}

new ResizeObserver(sendVideoRect).observe(videoHost);
window.addEventListener('resize', sendVideoRect);

// --- "Em reprodução": indicador na sidebar + card no Início ---
const navNowPlaying = document.getElementById('nav-now-playing');
const homeNowPlaying = document.getElementById('home-now-playing');
const homeNowPlayingTitle = document.getElementById('home-now-playing-title');

function displayNameFor(target) {
  if (!target) return target;
  const clean = target.split('?')[0];
  const parts = clean.split(/[\\/]/);
  return parts[parts.length - 1] || target;
}

window.api.onNowPlaying(({ target } = {}) => {
  activateTab('player');
  navNowPlaying.hidden = false;
  autoAdvanceTriggered = false;
  if (target) {
    homeNowPlaying.hidden = false;
    homeNowPlayingTitle.textContent = displayNameFor(target);
    homeNowPlayingTitle.title = target;
  }
});

const statusEl = document.getElementById('status');
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#e05252' : '';
}

document.getElementById('btn-pick').addEventListener('click', async () => {
  const file = await window.api.pickFile();
  if (!file) return;
  // Arquivo local avulso nao faz parte de nenhuma pasta DLNA navegada — limpa
  // o contexto usado por "reproduzir proximo automaticamente".
  lastFolderFiles = [];
  lastFolderPlayingUrl = null;
  setStatus(t('status.loading', { name: file }));
  try {
    await window.api.load(file);
    setStatus(t('status.playing', { name: file }));
  } catch (err) {
    setStatus(t('status.error', { message: err.message }), true);
  }
});

// --- Tela cheia (o botao e os demais controles moraram pro overlay, ver overlay-renderer.js) ---
window.api.onFullscreenChanged((isFullscreen) => {
  document.body.classList.toggle('fullscreen-mode', isFullscreen);
  sendVideoRect();
  // a troca de layout (esconder header) pode levar um instante pra refletir no getBoundingClientRect
  setTimeout(sendVideoRect, 100);
  setTimeout(sendVideoRect, 350);
});

// --- Atalhos de teclado do player (chamam as mesmas APIs que os botoes do overlay) ---
function isTypingTarget(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('fullscreen-mode')) {
    window.api.toggleFullscreen().catch(() => {});
    return;
  }

  const playerTabActive = document.getElementById('tab-player').classList.contains('active');
  if (!playerTabActive || isTypingTarget(document.activeElement)) return;

  switch (e.key) {
    case ' ':
    case 'Spacebar':
      e.preventDefault();
      window.api.togglePlayPause().catch(() => {});
      break;
    case 'ArrowLeft':
      window.api.seek(-10).catch(() => {});
      break;
    case 'ArrowRight':
      window.api.seek(10).catch(() => {});
      break;
    case 'm':
    case 'M':
      window.api.toggleMute().catch(() => {});
      break;
    case 'f':
    case 'F':
      window.api.toggleFullscreen().catch(() => {});
      break;
    default:
      break;
  }
});

// --- DLNA ---
let currentServer = null;
let pathStack = [{ id: '0', title: 'Raiz' }];

// Contexto usado por "Reproduzir proximo automaticamente" (Configuracoes >
// Reproducao): a lista de arquivos da ultima pasta DLNA navegada e a URL que
// esta tocando dentro dela.
let lastFolderFiles = [];
let lastFolderPlayingUrl = null;
let autoAdvanceTriggered = false;
let autoPlayNextEnabled = false;

const dlnaList = document.getElementById('dlna-list');
const breadcrumb = document.getElementById('dlna-breadcrumb');
const dlnaInitialState = document.getElementById('dlna-initial-state');

const ICONS = {
  server: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><rect x="3" y="4" width="18" height="6" rx="1.5" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="14" width="18" height="6" rx="1.5" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="7" r="1" fill="currentColor"/><circle cx="7" cy="17" r="1" fill="currentColor"/></svg>',
  folder: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M4 6.5A1.5 1.5 0 0 1 5.5 5H10l2 2.5h6.5A1.5 1.5 0 0 1 20 9v8.5A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-11Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  file: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M6 4h8l4 4v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10 10.5 14.5 13 10 15.5v-5Z" fill="currentColor"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M14 6 8 12l6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  spinner: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

function makeRow(type, iconKey, title, onClick) {
  const li = document.createElement('li');
  li.className = type;
  const icon = document.createElement('span');
  icon.className = 'row-icon';
  icon.innerHTML = ICONS[iconKey];
  const label = document.createElement('span');
  label.className = 'row-title';
  label.textContent = title;
  li.appendChild(icon);
  li.appendChild(label);
  if (onClick) li.addEventListener('click', onClick);
  return li;
}

document.getElementById('btn-discover').addEventListener('click', async () => {
  dlnaInitialState.hidden = true;
  setStatus(t('dlna.status.searching'));
  breadcrumb.textContent = '';
  currentServer = null;
  dlnaList.innerHTML = '';
  dlnaList.appendChild(makeRow('loading', 'spinner', t('dlna.status.searchingRow')));
  try {
    const servers = await window.api.discoverDlna();
    if (!servers.length) {
      setStatus(t('dlna.status.noneFound'));
      dlnaList.innerHTML = '';
      dlnaList.appendChild(makeRow('empty', 'server', t('dlna.status.noneFoundRow')));
      return;
    }
    setStatus(t('dlna.status.foundCount', { count: servers.length }));
    dlnaList.innerHTML = '';
    servers.forEach((server) => {
      dlnaList.appendChild(makeRow('server', 'server', server.name, () => openServer(server)));
    });
  } catch (err) {
    dlnaList.innerHTML = '';
    setStatus(t('dlna.status.searchError', { message: err.message }), true);
  }
});

async function openServer(server) {
  currentServer = server;
  pathStack = [{ id: '0', title: server.name }];
  await renderFolder();
}

async function renderFolder() {
  const current = pathStack[pathStack.length - 1];
  breadcrumb.textContent = pathStack.map((p) => p.title).join(' / ');
  dlnaList.innerHTML = '';
  dlnaList.appendChild(makeRow('loading', 'spinner', t('dlna.status.loadingRow')));
  try {
    const items = await window.api.browseDlna(currentServer, current.id);
    dlnaList.innerHTML = '';

    if (pathStack.length > 1) {
      dlnaList.appendChild(
        makeRow('folder', 'back', t('dlna.status.back'), () => {
          pathStack.pop();
          renderFolder();
        })
      );
    }

    if (!items.length) {
      dlnaList.appendChild(makeRow('empty', 'folder', t('dlna.status.emptyFolder')));
    }

    items.forEach((item) => {
      dlnaList.appendChild(
        makeRow(item.type, item.type === 'folder' ? 'folder' : 'file', item.title, async () => {
          if (item.type === 'folder') {
            pathStack.push({ id: item.id, title: item.title });
            renderFolder();
          } else {
            // Guarda a lista de arquivos desta pasta — usada por "reproduzir
            // proximo automaticamente" pra achar o item seguinte quando o
            // video atual chegar ao fim.
            lastFolderFiles = items.filter((i) => i.type === 'file');
            lastFolderPlayingUrl = item.url;
            setStatus(t('status.loading', { name: item.title }));
            try {
              await window.api.load(item.url);
              setStatus(t('status.playing', { name: item.title }));
            } catch (err) {
              setStatus(t('status.error', { message: err.message }), true);
            }
          }
        })
      );
    });
  } catch (err) {
    setStatus(t('dlna.status.navError', { message: err.message }), true);
  }
}

// --- Receber (cast target) ---
const castToggleBtn = document.getElementById('btn-cast-toggle');
const castStatusEl = document.getElementById('cast-status');
const autoStartChk = document.getElementById('chk-auto-start');
const interfaceSelect = document.getElementById('sel-interface');
const activityDot = document.getElementById('cast-activity-dot');
const activityText = document.getElementById('cast-activity-text');

const ACTIVITY_LABELS = {
  discovery: (remote) => t('cast.activity.discovery', { remote }),
  SetAVTransportURI: () => t('cast.activity.setUri'),
  Play: () => t('cast.activity.play'),
  Pause: () => t('cast.activity.pause'),
  Stop: () => t('cast.activity.stop'),
  Seek: () => t('cast.activity.seek'),
  SetVolume: () => t('cast.activity.setVolume'),
  SetMute: () => t('cast.activity.setMute'),
  GetTransportInfo: () => t('cast.activity.getTransportInfo'),
  GetPositionInfo: () => t('cast.activity.getTransportInfo'),
};

let activityClearTimer = null;
window.api.onCastActivity((info) => {
  const label = info.type === 'discovery' ? ACTIVITY_LABELS.discovery(info.remote) : (ACTIVITY_LABELS[info.action] || (() => t('cast.activity.unknown', { action: info.action })))();
  activityText.textContent = label;
  activityDot.classList.add('live');
  clearTimeout(activityClearTimer);
  activityClearTimer = setTimeout(() => {
    activityDot.classList.remove('live');
    activityText.textContent = t('devices.receive.waiting');
  }, 4000);
});

// Guardado pra poder re-renderizar o texto (que embute o idioma atual) se o
// usuario trocar o idioma com a aba Dispositivos aberta.
let lastCastStatus = null;

function renderCastStatus(status) {
  lastCastStatus = status;
  if (status.active) {
    castToggleBtn.textContent = t('devices.receive.deactivate');
    castStatusEl.textContent = t('cast.status.active', {
      name: status.friendlyName,
      ip: status.ip,
      port: status.port,
      iface: status.interfaceName || '?',
    });
  } else {
    castToggleBtn.textContent = t('devices.receive.activate');
    castStatusEl.textContent = t('cast.status.inactive');
  }
  if (status.interfaces) populateInterfaceSelect(status.interfaces);
}

function populateInterfaceSelect(interfaces) {
  const previousValue = interfaceSelect.value;
  interfaceSelect.innerHTML = '';
  const autoOpt = document.createElement('option');
  autoOpt.value = '';
  autoOpt.textContent = t('dlna.interface.auto');
  interfaceSelect.appendChild(autoOpt);
  interfaces.forEach((iface) => {
    const opt = document.createElement('option');
    opt.value = iface.name;
    opt.textContent = `${iface.name} — ${iface.address}${iface.virtual ? ' (VPN/virtual)' : ''}`;
    interfaceSelect.appendChild(opt);
  });
  interfaceSelect.value = previousValue || '';
}

castToggleBtn.addEventListener('click', async () => {
  castToggleBtn.disabled = true;
  try {
    const status = await window.api.rendererStatus();
    const next = status.active ? await window.api.stopRenderer() : await window.api.startRenderer();
    renderCastStatus(next);
  } catch (err) {
    setStatus(t('status.error', { message: err.message }), true);
  } finally {
    castToggleBtn.disabled = false;
  }
});

autoStartChk.addEventListener('change', () => {
  window.api.setAutoStart(autoStartChk.checked).catch((err) => setStatus(t('status.error', { message: err.message }), true));
});

interfaceSelect.addEventListener('change', async () => {
  interfaceSelect.disabled = true;
  try {
    const status = await window.api.setInterface(interfaceSelect.value || null);
    renderCastStatus(status);
  } catch (err) {
    setStatus(t('status.error', { message: err.message }), true);
  } finally {
    interfaceSelect.disabled = false;
  }
});

Promise.all([window.api.getSettings(), window.api.rendererStatus()])
  .then(([s, status]) => {
    autoStartChk.checked = !!s.autoStartRenderer;
    renderCastStatus(status);
    interfaceSelect.value = s.preferredInterface || '';

    discoveryTimeoutSelect.value = String(s.dlnaDiscoveryTimeout || 4000);
    defaultVolumeSelect.value = String(s.defaultVolume ?? 100);
    autoReconnectChk.checked = !!s.autoReconnectCast;
    autoPlayNextChk.checked = !!s.autoPlayNext;
    autoPlayNextEnabled = !!s.autoPlayNext;
    liveBufferProfileSelect.value = s.liveBufferProfile || 'auto';
    liveQualityLabelChk.checked = s.showLiveQualityLabel !== false;
    liveEventToastsChk.checked = s.showLiveEventToasts !== false;
    liveCustomTargetInput.value = s.liveCustomTargetSecs ?? 5;
    liveCustomTargetRow.hidden = liveBufferProfileSelect.value !== 'custom';
  })
  .catch(() => {});

window.api.onCastStatusChanged((status) => renderCastStatus(status));

// --- Configurações: Player (ajuste de imagem) ---
const fitModeSelect = document.getElementById('sel-fit-mode');
window.api.getFitModes().then(({ modes, current }) => {
  fitModeSelect.innerHTML = '';
  modes.forEach((mode) => {
    const opt = document.createElement('option');
    opt.value = mode.id;
    opt.textContent = mode.label;
    fitModeSelect.appendChild(opt);
  });
  fitModeSelect.value = current;
}).catch(() => {});

fitModeSelect.addEventListener('change', () => {
  window.api.setFitMode(fitModeSelect.value).catch(() => {});
});

// --- Configurações: Geral (janela sempre visível) ---
const alwaysOnTopChk = document.getElementById('chk-always-on-top');
window.api.getAlwaysOnTop().then((v) => { alwaysOnTopChk.checked = !!v; }).catch(() => {});
alwaysOnTopChk.addEventListener('change', async () => {
  try {
    const next = await window.api.toggleAlwaysOnTop();
    alwaysOnTopChk.checked = !!next;
  } catch {
    // sem suporte nesta plataforma/janela, mantem o estado anterior
  }
});

// --- Configurações: Sobre ---
const aboutVersionEl = document.getElementById('about-version');
const aboutElectronEl = document.getElementById('about-electron');
try {
  aboutVersionEl.textContent = window.api.getAppVersion ? window.api.getAppVersion() : '—';
  aboutElectronEl.textContent = window.api.getElectronVersion ? window.api.getElectronVersion() : '—';
} catch {
  // informativo apenas — segue sem quebrar a tela de Configurações
}

// --- Configurações: DLNA (tempo de descoberta, reconexão automática) ---
const discoveryTimeoutSelect = document.getElementById('sel-discovery-timeout');
discoveryTimeoutSelect.addEventListener('change', () => {
  window.api.setDiscoveryTimeout(Number(discoveryTimeoutSelect.value)).catch(() => {});
});

const autoReconnectChk = document.getElementById('chk-auto-reconnect');
autoReconnectChk.addEventListener('change', () => {
  window.api.setAutoReconnectCast(autoReconnectChk.checked).catch(() => {});
});

// --- Configurações: Reprodução (volume padrão, reproduzir próximo) ---
const defaultVolumeSelect = document.getElementById('sel-default-volume');
defaultVolumeSelect.addEventListener('change', () => {
  window.api.setDefaultVolume(Number(defaultVolumeSelect.value)).catch(() => {});
});

// --- Configurações: Ao Vivo (perfil de buffer, rótulo de qualidade) ---
const liveBufferProfileSelect = document.getElementById('sel-live-buffer-profile');
const liveCustomTargetRow = document.getElementById('row-live-custom-target');
const liveCustomTargetInput = document.getElementById('num-live-custom-target');
liveBufferProfileSelect.addEventListener('change', () => {
  liveCustomTargetRow.hidden = liveBufferProfileSelect.value !== 'custom';
  window.api.setLiveBufferProfile(liveBufferProfileSelect.value).catch(() => {});
});
liveCustomTargetInput.addEventListener('change', () => {
  const secs = Math.max(1, Math.min(30, Number(liveCustomTargetInput.value) || 5));
  liveCustomTargetInput.value = secs;
  window.api.setLiveCustomTarget(secs).catch(() => {});
});

const liveQualityLabelChk = document.getElementById('chk-live-quality-label');
liveQualityLabelChk.addEventListener('change', () => {
  window.api.setShowLiveQualityLabel(liveQualityLabelChk.checked).catch(() => {});
});

const liveEventToastsChk = document.getElementById('chk-live-event-toasts');
liveEventToastsChk.addEventListener('change', () => {
  window.api.setShowLiveEventToasts(liveEventToastsChk.checked).catch(() => {});
});

const autoPlayNextChk = document.getElementById('chk-auto-play-next');
autoPlayNextChk.addEventListener('change', () => {
  autoPlayNextEnabled = autoPlayNextChk.checked;
  window.api.setAutoPlayNext(autoPlayNextEnabled).catch(() => {});
});

async function maybeAutoPlayNext() {
  if (!autoPlayNextEnabled || !lastFolderFiles.length || !lastFolderPlayingUrl) return;
  const idx = lastFolderFiles.findIndex((f) => f.url === lastFolderPlayingUrl);
  if (idx === -1 || idx + 1 >= lastFolderFiles.length) return;
  const next = lastFolderFiles[idx + 1];
  lastFolderPlayingUrl = next.url;
  setStatus(t('status.autoPlaying', { name: next.title }));
  try {
    await window.api.load(next.url);
  } catch (err) {
    setStatus(t('status.error', { message: err.message }), true);
  }
}

// mpv fica pausado no ultimo frame ao terminar um arquivo (--keep-open=yes),
// nao "idle" — entao o fim de video se detecta por paused+posicao no fim,
// nao pelo estado idle (que so acontece se a transmissao cair de verdade).
window.api.onPlayerStatus((info) => {
  if (!info || info.idle) return;
  const reachedEnd = !info.buffering && info.paused && info.duration > 0 && info.position >= info.duration - 1.5;
  if (!reachedEnd) {
    autoAdvanceTriggered = false;
    return;
  }
  if (autoAdvanceTriggered) return;
  autoAdvanceTriggered = true;
  maybeAutoPlayNext();
});

// --- Configurações: Geral (iniciar com o Windows) ---
const launchOnBootChk = document.getElementById('chk-launch-on-boot');
window.api.getLaunchOnBoot().then((v) => { launchOnBootChk.checked = !!v; }).catch(() => {});
launchOnBootChk.addEventListener('change', async () => {
  try {
    const next = await window.api.setLaunchOnBoot(launchOnBootChk.checked);
    launchOnBootChk.checked = !!next;
  } catch {
    // sem suporte nesta plataforma, mantem o estado anterior
  }
});

// --- Configurações: Aparência (escala da interface) ---
const uiScaleSelect = document.getElementById('sel-ui-scale');
const savedUiScale = localStorage.getItem('uiScale') || '1';
uiScaleSelect.value = savedUiScale;
window.api.setUiScale(Number(savedUiScale));
uiScaleSelect.addEventListener('change', () => {
  localStorage.setItem('uiScale', uiScaleSelect.value);
  window.api.setUiScale(Number(uiScaleSelect.value));
});

// --- Histórico ---
const historyList = document.getElementById('history-list');
const historyEmptyState = document.getElementById('history-empty-state');

function formatClock(totalSeconds) {
  const n = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const HISTORY_ICON = ICONS.file;
const HISTORY_TRASH_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const HISTORY_PLAY_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M8 5v14l11-7-11-7Z" fill="currentColor"/></svg>';

// Entradas de rede (DLNA — tanto navegado quanto recebido via cast) usam uma
// URL http(s) que pode mudar ou parar de existir de uma sessao pra outra
// (servidor desligado, token de cast expirado etc.), diferente de um caminho
// de arquivo local, que continua valendo. Por isso so oferecemos "retomar"
// pra entradas locais — pra rede, retomar direto do historico nao faz
// sentido, so faria o load falhar.
function isNetworkTarget(target) {
  return /^https?:\/\//i.test(String(target || ''));
}

function buildHistoryRow(entry) {
  const li = document.createElement('li');
  li.className = 'file';

  const icon = document.createElement('span');
  icon.className = 'row-icon';
  icon.innerHTML = HISTORY_ICON;

  const main = document.createElement('div');
  main.className = 'history-row-main';

  const title = document.createElement('span');
  title.className = 'history-row-title';
  title.textContent = displayNameFor(entry.target);
  title.title = entry.target;
  main.appendChild(title);

  if (entry.duration) {
    const pct = Math.min(100, Math.max(0, (entry.position / entry.duration) * 100));
    const track = document.createElement('div');
    track.className = 'history-progress-track';
    const fill = document.createElement('div');
    fill.className = 'history-progress-fill';
    fill.style.width = pct.toFixed(1) + '%';
    track.appendChild(fill);
    main.appendChild(track);

    const meta = document.createElement('span');
    meta.className = 'history-meta';
    meta.textContent = t('history.meta', { position: formatClock(entry.position), duration: formatClock(entry.duration) });
    main.appendChild(meta);
  }

  const actions = document.createElement('div');
  actions.className = 'history-actions';

  if (isNetworkTarget(entry.target)) {
    const tag = document.createElement('span');
    tag.className = 'status-chip history-source-tag';
    tag.textContent = t('history.dlnaTag');
    tag.title = t('history.dlnaTooltip');
    actions.appendChild(tag);
  } else {
    const playBtn = document.createElement('button');
    playBtn.className = 'history-action-btn';
    playBtn.title = t('history.resume');
    playBtn.setAttribute('aria-label', t('history.resume'));
    playBtn.innerHTML = HISTORY_PLAY_ICON;
    playBtn.addEventListener('click', async () => {
      setStatus(t('history.loading', { name: entry.target }));
      try {
        await window.api.load(entry.target);
        setStatus(t('status.playing', { name: entry.target }));
      } catch (err) {
        setStatus(t('status.error', { message: err.message }), true);
      }
    });
    actions.appendChild(playBtn);
  }

  const removeBtn = document.createElement('button');
  removeBtn.className = 'history-action-btn danger';
  removeBtn.title = t('history.remove');
  removeBtn.setAttribute('aria-label', t('history.remove'));
  removeBtn.innerHTML = HISTORY_TRASH_ICON;
  removeBtn.addEventListener('click', async () => {
    await window.api.removeHistoryItem(entry.target).catch(() => {});
    renderHistoryList();
  });

  actions.appendChild(removeBtn);

  li.appendChild(icon);
  li.appendChild(main);
  li.appendChild(actions);
  return li;
}

async function renderHistoryList() {
  let entries = [];
  try {
    entries = await window.api.getHistory();
  } catch {
    entries = [];
  }
  historyList.innerHTML = '';
  historyEmptyState.hidden = entries.length > 0;
  entries.forEach((entry) => historyList.appendChild(buildHistoryRow(entry)));
}

document.querySelector('.nav-item[data-tab="historico"]').addEventListener('click', renderHistoryList);

// --- Mecanismo de reprodução / mpv (Configurações > Avançado) ---
const mpvEngineStatusEl = document.getElementById('mpv-engine-status');
const mpvEngineChipEl = document.getElementById('mpv-engine-chip');
window.api.getMpvInfo().then((info) => {
  if (!info || !info.available) {
    mpvEngineStatusEl.textContent = t('avancado.mpvEngine.notFound');
    mpvEngineChipEl.hidden = false;
    mpvEngineChipEl.textContent = '—';
    mpvEngineChipEl.className = 'status-chip status-chip-danger';
    return;
  }
  mpvEngineStatusEl.textContent = info.version ? `${info.version} — ${info.path}` : info.path;
  mpvEngineChipEl.hidden = false;
  mpvEngineChipEl.className = 'status-chip status-chip-success';
}).catch(() => {
  mpvEngineStatusEl.textContent = t('avancado.mpvEngine.notFound');
});

// --- Logs (Configurações > Avançado) ---
const logsBackdrop = document.getElementById('logs-modal-backdrop');
const logsBody = document.getElementById('logs-modal-body');

async function refreshLogs() {
  try {
    const lines = await window.api.getLogs();
    logsBody.textContent = lines.length ? lines.join('\n') : t('logs.modal.empty');
    logsBody.scrollTop = logsBody.scrollHeight;
  } catch (err) {
    logsBody.textContent = t('logs.modal.loadError', { message: err.message });
  }
}

function openLogsModal() {
  logsBackdrop.hidden = false;
  requestAnimationFrame(() => logsBackdrop.classList.add('open'));
  refreshLogs();
}

function closeLogsModal() {
  logsBackdrop.classList.remove('open');
  setTimeout(() => { logsBackdrop.hidden = true; }, 200);
}

document.getElementById('btn-open-logs').addEventListener('click', openLogsModal);
document.getElementById('btn-logs-close').addEventListener('click', closeLogsModal);
document.getElementById('btn-logs-refresh').addEventListener('click', refreshLogs);
document.getElementById('btn-logs-copy').addEventListener('click', () => {
  window.api.copyText(logsBody.textContent);
});
logsBackdrop.addEventListener('click', (e) => {
  if (e.target === logsBackdrop) closeLogsModal();
});

// --- Biblioteca ---
const libraryEmptyState = document.getElementById('library-empty-state');
const libraryActions = document.getElementById('library-actions');
const libraryGrid = document.getElementById('library-grid');
const libraryProgress = document.getElementById('library-progress');
const libraryProgressFill = document.getElementById('library-progress-fill');
const libraryProgressText = document.getElementById('library-progress-text');
const librarySubtitle = document.getElementById('library-subtitle');

function formatBytes(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

function buildMediaCard(item) {
  const card = document.createElement('button');
  card.className = 'media-card';
  card.type = 'button';

  const thumb = document.createElement('div');
  thumb.className = 'media-card-thumb';
  if (item.thumbnail) {
    const img = document.createElement('img');
    img.src = 'file:///' + item.thumbnail.replace(/\\/g, '/');
    img.loading = 'lazy';
    img.alt = '';
    thumb.appendChild(img);
  } else {
    thumb.innerHTML = ICONS.file;
  }
  const playOverlay = document.createElement('div');
  playOverlay.className = 'media-card-play';
  playOverlay.innerHTML = HISTORY_PLAY_ICON;
  thumb.appendChild(playOverlay);

  const title = document.createElement('div');
  title.className = 'media-card-title';
  title.textContent = item.name;
  title.title = item.name;

  const meta = document.createElement('div');
  meta.className = 'media-card-meta';
  meta.textContent = formatBytes(item.size);

  card.appendChild(thumb);
  card.appendChild(title);
  card.appendChild(meta);

  card.addEventListener('click', async () => {
    setStatus(t('status.loading', { name: item.name }));
    try {
      await window.api.load(item.path);
      setStatus(t('status.playing', { name: item.name }));
    } catch (err) {
      setStatus(t('status.error', { message: err.message }), true);
    }
  });

  return card;
}

// Guardado pra re-renderizar o subtitulo (que embute o idioma atual) se o
// usuario trocar o idioma com a aba Biblioteca aberta.
let lastLibraryIndex = null;

function renderLibrary(index) {
  lastLibraryIndex = index;
  const hasFolder = !!index.folder;
  libraryEmptyState.hidden = hasFolder;
  libraryActions.hidden = !hasFolder;
  librarySubtitle.textContent = hasFolder
    ? t('library.subtitleWithFolder', { folder: index.folder, count: index.items.length })
    : t('library.subtitleEmpty');

  libraryGrid.innerHTML = '';
  index.items.forEach((item) => libraryGrid.appendChild(buildMediaCard(item)));
}

async function loadLibrary() {
  try {
    renderLibrary(await window.api.getLibrary());
  } catch {
    // segue com a grade vazia
  }
}

async function runLibraryScan(folder) {
  libraryProgress.hidden = false;
  libraryProgressFill.style.width = '0%';
  libraryProgressText.textContent = t('library.progress.scanning');
  try {
    renderLibrary(await window.api.scanLibrary(folder));
  } catch (err) {
    setStatus(t('status.libraryScanError', { message: err.message }), true);
  } finally {
    libraryProgress.hidden = true;
  }
}

async function pickAndScanLibraryFolder() {
  const folder = await window.api.pickLibraryFolder();
  if (!folder) return;
  await runLibraryScan(folder);
}

window.api.onLibraryScanProgress(({ done, total, currentName }) => {
  const pct = total ? Math.round((done / total) * 100) : 0;
  libraryProgressFill.style.width = pct + '%';
  libraryProgressText.textContent = t('library.progress.thumbnails', { done, total, name: currentName });
});

document.getElementById('btn-library-pick-folder').addEventListener('click', pickAndScanLibraryFolder);
document.getElementById('btn-library-change-folder').addEventListener('click', pickAndScanLibraryFolder);
document.getElementById('btn-library-rescan').addEventListener('click', async () => {
  const index = await window.api.getLibrary();
  if (index.folder) runLibraryScan(index.folder);
});

document.querySelector('.nav-item[data-tab="biblioteca"]').addEventListener('click', loadLibrary);
loadLibrary();

// --- Atualizações ---
const checkUpdatesChk = document.getElementById('chk-check-updates');
const updateStatusEl = document.getElementById('update-status');

function renderUpdateResult(result) {
  if (!result.configured) {
    updateStatusEl.textContent = t('update.notConfigured');
    return;
  }
  if (result.error) {
    updateStatusEl.textContent = t('update.error', { message: result.error });
    return;
  }
  updateStatusEl.textContent = result.updateAvailable
    ? t('update.available', { version: result.latestVersion })
    : t('update.upToDate', { version: result.currentVersion });
  if (result.updateAvailable && result.url) {
    const link = document.createElement('a');
    link.href = result.url;
    link.textContent = t('update.viewOnGithub');
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    updateStatusEl.appendChild(link);
  }
}

document.getElementById('btn-check-updates').addEventListener('click', async () => {
  updateStatusEl.textContent = t('update.checking');
  try {
    renderUpdateResult(await window.api.checkForUpdate());
  } catch (err) {
    updateStatusEl.textContent = t('update.error', { message: err.message });
  }
});

checkUpdatesChk.addEventListener('change', () => {
  window.api.setCheckUpdatesAutomatically(checkUpdatesChk.checked).catch(() => {});
});

window.api.onUpdateAvailable((result) => renderUpdateResult(result));

Promise.all([window.api.getSettings()])
  .then(([s]) => { checkUpdatesChk.checked = !!s.checkUpdatesAutomatically; })
  .catch(() => {});

// --- Idioma ---
const languageSelect = document.getElementById('sel-language');
languageSelect.value = getCurrentLang();
languageSelect.addEventListener('change', () => {
  localStorage.setItem('lang', languageSelect.value);
  applyLanguage(languageSelect.value);
  // Textos estaticos ja foram trocados por applyLanguage via data-i18n; o que
  // sobra e o texto dinamico (montado em JS, embute o idioma no momento em
  // que foi gerado) — re-renderiza a partir do ultimo dado conhecido.
  if (lastCastStatus) renderCastStatus(lastCastStatus);
  if (lastLibraryIndex) renderLibrary(lastLibraryIndex);
});
