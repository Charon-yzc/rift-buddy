import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {hexDecision,analyzeAugmentSet} from '../src/core/hex-decisions.mjs';
import {createHexRecommendations,hexRecommendations} from '../src/core/hex-recommendations.mjs';
import {createAugmentComparison,compareAugments} from '../src/core/hex-compare.mjs';
const game=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url)));
game.hexBuilds=JSON.parse(await fs.readFile(new URL('../data/hex-builds.json',import.meta.url))).entries;
const args=(data,extra={})=>({data,hero:'Sona',options:[1011,1349,2134],owned:[1004],...extra});

test('one evaluator recomputes ownership effects for every subset and empty baseline',()=>{
 const data=structuredClone(game),before=JSON.stringify(data),evaluate=createHexRecommendations({data,hero:'Sona'});
 const withR=evaluate({options:[1011,1349,2134],owned:[]}),withoutR=evaluate({options:[1011,1349,2134],owned:[1004]}),restored=evaluate({options:[1011,1349,2134],owned:[]});
 assert(withR.rows.every(r=>r.level!=='conflict'));assert(withoutR.rows.every(r=>r.level==='conflict'));assert.deepEqual(restored,withR);
 const linked=evaluate({options:[1047],owned:[1048]});assert(linked.rows[0].interactions.length);assert(linked.rows[0].markedReasons.length);
 assert.deepEqual(evaluate({options:[1047],owned:[]}).rows[0].interactions,[]);
 const set=analyzeAugmentSet(args(data,{owned:[1047,1048],options:[]}));assert.equal(set.count,2);assert(set.synergies.length);
 assert.equal(JSON.stringify(data),before);assert(withoutR.rows.every(r=>r.level==='conflict'),'Later evaluations never rewrite prior results');
});

test('new public calls recheck effect and champion source changes on the same object',()=>{
 const data=structuredClone(game),original=hexDecision(args(data));assert(original.reroll.recommended);
 data.augments.find(a=>a.id===1004).description+=' changed';assert.equal(hexDecision(args(data)).reroll.recommended,false);
 data.augments=structuredClone(game.augments);assert.deepEqual(hexDecision(args(data)),original);
 const kitArgs=args(data,{options:[1141],owned:[]}),reviewed=hexRecommendations(kitArgs);assert.equal(reviewed.rows[0].heroReviewed,true);
 data.champions.find(c=>c.id==='Sona').mechanicSource.spells[0].tooltip+=' changed';
 assert.equal(hexRecommendations(kitArgs).rows[0].heroReviewed,false);
 assert.equal(hexDecision(args(data)).reroll.recommended,true,'Independent augment conflicts do not need a reviewed kit');
});

test('new calls recheck item, source-reference and current-data gates independently',()=>{
 const data=structuredClone(game),input=args(data,{options:[1002],owned:[1002]}),first=hexRecommendations(input);
 assert(first.equipment.some(r=>r.items.some(i=>i.id===3157)));
 data.items[3157].description+=' changed';assert(!hexRecommendations(input).equipment.some(r=>r.items.some(i=>i.id===3157)));
 const source=args(data,{options:[],owned:[]});assert(hexRecommendations(source).rows.some(r=>r.fromSource));
 data.hexBuilds.Sona.sourceUrl='https://example.invalid/build';assert(hexRecommendations(source).rows.every(r=>!r.fromSource));
 for(const mutate of [d=>d.patch='16.22',d=>d.version='16.20.1',d=>d.augmentError='unavailable',d=>d.sources.augmentDescriptions='https://example.invalid/augments']){
  const changed=structuredClone(game);mutate(changed);assert.deepEqual(hexDecision(args(changed)).rows,[]);
 }
});

test('projected official corrections stay isolated from results and recheck changed tooltips',()=>{
 const data=structuredClone(game),champion=data.champions.find(c=>c.id==='Sona'),evaluate=createAugmentComparison({champion,augments:data.augments,patch:data.patch});
 const first=evaluate({options:[2072],owned:[]});assert(first[0].review);const expected=structuredClone(first);
 first[0].review.note='caller edit';first[0].cautions.push('caller edit');
 assert.deepEqual(evaluate({options:[2072],owned:[]}),expected);
 data.augments.find(a=>a.id===2072).tooltip.description+=' changed';
 assert.equal(compareAugments({champion,augments:data.augments,patch:data.patch,options:[2072]})[0].review,undefined);
});

test('comparison and recommendation preserve their distinct duplicate-record semantics',()=>{
 const data=structuredClone(game),original=data.augments.find(a=>a.id===1004),changed={...original,description:original.description+' duplicate'};data.augments.push(changed);
 const result=hexRecommendations(args(data,{options:[1004],owned:[]}));
 assert.equal(result.rows[0].description,changed.description,'Comparison display uses the last ID as before');
 assert.equal(result.rows[0].mechanicReviewed,true,'Recommendation mechanism lookup still uses the first ID');
 assert.equal(compareAugments({augments:data.augments,patch:data.patch,options:[1004]})[0].description,changed.description);
});

test('unknown identities, non-Hex modes, partial and missing marks retain reference boundaries',()=>{
 const data=structuredClone(game);
 assert.equal(hexDecision(args(data,{hero:'Unknown'})).reroll.status,'hero');
 for(const mode of ['rift','arena']){const result=hexDecision(args(data,{mode}));assert(result.rows.every(r=>r.level==='reference'));assert.equal(result.reroll.recommended,false);}
 const set=analyzeAugmentSet(args(data,{owned:[1004,1004,999999],options:[]}));assert.equal(set.count,1);assert.equal(set.missing,1);
});
