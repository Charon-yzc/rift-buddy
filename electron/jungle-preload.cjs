const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('jungleWidget',Object.freeze({bootstrap:()=>ipcRenderer.invoke('jungle-bootstrap'),control:action=>ipcRenderer.invoke('jungle-control',action),onUpdate:handler=>{const listener=(_,value)=>handler(value);ipcRenderer.on('jungle-update',listener);return()=>ipcRenderer.removeListener('jungle-update',listener);}}));
