import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {sanitizeSession} from '../services/lcu.mjs';
import {clientRenderIdentity} from '../src/core/client-party.mjs';
import {pickEligibilityContext} from '../src/core/pick-eligibility.mjs';
import {companionView} from '../src/companion-view.mjs';
import {hexChampionStatistics} from '../src/core/hex-champion-statistics.mjs';
import historicalGame from './fixtures/snapshot-16.21/game.json' with {type:'json'};

const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const key=id=>data.champions.find(c=>c.id===id).key;
const pool=['Malphite','Xerath','Teemo','Karma','Trundle','Brand','Morgana','Garen','Nami','Lulu','Kennen','Braum'];
function fixture(bundle=data){
 const heroKey=id=>bundle.champions.find(c=>c.id===id).key;
 const raw={gameId:777,localPlayerCellId:0,myTeam:['Lux','Ashe','Veigar','Sona','Jinx'].map((id,cellId)=>({cellId,championId:heroKey(id)})),theirTeam:[],benchEnabled:true,benchChampions:pool.map(id=>({championId:heroKey(id)}))};
 const client={connected:true,phase:'ChampSelect',mode:{id:'hex'},party:{members:[{cellId:0}]},session:sanitizeSession(raw)};
 const render=()=>companionView({data:bundle,client,slots:[],tab:'recommend',preferences:{},configurationStatus:{}});
 return {raw,client,render};
}
function visiblePool(html){
 const section=html.match(/<section class="hex-shared-bench"[^>]*>([\s\S]*?)<\/section>/)?.[1];
 assert.ok(section,'The sidebar must expose the shared bench independently of recommended lineups');
 assert.doesNotMatch(section,/<details\b/,'Available heroes must not be hidden in a disclosure');
 return [...section.matchAll(/data-action="hex-quick-pick"[^>]*data-id="([^"]+)"/g)].map(m=>m[1]);
}
test('the sidebar shows every shared bench hero even when only three recommended lineups are visible',()=>{
 const f=fixture(),before=structuredClone(f.client),html=f.render();
 assert.deepEqual(visiblePool(html).sort(),[...pool].sort());
 assert.deepEqual(f.client,before);
 const ranking=html.slice(html.indexOf('<div class="hex-ranking"'));
 assert.doesNotMatch(ranking,/data-action="hex-quick-pick"/);
});
test('ordinary teammates can add and remove shared bench heroes without changing the local pick or party membership',()=>{
 const f=fixture(),before=clientRenderIdentity(f.client);
 assert.equal(visiblePool(f.render()).length,12);
 f.raw.benchChampions.push({championId:key('Hecarim')});
 f.raw.benchChampions=f.raw.benchChampions.filter(p=>p.championId!==key('Xerath'));
 f.client.session=sanitizeSession(f.raw);
 assert.notEqual(clientRenderIdentity(f.client),before,'A bench-only update must repaint the sidebar');
 assert.deepEqual(visiblePool(f.render()).sort(),[...pool.filter(id=>id!=='Xerath'),'Hecarim'].sort());
 f.raw.benchChampions=[];f.client.session=sanitizeSession(f.raw);
 assert.deepEqual(visiblePool(f.render()),[],'Removed heroes must not survive in a cached pool');
});
test('shared bench clicks exclude occupied, disabled and locally unpickable heroes without inventing entries',()=>{
 const f=fixture();
 f.raw.benchChampions.push({championId:key('Ashe')},{championId:key('Malphite')},{championId:99999});
 f.client.session=sanitizeSession(f.raw);
 f.client.eligibility={context:pickEligibilityContext(f.client.session),localPlayerCellId:0,receivedAt:new Date().toISOString(),pickable:pool.filter(id=>id!=='Brand').map(key),disabled:[key('Garen')]};
 assert.deepEqual(visiblePool(f.render()).sort(),pool.filter(id=>!['Brand','Garen'].includes(id)).sort());
});
test('missing bench shows local reference ranking while preserving observed player ownership',()=>{
 const f=fixture();delete f.client.session.bench;f.client.party.members.push({cellId:2});
 const html=f.render(),section=html.match(/<section class="hex-reference-board"[^>]*>([\s\S]*?)<\/section>/)?.[1];assert(section);
 assert.equal((section.match(/class="hex-bench-hero /g)||[]).length,data.champions.length);
 assert.match(section,/class="hex-bench-hero self" data-action="hex-local-pick" data-id="Lux"/);
 assert.match(section,/class="hex-bench-hero party" data-action="hex-reference-preview" data-id="Veigar"/);
 assert.match(section,/class="hex-bench-hero teammate" data-action="hex-reference-preview" data-id="Ashe"/);
 assert.match(section,/data-action="hex-local-pick" data-id="Ahri"/);
 assert.doesNotMatch(section,/data-action="hex-quick-pick"/);
});
test('when versioned statistics are unavailable the manual reference remains usable without invented rates',()=>{
 const f=fixture();delete f.client.session.bench;
 const stale={...data,patch:'99.1',version:'99.1.1'},html=companionView({data:stale,client:f.client,slots:[],tab:'recommend',preferences:{},configurationStatus:{}});
 const section=html.match(/<section class="hex-reference-board"[^>]*>([\s\S]*?)<\/section>/)?.[1];assert(section);
 assert.equal((section.match(/class="hex-bench-hero /g)||[]).length,stale.champions.length);
 assert.match(section,/data-action="hex-local-pick" data-id="Ahri"/);assert.doesNotMatch(section,/\d+\.\d+%/);
 assert.match(html,/强化胜率[\s\S]*暂无当版统计/);
});

test('known empty bench retains only selected public heroes and removes every stale swap action',()=>{
 const f=fixture();f.client.party.members.push({cellId:2});f.raw.benchChampions=[];f.client.session=sanitizeSession(f.raw);
 const html=f.render(),section=html.match(/<section class="hex-shared-bench"[^>]*>([\s\S]*?)<\/section>/)?.[1];assert(section);
 assert.equal((section.match(/class="hex-bench-hero /g)||[]).length,5);assert.deepEqual(visiblePool(html),[]);
 assert.match(section,/class="hex-bench-hero self"[^>]*data-id="Lux"/);assert.match(section,/class="hex-bench-hero party"[^>]*data-id="Veigar"/);assert.match(section,/class="hex-bench-hero teammate"[^>]*data-id="Ashe"/);
 assert.match(section,/<small>我<\/small>/);assert.match(section,/<small>我们<\/small>/);assert.match(section,/<small>队友<\/small>/);assert.doesNotMatch(section,/<details|data-id="Malphite"/);
});
test('no observed choices falls back to a clearly manual current-roster reference without rates or quick swaps',()=>{
 const f=fixture();f.raw.benchChampions=[];f.raw.myTeam=f.raw.myTeam.map(p=>({...p,championId:0}));f.client.session=sanitizeSession(f.raw);
 const html=f.render(),section=html.match(/<section class="hex-reference-board"[^>]*>([\s\S]*?)<\/section>/)?.[1];assert(section);
 assert.equal((section.match(/class="hex-bench-hero /g)||[]).length,data.champions.length);assert.doesNotMatch(section,/hex-quick-pick|data-win-rate="[0-9]|<small>(?:我|我们|队友)<\/small>/);assert.match(section,/data-action="hex-local-pick"/);
});
test('all-ineligible real bench icons stay inspectable while owned heroes keep their player labels',()=>{
 const f=fixture();f.client.eligibility={context:pickEligibilityContext(f.client.session),localPlayerCellId:0,receivedAt:new Date().toISOString(),pickable:[],disabled:pool.map(key)};
 const before=structuredClone(f.client),html=f.render();assert.deepEqual(visiblePool(html),[]);
 const section=html.match(/<section class="hex-shared-bench"[^>]*>([\s\S]*?)<\/section>/)?.[1];
 assert.equal((section.match(/class="hex-bench-hero /g)||[]).length,pool.length+5);assert.match(section,/data-action="hex-reference-preview" data-id="Malphite"/);assert.match(section,/class="hex-bench-hero self"/);assert.deepEqual(f.client,before);
});


// This positive rendering contract uses genuine 16.21 data and statistics.
// Its historical label is preserved; it is not current-patch acceptance.
test('historical rates order the observed shared pool and retain me, us and teammate ownership',()=>{
 const stats=hexChampionStatistics(historicalGame);assert(stats);assert.equal(stats.patch,'16.21');assert.notEqual(stats.patch,data.patch);
 const rates=new Map(stats.rows.map(row=>[row.hero,row.winRate])),observed=new Set([...pool,'Lux','Ashe','Veigar','Sona','Jinx']);
 const expected=historicalGame.champions.filter(hero=>observed.has(hero.id)).sort((a,b)=>rates.get(b.id)-rates.get(a.id)||a.key-b.key).map(hero=>hero.id);
 const f=fixture(historicalGame);f.client.party.members.push({cellId:2});const before=structuredClone(f.client),html=f.render();
 const section=html.match(/<section class="hex-shared-bench"[^>]*>([\s\S]*?)<\/section>/)?.[1];assert(section);
 const rows=[...section.matchAll(/<button type="button" class="hex-bench-hero ([^"]*)" data-action="([^"]+)" data-id="([^"]+)" data-win-rate="([^"]+)"/g)].map(m=>({selected:m[1],action:m[2],id:m[3],rate:Number(m[4])}));
 assert.equal(rows.length,observed.size);assert.deepEqual(rows.map(row=>row.id),expected);assert.equal(rows[0].id,'Teemo');assert.equal(rows.at(-1).id,'Ashe');
 for(const [index,row]of rows.entries()){assert.equal(row.rate,rates.get(row.id));if(index)assert(rows[index-1].rate>=row.rate);}
 const selected=new Set(['Lux','Ashe','Veigar','Sona','Jinx']);assert.deepEqual(visiblePool(html),expected.filter(id=>!selected.has(id)));
 const byHero=new Map(rows.map(row=>[row.id,row]));
 assert.equal(byHero.get('Lux').selected,'self');assert.equal(byHero.get('Lux').action,'hex-local-pick');
 assert.equal(byHero.get('Veigar').selected,'party');assert.equal(byHero.get('Veigar').action,'hex-reference-preview');
 assert.equal(byHero.get('Ashe').selected,'teammate');assert.equal(byHero.get('Ashe').action,'hex-reference-preview');
 assert.match(section,/<small>我<\/small>/);assert.match(section,/<small>我们<\/small>/);assert.match(section,/<small>队友<\/small>/);assert.doesNotMatch(section,/data-id="Hecarim"/);
 assert.deepEqual(f.client,before);
});
test('current unavailable hero statistics stay null and never borrow historical percentages in the shared pool',()=>{
 const historical=hexChampionStatistics(historicalGame);assert(historical);assert.equal(hexChampionStatistics(data),null);
 for(const bundle of [data,{...data,hexChampionStats:historical}]){
  assert.equal(hexChampionStatistics(bundle),null);const f=fixture(bundle),html=f.render();
  const section=html.match(/<section class="hex-shared-bench"[^>]*>([\s\S]*?)<\/section>/)?.[1];assert(section);
  assert.doesNotMatch(section,/\d+\.\d+%|data-win-rate="[0-9]/);assert.equal((section.match(/data-win-rate=""/g)||[]).length,pool.length+5);
  assert.deepEqual(visiblePool(html),pool.slice().sort((a,b)=>key(a)-key(b)));
 }
});
