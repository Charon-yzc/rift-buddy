import test from 'node:test';import assert from 'node:assert/strict';
import {prepareHeroWithSource} from '../src/core/hero-source-preparation.mjs';
test('missing source selects the hero first, waits without writing fallback configuration, then applies fresh source once',async()=>{
 let resolve,context='game:hero:source:personal',writes=0;const events=[],pending=new Promise(done=>resolve=done),build={mode:'rift',loadoutId:'default',reference:null};
 const result=prepareHeroWithSource({build,canRefresh:true,apply:async hoverOnly=>{events.push(hoverOnly?'hover':'apply');if(!hoverOnly)writes++;return {steps:{hover:{status:'done'}},complete:true};},refresh:async()=>{events.push('fetch');return pending;},snapshot:()=>context,rebuild:()=>{events.push('rebuild');return {...build,reference:{source:'OP.GG'}};}});
 await new Promise(done=>setImmediate(done));assert.deepEqual(events,['hover','fetch']);assert.equal(writes,0);resolve({source:'OP.GG'});assert.equal((await result).complete,true);assert.deepEqual(events,['hover','fetch','rebuild','apply']);assert.equal(writes,1);
});
test('failed source or changes to game, hero, filter or personal choices keep the hover and stop later configuration writes',async()=>{
 for(const changed of [false,true]){let context='before',writes=0;await assert.rejects(()=>prepareHeroWithSource({build:{mode:'rift',loadoutId:'default'},canRefresh:true,apply:async hoverOnly=>{if(!hoverOnly)writes++;return {steps:{hover:{status:'done'}}};},refresh:async()=>{if(changed)context='changed';return changed?{}:null;},snapshot:()=>context,rebuild:()=>assert.fail('Do not materialize a stale result')}),/英雄已选好/);assert.equal(writes,0);}
});
test('cached sources, explicit authored routes and unavailable refresh retain one immediate explicit preparation',async()=>{
 for(const fixture of [{reference:{}},{loadoutId:'authored'},{canRefresh:false}]){const calls=[];await prepareHeroWithSource({build:{mode:'rift',loadoutId:'default',...fixture},canRefresh:fixture.canRefresh!==false,apply:async only=>calls.push(only),refresh:()=>assert.fail('No fetch'),snapshot:()=>'',rebuild:()=>{}});assert.deepEqual(calls,[false]);}
});
test('a successful hover followed by a new operation identity cannot fetch or apply in the new draft',async()=>{
 let context='old-game';const calls=[];
 await assert.rejects(()=>prepareHeroWithSource({build:{mode:'rift',loadoutId:'default'},canRefresh:true,apply:async only=>{calls.push(only);context='new-game';return {steps:{hover:{status:'done'}}};},snapshot:()=>context,refresh:()=>assert.fail('Old click must not fetch in the new draft'),rebuild:()=>assert.fail('Old click must not rebuild')}),/选人或配置已变化/);
 assert.deepEqual(calls,[true]);
});
