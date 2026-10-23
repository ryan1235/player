const { app, BrowserWindow, ipcMain, dialog, Menu, screen, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const MPVPlayer = require('./mpv');
const dlna = require('./dlna');
const DlnaRenderer = require('./dlna-renderer');
const WatchHistory = require('./watch-history');
const Settings = require('./settings');
const Library = require('./library');
const { checkForUpdates, setMainWindow, quitAndInstall } = require('./auto-updater');
const { SubtitleService, isGarbageTitle } = require('./services/subtitle-service');
const { SkipDbService } = require('./services/skipdb-service');
const { PosterService } = require('./services/poster-service');
const logger = require('./services/logger');
const packageJson = require('../package.json');
let buildInfo;
try {
  buildInfo = require('./build-info.json');
} catch {
  buildInfo = { version: packageJson.version, commit: 'dev', commitShort: 'dev', buildDate: null };
}

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
let subtitleService;
let skipDbService;
let lastVideoRect = null;
let lastCursorPos = null;
let cursorPollTimer = null;
let appliedDefaultVolume = false;
let castSupervisorTimer = null;
let isPipMode = false;
let userAlwaysOnTop = false;
let normalBounds = null;
let lastThumbarPaused = null;
let thumbarIcons = null;

function initThumbarIcons() {
  if (thumbarIcons || process.platform !== 'win32') return;
  const iconsDir = path.join(__dirname, '../assets/icons');
  try {
    thumbarIcons = {
      back: nativeImage.createFromPath(path.join(iconsDir, 'thumbar-back.png')),
      play: nativeImage.createFromPath(path.join(iconsDir, 'thumbar-play.png')),
      pause: nativeImage.createFromPath(path.join(iconsDir, 'thumbar-pause.png')),
      fwd: nativeImage.createFromPath(path.join(iconsDir, 'thumbar-fwd.png')),
    };
  } catch {}
}

function updateThumbarButtons(isPaused) {
  if (!mainWindow || mainWindow.isDestroyed() || process.platform !== 'win32') return;
  initThumbarIcons();
  if (!thumbarIcons) return;
  if (lastThumbarPaused === isPaused) return;
  lastThumbarPaused = isPaused;
  try {
    mainWindow.setThumbarButtons([
      {
        tooltip: 'Voltar 10s (←)',
        icon: thumbarIcons.back,
        click: () => { if (player) player.seek(-10).catch(()=>{}); },
      },
      {
        tooltip: isPaused ? 'Reproduzir (Espaço)' : 'Pausar (Espaço)',
        icon: isPaused ? thumbarIcons.play : thumbarIcons.pause,
        click: () => { if (player) (isPaused ? player.play() : player.pause()).catch(()=>{}); },
      },
      {
        tooltip: 'Avançar 10s (→)',
        icon: thumbarIcons.fwd,
        click: () => { if (player) player.seek(10).catch(()=>{}); },
      },
    ]);
  } catch {}
}

function togglePip() {
  if (!mainWindow || mainWindow.isDestroyed()) return isPipMode;
  if (!isPipMode) {
    normalBounds = mainWindow.getBounds();
    isPipMode = true;
    const currentDisplay = screen.getDisplayMatching(normalBounds);
    const workArea = currentDisplay.workArea;
    const pipWidth = 420;
    const pipHeight = 236;
    const x = Math.round(workArea.x + workArea.width - pipWidth - 20);
    const y = Math.round(workArea.y + workArea.height - pipHeight - 20);
    mainWindow.setMinimumSize(320, 180);
    mainWindow.setBounds({ x, y, width: pipWidth, height: pipHeight });
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    if (controlsOverlay && !controlsOverlay.isDestroyed()) {
      controlsOverlay.setAlwaysOnTop(true, 'screen-saver');
    }
    broadcast('pip:changed', true);
  } else {
    isPipMode = false;
    mainWindow.setAlwaysOnTop(userAlwaysOnTop);
    if (controlsOverlay && !controlsOverlay.isDestroyed()) {
      controlsOverlay.setAlwaysOnTop(userAlwaysOnTop);
    }
    mainWindow.setMinimumSize(640, 480);
    if (normalBounds) {
      mainWindow.setBounds(normalBounds);
    }
    broadcast('pip:changed', false);
  }
  return isPipMode;
}

const watchHistory = new WatchHistory(path.join(app.getPath('userData'), 'watch-history.json'));
const settings = new Settings(path.join(app.getPath('userData'), 'settings.json'));
const library = new Library(path.join(app.getPath('userData'), 'library.json'), path.join(app.getPath('userData'), 'thumbnails'));
const posterService = new PosterService(path.join(app.getPath('userData'), 'posters'));

async function updateHistoryWithSeries(target, seriesInfo) {
  if (!target || !seriesInfo || !seriesInfo.title) return;
  const sTitle = String(seriesInfo.title).trim();
  if (isGarbageTitle(sTitle)) return;
  const season = Math.max(1, parseInt(seriesInfo.season, 10) || 1);
  const episode = Math.max(1, parseInt(seriesInfo.currentEpisode || seriesInfo.episode, 10) || 1);
  const displayTitle = `${sTitle} — T${season} Ep ${episode}`;

  let imdbId = seriesInfo.imdbId || null;
  let poster = seriesInfo.poster || null;

  try {
    const p = await posterService.resolveAndDownload(sTitle, imdbId);
    if (p) {
      if (p.imdbId && !imdbId) imdbId = p.imdbId;
      const local = posterService.getLocalPath(imdbId);
      if (local) {
        poster = 'file:///' + local.replace(/\\/g, '/');
      } else {
        poster = p.posterUrl || p.remoteUrl || poster;
      }
    }
  } catch (err) {
    logger.network('[history] erro ao resolver poster:', err.message);
  }

  if (!poster && imdbId) {
    poster = `https://images.metahub.space/poster/medium/${imdbId}/img`;
  }

  watchHistory.set(target, {
    title: displayTitle,
    seriesTitle: sTitle,
    season,
    episode,
    imdbId: imdbId || null,
    poster: poster || null,
  });

  broadcast('player:now-playing', {
    target,
    title: displayTitle,
    seriesTitle: sTitle,
    season,
    episode,
    poster,
  });
}

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
  const savedBounds = settings.get('windowBounds');
  const savedMaximized = settings.get('windowMaximized');

  const winOpts = {
    width: 1040,
    height: 720,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  if (savedBounds && typeof savedBounds.width === 'number' && typeof savedBounds.height === 'number') {
    try {
      const displays = screen.getAllDisplays();
      const isVisibleOnAnyDisplay = displays.some((d) => {
        const b = d.bounds;
        return (
          savedBounds.x >= b.x - 20 &&
          savedBounds.x < b.x + b.width - 50 &&
          savedBounds.y >= b.y - 20 &&
          savedBounds.y < b.y + b.height - 50
        );
      });
      if (isVisibleOnAnyDisplay) {
        winOpts.x = savedBounds.x;
        winOpts.y = savedBounds.y;
        winOpts.width = Math.max(760, savedBounds.width);
        winOpts.height = Math.max(520, savedBounds.height);
      }
    } catch {}
  }

  mainWindow = new BrowserWindow(winOpts);
  if (savedMaximized) {
    mainWindow.maximize();
  }
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('close', () => {
    try {
      const isMax = mainWindow.isMaximized();
      settings.set('windowMaximized', isMax);
      if (!isMax && !mainWindow.isFullScreen() && !isPipMode) {
        settings.set('windowBounds', mainWindow.getBounds());
      }
    } catch {}
  });

  // Janela transparente sobreposta a area de video, so com os controles (HTML).
  // type: 'toolbar' forca o estilo nativo WS_EX_TOOLWINDOW no Windows, impedindo que
  // essa janela de suporte apareca como um item fantasma/duplicado no switcher Alt+Tab.
  controlsOverlay = new BrowserWindow({
    parent: mainWindow,
    frame: false,
    show: false,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    thickFrame: false,
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
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!player || !player.currentTarget) {
      stopCursorActivityPoll();
      return;
    }
    const isFocused = mainWindow.isFocused() || (controlsOverlay && !controlsOverlay.isDestroyed() && controlsOverlay.isFocused());
    if (!isFocused) return;
    const pos = screen.getCursorScreenPoint();
    if (!lastCursorPos || pos.x !== lastCursorPos.x || pos.y !== lastCursorPos.y) {
      lastCursorPos = pos;
      broadcast('player:activity');
    }
  }, 300);
}

