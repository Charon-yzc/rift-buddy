const {app,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const windows=[],root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),delay=ms=>new Promise(r=>setTimeout(r,ms));
app.on('browser-window-created',(_e,w)=>windows.push(w));
async function until(check,label){for(let n=0;n<150;n++){const v=await check();if(v)return v;await delay(100);}throw Error(label);}
async function run(){
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=JSON.parse(await fs.readFile('release/latest.json','utf8'));
 const register=ipcMain.handle.bind(ipcMain);
 ipcMain.handle=(channel,handler)=>register(channel,channel==='update-guide'?async(...args)=>{await delay(180);return handler(...args);}:handler);
 require(source?path.resolve('electron/main.cjs'):path.join(release.directory,'resources/app.asar/electron/main.cjs'));
 const main=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/index.html')),'Main missing'),js=c=>main.webContents.executeJavaScript(c,true);
 await until(()=>js('!!document.querySelector("[data-action=guide-current]")'),'UI missing');
 ipcMain.handle=register;
 const click=async sel=>{assert.ok(await js(`!!document.querySelector(${JSON.stringify(sel)})`),sel);await js(`document.querySelector(${JSON.stringify(sel)}).click()`);};
 const active=()=>js('({loadout:document.querySelector(".loadout-option.active")?.dataset.id,rune:document.querySelector(".rune-option.active")?.dataset.id,conditions:[...document.querySelectorAll("[data-action=build-condition].active")].map(e=>e.dataset.condition)})');
 const capture=async(name,w=main)=>{await w.webContents.executeJavaScript('Promise.all([...document.images].map(i=>{i.loading="eager";return i.decode().catch(()=>{});})).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');await fs.writeFile(path.join(root,name),(await w.webContents.capturePage()).toPNG());};
 const state=()=>js('window.buddy.bootstrap().then(b=>b.state)');
 // A normal library visit after boot must recover saved non-default choices.
 await click('[data-action=navigate][data-route=builds]');await click('[data-action=library-role][data-role=bottom]');await click('[data-action=build][data-id=Seraphine]');
 assert.deepEqual(await active(),{loadout:'sera-team',rune:'curated-guardian',conditions:['heal']});
 await delay(250);assert.equal((await state()).guide.selection.runeId,'curated-guardian');
 await click('[data-action=build-partner]');await click('[data-action=build-partner]');assert.equal((await active()).rune,'curated-guardian');
 await click('[data-action=open-guide]');
 const guide=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html')),'Guide missing'),gjs=c=>guide.webContents.executeJavaScript(c,true);
 await until(()=>gjs('!!document.querySelector(".next-item")'),'Guide not rendered');
 // The delayed update-guide handler above overlaps edits from both windows.
 await click('[data-action=build-rune][data-id=curated-aery]');
 await gjs('window.guide.control("condition","ap")');
 await click('[data-action=build-rune][data-id=curated-guardian]');
 await until(async()=>{const s=(await state()).guide.selection;return s.runeId==='curated-guardian'&&s.conditions.includes('ap');},'Interleaved guide edit lost');
 await until(()=>js('document.querySelector("[data-action=build-condition][data-condition=ap]").classList.contains("active")'),'Guide choice not returned to config');
 await capture('prepared-configuration.png');
 // A saved Hex context must survive ordinary equipment changes and reopening.
 await js('window.buddy.openGuide({id:"Ashe",role:"bottom",mode:"hex",augmentIds:[1048],compareIds:[1048,1002],ownedAugmentIds:[1047]})');
 await gjs('window.guide.control("main")');await until(()=>js('document.querySelector(".champ-summary")?.textContent.includes("艾希")'),'Hex return missing');
 await click('[data-action=build-condition][data-condition=heal]');
 await until(async()=>{const s=(await state()).guide.selection;return s.conditions.includes('heal')&&s.compareIds?.length===2;},'Hex context lost on sync');
 await click('[data-action=open-guide]');let h=(await state()).guide.selection;assert.deepEqual(h.augmentIds,[1048]);assert.deepEqual(h.compareIds,[1048,1002]);assert.deepEqual(h.ownedAugmentIds,[1047]);
 await gjs('window.guide.control("hide")');await click('[data-action=close]');await click('[data-action=navigate][data-route=draft]');
 await click('[data-action=example]');await click('[data-action=draft-scope][data-scope=bot]');await click('[data-action=recommend]');
 await until(()=>js('document.querySelectorAll(".result-card").length===3'),'No recommendations');await click('[data-action=result-detail]');
 const members=()=>js('[...document.querySelectorAll(".lineup-detail [data-action=build]")].map(e=>({role:e.dataset.role,id:e.dataset.id}))');
 let before=await members();await click('[data-action=replace-member][data-role=bottom]');
 await until(async()=>JSON.stringify(await members())!==JSON.stringify(before),'Bottom unchanged');let second=await members();
 assert.equal(second.find(s=>s.role==='support').id,before.find(s=>s.role==='support').id);
 assert.ok(await js('!!document.querySelector("[data-action=replace-member][data-role=support]")'));
 await click('[data-action=replace-member][data-role=support]');await until(async()=>JSON.stringify(await members())!==JSON.stringify(second),'Support unchanged');
 assert.equal((await members()).find(s=>s.role==='bottom').id,second.find(s=>s.role==='bottom').id);
 main.setSize(1080,720);await delay(150);
 assert.ok(await js('{const r=document.querySelector(".plan-actions").getBoundingClientRect();r.bottom<=innerHeight&&r.top>=0}'),'Confirmation footer clipped');
 await js('document.querySelector(".drawer-content").scrollTop=220');const scroll=await js('document.querySelector(".drawer-content").scrollTop');
 const id=(await members())[0].id;await click('.lineup-detail [data-action=build]');await click('[data-action=back-result]');
 assert.equal((await members())[0].id,id);assert.equal(await js('document.querySelector(".drawer-content").scrollTop'),scroll);
 await capture('replacement-and-confirmation.png');
 // A genuinely exhausted replacement pool must leave the existing scheme usable.
 await click('[data-action=close]');await click('[data-action=role-pools]');
 await click('[data-action=role-pool-edit][data-role=bottom]');await click('[data-action=pick-champion][data-id=Jhin]');await click('[data-action=close]');
 await click('[data-action=recommend]');await until(()=>js('document.querySelectorAll(".result-card").length>0'),'Strict pool results missing');await click('[data-action=result-detail]');
 before=await members();await click('[data-action=replace-member][data-role=bottom]');
 await until(()=>js('document.querySelector("#toast").classList.contains("error")'),'Expected replacement failure missing');
 assert.deepEqual(await members(),before);assert.equal(await js('document.querySelector("[data-action=recommend]").disabled'),false);assert.equal(await js('document.querySelector("[data-action=use-result]").disabled'),false);
 await click('[data-action=close]');
 await js('window.testOriginalWorker=window.Worker;window.Worker=class extends window.testOriginalWorker{postMessage(...args){setTimeout(()=>super.postMessage(...args),350);}};true');
 await click('[data-action=recommend]');assert.equal(await js('document.querySelector("[data-action=recommend]").disabled'),true);
 await click('[data-action=exclusions]');await click('[data-action=pick-champion][data-id=Ashe]');await delay(700);
 assert.equal(await js('document.querySelectorAll(".result-card").length'),0,'Preference change allowed obsolete results');assert.equal(await js('document.querySelector("[data-action=recommend]").disabled'),false);
 await js('window.Worker=window.testOriginalWorker;delete window.testOriginalWorker');await click('[data-action=close]');
 const champion=(await js('window.buddy.bootstrap()')).data.champions.find(c=>c.id==='Garen');
 ipcMain.removeHandler('client-status');ipcMain.handle('client-status',()=>({connected:true,phase:'ChampSelect',message:'测试公开选人',mode:{id:'rift',label:'峡谷'},session:{localPlayerCellId:1,myTeam:[{cellId:1,championId:champion.key,assignedPosition:'top'}],theirTeam:[],bans:[]}}));
 await click('[data-action=sync]');await until(()=>js('document.querySelector("[data-action=sync]").textContent.includes("同步选人")'),'Mock public pick not read');
 await click('[data-action=navigate][data-route=builds]');await click('[data-action=library-role][data-role=bottom]');await click('[data-action=build][data-id=Seraphine]');
 await until(()=>js('document.querySelector(".rune-target-warning")?.textContent.includes("盖伦")'),'Own champion mismatch warning missing');
 assert.match(await js('document.querySelector("[data-action=apply-runes]").textContent'),/萨勒芬妮.*你的客户端/);
 // Changing the arranged partner must not leak a former combo's private build.
 await click('[data-action=close]');await click('[data-action=navigate][data-route=draft]');await click('[data-action=reset-draft]');
 const pick=async(role,id)=>{await click(`[data-action=pick-slot][data-role=${role}]`);await js(`{const i=document.querySelector('#picker-search');i.value=${JSON.stringify(id)};i.dispatchEvent(new Event('input',{bubbles:true}));}`);await click(`[data-action=pick-champion][data-id=${id}]`);};
 await pick('bottom','Rengar');await pick('support','Ivern');await click('.slot [data-action=build][data-role=bottom]');
 await until(()=>js('document.querySelector(".loadout-option.active")?.dataset.id==="rengar-bush"'),'Rengar Ivern private build missing');
 await click('[data-action=open-guide]');await until(async()=>(await state()).guide.selection.comboId==='rengar-ivern','Combo guide missing');
 await click('[data-action=close]');await pick('support','Nami');await click('.slot [data-action=build][data-role=bottom]');
 assert.equal(await js('!!document.querySelector(".combo-config")'),false,'Former partner combo leaked');assert.notEqual((await active()).loadout,'rengar-bush');
 await until(async()=>!(await state()).guide.selection.comboId,'Former combo kept in guide');
 await click('[data-action=close]');await pick('support','Ivern');await click('.slot [data-action=build][data-role=bottom]');
 await until(()=>js('document.querySelector(".loadout-option.active")?.dataset.id==="rengar-bush"'),'Returning combo choice not restored');
 await until(async()=>(await state()).guide.selection.comboId==='rengar-ivern','Returning combo not sent to guide');
 await capture('partner-context-isolation.png');
 // A full backend selection can remove fields. They must not be resurrected by
 // the already-open main-window configuration's next render/sync.
 await js('window.buddy.updateGuide({id:"Rengar",role:"bottom",mode:"rift",coreIndex:0,conditions:[],changedFields:["comboId","loadoutId","runeId"]})');
 await until(()=>js('!document.querySelector(".combo-config")'),'Backend combo removal did not reach configuration');await delay(600);assert.equal((await state()).guide.selection.comboId,undefined,'Main configuration restored a deleted backend combo');
 const result={passed:true,source:source?'working-tree':'packaged',archiveSha256:source?null:release.archiveSha256,restartRestore:true,partnerRoundTrip:true,interleavedGuideEdits:true,hexContextPreserved:true,successiveReplacements:true,failedReplacementRecovery:true,fixedFooter720:true,returnToScheme:true,cancelOnPreferenceEdit:true,runeHeroTargetWarning:true,changedPartnerClearsCombo:true,returningComboRestoresChoices:true,backendDeletedFieldsStayDeleted:true,actualRuneWrites:false,screenshots:root};
 await fs.writeFile(path.join(root,'user-flow-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));app.quit();
}
run().catch(async e=>{console.error(e);await fs.writeFile(path.join(root,'user-flow-smoke-error.txt'),e.stack).catch(()=>{});app.exit(1);});
