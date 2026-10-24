import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {hexPartyCells,hexPartyDraft} from '../src/core/hex-party-draft.mjs';
import {hexChampionStatistics,normalizeHexChampionStatistics} from '../src/core/hex-champion-statistics.mjs';
import {pickEligibilityContext} from '../src/core/pick-eligibility.mjs';
import {hexDraftView} from '../src/hex-draft-view.mjs';
import {hexConfigurationView} from '../src/hex-configuration-view.mjs';
import {gameTooltipView} from '../src/game-tooltip-view.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {hexMicroHint} from '../src/core/hex-micro-hint.mjs';
import {hexPlayerRoutes} from '../src/core/hex-routes.mjs';
import {hexPairedMicroRoutes} from '../src/core/hex-micro-routes.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
data.hexBuilds=JSON.parse(await fs.readFile(new URL('../data/hex-builds.json',import.meta.url),'utf8')).entries;
const key=id=>data.champions.find(h=>h.id===id).key;
const client=()=>({connected:true,phase:'ChampSelect',mode:{id:'hex'},party:{members:[{cellId:0},{cellId:2},{cellId:99}]},session:{gameId:1,localPlayerCellId:0,myTeam:['Lux','Ashe','Veigar','Sona','Jinx'].map((id,cellId)=>({cellId,championId:key(id)})),bench:{championIds:['Malphite','Xerath','Lux','Ashe','Sona'].map(key)}}});
test('party lineups use current cells and shared bench, excluding ordinary teammates and duplicate heroes',()=>{
 const c=client(),before=structuredClone(c),m=hexPartyDraft({data,client:c});
 assert.deepEqual(hexPartyCells(c),[0,2]);assert(m.lineups.length>0);
 for(const row of m.lineups){assert.deepEqual(row.members.map(p=>p.cellId),[0,2]);assert.equal(new Set(row.members.map(p=>p.hero.id)).size,2);assert(!row.members.some(p=>['Ashe','Sona','Jinx'].includes(p.hero.id)));}
 assert.equal(m.board.find(r=>r.hero.id==='Lux').selected,'self');assert.equal(m.board.find(r=>r.hero.id==='Veigar').selected,'party');assert.equal(m.board.find(r=>r.hero.id==='Ashe').selected,'teammate');
 assert.deepEqual(c,before);assert.deepEqual(hexPartyCells(c,[{clientCellId:2,partyManual:true,party:false},{clientCellId:0,partyManual:true,party:false}]),[0]);
 const solo=hexPartyDraft({data,client:{...c,party:{members:[]}}});assert(solo.lineups.every(r=>r.members.length===1));
});
test('partial fresh eligibility excludes disabled heroes but never lends our owned list to friends',()=>{
 const c=client();c.eligibility={context:pickEligibilityContext(c.session),localPlayerCellId:0,receivedAt:new Date().toISOString(),pickable:[key('Lux')],disabled:[key('Malphite')]};
 let m=hexPartyDraft({data,client:c});assert(m.lineups.every(r=>r.members.find(p=>p.self).hero.id==='Lux'));assert(m.lineups.some(r=>r.members.some(p=>!p.self&&p.hero.id==='Xerath')));assert(!m.lineups.some(r=>r.members.some(p=>p.hero.id==='Malphite')));
 c.eligibility.pickable=null;m=hexPartyDraft({data,client:c});assert(!m.lineups.some(r=>r.members.some(p=>p.hero.id==='Malphite')));
 c.eligibility.receivedAt=new Date(Date.now()-60000).toISOString();assert(hexPartyDraft({data,client:c}).lineups.some(r=>r.members.some(p=>p.hero.id==='Malphite')));
 for(const next of [{...c,connected:false},{...c,phase:'InProgress'},{...c,mode:{id:'rift'}}]){const m=hexPartyDraft({data,client:next});assert.equal(m.lineups.length,0);assert(!m.board.some(r=>r.available||r.selected));}
});
test('current Mayhem statistics sort every hero by actual win rate without inventing sample counts or team probability',()=>{
 const ref=hexChampionStatistics(data);assert.equal(ref.rows.length,data.champions.length);assert(ref.rows.every(r=>r.samples===null));
 const m=hexPartyDraft({data,client:client()});assert.equal(m.board[0].hero.id,'Hecarim');assert.equal(m.board[0].statistics.winRate,.6092);
 assert(m.board.every((r,i)=>!i||r.statistics.winRate<=m.board[i-1].statistics.winRate));
 for(const change of [r=>r.mode='aram',r=>r.patch='16.20',r=>r.rows[0].winRate=1.01,r=>r.rows[0].samples=315,r=>r.sourceUrl='https://example.com',r=>r.rows.push({...r.rows[0]})]){const copy=structuredClone(ref);change(copy);assert.equal(hexChampionStatistics({...data,hexChampionStats:copy}),null);}
 assert.equal(hexChampionStatistics({...data,patch:'16.22',version:'16.22.1'}),null);
 const html=hexDraftView({data,client:client()});assert.equal((html.match(/class="hex-ranking-hero /g)||[]).length,173);assert.match(html,/样本量未提供/);assert.doesNotMatch(html,/阵容胜率\s*\d/);
});
test('source parser rejects ARAM, previous patches and claimed samples instead of converting them silently',()=>{
 const row={championId:String(key('Lux')),version:data.patch,date:'2026-10-22',winRate:.51,numGames:null,numWinGames:null,source:'tencent',region:'CN'},options={champions:data.champions,patch:data.patch,fetchedAt:'2026-10-23T05:00:00Z'};
 assert.equal(normalizeHexChampionStatistics([row],options).rows[0].samples,null);
 for(const changed of [{...row,version:'16.20'},{...row,numGames:1000},{...row,source:'opgg'},{...row,date:'2026-10-24'},{...row,winRate:51}])assert.throws(()=>normalizeHexChampionStatistics([changed],options));
});
test('partial hero statistics remain visible but never invent missing rates for lineup sorting',()=>{
 const c=client(),partial=structuredClone(hexChampionStatistics(data));partial.rows=partial.rows.filter(r=>r.hero==='Lux');
 const projected=hexPartyDraft({data:{...data,hexChampionStats:partial},client:c}),absent=hexPartyDraft({data:{...data,hexChampionStats:{...partial,patch:'16.20'}},client:c});
 assert(projected.board.find(r=>r.hero.id==='Lux').statistics);assert.equal(projected.board.find(r=>r.hero.id==='Malphite').statistics,null);
 assert.deepEqual(projected.lineups.map(r=>r.members.map(p=>p.hero.id)),absent.lineups.map(r=>r.members.map(p=>p.hero.id)));
});
test('five-party search retains different hero sets and preserves a constrained local assignment',()=>{
 const c=client();c.party.members=c.session.myTeam.map(p=>({cellId:p.cellId}));c.session.localPlayerCellId=4;c.session.bench.championIds=['Hecarim','Yasuo','Malphite','Xerath','Karma','Trundle','Teemo'].map(key);
 c.eligibility={context:pickEligibilityContext(c.session),localPlayerCellId:4,receivedAt:new Date().toISOString(),pickable:[key('Xerath')],disabled:[]};
 const m=hexPartyDraft({data,client:c});assert(m.lineups.length>=3);const seen=new Set();
 for(const row of m.lineups){assert.equal(row.members.length,5);assert(['Jinx','Xerath'].includes(row.members.find(p=>p.self).hero.id));const ids=row.members.map(p=>p.hero.id).sort().join(',');assert(!seen.has(ids));seen.add(ids);}
});
test('pending trait fields remain pending and never act as absent mechanisms in party sorting',()=>{
 const c=client();c.session.bench.championIds=[key('Akshan')];c.party.members=[];
 const row=hexPartyDraft({data,client:c}).lineups.find(r=>r.members.some(p=>p.hero.id==='Akshan'));assert(row);assert.equal(row.pending,true);assert(!row.traits.includes('承伤手段'));assert(row.evidence[0].traits.frontline.pending);
});
test('stale and unknown owned records keep scoped removal; compact hovers retain necessary selection and purchase conditions',()=>{
 const hero=data.champions.find(h=>h.id==='Lux'),round={hero:hero.id,context:'stale-owned',revision:8,owned:[999999],options:[]};
 for(const value of [data,{...data,patch:'16.20'}]){const html=hexConfigurationView({data:value,hero,round});assert.match(html,/data-hex-context="stale-owned"/);assert.match(html,/data-action="remove-owned"[^>]*data-id="999999"/);}
 const entry={name:'触发',core:true,brief:'每次命中后触发。'};
 assert.match(hexMicroHint({},entry,'augment').brief,/^需选到。/);assert.match(hexMicroHint({}, {...entry,offered:true},'augment').brief,/^本轮若选。/);assert.match(hexMicroHint({}, {...entry,owned:true},'augment').brief,/^已选。/);
 assert.match(hexMicroHint({kind:'item-synergy',equipmentState:'suggested'},entry,'item').brief,/^若购买，/);assert.match(hexMicroHint({kind:'item-synergy',equipmentState:'held'},entry,'item').brief,/已装备，仍需触发/);
});
test('sidebar route hints preserve purchase conditions and individual actual offers',()=>{
 for(const [id,owned,options]of [['Ahri',[1318],[]],['Camille',[],[1996]],['Yasuo',[],[3078]]]){
  const hero=data.champions.find(h=>h.id===id),selection={id,role:'mid',mode:'hex'},plan={selection,build:getBuild(hero,'mid',data,selection)},round={hero:id,context:'hints-'+id,revision:1,owned,options};
  const html=hexConfigurationView({data,hero,round,plan});
  if(id==='Ahri'){assert.match(html,/data-game-tooltip-id="3157"[^>]+data-hex-brief="若购买，/);assert.match(html,/data-game-tooltip-id="1318"[^>]+data-hex-brief="已选。/);continue;}
  const routes=hexPairedMicroRoutes({data,hero:id,owned,options,routes:hexPlayerRoutes({data,hero:id,owned,options}),limit:30});assert(routes.length);
  for(const row of routes)for(const a of row.augments){assert.equal(a.offered,options.includes(a.id));const hint=hexMicroHint(row,a,'augment');assert.equal(hint.brief.startsWith('本轮若选。'),options.includes(a.id)&&!owned.includes(a.id));}
 }
});
test('configuration keeps paired icon routes and folds manual tools without equipment-only filler',()=>{
 const hero=data.champions.find(h=>h.id==='Ahri'),selection={id:hero.id,role:'mid',mode:'hex'},plan={selection,build:getBuild(hero,'mid',data,selection)},round={hero:hero.id,context:'one',revision:3,owned:[],options:[2005,2072]};
 const html=hexConfigurationView({data,hero,round,plan});assert.match(html,/data-hex-context="one" data-hex-revision="3"/);assert.doesNotMatch(html,/hex-workspace-equipment|data-action="configuration-switch"|手动录入|本轮选项/);assert.match(html,/<details class="hex-workspace-more hex-workspace-adjust"[^>]*><summary>已选记录<\/summary>/);assert.doesNotMatch(html,/<details class="hex-workspace-more hex-workspace-adjust"[^>]*\sopen(?:\s|>)/);assert.match(html,/data-game-tooltip-kind="augment"/);assert.match(html,/各轮完整池未公开/);assert.doesNotMatch(html,/本局已选，非配套|英雄强化建议|这个英雄，先看这些|最热门/);
 const a=gameTooltipView(data,'augment',2005,{mode:'hex',compact:true});assert.match(a,/5/);assert.doesNotMatch(a,/峡谷基础值|已应用公开海克斯参数/);assert.equal(gameTooltipView(data,'augment',2005,{mode:'rift'}),'');
});