function stopCursorActivityPoll() {
  if (cursorPollTimer) {
    clearInterval(cursorPollTimer);
    cursorPollTimer = null;
  }
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
  mainWindow.show();
  mainWindow.focus();
});

Menu.setApplicationMenu(null);
app.whenReady().then(async () => {
  createWindows();
  setMainWindow(mainWindow);
  // startCursorActivityPoll() roda sob demanda quando ha reproducao ativa

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
    videoQualityProfile: settings.get('videoQualityProfile'),
    videoDeband: settings.get('videoDeband'),
    audioNightMode: settings.get('audioNightMode'),
    audioDelaySecs: settings.get('audioDelaySecs'),
    audioPreset: settings.get('audioPreset'),
  });

  const subtitleCacheDir = path.join(app.getPath('userData'), 'subtitles');
  subtitleService = new SubtitleService(settings, subtitleCacheDir, player);
  skipDbService = new SkipDbService(settings);

  player.on('load', ({ target }) => {
    let initialTitle = null;
    if (subtitleService && subtitleService.activeSeries) {
      const s = subtitleService.activeSeries;
      initialTitle = `${s.title} — T${s.season || 1} Ep ${s.currentEpisode || 1}`;
    }
    broadcast('player:now-playing', { target, title: initialTitle });

    // Volume padrao (Configuracoes > Reproducao) so se aplica no primeiro
    // arquivo carregado na sessao — depois disso o volume e "ao vivo",
    // ajustado pelo usuario, e nao deve ser sobrescrito a cada novo video.
    if (!appliedDefaultVolume) {
      appliedDefaultVolume = true;
      const vol = settings.get('defaultVolume');
      if (typeof vol === 'number') player.setVolume(vol).catch(() => {});
    }

    if (subtitleService) {
      subtitleService.handleMediaLoad(target).then((subResult) => {
        if (subResult) {
          if (subtitleService.activeSeries) {
            updateHistoryWithSeries(target, subtitleService.activeSeries).catch(() => {});
          }
          if (subResult.status === 'applied') {
            broadcast('subtitles:auto-applied', {
              series: subResult.series,
              cached: subResult.cached,
              provider: subResult.provider,
            });
          } else if (subResult.status === 'prompt') {
            broadcast('subtitles:next-episode-prompt', {
              series: subResult.series,
            });
          }

          if (subResult.advanced) {
            broadcast('dlna:episode-advanced', {
              series: subResult.series,
              appliedSubtitle: subResult.status === 'applied',
              cached: subResult.cached,
              provider: subResult.provider,
            });
          }
        }

        // Se há série ativa, busca os segmentos de abertura do SkipDB
        if (subtitleService.activeSeries && skipDbService) {
          const s = subtitleService.activeSeries;
          skipDbService.getSegments({
            imdbId: s.imdbId,
            title: s.title,
            season: s.season,
            episode: s.currentEpisode,
          }).then((segments) => {
            if (segments) broadcast('player:skip-segments', segments);
          }).catch(() => {});
        } else {
          // Se não há série ativa e o vídeo parece ser streaming DLNA / YouCine,
          // sugere identificação rápida caso haja séries no histórico recente!
          const rawName = path.basename(target || '');
          const isHashOrStream = isGarbageTitle(rawName) || /^https?:\/\//i.test(target);
          const recents = subtitleService.getRecentSeries();
          if (recents && recents.length > 0 && isHashOrStream) {
            const promptList = recents.map((s) => ({
              title: s.title,
              season: s.season,
              currentEpisode: s.episode,
              suggestedEpisode: s.episode + 1,
              imdbId: s.imdbId || null,
            }));
            broadcast('dlna:identify-prompt', { recentSeries: promptList });
          }
        }

        broadcast('subtitles:state-changed', subtitleService.getState());
      }).catch((err) => logger.network('[subtitle-service] erro ao processar load:', err.message));
    }
  });
  player.on('status', (info) => {
    broadcast('player:status', info);
    updateThumbarButtons(!!info.paused);
  });
  player.on('tracks', (info) => {
    broadcast('player:tracks', info);
  });
  player.on('live-event', (info) => {
    broadcast('player:live-event', info);
  });
  renderer = new DlnaRenderer(player, {
    friendlyName: settings.get('dlnaFriendlyName') || undefined,
  });
  renderer.on('activity', (info) => {
    broadcast('cast:activity', info);
  });
  renderer.on('source', (info) => {
    broadcast('cast:source', info);
  });
  renderer.on('crashed', (err) => {
    logger.network('[cast-supervisor] servidor do modo Receber caiu inesperadamente:', err.message);
    broadcast('cast:status-changed', renderer.getStatus());
  });

  // --- Aura Sync: Android informa série em reprodução → busca SkipDB ---
  // Guarda o último contexto recebido para usar quando a duração ficar disponível.
  let _auraSyncPendingContext = null;
  let _auraSyncSegmentsFetched = false; // evita re-busca para o mesmo ep

  async function fetchSkipSegmentsFromSync(ctx, duration) {
    if (!ctx || !skipDbService) return;
    try {
      const segments = await skipDbService.getSegments({
        imdbId: ctx.imdbId || null,
        title: ctx.title,
        season: ctx.season,
        episode: ctx.episode,
        duration: duration > 0 ? duration : null,
      });
      if (segments) {
        logger.network(`[aura-sync] segmentos SkipDB para ${ctx.title} S${ctx.season}E${ctx.episode}: intro=${!!segments.intro} outro=${!!segments.outro}`);
        broadcast('player:skip-segments', segments);
        _auraSyncSegmentsFetched = true;
      }
    } catch (err) {
      logger.network('[aura-sync] erro ao buscar SkipDB:', err.message);
    }
  }

  renderer.on('sync:now-playing', async (ctx) => {
    _auraSyncPendingContext = ctx;
    _auraSyncSegmentsFetched = false;

    // Tenta pegar a duração atual do MPV (pode já estar disponível se DLNA já carregou)
    let duration = 0;
    if (player) {
      try { duration = await player.getProperty('duration', 0); } catch {}
    }
    await fetchSkipSegmentsFromSync(ctx, duration);
  });

  // Quando o player reporta status, aproveitar a duration para re-buscar SkipDB
  // com o parâmetro correto (só na primeira vez após receber sync:now-playing)
  player.on('status', async (info) => {
    if (
      _auraSyncPendingContext &&
      !_auraSyncSegmentsFetched &&
      info.duration > 0 &&
      !info.isLive
    ) {
      await fetchSkipSegmentsFromSync(_auraSyncPendingContext, info.duration);
    }
  });


  mainWindow.on('enter-full-screen', () => {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    if (controlsOverlay && !controlsOverlay.isDestroyed()) {
      controlsOverlay.setAlwaysOnTop(true, 'screen-saver');
      controlsOverlay.moveTop();
    }
    broadcast('player:fullscreen-changed', true);
  });
  mainWindow.on('leave-full-screen', () => {
    const userAot = isPipMode || userAlwaysOnTop;
    mainWindow.setAlwaysOnTop(userAot, isPipMode ? 'screen-saver' : 'normal');
    if (controlsOverlay && !controlsOverlay.isDestroyed()) {
      controlsOverlay.setAlwaysOnTop(userAot, isPipMode ? 'screen-saver' : 'normal');
    }
    broadcast('player:fullscreen-changed', false);
  });

  if (settings.get('autoStartRenderer')) {
    try {
      await renderer.start(settings.get('preferredInterface'));
    } catch (err) {
      console.error('Falha ao iniciar recepcao automaticamente:', err.message);
    }
  }

  startCastSupervisor();

  if (settings.get('checkUpdatesAutomatically')) {
    checkForUpdates().catch((err) => logger.network('[auto-updater] falha na checagem automatica:', err.message));
  }
  startUpdateSupervisor();
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
    // status.crashed so fica true quando o servidor HTTP caiu sozinho depois
    // de ter iniciado (ver DlnaRenderer._crashed) — nesse caso reinicia
    // mesmo com active=false, diferente do caso "usuario desligou", que o
    // early-return abaixo continua respeitando.
    if (!status.active && !status.crashed) return;
    if (status.active) {
      const stillValid = status.interfaces.some((i) => i.name === status.interfaceName && i.address === status.ip);
      if (stillValid) return;
      logger.network('[cast-supervisor] interface/IP mudou, reiniciando recepcao...');
    } else {
      logger.network('[cast-supervisor] servidor caiu, tentando reiniciar recepcao...');
    }
    try {
      await renderer.stop();
      const next = await renderer.start(settings.get('preferredInterface'));
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('cast:status-changed', next);
    } catch (err) {
      logger.error('[cast-supervisor] falha ao reiniciar recepcao:', err.message);
    }
  }, 15000);
}

