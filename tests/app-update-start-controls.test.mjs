import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const slice=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
function fixture(){
 let saving=Promise.withResolvers(),push;const downloads=[],notices=[],events=new Map();
 const c={appUpdate:{phase:'available',release:{version:'0.59.57'}},route:'settings',saved:{preferences:{}},render(){},toast:(message,error)=>notices.push({message,error}),persist:()=>saving.promise,document:{},patchAppUpdateProgress:()=>false,
  stopDataUpdates:null,dataState:{dispose(){}},window:{addEventListener:(name,fn)=>events.set(name,fn)},api:{downloadAppUpdate:async()=>downloads.push(c.saved.preferences.updateMirror),pauseAppUpdate:async()=>false,cancelAppUpdate:async()=>false,onAppUpdate:callback=>{push=callback;}}};
 vm.createContext(c);vm.runInContext(slice('async function checkAppUpdate(','async function updateData('),c);
 vm.runInContext('async function stop(action){if(false){} '+slice("else if(action==='app-update-cancel')","else if(action==='app-update-install')")+'}',c);
 vm.runInContext(source.split('\n').find(line=>line.startsWith(' api.onAppUpdate?.(')),c);
 vm.runInContext(source.split('\n').find(line=>line.startsWith("window.addEventListener('pagehide',()=>{")&&line.includes('stopDataUpdates')),c);
 return {c,downloads,notices,events,push:value=>push(value),saving:()=>saving,nextSave(){saving=Promise.withResolvers();return saving;}};
}
for(const action of ['app-update-pause','app-update-cancel'])test(`${action} really stops a download still waiting for its source save`,async()=>{
 const f=fixture(),save=f.c.saveUpdateMirror('new source'),download=f.c.downloadAppUpdate();await Promise.resolve();
 await f.c.stop(action);f.saving().resolve();await Promise.all([save,download]);assert.equal(f.downloads.length,0);
});
test('a cancelled old start cannot duplicate the next requested download',async()=>{
 const f=fixture(),save=f.c.saveUpdateMirror('new source'),old=f.c.downloadAppUpdate();await f.c.stop('app-update-cancel');
 const fresh=f.c.downloadAppUpdate();f.saving().resolve();await Promise.all([save,old,fresh]);assert.equal(f.downloads.length,1);
});
test('a cancelled old save failure cannot replace the next source request with an error',async()=>{
 const f=fixture(),oldSave=f.c.saveUpdateMirror('old source'),oldFailure=oldSave.catch(()=>{}),oldDownload=f.c.downloadAppUpdate(),oldGate=f.saving();await f.c.stop('app-update-cancel');
 const nextGate=f.nextSave(),newSave=f.c.saveUpdateMirror('fresh source'),newDownload=f.c.downloadAppUpdate();oldGate.reject(Error('old disk failure'));await Promise.all([oldFailure,oldDownload]);const phase=f.c.appUpdate.phase;
 nextGate.resolve();await Promise.all([newSave,newDownload]);assert.equal(phase,'downloading');assert.deepEqual(f.downloads,['fresh source']);assert.deepEqual(f.notices,[]);
});
test('pagehide prevents a waiting source save from launching a late download',async()=>{
 const f=fixture(),save=f.c.saveUpdateMirror('new source'),download=f.c.downloadAppUpdate();f.events.get('pagehide')();f.saving().resolve();await Promise.all([save,download]);assert.equal(f.downloads.length,0);
});
test('an available server status cannot replace a local source-waiting download intent',async()=>{
 const f=fixture(),save=f.c.saveUpdateMirror('new source'),download=f.c.downloadAppUpdate();f.push({phase:'available',release:{version:'0.59.57'}});const phase=f.c.appUpdate.phase;
 f.saving().resolve();await Promise.all([save,download]);assert.equal(phase,'downloading');assert.equal(f.downloads.length,1);
});
test('an active shared download supersedes this window waiting to start another download',async()=>{
 const f=fixture(),save=f.c.saveUpdateMirror('new source'),download=f.c.downloadAppUpdate();f.push({phase:'downloading',release:{version:'0.59.57'},received:4096,total:8192});
 f.saving().resolve();await Promise.all([save,download]);assert.equal(f.downloads.length,0);assert.equal(f.c.appUpdate.received,4096);
});
test('the current source save failure is reported and a fresh source remains retryable',async()=>{
 const f=fixture(),save=f.c.saveUpdateMirror('broken source'),failure=save.catch(()=>{}),download=f.c.downloadAppUpdate();f.saving().reject(Error('disk unavailable'));await Promise.all([failure,download]);
 assert.equal(f.c.appUpdate.phase,'error');assert.match(f.notices.at(-1).message,/disk unavailable/);assert.equal(f.downloads.length,0);
 const gate=f.nextSave(),retrySave=f.c.saveUpdateMirror('working source'),retry=f.c.downloadAppUpdate();gate.resolve();await Promise.all([retrySave,retry]);assert.deepEqual(f.downloads,['working source']);
});
for(const action of ['app-update-pause','app-update-cancel'])test(`${action} still invokes the real stop API after download dispatch`,async()=>{
 const f=fixture(),started=Promise.withResolvers(),finish=Promise.withResolvers();let stopped=0;
 f.c.api.downloadAppUpdate=async()=>{started.resolve();await finish.promise;};f.c.api[action==='app-update-pause'?'pauseAppUpdate':'cancelAppUpdate']=async()=>{stopped++;};
 const download=f.c.downloadAppUpdate();await started.promise;await f.c.stop(action);finish.resolve();await download;assert.equal(stopped,1);
});
test('a valid recovered partial is a successful check with its real resume metadata',async()=>{
 const f=fixture();f.c.appUpdate.phase='error';f.c.api.checkAppUpdate=async()=>({phase:'paused',release:{version:'0.59.57'},received:4096,total:8192,kind:'incremental',via:'gitee'});
 await f.c.checkAppUpdate();assert.equal(f.c.appUpdate.phase,'paused');assert.equal(f.c.appUpdate.received,4096);assert.equal(f.c.appUpdate.total,8192);assert.equal(f.c.appUpdate.kind,'incremental');assert.equal(f.c.appUpdate.via,'gitee');
 assert.match(f.notices.at(-1).message,/继续下载/);assert.notEqual(f.notices.at(-1).error,true);assert(f.c.saved.preferences.lastAppUpdateCheck);
});
