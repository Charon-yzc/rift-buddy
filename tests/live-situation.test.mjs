import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {sanitizeLive} from '../services/live-client.mjs';
import {createGuideModel,selectGuide,validateGuideState,nextSkill} from '../src/core/guide.mjs';
import {recommendSkill} from '../src/core/skill-advice.mjs';
import {renderGuide} from '../src/guide-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
data.hexBuilds=JSON.parse(await fs.readFile('data/hex-builds.json','utf8')).entries;
const selection={id:'Ashe',role:'bottom',mode:'rift'};
const player=(id,team,items=[],extra={})=>({riotId:'private-'+id,rawChampionName:'game_character_displayname_'+id,team,items:items.map(itemID=>({itemID,count:1})),scores:{kills:0,deaths:0,assists:0,creepScore:50},...extra});
const read=(enemies=[],own=[],extra={})=>sanitizeLive({riotId:'private-Ashe',currentGold:800,level:7,abilities:Object.fromEntries(Object.entries({Q:1,W:3,E:1,R:1}).map(([key,abilityLevel])=>[key,{abilityLevel}])),...extra},[player('Ashe','ORDER',own),...enemies],{gameMode:'CLASSIC',mapNumber:11,gameTime:600},data.champions);
const physical=()=>[player('Jhin','CHAOS',[3031]),player('Jinx','CHAOS',[6672])];
const model=(live,guide=selectGuide(null,selection),current)=>createGuideModel(data,guide,live,current);

test('live situation keeps public scoreboard facts but discards all player identities and hidden fields',()=>{
 const opponent=player('Jhin','CHAOS',[3031],{level:10,currentGold:9999,position:'BOTTOM',coordinates:{x:123},respawnTimer:30,health:40,runes:{secret:'private'},scores:{kills:5,deaths:-1,assists:2,creepScore:55,wardScore:14}});
 const live=read([opponent,null]);
 assert.equal(live.teamKnown,true);assert.equal(live.roster.length,2);
 assert.deepEqual(live.roster[1],{champion:'Jhin',side:'enemy',self:false,level:10,position:'bottom',inventory:[{id:'3031',count:1}],itemsKnown:true,scores:{kills:5,deaths:null,assists:2,creepScore:55}});
 const json=JSON.stringify(live);for(const text of ['private','9999','coordinates','respawnTimer','wardScore','health'])assert.equal(json.includes(text),false,text);
 const unknown=sanitizeLive({riotId:'private-Ashe'},[player('Ashe',null),opponent],{gameMode:'CLASSIC',mapNumber:11},data.champions);
 assert.equal(unknown.teamKnown,false);assert.deepEqual(unknown.roster,[]);
});

test('live evidence recommends a defensive component with reasons, then stops after it is bought or upgraded',()=>{
 const live=read(physical()),before=model(live);
 assert.equal(before.automaticTarget,false);assert.notEqual(before.next.id,'1029');
 const candidate=before.situation.candidates.find(c=>c.id==='1029');
 assert.match(candidate.reason,/烬.*金克丝/);assert.match(candidate.reason,/护甲/);assert.match(candidate.caution,/推迟/);
 const focused=model(live,selectGuide(null,{...selection,threatId:'Jhin'}));assert.equal(focused.next.id,'1029');assert.equal(focused.automaticTarget,true);
 assert.equal(before.selection.conditions.length,0,'No inferred conditions are persisted into the user draft');
 for(const bag of [[1029],[3047]]){
  const after=model(read(physical(),bag));assert.equal(after.situation.candidates.some(c=>c.kind==='physical'),false);
  assert.equal(after.automaticTarget,false);
 }
});

