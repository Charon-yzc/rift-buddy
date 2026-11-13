import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import builds from '../data/hex-builds.json' with {type:'json'};
import reviewedHex from './fixtures/snapshot-16.21/game.json' with {type:'json'};
import reviewedBuilds from './fixtures/snapshot-16.21/hex-builds.json' with {type:'json'};

import {getBuild} from '../src/core/builds.mjs';
import {preparationEquipment} from '../src/core/complete-gear.mjs';
import {configurationChoices} from '../src/core/configuration-choices.mjs';
import {validatePreparation} from '../src/core/preparation.mjs';
import {hexPartyCells,hexPartyDraft} from '../src/core/hex-party-draft.mjs';
import {hexChampionStatistics,normalizeHexChampionStatistics} from '../src/core/hex-champion-statistics.mjs';
import {pickEligibilityContext} from '../src/core/pick-eligibility.mjs';
import {hexDraftView} from '../src/hex-draft-view.mjs';
import {hexConfigurationView} from '../src/hex-configuration-view.mjs';
import {companionView} from '../src/companion-view.mjs';
import {hexMicroHint} from '../src/core/hex-micro-hint.mjs';
const data={...game,hexBuilds:builds.entries},key=id=>data.champions.find(h=>h.id===id).key;
const client=()=>({connected:true,phase:'ChampSelect',mode:{id:'hex'},party:{members:[{cellId:0},{cellId:2},{cellId:99}]},session:{gameId:1,localPlayerCellId:0,myTeam:['Lux','Ashe','Veigar','Sona','Jinx'].map((id,cellId)=>({cellId,championId:key(id)})),bench:{championIds:['Malphite','Xerath','Lux','Ashe','Sona'].map(key)}}});
test('party scope uses current public cells, keeps ordinary teammates fixed and never revives saved lane membership',()=>{
 const c=client(),before=structuredClone(c),model=hexPartyDraft({data,client:c});
 assert.deepEqual(hexPartyCells(c),[0,2]);assert(model.lineups.length>0);
 for(const row of model.lineups){assert.deepEqual(row.members.map(p=>p.cellId),[0,2]);assert.equal(new Set(row.members.map(p=>p.hero.id)).size,2);assert(!row.members.some(p=>['Ashe','Sona','Jinx'].includes(p.hero.id)));assert.equal(row.pending,true);}
 assert.equal(model.board.find(r=>r.hero.id==='Lux').selected,'self');assert.equal(model.board.find(r=>r.hero.id==='Ashe').selected,'teammate');
 assert.deepEqual(hexPartyCells(c,[{clientCellId:2,partyManual:true,party:false},{clientCellId:0,partyManual:true,party:false}]),[0]);assert.deepEqual(c,before);
});
test('fresh local eligibility does not borrow ownership for friends, and stale restrictions are not reused',()=>{
 const c=client();c.eligibility={context:pickEligibilityContext(c.session),localPlayerCellId:0,receivedAt:new Date().toISOString(),pickable:[key('Lux')],disabled:[key('Malphite')]};
 let model=hexPartyDraft({data,client:c});assert(model.lineups.every(r=>r.members.find(p=>p.self).hero.id==='Lux'));assert(model.lineups.some(r=>r.members.some(p=>!p.self&&p.hero.id==='Xerath')));assert(!model.lineups.some(r=>r.members.some(p=>p.hero.id==='Malphite')));
 c.eligibility.receivedAt=new Date(Date.now()-60000).toISOString();model=hexPartyDraft({data,client:c});assert(model.lineups.some(r=>r.members.some(p=>p.hero.id==='Malphite')));
 for(const next of [{...c,connected:false},{...c,phase:'InProgress'},{...c,mode:{id:'rift'}}])assert.equal(hexPartyDraft({data,client:next}).lineups.length,0);
});
test('unavailable current statistics never turn archived percentages into current hero or team rates',()=>{
 const unavailable={...data,augmentError:'offline'};assert.equal(hexChampionStatistics(unavailable),null);const html=hexDraftView({data:unavailable,client:client()});
 assert.doesNotMatch(html,/data-win-rate="[0-9]|阵容胜率\s*[0-9]|样本\s*[1-9]/);assert.match(html,/待核/);
});
test('unchanged current kit evidence gives frontline alternatives a real coverage score; changed sources stay pending',()=>{
 const c=client();c.party.members=[{cellId:0}];
 c.session.myTeam=['Ahri','Ashe','Ezreal','Sona','Jinx'].map((id,cellId)=>({cellId,championId:key(id)}));
 c.session.bench.championIds=['Teemo','Malphite','Garen','Trundle'].map(key);
 const fit=bundle=>new Map(hexPartyDraft({data:bundle,client:c}).lineups.map(row=>[row.members[0].hero.id,row.fit]));
 const current=fit(data);assert.deepEqual([current.get('Malphite').minimum,current.get('Malphite').maximum],[100,100]);
 assert.deepEqual(current.get('Teemo').missing,['承伤手段']);assert.equal(current.get('Teemo').minimum,70);
 const changed=structuredClone(data);changed.champions.find(hero=>hero.id==='Malphite').mechanicSource.character.sha256='0'.repeat(64);
 const uncertain=fit(changed).get('Malphite');assert.deepEqual([uncertain.minimum,uncertain.maximum],[70,100]);assert.deepEqual(uncertain.pending,['承伤手段']);
 const html=hexDraftView({data,client:c});assert.match(html,/基础机制覆盖，非胜率/);assert.match(html,/契合 100/);
});
// These synthetic transport records test parser validation, not live evidence.
test('hero statistics parser keeps unknown samples and rejects changed source, patch, future time and percentage units',()=>{
 const row={championId:String(key('Lux')),version:data.patch,date:'2026-11-08',winRate:.51,numGames:null,numWinGames:null,source:'tencent',region:'CN'},options={champions:data.champions,patch:data.patch,fetchedAt:'2026-11-09T00:00:00Z'};
 assert.equal(normalizeHexChampionStatistics([row],options).rows[0].samples,null);
 for(const changed of [{...row,version:'16.20'},{...row,numGames:1000},{...row,source:'opgg'},{...row,date:'2026-11-10'},{...row,winRate:51}])assert.throws(()=>normalizeHexChampionStatistics([changed],options));
});
test('unknown owned records retain scoped removal and compact hints distinguish owned, offered and suggested',()=>{
 const hero=data.champions.find(h=>h.id==='Lux'),round={hero:hero.id,context:'stale-owned',revision:8,owned:[999999],options:[]};
 for(const value of [data,{...data,augmentError:'offline'}]){
  const html=hexConfigurationView({data:value,hero,round});assert.match(html,/data-hex-context="stale-owned"/);assert.match(html,/data-action="remove-owned"[^>]*data-id="999999"/);
 }
 const entry={id:1,core:true,name:'Protocol icon',brief:'Requires an actual purchase'};
 assert.match(hexMicroHint({},entry,'augment').brief,/^需选到。/);assert.match(hexMicroHint({},{...entry,offered:true},'augment').brief,/^本轮若选。/);assert.match(hexMicroHint({},{...entry,owned:true},'augment').brief,/^已选。/);
});

// Keep the snapshot's real equipment while omitting augments to exercise the source-only branch.
const sourceData={...reviewedHex,augments:[],hexBuilds:{Camille:reviewedBuilds.entries.Camille}};
const sourceHero=sourceData.champions.find(h=>h.id==='Camille');
const sourceSelection={id:sourceHero.id,role:'top',mode:'hex'};
const sourceBuild=getBuild(sourceHero,sourceSelection.role,sourceData,sourceSelection);
const sourceRound={hero:sourceHero.id,context:'source-reference',revision:1,owned:[],options:[]};
const sourceClient=()=>{const c=client();c.session.myTeam[0].championId=sourceHero.key;return c;};
const sourceRows=html=>[...html.matchAll(/<section class="configuration-choice hex-source-choice ([^"]*)" data-source-config="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)];

