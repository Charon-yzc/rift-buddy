import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {jungleGuidance,changeJungleNotes,validateJungleNotes} from '../src/core/jungle-guidance.mjs';
import {JUNGLE_PROFILES,junglePlan} from '../src/core/jungle-plans.mjs';
import {selectGuide,createGuideModel,reconcileGuide,validateGuideState} from '../src/core/guide.mjs';
import {jungleGuidanceView} from '../src/jungle-guidance-view.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));data.builds=JSON.parse(fs.readFileSync(new URL('../data/builds.json',import.meta.url))).entries;
const live={matched:true,mapId:11,queueId:420,gameTime:400,skills:{Q:3,W:1,E:1,R:0},stats:{hp:600,maxHp:1000,resource:{type:'MANA',value:400,max:500}}};
const make=(extra={})=>jungleGuidance({champion:'Nocturne',role:'jungle',mode:'rift',patch:'16.20',live,...extra});

test('later jungle rotations remain concrete, and an explicit half change does not invent camp or lane evidence',()=>{
 const red=make({notes:{half:'red'},live:{...live,gameTime:1100}});
 assert.equal(red.rotationRoute.length,2);assert.match(red.rotationRoute[0],/锋喙鸟.*石甲虫.*实际可刷/);assert(!red.openingPhase);assert(!red.ready);
 const notes=changeJungleNotes({start:'red'},'half','blue',1100),blue=make({notes,live:{...live,gameTime:1100}});
 assert.match(blue.rotationRoute[0],/三狼.*魔沼蛙.*实际可刷/);assert.equal(notes.lane,undefined);assert.equal(notes.at,undefined);
 assert.match(make({champion:'Ivern',notes}).rotationRoute.join(' '),/画圈.*成熟营地/);
 assert.throws(()=>changeJungleNotes(notes,'half','enemy',1100));
 assert.equal(validateJungleNotes({half:'enemy',campAlive:true}),undefined);
});
test('Nocturne and Diana retain concrete six camps while Ivern uses passive release, without inferring a clear record',()=>{
 const nocturne=make();assert.equal(nocturne.opening.length,6);assert.match(nocturne.choices[0].text,/尚未学会/);assert.match(nocturne.mechanics,/6级前/);
 const diana=make({champion:'Diana',notes:{start:'red'}});assert.equal(diana.opening[0],'红BUFF');assert.match(diana.mechanics,/学会|6级R/);
 const ivern=make({champion:'Ivern'});assert(ivern.special);assert(ivern.opening.some(t=>t.includes('画圈')));assert.match(jungleGuidanceView(ivern),/不代表当前已经刷过/);
 for(const start of ['blue','red']){
  const opening=make({champion:'Ivern',notes:{start},live:{...live,gameTime:100}});
  assert.equal(opening.compactRoute.length,2);assert.match(opening.compactRoute[0],start==='blue'?/^蓝→蛙→三狼/:/^红→锋喙鸟/);
  assert.match(opening.compactRoute[0],/画圈；转/);assert.match(opening.compactRoute[1],/成熟.*回收.*惩戒/);assert.match(opening.lead.title,/画圈/);
 }
 assert.equal(make({role:'mid'}),null);assert.equal(make({mode:'hex'}),null);
});
test('only fresh player-checked lane conditions offer a gank option; low health, stale patch, and other queues stop it',()=>{
 const notes={lane:'bottom',at:390,pushed:true,follow:true,control:true,safe:true};
 const ready=make({notes});assert(ready.ready);assert.match(ready.choices[1].title,/下路/);assert.match(ready.choices[1].text,/没有R/);assert.equal(ready.choices.length,3);
 for(const extra of [{live:{...live,gameTime:481}},{live:{...live,stats:{hp:399,maxHp:1000}}},{live:{...live,queueId:490}},{patch:'16.21'},{notes:{...notes,safe:false}},{live:null}])assert.equal(make({notes,...extra}).ready,false);
 assert.equal(make({notes:{...notes,at:401}}).fresh,false);
});
test('refreshing one expired observation cannot revive the other old lane claims, and switching lanes resets them',()=>{
 const notes={start:'red',lane:'bottom',at:100,pushed:true,follow:true,control:true,safe:true};
 const next=changeJungleNotes(notes,'pushed',undefined,200);assert(next.pushed);assert(!next.follow);assert(!next.control);assert(!next.safe);
 const changed=changeJungleNotes(notes,'lane','top',120);assert.equal(changed.lane,'top');assert(!changed.pushed);assert.equal(changed.start,'red');
 assert.throws(()=>changeJungleNotes(notes,'safe',undefined,null),/进入本局/);assert.throws(()=>changeJungleNotes(notes,'enemyPosition','mid',120));
});
test('new match and changing own hero clear lane evidence, while the guide exposes real public own health and learned ranks',()=>{
 const selection={id:'Nocturne',role:'jungle',mode:'rift',conditions:[]},jungleNotes={lane:'top',at:100,pushed:true};
 const state=validateGuideState({...selectGuide(null,selection),jungleNotes,match:{gameId:'10',phase:'InProgress'}});
 assert.equal(reconcileGuide(state,{phase:'InProgress',gameId:'11'}).guide.jungleNotes,undefined);
 assert.equal(selectGuide(state,{...selection,id:'Diana'}).jungleNotes,undefined);
 const model=createGuideModel(data,state,null,null);assert(model.jungle);assert.equal(model.jungle.ready,false);assert.match(jungleGuidanceView(model.jungle),/兵线|观察/);
});