test('fresh public facts are required: old, other-hero, wrong-role and disabled snapshots never drive automatic choices',()=>{
 const live=read(physical());
 for(const [state,current] of [[{...live,at:Date.now()-13000},null],[{...live,champion:'Jhin'},null],[live,{id:'Ashe',role:'mid',mode:'rift',positionKnown:true}]]){
  const m=model(state,selectGuide(null,selection),current);assert.equal(m.situation.automatic,false);assert.equal(m.automaticTarget,false);assert.equal(m.situation.signals.length,0);
 }
 const guide={...selectGuide(null,selection),liveAdvice:false};
 const disabled=model(live,guide);assert.equal(disabled.situation.automatic,false);assert.equal(disabled.situation.candidates.length,0);
 assert.equal(validateGuideState(guide).liveAdvice,false);assert.equal(selectGuide(guide,{...selection,id:'Jhin'}).liveAdvice,false);
});

test('manual return target wins and completing an invested affordable core wins over a side purchase',()=>{
 const live=read(physical()),base=model(null),target=base.route[0].id;
 const locked=model(live,{...selectGuide(null,selection),purchaseTarget:target});
 assert.equal(locked.next.id,target);assert.equal(locked.automaticTarget,false);
 // Fully fund the remaining recipe with its immediate components.
 const components=data.items[target].from.map(Number),invested=model(read(physical(),components,{currentGold:10000}));
 assert.equal(invested.next.id,target);assert.equal(invested.action.kind,'complete');assert.equal(invested.automaticTarget,false);
});

test('full bags, unsupported modes and unknown teams do not silently change the purchase target',()=>{
 const full=model(read(physical(),[1055,1038,1037,1042,2003,2055]));assert.equal(full.automaticTarget,false);assert.match(full.situation.caution,/六个/);
 const hex=model({...read(physical()),mode:'hex',mapId:12},{...selectGuide(null,{...selection,mode:'hex'})});
 assert.equal(hex.situation.automatic,false);assert.equal(hex.automaticTarget,false);assert.ok(hex.route.every(i=>data.items[i.id].maps['12']));
 const unknown=model({...read(physical()),teamKnown:false});assert.equal(unknown.situation.signals.length,0);
});

test('armor and healing investments produce relevant alternatives without duplicate or incompatible recommendations',()=>{
 const enemies=[player('Jhin','CHAOS',[3072]),player('Malphite','CHAOS',[3075]),player('Rammus','CHAOS',[3143])];
 const before=model(read(enemies));assert.ok(before.situation.candidates.some(c=>c.id==='3035'));
 const heal=before.situation.candidates.find(c=>c.id==='3123');assert.match(heal.reason,/回复/);assert.match(heal.caution,/物理伤害/);
 const after=model(read(enemies,[3033]));assert.equal(after.situation.candidates.some(c=>['3035','3123'].includes(c.id)),false);
 const guide=selectGuide(null,{...selection,conditions:['heal']});assert.ok(model(null,guide).situation.candidates.some(c=>c.id==='3123'));
});

test('public magic investments and high visible kill count can trigger magic protection, never a claim about unseen gold',()=>{
 const live=read([player('Lux','CHAOS',[3089],{scores:{kills:6,deaths:0,assists:0}})]),m=model(live);
 assert.equal(m.automaticTarget,false);assert.notEqual(m.next.id,'1033');assert.match(m.situation.candidates.find(c=>c.id==='1033').reason,/击杀数为 6/);assert.match(m.situation.caution,/不能证明.*经济/);
 assert.equal(model(read([player('Lux','CHAOS',[1052])])).situation.signals.length,0);
});

test('a completed route does not claim an automatic target and physical poke support applies physical grievous wounds',()=>{
 const route=model(null).route.map(i=>Number(i.id)),complete=model(read([],route));assert.equal(complete.next,null);assert.equal(complete.automaticTarget,false);
 const support=selectGuide(null,{...selection,role:'support',conditions:['heal']});
 assert.equal(model(null,support).situation.candidates.find(c=>c.kind==='healing').id,'3123');
});