// A checagem automatica de update ate aqui so rodava uma vez, no boot — o
// app e feito pra ficar rodando por dias como alvo fixo de cast (e por isso
// existe o cast-supervisor acima), entao uma sessao longa nunca saberia de
// versao nova sem reiniciar o app manualmente. Reconfere periodicamente
// enquanto a checagem automatica estiver ligada nas configuracoes.
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
let updateCheckTimer = null;
function startUpdateSupervisor() {
  if (updateCheckTimer) return;
  updateCheckTimer = setInterval(() => {
    if (!settings.get('checkUpdatesAutomatically')) return;
    checkForUpdates().catch((err) => logger.network('[auto-updater] falha na checagem periodica:', err.message));
  }, UPDATE_CHECK_INTERVAL_MS);
}

app.on('window-all-closed', () => {
  player.quit();
  renderer.stop().catch(() => {});
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopCursorActivityPoll();
  if (castSupervisorTimer) clearInterval(castSupervisorTimer);
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  if (watchHistory && typeof watchHistory.flushSync === 'function') {
    watchHistory.flushSync();
  }
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
  startCursorActivityPoll();
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
ipcMain.handle('player:adjust-volume', (_evt, delta) => (player ? player.adjustVolume(delta) : Promise.resolve()));
ipcMain.handle('updater:quit-and-install', () => quitAndInstall());
ipcMain.handle('player:stop', () => {
  stopCursorActivityPoll();
  return player.stop();
});
ipcMain.handle('player:seek-absolute', (_evt, secs) => player.seekAbsolute(secs));
ipcMain.handle('player:toggle-mute', () => player.toggleMute());
ipcMain.handle('player:toggle-subtitles', () => player.toggleSubtitles());
ipcMain.handle('player:cycle-subtitle-track', () => player.cycleSubtitleTrack());
ipcMain.handle('player:add-subtitle-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Legendas', extensions: ['srt', 'vtt', 'ass', 'ssa', 'sub'] }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  if (player) {
    await player.command(['sub-add', filePath, 'select']).catch(() => {});
    await player._extractTracks().catch(() => {});
  }
  return filePath;
});

