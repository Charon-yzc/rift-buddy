import test from 'node:test';
import assert from 'node:assert/strict';
import {installerScript,checksumRecord} from '../scripts/installer-script.mjs';

test('upgrading removes only retired Chromium language packs and preserves current locales and user files',()=>{
 const options={version:'0.47.0',directory:'D:\\bundle',output:'D:\\setup.exe',icon:'D:\\icon.ico',files:['resources/app.asar','locales/zh-CN.pak','locales/en-US.pak']};
 const script=installerScript({...options,obsoleteLocales:['ar.pak','es-419.pak']});
 const install=script.slice(script.indexOf('Section "开黑搭子"'),script.indexOf('Section "Uninstall"'));
 assert.ok(install.includes('Delete "$INSTDIR\\locales\\ar.pak"'));
 assert.ok(install.includes('Delete "$INSTDIR\\locales\\es-419.pak"'));
 assert.ok(!install.includes('Delete "$INSTDIR\\locales\\zh-CN.pak"'));
 assert.ok(!install.includes('RMDir /r'));
 for(const name of ['../personal.txt','zh-CN.pak','en-US.pak','zh-TW.pak','ar.pak"\nDelete *'])assert.throws(()=>installerScript({...options,obsoleteLocales:[name]}),/语言资源/);
 assert.throws(()=>installerScript({...options,files:[...options.files,'locales/ar.pak'],obsoleteLocales:['ar.pak']}),/语言资源/);
});
const args={version:'0.12.0',directory:'C:\\bundle',output:'C:\\output\\setup.exe',icon:'C:\\icon.ico',files:['开黑搭子.exe','resources/app.asar','resources/connection/node.exe']};
test('interactive finish page offers launching the installed app',()=>{
 const script=installerScript(args);
 assert.ok(script.includes('!define MUI_FINISHPAGE_RUN "$INSTDIR\\开黑搭子.exe"'));
 assert.match(script,/MUI_FINISHPAGE_RUN_TEXT "启动开黑搭子"/);
 assert.ok(script.indexOf('!define MUI_FINISHPAGE_RUN ')<script.indexOf('!insertmacro MUI_PAGE_FINISH'));
});
test('installer removes only its enumerated payload while retaining unrelated files and personal preferences',()=>{
 const script=installerScript(args),uninstall=script.slice(script.indexOf('Section "Uninstall"'));
 assert.match(uninstall,/Delete "\$INSTDIR\\resources\\app\.asar"/);assert.match(uninstall,/RMDir "\$INSTDIR\\resources\\connection"/);
 assert.doesNotMatch(uninstall,/RMDir \/r|Delete .*\*|\$APPDATA|Roaming|settings\.json/);assert.match(script,/RequestExecutionLevel user/);assert.doesNotMatch(script,/ExecShell|SetAutoClose true/);
 assert.ok(script.includes(String.raw`"UninstallString" '$\"$INSTDIR\卸载开黑搭子.exe$\"'`));
});
test('installer manifest rejects path traversal, absolute targets and malformed versions',()=>{
 for(const file of ['../personal.txt','C:\\Users\\personal.txt','resources/../../x','resources\nDelete *'])assert.throws(()=>installerScript({...args,files:[file]}),/不合法/);
 assert.throws(()=>installerScript({...args,version:'0.12.0\n'}),/版本/);
});
test('checksum record reproduces the published SHA256SUMS line',()=>{
 const sha='1a8d7850acbf75135a50af746c0b70930589ca5987f16ab5348904f289e5fec8';
 assert.equal(checksumRecord({version:'0.42.0',sha256:sha}),`${sha}  RiftBuddy-0.42.0-Setup.exe\n`);
 assert.throws(()=>checksumRecord({version:'0.42',sha256:sha}),/版本/);
 assert.throws(()=>checksumRecord({version:'0.42.0',sha256:'xyz'}),/校验/);
});
