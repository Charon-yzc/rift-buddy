// Historical 16.20 rule/continuity contract; current 4.0 data is tested independently.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {canonicalFamiliarity,localChampionFamiliarity,roleFamiliarityWeights,familiarityLineups,familiarityWinner} from '../src/core/recommendation-familiarity.mjs';
import {recommend,createSlots} from '../src/core/recommend.mjs';
import {recommendationKey} from '../src/core/preparation.mjs';
import vm from 'node:vm';
const {champions}=JSON.parse(fs.readFileSync(new URL('./fixtures/snapshot-16.20/game.json',import.meta.url)));
const profile=(counts,mass=.85,member='local:a')=>({member,mass,usage:{sampled:Object.values(counts).reduce((a,b)=>a+b,0),counts}});
const bottom=()=>createSlots().map(s=>({...s,party:['bottom','support'].includes(s.role),...(s.role==='support'?{champion:'Nami',locked:true}:{})}));
const input=()=>({slots:bottom(),champions,scope:'bot',style:'balanced',rolePools:{bottom:{mode:'only',heroes:['Ashe','Jinx','Vayne','Jhin','Ezreal','MissFortune','Lucian','KogMaw']}},randomSeed:'round',limit:6});

test('profiles normalize per legal lane and per player, with equal histories independent of sample count',()=>{
 const candidates={bottom:['Ashe','Jinx','Vayne'],support:['Nami','Lulu','Sona']},members={bottom:profile({Ashe:400,Jinx:100}),support:profile({Nami:10,Lulu:40})};
 const actual=roleFamiliarityWeights(['bottom','support'],candidates,members);assert.equal(actual.bottom.Ashe,.68);assert.equal(actual.support.Nami,.17);assert.equal(actual.support.Lulu,.68);assert.ok(Math.abs(actual.bottom.Vayne-.15)<1e-9);
 assert.deepEqual(actual,roleFamiliarityWeights(['bottom','support'],candidates,{bottom:profile({Ashe:40,Jinx:10}),support:profile({Nami:100,Lulu:400})}));
 assert.deepEqual(roleFamiliarityWeights(['support'],candidates,members),{support:actual.support});
});

test('complete samples reach below the top24 beam and keep member ownership, locks and duplicates legal',()=>{
 const heroes=Array.from({length:35},(_,i)=>({id:'Hero'+i})),fixed=createSlots().map(s=>({...s,champion:s.role==='mid'?'Ahri':null})),candidates={bottom:heroes,support:[{id:'Nami'},{id:'Lulu'}]},weights=roleFamiliarityWeights(['bottom','support'],candidates,{bottom:profile({Hero34:500},1),support:profile({Lulu:50},1)});
 const samples=familiarityLineups(fixed,['bottom','support'],candidates,weights,'stable');assert.equal(samples.length,48);
 for(const row of samples){assert.equal(row.find(s=>s.role==='bottom').champion,'Hero34');assert.equal(row.find(s=>s.role==='support').champion,'Lulu');assert.equal(row.find(s=>s.role==='mid').champion,'Ahri');}
 const clash=familiarityLineups(createSlots(),['mid','support'],{mid:[{id:'Lux'},{id:'Ahri'}],support:[{id:'Lux'},{id:'Nami'}]},{mid:{Lux:.9,Ahri:.1},support:{Lux:.9,Nami:.1}},'duplicates');assert.ok(clash.length);assert.ok(clash.every(row=>new Set(row.map(s=>s.champion).filter(Boolean)).size===2));
});

