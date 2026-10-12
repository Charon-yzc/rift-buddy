const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('windowPeek',Object.freeze({bootstrap:()=>ipcRenderer.invoke('peek-control','bootstrap'),restore:()=>ipcRenderer.invoke('peek-control','restore'),onUpdate:handler=>{const listener=(_,value)=>handler(value);ipcRenderer.on('peek-update',listener);return()=>ipcRenderer.removeListener('peek-update',listener);}}));
