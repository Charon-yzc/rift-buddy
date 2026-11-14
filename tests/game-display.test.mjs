import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {canSetGameDisplay,readGameDisplayMode,saveBorderless} from '../services/game-display.mjs';
import {clientConnectionNotice} from '../src/client-connection-view.mjs';

async function fixture(t,tencent=true){
 const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'buddy-display-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const client=tencent?path.join(root,'LeagueClient'):root,game=tencent?path.join(root,'Game'):root;
 await fs.mkdir(client,{recursive:true});
 await fs.writeFile(path.join(client,'LeagueClient.exe'),'test marker');
 const config=path.join(game,'Config');
 await fs.mkdir(config,{recursive:true});
 await fs.writeFile(path.join(game,'League of Legends.exe'),'test marker');
 return {root,client,game,config,file:path.join(config,'game.cfg')};
}
const allow={confirm:async()=>{},beforeWrite:()=>{}};

test('switching the detected Tencent or Riot install changes only the mode digit',async t=>{
 for(const tencent of [true,false]){
  const {root,client,game,file,config}=await fixture(t,tencent);
  const source=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('[General]\r\nWindowMode = 0 ; comment\r\nWidth=2560\r\nHeight=1440\r\n[HUD]\r\nWindowMode=1\r\nText=\xff\r\n','latin1')]);
  const expected=Buffer.from(source);expected[source.indexOf('= 0')+2]=0x32;
  await fs.writeFile(file,source);
  await fs.writeFile(path.join(config,'PersistedSettings.json'),'leave account settings alone');
  for(const location of [root,client,game])assert.equal(await readGameDisplayMode(location),'fullscreen');
  assert.deepEqual(await fs.readFile(file),source,'detecting full screen is read-only');
  assert.deepEqual(await saveBorderless(client,allow),{changed:true});
  assert.deepEqual(await fs.readFile(file),expected);
  assert.equal(await readGameDisplayMode(client),'borderless');
  assert.deepEqual(await saveBorderless(client,allow),{changed:false});
  assert.equal(await fs.readFile(path.join(config,'PersistedSettings.json'),'utf8'),'leave account settings alone');
  assert.deepEqual((await fs.readdir(config)).sort(),['PersistedSettings.json','game.cfg']);
 }
});

test('a new game or a concurrent config change aborts before replacing the file',async t=>{
 const {client,file,config}=await fixture(t),original='[General]\nWindowMode=0\nWidth=1920\n';
 await fs.writeFile(file,original);
 await assert.rejects(saveBorderless(client,{...allow,beforeWrite:()=>{throw Error('game started');}}),/game started/);
 assert.equal(await fs.readFile(file,'utf8'),original);
 const updated=original.replace('1920','2560');
 await assert.rejects(saveBorderless(client,{...allow,confirm:()=>fs.writeFile(file,updated)}),/配置已变化/);
 assert.equal(await fs.readFile(file,'utf8'),updated);
 assert.deepEqual(await fs.readdir(config),['game.cfg']);
 for(const phase of ['GameStart','InProgress','Reconnect','WaitingForStats','EndOfGame','Offline','unknown'])assert.equal(canSetGameDisplay(phase),false);
 assert.equal(canSetGameDisplay('ChampSelect'),true);
});

test('windowed, malformed and ambiguous files are preserved',async t=>{
 const {client,file}=await fixture(t);
 for(const [mode,text] of [['windowed','[General]\nWindowMode=1'],['unknown','[General]\nWindowMode=0\nWindowMode=2'],['unknown','[HUD]\nWindowMode=0'],['unknown','[General]\nWindowMode=0\n[general]\nWidth=1920']]){
  await fs.writeFile(file,text);
  assert.equal(await readGameDisplayMode(client),mode);
  await assert.rejects(saveBorderless(client,allow),/设置已变化/);
  assert.equal(await fs.readFile(file,'utf8'),text);
 }
 await fs.rm(file);
 await assert.rejects(saveBorderless(client,allow),{code:'ENOENT'});
});

test('the in-place client notice offers one-click switching only for detected fullscreen',()=>{
 const fullscreen={connected:true,gameDisplay:'fullscreen'};
 for(const compact of [false,true]){
  const notice=clientConnectionNotice(fullscreen,{},false,{compact});
  assert.match(notice,/data-action="game-display-borderless"/);
  assert.match(notice,/data-action="game-display-dismiss"/);
 }
 assert.equal(clientConnectionNotice(fullscreen,{guideAutoShow:false}), '');
 assert.equal(clientConnectionNotice({connected:true,gameDisplay:'borderless'}), '');
});
