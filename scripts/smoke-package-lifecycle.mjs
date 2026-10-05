import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {defaultState,saveState} from '../services/storage.mjs';
const release=JSON.parse(await fs.readFile('release/latest.json','utf8'));
const root=await fs.mkdtemp(path.resolve('.local/lifecycle-'));
const log=path.join(root,'startup.log'),screenshot=path.join(root,'window.png');
const state=defaultState();state.preferences.autoSync=false;state.preferences.autoCheck=false;
await saveState(root,state);
const env={...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_DIAGNOSTICS:log,RIFT_BUDDY_SCREENSHOT:screenshot};
const children=[];
function launch(args=[]){const child=spawn(release.executable,args,{cwd:release.directory,env,windowsHide:args.includes('--quit'),stdio:'ignore'});children.push(child);return {child,exit:once(child,'exit')};}
async function timeout(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms);})]);}finally{clearTimeout(timer);}}
async function until(check){for(let n=0;n<100;n++){if(await check())return;await new Promise(r=>setTimeout(r,100));}throw Error('Packaged window did not become ready');}
const logText=()=>fs.readFile(log,'utf8').catch(()=>'');
try{
 const first=launch();
 await until(async()=>{try{return (await fs.stat(screenshot)).size>1000;}catch{return false;}});
 assert.match(await logText(),/ready-to-show visible=true/);
 const reuse=launch();assert.equal((await timeout(reuse.exit,5000,'Second launch did not exit'))[0],0);
 await until(async()=>(await logText()).includes('show-main-window true'));
 assert.equal(first.child.exitCode,null);
 const quit=launch(['--quit']);await timeout(quit.exit,5000,'Quit command did not exit');
 assert.equal((await timeout(first.exit,5000,'Application did not quit cleanly'))[0],0);
 const reopened=launch();await until(async()=>((await logText()).match(/ready-to-show visible=true/g)||[]).length===2);
 const quitAgain=launch(['--quit']);await timeout(quitAgain.exit,5000,'Second quit command did not exit');
 assert.equal((await timeout(reopened.exit,5000,'Reopened application did not quit'))[0],0);
 const persisted=JSON.parse(await fs.readFile(path.join(root,'settings.json'),'utf8'));
 assert.equal(persisted.preferences.autoSync,false);assert.equal(persisted.preferences.autoCheck,false);
 console.log(JSON.stringify({startup:'passed',nativeCapture:'passed',singleInstance:'passed',gracefulExit:'passed',reopen:'passed',preferences:'preserved',screenshot},null,2));
}finally{for(const child of children)if(child.exitCode===null)child.kill();}
