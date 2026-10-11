const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('skillWidget',Object.freeze({bootstrap:()=>ipcRenderer.invoke('skill-bootstrap'),control:action=>ipcRenderer.invoke('skill-control',action),onUpdate:handler=>{const listener=(_,value)=>handler(value);ipcRenderer.on('skill-update',listener);return()=>ipcRenderer.removeListener('skill-update',listener);}}));
