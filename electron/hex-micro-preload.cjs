const {contextBridge,ipcRenderer}=require('electron');
const kind=process.argv.find(a=>a.startsWith('--rift-hex-window='))?.slice('--rift-hex-window='.length);
contextBridge.exposeInMainWorld('hexMicro',Object.freeze({
 bootstrap:()=>ipcRenderer.invoke('hex-micro-bootstrap',kind),
 control:(action,value)=>ipcRenderer.invoke('hex-micro-control',kind,action,value),
 regions:value=>ipcRenderer.invoke('hex-micro-regions',kind,value),
 hover:value=>ipcRenderer.invoke('hex-micro-hover',kind,value),
 onUpdate:handler=>{const listener=(_,value)=>handler(value);ipcRenderer.on('hex-micro-update',listener);return()=>ipcRenderer.removeListener('hex-micro-update',listener);},
 onMeasure:handler=>{const listener=()=>handler();ipcRenderer.on('hex-micro-measure',listener);return()=>ipcRenderer.removeListener('hex-micro-measure',listener);},
 onPointer:handler=>{const listener=(_,value)=>handler(value);ipcRenderer.on('hex-micro-pointer',listener);return()=>ipcRenderer.removeListener('hex-micro-pointer',listener);},
}));
