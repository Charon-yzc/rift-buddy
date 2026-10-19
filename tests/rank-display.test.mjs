import test from 'node:test';
import assert from 'node:assert/strict';
import {rankTierLabel,RANK_TIER_SHORT,RANK_TIER_FULL} from '../src/core/rank-display.mjs';

test('one tier table serves both wordings, and a missing tier never becomes a real one',()=>{
 assert.equal(rankTierLabel('GOLD',{division:'I'}),'黄金 I');
 assert.equal(rankTierLabel('gold',{honorific:true,division:'I'}),'荣耀黄金 I');
 assert.equal(rankTierLabel('MASTER',{division:'I'}),'大师 I','The refactor keeps printing whatever division the client returned');
 assert.equal(rankTierLabel('GOLD',{division:'V'}),'黄金','An invented division is not printed');
 assert.equal(rankTierLabel(''),'未读取');
 assert.equal(rankTierLabel(null,{honorific:true,missing:'段位未读取'}),'段位未读取');
 assert.equal(rankTierLabel('NONE',{none:'未定级'}),'未定级');
 assert.equal(rankTierLabel('NONE'),'NONE','Without an explicit none label the raw value passes through, as before');
 assert.equal(rankTierLabel('PLATINUM_X'),'PLATINUM_X');
 const shared=Object.keys(RANK_TIER_SHORT).sort();assert.deepEqual(shared,Object.keys(RANK_TIER_FULL).filter(key=>key!=='NONE').sort(),'Both spellings cover the same tiers');
});
