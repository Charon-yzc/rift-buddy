import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {BUNDLED_CATALOG,validateCatalog,mergePersonal,configureCatalog,catalogIssues} from '../src/core/catalog.mjs';
import {createCatalogStore} from '../services/catalog-store.mjs';
import {personalCombo,loadPersonalCombo} from '../src/core/personal-combo.mjs';
import {comboMembers,comboKey} from '../src/core/combo-members.mjs';
import {createSlots,recommend,currentCombo} from '../src/core/recommend.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {combinationRows} from '../src/draft-library-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const values={name:'我们的野中', 'role-0':'jungle','hero-0':'Graves','job-0':'保持可输出距离，跟已命中魅惑打一轮后退回刷野','loadout-0':'default','role-1':'mid','hero-1':'Ahri','job-1':'处理好中线，再用实际命中的魅惑让搭档接输出','loadout-1':'default',difficulty:'适中',tempo:'early',why:'先控再输出，保住两人的兵线和刷野经济',plan:'中线能离开且双方在场时约好同一目标\n魅惑实际命中再接输出，空了就各自返回经济',risk:'双方距离脱节或魅惑落空就不追',window:'实际具备魅惑，搭档能输出且有退出路线',early:'中路先处理兵线，打野不为等待浪费整轮刷野',economy:'中路补刀，打野刷野；支援失败各自回到原经济',source:'https://example.com/our-plan'};
const entry=()=>personalCombo({kind:'duo',values,patch:'16.20',today:'2026-10-09',id:'local-mid-jg'});
const slots=()=>createSlots().map(s=>({...s,party:['jungle','mid'].includes(s.role),champion:s.role==='jungle'?'Graves':null,locked:s.role==='jungle'}));

test('cross-lane personal duos preserve actual roles, jobs and complete configs across store restart',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-personal-pair-')),store=await createCatalogStore({root,getData:()=>data}),pair=entry();
 const saved=await store.savePersonal(pair);assert.equal(saved.info.personalCount,1);assert.ok(saved.catalog.duos.some(d=>d.id===pair.id));assert.ok(!saved.catalog.trios.some(d=>d.id===pair.id));
 const reopened=await createCatalogStore({root,getData:()=>data});assert.deepEqual(reopened.export().duos.find(d=>d.id===pair.id),pair);
 configureCatalog(reopened.export());try{
  const rows=recommend({slots:slots(),champions:data.champions,scope:'party',play:{unusual:false},limit:3});assert.equal(rows[0].duo.id,pair.id);assert.equal(rows[0].slots.find(s=>s.role==='mid').champion,'Ahri');
  const loaded=loadPersonalCombo(slots(),pair);assert.equal(currentCombo(loaded,'Ahri','mid').id,pair.id);
  for(const m of pair.members){const build=getBuild(data.champions.find(c=>c.id===m.champion),m.role,data,{comboId:pair.id});assert.equal(build.combo.ownJob,m.job);assert.equal(build.combo.economy,pair.economy);assert.equal(build.combo.play.stages.key.ownAction,m.job);assert.equal(build.runePage.selectedPerkIds.length,9);assert.equal(build.missing.length,0);}
  const html=combinationRows({...data,catalog:reopened.export()},{kind:'duos',style:'all',query:'我们的野中'},loaded);assert.match(html,/格雷福斯/);assert.match(html,/data-role="jungle"/);assert.match(html,/data-role="mid"/);assert.ok(!html.includes('data-role="bottom"'));assert.match(html,/中路配置/);
 }finally{configureCatalog(BUNDLED_CATALOG);}
});

test('pair uniqueness uses champion plus role and legacy pairs retain their identity',()=>{
 const pair=entry(),base=mergePersonal(BUNDLED_CATALOG,{duos:[pair]}),reversed={...pair,id:'local-reversed',members:[...pair.members].reverse()};
 assert.equal(comboKey(pair),comboKey(reversed));assert.throws(()=>validateCatalog({...base,duos:[...base.duos,reversed]},data),/双人英雄位置重复/);
 const otherRoles={...pair,id:'local-other-roles',members:pair.members.map((m,i)=>({...m,role:i?'support':'bottom'}))};assert.equal(validateCatalog(mergePersonal(base,{duos:[otherRoles]}),data).duos.length,202);
 const old=BUNDLED_CATALOG.duos[0],modern={...old,id:'local-modern-bot',members:comboMembers(old).map((m,i)=>({...m,job:'成员 '+i+' 分工'})),steps:['先沟通，再接力'],window:'双方都能跟',early:'保住经验',economy:'下路补刀，辅助支援'};delete modern.carry;delete modern.support;delete modern.loadouts;
 const merged=mergePersonal(BUNDLED_CATALOG,{duos:[modern]});assert.equal(merged.duos.length,200);assert.ok(!merged.duos.some(d=>d.id===old.id));assert.deepEqual(BUNDLED_CATALOG.duos[0],old);
 for(const mutate of [p=>p.members[1].role=p.members[0].role,p=>p.members[1].champion=p.members[0].champion,p=>p.members[0].loadoutId='trio-ball',p=>p.carry='Graves']){const p=structuredClone(pair);mutate(p);assert.throws(()=>validateCatalog(mergePersonal(BUNDLED_CATALOG,{duos:[p]}),data),/组合库检查失败/);}
});

