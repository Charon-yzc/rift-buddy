import test from 'node:test';import assert from 'node:assert/strict';
import {championStatisticsView} from '../src/champion-statistics-view.mjs';
import {durationChart} from '../src/duration-chart-view.mjs';
import {rankedLaneReferences} from '../src/core/ranked-statistics.mjs';
const roles=['top','jungle','mid','bottom','support'],source={region:'global',tier:'emerald_plus'},points=[0,25,30,35,40].map(minute=>({minute,winRate:52,average:50}));
const reference=(champion,role)=>({champion,role,patch:'16.20',...source,fetchedAt:new Date().toISOString(),rankedStatistics:{basis:'opgg-position-reference',counterScope:'opgg-position-counter-reference',role:{winRate:52,samples:1000},positions:[{role,samples:1000}],duration:points},matchups:[]});
test('matching personal duration reference appears only after own confirmation, including a trade',()=>{
 const data={patch:'16.20',buildSource:source,champions:[{id:'Ahri',key:103,name:'阿狸'},{id:'Ashe',key:22,name:'艾希'}],builds:{'Ahri:mid':reference('Ahri','mid')}},selection={id:'Ahri',role:'mid',mode:'rift'};
 const client={connected:true,phase:'ChampSelect',game:{queueId:430},session:{localPlayerCellId:0,myTeam:[{cellId:0,championId:103}],actions:[]}};
 assert.equal(championStatisticsView(client,data,selection),'');client.session.actions=[{type:'pick',actorCellId:0,championId:22,completed:true}];
 const html=championStatisticsView(client,data,selection);assert.match(html,/阿狸走势/);assert.match(html,/0–25 分钟/);assert.match(html,/2026\/10\/19/);assert(!html.includes('<details class="champion-statistics" open'));
 assert.equal(championStatisticsView(client,data,{...selection,id:'Ashe'}),'');data.builds['Ahri:mid'].patch='16.19';assert.match(championStatisticsView(client,data,selection),/暂无完整统计/);assert(!championStatisticsView(client,data,selection).includes('<svg'));
});
test('duration chart begins at zero and represents full source intervals without invented early knots',()=>{
 const html=durationChart([{name:'我方',id:'ally',points}]);assert.match(html,/>0<\/text>/);assert.match(html,/M38,/);assert.match(html,/0–25 分钟结束/);assert.equal((html.match(/<circle/g)||[]).length,5);assert(!html.includes('· 5 分钟结束'));assert(!html.includes('<polyline'));
});
test('lane history uses actual samples when positions are public and leaves insufficient coverage empty',()=>{
 const allies=roles.map((role,i)=>({role,champion:'A'+i})),enemies=roles.map((role,i)=>({role,champion:'B'+i})),builds=Object.fromEntries(allies.map(player=>[player.champion+':'+player.role,reference(player.champion,player.role)]));
 allies.forEach((player,i)=>builds[player.champion+':'+player.role].matchups=[{champion:'B'+i,relationship:'unknown',samples:1000,wins:530}]);
 const draft={complete:true,allies,enemies},rows=rankedLaneReferences(draft,builds,{patch:'16.20',source});assert.equal(rows.length,5);assert(rows.every(row=>row.available&&row.winRate===53&&!row.estimated&&row.evidence[0].samples===1000));
 delete builds['A0:top'];assert.equal(rankedLaneReferences(draft,builds,{patch:'16.20',source})[0].available,false);assert.deepEqual(rankedLaneReferences({...draft,complete:false},builds,{patch:'16.20',source}),[]);
});
