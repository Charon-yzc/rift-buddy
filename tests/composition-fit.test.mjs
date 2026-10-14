import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {profile} from '../src/core/rules.mjs';
import {createCooperationGraph} from '../src/core/cooperation.mjs';
import {compositionFit} from '../src/core/composition-fit.mjs';

const {champions}=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
const byId=new Map(champions.map(c=>[c.id,c])),graph=createCooperationGraph(champions);
const members=rows=>rows.map(([role,champion])=>{const c=byId.get(champion);return {role,champion,c,p:c?profile(c,role):null};});
const fit=(rows,options)=>compositionFit({members:members(rows)},graph,options);
const duo=[['bottom','Jinx'],['support','Lulu']];
const trio=[['top','Malphite'],['jungle','Diana'],['mid','Yasuo']];
const full=[['top','Malphite'],['jungle','Vi'],['mid','Orianna'],...duo];

test('a real protection partnership beats two self-sufficient carries without demanding five-person coverage',()=>{
 const protect=fit(duo),overlap=fit([['top','Yone'],['mid','Yasuo']]);
 assert.ok(protect.score>=80&&protect.score<100,protect.reason);
 assert.ok(protect.score>overlap.score+20,`${protect.score} vs ${overlap.score}`);
 assert.match(protect.strengths.join(' '),/普攻增益|保护/);
 assert.doesNotMatch(protect.gaps.join(' '),/前排|伤害类型|五人/,'A bot duo need not contain a full team');
 assert.ok(protect.relationships[0].condition&&protect.relationships[0].sourceUrls.length);
});

test('reviewed actual control and damage conversion are rewarded over stacking defensive control',()=>{
 const engage=fit(trio),tanks=fit([['top','Ornn'],['jungle','Sejuani'],['mid','Malphite']]);
 assert.ok(engage.score>tanks.score+30,`${engage.score} vs ${tanks.score}`);
 assert.match(engage.strengths.join(' '),/击飞接大|拉起目标接大/);
 assert.match(tanks.gaps.join(' '),/输出|伤害/);
 const catchTeam=fit([['top','Darius'],['mid','Ahri'],['jungle','LeeSin']]);
 assert.equal(catchTeam.tactic.id,'catch','Charm combinations have a conditional catch plan even without a reliable hard-engage tag');
 assert.ok(catchTeam.score>=75,catchTeam.reason);
});

test('a clear five-person plan beats four overlapping carries and a single protector',()=>{
 const complete=fit(full),crowded=fit([['top','Jax'],['jungle','MasterYi'],['mid','Yasuo'],['bottom','Vayne'],['support','Senna']]);
 assert.ok(complete.score>crowded.score+20,`${complete.score} vs ${crowded.score}`);
 assert.match(crowded.gaps.join(' '),/持续输出成员过多/);
 assert.ok(complete.score<=100&&crowded.score>=0);
});

test('one multi-function champion cannot supply its own teammate or receive a fit score',()=>{
 const one=fit([['mid','Galio']]),none=fit([]);
 assert.equal(one.score,null);assert.equal(one.rawScore,0);assert.equal(none.score,null);
 assert.match(one.reason,/至少需要两位/);
 const unknown=fit([['bottom','Jinx'],['support','UnknownChampion']]);
 assert.equal(unknown.score,null);assert.equal(unknown.known,1);assert.equal(unknown.confidence,.5);
});

test('unknown or unreviewed participants lower evidence and cannot inherit a good pair score',()=>{
 const known=fit(duo),unknown=fit([...duo,['mid','UnknownChampion']]);
 assert.ok(unknown.score<known.score&&unknown.score<=67);
 assert.equal(unknown.known,2);assert.equal(unknown.size,3);assert.equal(unknown.confidence,.67);
 const custom=members(duo);custom[1]={...custom[1],p:{...custom[1].p,reviewed:false}};
 assert.equal(compositionFit({members:custom},graph).score,null);
});

test('two to five members use different normalized budgets rather than accumulating pair-count bonuses',()=>{
 const rows=[duo,trio,full.slice(1),full],fits=rows.map(rows=>fit(rows));
 assert.deepEqual(fits.map(f=>f.size),[2,3,4,5]);
 assert.deepEqual(fits.map(f=>f.breakdown.filter(b=>b.max).reduce((sum,b)=>sum+b.max,0)),[100,100,100,100]);
 assert.deepEqual(fits.map(f=>f.breakdown.find(b=>b.key==='connections').max),[50,42,36,32]);
 assert.ok(fits[0].score>=fits[3].score,'A coherent duo can be as well suited to its task as a full team');
 assert.match(fits[2].gaps.join(' '),/正面压力/,'A four-person scope asks who absorbs pressure');
 assert.doesNotMatch(fits[0].gaps.join(' '),/正面压力/);
});

test('member ordering and graph lookup history do not change score or explanation',()=>{
 const team=members(full),first=compositionFit({members:team},graph);
 const reversed=compositionFit({members:[...team].reverse()},graph);
 assert.deepEqual(first,reversed);
 const fresh=createCooperationGraph(champions);
 fresh.edge(team[4],team[0]);fresh.edge(team[2],team[1]);
 assert.deepEqual(first,compositionFit({members:[...team].reverse()},fresh));
});

test('details false uses the identical score and raw score without presentation work',()=>{
 for(const rows of [duo,trio,full]){
  const detailed=fit(rows),fast=fit(rows,{details:false});
  assert.equal(fast.score,detailed.score);assert.equal(fast.rawScore,detailed.rawScore);
  assert.equal(fast.strengths,undefined);
 }
});

test('historical unreviewed graph links do not grant current mechanism points',()=>{
 const team=members([['mid','Yasuo'],['top','Yone']]),empty={edge:()=>null},stale={edge:()=>({current:false,family:'catalog',name:'stale'})};
 assert.equal(compositionFit({members:team},stale).rawScore,compositionFit({members:team},empty).rawScore);
});

test('role and hero collisions are defects rather than extra pair-count evidence',()=>{
 const okay=fit(duo),sameLane=fit([['bottom','Jinx'],['bottom','Lulu']]),repeated=fit([['bottom','Jinx'],['mid','Jinx']]);
 assert.ok(sameLane.score<okay.score);assert.match(sameLane.gaps.join(' '),/位置冲突/);
 assert.match(repeated.gaps.join(' '),/同一英雄重复/);
});
