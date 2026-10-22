const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
// These positive Hex contracts require the actual current bundle. Keep them
// separate from historical authored Rift cooperation and its private loadouts.
module.exports=async function currentConfiguration({phase,root,main,windows,js,click,state,until,delay,syncDelay,syncHits}){
 if(phase.startsWith('hex-sync-')){
  await js('window.buddy.openGuide({id:"Ahri",role:"mid",mode:"rift"})');let guide;
  await until(()=>{guide=windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html'));return guide;},'Current guide missing');const gjs=code=>guide.webContents.executeJavaScript(code,true);
  await until(()=>gjs('!!window.guide'),'Current guide preload missing');await gjs('window.guide.control("layout","details")');
  // Canonical round owner, independent chosen augmentation, and all three
  // exact arrays are the original interleaved user-flow contract.
  await js(`(async()=>{await window.buddy.hexRound({operation:'select',hero:'Ashe'});for(const [operation,id]of [['own',1047],['compare',1048],['compare',1002]]){const snapshot=await window.buddy.hexRound(),record=snapshot.manual;await window.buddy.hexRound({...record,operation,id});}return window.buddy.openGuide({id:'Ashe',role:'bottom',mode:'hex',augmentIds:[1048]});})()`);
  await gjs('window.guide.control("main")');await until(()=>js('document.querySelector(".champ-summary")?.textContent.includes("艾希")'),'Hex return missing');
  await click('[data-action=build-condition][data-condition=heal]');
  await until(async()=>{const s=(await state()).guide.selection;return s.conditions.includes('heal')&&s.compareIds?.length===2;},'Hex context lost on sync');
  await click('[data-action=open-guide]');const h=(await state()).guide.selection;assert.deepEqual(h.augmentIds,[1048]);assert.deepEqual(h.compareIds,[1048,1002]);assert.deepEqual(h.ownedAugmentIds,[1047]);
  assert(syncHits()>0,'The delayed production update-guide handler was never called');
  return {hexContextPreserved:true,guideSyncDelay:syncDelay,guideSyncHandlerCalls:syncHits(),augmentIds:h.augmentIds,compareIds:h.compareIds,ownedAugmentIds:h.ownedAugmentIds};
 }
 assert(['spells-prepare','spells-restore'].includes(phase),'Unknown current configuration phase');
 const pair=['SummonerDot','SummonerFlash'],hexPair=['SummonerMana','SummonerFlash'];
 const read=()=>js('[...document.querySelectorAll("[data-build-summoner]")].map(select=>select.value)');
 const change=async(selector,value)=>{await js('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');if(!el)throw Error("Control missing");el.value='+JSON.stringify(value)+';el.dispatchEvent(new Event("change",{bubbles:true}));})()');await delay(110);};
 const preparePair=async ids=>{await change('[data-build-summoner="d"]',ids[0]);await change('[data-build-summoner="f"]',ids[1]);};
 main.webContents.send('open-build',{id:'Ashe',role:'bottom',mode:'rift'});await until(()=>js('!!document.querySelector("[data-build-summoner]")'),'Current spell configuration missing');await delay(100);
 if(phase==='spells-prepare'){
  await preparePair(pair);await click('[data-action=favorite-build]');
  await click('[data-action=build-mode][data-mode=hex]');await until(()=>js('!!document.querySelector("[data-build-summoner] option[value=SummonerMana]")'),'Mayhem spell options missing');
  for(const id of ['SummonerExhaust','SummonerSmite','SummonerTeleport'])assert.equal(await js('!!document.querySelector("[data-build-summoner] option[value='+id+']")'),false,id+' illegal in Mayhem');
  await preparePair(hexPair);await click('[data-action=favorite-build]');await click('[data-action=build-mode][data-mode=rift]');assert.deepEqual(await read(),pair,'Separate mode choice lost');
  await fs.writeFile(path.join(root,'expected-current-spells.json'),JSON.stringify({pair,hexPair}));
 }else{
  const expected=JSON.parse(await fs.readFile(path.join(root,'expected-current-spells.json')));assert.deepEqual(await read(),expected.pair,'Rift D/F changed after restart');
  await click('[data-action=close]');await click('[data-action=navigate][data-route=favorites]');const favorites=(await state()).favorites,index=favorites.findIndex(f=>f.type==='build'&&f.champion==='Ashe'&&f.mode==='hex');assert(index>=0,'Current Hex favorite missing');
  await click('[data-action=open-favorite][data-index="'+index+'"]');assert.deepEqual(await read(),expected.hexPair);
  await click('[data-action=open-guide]');let guide;await until(()=>{guide=windows.find(w=>w.webContents.getURL().endsWith('/src/guide.html'));return guide;},'Restored Hex guide missing');await until(()=>guide.webContents.executeJavaScript('window.guide.bootstrap().then(b=>JSON.stringify(b.model?.summoners.map(s=>s.id))==='+JSON.stringify(JSON.stringify(expected.hexPair))+')',true),'Restored Hex guide lost D/F');
 }
 return {manualDAndF:true,hexModeRestrictions:phase==='spells-prepare',separateModeChoices:true,configurationAndFavorites:true,hexGuideSummonersRestored:phase==='spells-restore',offlineRestart:phase==='spells-restore'};
};
