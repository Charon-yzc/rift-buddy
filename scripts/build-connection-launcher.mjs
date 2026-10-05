import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
export async function buildConnectionLauncher(directory){
 const compiler=path.join(process.env.SystemRoot||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 const executable=path.join(directory,'connection-launcher.exe');
 await fs.mkdir(directory,{recursive:true});
 await promisify(execFile)(compiler,['/nologo','/target:winexe','/platform:x64','/optimize+',`/out:${executable}`,path.resolve('electron/connection-launcher.cs')],{windowsHide:true});
 return executable;
}
