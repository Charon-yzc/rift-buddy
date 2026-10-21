import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';
import {cleanSharedChampionUsage,ownSharedChampionUsage} from '../src/core/room-champion-usage.mjs';
import {sanitizeShare,validateWelcome} from '../src/core/room.mjs';
import {roomChampionUsageWeights} from '../src/core/champion-usage.mjs';
import {roomFamiliarityContext} from '../src/core/room-familiarity.mjs';
import {createRoomUsagePublisher} from '../services/room-champion-usage.mjs';
import {createRoomService} from '../services/room.mjs';
import {createSlots} from '../src/core/recommend.mjs';
import {recommendationKey} from '../src/core/preparation.mjs';
const usage=(counts={Ashe:400,Jinx:100},mass=.85)=>({version:1,mass,usage:{sampled:Object.values(counts).reduce((a,b)=>a+b,0),counts}});
const summary=value=>({status:'ready',session:'a'.repeat(32),usage:value.usage});
const frame=value=>({kind:'state',v:1,from:'本人',at:1000,lineup:[],pick:null,championUsage:value});
const spin=async fn=>{for(let n=0;n<250;n++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Isolated room did not reach expected state');};

test('room protocol rebuilds anonymous bounded summary and rejects malformed counts without retaining private metadata',()=>{
 const dirty={...usage(),session:'PRIVATE',puuid:'PRIVATE',records:['PRIVATE'],usage:{...usage().usage,note:'PRIVATE',games:[{id:'PRIVATE'}]}},clean=cleanSharedChampionUsage(dirty);
 assert.deepEqual(clean,usage());assert.ok(!JSON.stringify(sanitizeShare(frame(dirty))).includes('PRIVATE'));assert.deepEqual(sanitizeShare(frame(dirty)).championUsage,usage());
 assert.equal(sanitizeShare(frame(null)).championUsage,null);assert.equal(validateWelcome({kind:'welcome',v:1,room:'482913',members:[]}).championUsage,undefined);
 assert.equal(validateWelcome({kind:'welcome',v:1,room:'482913',members:[],championUsage:1}).championUsage,1);
 for(const invalid of [usage({Ashe:501}),{...usage(),mass:1.1},{...usage(),mass:'0.85'},{...usage(),version:2},usage({'invalid;hero':1})])assert.equal(sanitizeShare(frame(invalid)),null);
 assert.equal(ownSharedChampionUsage({status:'offline'},.85),null);assert.deepEqual(ownSharedChampionUsage({...summary(usage()),puuid:'PRIVATE',records:['PRIVATE']},.6),usage(undefined,.6));
});

test('main publisher overrides renderer-forged usage, coalesces batches, applies latest mass and revokes immediately',()=>{
 let state=summary(usage()),mass=.85,own=null,cap=true,pending=null,cleared=0;const sent=[];
 const service={snapshot:()=>({mode:'host',championUsage:cap,members:[{self:true,share:own}]}),publish:value=>{own=structuredClone(value);sent.push(own);return service.snapshot();}};
 const publisher=createRoomUsagePublisher({getService:()=>service,getSummary:()=>state,getMass:()=>mass,setTimer:fn=>{pending=fn;return 1;},clearTimer:()=>{pending=null;cleared++;}});
 publisher.publish({lineup:[],pick:null,championUsage:usage({Lux:500})});assert.deepEqual(sent.at(-1).championUsage,usage());
 for(let n=1;n<=25;n++){state=summary(usage({Ashe:n}));publisher.sync();}assert.equal(sent.length,1);assert.equal(typeof pending,'function');mass=.6;pending();assert.deepEqual(sent.at(-1).championUsage,usage({Ashe:25},.6));
 state=summary(usage({Ashe:26}));publisher.sync();state={status:'offline'};publisher.sync();assert.equal(cleared,1);assert.equal(pending,null);assert.equal(sent.at(-1).championUsage,null);
 cap=false;state=summary(usage());publisher.publish({lineup:[{role:'mid',champion:'Ahri'}],pick:null,championUsage:usage()});assert.equal(Object.hasOwn(sent.at(-1),'championUsage'),false);publisher.dispose();
});

function binding(){
 const slots=createSlots().map(s=>({...s,party:['mid','support'].includes(s.role),...(s.role==='mid'?{clientCellId:0}:s.role==='support'?{clientCellId:1}:{})})),client={connected:true,phase:'ChampSelect',session:{localPlayerCellId:0,myTeam:[{cellId:0,assignedPosition:'MIDDLE'},{cellId:1,assignedPosition:'UTILITY'}]},party:{status:'known',members:[{local:true,cellId:0,publicRiotId:'本人#CN1'},{local:false,cellId:1,publicRiotId:'阿青#CN1'}]}},room={room:'482913',mode:'client',transport:'relay',link:'connected',championUsage:true,members:[{self:true,nick:'本人#CN1'},{self:false,online:true,nick:'阿青#CN1',share:{pick:{role:'support',champion:'Nami'},championUsage:usage({Nami:40,Lulu:10})}}]};
 return {client,room,slots,scope:'party',ownRole:'mid',summary:summary(usage({Ahri:500})),mass:.85};
}
test('exact public RiotID and unambiguous role retain member ownership; equal room mass ignores500 versus50 history lengths',()=>{
 const f=binding(),result=roomFamiliarityContext(f);assert.deepEqual(Object.keys(result.familiarityByRole).sort(),['mid','support']);assert.deepEqual(result.familiarityByRole.support.usage.counts,{Lulu:10,Nami:40});assert.equal(result.roomFamiliarity.length,2);
 const weights=roomChampionUsageWeights(['Ahri','Nami','Lulu','Ashe'],result.roomFamiliarity);assert.ok(Math.abs(weights.Ahri-(.85+.15/2)/2)<1e-9);
 const counts={Nami:400,Lulu:100};f.room.members[1].share.championUsage=usage(counts);assert.deepEqual(roomChampionUsageWeights(['Ahri','Nami','Lulu','Ashe'],roomFamiliarityContext(f).roomFamiliarity),weights);
 assert.notEqual(recommendationKey({slots:f.slots,...result}),recommendationKey({slots:f.slots,...roomFamiliarityContext({...f,room:{mode:'idle'}})}));
});
test('different tags, missing or hidden proof, duplicated identities and conflicting positions never bind another profile',()=>{
 for(const mutate of [f=>f.room.members[1].nick='阿青#TW2',f=>delete f.client.party.members[1].publicRiotId,f=>f.client.session.myTeam[1].nameVisibilityType='HIDDEN',f=>f.room.members.push({...f.room.members[1]}),f=>f.client.party.members.push({...f.client.party.members[1]}),f=>f.room.members[1].share.pick.role='mid',f=>f.room.members[1].online=false,f=>f.room.link='reconnecting',f=>f.client.party.status='unknown']){
  const f=binding();mutate(f);assert.equal(roomFamiliarityContext(f).familiarityByRole.support,undefined);
 }
 const f=binding(),before=structuredClone(f);roomFamiliarityContext(f);assert.deepEqual(f,before,'preferences cannot create or mutate real client bindings');
});

test('a local lane remains reserved before any own history is available, while another peer lane can still contribute',()=>{
 for(const status of ['loading','ready','partial']){
  const f=binding();f.client.phase='Lobby';delete f.client.session;f.client.party.status='lobby';f.slots=createSlots();f.summary={status,session:'a'.repeat(32),usage:{sampled:0,counts:{}}};f.room.members[1].share={intent:{role:'mid',champion:null},championUsage:usage({Ahri:500})};
  assert.equal(roomFamiliarityContext(f).familiarityByRole.mid,undefined,'A peer must never fill the missing local profile');f.room.members[1].share.intent.role='support';assert.ok(roomFamiliarityContext(f).familiarityByRole.support);
 }
});

test('all twelve room members can contribute a normalized pool without inventing individual player bindings',()=>{
 const f=binding();f.client.party={status:'unknown',members:[]};f.room.members=[{self:true,nick:'本人'},...Array.from({length:11},(_,i)=>({nick:'伙伴'+i,online:true,share:{championUsage:usage({Lux:i+1})}}))];
 const result=roomFamiliarityContext(f);assert.equal(result.roomFamiliarity.length,12);assert.deepEqual(Object.keys(result.familiarityByRole),['mid']);
 const weights=roomChampionUsageWeights(['Ahri','Lux','Ashe'],result.roomFamiliarity);assert.ok(Math.abs(Object.values(weights).reduce((a,b)=>a+b,0)-1)<1e-9);assert.ok(weights.Lux>weights.Ahri);
});

test('case and NFKC nickname aliases cannot bind one public player to two provisional lanes',()=>{
 for(const alias of ['foo#cn1','Ｆｏｏ#CN1']){
  const f=binding();f.client.phase='Lobby';delete f.client.session;f.client.party={status:'lobby',members:[{local:false,publicRiotId:'Foo#CN1'}]};f.slots=createSlots();
  f.room.members=[{self:true,nick:'我'},...['Foo#CN1',alias].map((nick,i)=>({nick,online:true,share:{intent:{role:i?'jungle':'top'},championUsage:usage({Lux:10})}}))];
  const result=roomFamiliarityContext(f);assert.equal(result.familiarityByRole.top,undefined);assert.equal(result.familiarityByRole.jungle,undefined);assert.equal(result.roomFamiliarity.length,3);
 }
});

test('unavailable own history retry cycles do not change room recommendation inputs or restart the actual app worker',async()=>{
 const source=fs.readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8'),extract=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a))),f=binding();
 let cancelled=0,queued=0;f.summary={revision:1,status:'error',session:'a'.repeat(32),usage:{sampled:0,counts:{}}};
 const context=vm.createContext({data:{},client:f.client,room:f.room,championUsage:f.summary,saved:{preferences:{familiarityMass:.85}},history:{observeClient(){}},windowLayout:{docked:false},route:'draft',recommendationKey,
  results:[{id:'existing'}],offset:0,generating:true,recommendationRun:0,autoRecommendationKey:'existing',activeRecommendation:{cancel(){cancelled++;}},cancelRecommendationReveal(){},clearTimeout,markResultStale(){},render(){},queueCompanionRecommendation(){queued++;},
  recommendationInput(){return {slots:f.slots,...roomFamiliarityContext({...f,summary:context.championUsage})};}});
 vm.runInContext(extract('function acceptChampionUsage(','const historyTooltips=')+extract('function cancelRecommendation(){','\n'),context);
 const before=recommendationKey(context.recommendationInput());
 for(let n=2;n<12;n++){context.acceptChampionUsage({...f.summary,revision:n,status:n%2?'error':'loading',scanned:0,target:500,error:'后台维护'});assert.equal(recommendationKey(context.recommendationInput()),before);}
 assert.equal(cancelled,0);assert.equal(queued,0);assert.equal(context.results[0].id,'existing');assert.equal(context.generating,true);
 // A first real hero distribution must still invalidate the old recommendation.
 context.acceptChampionUsage({...f.summary,revision:12,status:'ready',usage:usage({Ahri:10}).usage});assert.equal(cancelled,1);assert.equal(queued,1);assert.equal(context.results.length,0);
 // Peers on older versions may still send empty summaries while retrying.
 const peer=f.room.members[1];peer.share.championUsage=null;const absent=recommendationKey(context.recommendationInput());peer.share.championUsage=usage({});assert.equal(recommendationKey(context.recommendationInput()),absent);
 for(const status of ['loading','ready','partial','error'])assert.equal(ownSharedChampionUsage({...f.summary,status},.85),null);
});

test('actual app room RPC and notifications clear changed candidates once and reject a late worker in either IPC order',async()=>{
 const source=fs.readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8'),extract=(a,b)=>{const from=source.indexOf(a),to=source.indexOf(b,from);assert.ok(from>=0&&to>from);return source.slice(from,to);};
 for(const change of ['counts','revoke','role','leave'])for(const notificationFirst of [false,true]){
  const f=binding();delete f.client.session.myTeam[1].assignedPosition;delete f.slots.find(s=>s.role==='support').clientCellId;
  let finish,cancelled=0,queued=0;const next=structuredClone(f.room);
  if(change==='counts')next.members[1].share.championUsage=usage({Nami:10,Lulu:40});
  if(change==='revoke')next.members[1].share.championUsage=null;
  if(change==='role')next.members[1].share.pick.role='jungle';
  if(change==='leave'){next.mode='idle';next.members=[];}
  const c=vm.createContext({...f,data:{},championUsage:f.summary,saved:{preferences:{familiarityMass:.85}},route:'draft',windowLayout:{docked:false},roomShareRoom:f.room.room,roomShareSig:'',roomShareWarned:false,roomQuietTimer:null,roomAutoQuiet:false,roomScanResults:[],roomError:'',AUTO_QUIET_MS:60000,
   recommendationKey,roomFamiliarityContext,results:[{id:'visible-old'}],offset:6,generating:false,recommendationRun:0,autoRecommendationKey:'old',activeRecommendation:null,autoRecommendTimer:null,recommendationError:'',resultsSignature:'',showAllCandidates:false,clearTimeout,render(){},markResultStale(){},cancelRecommendationReveal(){},toast(){},scheduleRoomPublish(){},queueCompanionRecommendation(){queued++;},roomSharePayload:()=>({lineup:[],pick:null}),resultCreativePlan(){throw Error('A stale worker was committed');},
   calculateRecommendation(){c.activeRecommendation={cancel(){cancelled++;}};return new Promise(resolve=>finish=resolve);},
   recommendationInput(){return {slots:c.slots,...roomFamiliarityContext({client:c.client,room:c.room,slots:c.slots,scope:'party',ownRole:'mid',summary:c.championUsage,mass:.85})};},api:{roomPublish:async()=>next,roomLeave:async()=>next}});
  vm.runInContext(extract('function applyRoomSnapshot(','function rememberPreparation(')+extract('async function publishRoomShare(','function scheduleRoomPublish(')+extract('function cancelRecommendation(){','\n')+extract('async function generate(next=false,automatic=false){','const sync=createClientSync')+`async function leaveRoom(){const action='room-leave';${extract("if(action==='room-leave'){","if(action==='room-transport')")}}`,c);
  const pending=c.generate(),metadata=structuredClone(f.room);metadata.members[1].share.at=99999;metadata.members[1].lastSeen=99999;
  c.applyRoomSnapshot(metadata);assert.equal(cancelled,0);assert.equal(queued,0);assert.equal(c.results[0].id,'visible-old');
  if(notificationFirst)c.applyRoomSnapshot(next);
  if(change==='leave')await c.leaveRoom();else assert.equal(await c.publishRoomShare({force:true}),true);
  assert.equal(cancelled,1,change+' RPC must invalidate before a later notification');assert.equal(queued,1);assert.equal(c.results.length,0);
  c.applyRoomSnapshot(next);assert.equal(cancelled,1);assert.equal(queued,1);
  finish([{id:'late-old'}]);await pending;assert.equal(c.results.length,0);assert.equal(c.generating,false);
 }
});

test('actual LAN transports summary to peers and late joiners and removes it on explicit revocation',async t=>{
 const host=createRoomService({nick:'本人',listenHost:'127.0.0.1',discovery:false}),guest=createRoomService({nick:'伙伴',listenHost:'127.0.0.1',discovery:false}),late=createRoomService({nick:'后来者',listenHost:'127.0.0.1',discovery:false});t.after(()=>{host.dispose();guest.dispose();late.dispose();});
 const started=await host.host(),target={host:'127.0.0.1',port:started.port,room:started.room,pin:started.pin};await guest.join(target);assert.equal(guest.snapshot().championUsage,true);
 host.publish({lineup:[],pick:null,championUsage:usage()});await spin(()=>guest.snapshot().members.find(m=>m.nick==='本人')?.share?.championUsage);
 assert.deepEqual(guest.snapshot().members.find(m=>m.nick==='本人').share.championUsage,usage());await late.join(target);await spin(()=>late.snapshot().members.find(m=>m.nick==='本人')?.share?.championUsage);
 host.publish({lineup:[],pick:null,championUsage:null});await spin(()=>guest.snapshot().members.find(m=>m.nick==='本人')?.share?.championUsage===null);await spin(()=>late.snapshot().members.find(m=>m.nick==='本人')?.share?.championUsage===null);
});