test('explicit situation targets survive changed enemy evidence but end after the component is bought or upgraded',()=>{
 const guide={...selectGuide(null,selection),purchaseTarget:'1029',purchaseTargetKind:'situation'};
 const kept=model(read([]),guide);assert.equal(kept.next.id,'1029');assert.equal(kept.purchaseTarget,'1029');assert.match(kept.nextReason,/不再触发/);
 assert.equal(selectGuide(guide,selection).purchaseTargetKind,'situation');
 for(const bag of [[1029],[3047]]){const done=model(read([],bag),guide);assert.equal(done.purchaseTarget,'');assert.equal(done.targetFallback,true);}
 const changed=selectGuide(guide,{...selection,id:'Jhin'});assert.equal(changed.purchaseTargetKind,undefined);
 const unlisted=model(read([]),{...guide,purchaseTarget:'999999'});assert.equal(unlisted.purchaseTarget,'');
});

test('defensive shoes alone are insufficient evidence for a percentage penetration detour',()=>{
 const before=model(read([player('Jhin','CHAOS',[3047]),player('Jinx','CHAOS',[3047])]));assert.equal(before.situation.candidates.some(c=>c.kind==='armor'),false);
});

test('skill advice changes support protection with an explanation and honors a dedicated combo plan',()=>{
 const live={matched:true,level:7,skills:{Q:1,W:1,E:3,R:1}},signals=[{kind:'magic',source:'manual',evidence:'两名对手展示了法强装备'}];
 const advice=recommendSkill({champion:'Lux',role:'support',priority:'EQW',first:'EQW',live,signals});
 assert.equal(advice.base,'E');assert.equal(advice.next,'W');assert.equal(advice.changed,true);assert.match(advice.reason,/曲光屏障/);assert.match(advice.caution,/清线/);
 const combo=recommendSkill({champion:'Lux',role:'support',priority:'EQW',live,signals,custom:true});assert.equal(combo.next,'E');assert.match(combo.reason,/专用玩法/);
 const mid=recommendSkill({champion:'Lux',role:'mid',priority:'EQW',live,signals});assert.equal(mid.next,'E');
});

test('skill ranks respect available points, ultimate thresholds, early unlocks and unusual or malformed mechanisms',()=>{
 assert.equal(nextSkill('Ashe','WQE','WQE',{matched:true,level:3,skills:{Q:0,W:0,E:0,R:0}}),'W');
 assert.equal(nextSkill('Ashe','WQE','WQE',{matched:true,level:3,skills:{Q:0,W:1,E:0,R:0}}),'Q');
 assert.equal(nextSkill('Ashe','WQE','WQE',{matched:true,level:6,skills:{Q:1,W:3,E:1,R:0}}),'R');
 for(const [champion,live] of [['Udyr',{level:7,skills:{Q:1,W:1,E:5,R:1}}],['Ashe',{level:5,skills:{Q:1,W:3,E:1,R:0}}],['Ashe',{level:7,skills:{Q:-1,W:3,E:1,R:1}}],['Ashe',{level:2,skills:{Q:3,W:0,E:0,R:0}}],['Ashe',{level:7,skills:{Q:1,W:3,E:1,R:1.5}}]])assert.equal(nextSkill(champion,'WQE','WQE',{matched:true,...live}),null);
});

test('rendered guide exposes reasons, tradeoffs, candidate selection and a persistent automatic toggle',()=>{
 const m=model(read(physical())),image=(kind,id)=>`<img src="${kind}/${id}">`,snapshot={model:{...m,collapsed:false},connected:false};
 const html=renderGuide(snapshot,'items',false,image);
 assert.match(html,/本次购买为什么/);assert.match(html,/推迟/);assert.match(html,/data-action="live-advice"/);assert.match(html,/data-action="purchase-target" data-id="1029"/);
 const skills=renderGuide(snapshot,'skills',false,image);assert.match(skills,/当前建议升/);assert.match(skills,/保留已学技能/);
});
