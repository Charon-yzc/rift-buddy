import test from 'node:test';import assert from 'node:assert/strict';
import {cleanChampionUsage,championUsageWeights,roomChampionUsageWeights,familiarMass,DEFAULT_FAMILIAR_MASS} from '../src/core/champion-usage.mjs';
const heroes=['Ahri','Ashe','Nami','Garen'],sum=values=>Object.values(values).reduce((a,b)=>a+b,0),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
test('played champions share .85 by actual frequency and every unseen champion shares .15',()=>{
 const w=championUsageWeights(heroes,{sampled:100,counts:{Ahri:60,Ashe:40}});near(w.Ahri,.51);near(w.Ashe,.34);near(w.Nami,.075);near(w.Garen,.075);near(sum(w),1);
});
test('fewer than 500 matches have the same total influence and relative distribution',()=>{
 const short={sampled:50,counts:{Ahri:30,Ashe:20}},long={sampled:500,counts:{Ahri:300,Ashe:200}};
 assert.deepEqual(championUsageWeights(heroes,short),championUsageWeights(heroes,long));
 assert.deepEqual(roomChampionUsageWeights(heroes,[{usage:short},{usage:long}]),championUsageWeights(heroes,short));
});
test('room aggregation averages personal distributions; assignment must keep the original member profiles',()=>{
 const a={sampled:1,counts:{Ahri:1}},b={sampled:500,counts:{Nami:500}},wa=championUsageWeights(heroes,a),wb=championUsageWeights(heroes,b);
 const room=roomChampionUsageWeights(heroes,[{usage:a},{usage:b}]);for(const h of heroes)near(room[h],(wa[h]+wb[h])/2);near(sum(room),1);
 assert.ok(wa.Ahri>wa.Nami&&wb.Nami>wb.Ahri);assert.deepEqual(championUsageWeights(heroes,a),wa);
});
test('legal candidate filtering retains85/15 even when the most played hero is banned',()=>{
 const history={sampled:100,counts:{Ahri:90,Ashe:10}},w=championUsageWeights(['Ashe','Nami','Garen'],history);near(w.Ashe,.85);near(w.Nami+w.Garen,.15);
 for(const mass of [0,1]){assert.deepEqual(championUsageWeights(['Nami','Garen'],history,mass),{Nami:.5,Garen:.5});assert.deepEqual(championUsageWeights(['Ashe'],history,mass),{Ashe:1});}
 const current=championUsageWeights(['Ashe','Nami'],{sampled:20,counts:{Retired:10,Ashe:10}});near(current.Ashe,.85);near(current.Nami,.15);
});
test('slider changes complementary masses, including intentional zero and one endpoints',()=>{
 const usage={sampled:10,counts:{Ahri:10}};for(const mass of [0,.2,.8,.85,.9,1]){const w=championUsageWeights(heroes,usage,mass);near(w.Ahri,mass);near(w.Ashe+w.Nami+w.Garen,1-mass);near(sum(w),1);}
 for(const bad of [undefined,null,'0.9',NaN,Infinity,-.1,1.1])assert.equal(familiarMass(bad),DEFAULT_FAMILIAR_MASS);
});
test('no history, no unseen heroes and no eligible heroes remain well-defined',()=>{
 assert.deepEqual(championUsageWeights(heroes),{Ahri:.25,Ashe:.25,Nami:.25,Garen:.25});
 assert.deepEqual(championUsageWeights(['Ahri','Ashe'],{sampled:4,counts:{Ahri:3,Ashe:1}},.85),{Ahri:.75,Ashe:.25});
 assert.deepEqual(championUsageWeights([],undefined),{});assert.deepEqual(roomChampionUsageWeights([],[]),{});
 // Removed/unknown heroes are not injected into the current champion universe.
 assert.deepEqual(championUsageWeights(['Ahri'],{sampled:5,counts:{Retired:5}}),{Ahri:1});
});
test('shared summaries contain only bounded anonymous counts and do not retain caller objects',()=>{
 const raw={sampled:2,counts:{Ahri:2,Ashe:0},puuid:'private-player',matches:[{id:123}],notes:'private',token:'private'};
 const clean=cleanChampionUsage(raw);assert.deepEqual(clean,{sampled:2,counts:{Ahri:2}});raw.counts.Ahri=1;assert.equal(clean.counts.Ahri,2);
 for(const value of [{sampled:501,counts:{}},{sampled:1,counts:{Ahri:2}},{sampled:1,counts:{Ahri:-1}},{sampled:1,counts:{Ahri:.5}},{sampled:1,counts:{Ahri:Infinity}},{sampled:1,counts:{'../escape':1}},{sampled:1,counts:[]},{sampled:1,counts:null}])assert.throws(()=>cleanChampionUsage(value));
 assert.throws(()=>championUsageWeights(['Ahri','Ahri']));assert.throws(()=>roomChampionUsageWeights(heroes,Array(13).fill({})));
});
