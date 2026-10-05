const {app}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const windows=[],root=path.resolve(process.env.RIFT_BUDDY_USER_DATA),delay=ms=>new Promise(r=>setTimeout(r,ms));app.on('browser-window-created',(_e,w)=>windows.push(w));
async function until(check,label){for(let n=0;n<150;n++){const v=await check();if(v)return v;await delay(100);}throw Error(label);}
async function run(){
 const source=process.env.RIFT_BUDDY_SOURCE==='1',release=JSON.parse(await fs.readFile('release/latest.json','utf8')),base=source?path.resolve('.'):path.join(release.directory,'resources/app.asar');
 const data=JSON.parse(await fs.readFile(path.join(base,'data/game.json'))),ref=JSON.parse(await fs.readFile(path.join(base,'data/builds.json'))).entries['Ashe:bottom'];
 const actualNow=Date.now,staleAt=Date.parse(ref.fetchedAt)+86400001;Date.now=()=>Math.max(actualNow(),staleAt); // Exercise the >24 h refresh branch without changing the system clock.
 const html=require('./build-source-fixture.cjs')(ref,data);let allowBuild=false,requests=0;
 global.fetch=async(url)=>{const u=String(url);if(u==='https://ddragon.leagueoflegends.com/api/versions.json')return {ok:true,json:async()=>[data.version]};if(u.startsWith('https://op.gg/lol/champions/ashe/build/adc')){requests++;if(!allowBuild)throw Error('测试离线');return {ok:true,text:async()=>html};}throw Error('未允许的测试网络来源 '+new URL(u).hostname);};
 require(path.join(base,'electron/main.cjs'));const main=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/index.html')),'Main missing'),js=c=>main.webContents.executeJavaScript(c,true);
 await until(()=>js('!!document.querySelector("[data-action=guide-current]")'),'Main UI missing');await js('window.buddy.openGuide({id:"Ashe",role:"bottom",mode:"rift"})');
 const guide=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html')),'Guide missing'),gjs=c=>guide.webContents.executeJavaScript(c,true);await until(()=>gjs('!!document.querySelector(".next-item")'),'Guide UI missing');
 await js('window.buddy.updateData()');await until(()=>gjs('window.guide.bootstrap().then(s=>s.model.status.build.includes("刷新未完成"))'),'Automatic failure not shown');assert.equal(requests,1);
 allowBuild=true;await js('window.buddy.refreshBuild("Ashe","bottom")');const current=await gjs('window.guide.bootstrap()');assert.ok(!current.model.status.build.includes('未完成'));assert.ok(current.model.status.build.includes(data.patch));assert.equal(requests,2);
 // Actual offline window control must advance after the chosen shoe is marked.
 const shoe=current.model.shoppingTargets.find(i=>i.kind==='鞋子');await gjs(`window.guide.control('purchase-target',${JSON.stringify(shoe.id)})`);assert.equal((await gjs('window.guide.bootstrap()')).model.next.id,shoe.id);await gjs(`window.guide.control('item',${JSON.stringify(shoe.id)})`);const after=await gjs('window.guide.bootstrap()');assert.notEqual(after.model.next.id,shoe.id);assert.equal(after.model.purchaseTarget,'');
 const persisted=JSON.parse(await fs.readFile(path.join(root,'settings.json')));assert.equal(persisted.guide.purchaseTarget,undefined);assert.ok(persisted.guide.completedItems.includes(shoe.id));assert.equal(persisted.ownedPageId,null);
 const result={passed:true,source:source?'working-tree':'packaged',archiveSha256:source?null:release.archiveSha256,realUpdateDataHandler:true,autoPreparedRefreshFailure:true,manualRefreshClearsGuideError:true,offlineTargetMarkAdvances:true,networkMocked:true,actualRuneWrites:false,userSettingsIsolated:true};await fs.writeFile(path.join(root,'prepared-refresh-smoke.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));app.quit();
}
run().catch(e=>{console.error(e);app.exit(1);});
