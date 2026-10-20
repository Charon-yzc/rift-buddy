const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('postGame', Object.freeze({
  bootstrap: () => ipcRenderer.invoke('postgame-bootstrap'),
  close: () => ipcRenderer.invoke('postgame-close'),
  openHistory: (gameId) => ipcRenderer.invoke('postgame-open-history', gameId),
  onUpdate: (handler) => {
    const listener = (_, report) => handler(report);
    ipcRenderer.on('postgame-update', listener);
    return () => ipcRenderer.removeListener('postgame-update', listener);
  },
  onReset: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('postgame-reset', listener);
    return () => ipcRenderer.removeListener('postgame-reset', listener);
  },
  clear: () => ipcRenderer.invoke('postgame-reset')
}));
