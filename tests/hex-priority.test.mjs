import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {rankAugmentOptions,recommendAugmentReroll,analyzeAugmentSet,hexDecision} from '../src/core/hex-decisions.mjs';
import {renderHexComparison} from '../src/hex-view.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {renderGuide} from '../src/guide-view.mjs';
const data=JSON.parse(fs.readFileSync('data/game.json','utf8'));data.hexBuilds=JSON.parse(fs.readFileSync('data/hex-builds.json','utf8')).entries;
const args=(hero,options=[],owned=[],extra={})=>({data,hero,options,owned,...extra});

test('reviewed AP attacks are preferred without moving the entered three-card order',()=>{
 const input=args('Gwen',[1103,1129,1151]),before=structuredClone(input),rows=rankAugmentOptions(input);
 assert.deepEqual(rows.map(row=>row.id),input.options);assert.equal(rows.find(row=>row.id===1129).top,true);assert.equal(rows.find(row=>row.id===1129).rank,1);assert.equal(recommendAugmentReroll(input).recommended,false);assert.deepEqual(input,before);
 assert.deepEqual(rankAugmentOptions(args('Gwen')),[]);
});

test('incomplete, repeated, missing and already-owned actual choices do not trigger rerolls',()=>{
 for(const options of [[1141,1013],[1141,1141,1013],[1141,1013,999999],[1004,1141,1013],[1141,1013,1004,1058]]){
  const result=recommendAugmentReroll(args('Ashe',options,[1004]));assert.equal(result.status,'incomplete');assert.equal(result.recommended,false);
 }
 assert.equal(recommendAugmentReroll(args(null,[1047,1141,1004])).status,'hero');
});

test('missing coverage is not negative fit evidence even with three actual choices',()=>{
 const result=hexDecision(args('Gwen',[1037,1324,1061]));assert.equal(result.reroll.recommended,false);assert.match(result.reroll.text,/尚待核对/);assert.ok(result.rows.every(row=>row.priority==='待核对'&&row.rank===null&&!row.top));
});

test('receiving-heal restrictions do not disable outgoing ally healing or shields',()=>{
 const input=args('Sona',[1141,1205,1004],[1346]),row=rankAugmentOptions(input).find(row=>row.id===1141);assert.equal(row.top,true);assert.equal(row.priority,'优先参考');
 assert.deepEqual(analyzeAugmentSet(args('Sona',[],[1346,1141])).conflicts,[]);
});

test('unreviewed generic healing power is not falsely called unusable for self shields and healing',()=>{
 const result=analyzeAugmentSet(args('Mordekaiser',[],[1037,1324]));assert.deepEqual(result.conflicts,[]);assert.equal(result.pending,2);assert.doesNotMatch(JSON.stringify(result),/用不上|无法生效|没有.*友方/);
});

test('changed identity, changed effect, changed hero kit, new patch and non-Hex mode lose confident labels',()=>{
 const changed=override=>({...data,augments:data.augments.map(a=>a.id===1141?{...a,...override}:a)});
 const changedKit={...data,champions:data.champions.map(c=>c.id==='Sona'?{...c,stats:{...c.stats,attackdamage:c.stats.attackdamage+1}}:c)};
 for(const extra of [{data:changed({key:'NewIdentity'})},{data:changed({description:'纯装饰效果'})},{data:changedKit},{data:{...data,patch:'16.21'}},{mode:'arena'},{mode:'rift'}]){
  const input=args('Sona',[1141,1088,2118],[1004],extra),result=hexDecision(input);assert.equal(result.reroll.recommended,false);assert.ok(!result.rows.some(row=>row.top));assert.ok(result.rows.find(row=>row.id===1141).rank===null);assert.deepEqual(result.set.conflicts,[]);
 }
});

test('only present, reviewed effects participate in the owned-set links and conflicts',()=>{
 const crit=analyzeAugmentSet(args('Ashe',[],[1047,1048]));assert.ok(crit.synergies.some(text=>/技能可暴击/.test(text)));assert.equal(crit.count,2);
 const conflict=analyzeAugmentSet(args('Ashe',[],[1004,1088]));assert.ok(conflict.conflicts.some(text=>/禁用.*终极/));
 const missing={...data,augments:data.augments.filter(a=>a.id!==1048)},set=analyzeAugmentSet(args('Ashe',[],[1047,1048],{data:missing}));assert.equal(set.count,1);assert.equal(set.missing,1);assert.deepEqual(set.synergies,[]);
});

test('an unchanged crit name cannot lend old build-fit claims to a changed effect',()=>{
 const changed={...data,augments:data.augments.map(a=>a.id===1047?{...a,key:'NewIdentity',description:'纯装饰效果'}:a)},row=rankAugmentOptions(args('Ashe',[1047],[],{data:changed}))[0];
 assert.equal(row.priority,'待核对');assert.doesNotMatch(row.reasons.join(' '),/暴击|转型成本/);assert.deepEqual(row.interactions,[]);
});

test('duplicate owned marks remain bounded, and no rates or numeric strength scores are synthesized',()=>{
 const result=hexDecision(args('Ashe',[1047,1088,1141],[1047,1047,1048]));assert.equal(result.set.count,2);
 const check=value=>{if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){assert.ok(!['score','winRate','pickRate','sampleSize'].includes(key));check(child);}};check(result);
});

