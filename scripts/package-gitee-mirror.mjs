import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {MIRROR_PART_BYTES,setupFileName,mirrorPartName,mirrorManifestName,parseMirrorManifest,giteeReleaseUrl,releasePageUrl} from '../src/core/app-update.mjs';

const digest=data=>crypto.createHash('sha256').update(data).digest('hex');
export function mergeCommand(manifest){
 // All interpolated values are constrained filenames, integers and hashes.
 const m=parseMirrorManifest(JSON.stringify(manifest),manifest);
 const parts=m.parts.map(p=>`@{Name='${p.name}';Hash='${p.sha256}';Bytes=${p.bytes}}`).join(',');
 const command=`$ErrorActionPreference='Stop'; function Digest($file) { $stream=[IO.File]::OpenRead($file); try { $sha=[Security.Cryptography.SHA256]::Create(); try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() } } finally { $stream.Dispose() } }; try { $root=$env:RIFTBUDDY_DOWNLOAD_DIR; $out=Join-Path $root '${m.file}'; $expected='${m.sha256}'; if (Test-Path -LiteralPath $out) { if ((Digest $out) -eq $expected) { Write-Host 'Installer already exists and SHA-256 is correct.'; exit 0 }; throw 'An existing installer has a different checksum. Move it elsewhere before retrying.' }; $parts=@(${parts}); foreach ($part in $parts) { $file=Join-Path $root $part.Name; if (!(Test-Path -LiteralPath $file)) { throw ('Missing download: '+$part.Name) }; if ((Get-Item -LiteralPath $file).Length -ne $part.Bytes -or (Digest $file) -ne $part.Hash) { throw ('Download checksum mismatch: '+$part.Name) } }; $temp=$out+'.'+[Guid]::NewGuid().ToString('N')+'.partial'; $dest=[IO.File]::Open($temp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write); try { foreach ($part in $parts) { $inputStream=[IO.File]::OpenRead((Join-Path $root $part.Name)); try { $inputStream.CopyTo($dest) } finally { $inputStream.Dispose() } } } finally { $dest.Dispose() }; if ((Digest $temp) -ne $expected) { throw 'Installer checksum mismatch. Do not run it.' }; [IO.File]::Move($temp,$out); Write-Host 'SHA-256 verified. Double-click ${m.file} to install.' } catch { Write-Host $_.Exception.Message; exit 1 }`;
 return `@echo off\r\nsetlocal\r\nset "RIFTBUDDY_DOWNLOAD_DIR=%~dp0"\r\npowershell.exe -NoLogo -NoProfile -Command "${command}"\r\nif errorlevel 1 (\r\n  echo Merge failed. Check the message above.\r\n  pause\r\n  exit /b 1\r\n)\r\npause\r\nexit /b 0\r\n`;
}

export async function packageGiteeMirror({installer,outputDir,partBytes=MIRROR_PART_BYTES}){
 if(!/^\d+\.\d+\.\d+$/.test(installer?.version)||!/^([0-9a-f]{64})$/.test(installer.sha256)||!Number.isSafeInteger(installer.bytes)||installer.bytes<=0||installer.bytes>512*1024*1024)throw Error('安装包记录格式不正确');
 if(!Number.isSafeInteger(partBytes)||partBytes<=0||partBytes>MIRROR_PART_BYTES||Math.ceil(installer.bytes/partBytes)>16)throw Error('分卷大小不正确');
 const source=await fs.open(installer.output,'r');
 try{
  if((await source.stat()).size!==installer.bytes)throw Error('安装包大小与记录不一致');
  const hash=crypto.createHash('sha256');for await(const chunk of source.createReadStream({autoClose:false}))hash.update(chunk);
  if(hash.digest('hex')!==installer.sha256)throw Error('安装包 SHA-256 与记录不一致');
  // A stable per-version directory prevents accidental replacement on reruns.
  await fs.mkdir(outputDir,{recursive:false});
  const version=installer.version,tag=`v${version}`,parts=[],splitHash=crypto.createHash('sha256');
  for(let offset=0,index=0;offset<installer.bytes;index++){
   const bytes=Math.min(partBytes,installer.bytes-offset),buffer=Buffer.alloc(bytes);let read=0;
   while(read<bytes){const result=await source.read(buffer,read,bytes-read,offset+read);if(!result.bytesRead)throw Error('安装包读取中断');read+=result.bytesRead;}
   const name=mirrorPartName(version,index);splitHash.update(buffer);await fs.writeFile(path.join(outputDir,name),buffer,{flag:'wx'});
   parts.push({name,bytes,sha256:digest(buffer)});offset+=bytes;
  }
  if(splitHash.digest('hex')!==installer.sha256)throw Error('安装包在分卷期间发生变化，请使用新的输出目录重新打包');
  const manifest={schema:1,version,tag,file:setupFileName(version),bytes:installer.bytes,sha256:installer.sha256,parts};
  parseMirrorManifest(JSON.stringify(manifest),manifest);
  const mergeName=`RiftBuddy-${version}-Merge.cmd`,manifestName=mirrorManifestName(version),merge=mergeCommand(manifest),json=JSON.stringify(manifest,null,2)+'\n';
  await fs.writeFile(path.join(outputDir,mergeName),merge,{flag:'wx'});
  await fs.writeFile(path.join(outputDir,manifestName),json,{flag:'wx'});
  const checksumName=`SHA256SUMS-${version}.txt`;
  const sums=[{name:manifest.file,sha256:manifest.sha256},...parts,{name:mergeName,sha256:digest(merge)},{name:manifestName,sha256:digest(json)}].map(p=>`${p.sha256}  ${p.name}`).join('\n')+'\n';
  await fs.writeFile(path.join(outputDir,checksumName),sums,{flag:'wx'});
  const notes=`# 开黑搭子 v${version} 国内镜像\n\n与 [GitHub 同版安装包](${releasePageUrl(tag)}) 使用相同原始字节。\n\n下载 ${parts.length} 个分卷（${parts.map(p=>p.name).join('、')}）和 ${mergeName} 到同一文件夹，保留文件名。双击 Merge.cmd，逐段和整包 SHA-256 验证成功后生成 ${manifest.file}，再自行双击安装。无需 Node.js 或解压软件；脚本不会自动启动安装，也不会覆盖不匹配的安装包。\n\n完整安装包：${manifest.bytes} 字节；SHA-256：\n\n\`${manifest.sha256}\`\n\n校验清单：${checksumName}。应用内更新使用 ${manifestName} 自动合并分卷，不下载执行 Merge.cmd。\n\n[GitHub 发布页](${releasePageUrl(tag)}) · [Gitee 发布页](${giteeReleaseUrl(tag)})\n`;
  await fs.writeFile(path.join(outputDir,'release-notes.md'),notes,{flag:'wx'});
  return {status:'prepared-not-published',version,outputDir:path.resolve(outputDir),manifest,attachments:[...parts.map(p=>p.name),mergeName,checksumName,manifestName],releaseNotes:path.join(outputDir,'release-notes.md'),publishManifestLast:true};
 }finally{await source.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const record=JSON.parse(await fs.readFile(process.argv[2]||'release/installer-latest.json','utf8'));
 const outputDir=path.resolve(process.argv[3]||`release/gitee-v${record.version}`);
 console.log(JSON.stringify(await packageGiteeMirror({installer:record,outputDir}),null,2));
}
