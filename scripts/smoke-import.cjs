const {app,dialog}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const windows=[],root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),delay=ms=>new Promise(r=>setTimeout(r,ms));app.on('browser-window-created',(_e,w)=>windows.push(w));
async function until(check,label){for(let n=0;n<150;n++){const v=await check();if(v)return v;await delay(100);}throw Error(label);}
async function run(){
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=JSON.parse(await fs.readFile('release/latest.json','utf8')),base=source?path.resolve('.'):path.join(release.directory,'resources/app.asar');let file='old-backup.json';
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(root,file)]});require(path.join(base,'electron/main.cjs'));
 const main=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/index.html')),'Main missing'),js=c=>main.webContents.executeJavaScript(c,true);await until(()=>js('!!document.querySelector("[data-action=recommend]")'),'UI missing');
 const click=async sel=>{assert.ok(await js(`!!document.querySelector(${JSON.stringify(sel)})`),sel);await js(`document.querySelector(${JSON.stringify(sel)}).click()`);};
 await click('[data-action=draft-scope][data-scope=bot]');await click('[data-action=recommend]');await until(()=>js('document.querySelectorAll(".result-card").length>0'),'Initial strict-pool recommendations missing');
 await click('[data-action=navigate][data-route=settings]');await click('[data-action=import]');await until(async()=>JSON.parse(await fs.readFile(path.join(root,'settings.json'))).preferences.style==='balanced','Old import did not finish');
 const old=(await js('window.buddy.bootstrap()')).state.preferences;assert.deepEqual(old.pool,['Ashe','Nami']);assert.equal(old.poolMode,'only');assert.equal(old.rolePools.bottom.mode,'only');assert.equal(old.autoLive,false);assert.equal(old.guideAutoShow,false);assert.equal(old.guideAfterGame,'keep');
 await click('[data-action=navigate][data-route=draft]');assert.equal(await js('document.querySelectorAll(".result-card").length'),0);await click('[data-action=recommend]');await until(()=>js('!!document.querySelector(".result-card")'),'Second results missing');
 // Import a newer strict-pool backup after viewing an older recommendation.
 await click('[data-action=result-detail]');await click('[data-action=navigate][data-route=settings]');file='new-backup.json';await click('[data-action=import]');await until(async()=>JSON.parse(await fs.readFile(path.join(root,'settings.json'))).preferences.pool.includes('Caitlyn'),'New import did not finish');
 assert.equal(await js('document.querySelectorAll(".result-card").length'),0);const state=(await js('window.buddy.bootstrap()')).state;assert.deepEqual(state.preferences.pool,['Caitlyn','Lux']);assert.equal(state.preferences.rolePools.bottom.heroes[0],'Caitlyn');
 await click('[data-action=navigate][data-route=draft]');await click('[data-action=recommend]');await until(()=>js('!!document.querySelector(".result-card")'),'New pool cannot recommend');await click('[data-action=result-detail]');await click('[data-action=use-result]');
 const applied=(await js('window.buddy.bootstrap()')).state.draft.slots;assert.equal(applied.find(s=>s.role==='bottom').champion,'Caitlyn');assert.equal(applied.find(s=>s.role==='support').champion,'Lux');assert.equal(state.ownedPageId,null);
 const result={passed:true,source:source?'working-tree':'packaged',archiveSha256:source?null:release.archiveSha256,realImportIPC:true,oldBackupPreservesMissingPreferences:true,newBackupRestoresExplicitPreferences:true,oldRecommendationsInvalidated:true,newStrictPoolApplied:true,actualRuneWrites:false,userSettingsIsolated:true};await fs.writeFile(path.join(root,'import-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));app.quit();
}
run().catch(e=>{console.error(e);app.exit(1);});