test('Hex shows the first three distinct source equipment choices and uses the actual configuration IDs',()=>{
 const selection=validatePreparation({...sourceSelection,summonerIds:[...sourceBuild.summoners].reverse()});
 const build=getBuild(sourceHero,selection.role,sourceData,selection),choices=configurationChoices(sourceData,selection,build);
 const gear=choice=>preparationEquipment(sourceData,choice.build,choice.selection).map(item=>String(item.id));
 assert.deepEqual(choices.slice(0,2).map(choice=>choice.id),['current','default']);
 assert.deepEqual(gear(choices[0]),gear(choices[1]));
 const html=companionView({data:sourceData,client:sourceClient(),tab:'plan',hexRound:sourceRound,plan:{selection,build}});
 const rows=sourceRows(html);
 assert.equal(rows.length,3);
 assert.equal(rows[0][1],'is-current');
 assert.equal(rows[0][2],'current');
 assert.doesNotMatch(rows[0][3],/data-action="configuration-switch"/);
 assert.equal((html.match(/class="hex-source-meta"/g)||[]).length,1);
 assert.doesNotMatch(html,/class="hex-source-more"/);
 assert(html.indexOf('class="hex-source-reference"')<html.indexOf('class="hex-config-pools"'));
 const displayedGear=rows.map(([,current,id,body],index)=>{
  const choice=choices.find(choice=>choice.id===id);
  assert(choice);
  const ids=[...body.matchAll(/data-item-id="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(ids,gear(choice));
  if(index){
   assert.equal(current,'');
   const button=body.match(/<button[^>]*data-action="configuration-switch"[^>]*>/)?.[0];
   assert(button?.includes(`data-config="${id}" data-plan="Camille:top:hex"`));
   assert.doesNotMatch(button,/\bdisabled\b/);
  }
  return ids.join(',');
 });
 assert.equal(new Set(displayedGear).size,3);
});

test('Hex source equipment requires current matching references and keeps peer choices read only',()=>{
 const view=(build,selection=sourceSelection,c=sourceClient())=>companionView({data:sourceData,client:c,tab:'plan',hexRound:sourceRound,plan:{selection,build}});
 for(const reference of [null,{...sourceBuild.reference,patch:'16.20'},{...sourceBuild.reference,mode:'rift'},{...sourceBuild.reference,region:'kr'}]){
  const html=view({...sourceBuild,reference});
  assert.doesNotMatch(html,/class="hex-source-reference"/);
  assert.match(html,/暂无配套方案/);
 }
 for(const html of [view(sourceBuild,{...sourceSelection,readOnly:true}),view(sourceBuild,sourceSelection,client())]){
  const buttons=sourceRows(html).flatMap(row=>[...row[3].matchAll(/<button[^>]*data-action="configuration-switch"[^>]*>/g)]);
  assert.equal(buttons.length,2);
  assert(buttons.every(match=>/\bdisabled\b/.test(match[0])));
 }
});

test('existing reviewed Hex paired routes take precedence over source equipment',()=>{
 const hero=reviewedHex.champions.find(h=>h.id==='Hecarim');
 const input={data:reviewedHex,hero,round:{hero:hero.id,context:'historical-reviewed',revision:1,owned:[3078],options:[]}};
 const original=hexConfigurationView(input);
 assert.deepEqual([...original.matchAll(/data-hex-route="([^"]+)"/g)].map(match=>match[1]),['Hecarim-3078','Hecarim-1311','Hecarim-3049','Hecarim-3081']);
 assert.equal(hexConfigurationView({...input,sourceReference:'<p>Source fallback</p>'}),original);
});

test('Hex lineup and room tabs do not build the configuration workbench',()=>{
 const round={...sourceRound,get owned(){assert.fail('Workbench read on a different tab');}};
 const plan={selection:sourceSelection,build:{...sourceBuild,get reference(){assert.fail('Source choices read on a different tab');}}};
 for(const tab of ['recommend','room']){
  const html=companionView({data:sourceData,client:sourceClient(),tab,hexRound:round,plan});
  assert.doesNotMatch(html,/class="hex-configuration-workspace"|class="hex-source-reference"/);
 }
});
