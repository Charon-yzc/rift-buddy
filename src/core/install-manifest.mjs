export const INSTALL_MANIFEST='rift-buddy-install.json';
const version=value=>/^\d+\.\d+\.\d+$/.test(value);
export function payloadPath(value){
 if(typeof value!=='string'||!value||value.length>500||/[\x00-\x1f:*?"<>|]/.test(value)||value.includes('\\')||value.startsWith('/')||value.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p)))throw Error('安装清单路径不合法');
 return value;
}
export function validateInstallManifest(value){
 if(value?.schema!==1||value.appId!=='rift-buddy'||!version(value.version)||!Array.isArray(value.files)||!value.files.length||value.files.length>20000)throw Error('安装清单格式不正确');
 const seen=new Set();
 for(const row of value.files){const name=payloadPath(row?.name),key=name.toLowerCase();if(seen.has(key)||key===INSTALL_MANIFEST||!Number.isSafeInteger(row.bytes)||row.bytes<0||row.bytes>1024*1024*1024||!/^[a-f0-9]{64}$/.test(row.sha256))throw Error('安装清单文件不正确');seen.add(key);}
 return value;
}
export const installManifestText=value=>JSON.stringify(validateInstallManifest(value),null,2)+'\n';
