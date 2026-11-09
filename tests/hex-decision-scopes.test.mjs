import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import builds from '../data/hex-builds.json' with {type:'json'};

import {hexDecision,analyzeAugmentSet} from '../src/core/hex-decisions.mjs';
import {hexManualAugments} from '../src/core/hex-acquisition.mjs';
const data={...game,hexBuilds:builds.entries},ids=hexManualAugments(data).slice(0,3).map(a=>a.id);
test('current actual marks do not acquire archived conflicts or hero claims when identities match',()=>{
 for(const hero of data.champions){
  const result=hexDecision({data,hero:hero.id,options:ids,owned:[1004,1088]});
  assert.deepEqual(result.rows,[]);assert.deepEqual(result.set.synergies,[]);assert.deepEqual(result.set.conflicts,[]);assert.deepEqual(result.set.next,[]);
  assert.equal(result.reroll.recommended,false);assert.deepEqual(result.equipment,[]);
 }
});
test('duplicate and missing owned records retain honest counts without creating usable effects',()=>{
 const args={data,hero:'Ashe',owned:[ids[0],ids[0],999999]},result=analyzeAugmentSet(args);
 assert.equal(result.count,1);assert.equal(result.missing,1);assert.equal(result.pending,1);assert.deepEqual(result.synergies,[]);
 assert.deepEqual(analyzeAugmentSet({...args,mode:'rift'}).synergies,[]);
});