test('unavailable or mismatched public skills never imply an unlearned ultimate',()=>{
 for(const champion of ['Nocturne','Diana','Fiddlesticks','Evelynn']){
  for(const unknown of [null,{matched:false,skills:{R:0},stats:{hp:1,maxHp:1000}},{...live,skills:{}},{...live,skills:{R:null}},{...live,skills:{R:-1}}]){
   const text=make({champion,live:unknown}).choices[0].text;
   assert.match(text,/等级未知/);assert.doesNotMatch(text,/尚未学会|生命不足/);
  }
  assert.match(make({champion}).choices[0].text,/尚未学会/);
  assert.doesNotMatch(make({champion,live:{...live,skills:{R:1}}}).choices[0].text,/尚未学会|等级未知/);
 }
});

test('birth side determines the default lower-side start and finishing lane, without inventing camp progress',()=>{
 const blue=make({live:{...live,teamSide:'blue'}});assert.equal(blue.start,'red');assert.match(blue.finish,/上路/);
 const red=make({live:{...live,teamSide:'red'}});assert.equal(red.start,'blue');assert.match(red.finish,/上路/);
 const changed=make({live:{...live,teamSide:'red'},notes:{start:'red',side:'blue'}});assert.equal(changed.side,'red');assert.match(changed.finish,/下路/);
 const fallback=make({live:null,notes:{side:'red'}});assert.equal(fallback.side,'red');assert.match(fallback.lead.title,/等待/);
 assert.match(make().finish,/未知/);assert.equal(blue.compactRoute.join(' → ').split(' → ').length,6);
 assert.match(jungleGuidanceView(blue),/不代表当前已经刷过/);
});

test('interruption clears old gank evidence, lasts at most 90 seconds, and cannot revive it after resume',()=>{
 const notes={start:'red',side:'blue',lane:'top',at:390,pushed:true,follow:true,control:true,safe:true};assert(make({notes}).ready);
 for(const reason of ['invaded','recalled','no-window']){
  const next=changeJungleNotes(notes,'situation',reason,400);assert.equal(next.lane,undefined);assert.equal(next.start,'red');
  assert.equal(validateGuideState({...selectGuide(null,{id:'Nocturne',role:'jungle',mode:'rift'}),jungleNotes:next}).jungleNotes.situation,reason);
  assert.equal(make({notes:next}).recovery,reason);assert(!make({notes:next}).ready);
  assert.equal(make({notes:next,live:{...live,gameTime:491}}).recovery,null);
  assert.equal(make({notes:next,live:{...live,gameTime:399}}).recovery,null);
  const resumed=changeJungleNotes(next,'resume',undefined,null);assert(!make({notes:resumed}).ready);assert(!resumed.situation);
 }
 assert.throws(()=>changeJungleNotes(notes,'situation','enemy-near',400));
 assert.throws(()=>changeJungleNotes(notes,'situation','invaded',null));
 assert.deepEqual(validateJungleNotes({situation:'enemy-near',situationAt:400,enemyX:3000}),undefined);
});

