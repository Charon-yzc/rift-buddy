import test from 'node:test';
import assert from 'node:assert/strict';
import {installerScript,checksumRecord} from '../scripts/installer-script.mjs';
const args={version:'0.12.0',directory:'C:\\bundle',output:'C:\\output\\setup.exe',icon:'C:\\icon.ico',files:['开黑搭子.exe','resources/app.asar','resources/connection/node.exe']};
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
