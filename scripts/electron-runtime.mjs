import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

// Electron's package resolves (and, on first use, installs) its own executable.
// A fresh dependency installation need not already contain dist/electron.exe.
export function electronExecutable(){
 const executable=require('electron');
 if(typeof executable!=='string')throw Error('请使用 Node.js 运行桌面验收脚本');
 return executable;
}