ipcMain.handle('subtitles:search-catalog', async (_evt, query) => {
  if (!subtitleService) return [];
  return subtitleService.searchCatalog(query);
});
ipcMain.handle('subtitles:catalog-details', async (_evt, params) => {
  if (!subtitleService) return null;
  const { id, type } = params || {};
  return subtitleService.getCatalogDetails(id, type);
});
ipcMain.handle('subtitles:search', async (_evt, params) => {
  if (!subtitleService) return [];
  return subtitleService.searchSubtitles(params || {});
});
ipcMain.handle('subtitles:download-and-apply', async (_evt, params) => {
  if (!subtitleService) throw new Error('Serviço de legendas não inicializado');
  const savedPath = await subtitleService.downloadAndSave(params);
  if (player) {
    await player.command(['sub-add', savedPath, 'select']).catch(() => {});
    await player._extractTracks().catch(() => {});
  }
  broadcast('subtitles:state-changed', subtitleService.getState());
  return { path: savedPath };
});
ipcMain.handle('subtitles:bind-series', (_evt, { title, season, episode, imdbId }) => {
  if (!subtitleService) return null;
  const bound = subtitleService.bindSeries(title, season, episode, imdbId);
  broadcast('subtitles:state-changed', subtitleService.getState());

  if (bound && player && player.currentTarget) {
    updateHistoryWithSeries(player.currentTarget, bound).catch(() => {});
  }

  if (skipDbService) {
    skipDbService.getSegments({
      imdbId,
      title,
      season,
      episode,
    }).then((segments) => {
      if (segments) broadcast('player:skip-segments', segments);
    }).catch(() => {});
  }

  return bound;
});
ipcMain.handle('subtitles:bind-and-apply', async (_evt, { title, season, episode, imdbId }) => {
  if (!subtitleService) return null;
  const bound = subtitleService.bindSeries(title, season, episode, imdbId);
  broadcast('subtitles:state-changed', subtitleService.getState());

  if (bound && player && player.currentTarget) {
    updateHistoryWithSeries(player.currentTarget, bound).catch(() => {});
  }

  if (skipDbService) {
    skipDbService.getSegments({
      imdbId,
      title,
      season,
      episode,
    }).then((segments) => {
      if (segments) broadcast('player:skip-segments', segments);
    }).catch(() => {});
  }

  let subResult = null;
  try {
    const fetched = await subtitleService.autoFetchForEpisode(title, season, episode, imdbId);
    if (fetched && fetched.path && player) {
      await player.command(['sub-add', fetched.path, 'select']).catch(() => {});
      await player._extractTracks().catch(() => {});
      subResult = {
        applied: true,
        cached: fetched.cached,
        provider: fetched.provider,
        path: fetched.path,
      };
      broadcast('subtitles:auto-applied', {
        series: bound,
        cached: fetched.cached,
        provider: fetched.provider,
      });
    }
  } catch (err) {
    logger.network('[subtitle-service] erro ao aplicar em bind-and-apply:', err.message);
  }

  return { bound, subResult };
});
ipcMain.handle('skip:get-segments', (_evt, params) => {
  if (!skipDbService) return null;
  return skipDbService.getSegments(params);
});
ipcMain.handle('subtitles:unbind-series', () => {
  if (subtitleService) subtitleService.unbindSeries();
  if (subtitleService) broadcast('subtitles:state-changed', subtitleService.getState());
  return true;
});
ipcMain.handle('subtitles:not-this-series', async () => {
  if (subtitleService) subtitleService.unbindSeries();
  if (player) {
    await player.setProperty('sid', 'no').catch(() => {});
    await player.command(['sub-remove']).catch(() => {});
    await player._extractTracks().catch(() => {});
    if (player.currentTarget) {
      const rawName = path.basename(player.currentTarget || '');
      const genericTitle = isGarbageTitle(rawName) || /^https?:\/\//i.test(player.currentTarget)
        ? 'Transmissão YouCine (DLNA)'
        : rawName;

      watchHistory.removeSeriesMetadata(player.currentTarget, genericTitle);

      broadcast('player:now-playing', {
        target: player.currentTarget,
        title: genericTitle,
        poster: null,
      });
    }
  }
  broadcast('player:skip-segments', null);
  if (subtitleService) broadcast('subtitles:state-changed', subtitleService.getState());
  return true;
});
ipcMain.handle('subtitles:get-state', () => {
  return subtitleService ? subtitleService.getState() : null;
});
ipcMain.handle('subtitles:clear-cache', () => {
  return subtitleService ? subtitleService.clearCache() : false;
});
ipcMain.handle('subtitles:save-config', (_evt, config) => {
  if (!config) return null;
  if (config.subdlApiKey !== undefined) settings.set('subdlApiKey', String(config.subdlApiKey).trim());
  if (config.openSubtitlesApiKey !== undefined) settings.set('openSubtitlesApiKey', String(config.openSubtitlesApiKey).trim());
  if (config.subtitlesLanguage !== undefined) settings.set('subtitlesLanguage', config.subtitlesLanguage);
  if (config.subtitlesAutoDownloadNext !== undefined) settings.set('subtitlesAutoDownloadNext', !!config.subtitlesAutoDownloadNext);
  if (config.subtitlesMode !== undefined) settings.set('subtitlesMode', String(config.subtitlesMode));
  if (config.skipIntroAuto !== undefined) settings.set('skipIntroAuto', !!config.skipIntroAuto);
  if (config.skipIntroEnabled !== undefined) settings.set('skipIntroEnabled', !!config.skipIntroEnabled);
  broadcast('settings:skip-intro-changed', {
    skipIntroAuto: settings.get('skipIntroAuto'),
    skipIntroEnabled: settings.get('skipIntroEnabled'),
  });
  if (subtitleService) broadcast('subtitles:state-changed', subtitleService.getState());
  return subtitleService ? subtitleService.getState() : null;
});

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
  if (next) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    if (controlsOverlay && !controlsOverlay.isDestroyed()) {
      controlsOverlay.setAlwaysOnTop(true, 'screen-saver');
      controlsOverlay.moveTop();
    }
    mainWindow.setFullScreen(true);
  } else {
    mainWindow.setFullScreen(false);
    const userAot = isPipMode || userAlwaysOnTop;
    mainWindow.setAlwaysOnTop(userAot, isPipMode ? 'screen-saver' : 'normal');
    if (controlsOverlay && !controlsOverlay.isDestroyed()) {
      controlsOverlay.setAlwaysOnTop(userAot, isPipMode ? 'screen-saver' : 'normal');
    }
  }
  return next;
});

