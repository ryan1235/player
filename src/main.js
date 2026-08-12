const { app, BrowserWindow, ipcMain, dialog, Menu, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const MPVPlayer = require('./mpv');
const dlna = require('./dlna');
const DlnaRenderer = require('./dlna-renderer');
const WatchHistory = require('./watch-history');
const Settings = require('./settings');
const Library = require('./library');
const { checkForUpdate } = require('./update-checker');
const logger = require('./services/logger');
const packageJson = require('../package.json');

// Impede que o app abra mais de uma vez ao mesmo tempo (rodar "electron ."
// de novo sem fechar o anterior so foca a janela ja aberta, em vez de duplicar).
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  return;
}

// O compositor DirectComposition do Chromium normalmente cobre janelas nativas
// filhas embutidas via SetParent/--wid, resultando em tela preta. Desativar a
// aceleracao de hardware faz o Chromium compor via GDI e deixa o mpv aparecer.
app.disableHardwareAcceleration();

let mainWindow;
let controlsOverlay;
let player;
let renderer;
let lastVideoRect = null;
let lastCursorPos = null;
let cursorPollTimer = null;
let appliedDefaultVolume = false;
let castSupervisorTimer = null;

const watchHistory = new WatchHistory(path.join(app.getPath('userData'), 'watch-history.json'));
const settings = new Settings(path.join(app.getPath('userData'), 'settings.json'));
const library = new Library(path.join(app.getPath('userData'), 'library.json'), path.join(app.getPath('userData'), 'thumbnails'));

function getHwndBuffer(win) {
  // Buffer bruto do handle nativo da janela — usado tanto pro --wid do mpv
  // quanto pra descobrir depois, via API do Windows, o hwnd que ele criou ao
  // ser embutido (ver src/native-embed.js e mpv.js).
  return win.getNativeWindowHandle();
}

// --- Modos de ajuste de imagem (aspect-ratio / preencher tela) ---
// video-aspect-override: forca o mpv a interpretar o video com essa proporcao.
// panscan: 0 = sem cortar (pode sobrar borda preta), 1 = corta o excesso pra
// preencher a janela inteira sem distorcer.
const KNOWN_RATIOS = [
  [16, 9],
  [16, 10],
  [4, 3],
  [21, 9],
  [3, 2],
  [5, 4],
  [1, 1],
];

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

function closestRatioLabel(width, height) {
  const target = width / height;
  let best = null;
  let bestDiff = Infinity;
  for (const [w, h] of KNOWN_RATIOS) {
    const diff = Math.abs(target - w / h);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = [w, h];
    }
  }
  if (best && bestDiff < 0.03) return `${best[0]}:${best[1]}`;
  const d = gcd(Math.round(width), Math.round(height)) || 1;
  return `${Math.round(width / d)}:${Math.round(height / d)}`;
}

function buildFitModes() {
  const modes = [
    { id: 'original', label: 'Automático (original)', aspect: '-1', panscan: 0 },
    { id: 'fill', label: 'Preencher tela (cortar bordas)', aspect: '-1', panscan: 1 },
  ];
  try {
    const { width, height } = screen.getPrimaryDisplay().size;
    const ratioLabel = closestRatioLabel(width, height);
    // So mostra o preset da tela se ele for diferente do 16:9 (senao seria
    // um item duplicado sem utilidade, ja que 16:9 ja esta na lista abaixo).
    if (ratioLabel !== '16:9') {
      modes.push({ id: 'monitor', label: `Minha tela (${ratioLabel})`, aspect: ratioLabel, panscan: 0 });
    }
  } catch {
    // sem informacao de tela disponivel, segue so com os presets fixos
  }
  modes.push(
    { id: '16:9', label: '16:9', aspect: '16:9', panscan: 0 },
    { id: '4:3', label: '4:3', aspect: '4:3', panscan: 0 },
    { id: '21:9', label: '21:9 (cinema)', aspect: '21:9', panscan: 0 },
    { id: '1:1', label: '1:1', aspect: '1:1', panscan: 0 }
  );
  return modes;
}

