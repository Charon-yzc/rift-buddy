const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('guide',Object.freeze({
 bootstrap:()=>ipcRenderer.invoke('guide-bootstrap'),
 control:(action,value)=>ipcRenderer.invoke('guide-control',action,value),
 hover:value=>ipcRenderer.invoke('guide-hover',value),
 onUpdate:handler=>{const listener=(_,model)=>handler(model);ipcRenderer.on('guide-update',listener);return()=>ipcRenderer.removeListener('guide-update',listener);},
}));