ipcMain.handle('player:set-audio-track', (_evt, id) => player.setAudioTrack(id));
ipcMain.handle('player:set-subtitle-track', (_evt, id) => player.setSubtitleTrack(id));
ipcMain.handle('player:set-speed', (_evt, value) => player.setSpeed(value));
ipcMain.handle('player:get-media-info', () => player.getMediaInfo());

ipcMain.handle('player:toggle-pip', () => togglePip());
ipcMain.handle('player:get-pip', () => isPipMode);

ipcMain.handle('player:set-brightness', async (_evt, val) => {
  if (!player) return 0;
  return player.setBrightness(val);
});
ipcMain.handle('player:get-brightness', () => (player ? player.brightness : 0));

ipcMain.handle('player:set-contrast', async (_evt, val) => {
  if (!player) return 0;
  return player.setContrast(val);
});
ipcMain.handle('player:get-contrast', () => (player ? player.contrast : 0));

ipcMain.handle('player:set-night-mode', async (_evt, enabled) => {
  settings.set('audioNightMode', !!enabled);
  if (player) await player.setNightMode(!!enabled);
  broadcast('player:night-mode-changed', !!enabled);
  return !!enabled;
});
ipcMain.handle('player:get-night-mode', () => (player ? player.audioNightMode : settings.get('audioNightMode')));

