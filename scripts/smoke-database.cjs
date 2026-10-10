const {app,ipcMain}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),windows=[];
app.on('browser-window-created',(_event,w)=>windows.push(w));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label){for(let i=0;i<150;i++){const r=await check();if(r)return r;await delay(100);}throw Error(label);}
async function run(){
 app.setPath('userData',root);const release=JSON.parse(await fs.readFile('release/latest.json','utf8'));require(path.join(release.directory,'resources/app.asar/electron/main.cjs'));
 const main=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/index.html')),'Main missing'),js=code=>main.webContents.executeJavaScript(code,true);
 await until(()=>js('!!document.querySelector("[data-action=combination-library]")'),'Draft missing');
 ipcMain.removeHandler('refresh-build');ipcMain.handle('refresh-build',()=>({updated:false,reason:'隔离验收保留内置配置'}));
 const click=async selector=>{assert.ok(await js(`!!document.querySelector(${JSON.stringify(selector)})`),selector);await js(`document.querySelector(${JSON.stringify(selector)}).click()`);await delay(80);};
 const set=async(selector,value)=>js(`{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));}`);
 const search=async value=>{await js(`{const e=document.querySelector('#combo-search');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));}`);await delay(100);};
 const capture=async name=>{await js('Promise.all([...document.images].map(i=>{i.loading="eager";return i.decode().catch(()=>{});})).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');await fs.writeFile(path.join(root,name),(await main.webContents.capturePage()).toPNG());};
 await click('[data-action=combination-library]');await search('冰箭宝石');await click('[data-action=build][data-id=Ashe][data-role=bottom]');
 await until(()=>js('document.querySelectorAll("[data-action=build-core]").length>3'),'Expanded cores missing');
 assert.match(await js('document.querySelector("[data-action=favorite-build]").textContent'),/已收藏/);
 const defaultSkill=await js('document.querySelector("#build-skill").value');
 const defaultRune=await js('document.querySelector(".rune-option.active").dataset.id');
 const alternateSkill=await js('[...document.querySelector("#build-skill").options].find(o=>o.value&&o.value!==document.querySelector("#build-skill").value).value');
 await set('#build-skill',alternateSkill);assert.doesNotMatch(await js('document.querySelector("[data-action=favorite-build]").textContent'),/已收藏/);
 await click('[data-action=favorite-build]');await until(async()=>{const b=await js('window.buddy.bootstrap()');return b.state.favorites.length===2;},'Alternative skill favorite was not saved separately');
 const legacyFavorites=(await js('window.buddy.bootstrap()')).state.favorites;assert.ok(legacyFavorites.some(f=>f.id==='legacy-ashe-taric'));assert.ok(legacyFavorites.some(f=>f.skillId===alternateSkill));
 await set('#build-skill',defaultSkill);assert.match(await js('document.querySelector("[data-action=favorite-build]").textContent'),/已收藏/);
 await js('for(const d of document.querySelectorAll(".more-builds"))d.open=true');await click('[data-action=build-core][data-index="8"]');
 const choices=await js('[...document.querySelectorAll(".rune-option")].map(e=>e.dataset.id)');assert.ok(choices.length>6);await click(`[data-action=build-rune][data-id="${choices[9]}"]`);
 const skillId=await js('document.querySelector("#build-skill").options[2].value');await set('#build-skill',skillId);await js('document.querySelector("[data-build-section=items]").scrollIntoView({block:"start"})');await capture('expanded-builds.png');
 await click('[data-action=favorite-build]');await delay(150);let boot=await js('window.buddy.bootstrap()');const favorite=boot.state.favorites[0];assert.ok(favorite.coreId);assert.equal(favorite.coreIndex,8);assert.equal(favorite.skillId,skillId);assert.equal(favorite.runeId,choices[9]);
 await click('[data-action=open-guide]');const guide=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html')),'Guide missing'),gjs=code=>guide.webContents.executeJavaScript(code,true);
 await until(()=>gjs('!!document.querySelector(".next-item")'),'Guide not loaded');const model=(await gjs('window.guide.bootstrap()')).model;assert.equal(model.selection.coreId,favorite.coreId);assert.equal(model.selection.skillId,skillId);assert.equal(model.runes.map(r=>r.id).length,9);
 await gjs('window.guide.control("main")');await until(()=>js('!!document.querySelector(".core-option.active")'),'Guide return missing');assert.equal(await js('document.querySelector(".core-option.active").dataset.index'),'8');
 await click('[data-action=close]');await click('[data-action=navigate][data-route=favorites]');await click('[data-action=open-favorite][data-index="0"]');assert.equal(await js('document.querySelector("#build-skill").value'),skillId);assert.equal(await js('document.querySelector(".core-option.active").dataset.index'),'8');
 // Open an old favorite after another configuration has populated preparation.
 // Missing IDs must reset to its defaults instead of inheriting that cache.
 await click('[data-action=close]');await click('[data-action=navigate][data-route=favorites]');
 const oldIndex=(await js('window.buddy.bootstrap()')).state.favorites.findIndex(f=>f.id==='legacy-ashe-taric');
 await click(`[data-action=open-favorite][data-index="${oldIndex}"]`);
 assert.equal(await js('document.querySelector(".core-option.active").dataset.index'),'0');assert.equal(await js('document.querySelector("#build-skill").value'),defaultSkill);assert.equal(await js('document.querySelector(".rune-option.active").dataset.id'),defaultRune);
 assert.match(await js('document.querySelector("[data-action=favorite-build]").textContent'),/已收藏/);
 await click('[data-action=close]');await click('[data-action=navigate][data-route=draft]');await click('[data-action=combination-library]');await search('尼菈');await click('[data-action=build][data-id=Taric][data-role=support]');
 assert.equal(await js('document.querySelector(".loadout-option.active").dataset.id'),'taric-guardian');assert.equal(await js('document.querySelectorAll(".skill-sequence b")[3].textContent'),'Q');await click('[data-action=build-jump][data-section=skills]');await capture('taric-nodes.png');
 await click('[data-action=close]');await click('[data-action=navigate][data-route=settings]');assert.ok(await js('document.querySelector(".catalog-summary").textContent.includes("200 套双人")'));assert.ok(await js('!!document.querySelector(".catalog-review")'));await capture('database-maintenance.png');
 assert.ok((await js('window.buddy.bootstrap()')).state.favorites.some(f=>f.id==='legacy-ashe-taric'));
 const result={passed:true,archiveSha256:release.archiveSha256,productionMain:true,expandedCores:true,expandedRunes:true,skillSelection:true,stableFavorites:true,legacyFavoritesPreserved:true,legacyFavoritesRestored:true,guideRoundTrip:true,taricQ2:true,maintenanceVisible:true,realGameInput:false,realRuneWrites:false,screenshots:root};await fs.writeFile(path.join(root,'database-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));app.quit();
}
run().catch(async e=>{console.error(e);await fs.writeFile(path.join(root,'database-smoke-error.txt'),e.stack).catch(()=>{});app.exit(1);});
