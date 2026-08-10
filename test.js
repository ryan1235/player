
const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const p = new BrowserWindow({ show: false });
  const c = new BrowserWindow({ parent: p, show: false });
  p.close();
  console.log('parent closed');
});
app.on('window-all-closed', () => {
  console.log('all closed');
  app.quit();
});