function createWindows() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Janela transparente sobreposta a area de video, so com os controles (HTML).
  // Fica sempre totalmente interativa (nao alterna ignoreMouseEvents em tempo
  // real): alternar isso a cada movimento do mouse e um recurso do Windows
  // conhecido por travar a entrega de eventos depois de algumas trocas, o que
  // deixava o overlay preso escondido sem responder a mais nada. Como o mpv
  // roda com --osc=no e a janela dele e focusable:false, nao ha nenhuma
  // interacao nativa do mpv que dependa de cliques atravessando o overlay.
  controlsOverlay = new BrowserWindow({
    parent: mainWindow,
    frame: false,
    show: false,
    skipTaskbar: true,
    type: 'toolbar',
    resizable: false,
    focusable: false,
    transparent: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  controlsOverlay.setMenuBarVisibility(false);
  controlsOverlay.loadFile(path.join(__dirname, 'overlay.html'));

  // So reagimos a 'move' aqui (a posicao muda mas o tamanho/layout do video nao).
  // Em 'resize' o layout interno (flex) ainda nao recalculou, entao usar o retangulo
  // antigo causava um "pulo" — o ResizeObserver do renderer.js manda o retangulo
  // certo assim que o CSS reflow acontece, e da conta do resize sozinho.
  mainWindow.on('move', updateEmbeddedVideoBounds);

  // Alt-tab pra outro app e voltar (ou minimizar/restaurar) as vezes deixa
  // artefatos visuais (pixels de OUTRA janela "grudados" na area da nossa)
  // — sintoma conhecido de compor uma janela nativa filha (o mpv via --wid)
  // dentro de um Electron rodando com aceleracao de hardware desligada (ver
  // app.disableHardwareAcceleration() acima: e o que permite o filho nativo
  // aparecer, mas troca o compositor por um caminho GDI mais sujeito a nao
  // redesenhar sozinho depois de perder/recuperar foco). Forcar um repaint
  // dos dois BrowserWindows mais um "reposicionamento" do mpv embutido (com
  // os MESMOS valores — SetWindowPos ainda assim faz o Windows recompor a
  // regiao) resolve sem precisar mexer no video em si.
  mainWindow.on('focus', forceRepaint);
  mainWindow.on('restore', forceRepaint);
  mainWindow.on('show', forceRepaint);
}

function forceRepaint() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try { mainWindow.webContents.invalidate(); } catch {}
  if (controlsOverlay && !controlsOverlay.isDestroyed()) {
    try { controlsOverlay.webContents.invalidate(); } catch {}
  }
  updateEmbeddedVideoBounds();
}

function updateEmbeddedVideoBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (!lastVideoRect || lastVideoRect.width <= 0 || lastVideoRect.height <= 0) {
    if (player) player.positionEmbedded(0, 0, 0, 0);
    if (controlsOverlay && !controlsOverlay.isDestroyed() && controlsOverlay.isVisible()) controlsOverlay.hide();
    return;
  }

  if (controlsOverlay && !controlsOverlay.isDestroyed()) {
    const mb = mainWindow.getContentBounds();
    const bounds = {
      x: Math.round(mb.x + lastVideoRect.x),
      y: Math.round(mb.y + lastVideoRect.y),
      width: Math.round(lastVideoRect.width),
      height: Math.round(lastVideoRect.height),
    };
    controlsOverlay.setBounds(bounds);
    if (!controlsOverlay.isVisible()) controlsOverlay.showInactive();
    // O overlay e uma janela irma (owned) de mainWindow, entao o Windows ja
    // mantem ela acima da dona no z-order automaticamente — moveTop() aqui e
    // so uma garantia extra, sem custo.
    controlsOverlay.moveTop();
  }

  if (player) {
    // O video agora e uma janela filha NATIVA de mainWindow (nao mais uma
    // BrowserWindow separada), entao a posicao e relativa ao proprio
    // client-area de mainWindow (sem somar getContentBounds — isso so vale
    // pra janelas irmas/top-level como o controlsOverlay acima). E como essa
    // chamada usa a API do Windows diretamente (sem passar pelas conversoes
    // do Electron), precisamos multiplicar pelo scaleFactor do monitor pra
    // converter de pixels logicos (DIP) pra pixels fisicos.
    const scale = screen.getDisplayMatching(mainWindow.getBounds()).scaleFactor || 1;
    player.positionEmbedded(
      Math.round(lastVideoRect.x * scale),
      Math.round(lastVideoRect.y * scale),
      Math.round(lastVideoRect.width * scale),
      Math.round(lastVideoRect.height * scale)
    );
  }
}

