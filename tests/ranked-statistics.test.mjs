import test from 'node:test';import assert from 'node:assert/strict';
import {adaptRankedStatistics,validRankedStatistics,estimateEnemyRoles,createRankedMatchupIndex,rankedDurationReference} from '../src/core/ranked-statistics.mjs';
const roles=['top','jungle','mid','bottom','support'],options={patch:'16.20',source:{region:'global',tier:'emerald_plus'}};
const stat=(winRate=50,samples=1000)=>({basis:'opgg-position-reference',counterScope:'opgg-position-counter-reference',role:{winRate,samples},duration:[0,25,30,35,40].map(minute=>({minute,winRate,average:50}))});
const ref=(champion,role,winRate=50,samples=1000)=>({champion,role,patch:'16.20',region:'global',tier:'emerald_plus',rankedStatistics:{...stat(winRate,samples),positions:[{role,samples}]},matchups:[]});
test('duration bins require correct source units and order; absent bins are not synthesized',()=>{
 const source={summary:{positions:[{name:'MID',stats:{play:200,win_rate:.51}}]},game_lengths:[0,25,30,35,40].map(game_length=>({game_length,rate:.52,average:.5}))};
 const result=adaptRankedStatistics(source,'mid');assert.equal(result.duration[0].winRate,52);assert.equal(result.role.winRate,51);assert(validRankedStatistics(result));
 source.game_lengths[0].rate=52;assert.deepEqual(adaptRankedStatistics(source,'mid').duration,[]);
 assert.equal(validRankedStatistics({...result,duration:[result.duration[0]]}),false);
});
test('role inference retains unknown status, uses unique explicit roles and distributes exactly one opponent per lane',()=>{
 const players=roles.map((role,i)=>({champion:'Hero'+i})),builds=Object.fromEntries(roles.map((role,i)=>['Hero'+i+':'+role,ref('Hero'+i,role)]));
 const estimated=estimateEnemyRoles(players,builds,options);
 for(let i=0;i<5;i++){assert.equal(estimated[i].role,null);assert.equal(estimated[i].estimated,true);assert(estimated[i].roleWeights[roles[i]]>.99);}
 for(const role of roles)assert(Math.abs(estimated.reduce((sum,row)=>sum+row.roleWeights[role],0)-1)<1e-9);
 const explicit=estimateEnemyRoles([{champion:'Hero0',role:'mid'},...players.slice(1)],builds,options);assert.equal(explicit[0].roleWeights.mid,1);assert.equal(explicit[0].estimated,false);
 const empty=estimateEnemyRoles([],{},options);assert.equal(empty.length,5);assert(Math.abs(empty[0].roleWeights.mid-.2)<1e-9);
});
test('counter signal subtracts role baselines, shrinks small samples and excludes wrong patches/sources',()=>{
 const builds={'Own:mid':ref('Own','mid'),'Enemy:mid':ref('Enemy','mid')};
 builds['Own:mid'].matchups=[{champion:'Enemy',samples:10000,wins:6000}];
 const score=()=>createRankedMatchupIndex([{champion:'Enemy',role:'mid'}],builds,options)('Own','mid');
 assert(score().adjustment>0&&score().adjustment<=4);const large=score().adjustment;
 builds['Own:mid'].matchups[0]={champion:'Enemy',samples:100,wins:60};assert(score().adjustment<large/5);
 builds['Own:mid'].patch='16.19';assert.equal(score().adjustment,0);
 builds['Own:mid'].patch='16.20';builds['Own:mid'].region='kr';assert.equal(score().adjustment,0);
 builds['Own:mid'].region='global';delete builds['Own:mid'].rankedStatistics.counterScope;assert.equal(score().adjustment,0,'Legacy unknown-relationship tables have no ranked counter scoring authority');
});
test('role estimates use full source distribution and do not depend on which role caches have arrived',()=>{
 const positions=[{role:'mid',samples:600},{role:'top',samples:240},{role:'bottom',samples:150}],builds={'Yasuo:mid':ref('Yasuo','mid')};builds['Yasuo:mid'].rankedStatistics.positions=positions;
 const before=estimateEnemyRoles([{champion:'Yasuo'}],builds,options)[0].roleWeights;
 assert(before.mid>.59&&before.mid<.62);for(const role of ['top','bottom'])builds['Yasuo:'+role]={...ref('Yasuo',role),rankedStatistics:{...stat(),positions}};
 assert.deepEqual(estimateEnemyRoles([{champion:'Yasuo'}],builds,options)[0].roleWeights,before);
 delete builds['Yasuo:mid'].rankedStatistics.positions;delete builds['Yasuo:top'];delete builds['Yasuo:bottom'];const unknown=estimateEnemyRoles([{champion:'Yasuo'}],builds,options)[0].roleWeights;assert(Math.abs(unknown.mid-.2)<1e-9);
});
test('duration reference requires complete draft and source coverage, keeps independent means rather than fake complementary probabilities',()=>{
 const allies=roles.map((role,i)=>({role,champion:'A'+i})),enemies=roles.map((role,i)=>({role,champion:'B'+i}));
 const builds=Object.fromEntries([...allies.map(row=>[row.champion+':'+row.role,ref(row.champion,row.role,52)]),...enemies.map(row=>[row.champion+':'+row.role,ref(row.champion,row.role,51)])]);
 assert.equal(rankedDurationReference({complete:false,allies,enemies},builds,options),null);
 const curve=rankedDurationReference({complete:true,allies,enemies},builds,options);assert.equal(curve.allies.points[0].winRate,52);assert.equal(curve.enemies.points[0].winRate,51);
 delete builds['A0:top'];assert.equal(rankedDurationReference({complete:true,allies,enemies},builds,options),null);
});