test('current action prioritizes safety and evidence, and champion coordination respects learned skills',()=>{
 const notes={lane:'bottom',at:390,pushed:true,follow:true,control:true,safe:true};
 assert.match(make({notes,live:{...live,stats:{hp:200,maxHp:1000}}}).lead.title,/暂停进场/);
 assert.match(make({notes,patch:'16.21'}).lead.title,/待复核/);
 assert.match(make({notes,live:{...live,queueId:490}}).lead.title,/模式尚未/);
 for(const skills of [{Q:0,W:1,E:1,R:0},{Q:1,W:null,E:1,R:1},{}]){const unknown=make({notes,live:{...live,skills}});assert(!unknown.ready);assert.match(unknown.skillNote,/基础技能/);}
 const j4=make({champion:'JarvanIV',notes});assert.match(j4.lead.text,/EQ/);assert.match(j4.routeTitle,/三营/);assert.doesNotMatch(j4.lead.text,/R留人/);
 const vi=make({champion:'Vi',notes,live:{...live,skills:{...live.skills,R:1}}});assert.match(vi.lead.text,/R/);assert.match(vi.skillNote,/≠/);
 assert.match(make({champion:'LeeSin',notes}).lead.text,/二段/);
 assert.match(make({champion:'Ivern',notes}).lead.text,/E套/);
 assert.match(make({champion:'Evelynn'}).routeTitle,/通用/);assert.match(make({champion:'Evelynn'}).mechanics,/尚未补/);
 assert.doesNotMatch(make({champion:'LeeSin',live:{...live,gameTime:1200}}).lead.title,/三营/);
});

test('low own mana or energy takes precedence over a gank candidate, with unknown resources disclosed',()=>{
 const notes={lane:'bottom',at:390,pushed:true,follow:true,control:true,safe:true};
 const read=resource=>make({notes,live:{...live,stats:{...live.stats,resource}}});
 assert(!read({type:'MANA',value:99,max:500}).ready);assert.match(read({type:'MANA',value:99,max:500}).lead.title,/恢复法力/);
 assert(read({type:'MANA',value:100,max:500}).ready);
 assert.match(read({type:'ENERGY',value:49,max:200}).lead.title,/回能量/);
 for(const resource of [null,{type:'RAGE',value:0,max:100},{type:'MANA',value:-1,max:100},{type:'MANA',value:0,max:0}])assert.match(read(resource).skillNote,/需核对/);
 assert.match(make({notes,live:{...live,matched:false,stats:{...live.stats,resource:{type:'MANA',value:0,max:500}}}}).lead.title,/等待/);
});

const addedJunglers=['Sejuani','Poppy','Kindred','Amumu','Maokai','Elise','Nunu','Zac','Graves','Viego','Trundle','Lillia'];
const checkedLane={lane:'mid',at:390,pushed:true,follow:true,control:true,safe:true};
test('the twelve catalog junglers expose real camps for both starts and map finishing lanes from the final camp',()=>{
 const allCamps=['红BUFF','石甲虫','锋喙鸟','三狼','蓝BUFF','魔沼蛙'];
 for(const champion of addedJunglers)for(const start of ['red','blue'])for(const side of ['red','blue']){
  const j=make({champion,notes:{start,side}});
  assert.equal(j.opening[0],start==='red'?'红BUFF':'蓝BUFF');
  assert.deepEqual([...j.opening].sort(),[...allCamps].sort(),`${champion}: every own camp occurs once`);
  assert.equal(j.compactRoute.join(' → '),j.opening.join(' → '));
  const redHalf=['红BUFF','石甲虫','锋喙鸟'].includes(j.opening.at(-1));
  const expected=side==='blue'?(redHalf?'下路':'上路'):(redHalf?'上路':'下路');
  assert.match(j.finish,new RegExp(expected));assert(!j.ready);
  assert.doesNotMatch(j.mechanics,/尚未补专属/);
  assert.match(make({champion,notes:{start}}).finish,/未知/);
 }
 // A single-target opening returns to the starting half for optional camps;
 // computing the finishing lane from the starting buff would be wrong here.
 assert.match(make({champion:'Elise',notes:{start:'red',side:'blue'}}).finish,/下路/);
 assert.match(make({champion:'Elise',notes:{start:'blue',side:'blue'}}).finish,/上路/);
 assert.notDeepEqual(junglePlan('Elise','red','blue').opening,junglePlan('Amumu','red','blue').opening);
});