// O cursor sobre o video passa pela janela nativa embutida, entao mousemove
// do DOM nao detecta. Sondar a posicao global do mouse cobre esse caso pro
// sistema de auto-esconder a barra de controle saber que ha atividade.
function startCursorActivityPoll() {
  if (cursorPollTimer) return;
  cursorPollTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isFocused()) return;
    const pos = screen.getCursorScreenPoint();
    if (!lastCursorPos || pos.x !== lastCursorPos.x || pos.y !== lastCursorPos.y) {
      lastCursorPos = pos;
      broadcast('player:activity');
    }
  }, 300);
}

// O overlay de controles e a janela principal sao processos de renderer
// separados; eventos do player precisam chegar nos dois.
function broadcast(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  if (controlsOverlay && !controlsOverlay.isDestroyed()) controlsOverlay.webContents.send(channel, payload);
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

Menu.setApplicationMenu(null);
app.whenReady().then(async () => {
  createWindows();
  startCursorActivityPoll();

  const savedFitId = settings.get('videoFitMode');
  const initialFitMode = buildFitModes().find((m) => m.id === savedFitId) || buildFitModes()[0];

  let screenshotDir = path.join(app.getPath('pictures'), 'Aura Player');
  try {
    fs.mkdirSync(screenshotDir, { recursive: true });
  } catch (err) {
    console.error('Nao foi possivel criar a pasta de capturas de tela:', err.message);
    screenshotDir = null; // deixa o mpv usar o diretorio padrao dele mesmo
  }

  player = new MPVPlayer(watchHistory, {
    embedHwnd: getHwndBuffer(mainWindow),
    fitMode: initialFitMode,
    screenshotDir,
    liveBufferProfile: settings.get('liveBufferProfile'),
    liveCustomTargetSecs: settings.get('liveCustomTargetSecs'),
  });
  player.on('load', ({ target }) => {
    broadcast('player:now-playing', { target });
    // Volume padrao (Configuracoes > Reproducao) so se aplica no primeiro
    // arquivo carregado na sessao — depois disso o volume e "ao vivo",
    // ajustado pelo usuario, e nao deve ser sobrescrito a cada novo video.
    if (!appliedDefaultVolume) {
      appliedDefaultVolume = true;
      const vol = settings.get('defaultVolume');
      if (typeof vol === 'number') player.setVolume(vol).catch(() => {});
    }
  });
  player.on('status', (info) => {
    broadcast('player:status', info);
  });
  player.on('tracks', (info) => {
    broadcast('player:tracks', info);
  });
  player.on('live-event', (info) => {
    broadcast('player:live-event', info);
  });
  renderer = new DlnaRenderer(player);
  renderer.on('activity', (info) => {
    mainWindow.webContents.send('cast:activity', info);
  });
  renderer.on('source', (info) => {
    broadcast('cast:source', info);
  });

  mainWindow.on('enter-full-screen', () => broadcast('player:fullscreen-changed', true));
  mainWindow.on('leave-full-screen', () => broadcast('player:fullscreen-changed', false));

  if (settings.get('autoStartRenderer')) {
    try {
      await renderer.start(settings.get('preferredInterface'));
    } catch (err) {
      console.error('Falha ao iniciar recepcao automaticamente:', err.message);
    }
  }

  startCastSupervisor();

  if (settings.get('checkUpdatesAutomatically')) {
    checkForUpdate(packageJson.version)
      .then((result) => {
        if (result.configured && result.updateAvailable && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update:available', result);
        }
      })
      .catch((err) => logger.network('[update-checker] falha na checagem automatica:', err.message));
  }
});

// Supervisiona o modo "Receber" (Configuracoes > DLNA > Reconexao automatica):
// o servidor HTTP/SSDP fica preso ao IP que estava ativo quando foi ligado.
// Se a interface de rede mudar (troca de Wi-Fi, VPN liga/desliga, adaptador
// some) o servidor continua rodando mas fica inacessivel, com o IP antigo
// anunciado via SSDP. Aqui so verificamos periodicamente se o IP/interface
// atual ainda bate com o que foi anunciado — sem isso a funcao nao muda
// nada, e sem nenhum estado escondido alem do timer.
function startCastSupervisor() {
  if (castSupervisorTimer) return;
  castSupervisorTimer = setInterval(async () => {
    if (!settings.get('autoReconnectCast')) return;
    const status = renderer.getStatus();
    if (!status.active) return;
    const stillValid = status.interfaces.some((i) => i.name === status.interfaceName && i.address === status.ip);
    if (stillValid) return;
    logger.network('[cast-supervisor] interface/IP mudou, reiniciando recepcao...');
    try {
      await renderer.stop();
      const next = await renderer.start(settings.get('preferredInterface'));
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('cast:status-changed', next);
    } catch (err) {
      logger.error('[cast-supervisor] falha ao reiniciar recepcao:', err.message);
    }
  }, 15000);
}

app.on('window-all-closed', () => {
  player.quit();
  renderer.stop().catch(() => {});
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (castSupervisorTimer) clearInterval(castSupervisorTimer);
  player.quit();
  renderer.stop().catch(() => {});
});

ipcMain.handle('pick-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'm4v', 'ts'] }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('player:load', async (_evt, target) => {
  await player.loadFile(target);
  return true;
});
ipcMain.handle('player:play', () => player.play());
ipcMain.handle('player:toggle-live-mode', () => player.toggleLiveMode());
ipcMain.handle('player:pause', () => player.pause());
ipcMain.handle('player:toggle-play', async () => {
  const paused = await player.getProperty('pause', false);
  return paused ? player.play() : player.pause();
});
ipcMain.handle('player:seek', (_evt, secs) => player.seek(secs));
ipcMain.handle('player:volume', (_evt, vol) => player.setVolume(vol));
ipcMain.handle('player:stop', () => player.stop());
ipcMain.handle('player:seek-absolute', (_evt, secs) => player.seekAbsolute(secs));
ipcMain.handle('player:toggle-mute', () => player.toggleMute());
ipcMain.handle('player:toggle-subtitles', () => player.toggleSubtitles());
ipcMain.handle('player:cycle-subtitle-track', () => player.cycleSubtitleTrack());
ipcMain.handle('player:cycle-audio-track', () => player.cycleAudioTrack());
ipcMain.handle('player:screenshot', () => player.screenshot());
ipcMain.handle('player:set-video-track', (_evt, id) => player.setVideoTrack(id));
ipcMain.handle('player:return-to-live-edge', () => player.returnToLiveEdge());
ipcMain.handle('player:get-fit-modes', () => ({
  modes: buildFitModes(),
  current: player.fitMode.id,
}));
ipcMain.handle('player:set-fit-mode', async (_evt, id) => {
  const mode = buildFitModes().find((m) => m.id === id) || buildFitModes()[0];
  await player.applyFitMode(mode);
  settings.set('videoFitMode', mode.id);
  return mode.id;
});
ipcMain.handle('player:toggle-fullscreen', () => {
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});

