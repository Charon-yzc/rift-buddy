// Synthetic public postgame data only: no account records or client writes.
const assert=require('node:assert/strict');
// Real backend kill events carry per-source damage rows; the events tab renders them as tables.
const damage=(seed,count)=>Array.from({length:count},(_,index)=>({participantId:index%3===0?0:(seed+index)%10+1,type:index%3===0?'TOWER':'OTHER',name:index%3===0?'Turret':'',basic:index%4===0,spellSlot:index%4,physicalDamage:120+index*37,magicDamage:80+index*23,trueDamage:index*7}));
exports.timeline=()=>({frames:Array.from({length:36},(_,minute)=>({
 timestamp:minute*60000,
 participantFrames:Object.fromEntries(Array.from({length:10},(_,index)=>{const id=index+1;return [id,{participantId:id,totalGold:500+minute*310,currentGold:minute*50,minionsKilled:minute*5,jungleMinionsKilled:0,level:Math.min(18,1+Math.floor(minute/2)),xp:minute*400,position:{x:3000+index*500,y:4000+index*300},championStats:{health:1800,healthMax:2000,attackDamage:180,abilityPower:120,armor:80,magicResist:60},damageStats:{totalDamageDoneToChampions:minute*600,totalDamageTaken:minute*500}}];})),
 events:Array.from({length:18},(_,index)=>{const id=index%10+1,timestamp=minute*60000+index*2000;
  return index<8?{type:'ITEM_PURCHASED',timestamp,participantId:id,itemId:1001}:index<12?{type:'SKILL_LEVEL_UP',timestamp,participantId:id,skillSlot:minute%3+1,levelUpType:'NORMAL'}:index<15?{type:'WARD_PLACED',timestamp,creatorId:id,wardType:'YELLOW_TRINKET',position:{x:6000,y:7000}}:{type:'CHAMPION_KILL',timestamp,killerId:id,victimId:(id+4)%10+1,assistingParticipantIds:[(id+1)%10+1],position:{x:6000,y:7000},victimDamageReceived:damage(minute+index,12),victimDamageDealt:damage(minute+index+5,9)};
 }),
}))});

exports.measure=async({main,js,until,click})=>{
 const elapsed=[];
 const measure=async(id,section)=>{
  const selector=`[data-action="history-detail"][data-id="${id}"][data-section="${section}"]`;
   const timing=await js(`(async()=>{const start=performance.now();document.querySelector(${JSON.stringify(selector)}).click();const handlerMs=performance.now()-start;await new Promise(resolve=>setTimeout(resolve,0));return {handlerMs,settledMs:performance.now()-start};})()`);
  await until(()=>js(`!!document.querySelector('#history-tab-${id}-${section}[aria-selected="true"]')&&!document.querySelector('[data-history-match="${id}"] [role="status"]')`),'Detail tab failed to settle: '+section);
   elapsed.push({id,section,handlerMs:Math.round(timing.handlerMs*10)/10,settledMs:Math.round(timing.settledMs*10)/10});
 };
 await click('[data-action=history-detail][data-id="1"][data-section=toggle]');
 await until(()=>js('!!document.querySelector("#history-tab-1-summary")&&!document.querySelector(".history-details [role=status]")'),'Initial detail failed');
 // Several expanded event-heavy cards: every later click must not re-render them.
 for(const id of [3,4]){await click(`[data-action=history-detail][data-id="${id}"][data-section=toggle]`);await until(()=>js(`!!document.querySelector('#history-tab-${id}-summary')`),'Extra game failed');await measure(id,'events');}
 await measure(1,'events');
 main.webContents.debugger.attach('1.3');
 await main.webContents.debugger.sendCommand('Profiler.enable');
 await main.webContents.debugger.sendCommand('Profiler.start');
 await js(`window.__historyUnchanged=document.querySelector('[data-history-match="2"]');window.__historyProfile=document.querySelector('.history-profile')`);
 for(const section of ['builds','timeline','stats','runes','summary','events','builds','summary'])await measure(1,section);
 const identity=await js(`({unrelatedCard:document.querySelector('[data-history-match="2"]')===window.__historyUnchanged,profile:document.querySelector('.history-profile')===window.__historyProfile})`);
 assert.deepEqual(identity,{unrelatedCard:true,profile:true},'Cached detail switches must retain unrelated page nodes');
 assert(elapsed.every(sample=>sample.handlerMs<120&&sample.settledMs<300),'Cached detail click exceeded interaction budget: '+JSON.stringify(elapsed));
 const radar=await js(`(async()=>{const card=document.querySelector('[data-history-match="1"]'),details=card.querySelector('.history-comparison');details.open=true;const select=details.querySelector('select');select.focus();select.value=select.options[1].value;select.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,0));const after=document.querySelector('[data-history-match="1"] .history-comparison');return {open:after.open,focus:after.contains(document.activeElement)};})()`);
 assert.deepEqual(radar,{open:true,focus:true},'Radar controls must remain expanded and focused after a selection');
 await measure(1,'events');
 const multi=await js(`(async()=>{const card=document.querySelector('[data-history-match="1"]'),select=card.querySelector('select[multiple]'),details=select.closest('details');details.open=true;select.focus();select.options[0].selected=true;select.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,0));const after=document.querySelector('[data-history-match="1"] select[multiple]');return {open:after.closest('details').open,focus:document.activeElement===after};})()`);
 assert.deepEqual(multi,{open:true,focus:true},'Event multiselect must remain expanded and focused');
 await measure(1,'summary');
 const openStart=Date.now();await click('[data-action=history-detail][data-id="2"][data-section=toggle]');
 await until(()=>js(`!!document.querySelector('#history-tab-2-summary')&&!document.querySelector('[data-history-match="2"] [role=status]')`),'Second game failed');
 const openOtherMs=Date.now()-openStart;
 const {profile}=await main.webContents.debugger.sendCommand('Profiler.stop');main.webContents.debugger.detach();
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),counts=new Map();
 for(const id of profile.samples||[]){const frame=nodes.get(id)?.callFrame;if(!frame)continue;const name=(frame.url.split('/').at(-1)||'native')+':'+(frame.functionName||'(anonymous)');counts.set(name,(counts.get(name)||0)+1);}
 const playerStart=Date.now();await click('[data-history-match="1"] [data-action="history-player"][data-puuid="fixture-friend-player-2"]');
 await until(()=>js('document.querySelectorAll(".history-tabs [role=tab]").length===2&&!document.querySelector(".history-loading")'),'Other player history failed');
 return {elapsed,identity,radar,multi,openOtherMs,openPlayerMs:Date.now()-playerStart,topCpuSamples:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,18)};
};
