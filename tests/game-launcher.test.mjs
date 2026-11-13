import test from 'node:test';
import assert from 'node:assert/strict';
import {launchCandidates,launchGame,validLaunchPath} from '../services/game-launcher.mjs';
test('launch prefers WeGame across roots, then direct client; no shell or network path',async()=>{
 const ran=[];await launchGame({installPath:'D:/LOL'},{registry:async()=>['E:/League'],stat:async p=>({isFile:()=>p==='E:\\League\\WeGameLauncher\\launcher.exe'||p==='D:\\LOL\\LeagueClient.exe'}),start:async p=>ran.push(p)});
 assert.deepEqual(ran,['E:\\League\\WeGameLauncher\\launcher.exe']);
 assert.equal(validLaunchPath('https://evil/a.exe'),false);assert.equal(validLaunchPath('\\\\host\\a.exe'),false);assert.throws(()=>launchCandidates({launchPath:'cmd.exe /c start'}));
});
test('custom path is authoritative and missing install is actionable',async()=>{
 const ran=[];await launchGame({launchPath:'D:/My Games/launcher.exe'},{registry:()=>{throw Error('must not detect');},stat:async()=>({isFile:()=>true}),start:async p=>ran.push(p)});assert.equal(ran[0],'D:\\My Games\\launcher.exe');
 await assert.rejects(launchGame({launchPath:'D:/missing.exe'},{stat:async()=>{throw Error();}}),/恢复默认/);
});
test('the current WeGame installation name can launch with an older saved path',async()=>{
 const target='C:\\WeGameApps\\英雄联盟（含经典模式）\\WeGameLauncher\\launcher.exe',ran=[];
 await launchGame({installPath:'C:/WeGameApps/英雄联盟'},{registry:async()=>[],stat:async p=>({isFile:()=>p===target}),start:async p=>ran.push(p)});
 assert.deepEqual(ran,[target]);
});
