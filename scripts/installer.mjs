import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {installerScript} from './installer-script.mjs';
const root=path.resolve('.'),manifest=JSON.parse(await fs.readFile('package.json','utf8')),release=JSON.parse(await fs.readFile('release/latest.json','utf8'));
const directory=path.resolve(release.directory),output=path.resolve('release',`installer-${new Date().toISOString().replace(/[:.]/g,'-')}`,`RiftBuddy-${manifest.version}-Setup.exe`);
if(!directory.startsWith(path.join(root,'release')+path.sep))throw Error('只为当前工作区已验证的打包目录生成安装程序');
const archive=path.join(directory,'resources/app.asar');
if(crypto.createHash('sha256').update(await fs.readFile(archive)).digest('hex')!==release.archiveSha256)throw Error('打包内容已变化，请重新验证和打包');
if(await fs.stat(output).then(()=>true).catch(()=>false))throw Error('同版本安装程序已存在，请保留原文件并使用新版本号');
async function walk(dir){const rows=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('安装文件不能是符号链接');if(entry.isDirectory())rows.push(...await walk(file));else rows.push(path.relative(directory,file));}return rows;}
const files=(await walk(directory)).sort(),script=path.resolve('.local',`installer-${manifest.version}.nsi`);
await fs.mkdir(path.dirname(script),{recursive:true});await fs.writeFile(script,installerScript({version:manifest.version,directory,output,files,icon:path.join(root,'assets/icon.ico')}),'utf8');
const compiler=process.env.RIFT_BUDDY_MAKENSIS||'makensis.exe';
await fs.mkdir(path.dirname(output),{recursive:true});
await new Promise((resolve,reject)=>{const child=spawn(compiler,['/NOCONFIG','/INPUTCHARSET','UTF8',script],{stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`安装程序生成失败：${code}`)));});
const bytes=await fs.readFile(output),record={version:manifest.version,output,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),archiveSha256:release.archiveSha256,fileCount:files.length,script};
await fs.writeFile('release/installer-latest.json',JSON.stringify(record,null,2));console.log(JSON.stringify(record,null,2));
