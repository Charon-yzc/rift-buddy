import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const asar=await import(pathToFileURL(require.resolve('@electron/asar',{paths:[await fs.realpath('node_modules/@electron/packager')]})));
const release=JSON.parse(await fs.readFile('release/latest.json','utf8'));
const file=path.join(release.directory,'resources/app.asar');
const entries=asar.listPackage(file).map(name=>name.replaceAll('\\','/').replace(/^\//,''));
const allowed=new Set(['electron','services','src','assets','data','package.json','THIRD_PARTY_NOTICES.md','使用说明.txt','组合库维护说明.txt']);
const unexpected=entries.filter(name=>!allowed.has(name.split('/')[0]));
if(unexpected.length)throw Error('Unexpected package contents: '+unexpected.join(', '));
const game=JSON.parse(asar.extractFile(file,'data/game.json'));
const builds=JSON.parse(asar.extractFile(file,'data/builds.json'));
const hex=JSON.parse(asar.extractFile(file,'data/hex-builds.json'));
const mismatch=[];
async function walk(folder){const found=[];for(const child of await fs.readdir(folder,{withFileTypes:true})){const name=path.join(folder,child.name);if(child.isDirectory())found.push(...await walk(name));else found.push(name);}return found;}
const expected=['package.json','THIRD_PARTY_NOTICES.md','使用说明.txt','组合库维护说明.txt',...(await Promise.all(['src','electron','services','data','assets'].map(walk))).flat()];
for(const name of expected){
 if(name==='package.json'){
  const {scripts,devDependencies,private:privateFlag,packageManager,...runtimePackage}=JSON.parse(await fs.readFile(name,'utf8'));
  if(JSON.stringify(JSON.parse(asar.extractFile(file,name)))!==JSON.stringify(runtimePackage))mismatch.push(name);
  continue;
 }
 if(!entries.includes(name.replaceAll('\\','/'))||!asar.extractFile(file,path.normalize(name)).equals(await fs.readFile(name)))mismatch.push(name);
}
const connectionRoot=path.join(release.directory,'resources/connection');
const helperFiles=['electron/client-helper-entry.mjs','data/game.json',...(await Promise.all(['services','src/core'].map(walk))).flat()];
const helperMismatch=[];
for(const name of helperFiles){const bundled=await fs.readFile(path.join(connectionRoot,name)).catch(()=>null);if(!bundled?.equals(await fs.readFile(name)))helperMismatch.push(name);}
const helperRuntime=await fs.readFile(path.join(connectionRoot,'node.exe')).catch(()=>null);
const helperSha256=helperRuntime&&crypto.createHash('sha256').update(helperRuntime).digest('hex');
if(helperSha256!==release.helperSha256||!helperRuntime?.equals(await fs.readFile(process.execPath)))helperMismatch.push('node.exe');
const helperLicense=await fs.readFile(path.join(connectionRoot,'node-LICENSE.txt')).catch(()=>null);
if(!helperLicense?.equals(await fs.readFile('assets/node-LICENSE.txt')))helperMismatch.push('node-LICENSE.txt');
const helperNotices=await fs.readFile(path.join(connectionRoot,'THIRD_PARTY_NOTICES.md')).catch(()=>null);
if(!helperNotices?.equals(await fs.readFile('THIRD_PARTY_NOTICES.md')))helperMismatch.push('THIRD_PARTY_NOTICES.md');
const launcher=await fs.readFile(path.join(connectionRoot,'connection-launcher.exe')).catch(()=>null);
if(!launcher||crypto.createHash('sha256').update(launcher).digest('hex')!==release.launcherSha256)helperMismatch.push('connection-launcher.exe');
const helperAllowlist=new Set([...helperFiles.map(n=>path.normalize(n)),'node.exe','node-LICENSE.txt','THIRD_PARTY_NOTICES.md','connection-launcher.exe']);
const helperUnexpected=(await walk(connectionRoot)).map(n=>path.relative(connectionRoot,n)).filter(n=>!helperAllowlist.has(n));
const observer=await fs.readFile(path.join(release.directory,'resources/window-observer.exe')).catch(()=>null);
if(!observer||crypto.createHash('sha256').update(observer).digest('hex')!==release.observerSha256||crypto.createHash('sha256').update(await fs.readFile('electron/window-observer.cs')).digest('hex')!==release.observerSourceSha256)helperMismatch.push('window-observer.exe');
console.log(JSON.stringify({executable:release.executable,archiveBytes:(await fs.stat(file)).size,archiveSha256:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'),entryCount:entries.length,champions:game.champions.length,riftBuilds:Object.keys(builds.entries).length,hexBuilds:Object.keys(hex.entries).length,sourceChangesSinceBuild:mismatch,helperChangesSinceBuild:helperMismatch,helperSha256,privateOrDevelopmentFiles:[...unexpected,...helperUnexpected]},null,2));
if(helperUnexpected.length||process.argv.includes('--verify-current')&&(mismatch.length||helperMismatch.length))process.exitCode=1;