ipcMain.handle('player:set-audio-delay', async (_evt, secs) => {
  const num = Number(secs) || 0;
  settings.set('audioDelaySecs', num);
  if (player) await player.setAudioDelay(num);
  broadcast('player:audio-delay-changed', num);
  return num;
});
ipcMain.handle('player:get-audio-delay', () => (player ? player.audioDelaySecs : settings.get('audioDelaySecs')));

ipcMain.handle('player:set-audio-preset', async (_evt, presetId) => {
  settings.set('audioPreset', presetId);
  if (player) await player.setAudioPreset(presetId);
  broadcast('player:audio-preset-changed', presetId);
  return presetId;
});
ipcMain.handle('player:get-audio-preset', () => (player ? player.audioPreset : settings.get('audioPreset')));

ipcMain.handle('window:toggle-always-on-top', () => {
  userAlwaysOnTop = !userAlwaysOnTop;
  if (!mainWindow.isFullScreen() && !isPipMode) {
    mainWindow.setAlwaysOnTop(userAlwaysOnTop);
    if (controlsOverlay && !controlsOverlay.isDestroyed()) {
      controlsOverlay.setAlwaysOnTop(userAlwaysOnTop);
    }
  }
  return userAlwaysOnTop;
});
ipcMain.handle('window:get-always-on-top', () => userAlwaysOnTop);

