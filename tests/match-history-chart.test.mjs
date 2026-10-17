import test from 'node:test';
import assert from 'node:assert/strict';
import {historyTimelineChart} from '../src/match-history-chart-view.mjs';
test('timeline comparison uses selected participants and preserves unknown samples as gaps',()=>{
 const game={self:{id:1},participants:[{id:1,name:'本人'},{id:2,name:'对手'}]},timeline={frames:[{timestamp:60000,players:[{id:1,gold:600},{id:2,gold:700}]},{timestamp:120000,players:[{id:1,gold:1000},{id:2,gold:null}]},{timestamp:180000,players:[{id:1,gold:1400},{id:2,gold:1500}]}],events:[]};
 const html=historyTimelineChart({game,timeline,chartMetric:'gold',chartPlayer:1,chartCompare:2});
 assert.match(html,/本人/);assert.match(html,/对手/);assert.match(html,/-100/);assert.match(html,/未读取/);assert.ok(!html.includes('NaN'));
});