test('main/sidebar and in-game guide expose the same compact decision without replacing routes or inputs',()=>{
 const input=args('Ashe',[1141,1088,1047],[1048,1356]),html=renderHexComparison(input);assert.match(html,/data-hex-option-input/);assert.match(html,/本局组合/);assert.match(html,/联动与下一张|查看依据/);assert.match(html,/优先看这项/);assert.ok(html.indexOf('data-augment="1141"')<html.indexOf('data-augment="1088"'));
 const guide=createGuideModel(data,{...selectGuide(null,{id:'Ashe',role:'bottom',mode:'hex',compareIds:input.options,ownedAugmentIds:input.owned}),compact:false}),rendered=renderGuide({model:guide},'augments',false,()=>'<img>');
 assert.deepEqual(guide.hexDecision.set,hexDecision(input).set);assert.deepEqual(guide.comparison.map(row=>row.id),input.options);assert.match(rendered,/本局组合/);assert.match(rendered,/优先看这项/);assert.doesNotMatch(rendered,/流派已成形|胜率\s*\d/);
});

test('general hero affinity cannot create an unrelated next choice for an empty or unconnected marked set',()=>{
 for(const owned of [[],[1002]]){assert.deepEqual(analyzeAugmentSet(args('Ashe',[],owned)).next,[]);assert.doesNotMatch(renderHexComparison(args('Ashe',[],owned)),/aria-label="本局组合"/);}
 const next=analyzeAugmentSet(args('Ashe',[],[1048])).next;assert.match(next.find(row=>row.id===1047)?.reason||'',/珠光护手.*暴击/,'Explain the marked-set relation rather than generic hero affinity');assert(!next.some(row=>row.id===1058),'Generic attack affinity is not a relation to spell crit');
 assert.match(renderHexComparison(args('Ashe',[],[1048])),/珠光护手/);
});

test('reviewed ultimate prerequisites conflict symmetrically with an owned ultimate lock, without classifying names as effects',()=>{
 const ids=[1011,1112,1194,1211,1344,1349,1413,2134];
 for(const id of ids){
  const name=data.augments.find(a=>a.id===id).name,row=rankAugmentOptions(args('Ashe',[id],[1004]))[0],reverse=rankAugmentOptions(args('Ashe',[1004],[id]))[0];
  assert.equal(row.level,'conflict',name);assert.equal(row.priority,'有冲突');assert.equal(row.top,false);assert.equal(reverse.level,'conflict');assert.ok(row.cautions.some(text=>text.includes(name)&&text.includes('禁用终极技能')));assert.deepEqual(analyzeAugmentSet(args('Ashe',[],[1004,id])).conflicts,[row.cautions[0]]);
  const unowned=rankAugmentOptions(args('Ashe',[id,1004]))[0];assert.notEqual(unowned.level,'conflict','An offered1004 is not an owned lock');
 }
 const options=[1011,1349,2134],decision=hexDecision(args('Ashe',options,[1004]));assert.deepEqual(decision.rows.map(r=>r.id),options);assert.equal(decision.reroll.recommended,true);assert.equal(decision.reroll.status,'conflict');
 for(const id of [1113,1214,1421,2141])assert.notEqual(rankAugmentOptions(args('Ashe',[id],[1004]))[0].level,'conflict','Do not guess full conflicts from non-ultimate, partial benefit or item/automatic names');
});

test('ultimate conflict review gates both effects and never recommends reroll for a stale or unknown card',()=>{
 const options=[1011,1349,2134];
 for(const id of [1004,...options])for(const change of [{key:'OtherEffect'},{description:'不同效果' }]){
  const changed={...data,augments:data.augments.map(a=>a.id===id?{...a,...change}:a)},result=hexDecision(args('Ashe',options,[1004],{data:changed}));assert.equal(result.reroll.recommended,false);
  if(id===1004)assert.ok(result.rows.every(row=>row.level!=='conflict'));else assert.notEqual(result.rows.find(row=>row.id===id).level,'conflict');
 }
 for(const extra of [{data:{...data,patch:'16.21'}},{mode:'rift'},{mode:'arena'},{data:{...data,champions:data.champions.map(c=>c.id==='Ashe'?{...c,mechanicSource:undefined}:c)}}]){
  const result=hexDecision(args('Ashe',options,[1004],extra));assert.equal(result.reroll.recommended,false);assert.ok(result.rows.every(row=>row.priority==='待核对'));assert.deepEqual(result.set.conflicts,[]);
 }
});

test('a conflict is the visible main/sidebar headline and the first guide warning, before positive trigger instructions',()=>{
 const input=args('Ashe',[1088],[1004]),html=renderHexComparison(input),headline=html.match(/class="hex-advice-summary"[^>]*>([^<]*)<\/p>/)?.[1];assert.match(headline,/回归基本功.*禁用.*终极/);
 const model=createGuideModel(data,{...selectGuide(null,{id:'Ashe',role:'bottom',mode:'hex',compareIds:[1088],ownedAugmentIds:[1004]}),compact:false}),rendered=renderGuide({model},'augments',false,()=>'<img>');assert.ok(rendered.includes('本次选项比较'));const card=rendered.slice(rendered.indexOf('本次选项比较'));assert.match(card,/<small>有冲突<\/small><p class="caution">回归基本功/);
});
