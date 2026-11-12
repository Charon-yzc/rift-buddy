import test from 'node:test';
import assert from 'node:assert/strict';
import {rebaseWindowState,equalWindowState} from '../src/core/window-state.mjs';

const hero=(id,extra={})=>({id,role:'mid',mode:'rift',runeId:'old',...extra});
const state=()=>({preferences:{buildSource:{region:'global',tier:'emerald_plus'},play:{tempo:'any'}},draft:{soloRole:'mid',slots:[{role:'mid',champion:'Ahri',party:true},{role:'support',champion:null,party:false}]},preparations:[hero('Ahri'),hero('Annie')],favorites:[{id:'old',title:'Old',type:'build'}],excluded:['Zed'],ownedPageId:1});

test('normalized key order is the same draft but changed members and plan duties remain changes',()=>{
 const local={slots:[{role:'mid',champion:'Ahri',party:true}],style:'balanced',scope:'party',soloRole:'',creativePlan:{id:'plan',steps:['保留控制'],members:[{champion:'Ahri',role:'mid'}]}};
 const accepted={slots:[{party:true,champion:'Ahri',role:'mid'}],creativePlan:{members:[{role:'mid',champion:'Ahri'}],steps:['保留控制'],id:'plan'},style:'balanced',scope:'party',soloRole:''};
 assert.notEqual(JSON.stringify(local),JSON.stringify(accepted));assert(equalWindowState(local,accepted));
 for(const changed of [(()=>{const x=structuredClone(accepted);x.slots[0].champion='Annie';return x;})(),(()=>{const x=structuredClone(accepted);x.creativePlan.steps=['先交控制'];return x;})()])assert(!equalWindowState(local,changed));
});

test('idle window accepts the complete confirmed snapshot without mutating it',()=>{
 const base=state(),accepted=state();accepted.preferences.play.tempo='growth';accepted.ownedPageId=8;
 const merged=rebaseWindowState(base,base,accepted);assert.deepEqual(merged,accepted);merged.preferences.play.tempo='changed';assert.equal(accepted.preferences.play.tempo,'growth');
});
test('queued save retains another window hero edits while replaying its own later choices',()=>{
 const base=state(),local=state(),accepted=state();local.preparations[0].laterIds=['3102'];local.preparations[1].runeId='local';accepted.preparations.reverse();accepted.preparations.find(p=>p.id==='Ahri').runeId='remote';accepted.preparations.push(hero('Lux'));accepted.ownedPageId=9;
 const merged=rebaseWindowState(base,local,accepted);assert.deepEqual(merged.preparations.find(p=>p.id==='Ahri'),hero('Ahri',{runeId:'remote',laterIds:['3102']}));assert.equal(merged.preparations.find(p=>p.id==='Annie').runeId,'local');assert.ok(merged.preparations.some(p=>p.id==='Lux'));assert.equal(merged.ownedPageId,9);assert.equal(base.preparations[0].runeId,'old');
});
test('later same-field local edit survives rebase and deletion is explicit',()=>{
 const base=state(),local=state(),accepted=state();local.preparations[0].runeId='latest-local';accepted.preparations[0].runeId='remote';local.preparations=local.preparations.filter(p=>p.id!=='Annie');
 const merged=rebaseWindowState(base,local,accepted);assert.equal(merged.preparations[0].runeId,'latest-local');assert.ok(!merged.preparations.some(p=>p.id==='Annie'));
});
test('favorite and exclusion additions from both windows survive independently',()=>{
 const base=state(),local=state(),accepted=state();local.favorites.push({id:'local',title:'Mine',type:'build'});accepted.favorites.push({id:'remote',title:'Theirs',type:'build'});local.favorites[0].title='Renamed';accepted.favorites[0].version='16.20';local.excluded=['Ahri'];accepted.excluded.push('Lux');
 const merged=rebaseWindowState(base,local,accepted);assert.deepEqual(new Set(merged.favorites.map(f=>f.id)),new Set(['old','local','remote']));assert.deepEqual(merged.favorites.find(f=>f.id==='old'),{id:'old',title:'Renamed',type:'build',version:'16.20'});assert.deepEqual(new Set(merged.excluded),new Set(['Lux','Ahri']));
});
test('draft slots replay by position and preserve remote source/preferences',()=>{
 const base=state(),local=state(),accepted=state();local.draft.slots[0].party=false;accepted.draft.slots[1].champion='Lulu';local.draft.soloRole='top';accepted.preferences.buildSource.region='kr';
 const merged=rebaseWindowState(base,local,accepted);assert.equal(merged.draft.slots[0].party,false);assert.equal(merged.draft.slots[1].champion,'Lulu');assert.equal(merged.draft.soloRole,'top');assert.equal(merged.preferences.buildSource.region,'kr');
});
test('a queued snapshot rebased after another save does not delete remote additions on the next rebase',()=>{
 const submitted=state(),queued=state(),accepted=state();queued.preparations[0].runeId='next';accepted.favorites.push({id:'remote',title:'Other',type:'build'});
 const rebased=rebaseWindowState(submitted,queued,accepted),latest=structuredClone(rebased);latest.preferences.play.tempo='growth';const nextAccepted=structuredClone(rebased);nextAccepted.preparations[1].laterIds=['3102'];
 const next=rebaseWindowState(rebased,latest,nextAccepted);assert.ok(next.favorites.some(f=>f.id==='remote'));assert.deepEqual(next.preparations[1].laterIds,['3102']);assert.equal(next.preferences.play.tempo,'growth');
});

