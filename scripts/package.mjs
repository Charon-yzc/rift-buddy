import {packager} from '@electron/packager';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {buildConnectionLauncher} from './build-connection-launcher.mjs';
const root=path.resolve('.'),stamp=new Date().toISOString().replace(/[:.]/g,'-');
const manifest=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
if(process.platform!=='win32'||process.arch!=='x64'||!process.version.startsWith('v24.'))throw Error('请在 Windows x64 上使用 Node.js 24 打包，以提供兼容的连接进程');
const out=path.join(root,'release',`build-${stamp}`);
// Fail before building the large bundle if the Windows-native launcher cannot compile.
const nativeBuild=path.resolve('.local',`connection-launcher-${stamp}`);
const builtLauncher=await buildConnectionLauncher(nativeBuild);
process.env.ELECTRON_MIRROR||='https://npmmirror.com/mirrors/electron/';
const paths=await packager({
 dir:root,out,platform:'win32',arch:'x64',name:'开黑搭子',executableName:'开黑搭子',
 appVersion:manifest.version,buildVersion:manifest.version,electronVersion:'44.5.1',icon:path.join(root,'assets/icon.ico'),
 asar:true,prune:false,overwrite:false,download:{mirrorOptions:{mirror:process.env.ELECTRON_MIRROR}},
 ignore:[/^\/(?:README\.md|NOTICE\.md|docs)(?:\/|$)/,/^\/开黑搭子(?:\/|$)/,/^\/node_modules(?:\/|$)/,/^\/release(?:\/|$)/,/^\/\.local(?:\/|$)/,/^\/tests(?:\/|$)/,/^\/scripts(?:\/|$)/,/^\/test-results(?:\/|$)/,/^\/\.git(?:\/|$)/,/^\/AGENTS\.md$/,/^\/pnpm.*$/,/^\/\.gitignore$/],
 win32metadata:{CompanyName:'个人开黑工具',FileDescription:'开黑搭子 — 三人选人、出装符文与海克斯手册',ProductName:'开黑搭子',InternalName:'RiftBuddy',OriginalFilename:'开黑搭子.exe'},
 });
const directory=paths[0];
// Keep the signed, unmodified Node runtime separate from Electron's UI. The
// connection process still uses normal Windows consent and the same scoped IPC.
const helperRoot=path.join(directory,'resources/connection');
await fs.mkdir(helperRoot,{recursive:true});
await fs.copyFile(process.execPath,path.join(helperRoot,'node.exe'));
for(const folder of ['services','src/core'])await fs.cp(path.join(root,folder),path.join(helperRoot,folder),{recursive:true});
await fs.mkdir(path.join(helperRoot,'electron'),{recursive:true});
await fs.copyFile(path.join(root,'electron/client-helper-entry.mjs'),path.join(helperRoot,'electron/client-helper-entry.mjs'));
await fs.mkdir(path.join(helperRoot,'data'),{recursive:true});
await fs.copyFile(path.join(root,'data/game.json'),path.join(helperRoot,'data/game.json'));
await fs.copyFile(path.join(root,'assets/node-LICENSE.txt'),path.join(helperRoot,'node-LICENSE.txt'));
const launcher=path.join(helperRoot,'connection-launcher.exe');await fs.copyFile(builtLauncher,launcher);
await fs.copyFile(path.join(root,'使用说明.txt'),path.join(directory,'使用说明.txt'));
await fs.copyFile(path.join(root,'组合库维护说明.txt'),path.join(directory,'组合库维护说明.txt'));
const exe=path.join(directory,'开黑搭子.exe');
const digest=crypto.createHash('sha256').update(await fs.readFile(exe)).digest('hex');
const record={createdAt:new Date().toISOString(),directory,executable:exe,sha256:digest,archiveSha256:crypto.createHash('sha256').update(await fs.readFile(path.join(directory,'resources/app.asar'))).digest('hex'),helperRuntime:process.version,helperSha256:crypto.createHash('sha256').update(await fs.readFile(path.join(helperRoot,'node.exe'))).digest('hex'),launcherSha256:crypto.createHash('sha256').update(await fs.readFile(launcher)).digest('hex')};
await fs.writeFile(path.join(root,'release/latest.json'),JSON.stringify(record,null,2));
console.log(JSON.stringify(record,null,2));
