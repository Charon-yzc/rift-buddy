const {app}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const windows=[],root=path.resolve(process.env.RIFT_BUDDY_USER_DATA);app.on('browser-window-created',(_e,win)=>windows.push(win));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let i=0;i<120;i++){const result=await check();if(result)return result;await delay(100);}throw Error(label);}
async function run(){
 const release=JSON.parse(await fs.readFile('release/latest.json','utf8'));
 const source=process.env.RIFT_BUDDY_SOURCE==='1';require(source?path.resolve('electron/main.cjs'):path.join(release.directory,'resources/app.asar/electron/main.cjs'));
 const main=await until(()=>windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/src/index.html')),'Main missing');
 const js=code=>main.webContents.executeJavaScript(code,true);
 await until(()=>js('!!document.querySelector("[data-action=hero-pool]")'),'Hero pool missing');await until(()=>main.isVisible(),'Main hidden');
 const click=async selector=>{assert.equal(await js(`!!document.querySelector(${JSON.stringify(selector)})`),true,selector);await js(`{const target=document.querySelector(${JSON.stringify(selector)});target.focus({preventScroll:true});target.click();}`);};
 const capture=async name=>{await js('Promise.all([...document.images].map(i=>{i.loading="eager";return i.decode().catch(()=>{});})).then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))');await delay(150);await fs.writeFile(path.join(root,name),(await main.webContents.capturePage()).toPNG());};
 await click('[data-action=hero-pool]');for(const id of ['Orianna','Ashe','Nami'])await click(`[data-action=pick-champion][data-id=${id}]`);await click('[data-action=close]');
 await js('const select=document.querySelector("#pool-mode");select.value="only";select.dispatchEvent(new Event("change",{bubbles:true}))');
 await click('[data-action=example]');await click('[data-action=recommend]');await until(()=>js('!!document.querySelector(".result-card")'),'Recommendations missing');
 await click('[data-action=result-detail]');assert.ok(await js('document.querySelector(".drawer-content").textContent.includes("为什么补这几个英雄")'));
 assert.equal(await js('document.querySelectorAll(".contribution").length'),3);await capture('recommendation.png');await click('[data-action=close]');
 await click('[data-action=favorite-result]');await delay(150);
 await click('[data-action=navigate][data-route=hex]');await click('[data-action=pick-hex]');await click('[data-action=pick-champion][data-id=Ashe]');
 await click('[data-action=augment-detail][data-id="1047"]');await click('[data-action=own-augment][data-id="1047"]');
 for(const id of [1048,1002,1141]){await click(`[data-action=augment-detail][data-id="${id}"]`);await click(`[data-action=compare-augment][data-id="${id}"]`);}
 assert.equal(await js('document.querySelectorAll(".compare-card").length'),3);
 assert.ok(await js('document.querySelector(".hex-comparison").textContent.includes("共用暴击属性")'));
 await capture('hex-comparison.png');
 await js('{const select=document.querySelector("#hex-category");select.value="crit";select.dispatchEvent(new Event("change",{bubbles:true}));}');assert.ok(await js('document.querySelectorAll("#augment-grid .augment-card").length>0'));
 await click('[data-action=build][data-mode=hex]');
 await js('document.querySelector(".drawer").scrollTop=280');const drawerScroll=await js('document.querySelector(".drawer").scrollTop');assert.ok(drawerScroll>0);
 await click('[data-action=build-mode][data-mode=rift]');assert.equal(await js('document.querySelector(".drawer").scrollTop'),drawerScroll);
 assert.equal(await js('document.activeElement.dataset.action'),'build-mode');
 await click('[data-action=build-mode][data-mode=hex]');await click('[data-action=open-guide]');
 const guide=await until(()=>windows.find(w=>!w.isDestroyed()&&w.webContents.getURL().endsWith('/src/guide.html')),'Guide missing');
 const guideJS=code=>guide.webContents.executeJavaScript(code,true);await until(()=>guideJS('!!document.querySelector(".next-item")'),'Guide UI missing');
 const snapshot=await guideJS('window.guide.bootstrap()');assert.deepEqual(snapshot.model.selection.compareIds,[1048,1002,1141]);assert.deepEqual(snapshot.model.selection.ownedAugmentIds,[1047]);
 guide.setBounds({x:120,y:100,width:460,height:720});await delay(600);
 await until(async()=>JSON.parse(await fs.readFile(path.join(root,'settings.json'),'utf8')).guide?.bounds?.width===460,'Window position did not persist');
 await guideJS("window.guide.control('hide')");await click('[data-action=close]');
 await click('[data-action=navigate][data-route=settings]');assert.equal(await js('!!document.querySelector("[data-action=auto-live]")'),true);
 const state=JSON.parse(await fs.readFile(path.join(root,'settings.json'),'utf8'));assert.deepEqual(state.preferences.pool,['Orianna','Ashe','Nami']);assert.equal(state.preferences.poolMode,'only');assert.equal(state.favorites.length,1);assert.equal(state.ownedPageId,null);
 const result={passed:true,source:source?'working-tree':'packaged',archiveSha256:source?null:release.archiveSha256,heroPool:true,fixedPicks:true,contributions:true,hexComparison:true,ownedAugments:true,effectFilter:true,drawerScrollAndFocus:true,guideTransfer:true,guideGeometry:true,favoritePreserved:true,noRuneWrite:true,screenshots:root};await fs.writeFile(path.join(root,'upgrade-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));app.quit();
}
run().catch(async error=>{console.error(error);await fs.writeFile(path.join(root,'upgrade-smoke-error.txt'),error.stack).catch(()=>{});app.exit(1);});