test('default85/15 produces the requested preference frequency, with exact endpoints and stable rerolls',()=>{
 const candidates={bottom:['Ashe','Jinx','Vayne','Jhin']},fixed=createSlots(),profiles={bottom:profile({Ashe:500})},weights=roleFamiliarityWeights(['bottom'],candidates,profiles);
 const samples=familiarityLineups(fixed,['bottom'],{bottom:candidates.bottom.map(id=>({id}))},weights,'round',2000),played=samples.filter(row=>row.find(s=>s.role==='bottom').champion==='Ashe').length/samples.length;assert.ok(played>.82&&played<.88,String(played));
 const entries=candidates.bottom.map(id=>({slots:fixed.map(s=>s.role==='bottom'?{...s,champion:id}:s)}));
 let winners=0;for(let n=0;n<2000;n++)if(familiarityWinner(entries,['bottom'],weights,'round',n).slots.find(s=>s.role==='bottom').champion==='Ashe')winners++;assert.ok(winners/2000>.82&&winners/2000<.88);
 for(const mass of [0,1]){const endpoint=roleFamiliarityWeights(['bottom'],candidates,{bottom:profile({Ashe:500},mass)});for(let n=0;n<40;n++)assert.equal(familiarityWinner(entries,['bottom'],endpoint,'round',n).slots.find(s=>s.role==='bottom').champion==='Ashe',!!mass);}
 assert.deepEqual(familiarityLineups(fixed,['bottom'],{bottom:candidates.bottom.map(id=>({id}))},weights,'same'),familiarityLineups(fixed,['bottom'],{bottom:candidates.bottom.map(id=>({id}))},weights,'same'));
});

test('real recommender applies familiarity before selecting, retains fit values and stable pagination',()=>{
 const base=input(),all=recommend({...base,limit:30}),best=Math.max(...all.map(row=>row.score)),known=all.findLast(row=>row.score>=best-18).slots.find(s=>s.role==='bottom').champion;
 const biased=recommend({...base,familiarityByRole:{bottom:profile({[known]:500},1)},limit:30});assert.equal(biased.length,1);assert.ok(biased.every(row=>row.slots.find(s=>s.role==='bottom').champion===known));
 const shared=biased.filter(row=>all.some(other=>other.id===row.id));assert.ok(shared.length);for(const row of shared){const other=all.find(other=>other.id===row.id);assert.equal(row.score,other.score);assert.deepEqual(row.compositionFit,other.compositionFit);assert.equal(row.slots.find(s=>s.role==='support').champion,'Nami');}
 const opts={...base,familiarityByRole:{bottom:profile({Ashe:300,Jinx:200})}},whole=recommend({...opts,limit:8}),pages=[...recommend({...opts,limit:4}),...recommend({...opts,limit:4,offset:4})];assert.deepEqual(pages,whole);
 const banned=recommend({...opts,publicBans:['Ashe'],excluded:['Jinx'],limit:8});assert.ok(banned.every(row=>!['Ashe','Jinx'].includes(row.slots.find(s=>s.role==='bottom').champion)));
 assert.deepEqual(recommend({...base,familiarityByRole:{bottom:profile({})}}),recommend(base));
});

test('extra teammate variants cannot buy more personal probability mass for a less familiar hero',()=>{
 const entries=[{slots:[{role:'bottom',champion:'Ashe'},{role:'support',champion:'Nami'}]},...Array.from({length:10},(_,n)=>({slots:[{role:'bottom',champion:'Jinx'},{role:'support',champion:'Friend'+n}]}))],weights={bottom:{Ashe:.85,Jinx:.15}};
 let played=0;for(let n=0;n<3000;n++)if(familiarityWinner(entries,['bottom','support'],weights,'variants',n).slots[0].champion==='Ashe')played++;
 assert.ok(played/3000>.82&&played/3000<.88,String(played/3000));
 const original=entries.slice(0,2);for(let n=0;n<100;n++)assert.equal(familiarityWinner(entries,['bottom','support'],weights,'same',n).slots[0].champion,familiarityWinner(original,['bottom','support'],weights,'same',n).slots[0].champion);
});

test('best teammate variants retain the hero draw mass while excluding clearly worse fits',()=>{
 const entries=[{slots:[{role:'bottom',champion:'Ashe'},{role:'support',champion:'Nami'}],score:90},{slots:[{role:'bottom',champion:'Ashe'},{role:'support',champion:'Sona'}],score:60},{slots:[{role:'bottom',champion:'Jinx'},{role:'support',champion:'Lulu'}],score:88}],weights={bottom:{Ashe:.85,Jinx:.15}};
 for(let draw=0;draw<500;draw++){
  const ordinary=familiarityWinner(entries,['bottom','support'],weights,'quality',draw),best=familiarityWinner(entries,['bottom','support'],weights,'quality',draw,{bestVariant:true});
  assert.equal(best.slots[0].champion,ordinary.slots[0].champion,'Teammate quality must not alter the sampled personal hero');
  assert.ok(best.score>=Math.max(...entries.filter(entry=>entry.slots[0].champion===best.slots[0].champion).map(entry=>entry.score))-5);
 }
});

