import path from 'node:path';
const quote=value=>'"'+String(value).replaceAll('$','$$').replaceAll('"','$\\"')+'"';
export function installerScript({version,directory,output,icon,files}){
 if(!/^\d+\.\d+\.\d+$/.test(version)||version.trim()!==version||!files.length)throw Error('安装包版本或文件清单不完整');
 if(files.some(file=>path.isAbsolute(file)||file.split(/[\\/]/).some(p=>p==='..'||!p)||/[\r\n]/.test(file)))throw Error('安装包清单包含不合法路径');
 const relative=files.map(f=>f.replaceAll('/','\\')),folders=new Set();
 for(const file of relative){let dir=path.win32.dirname(file);while(dir!=='.'){folders.add(dir);dir=path.win32.dirname(dir);}}
 const removeFiles=relative.map(file=>`  Delete "$INSTDIR\\${String(file).replaceAll('$','$$').replaceAll('"','$\\"')}"`).join('\n');
 const removeFolders=[...folders].sort((a,b)=>b.split('\\').length-a.split('\\').length||b.length-a.length).map(dir=>`  RMDir "$INSTDIR\\${dir.replaceAll('$','$$').replaceAll('"','$\\"')}"`).join('\n');
 return `# -*- coding: utf-8 -*-
Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
Name "开黑搭子 ${version}"
OutFile ${quote(output)}
InstallDir "$LOCALAPPDATA\\Programs\\RiftBuddy"
InstallDirRegKey HKCU "Software\\RiftBuddy" "InstallDir"
RequestExecutionLevel user
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
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
Function .onInit
  SetShellVarContext current
  \${IfNot} \${RunningX64}
    MessageBox MB_OK "此安装包需要 64 位 Windows。"
    Abort
  \${EndIf}
FunctionEnd
Section "开黑搭子" Main
  SetOutPath "$INSTDIR"
  File /r ${quote(path.join(directory,'*.*'))}
  WriteUninstaller "$INSTDIR\\卸载开黑搭子.exe"
  CreateDirectory "$SMPROGRAMS\\开黑搭子"
  CreateShortcut "$SMPROGRAMS\\开黑搭子\\开黑搭子.lnk" "$INSTDIR\\开黑搭子.exe"
  CreateShortcut "$SMPROGRAMS\\开黑搭子\\卸载.lnk" "$INSTDIR\\卸载开黑搭子.exe"
  CreateShortcut "$DESKTOP\\开黑搭子.lnk" "$INSTDIR\\开黑搭子.exe"
  WriteRegStr HKCU "Software\\RiftBuddy" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\RiftBuddy" "DisplayName" "开黑搭子"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\RiftBuddy" "DisplayVersion" "${version}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\RiftBuddy" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\RiftBuddy" "DisplayIcon" "$INSTDIR\\开黑搭子.exe"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\RiftBuddy" "UninstallString" '$\\"$INSTDIR\\卸载开黑搭子.exe$\\"'
  WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\RiftBuddy" "NoModify" 1
  WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\RiftBuddy" "NoRepair" 1
SectionEnd
Section "Uninstall"
  SetShellVarContext current
${removeFiles}
  Delete "$INSTDIR\\卸载开黑搭子.exe"
${removeFolders}
  RMDir "$INSTDIR"
  Delete "$DESKTOP\\开黑搭子.lnk"
  Delete "$SMPROGRAMS\\开黑搭子\\开黑搭子.lnk"
  Delete "$SMPROGRAMS\\开黑搭子\\卸载.lnk"
  RMDir "$SMPROGRAMS\\开黑搭子"
  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\RiftBuddy"
  DeleteRegValue HKCU "Software\\RiftBuddy" "InstallDir"
  DeleteRegKey /ifempty HKCU "Software\\RiftBuddy"
SectionEnd
`;
}
