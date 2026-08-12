// Auto-update de verdade via electron-updater: fala com a mesma GitHub
// Release publicada pelo .github/workflows/release.yml (le dist/latest.yml,
// gerado pelo electron-builder a partir de build.publish no package.json),
// baixa o instalador em background e instala sozinho na proxima vez que o
// app fechar — sem exigir nenhum clique do usuario (substitui
// src/update-checker.js, que so verificava e linkava pro GitHub).
const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const logger = require('./services/logger');

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindowRef = null;

function send(channel, payload) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, payload);
  }
}

autoUpdater.on('update-available', (info) => {
  logger.network('[auto-updater] atualizacao disponivel:', info.version);
  send('update:available', {
    configured: true,
    currentVersion: app.getVersion(),
    latestVersion: info.version,
    updateAvailable: true,
  });
});

autoUpdater.on('update-not-available', () => {
  logger.network('[auto-updater] ja esta na versao mais recente');
});

autoUpdater.on('download-progress', (progress) => {
  send('update:progress', { percent: progress.percent });
});

autoUpdater.on('update-downloaded', (info) => {
  logger.network('[auto-updater] atualizacao baixada, sera instalada ao reiniciar:', info.version);
  send('update:ready', { latestVersion: info.version });
});

autoUpdater.on('error', (err) => {
  logger.network('[auto-updater] falha na checagem/download:', err.message);
});

function setMainWindow(win) {
  mainWindowRef = win;
}

// electron-updater so funciona em build empacotado (le resources/app-update.yml,
// que so existe depois do electron-builder gerar o instalador) — em "npm start"
// (electron .) nao ha nada real pra checar, entao nem tenta.
async function checkForUpdates() {
  if (!app.isPackaged) {
    logger.network('[auto-updater] checagem ignorada (app nao empacotado / modo dev)');
    return { configured: false };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    const latestVersion = result?.updateInfo?.version;
    return {
      configured: true,
      currentVersion: app.getVersion(),
      latestVersion,
      updateAvailable: !!latestVersion && latestVersion !== app.getVersion(),
    };
  } catch (err) {
    return { configured: true, error: err.message };
  }
}

module.exports = { checkForUpdates, setMainWindow };
