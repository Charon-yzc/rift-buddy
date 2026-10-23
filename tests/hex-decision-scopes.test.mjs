import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {hexDecision,analyzeAugmentSet} from '../src/core/hex-decisions.mjs';
import {hexRecommendations} from '../src/core/hex-recommendations.mjs';
import {renderHexComparison} from '../src/hex-view.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {renderGuide} from '../src/guide-view.mjs';
const base=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),fixture=JSON.parse(await fs.readFile(new URL('./fixtures/hex-routes-16.21.json',import.meta.url)));
// Deliberately withhold all hero-kit evidence. Only the current reviewed
// augment effects and roster identities are relevant to these relations.
const data={...base,...fixture.game,champions:base.champions.map(c=>({...c,mechanicSource:undefined,stats:{}}))};
const options=[1011,1349,2134],owned=[1004],args=(extra={})=>({data,hero:'Ahri',options,owned,...extra});

test('known augment-only conflicts survive missing hero reviews across the entire roster',()=>{
 const before=JSON.stringify(data);
 for(const hero of data.champions){
  const result=hexDecision(args({hero:hero.id}));
  assert.deepEqual(result.rows.map(r=>r.id),options);
  assert(result.rows.every(r=>r.level==='conflict'&&r.priority==='有冲突'&&r.rank===null&&!r.top&&!r.heroReviewed),hero.id);
  assert.equal(result.reroll.recommended,true,hero.id);
  const set=analyzeAugmentSet(args({hero:hero.id,options:[],owned:[1004,1088]}));assert.equal(set.conflicts.length,1,hero.id);assert.equal(set.pending,0);
 }
 assert.equal(JSON.stringify(data),before);
});

test('reviewed links remain conditional, never lend hero affinity or endorse a best choice',()=>{
 for(const hero of data.champions){
  const input=args({hero:hero.id,options:[1047,1058,1141],owned:[1048]}),result=hexDecision(input),raw=hexRecommendations(input);
  assert(result.rows.every(r=>!r.top&&r.rank===null));assert.equal(raw.bestChoice,null);
  const linked=result.rows.find(r=>r.id===1047);assert.equal(linked.level,'conditional');assert(linked.interactions.length);assert.match(linked.reasons.join(' '),/珠光护手/);
  assert.equal(result.rows.find(r=>r.id===1141).level,'conditional');assert.doesNotMatch(result.rows.find(r=>r.id===1141).reasons.join(' '),/已核实的友方|这个英雄有对友方/);
  assert(analyzeAugmentSet(args({hero:hero.id,options:[],owned:[1048]})).next.some(r=>r.id===1047));
  assert.deepEqual(analyzeAugmentSet(args({hero:hero.id,options:[],owned:[1002]})).next,[]);
 }
});

test('both effects, patch, mode and known identity still guard every independent relation',()=>{
 for(const id of [1004,...options])for(const field of ['key','description']){
  const changed=structuredClone(data);changed.augments.find(a=>a.id===id)[field]='Changed effect';
  const result=hexDecision(args({data:changed}));assert.equal(result.reroll.recommended,false);
  assert.equal(result.rows.filter(r=>r.level==='conflict').length,id===1004?0:2);
 }
 for(const id of [1047,1048]){const changed=structuredClone(data);changed.augments.find(a=>a.id===id).description+=' changed';const result=hexDecision(args({data:changed,options:[1047],owned:[1048]}));assert.deepEqual(result.rows[0].interactions,[]);assert.deepEqual(analyzeAugmentSet(args({data:changed,options:[],owned:[1048]})).next,[]);}
 for(const extra of [{data:{...data,patch:'16.22'}},{mode:'rift'},{mode:'arena'},{hero:'Unknown'}]){const result=hexDecision(args(extra));assert.equal(result.reroll.recommended,false);assert(result.rows.every(r=>r.level==='reference'&&!r.top));assert.deepEqual(result.set.conflicts,[]);}
 const unowned=hexDecision(args({options:[1088,1004,1047],owned:[]}));assert(unowned.rows.every(r=>r.level!=='conflict'));
});

test('main/sidebar and guide retain the same conflict headline without claiming a changed kit',()=>{
 const input=args(),html=renderHexComparison(input);assert.equal((html.match(/data-hex-level="conflict"/g)||[]).length,3);assert.match(html,/三项都与已选强化存在已核对冲突/);assert.doesNotMatch(html,/英雄技能源有变动或缺失/);
 const model=createGuideModel(data,{...selectGuide(null,{id:'Ahri',role:'mid',mode:'hex',compareIds:options,ownedAugmentIds:owned}),compact:false});
 assert.deepEqual(model.comparison.map(r=>r.level),['conflict','conflict','conflict']);assert.equal(model.hexDecision.reroll.recommended,true);
 const guide=renderGuide({model},'augments',false,()=>'<img>');assert.doesNotMatch(guide,/data-tab=|本次选项比较/);assert.match(model.hexDecision.reroll.text,/冲突/);
});
