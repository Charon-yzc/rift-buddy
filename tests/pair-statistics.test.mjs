import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createPairStatisticsIndex,validatePairStatistics,pairApiUrl,pairSourceUrl} from '../src/core/pair-statistics.mjs';
import {parsePairStatisticsJSON,loadPairStatistics} from '../services/pair-statistics.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {recommendationKey} from '../src/core/preparation.mjs';
import {pairStatisticsText,pairStatisticsView} from '../src/pair-statistics-view.mjs';
import {renderResultCard} from '../src/draft-result-view.mjs';
import {resultPlayCard} from '../src/play-card-view.mjs';
import {companionView} from '../src/companion-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8')),source={region:'global',tier:'emerald_plus'},own=data.champions.find(c=>c.id==='Graves');
const member=(champion,role)=>({champion,role}),a=member('Graves','jungle'),b=member('Vex','mid');
const entry=(m,p,games=1000,wins=550)=>({...m,url:pairApiUrl(data.champions.find(c=>c.id===m.champion).key,m.role,source,data.patch),sourceUrl:pairSourceUrl(m.champion,m.role,source,data.patch),fetchedAt:'2026-10-09T17:00:00Z',rawSha256:'a'.repeat(64),pairs:[{...p,games,wins}]});
const snapshot=()=>({schema:1,source:'OP.GG',...source,patch:data.patch,entries:[entry(a,b),entry(b,a)]});
const slots=(members=[a,b])=>createSlots().map(s=>({...s,party:members.some(m=>m.role===s.role),...(members.find(m=>m.role===s.role)||{}),locked:members.some(m=>m.role===s.role)}));

test('bundled same-team observations validate, load offline and retain role-specific provenance',async()=>{
 const s=await loadPairStatistics('data/pair-statistics.json',data);assert.ok(s);assert.match(s.revision,/^[a-f0-9]{64}$/);assert.equal(validatePairStatistics(s,data.champions),s);
 assert.equal(s.entries.length,309);assert.equal(s.entries.reduce((n,e)=>n+e.pairs.length,0),12360);
 assert.ok(s.entries.every(e=>e.pairs.every(p=>p.role!==e.role&&p.champion!==e.champion)));
 assert.equal(await loadPairStatistics('data/nonexistent-pairs.json',data),null);
});

test('vendor parser rejects identity, filter, sample and duplicate changes and excludes aggregate or unknown heroes',()=>{
 const row={champion_id:own.key,position:'JUNGLE',synergy_champion_id:data.champions.find(c=>c.id==='Vex').key,synergy_position:'MID',play:1000,win:550,win_rate:.55},raw={meta:{version:data.patch},data:[row]},options={champion:own,role:'jungle',data,source,rawSha256:'a'.repeat(64)};
 assert.deepEqual(parsePairStatisticsJSON(raw,options).pairs,[{...b,games:1000,wins:550}]);
 for(const changed of [{...row,champion_id:1},{...row,position:'TOP'},{...row,win:1001},{...row,win_rate:.99},{...row,play:0}])assert.throws(()=>parsePairStatisticsJSON({...raw,data:[changed]},options));
 for(const meta of [{version:'16.19'},{version:data.patch,region:'kr'},{version:data.patch,tier:'diamond_plus'}])assert.throws(()=>parsePairStatisticsJSON({...raw,meta},options));
 assert.throws(()=>parsePairStatisticsJSON({...raw,data:[row,row]},options));
 assert.deepEqual(parsePairStatisticsJSON({...raw,data:[{...row,synergy_position:'ALL'},{...row,synergy_champion_id:999999}]},options).pairs,[]);
 const bad=snapshot();bad.entries[0].sourceUrl='https://example.org';assert.throws(()=>validatePairStatistics(bad,data.champions));
});

test('opposite-direction samples never add and three players never get a synthetic team win rate',()=>{
 const s=snapshot();s.entries[1].pairs[0]={...a,games:1100,wins:583};
 const result=createPairStatisticsIndex(s,data.champions,{source,patch:data.patch}).forMembers([a,b,member('Gwen','top')]);
 assert.equal(result.pairs.length,1);assert.equal(result.expectedPairs,3);assert.equal(result.pairs[0].games,1100);assert.equal(result.pairs[0].winRate,53);assert.ok(Math.abs(result.bonus)<=4);assert.equal(result.winRate,undefined);
 assert.equal(createPairStatisticsIndex(s,data.champions,{source,patch:data.patch}).forMembers([a]),null);
 assert.equal(createPairStatisticsIndex(s,data.champions,{source,patch:data.patch}).forMembers([a,member('Vex','top')]).pairs.length,0);
});

