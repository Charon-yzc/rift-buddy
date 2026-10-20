const path = require('node:path');
const {pathToFileURL} = require('node:url');

module.exports = function createPostgameWindow({root, onOpenHistory, diagnostic = () => {}, electron = require('electron')}) {
  const {BrowserWindow, ipcMain, screen} = electron;
  let win = null;
  let currentReport = null;

  function calculateBounds() {
    const primary = screen.getPrimaryDisplay();
    const area = primary.workArea;
    const width = Math.min(760, area.width);
    const height = Math.min(540, area.height);
    const x = Math.round(area.x + (area.width - width) / 2);
    const y = Math.round(area.y + (area.height - height) / 2);
    return {x, y, width, height};
  }

  function create() {
    const bounds = calculateBounds();
    win = new BrowserWindow({
      ...bounds,
      frame: false,
      show: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: true,
      resizable: false,
      transparent: true,
      backgroundColor: '#00000000',
      title: '开黑搭子 · 赛后结算与评分',
      icon: path.join(root, 'assets/icon.png'),
      webPreferences: {
        preload: path.join(root, 'electron/postgame-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    win.setAlwaysOnTop(true, 'screen-saver');
    win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    win.webContents.on('will-navigate', (event, url) => {
      if (url !== pathToFileURL(path.join(root, 'src/postgame.html')).href) event.preventDefault();
    });

    win.once('ready-to-show', () => {
      if (currentReport) {
        win.show();
        publish();
      }
    });

    win.on('closed', () => {
      win = null;
    });

    win.loadFile(path.join(root, 'src/postgame.html'));
  }

  function publish() {
    if (!win || win.isDestroyed()) return;
    win.webContents.send('postgame-update', currentReport);
  }

  function show(report) {
    currentReport = report;
    if (!win || win.isDestroyed()) {
      create();
    } else {
      const bounds = calculateBounds();
      win.setBounds(bounds);
      win.show();
      publish();
    }
  }

  function hide() {
    if (win && !win.isDestroyed()) {
      win.hide();
    }
  }

  function guard(name, handler) {
    ipcMain.handle(name, (event, ...args) => {
      if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) {
        throw Error('不允许此操作');
      }
      return handler(...args);
    });
  }

  guard('postgame-bootstrap', () => currentReport);
  guard('postgame-close', () => {
    hide();
    return true;
  });
  guard('postgame-open-history', (gameId) => {
    hide();
    if (onOpenHistory) onOpenHistory(gameId);
    return true;
  });

  return {
    show,
    hide,
    isVisible: () => !!win && !win.isDestroyed() && win.isVisible(),
    destroy: () => {
      if (win && !win.isDestroyed()) win.destroy();
      win = null;
      for (const name of ['postgame-bootstrap', 'postgame-close', 'postgame-open-history']) {
        ipcMain.removeHandler(name);
      }
    }
  };
};