ipcMain.handle('player:set-audio-track', (_evt, id) => player.setAudioTrack(id));
ipcMain.handle('player:set-subtitle-track', (_evt, id) => player.setSubtitleTrack(id));
ipcMain.handle('player:set-speed', (_evt, value) => player.setSpeed(value));
ipcMain.handle('player:get-media-info', () => player.getMediaInfo());

ipcMain.handle('window:toggle-always-on-top', () => {
  const next = !mainWindow.isAlwaysOnTop();
  mainWindow.setAlwaysOnTop(next);
  return next;
});
ipcMain.handle('window:get-always-on-top', () => mainWindow.isAlwaysOnTop());

ipcMain.handle('dlna:discover', () => dlna.discoverServers(settings.get('dlnaDiscoveryTimeout')));
ipcMain.handle('dlna:browse', (_evt, server, objectId) => dlna.browse(server, objectId));

ipcMain.handle('renderer:start', () => renderer.start(settings.get('preferredInterface')));
ipcMain.handle('renderer:stop', () => renderer.stop());
ipcMain.handle('renderer:status', () => renderer.getStatus());

ipcMain.handle('settings:get', () => settings.getAll());
ipcMain.handle('settings:set-auto-start', (_evt, value) => {
  settings.set('autoStartRenderer', !!value);
  return settings.getAll();
});
ipcMain.handle('settings:set-interface', async (_evt, name) => {
  settings.set('preferredInterface', name || null);
  if (renderer.getStatus().active) {
    await renderer.stop();
    await renderer.start(settings.get('preferredInterface'));
  }
  return renderer.getStatus();
});
ipcMain.handle('settings:set-discovery-timeout', (_evt, ms) => {
  settings.set('dlnaDiscoveryTimeout', Number(ms) || 4000);
  return settings.getAll();
});
ipcMain.handle('settings:set-default-volume', (_evt, vol) => {
  settings.set('defaultVolume', Number(vol));
  return settings.getAll();
});
ipcMain.handle('settings:set-auto-play-next', (_evt, value) => {
  settings.set('autoPlayNext', !!value);
  return settings.getAll();
});
ipcMain.handle('settings:set-auto-reconnect-cast', (_evt, value) => {
  settings.set('autoReconnectCast', !!value);
  return settings.getAll();
});

