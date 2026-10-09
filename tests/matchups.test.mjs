import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {adaptMatchups,validMatchups,matchupEstimate} from '../src/core/matchups.mjs';
import {matchupView} from '../src/matchup-view.mjs';
import {validReference} from '../src/core/builds.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
const builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
test('optional public matchup tables strip unknown champions, duplicates and impossible counts',()=>{
 const rows=adaptMatchups([{champion_id:202,play:606,win:312,private:'discard'},{champion_id:202,play:900,win:500},{champion_id:22,play:10,win:1},{champion_id:999999,play:10,win:5},{champion_id:222,play:100,win:101}],data.champions,'Ashe');
 assert.deepEqual(rows,[{champion:'Jhin',relationship:'unknown',samples:606,wins:312}]);assert.equal(validMatchups(rows),true);
 assert.equal(validMatchups([...rows,...rows]),false);assert.equal(validMatchups([{...rows[0],wins:-1}]),false);assert.equal(validMatchups([{...rows[0],relationship:'favorable'}]),false);
 assert.deepEqual(adaptMatchups({},data.champions,'Ashe'),[]);
});
test('small matchup samples receive wide uncertainty and cannot imply an automatic counter pick',()=>{
 const small=matchupEstimate({champion:'Jhin',relationship:'unknown',samples:2,wins:2}),large=matchupEstimate({champion:'Jhin',relationship:'unknown',samples:2000,wins:2000});
 assert.equal(small.limited,true);assert.equal(small.rate,100);assert.ok(small.low<40);assert.ok(large.low>99);assert.equal(large.limited,false);
 assert.equal(matchupEstimate({champion:'Jhin',relationship:'unknown',samples:0,wins:0}),null);
});
test('offline build validation preserves old references but rejects corrupted optional matchup statistics',()=>{
 const ref=builds['Ashe:bottom'];assert.equal(validReference(ref,data.champions.find(c=>c.id==='Ashe'),'bottom',data,{allowOlder:true}),true);
 assert.equal(validReference({...ref,matchups:[{champion:'Jhin',relationship:'unknown',samples:1,wins:2}]},data.champions.find(c=>c.id==='Ashe'),'bottom',data,{allowOlder:true}),false);
});
test('matchup view identifies the statistical perspective, marks small samples and never guesses public enemy positions',()=>{
 const ref={...builds['Ashe:bottom'],matchups:adaptMatchups([{champion_id:202,play:606,win:312},{champion_id:222,play:5,win:4}],data.champions,'Ashe')};
 const html=matchupView(data,ref,{publicEnemies:['Jinx']});assert.match(html,/艾希胜率/);assert.match(html,/51.5%/);assert.match(html,/样本较少/);assert.match(html,/本局已公开/);assert.match(html,/不代表已确认分路/);assert.ok(html.indexOf(data.champions.find(c=>c.id==='Jinx').name)<html.indexOf(data.champions.find(c=>c.id==='Jhin').name));
 assert.match(matchupView(data,{...ref,matchups:undefined}),/尚未缓存/);
});
