import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
const psQuote=value=>`'${String(value).replaceAll("'","''")}'`;
export function windowsArgument(value){
 return '"'+String(value).replace(/(\\*)"/g,'$1$1\\"').replace(/(\\+)$/,'$1$1')+'"';
}
export function launchCommand(executable,args,recordFile){
 // EncodedCommand preserves the exact Unicode script and nested quoting through
 // Node -> PowerShell -> ShellExecute. It does not alter execution policy or UAC.
 const argumentsText=args.map(windowsArgument).join(' ');
 const script=`$ErrorActionPreference='Stop'; $recordFile=${psQuote(recordFile)};
function Write-Launch($phase,$pidValue,$errorValue) { [ordered]@{phase=$phase;pid=$pidValue;nativeCode=$errorValue} | ConvertTo-Json -Compress | Set-Content -LiteralPath $recordFile -Encoding UTF8 }
try {
 Write-Launch 'requesting' 0 0;
 $child=Start-Process -FilePath ${psQuote(executable)} -WorkingDirectory ${psQuote(path.dirname(executable))} -ArgumentList ${psQuote(argumentsText)} -Verb RunAs -WindowStyle Hidden -PassThru -ErrorAction Stop;
 Write-Launch 'launched' $child.Id 0;
 Start-Sleep -Milliseconds 500;
 exit 0
} catch { Write-Launch 'failed' 0 $_.Exception.NativeErrorCode; exit 1 }`;
 return ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')];
}
export async function launchHelper({executable,args,recordFile,onExit,onError,launcherExecutable,bundleRoot,userData,sessionFile}){
 if(launcherExecutable){
  const launcher=spawn(launcherExecutable,[bundleRoot,userData,sessionFile,recordFile],{windowsHide:true,stdio:'ignore'});
  launcher.on('error',onError);launcher.on('exit',onExit);launcher.unref();return launcher;
 }
 let runtime=process.env.RIFT_BUDDY_POWERSHELL;
 if(!runtime){const pwsh=path.join(process.env.ProgramFiles||'C:/Program Files','PowerShell/7/pwsh.exe');
  try{await fs.access(pwsh);runtime=pwsh;}catch{runtime=path.join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');}}
 const launcher=spawn(runtime,launchCommand(executable,args,recordFile),{windowsHide:true,stdio:'ignore'});
 launcher.on('error',onError);launcher.on('exit',onExit);launcher.unref();return launcher;
}