const LIVE_BUFFER_PROFILES = ['auto', 'low', 'balanced', 'stable', 'custom'];
ipcMain.handle('settings:set-live-buffer-profile', (_evt, profile) => {
  const value = LIVE_BUFFER_PROFILES.includes(profile) ? profile : 'auto';
  settings.set('liveBufferProfile', value);
  player.setBufferProfile(value);
  return settings.getAll();
});
ipcMain.handle('settings:set-live-custom-target', (_evt, secs) => {
  const value = Math.max(1, Math.min(30, Number(secs) || 5));
  settings.set('liveCustomTargetSecs', value);
  player.setCustomTargetSecs(value);
  return settings.getAll();
});
ipcMain.handle('settings:set-show-live-quality-label', (_evt, value) => {
  settings.set('showLiveQualityLabel', !!value);
  // A janela do overlay (onde o rotulo aparece) e um processo separado da
  // janela principal — sem esse broadcast ela so pegaria a mudanca no
  // proximo restart do app.
  broadcast('settings:show-live-quality-label-changed', !!value);
  return settings.getAll();
});
ipcMain.handle('settings:set-show-live-event-toasts', (_evt, value) => {
  settings.set('showLiveEventToasts', !!value);
  broadcast('settings:show-live-event-toasts-changed', !!value);
  return settings.getAll();
});
ipcMain.handle('settings:get-launch-on-boot', () => {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
});
ipcMain.handle('settings:set-launch-on-boot', (_evt, value) => {
  try {
    app.setLoginItemSettings({ openAtLogin: !!value });
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
});

ipcMain.handle('history:list', () => {
  const entries = Object.entries(watchHistory.getAll()).map(([target, entry]) => ({ target, ...entry }));
  entries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return entries;
});
ipcMain.handle('history:remove', (_evt, target) => {
  watchHistory.clear(target);
  return true;
});

ipcMain.handle('logs:get', () => logger.getBuffer());
ipcMain.handle('system:get-mpv-info', () => MPVPlayer.getMpvInfo());

// Abre um link externo no navegador padrao do usuario (nao dentro do app).
// So https:// — o renderer roda com contextIsolation, mas validar aqui e
// barato e evita que qualquer valor inesperado chegue no shell.openExternal
// do SO. Necessario porque BrowserWindow, por padrao, BLOQUEIA
// target="_blank"/window.open() sem um setWindowOpenHandler configurado —
// sem isso, um <a target="_blank"> clicado simplesmente nao fazia nada.
ipcMain.handle('shell:open-external', (_evt, url) => {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return false;
  shell.openExternal(url);
  return true;
});

ipcMain.handle('library:get', () => library.getIndex());
ipcMain.handle('library:pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});
ipcMain.handle('library:scan', async (_evt, folder) => {
  const targetFolder = folder || library.getIndex().folder;
  if (!targetFolder) return library.getIndex();
  return library.scan(targetFolder, (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('library:scan-progress', progress);
  });
});
ipcMain.handle('library:clear', () => {
  library.clearFolder();
  return library.getIndex();
});

ipcMain.handle('update:check', async () => {
  try {
    return await checkForUpdate(packageJson.version);
  } catch (err) {
    return { configured: true, error: err.message };
  }
});
ipcMain.handle('settings:set-check-updates', (_evt, value) => {
  settings.set('checkUpdatesAutomatically', !!value);
  return settings.getAll();
});

ipcMain.on('player:set-video-rect', (_evt, rect) => {
  lastVideoRect = rect;
  updateEmbeddedVideoBounds();
});