test('concurrent creation of the same hero or favorite preserves independently added fields',()=>{
 const base=state(),local=state(),accepted=state();local.preparations.push({id:'Galio',role:'mid',mode:'rift',summonerIds:['SummonerTeleport','SummonerFlash']});accepted.preparations.push({id:'Galio',role:'mid',mode:'rift',runeId:'aftershock'});local.favorites.push({id:'new',title:'Our lineup',type:'team'});accepted.favorites.push({id:'new',title:'Original title',type:'team',version:'16.20'});
 const merged=rebaseWindowState(base,local,accepted);assert.deepEqual(merged.preparations.find(p=>p.id==='Galio'),{id:'Galio',role:'mid',mode:'rift',runeId:'aftershock',summonerIds:['SummonerTeleport','SummonerFlash']});assert.deepEqual(merged.favorites.find(f=>f.id==='new'),{id:'new',title:'Our lineup',type:'team',version:'16.20'});
});

const partySlots=marked=>['top','jungle','mid','bottom','support'].map(role=>({role,party:marked.includes(role),champion:null,locked:false}));
test('a queued automatic Lobby range cannot add a third member to the accepted two-person new game',()=>{
 const base={draft:{slots:partySlots([]),style:'balanced',scope:'context',soloRole:'',partyRangeMode:'auto'}},local=structuredClone(base);
 local.draft.slots=partySlots(['top','jungle']);
 const accepted={draft:{...base.draft,slots:partySlots(['top','mid']),clientGameId:'530002',partyCount:2,partyAutoCount:2}};
 const merged=rebaseWindowState(base,local,accepted),marked=merged.draft.slots.filter(slot=>slot.party).map(slot=>slot.role);
 assert.equal(marked.length,merged.draft.partyCount,'range marks and their captured member count must remain coupled');
 assert.deepEqual(marked,['top','mid'],'an old automatic Lobby range must yield to accepted new-game ownership');
});