test('camp priorities and first checks reflect the champion mechanism rather than guaranteeing camp XP',()=>{
 for(const champion of ['Elise','Kindred','Trundle']){
  const red=make({champion,notes:{start:'red'},live:{...live,gameTime:120}}),blue=make({champion,notes:{start:'blue'},live:{...live,gameTime:120}});
  assert.deepEqual(red.opening.slice(0,3),['红BUFF','蓝BUFF','魔沼蛙']);
  assert.deepEqual(blue.opening.slice(0,3),['蓝BUFF','魔沼蛙','红BUFF']);
  assert.match(red.routeTitle,/三营/);assert.match(red.checkpoint,/实际等级|实际技能/);
  assert.doesNotMatch(red.checkpoint,/三营.*必定|三营.*一定|最快|最优/);
 }
 for(const champion of ['Poppy','Maokai','Nunu'])assert.match(make({champion,live:{...live,gameTime:120}}).lead.title,/三营/);
 for(const champion of ['Sejuani','Amumu','Lillia']){
  const j=make({champion,live:{...live,gameTime:120}});
  assert.match(j.routeTitle,/六营/);assert.match(j.lead.text,/R尚未学会/);assert.match(j.checkpoint,/六营/);
 }
 assert.match(make({champion:'Zac',live:{...live,gameTime:120}}).checkpoint,/E等级|E现有射程/);
 assert.match(make({champion:'Graves'}).mechanics,/弹丸.*装弹.*贴墙/);
 assert.match(make({champion:'Viego'}).mechanics,/双击.*E沿安全地形/);
});

test('pre and post ultimate advice is champion specific and reaches the rendered guide',()=>{
 const expected={Sejuani:[/叠层.*E/,/R命中.*Q\/W/],Poppy:[/撞墙.*W/,/短按R.*蓄力R/],Kindred:[/E减速.*W内Q/,/保护圈也保护敌方/],Amumu:[/Q接W\/E/,/R接控制/],Maokai:[/W锁定.*Q方向/,/R沿敌方退路/],Elise:[/人形E.*切蜘蛛/,/1级就有.*不是6级/],Nunu:[/W撞到后E/,/W\/E控住.*开R/],Zac:[/E等级.*落地接Q/,/Q\/W再R/],Graves:[/小兵挡住.*没有稳定硬控/,/R补伤害/],Viego:[/W不能穿墙/,/幽魂.*附身/],Trundle:[/E柱子.*Q/,/R抽取/],Lillia:[/没有R.*硬控/,/梦尘.*R睡眠/]};
 for(const [champion,[before,after]] of Object.entries(expected)){
  const pre=make({champion,notes:checkedLane}),post=make({champion,notes:checkedLane,live:{...live,skills:{...live.skills,R:1}}});
  assert(pre.ready);assert(post.ready);assert.match(pre.lead.text,before);assert.match(post.lead.text,after);
  assert.match(jungleGuidanceView(pre),before);assert.match(jungleGuidanceView(post),after);
  assert.match(jungleGuidanceView(post),/进场前自己确认技能就绪/);
 }
 const elise=make({champion:'Elise',live:{...live,gameTime:120,skills:{Q:1,W:1,E:1,R:1}}});
 assert.match(elise.skillNote,/变形.*不以6级解锁/);assert.doesNotMatch(elise.lead.text,/R尚未学会/);
 for(const champion of ['Zac','Viego'])assert.match(make({champion,live:{...live,stats:{hp:600,maxHp:1000}}}).skillNote,/本体无蓝耗/);
});

test('champion recovery keeps concrete safe camps while cancelling old gank claims and avoiding enemy-camp guesses',()=>{
 const evidence={Sejuani:/冰霜护甲/,Poppy:/圆盾/,Kindred:/危险印记/,Amumu:/关W/,Maokai:/E先看/,Elise:/盘丝/,Nunu:/雪球撞墙/,Zac:/危险粘液/,Graves:/子弹/,Viego:/W不能穿墙/,Trundle:/E柱子/,Lillia:/层数/};
 for(const champion of addedJunglers){
  const original={...checkedLane,start:'red',half:'red'};
  for(const situation of ['invaded','recalled','no-window']){
   const notes=changeJungleNotes(original,'situation',situation,400),j=make({champion,notes});
   assert(!j.ready);assert.equal(j.notes.lane,undefined);
   assert.match(j.lead.text,situation==='invaded'?/另一半区入口已确认安全.*三狼.*魔沼蛙/:/实际存活且安全.*锋喙鸟.*石甲虫/);
   assert.match(jungleGuidanceView(j),/实际存活且安全|另一半区入口已确认安全/);
   assert.match(j.recoveryRoute[0],situation==='invaded'?/另一半区候选.*三狼.*魔沼蛙.*蓝BUFF/:/安全续刷候选.*锋喙鸟.*石甲虫.*红BUFF/);
   assert.match(j.recoveryRoute[1],/确认安全|实际存活/);
   if(situation==='invaded')assert.match(j.lead.text,evidence[champion]);
   assert.notEqual(j.lead.text,make({champion:'Evelynn',notes}).lead.text);
   const resumed=make({champion,notes:changeJungleNotes(notes,'resume',undefined,null)});assert(!resumed.ready);assert.equal(resumed.recovery,null);
  }
 }
});

