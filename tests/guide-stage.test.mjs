import test from 'node:test';
import assert from 'node:assert/strict';
import {gamePhase,GAME_PHASES} from '../src/core/guide-stage.mjs';

const live=(patch={})=>({matched:true,gameTime:100,gold:500,...patch});

test('game phases switch on the clock and stay silent without live data',()=>{
 assert.equal(gamePhase(null)?.id,undefined);
 assert.equal(gamePhase({matched:false,gameTime:100}),null);
 assert.equal(gamePhase({matched:true,gameTime:-5}),null);
 assert.equal(gamePhase({matched:true,gameTime:null}),null);
 assert.equal(gamePhase({matched:true}),null);
 assert.equal(gamePhase(live({gameTime:0})).id,'lane');
 assert.equal(gamePhase(live({gameTime:299})).id,'lane');
 assert.equal(gamePhase(live({gameTime:300})).id,'mid');
 assert.equal(gamePhase(live({gameTime:1199})).id,'mid');
 assert.equal(gamePhase(live({gameTime:1200})).id,'late');
 assert.deepEqual(Object.keys(GAME_PHASES).sort(),['lane','late','mid']);
});

test('objective windows appear only around their soft timings',()=>{
 const has=(t,text)=>gamePhase(live({gameTime:t})).tips.some(tip=>tip.includes(text));
 assert.equal(has(200,'小龙'),true);
 assert.equal(has(100,'小龙'),false);
 assert.equal(has(800,'先锋'),true);
 assert.equal(has(500,'先锋'),false);
 assert.equal(has(1200,'大龙出生前后'),true);
 assert.equal(has(1000,'大龙出生前后'),false);
 assert.equal(has(1150,'大龙出生前后'),true);
 assert.equal(has(320,'小龙'),true);
});

test('recall hints follow affordable state, never invent gold',()=>{
 const rich=gamePhase(live({gameTime:100,gold:2000}),{shortfall:0},{name:'无尽之刃'});
 assert.ok(rich.tips.some(t=>t.includes('回城')));
 const near=gamePhase(live({gameTime:100,gold:1000}),{shortfall:200},{name:'无尽之刃'});
 assert.ok(near.tips.some(t=>t.includes('还差约200金')));
 const far=gamePhase(live({gameTime:100,gold:100}),{shortfall:2000},{name:'无尽之刃'});
 assert.ok(far.tips.every(t=>!t.includes('回城')&&!t.includes('还差')));
 const nullGold=gamePhase({...live({gameTime:100}),gold:null},{shortfall:0});
 assert.ok(nullGold.tips.every(t=>!t.includes('回城')));
});
