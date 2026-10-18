import path from 'node:path';
const quote=value=>'"'+String(value).replaceAll('$','$$').replaceAll('"','$\\"')+'"';
export function checksumRecord({version,sha256}){
 if(!/^\d+\.\d+\.\d+$/.test(version||''))throw Error('安装包版本格式不正确');
 if(!/^[0-9a-f]{64}$/.test(sha256||''))throw Error('安装包校验值格式不正确');
 return `${sha256}  RiftBuddy-${version}-Setup.exe\n`;
}
export function installerScript({version,directory,output,icon,files,obsoleteLocales=[],lifecycle=path.resolve('scripts/installer-lifecycle.ps1'),baseManifest='',blockPatch='',payloadFiles=files,registryId='RiftBuddy',shortcutName='开黑搭子',diagnosticFile=''}){
 if(!/^\d+\.\d+\.\d+$/.test(version)||version.trim()!==version||!files.length)throw Error('安装包版本或文件清单不完整');
 if(files.some(file=>path.win32.isAbsolute(file)||/^[A-Za-z]:/.test(file)||file.split(/[\\/]/).some(p=>p==='..'||!p)||/[\r\n]/.test(file)))throw Error('安装包清单包含不合法路径');
 if(!Array.isArray(payloadFiles)||payloadFiles.some(file=>!files.includes(file)))throw Error('增量文件必须属于完整安装清单');
 if(blockPatch&&!baseManifest)throw Error('数据块增量必须有已验证的安装基线');
 if(!/^[A-Za-z0-9-]{1,80}$/.test(registryId)||!shortcutName||/[\\/:*?"<>|\r\n$]/.test(shortcutName))throw Error('安装集成标识不正确');
 if(!Array.isArray(obsoleteLocales)||obsoleteLocales.length>200||obsoleteLocales.some(name=>typeof name!=='string'||!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,4})?\.pak$/.test(name)||['en-US.pak','zh-CN.pak','zh-TW.pak'].includes(name)||files.some(file=>file.replaceAll('\\','/')==='locales/'+name)))throw Error('旧语言资源清单不正确');
 const removeLocales=obsoleteLocales.map(name=>`  Delete "$INSTDIR\\locales\\${name}"`).join('\n');
 const relative=files.map(f=>f.replaceAll('/','\\')),folders=new Set();
 for(const file of relative){let dir=path.win32.dirname(file);while(dir!=='.'){folders.add(dir);const next=path.win32.dirname(dir);if(next===dir)break;dir=next;}}
 const removeFiles=relative.map(file=>`  Delete "$INSTDIR\\${String(file).replaceAll('$','$$').replaceAll('"','$\\"')}"`).join('\n');
 const removeFolders=[...folders].sort((a,b)=>b.split('\\').length-a.split('\\').length||b.length-a.length).map(dir=>`  RMDir "$INSTDIR\\${dir.replaceAll('$','$$').replaceAll('"','$\\"')}"`).join('\n');
 const stageFiles=baseManifest?payloadFiles.map(file=>`  SetOutPath "$PLUGINSDIR\\new\\${path.win32.dirname(file.replaceAll('/','\\')).replaceAll('$','$$')}"\n  File ${quote(path.join(directory,file))}`).join('\n'):`  File /r ${quote(path.join(directory,'*.*'))}`;
 const ps='"$SYSDIR\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\\lifecycle.ps1"';
 return `# -*- coding: utf-8 -*-
Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
Name "开黑搭子 ${version}"
OutFile ${quote(output)}
InstallDir "$LOCALAPPDATA\\Programs\\${registryId}"
InstallDirRegKey HKCU "Software\\${registryId}" "InstallDir"
RequestExecutionLevel user
Var PreviousInstallDir
SetCompressor /SOLID lzma
VIProductVersion "${version}.0"
VIAddVersionKey /LANG=2052 "ProductName" "开黑搭子"
VIAddVersionKey /LANG=2052 "FileDescription" "开黑搭子安装程序"
VIAddVersionKey /LANG=2052 "FileVersion" "${version}"
VIAddVersionKey /LANG=2052 "LegalCopyright" "Rift Buddy contributors"
!define MUI_ICON ${quote(icon)}
!define MUI_UNICON ${quote(icon)}
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\\开黑搭子.exe"
!define MUI_FINISHPAGE_RUN_TEXT "启动开黑搭子"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
Function .onInit
  SetShellVarContext current
  ReadRegStr $PreviousInstallDir HKCU "Software\\${registryId}" "InstallDir"
  \${If} $PreviousInstallDir == ""
    StrCpy $PreviousInstallDir $INSTDIR
  \${EndIf}
  \${IfNot} \${RunningX64}
    MessageBox MB_OK "此安装包需要 64 位 Windows。"
    Abort
  \${EndIf}
FunctionEnd
Function un.onInit
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=lifecycle.ps1 ${quote(lifecycle)}
  nsExec::ExecToStack /TIMEOUT=600000 '${ps} -RegistryId ${registryId} -InstallDir "$INSTDIR" -StopOnly'
  Pop $0
  Pop $1
  \${If} $0 != 0
    SetErrorLevel 1
    Abort
  \${EndIf}
FunctionEnd
Section "开黑搭子" Main
  InitPluginsDir
  SetOutPath "$PLUGINSDIR\\new"
${stageFiles}
  ClearErrors
  WriteUninstaller "$PLUGINSDIR\\new\\卸载开黑搭子.exe"
  IfErrors 0 +3
    SetErrorLevel 1
    Abort
  SetOutPath "$PLUGINSDIR"
  File /oname=lifecycle.ps1 ${quote(lifecycle)}
${baseManifest?`  File /oname=base-install.json ${quote(baseManifest)}`:''}
${blockPatch?`  File /oname=block-patch.json ${quote(blockPatch)}`:''}
  nsExec::ExecToStack /TIMEOUT=600000 '${ps} -RegistryId ${registryId} -ShortcutName "${shortcutName}" -InstallDir "$INSTDIR" -PreviousInstallDir "$PreviousInstallDir" -StagedDir "$PLUGINSDIR\\new"${baseManifest?' -BaseManifest "$PLUGINSDIR\\base-install.json"':''}${blockPatch?' -BlockPatch "$PLUGINSDIR\\block-patch.json"':''}'
  Pop $0
  Pop $1
${diagnosticFile?`  FileOpen $2 ${quote(diagnosticFile)} w\n  FileWrite $2 "$0$\\r$\\n$1"\n  FileClose $2`:''}
  \${If} $0 != 0
    IfSilent +2
    MessageBox MB_OK|MB_ICONSTOP "升级未完成。请查看以下原因；增量基线不匹配时可改用完整安装包。$\\r$\\n$1"
    SetErrorLevel 1
    Abort
  \${EndIf}
  SetOutPath "$INSTDIR"
${removeLocales}
  ClearErrors
  CreateDirectory "$SMPROGRAMS\\${shortcutName}"
  CreateShortcut "$SMPROGRAMS\\${shortcutName}\\开黑搭子.lnk" "$INSTDIR\\开黑搭子.exe"
  CreateShortcut "$SMPROGRAMS\\${shortcutName}\\卸载.lnk" "$INSTDIR\\卸载开黑搭子.exe"
  CreateShortcut "$DESKTOP\\${shortcutName}.lnk" "$INSTDIR\\开黑搭子.exe"
  WriteRegStr HKCU "Software\\${registryId}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${registryId}" "DisplayName" "开黑搭子"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${registryId}" "DisplayVersion" "${version}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${registryId}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${registryId}" "DisplayIcon" "$INSTDIR\\开黑搭子.exe"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${registryId}" "UninstallString" '$\\"$INSTDIR\\卸载开黑搭子.exe$\\"'
  WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${registryId}" "NoModify" 1
  WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${registryId}" "NoRepair" 1
  IfErrors 0 +5
    IfSilent +2
    MessageBox MB_OK|MB_ICONSTOP "程序文件已安装，但快捷方式或卸载登记失败，请重新运行安装包修复。"
    SetErrorLevel 1
    Abort
SectionEnd
Section "Uninstall"
  SetShellVarContext current
${removeFiles}
  Delete "$INSTDIR\\卸载开黑搭子.exe"
${removeFolders}
  RMDir "$INSTDIR"
  Delete "$DESKTOP\\${shortcutName}.lnk"
  Delete "$SMPROGRAMS\\${shortcutName}\\开黑搭子.lnk"
  Delete "$SMPROGRAMS\\${shortcutName}\\卸载.lnk"
  RMDir "$SMPROGRAMS\\${shortcutName}"
  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${registryId}"
  DeleteRegValue HKCU "Software\\${registryId}" "InstallDir"
  DeleteRegKey /ifempty HKCU "Software\\${registryId}"
SectionEnd
`;
}
