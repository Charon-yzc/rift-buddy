import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import builds from '../data/hex-builds.json' with {type:'json'};

import {hexPartyCells,hexPartyDraft} from '../src/core/hex-party-draft.mjs';
import {hexChampionStatistics,normalizeHexChampionStatistics} from '../src/core/hex-champion-statistics.mjs';
import {pickEligibilityContext} from '../src/core/pick-eligibility.mjs';
import {hexDraftView} from '../src/hex-draft-view.mjs';
import {hexConfigurationView} from '../src/hex-configuration-view.mjs';
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
 assert.equal(hexChampionStatistics(data),null);const html=hexDraftView({data,client:client()});
 assert.doesNotMatch(html,/data-win-rate="[0-9]|阵容胜率\s*[0-9]|样本\s*[1-9]/);assert.match(html,/待核/);
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