test('four and five friends keep separate cached pair observations and named missing pairs without affecting ranking',async()=>{
 const snapshot=await loadPairStatistics('data/pair-statistics.json',data),members=[member('Malphite','top'),member('Diana','jungle'),member('Yasuo','mid'),member('KogMaw','bottom'),member('Lulu','support')],index=createPairStatisticsIndex(snapshot,data.champions,{source,patch:data.patch});
 for(const count of [4,5]){
  const group=members.slice(0,count),evidence=index.forMembers(group),expected=count*(count-1)/2;
  assert.equal(evidence.expectedPairs,expected);assert.equal(evidence.bonus,0);assert.equal(evidence.winRate,undefined);assert.ok(evidence.pairs.length>0);
  assert.equal(evidence.pairs.length+evidence.missingPairs.length,expected);
  for(let i=0;i<count;i++)for(let j=i+1;j<count;j++){
   const pair=index.forMembers([group[i],group[j]]);if(pair.pairs.length)assert.deepEqual(evidence.pairs.find(p=>p.members.every(m=>[group[i],group[j]].some(a=>a.role===m.role&&a.champion===m.champion))),pair.pairs[0]);
  }
  const input={slots:slots(group),champions:data.champions,scope:'party',patch:data.patch,buildSource:source},[base]=recommend(input),[r]=recommend({...input,pairStatistics:snapshot});assert.equal(r.score,base.score);assert.deepEqual(r.pairEvidence,evidence);
  for(const text of [pairStatisticsText(evidence,data),pairStatisticsView(evidence,data)]){assert.match(text,/每一对分别统计.*未提供四人、五人或全队胜率/);for(const pair of evidence.pairs)assert.ok(text.includes(pair.winRate.toFixed(1)+'%'));if(evidence.missingPairs.length)assert.match(text,/来源表未收录/);}
  for(const html of [renderResultCard(r,0,data,{favorites:[]}),resultPlayCard(r,0,data),companionView({data,client:{connected:false},slots:input.slots,unassigned:[],scope:'party',style:'fun',tab:'recommend',results:[r]})]){assert.match(html,/OP.GG 同队参考/);assert.ok(html.includes(`${evidence.pairs.length}/${expected} 对有样本`)||html.includes('同队统计参考'));}
 }
});

test('old snapshots remain readable without ranking and selected regions or tiers never silently fall back',()=>{
 const s=snapshot(),prior=createPairStatisticsIndex(s,data.champions,{source,patch:'16.21'}).forMembers([a,b]);assert.equal(prior.pairs.length,1);assert.equal(prior.current,false);assert.equal(prior.bonus,0);assert.match(pairStatisticsView(prior,data),/旧版本/);
 for(const selected of [{region:'kr',tier:'emerald_plus'},{region:'global',tier:'diamond_plus'}]){const r=createPairStatisticsIndex(s,data.champions,{source:selected,patch:data.patch}).forMembers([a,b]);assert.equal(r.pairs.length,0);assert.equal(r.bonus,0);assert.match(r.notice,/暂无/);}
 const missing=createPairStatisticsIndex(null,data.champions,{source,patch:data.patch}).forMembers([a,b]);assert.equal(missing.bonus,0);assert.match(missing.notice,/暂无/);
 const future=createPairStatisticsIndex(s,data.champions,{source,patch:'16.19'}).forMembers([a,b]);assert.equal(future.pairs.length,0);
});

test('sample shrink limits small-sample ordering and current evidence affects ranking only within legal candidates',()=>{
 const input={slots:slots(),champions:data.champions,scope:'party',style:'balanced',patch:data.patch,buildSource:source},base=recommend(input)[0],withSource=recommend({...input,pairStatistics:snapshot()})[0];
 assert.equal(base.id,withSource.id);assert.ok(withSource.score>base.score&&withSource.score-base.score<=4);assert.equal(withSource.pairEvidence.pairs.length,1);
 const tiny=snapshot();for(const e of tiny.entries)Object.assign(e.pairs[0],{games:1,wins:1});assert.ok(Math.abs(createPairStatisticsIndex(tiny,data.champions,{source,patch:data.patch}).forMembers([a,b]).bonus)<.01);
 const open=slots().map(s=>s.role==='mid'?{...s,champion:null,locked:false}:s),filtered=recommend({...input,slots:open,pairStatistics:snapshot(),rolePools:{mid:{mode:'only',heroes:['Vex','Annie']}},excluded:['Vex']});assert.ok(filtered.length);assert.ok(filtered.every(r=>r.slots.find(s=>s.role==='mid').champion==='Annie'));assert.ok(filtered.every(r=>r.slots.find(s=>s.role==='jungle').champion==='Graves'));
 const stale=recommend({...input,patch:'16.21',pairStatistics:snapshot()})[0];assert.equal(stale.score,base.score);
});

test('main cards, full plans and sidebar expose sample, version, filters and honest pair scope',()=>{
 const input={slots:slots(),champions:data.champions,scope:'party',patch:data.patch,buildSource:source,pairStatistics:snapshot()},r=recommend(input)[0];
 for(const html of [renderResultCard(r,0,data,{favorites:[]}),resultPlayCard(r,0,data),companionView({data,client:{connected:false},slots:input.slots,unassigned:[],scope:'party',style:'balanced',tab:'recommend',results:[r]})]){assert.match(html,/OP.GG 同队参考/);assert.match(html,/1,000 场/);assert.match(html,/55.0%/);assert.match(html,/翡翠/);assert.match(html,/16.20/);assert.match(html,/op.gg\/lol\/champions\/graves\/synergies\/jungle/);assert.match(html,/不证明配合提升/);}
 assert.notEqual(recommendationKey(input),recommendationKey({...input,buildSource:{region:'kr',tier:'emerald_plus'}}));assert.notEqual(recommendationKey(input),recommendationKey({...input,pairStatistics:{...input.pairStatistics,revision:'b'.repeat(64)}}));
});