test('an explicit tempo cannot silently fall back to a familiar hero that does not match it',()=>{
 const options={...input(),play:{tempo:'growth'},randomSeed:'tempo',limit:30},ordinary=recommend(options);
 assert.ok(ordinary.some(entry=>entry.strategy.matched));
 assert.equal(ordinary.find(entry=>entry.slots.find(s=>s.role==='bottom').champion==='Ashe').strategy.matched,false);
 const strict=recommend({...options,familiarityByRole:{bottom:profile({Ashe:10},1)}});
 assert.deepEqual(strict,[],'Neither a zero-weight hero nor a conflicting tempo should bypass the explicit preferences');
});

test('local binding never spreads a teammate profile or guesses a provisional party position',()=>{
 const slots=createSlots(),summary={status:'ready',session:'a'.repeat(32),usage:profile({Ahri:500}).usage},client={connected:true,phase:'ChampSelect',session:{localPlayerCellId:1}};
 assert.deepEqual(localChampionFamiliarity({client,slots,scope:'party',summary}),{});
 const mine=localChampionFamiliarity({client,slots:slots.map(s=>s.role==='mid'?{...s,clientCellId:1}:s),scope:'party',summary});assert.deepEqual(Object.keys(mine),['mid']);
 assert.deepEqual(localChampionFamiliarity({client,slots:slots.map(s=>s.role==='mid'?{...s,clientCellId:2}:s),scope:'party',ownRole:'mid',summary}),{});
 assert.equal(Object.keys(localChampionFamiliarity({client,slots,scope:'solo',summary})).length,5);
 assert.deepEqual(localChampionFamiliarity({client:{connected:false},slots,scope:'solo',summary}),{});
 const single=slots.map(s=>({...s,party:s.role==='support'}));
 const local={...client,session:{...client.session,myTeam:[{cellId:1}]}};
 assert.deepEqual(Object.keys(localChampionFamiliarity({client:local,slots:single,scope:'context',summary})),['support']);
 assert.deepEqual(localChampionFamiliarity({client:local,slots:single.map(s=>s.party?{...s,clientCellId:2}:s),scope:'context',summary}),{});
 assert.deepEqual(localChampionFamiliarity({client,slots:single,scope:'context',summary}),{});
 assert.ok(single.every(s=>!Number.isInteger(s.clientCellId)),'Preference fallback must not claim the lane');
});

test('independent familiar batches keep their original mass and never fill zero-weight heroes after exhaustion',()=>{
 const base=input(),name='MissFortune';let familiarFirst=0;
 for(let batch=0;batch<120;batch++){
  const options={...base,limit:6,randomSeed:'batch:'+batch,familiarityByRole:{bottom:profile({[name]:100},.85)}},results=recommend(options);
  assert.ok(results.length);assert.equal(new Set(results.map(r=>r.id)).size,results.length);
  if(results[0].slots.find(s=>s.role==='bottom').champion===name)familiarFirst++;
  const strict=recommend({...options,familiarityByRole:{bottom:profile({[name]:100},1)}});assert.equal(strict.length,1);assert.equal(strict[0].slots.find(s=>s.role==='bottom').champion,name);
 }
 assert.ok(familiarFirst>=90&&familiarFirst<=115,String(familiarFirst));
});

