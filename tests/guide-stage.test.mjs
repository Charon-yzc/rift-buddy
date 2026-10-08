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
 assert.equal(gamePhase(live({gameTime:600})).id,'lane');
 assert.equal(gamePhase(live({gameTime:840})).id,'mid');
 assert.equal(gamePhase(live({gameTime:1499})).id,'mid');
 assert.equal(gamePhase(live({gameTime:1500})).id,'late');
 assert.deepEqual(Object.keys(GAME_PHASES).sort(),['lane','late','mid']);
});

test('clock-only advice cannot invent objective respawns and early tips reflect the selected role',()=>{
 for(const gameTime of [200,800,1150,1200])assert.equal(gamePhase(live({gameTime})).tips.some(t=>/刷新|出生|复活/.test(t)),false);
 assert.match(gamePhase(live({role:'jungle'})).tips[0],/刷野/);
 assert.match(gamePhase(live({role:'support'})).tips[0],/搭档/);
});

test('recall hints follow affordable state, never invent gold',()=>{
 const rich=gamePhase(live({gameTime:100,gold:2000}),{shortfall:0},{name:'无尽之刃'});
 assert.ok(rich.tips.some(t=>t.includes('回城')));
 const near=gamePhase(live({gameTime:100,gold:1000}),{shortfall:200},{name:'无尽之刃'});
 assert.ok(near.tips.some(t=>t.includes('还差约200金')));
 const far=gamePhase(live({gameTime:100,gold:100}),{shortfall:2000},{name:'无尽之刃'});
 assert.ok(far.tips.every(t=>!/当前金币可买|还差/.test(t)));
 const nullGold=gamePhase({...live({gameTime:100}),gold:null},{shortfall:0});
 assert.ok(nullGold.tips.every(t=>!/当前金币可买|还差/.test(t)));
});
