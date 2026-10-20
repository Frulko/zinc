// The bench app (ZN-713), Electron version: one window on index.html.
const { app, BrowserWindow } = require('electron');

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 900, height: 600, title: 'Bench List' });
  win.loadFile('index.html');
  // Two animation frames after the load: the first frame was presented (the Zinc version prints at its second tick).
  win.webContents.once('did-finish-load', () =>
    win.webContents.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))')
      .then(() => console.log('first-frame')));
});
app.on('window-all-closed', () => app.quit());
