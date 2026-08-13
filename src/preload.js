const { contextBridge, ipcRenderer, clipboard, webFrame } = require('electron');

contextBridge.exposeInMainWorld('api', {
  pickFile: () => ipcRenderer.invoke('pick-file'),
  load: (target) => ipcRenderer.invoke('player:load', target),
  play: () => ipcRenderer.invoke('player:play'),
  pause: () => ipcRenderer.invoke('player:pause'),
  togglePlayPause: () => ipcRenderer.invoke('player:toggle-play'),
  seek: (secs) => ipcRenderer.invoke('player:seek', secs),
  setVolume: (vol) => ipcRenderer.invoke('player:volume', vol),
  stop: () => ipcRenderer.invoke('player:stop'),
  discoverDlna: () => ipcRenderer.invoke('dlna:discover'),
  browseDlna: (server, objectId) => ipcRenderer.invoke('dlna:browse', server, objectId),
  startRenderer: () => ipcRenderer.invoke('renderer:start'),
  stopRenderer: () => ipcRenderer.invoke('renderer:stop'),
  rendererStatus: () => ipcRenderer.invoke('renderer:status'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setAutoStart: (value) => ipcRenderer.invoke('settings:set-auto-start', value),
  setInterface: (name) => ipcRenderer.invoke('settings:set-interface', name),
  setVideoRect: (rect) => ipcRenderer.send('player:set-video-rect', rect),
  onNowPlaying: (cb) => ipcRenderer.on('player:now-playing', (_evt, info) => cb(info)),
  onCastActivity: (cb) => ipcRenderer.on('cast:activity', (_evt, info) => cb(info)),
  onCastSource: (cb) => ipcRenderer.on('cast:source', (_evt, info) => cb(info)),
  seekAbsolute: (secs) => ipcRenderer.invoke('player:seek-absolute', secs),
  toggleMute: () => ipcRenderer.invoke('player:toggle-mute'),
  toggleSubtitles: () => ipcRenderer.invoke('player:toggle-subtitles'),
  cycleSubtitleTrack: () => ipcRenderer.invoke('player:cycle-subtitle-track'),
  cycleAudioTrack: () => ipcRenderer.invoke('player:cycle-audio-track'),
  screenshot: () => ipcRenderer.invoke('player:screenshot'),
  playerSetVideoTrack: (trackId) => ipcRenderer.invoke('player:set-video-track', trackId),
  playerReturnToLiveEdge: () => ipcRenderer.invoke('player:return-to-live-edge'),
  getFitModes: () => ipcRenderer.invoke('player:get-fit-modes'),
  setFitMode: (id) => ipcRenderer.invoke('player:set-fit-mode', id),
  toggleFullscreen: () => ipcRenderer.invoke('player:toggle-fullscreen'),
  toggleLiveMode: () => ipcRenderer.invoke('player:toggle-live-mode'),
  onPlayerStatus: (cb) => ipcRenderer.on('player:status', (_evt, info) => cb(info)),
  onPlayerTracks: (cb) => ipcRenderer.on('player:tracks', (_evt, info) => cb(info)),
  onActivity: (cb) => ipcRenderer.on('player:activity', () => cb()),
  onFullscreenChanged: (cb) => ipcRenderer.on('player:fullscreen-changed', (_evt, v) => cb(v)),
  setAudioTrack: (id) => ipcRenderer.invoke('player:set-audio-track', id),
  setSubtitleTrack: (id) => ipcRenderer.invoke('player:set-subtitle-track', id),
  setSpeed: (value) => ipcRenderer.invoke('player:set-speed', value),
  getMediaInfo: () => ipcRenderer.invoke('player:get-media-info'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggle-always-on-top'),
  getAlwaysOnTop: () => ipcRenderer.invoke('window:get-always-on-top'),
  copyText: (text) => clipboard.writeText(text),
  // Somente leitura, usados pela tela "Sobre" em Configurações — nao chamam o main process.
  getAppVersion: () => require('../package.json').version,
  getElectronVersion: () => process.versions.electron,

  // Historico
  getHistory: () => ipcRenderer.invoke('history:list'),
  removeHistoryItem: (target) => ipcRenderer.invoke('history:remove', target),

  // Configurações adicionais
  setDiscoveryTimeout: (ms) => ipcRenderer.invoke('settings:set-discovery-timeout', ms),
  setDefaultVolume: (vol) => ipcRenderer.invoke('settings:set-default-volume', vol),
  setAutoPlayNext: (value) => ipcRenderer.invoke('settings:set-auto-play-next', value),
  setAutoReconnectCast: (value) => ipcRenderer.invoke('settings:set-auto-reconnect-cast', value),
  getLaunchOnBoot: () => ipcRenderer.invoke('settings:get-launch-on-boot'),
  setLaunchOnBoot: (value) => ipcRenderer.invoke('settings:set-launch-on-boot', value),
  onCastStatusChanged: (cb) => ipcRenderer.on('cast:status-changed', (_evt, info) => cb(info)),

  // Sistema de Live (Configuracoes > Ao Vivo)
  setLiveBufferProfile: (profile) => ipcRenderer.invoke('settings:set-live-buffer-profile', profile),
  setLiveCustomTarget: (secs) => ipcRenderer.invoke('settings:set-live-custom-target', secs),
  setShowLiveQualityLabel: (value) => ipcRenderer.invoke('settings:set-show-live-quality-label', value),
  onShowLiveQualityLabelChanged: (cb) => ipcRenderer.on('settings:show-live-quality-label-changed', (_evt, value) => cb(value)),
  setShowLiveEventToasts: (value) => ipcRenderer.invoke('settings:set-show-live-event-toasts', value),
  onShowLiveEventToastsChanged: (cb) => ipcRenderer.on('settings:show-live-event-toasts-changed', (_evt, value) => cb(value)),
  onLiveEvent: (cb) => ipcRenderer.on('player:live-event', (_evt, info) => cb(info)),

  // Escala da interface: so afeta a janela que chamar (renderer principal),
  // nao passa pelo main process nem mexe na janela do overlay do player.
  setUiScale: (factor) => webFrame.setZoomFactor(factor),
  getUiScale: () => webFrame.getZoomFactor(),

  // Logs (Configurações > Avançado)
  getLogs: () => ipcRenderer.invoke('logs:get'),
  getMpvInfo: () => ipcRenderer.invoke('system:get-mpv-info'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  // Biblioteca
  getLibrary: () => ipcRenderer.invoke('library:get'),
  pickLibraryFolder: () => ipcRenderer.invoke('library:pick-folder'),
  scanLibrary: (folder) => ipcRenderer.invoke('library:scan', folder),
  clearLibrary: () => ipcRenderer.invoke('library:clear'),
  onLibraryScanProgress: (cb) => ipcRenderer.on('library:scan-progress', (_evt, info) => cb(info)),

  // Atualizações
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  setCheckUpdatesAutomatically: (value) => ipcRenderer.invoke('settings:set-check-updates', value),
  onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (_evt, info) => cb(info)),
  onUpdateProgress: (cb) => ipcRenderer.on('update:progress', (_evt, info) => cb(info)),
  onUpdateReady: (cb) => ipcRenderer.on('update:ready', (_evt, info) => cb(info)),
  onUpdateError: (cb) => ipcRenderer.on('update:error', (_evt, info) => cb(info)),
  getVersionInfo: () => ipcRenderer.invoke('app:get-version-info'),
});
