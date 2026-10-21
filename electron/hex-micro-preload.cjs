const {contextBridge,ipcRenderer}=require('electron');
const kind=process.argv.find(a=>a.startsWith('--rift-hex-window='))?.slice('--rift-hex-window='.length);
contextBridge.exposeInMainWorld('hexMicro',Object.freeze({
 bootstrap:()=>ipcRenderer.invoke('hex-micro-bootstrap',kind),
 control:action=>ipcRenderer.invoke('hex-micro-control',kind,action),
 hover:value=>ipcRenderer.invoke('hex-micro-hover',kind,value),
 onUpdate:handler=>{const listener=(_,value)=>handler(value);ipcRenderer.on('hex-micro-update',listener);return()=>ipcRenderer.removeListener('hex-micro-update',listener);},
 onPointer:handler=>{const listener=(_,value)=>handler(value);ipcRenderer.on('hex-micro-pointer',listener);return()=>ipcRenderer.removeListener('hex-micro-pointer',listener);},
}));