test('a player can override the time-based route display without creating camp or gank evidence',()=>{
 const base={start:'red',side:'blue',half:'red'};
 const rotation=changeJungleNotes(base,'stage','rotation',null);
 assert.equal(make({notes:rotation,live:{...live,gameTime:120}}).routeStage,'rotation');
 assert(!make({notes:rotation,live:{...live,gameTime:120}}).openingPhase);assert(!make({notes:rotation}).ready);
 const opening=changeJungleNotes(rotation,'stage','opening',500);
 const slow=make({champion:'Elise',notes:opening,live:{...live,gameTime:500}});
 assert.equal(slow.routeStage,'opening');assert(slow.openingPhase);assert.match(slow.lead.title,/三营/);
 for(const field of ['start','side','half'])assert.equal(changeJungleNotes(opening,field,'blue',500).stage,'opening');
 for(const field of ['clear','resume'])assert.equal(changeJungleNotes(opening,field,undefined,null).stage,'opening');
 const interrupted=changeJungleNotes(opening,'situation','invaded',500),j=make({champion:'Elise',notes:interrupted,live:{...live,gameTime:500}});
 assert.equal(j.routeStage,'opening');assert.match(j.recoveryRoute[0],/三狼.*魔沼蛙.*蓝BUFF/);
 assert.equal(changeJungleNotes(interrupted,'resume',undefined,null).stage,'opening');
 assert.equal(validateJungleNotes({stage:'done',campAlive:true}),undefined);assert.throws(()=>changeJungleNotes({},'stage','done',500),/阶段/);
 const selection={id:'Elise',role:'jungle',mode:'rift'},state=validateGuideState({...selectGuide(null,selection),jungleNotes:interrupted,match:{gameId:'10',phase:'InProgress'}});
 assert.equal(state.jungleNotes.stage,'opening');assert.equal(reconcileGuide(state,{phase:'InProgress',gameId:'11'}).guide.jungleNotes,undefined);
 assert.equal(selectGuide(state,{...selection,id:'Lillia'}).jungleNotes,undefined);
 for(const reason of ['invaded','recalled'])assert.match(make({champion:'Ivern',notes:{stage:'opening',half:'red',situation:reason,situationAt:390}}).recoveryRoute.join(' '),/画圈|成熟/);
});

test('new profiles retain unknown-state, health, resource, patch and skill-cooldown boundaries',()=>{
 for(const champion of addedJunglers){
  for(const extra of [{live:null},{live:{...live,skills:{Q:0,W:1,E:1,R:1}}},{live:{...live,stats:{hp:399,maxHp:1000}}},{live:{...live,stats:{...live.stats,resource:{type:'MANA',value:99,max:500}}}},{patch:'16.21'},{live:{...live,queueId:490}},{notes:{...checkedLane,at:300}}])assert(!make({champion,notes:checkedLane,...extra}).ready,champion);
  const unknown=make({champion,notes:checkedLane,live:{...live,skills:{Q:1,W:1,E:1}}});
  assert.match(unknown.skillNote,/R等级未知/);assert.doesNotMatch(unknown.lead.text,/R命中|R睡眠|R抽取|开R|再R/);
  assert.match(make({champion,notes:checkedLane,live:{...live,skills:{...live.skills,R:1}}}).skillNote,/冷却自行核对/);
 }
 for(const champion of ['Sejuani','Amumu','Lillia'])assert.match(make({champion,live:{...live,skills:{Q:1,W:1,E:1}}}).choices[0].text,/大招等级未知/);
 assert.match(make({champion:'Elise',live:{...live,skills:{Q:1,W:1,E:1,R:1},stats:{hp:600,maxHp:1000}}}).skillNote,/血蓝\/能量需核对.*变形/);
});

test('mechanism source IDs preserve Riot desktop slugs and the Trundle jungle guide scope',()=>{
 assert.equal(JUNGLE_PROFILES.JarvanIV.sources[0],'https://www.leagueoflegends.com/en-us/champions/jarvaniv/');
 assert.equal(JUNGLE_PROFILES.LeeSin.sources[0],'https://www.leagueoflegends.com/en-us/champions/leesin/');
 assert.equal(JUNGLE_PROFILES.Nunu.sources[0],'https://www.leagueoflegends.com/en-us/champions/nunu/');
 assert.match(JUNGLE_PROFILES.Trundle.sources[1],/guide\?role=jungle$/);
 for(const champion of addedJunglers)assert.equal(make({champion}).sources.length,2);
});
