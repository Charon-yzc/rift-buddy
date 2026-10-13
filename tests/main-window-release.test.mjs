import test from 'node:test';
import assert from 'node:assert/strict';
import createRelease from '../electron/main-window-release.cjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(){
 const window={visible:false,destroyed:false,isVisible(){return this.visible;},isDestroyed(){return this.destroyed;}},messages=[];let current=window,allowed=true,busy=false,task=Promise.resolve(),releases=0;
 const release=createRelease({getWindow:()=>current,canRelease:()=>allowed,isBusy:()=>busy,getSaveTask:()=>task,release:target=>{target.destroyed=true;releases++;},diagnostic:message=>messages.push(message),idleMs:15,retryMs:5});
 return {window,release,messages,setCurrent:value=>current=value,setAllowed:value=>allowed=value,setBusy:value=>busy=value,setTask:value=>task=value,releases:()=>releases};
}
test('game release waits for active operations and the complete persistence barrier',async()=>{
 const f=fixture();let finish;f.setBusy(true);f.setTask(new Promise(resolve=>finish=resolve));f.release.request(f.window);await pause(25);assert.equal(f.releases(),0);f.setBusy(false);await pause(20);assert.equal(f.releases(),0);finish();await pause(20);assert.equal(f.releases(),1);f.release.cancel();
});
test('explicit reopening, foreground visibility or leaving the game cancels automatic release',async()=>{
 for(const change of [f=>f.release.cancel(),f=>{f.window.visible=true;},f=>f.setAllowed(false)]){const f=fixture();f.release.request(f.window);change(f);await pause(25);assert.equal(f.releases(),0);f.release.cancel();}
});
test('a newer save must settle and main IPC activity restarts the quiet period',async()=>{
 const f=fixture();let finishFirst,finishNext;f.setTask(new Promise(resolve=>finishFirst=resolve));f.release.request(f.window);await pause(25);f.setTask(new Promise(resolve=>finishNext=resolve));finishFirst();await pause(25);assert.equal(f.releases(),0);finishNext();f.release.activity(f.window);await pause(5);assert.equal(f.releases(),0);await pause(25);assert.equal(f.releases(),1);f.release.cancel();
});
test('a failed save or replaced window is retained without destroying a newer renderer',async()=>{
 const f=fixture();let fail;f.setTask(new Promise((_resolve,reject)=>fail=reject));f.release.request(f.window);await pause(25);fail(Error('disk unavailable'));await pause(10);assert.equal(f.releases(),0);assert.match(f.messages[0],/failed save/);f.release.cancel();
 const g=fixture();g.release.request(g.window);g.setCurrent({});await pause(25);assert.equal(g.releases(),0);g.release.cancel();
});
