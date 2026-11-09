import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import builds from '../data/hex-builds.json' with {type:'json'};

import {rankAugmentOptions,recommendAugmentReroll,hexDecision} from '../src/core/hex-decisions.mjs';
import {createHexRoundStore} from '../src/core/hex-round.mjs';
import {hexManualAugments} from '../src/core/hex-acquisition.mjs';
const data={...game,hexBuilds:builds.entries},ids=hexManualAugments(data).slice(0,4).map(a=>a.id);
test('actual offers keep their order while unreviewed advice never nominates a best choice or reroll',()=>{
 const store=createHexRoundStore({newToken:()=> 'order'});store.select('Gwen',data);const order=[ids[2],ids[0],ids[1]];
 for(const id of order)store.change({...store.snapshot().manual,operation:'compare',id},data);
 const before=store.snapshot(),args={data,hero:'Gwen',options:before.manual.options};
 assert.deepEqual(before.manual.options,order);assert.deepEqual(rankAugmentOptions(args),[]);
 assert.equal(recommendAugmentReroll(args).recommended,false);assert.deepEqual(store.snapshot(),before);
});
test('missing, repeated, oversized and already-owned options cannot trigger automatic rerolls',()=>{
 for(const options of [[],ids.slice(0,2),[ids[0],ids[0],ids[1]],[ids[0],ids[1],999999],ids]){
  const result=hexDecision({data,hero:'Ashe',options,owned:[ids[0]]});assert.equal(result.reroll.recommended,false);assert(result.rows.every(r=>!r.top&&r.rank==null));
 }
});