test('the real recommender uses the shared pool for unbound lanes and preserves an explicitly bound personal pool',()=>{
 const slots=createSlots().map(s=>({...s,party:['bottom','support'].includes(s.role)})),base={slots,champions,scope:'party',style:'balanced',limit:1,
  rolePools:{bottom:{mode:'only',heroes:['Ashe','Jinx']},support:{mode:'only',heroes:['Lulu','Lux']}},familiarityByRole:{bottom:profile({Ashe:100},1)}};
 const counts={Lulu:0,Lux:0};
 for(const preferred of ['Lulu','Lux'])for(let seed=0;seed<24;seed++){
  const [result]=recommend({...base,randomSeed:'shared-'+seed,roomFamiliarity:[profile({[preferred]:50},1,'room:friend')]});assert.ok(result);
  assert.equal(result.slots.find(s=>s.role==='bottom').champion,'Ashe','A public average must not replace the own lane profile');
  if(result.slots.find(s=>s.role==='support').champion===preferred)counts[preferred]++;
 }
 assert.ok(counts.Lulu>=20&&counts.Lux>=20,JSON.stringify(counts));
});

test('preference cache identity changes for member, mass, lane or counts but not scan metadata or insertion order',()=>{
 const rows={mid:profile({Lux:100,Ahri:400}),support:profile({Nami:50},.6,'friend:b')},base={slots:createSlots(),familiarityByRole:rows},key=recommendationKey(base);
 const reordered={support:rows.support,mid:{...rows.mid,usage:{...rows.mid.usage,counts:{Ahri:400,Lux:100}},scanned:500,receivedAt:'later'}};assert.equal(recommendationKey({...base,familiarityByRole:reordered}),key);
 for(const patch of [{member:'friend:c'},{mass:.9},{usage:profile({Lux:101,Ahri:399}).usage}])assert.notEqual(recommendationKey({...base,familiarityByRole:{...rows,mid:{...rows.mid,...patch}}}),key);
 assert.notEqual(recommendationKey({...base,familiarityByRole:{top:rows.mid,support:rows.support}}),key);assert.throws(()=>canonicalFamiliarity({mid:profile({Ahri:501})}),/场次|范围|格式/);
});

test('actual app summary notifications cancel an old worker only for changed preferences and reject its late result',async()=>{
 const source=fs.readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8'),extract=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
 let finish,cancelled=0,queued=0;const summary={revision:1,status:'ready',session:'a'.repeat(32),usage:profile({Ahri:500}).usage};
 const context=vm.createContext({data:{champions},client:{connected:true,session:{localPlayerCellId:1}},slots:createSlots().map(s=>s.role==='mid'?{...s,clientCellId:1}:s),scope:'party',saved:{preferences:{familiarityMass:.85}},championUsage:summary,route:'draft',windowLayout:{docked:false},history:{observeClient(){}},
  recommendationKey,localChampionFamiliarity,results:[{id:'old'}],offset:0,generating:false,recommendationRun:0,autoRecommendationKey:'old',activeRecommendation:null,autoRecommendTimer:null,recommendationError:'',resultsSignature:'',showAllCandidates:false,clearTimeout,render(){},markResultStale(){},cancelRecommendationReveal(){},toast(){},queueCompanionRecommendation(){queued++;},resultCreativePlan(){throw Error('stale completion was accepted');},
  calculateRecommendation(){context.activeRecommendation={cancel(){cancelled++;}};return new Promise(resolve=>finish=resolve);},recommendationInput(){return {slots:context.slots,familiarityByRole:localChampionFamiliarity({client:context.client,slots:context.slots,scope:'party',ownRole:'mid',summary:context.championUsage,mass:.85})};}});
 vm.runInContext(extract('function acceptChampionUsage(','const historyTooltips=')+extract('function cancelRecommendation(){','\n',)+extract('async function generate(next=false,automatic=false){','const sync=createClientSync'),context);
 const pending=context.generate();context.acceptChampionUsage({...summary,revision:2,scanned:500});assert.equal(cancelled,0);assert.equal(context.generating,true);
 context.acceptChampionUsage({...summary,revision:3,usage:profile({Ahri:400,Lux:100}).usage});assert.equal(cancelled,1);assert.equal(queued,1);assert.equal(context.results.length,0);
 finish([{id:'late'}]);await pending;assert.equal(context.results.length,0);assert.equal(context.generating,false);
 context.acceptChampionUsage({...summary,revision:2});assert.equal(context.championUsage.revision,3);
});
