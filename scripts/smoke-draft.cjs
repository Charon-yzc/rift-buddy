const {app}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const windows=[],root=path.resolve(process.env.RIFT_BUDDY_USER_DATA);app.on('browser-window-created',(_e,w)=>windows.push(w));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label){for(let i=0;i<120;i++){if(await check())return;await delay(100);}throw Error(label);}
async function run(){
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=JSON.parse(await fs.readFile('release/latest.json','utf8'));
 require(source?path.resolve('electron/main.cjs'):path.join(release.directory,'resources/app.asar/electron/main.cjs'));
 await until(()=>windows.some(w=>w.webContents.getURL().endsWith('/src/index.html')),'Main missing');
 const main=windows.find(w=>w.webContents.getURL().endsWith('/src/index.html')),js=code=>main.webContents.executeJavaScript(code,true);
 await until(()=>js('!!document.querySelector("[data-action=draft-scope]")'),'Draft scope missing');
 const click=async selector=>{assert.ok(await js(`!!document.querySelector(${JSON.stringify(selector)})`),selector);await js(`{const target=document.querySelector(${JSON.stringify(selector)});target.focus({preventScroll:true});target.click();}`);};
 const state=()=>js('window.buddy.bootstrap().then(b=>b.state)');
 const settled=async()=>{await delay(120);return state();};
 const drag=async(from,to)=>{
  await js(`{const source=document.querySelector('[data-drag-role="${from}"]'),target=document.querySelector('[data-drop-role="${to}"]'),data=new DataTransfer();source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:data}));target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data}));target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));}`);await delay(300);
 };
 const capture=async name=>{await js('Promise.all([...document.images].map(i=>{i.loading="eager";return i.decode().catch(()=>{});})).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');await delay(150);await fs.writeFile(path.join(root,name),(await main.webContents.capturePage()).toPNG());};
 await click('[data-action=example]');await drag('top','mid');let snapshot=await settled();
 assert.equal(snapshot.draft.slots[0].champion,null);assert.equal(snapshot.draft.slots[2].champion,'Garen');assert.equal(snapshot.draft.slots[0].party,false);assert.equal(snapshot.draft.slots[2].party,true);
 await drag('mid','jungle');snapshot=await settled();assert.equal(snapshot.draft.slots[1].champion,'Garen');assert.equal(snapshot.draft.slots[2].champion,'LeeSin');
 await click('[data-action=move-slot][data-role=jungle]');await click('[data-action=move-confirm][data-role=top]');snapshot=await settled();assert.equal(snapshot.draft.slots[0].champion,'Garen');
 await click('[data-action=example]');await click('[data-action=recommend]');await until(()=>js('document.querySelectorAll(".result-card").length===3'),'Worker recommendation missing');
 assert.equal(await js('document.querySelectorAll(".card-members .member").length'),9);await click('[data-action=result-detail]');assert.equal(await js('document.querySelectorAll(".lineup-detail .member").length'),5);await click('[data-action=close]');
 await click('[data-action=draft-scope][data-scope=party]');await click('[data-action=recommend]');await until(()=>js('document.querySelectorAll(".result-card").length===3'),'Party recommendations missing');
 await click('[data-action=result-detail]');assert.equal(await js('document.querySelectorAll(".lineup-detail .member").length'),3);await click('[data-action=close]');
 await click('[data-action=draft-scope][data-scope=bot]');await click('[data-action=recommend]');await until(()=>js('document.querySelectorAll(".result-card").length===3'),'Bot recommendations missing');
 assert.equal(await js('document.querySelectorAll(".card-members .member").length'),6);await capture('bot-recommendations.png');
 const first=await js('document.querySelector(".card-members").textContent');await click('[data-action=reroll]');await until(()=>js(`document.querySelector(".card-members")?.textContent!==${JSON.stringify(first)}`),'Reroll did not change pairs');
 await click('[data-action=combination-library]');assert.equal(await js('document.querySelectorAll(".combo-row").length'),155);
 await js('{const input=document.querySelector("#combo-search");input.value="女枪";input.dispatchEvent(new Event("input",{bubbles:true}));}');assert.equal(await js('document.querySelectorAll(".combo-row").length'),4);await capture('combination-library.png');
 await click('[data-action=combo-kind][data-kind=links]');await js('{const input=document.querySelector("#combo-search");input.value="";input.dispatchEvent(new Event("input",{bubbles:true}));}');assert.equal(await js('document.querySelectorAll(".combo-row").length'),127);
 await click('[data-action=combo-kind][data-kind=duos]');await click('[data-action=load-duo][data-id=feather-dance]');snapshot=await settled();assert.equal(snapshot.draft.slots[3].champion,'Xayah');assert.equal(snapshot.draft.slots[4].champion,'Rakan');assert.equal(snapshot.draft.scope,'bot');assert.equal(snapshot.draft.slots[0].champion,'Garen');
 assert.equal(snapshot.ownedPageId,null);
 await click('[data-action=toggle-lock][data-role=bottom]');await click('[data-action=toggle-lock][data-role=support]');await click('[data-action=recommend]');await click('[data-action=draft-scope][data-scope=party]');await delay(1200);
 assert.equal(await js('document.querySelectorAll(".result-card").length'),0,'cancelled worker must not restore obsolete results');
 const result={passed:true,source:source?'working-tree':'packaged',archiveSha256:source?null:release.archiveSha256,dragEmpty:true,dragSwap:true,ownershipStays:true,clickMove:true,threeScopes:true,worker:true,cancelStaleResults:true,reroll:true,librarySearch:true,duos:155,links:127,noRuneWrite:true,screenshots:root};
 await fs.writeFile(path.join(root,'draft-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));app.quit();
}
run().catch(async e=>{console.error(e);await fs.writeFile(path.join(root,'draft-smoke-error.txt'),e.stack).catch(()=>{});app.exit(1);});
