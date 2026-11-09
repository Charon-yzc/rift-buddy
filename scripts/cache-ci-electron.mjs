// CI setup only: the release web URL can return 504 while the official asset
// API works. Seed @electron/get's normal cache without bypassing its checksum.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';

assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');
const require=createRequire(import.meta.url),packageFile=require.resolve('electron/package.json'),electronRequire=createRequire(packageFile);
const version=require(packageFile).version,manifest=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url)));
assert.equal(version,manifest.devDependencies.electron);
const name=`electron-v${version}-win32-x64.zip`,expected=require(path.join(path.dirname(packageFile),'checksums.json'))[name];
assert.match(expected,/^[a-f0-9]{64}$/);
const {Cache}=await import(pathToFileURL(path.join(path.dirname(electronRequire.resolve('@electron/get')),'Cache.js')));
const cache=new Cache(process.env.electron_config_cache),url=`https://github.com/electron/electron/releases/download/v${version}/${name}`;
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const cached=cache.getPathForFileInCache(url,name);
if(cached&&hash(cached)===expected){console.log(`Verified cached Electron ${version}`);process.exit(0);}
const options={windowsHide:true,timeout:120000,encoding:'utf8',maxBuffer:4*1024*1024};
const release=JSON.parse(execFileSync('gh',['api',`repos/electron/electron/releases/tags/v${version}`],options));
const assets=release.assets.filter(asset=>asset.name===name);
assert.equal(assets.length,1);assert(Number.isSafeInteger(assets[0].id)&&assets[0].id>0);
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rift-ci-electron-'));let file;
// Retry only interrupted dependency transport. Integrity failures and tests fail immediately.
for(let attempt=0;attempt<2;attempt++){
 file=path.join(directory,attempt+'-'+name);const fd=fs.openSync(file,'wx');
 try{execFileSync('gh',['api',`repos/electron/electron/releases/assets/${assets[0].id}`,'-H','Accept: application/octet-stream'],{windowsHide:true,timeout:120000,stdio:['ignore',fd,'pipe']});break;}
 catch(error){if(attempt===1)throw error;await new Promise(resolve=>setTimeout(resolve,2000));}
 finally{fs.closeSync(fd);}
}
assert.equal(fs.statSync(file).size,assets[0].size);
assert.equal(hash(file),expected,'Official Electron asset differs from the locked npm package checksum');
await cache.putFileInCache(url,file,name);
console.log(`Verified official Electron ${version}: ${expected}`);