test('editing an old duo retains version and sources; changed positions cannot retain incompatible loadouts',()=>{
 const previous={...BUNDLED_CATALOG.duos[0],id:'local-old',patch:'16.18',reviewedAt:'2026-09-25',sources:[{name:'first',url:'https://example.com/one'},{name:'second',url:'https://example.com/two',checkedAt:'2026-10-01'}]};
 const next=personalCombo({previous,kind:'duo',values:{...values,source:previous.sources[0].url},patch:'16.20',today:'2026-10-09'});assert.equal(next.patch,previous.patch);assert.equal(next.reviewedAt,previous.reviewedAt);assert.deepEqual(next.sources,previous.sources);assert.equal(next.carry,undefined);assert.equal(next.members[0].role,'jungle');
 assert.equal(catalogIssues(mergePersonal(BUNDLED_CATALOG,{duos:[next]}),data).status[next.id].stale,true);
 const reviewed=personalCombo({previous,kind:'duo',values:{...values,'review-current':'yes'},patch:'16.20',today:'2026-10-09'});assert.equal(reviewed.patch,'16.20');assert.equal(reviewed.reviewedAt,'2026-10-09');
 assert.throws(()=>personalCombo({kind:'duo',values:{...values,'job-1':''},patch:'16.20',today:'2026-10-09',id:'local-incomplete'}),/补齐/);
});

test('loading personal pairs changes only our slots and preserves same-hero manual bindings',()=>{
 const pair=entry(),original=slots();Object.assign(original.find(s=>s.role==='jungle'),{manualPosition:true,clientCellId:4});Object.assign(original.find(s=>s.role==='top'),{champion:'Garen',locked:true,party:false});const before=structuredClone(original),next=loadPersonalCombo(original,pair);
 assert.deepEqual(next.find(s=>s.role==='jungle'),before.find(s=>s.role==='jungle'));assert.deepEqual(next.find(s=>s.role==='top'),before.find(s=>s.role==='top'));assert.deepEqual(original,before);
 assert.throws(()=>loadPersonalCombo(original.map(s=>s.role==='mid'?{...s,party:false}:s),pair),/队友/);
 assert.throws(()=>loadPersonalCombo(original.map(s=>s.role==='top'?{...s,champion:'Ahri'}:s),pair),/其他位置/);
});

test('personal duo seeds respect pools, exclusions and public picks',()=>{
 configureCatalog(mergePersonal(BUNDLED_CATALOG,{duos:[entry()]}));try{
  for(const options of [{excluded:['Ahri']},{publicPicks:['Ahri']},{rolePools:{mid:{mode:'only',heroes:['Viktor']}}}]){
   const rows=recommend({slots:slots(),champions:data.champions,scope:'party',limit:3,...options});assert.ok(rows.every(row=>row.duo?.id!=='local-mid-jg'));assert.ok(rows.every(row=>row.slots.find(s=>s.role==='mid').champion!=='Ahri'));
  }
 }finally{configureCatalog(BUNDLED_CATALOG);}
});

test('duo and trio library loading preserves locked friends and checks current public eligibility atomically',()=>{
 for(const combo of [entry(),{members:[...entry().members,{role:'top',champion:'Garen'}]}]){
  const original=createSlots().map(s=>({...s,party:['top','jungle','mid'].includes(s.role),champion:s.role==='mid'?'Lux':null,locked:s.role==='mid'})),before=structuredClone(original);
  assert.throws(()=>loadPersonalCombo(original,combo),/锁定英雄冲突/);assert.deepEqual(original,before);
  const unlocked=original.map(s=>({...s,locked:false})),unchanged=structuredClone(unlocked);
  for(const options of [{publicBans:['Ahri']},{enemy:['Ahri']},{eligibleByRole:{mid:['Lux']}},{eligibleByRole:{mid:[]}},{publicPicks:['Ahri']},{publicCells:[1]}]){
   const current=options.publicCells?unlocked.map(s=>s.role==='mid'?{...s,clientCellId:1,manualPosition:true}:s):unlocked;
   assert.throws(()=>loadPersonalCombo(current,combo,options),/本局不可选|客户端已确认/);assert.deepEqual(unlocked,unchanged);
  }
  const loaded=loadPersonalCombo(unlocked,combo,{eligibleByRole:{mid:['Ahri']}});assert.equal(loaded.find(s=>s.role==='mid').champion,'Ahri');assert.equal(loaded.find(s=>s.role==='mid').locked,true);assert.deepEqual(unlocked,unchanged);
  const picked=unlocked.map(s=>s.role==='mid'?{...s,champion:'Ahri',locked:true,clientCellId:1,manualPosition:true}:s),options={eligibleByRole:{mid:[]},confirmedPick:{role:'mid',champion:'Ahri'},publicCells:[1]};
  assert.deepEqual(loadPersonalCombo(picked,combo,options).find(s=>s.role==='mid'),picked.find(s=>s.role==='mid'));
  assert.throws(()=>loadPersonalCombo(picked,combo,{...options,publicBans:['Ahri']}),/本局不可选/);
 }
});

test('empty cross-lane parties surface existing concrete mechanism plans before generic functions',()=>{
 for(const roles of [['jungle','mid'],['top','jungle']]){
  const empty=createSlots().map(s=>({...s,party:roles.includes(s.role)}));const [first]=recommend({slots:empty,champions:data.champions,scope:'party',style:'fun',play:{unusual:false},limit:3});assert.ok(first.adaptive||first.duo||first.trio);assert.notEqual(first.origin,'generated');
 }
});
