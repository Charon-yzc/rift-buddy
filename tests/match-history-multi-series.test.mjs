import test from 'node:test';
import assert from 'node:assert/strict';
import * as chart from '../src/match-history-chart-view.mjs';

const participants=[{id:1,name:'本人',team:'TEAM-100'},{id:2,name:'队友',team:'TEAM-100'},{id:3,name:'对手',team:'TEAM-200'},{id:4,name:'未读取队伍',team:'TEAM-unknown'}];
const game={id:777,self:participants[0],participants};
const timeline={events:[],frames:[
 {timestamp:60000,players:[{id:1,gold:100},{id:2,gold:300},{id:3,gold:600},{id:4,gold:999}]},
 {timestamp:120000,players:[{id:1,gold:null},{id:2,gold:500},{id:3,gold:0}]},
 {timestamp:180000,players:[{id:1,gold:400},{id:2,gold:null},{id:3,gold:null}]},
 {timestamp:240000,players:[]}
]};

test('multiple selected players produce simultaneous curves with real gaps and selectable snapshots',()=>{
 const html=chart.historyTimelineChart({game,timeline,chartMode:'multi',chartPlayers:'[1,2,3,1,999]'});
 for(const id of [1,2,3])assert.match(html,new RegExp('data-chart-series="player-'+id+'"'));
 assert.ok(!html.includes('data-chart-series="player-999"'));
 assert.match(html,/<select[^>]*data-chart-field="chartPlayers"[^>]*multiple/);
 const path=html.match(/data-chart-series="player-1" d="([^"]*)"/)[1];
 assert.equal((path.match(/M/g)||[]).length,2,'missing minute must split player curve');
 assert.match(html,/data-chart-field="chartFrame" data-value="2"/);
 assert.match(html,/data-chart-field="chartPlayer" data-value="2"/);
 assert.ok(!/NaN|Infinity/.test(html));
});

test('team means derive only from known metric values in each frame and expose sample coverage',()=>{
 assert.equal(typeof chart.historyTimelineSeries,'function');
 const result=chart.historyTimelineSeries({game,timeline,chartMode:'team',chartTeam:'all'});
 const blue=result.series.find(s=>s.team==='TEAM-100'),red=result.series.find(s=>s.team==='TEAM-200');
 assert.ok(blue);assert.ok(red);assert.equal(result.series.length,2);
 assert.deepEqual(result.rows.map(row=>row[blue.key]),[200,500,400,null]);
 assert.deepEqual(result.rows.map(row=>row[red.key]),[600,0,null,null]);
 assert.deepEqual(result.rows.map(row=>row.coverage[blue.key]),[{known:2,total:2},{known:1,total:2},{known:1,total:2},{known:0,total:2}]);
 const html=chart.historyTimelineChart({game,timeline,chartMode:'multi',chartPlayers:'1,3',chartTeam:'TEAM-100'});
 assert.match(html,/data-chart-series="team-TEAM-100"/);
 assert.match(html,/500[^<]*（1\/2/);
 assert.match(html,/data-chart-field="chartTeam"/);
 assert.match(html,/已知/);
});

test('legacy comparison and difference keep missing values unknown and multi selections stay bounded',()=>{
 assert.equal(typeof chart.historyTimelineSeries,'function');
 const result=chart.historyTimelineSeries({game,timeline,chartMode:'difference',chartPlayer:1,chartCompare:3});
 assert.deepEqual(result.rows.map(row=>row.difference),[-500,null,null,null]);
 const html=chart.historyTimelineChart({game,timeline,chartMode:'difference',chartPlayer:1,chartCompare:3});
 assert.match(html,/data-chart-series="difference"/);assert.match(html,/data-chart-zero="true"/);
 assert.match(chart.historyTimelineChart({game,timeline,chartPlayer:1,chartCompare:3}),/data-chart-series="compare"/);
 const selected=chart.historyTimelineSeries({game,timeline,chartMode:'multi',chartPlayers:[2,2,1,0,'',999]});
 assert.deepEqual(selected.players.map(p=>p.id),[2,1]);
 const empty=chart.historyTimelineChart({game,timeline,chartMode:'multi',chartPlayers:[]});
 assert.match(empty,/选择.*玩家/);assert.ok(!empty.includes('data-chart-series="player-'));
});