ipcMain.handle('overlay:focus', () => {
  if (controlsOverlay && !controlsOverlay.isDestroyed()) {
    controlsOverlay.focus();
    return true;
  }
  return false;
});

ipcMain.handle('main-window:focus', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return true;
  }
  return false;
});

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
ipcMain.handle('settings:set-dlna-friendly-name', async (_evt, name) => {
  const cleanName = typeof name === 'string' ? name.trim() : '';
  settings.set('dlnaFriendlyName', cleanName);
  renderer.setFriendlyName(cleanName);
  if (renderer.getStatus().active) {
    await renderer.stop();
    await renderer.start(settings.get('preferredInterface'));
  }
  broadcast('cast:status-changed', renderer.getStatus());
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

const VIDEO_QUALITY_PROFILE_IDS = ['high', 'ultra', 'performance'];
ipcMain.handle('settings:set-video-quality-profile', async (_evt, profile) => {
  const value = VIDEO_QUALITY_PROFILE_IDS.includes(profile) ? profile : 'high';
  settings.set('videoQualityProfile', value);
  await player.setVideoQualityProfile(value);
  return settings.getAll();
});
ipcMain.handle('settings:set-video-deband', async (_evt, enabled) => {
  settings.set('videoDeband', !!enabled);
  await player.setVideoDeband(!!enabled);
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

  for (const entry of entries) {
    if (entry.imdbId) {
      const local = posterService.getLocalPath(entry.imdbId);
      if (local) {
        entry.poster = 'file:///' + local.replace(/\\/g, '/');
      } else if (!entry.poster) {
        entry.poster = `https://images.metahub.space/poster/medium/${entry.imdbId}/img`;
      }
    } else if (entry.seriesTitle && !entry.poster) {
      posterService.resolveAndDownload(entry.seriesTitle).then((p) => {
        if (p && (p.imdbId || p.posterUrl)) {
          watchHistory.set(entry.target, { imdbId: p.imdbId, poster: p.posterUrl });
        }
      }).catch(() => {});
    }
  }

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

ipcMain.handle('update:check', () => checkForUpdates());
ipcMain.handle('settings:set-check-updates', (_evt, value) => {
  settings.set('checkUpdatesAutomatically', !!value);
  return settings.getAll();
});
ipcMain.handle('app:get-version-info', () => buildInfo);

ipcMain.on('player:set-video-rect', (_evt, rect) => {
  lastVideoRect = rect;
  updateEmbeddedVideoBounds();
});
