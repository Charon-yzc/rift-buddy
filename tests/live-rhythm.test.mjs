import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {sanitizePublicEvents} from '../services/live-events.mjs';
import {liveSnapshot,panelStats} from '../services/live-client.mjs';
import {objectiveRhythm,powerWindows,clockLabel} from '../src/core/live-rhythm.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {renderGuide} from '../src/guide-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const own={riotId:'private-own#123',summonerName:'private-own#123',team:'ORDER',rawChampionName:'game_character_displayname_Ashe',level:7,items:[]};
const foe={riotId:'private-foe#456',summonerName:'private-foe#456',team:'CHAOS'};
const event=(id,kind,time,extra={})=>({EventID:id,EventName:kind,EventTime:time,...extra});
const start=event(0,'GameStart',0.04);
const feed=(events,time=1000)=>sanitizePublicEvents({Events:[start,...events]},[own,foe],own,time);
const live=(objectives,extra={})=>({matched:true,queueId:420,mapId:11,gameTime:800,objectives,...extra});
const rhythm=(objectives,extra={})=>objectiveRhythm({live:live(objectives,extra),role:'jungle',patch:data.patch});
test('public events resolve teams without retaining any player names, assisters or private fields',()=>{
 const value=feed([event(1,'DragonKill',500,{KillerName:own.riotId,Assisters:[foe.riotId],DragonType:'Fire',coordinates:{x:10}})]);
 assert.equal(value.historyComplete,true);assert.deepEqual(value.events[1],{id:1,kind:'DragonKill',time:500,side:'ally',dragon:'Fire'});
 assert.doesNotMatch(JSON.stringify(value),/private|KillerName|Assisters|coordinates/);
 const ambiguous= sanitizePublicEvents({Events:[start,event(1,'DragonKill',500,{KillerName:own.riotId,DragonType:'Fire'})]},[own,{...foe,riotId:own.riotId}],own,800);
 assert.equal(ambiguous.events[1].side,null);
});
test('missing, truncated and conflicting event histories never establish complete dragon history',()=>{
 assert.equal(sanitizePublicEvents(null,[],own,100).available,false);
 assert.equal(sanitizePublicEvents({Events:[]},[],own,100).historyComplete,false);
 assert.equal(feed([event(1,'DragonKill',500),event(1,'BaronKill',600)]).historyComplete,false);
 assert.equal(feed([event(1,'DragonKill',Infinity)]).historyComplete,false);
 assert.equal(feed(Array.from({length:2001},(_,i)=>event(i+1,'MinionsSpawning',100))).historyComplete,false);
 const duplicate=feed([event(1,'BaronKill',600),event(1,'BaronKill',600)]);assert.equal(duplicate.events.length,2);
});
test('optional event endpoint failure preserves the active champion, inventory and skill snapshot',async()=>{
 const request=async route=>{if(route.endsWith('eventdata'))throw Error('unavailable');return route.endsWith('activeplayer')?{riotId:own.riotId,level:7,currentGold:123,abilities:{R:{abilityLevel:1}}}:route.endsWith('playerlist')?[own]:{gameMode:'CLASSIC',mapNumber:11,gameTime:800};};
 const value=await liveSnapshot(data.champions,{queueId:420},request);assert.equal(value.available,true);assert.equal(value.champion,'Ashe');assert.equal(value.gold,123);assert.equal(value.skills.R,1);assert.equal(value.objectives.available,false);
});
test('resource countdown uses observed dragon kills and becomes a verification prompt when due',()=>{
 const f=feed([event(1,'DragonKill',500,{DragonType:'Fire',KillerName:own.riotId})]);
 const before=rhythm(f,{gameTime:750}).rows.find(r=>r.id==='dragon');assert.equal(before.remaining,50);assert.equal(before.state,'prepare');assert.match(before.action,/惩戒/);
 const after=rhythm(f,{gameTime:810}).rows.find(r=>r.id==='dragon');assert.equal(after.state,'check');assert.doesNotMatch(after.label,/已刷新|已出现/);
});
test('the fourth team dragon switches to Elder; an unresolved killer cannot invent a dragon soul',()=>{
 const kills=[100,400,700,1000].map((time,i)=>event(i+1,'DragonKill',time,{DragonType:'Earth',KillerName:own.riotId}));
 const f=feed(kills,1100),o=rhythm(f,{gameTime:1100});assert.equal(o.soul,true);assert.deepEqual(o.counts,{ally:4,enemy:0});assert.equal(o.rows.find(r=>r.id==='elder').spawn,1360);
 const unknown=feed(kills.map(k=>({...k,KillerName:'unknown-private'})),1100),u=rhythm(unknown,{gameTime:1100});assert.equal(u.soul,null);assert.equal(u.rows.find(r=>r.id==='dragon').state,'unknown');assert.ok(!u.rows.some(r=>r.id==='elder'));
});
test('explicit Elder events still provide a six-minute reference with partial history',()=>{
 const f=sanitizePublicEvents({Events:[event(9,'DragonKill',1500,{DragonType:'Elder'})]},[own],own,1550);
 assert.equal(rhythm(f,{gameTime:1550}).rows.find(r=>r.id==='elder').spawn,1860);
});
test('Swiftplay, unconfirmed queues, other maps and stale live selections cannot use normal-rift timers',()=>{
 for(const change of [{queueId:480},{queueId:null},{mapId:12},{matched:false}])assert.equal(rhythm(feed([]),change).available,false);
 const f=feed([event(1,'HeraldKill',500)]),swift=rhythm(f,{queueId:480});assert.equal(swift.rows.length,0);assert.equal(swift.recent.length,1);
});
test('missing events pause dragon progression instead of inventing kills, and rule versions remain visible',()=>{
 const o=rhythm({available:false,historyComplete:false,events:[]});assert.equal(o.rows.find(r=>r.id==='dragon').state,'unknown');assert.equal(o.rows.find(r=>r.id==='baron').spawn,1200);
 const stale=objectiveRhythm({live:live(feed([])),patch:'17.1'});assert.equal(stale.stale,true);
 const late=rhythm(feed([]),{gameTime:1300});assert.ok(late.rows.every(r=>!['grubs','herald'].includes(r.id)));
});
test('own powers need real learned ranks and holdings, never manual route marks or unread inventory',()=>{
 const route=[{id:'3153',name:'破败王者之刃',cost:3200}];
 const base={matched:true,level:5,skills:{R:0},inventoryKnown:true,inventory:[]};
 const next=powerWindows({champion:'Yone',live:base,data,route});assert.equal(next.current.length,0);assert.match(next.upcoming[0].name,/6/);
 const armed=powerWindows({champion:'Yone',live:{...base,level:6,skills:{R:1},inventory:[{id:'3153',count:1}]},data,route});assert.equal(armed.current.length,2);assert.match(armed.current[1].text,/持续攻击/);
 assert.equal(powerWindows({champion:'Yone',live:{...base,inventoryKnown:false,inventory:[{id:'3153',count:1}]},data,route}).current.length,0);
 assert.equal(powerWindows({champion:'Jayce',live:base,data,route}).upcoming.some(r=>r.id==='level'),false);
});
test('packaged guide model wires resources and powers to a dedicated readable tab without exposing raw identities',()=>{
 const actual={...live(feed([event(1,'DragonKill',500,{DragonType:'Fire',KillerName:own.riotId})]),{gameTime:750}),available:true,champion:'Ashe',mode:'rift',at:Date.now(),level:7,gold:800,inventory:[],skills:{Q:1,W:3,E:1,R:1},enemies:[],allies:[]};
 const m=createGuideModel(data,selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift'}),actual);
 assert.equal(m.objectives.rows.find(r=>r.id==='dragon').remaining,50);
 const html=renderGuide({model:m},'rhythm',false,()=>'<img>');assert.match(html,/data-tab="rhythm"/);assert.match(html,/还有 0:50/);assert.match(html,/自己的技能与成装节点/);assert.doesNotMatch(html,/private-own/);
});
test('clock formatting keeps minute boundaries readable',()=>{assert.equal(clockLabel(59.5),'1:00');assert.equal(clockLabel(0),'0:00');assert.equal(clockLabel(null),'—');});
test('known live haste and flat magic penetration are retained without guessing percentage wire semantics',()=>{
 const panel=panelStats({attackDamage:100,abilityPower:200,abilityHaste:30,magicPenetrationFlat:18,magicPenetrationPercent:.9});assert.equal(panel.abilityHaste,30);assert.equal(panel.magicPenFlat,18);assert.equal(panel.magicPenPercent,undefined);
 assert.equal(panelStats({attackDamage:100,abilityHaste:-5,magicPenetrationFlat:Infinity}).abilityHaste,undefined);
});