const partyState=(game='',marked=[])=>({...state(),draft:{slots:partySlots(marked),style:'balanced',scope:'party',partyRangeMode:'auto',partyCount:marked.length,partyAutoCount:marked.length,...(game?{clientGameId:game}:{})}});
const partyRoles=value=>value.draft.slots.filter(slot=>slot.party).map(slot=>slot.role);
test('cross-game member range stays atomic while unrelated queued edits replay without mutating inputs',()=>{
 const base=partyState('',[]),local=partyState('',['top','jungle']),accepted=partyState('102',['top','mid']);
 local.preferences.play.tempo='growth';local.favorites.push({id:'mine',title:'Mine'});local.preparations[0].runeId='local-rune';accepted.preferences.buildSource.region='kr';accepted.favorites.push({id:'remote',title:'Remote'});accepted.preparations.push(hero('Lux'));
 Object.assign(accepted.draft.slots[2],{champion:'Lux',locked:true,clientCellId:2,manualPosition:true,partyManual:true});accepted.draft.partyRangeMode='manual';
 const before=structuredClone({base,local,accepted}),merged=rebaseWindowState(base,local,accepted);
 assert.deepEqual(partyRoles(merged),['top','mid']);assert.equal(merged.draft.partyCount,2);assert.equal(merged.draft.partyAutoCount,2);assert.equal(merged.draft.partyRangeMode,'manual');assert.deepEqual(merged.draft.slots[2],accepted.draft.slots[2]);
 assert.equal(merged.preferences.play.tempo,'growth');assert.equal(merged.preferences.buildSource.region,'kr');assert.deepEqual(new Set(merged.favorites.map(f=>f.id)),new Set(['old','mine','remote']));assert.equal(merged.preparations.find(p=>p.id==='Ahri').runeId,'local-rune');assert.ok(merged.preparations.some(p=>p.id==='Lux'));assert.deepEqual({base,local,accepted},before);
});
test('accepted absent range fields delete previous-game or Lobby values without inventing defaults',()=>{
 for(const [oldGame,newGame] of [['101',''],['101','102'],['','102']]){
  const base=partyState(oldGame,['top','mid']),local=partyState(oldGame,['top','jungle','mid']),accepted=partyState(newGame,[]);local.draft.partyRangeMode='manual';local.draft.slots[1].partyManual=true;
  for(const field of ['partyCount','partyAutoCount','partyRangeMode'])delete accepted.draft[field];
  const merged=rebaseWindowState(base,local,accepted);for(const field of ['partyCount','partyAutoCount','partyRangeMode'])assert.equal(Object.hasOwn(merged.draft,field),false);
  assert.deepEqual(partyRoles(merged),[]);assert.ok(merged.draft.slots.every(slot=>!Object.hasOwn(slot,'partyManual')));
 }
});
test('an accepted all-off automatic range keeps zero actual members and its distinct requested size',()=>{
 const base=partyState('',[]),local=partyState('',['top','jungle']),accepted=partyState('102',[]);accepted.draft.partyAutoCount=3;
 const merged=rebaseWindowState(base,local,accepted);assert.deepEqual(partyRoles(merged),[]);assert.equal(merged.draft.partyCount,0);assert.equal(merged.draft.partyAutoCount,3);assert.equal(merged.draft.partyRangeMode,'auto');
});
test('a manual range actually captured in the accepted new game remains explicit',()=>{
 const base=partyState('',[]),local=partyState('102',['top','mid']),accepted=partyState('102',['top','mid']);local.draft.partyRangeMode='manual';local.draft.slots[2].partyManual=true;
 const merged=rebaseWindowState(base,local,accepted);assert.deepEqual(partyRoles(merged),['top','mid']);assert.equal(merged.draft.partyCount,2);assert.equal(merged.draft.partyRangeMode,'manual');assert.equal(merged.draft.slots[2].partyManual,true);
});
for(const game of ['', '101'])test('same-context manual range and independent player lane edits remain granular: '+(game||'offline'),()=>{
 for(let mask=0;mask<32;mask++){
  const selected=['top','jungle','mid','bottom','support'].filter((_,index)=>mask&(1<<index)),base=partyState(game,['top','mid']),local=partyState(game,selected),accepted=structuredClone(base);
  local.draft.partyRangeMode='manual';local.draft.slots.forEach(slot=>{slot.partyManual=true;});Object.assign(local.draft.slots[2],{champion:'Lux',locked:true,manualPosition:true,clientCellId:2});local.draft.playerPosition={role:'mid',cellId:2};
  Object.assign(accepted.draft.slots[4],{champion:'Nami',locked:true,manualPosition:true,clientCellId:0});accepted.preferences.buildSource.region='kr';
  const merged=rebaseWindowState(base,local,accepted);assert.deepEqual(partyRoles(merged),selected);assert.equal(merged.draft.partyCount,selected.length);assert.equal(merged.draft.partyRangeMode,'manual');assert.ok(merged.draft.slots.every(slot=>slot.partyManual));
  assert.equal(merged.draft.slots[4].champion,'Nami');assert.equal(merged.draft.slots[4].clientCellId,0);assert.equal(merged.draft.slots[4].manualPosition,true);assert.equal(merged.draft.slots[2].champion,'Lux');assert.equal(merged.draft.slots[2].clientCellId,2);assert.equal(merged.draft.slots[2].manualPosition,true);assert.deepEqual(merged.draft.playerPosition,{role:'mid',cellId:2});assert.equal(merged.preferences.buildSource.region,'kr');
 }
});
