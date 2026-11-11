import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {pregameHeroRoleChange,pregameLobbyContext,validatePregameIntent} from '../src/core/pregame-intent.mjs';
import {rankedDraftPolicy} from '../src/core/ranked-draft.mjs';
import {heroClickSelection} from '../src/core/configuration-choices.mjs';
import {CONFIGURATION_FIELDS} from '../src/core/preparation.mjs';
import {canonicalJSON} from '../src/core/content-fingerprint.mjs';

const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const stage=source.slice(source.includes('let pregameIntentRevision=')?source.indexOf('let pregameIntentRevision='):source.indexOf('async function stagePregameIntent('),source.indexOf('\nfunction setCompanionRole(',source.indexOf('async function stagePregameIntent(')));
const intent=()=>({role:'mid',champion:'Lux',kind:'hero',selection:{id:'Lux',role:'mid',mode:'rift',runeId:'old-mid-runes',comboId:'old-combo',customRunePage:{selectedPerkIds:[1]},summonerIds:['old']},selectionFields:['runeId','comboId'],catalogChoiceToken:'old-choice'});
const client=()=>({connected:true,phase:'Lobby',mode:{id:'rift'},game:{queueId:430,gameId:0},own:{puuid:'isolated-own'},party:{status:'lobby',lobbyCount:2,members:[{local:true,displayName:'本人'},{displayName:'队友'}]}});

test('only a role-only edit of the same unconsumed lobby hero is eligible for retention',()=>{
 const original=intent(),current=client(),captured=pregameHeroRoleChange({role:'support'},original,current);assert.equal(captured.champion,'Lux');assert.equal(captured.role,'support');
 for(const [change,prior,value] of [
  [{role:'support',champion:null},original,current],[{role:'support',kind:'position'},original,current],[{role:''},original,current],
  [{role:'support'},{...original,kind:'position'},current],[{role:'support'},{...original,attemptedGameId:'101'},current],
  [{role:'support'},original,{...current,connected:false}],[{role:'support'},original,{...current,phase:'ChampSelect'}],
  [{role:'support'},original,{...current,mode:{id:'hex'}}],[{role:'support'},original,{...current,game:{queueId:420}}],
 ])assert.equal(pregameHeroRoleChange(change,prior,value),null);
 assert.equal(pregameHeroRoleChange({role:'support'},structuredClone(original),{...current,phase:'Matchmaking'}).stamp,captured.stamp);
 for(const [prior,value] of [[{...original,champion:'Ahri'},current],[{...original,attemptedGameId:'101'},current],[original,{...current,game:{...current.game,gameId:102}}],[original,{...current,party:{...current.party,key:'another-lobby'}}]])assert.notEqual(pregameHeroRoleChange({role:'support'},prior,value)?.stamp,captured.stamp);
});

function fixture(){
 const requests=[],effects={accepted:[],closed:0,painted:0},data={buildSource:{region:'global',tier:'emerald_plus'}},context=vm.createContext({client:client(),saved:{draft:{preselection:intent()}},data,
  pendingBuildSourceEpoch:null,buildSourceEpoch:0,stateRevision:0,saveChain:Promise.resolve(),pregameHeroRoleChange,pregameLobbyContext,canonicalJSON,rankedDraftPolicy,heroClickSelection,CONFIGURATION_FIELDS,
  sync:async()=>{},api:{stageSelection:async value=>{requests.push(structuredClone(value));return {}; }},selectionReviewStamp:selection=>'review:'+selection.id+':'+selection.role,
  pendingReviewChanged:()=>false,queueCompanionRecommendation(){},closeOverlay(){effects.closed++;context.overlay.firstElementChild=null;},render(){effects.painted++;},acceptSavedState(value,revision){effects.accepted.push(revision);context.saved=value;context.stateRevision=revision;},
  route:'draft',windowLayout:{docked:false},overlay:{firstElementChild:null},companionPreview:null,companionTab:'plan'});
 vm.runInContext(stage,context);return {context,requests,effects,run:change=>context.stagePregameIntent(change),publish(value,revision){if(revision>context.stateRevision){context.saved=value;context.stateRevision=revision;}}};
}

test('changing only the staged role keeps the hero and resets every configuration field to the new lane default',async()=>{
 const f=fixture();await f.run({role:'support'});assert.equal(f.requests.length,1);const request=f.requests[0];
 assert.equal(request.champion,'Lux');assert.equal(request.role,'support');assert.equal(request.kind,'hero');
 assert.deepEqual(request.selection,heroClickSelection(f.context.data,{id:'Lux',role:'support',mode:'rift'}));
 assert.deepEqual(request.selectionFields,[...CONFIGURATION_FIELDS]);assert.equal(request.catalogChoiceToken,undefined);assert.equal(request.reviewStamp,'review:Lux:support');
 assert.equal(validatePregameIntent(request).selection.role,'support');
});

for(const boundary of ['sync','save'])for(const newer of ['hero','source','cancel','consumed','game','mode','ranked','party','phase','offline'])test(`a newer ${newer} at the ${boundary} boundary cannot replay the old hero`,async()=>{
 const f=fixture(),gate=Promise.withResolvers();let entered;
 const started=new Promise(resolve=>{entered=resolve;});
 if(boundary==='sync')f.context.sync=async()=>{entered();await gate.promise;};else{f.context.sync=async()=>{entered();};f.context.saveChain=gate.promise;}
 const running=f.run({role:'support'});await started;
 if(newer==='hero')f.context.saved.draft.preselection={...intent(),champion:'Ahri'};
 else if(newer==='source'){f.context.buildSourceEpoch++;f.context.data.buildSource={region:'kr',tier:'emerald_plus'};}
 else if(newer==='cancel')f.context.saved.draft.preselection={role:'mid',champion:null,kind:'position'};
 else if(newer==='consumed')f.context.saved.draft.preselection={...intent(),attemptedGameId:'101'};
 else if(newer==='game')f.context.client.game.gameId=102;
 else if(newer==='mode')f.context.client.mode.id='hex';
 else if(newer==='ranked')f.context.client.game.queueId=420;
 else if(newer==='phase')f.context.client.phase='ChampSelect';
 else if(newer==='offline')f.context.client.connected=false;
 else f.context.client.party.key='new-party';
 gate.resolve();await assert.rejects(running,/预选|组队|选人/);assert.equal(f.requests.length,0);
});

for(const boundary of ['sync','save'])for(const finalRole of ['bottom','mid'])test(`two actual lane edits sharing the ${boundary} wait keep the hero in the latest ${finalRole} role`,async()=>{
 const f=fixture(),gate=Promise.withResolvers();f.context[boundary==='sync'?'sync':'saveChain']=boundary==='sync'?()=>gate.promise:gate.promise;
 const first=f.run({role:'support'}),latest=f.run({role:finalRole});await Promise.resolve();gate.resolve();
 const settled=await Promise.allSettled([first,latest]);assert(settled.every(result=>result.status==='fulfilled'));assert.deepEqual(f.requests.map(request=>request.role),[finalRole]);assert.equal(f.requests[0].champion,'Lux');
});

function receipt(request,revision){return {state:{draft:{preselection:{role:request.role,champion:request.champion,kind:request.kind,selection:request.selection,selectionFields:request.selectionFields,reviewStamp:request.reviewStamp,buildSource:request.buildSource}}},revision};}

for(const destination of ['modal','route','game','source','external'])test(`a pending stage reply respects a newer ${destination} without repainting it`,async()=>{
 const f=fixture(),gate=Promise.withResolvers(),entered=Promise.withResolvers();let reply;
 f.context.api.stageSelection=async request=>{f.requests.push(structuredClone(request));reply=receipt(request,11);entered.resolve();return gate.promise;};
 const running=f.run({role:'support'});await entered.promise;
 if(destination==='modal')f.context.overlay.firstElementChild={kind:'theme',draft:'keep'};else if(destination==='route')f.context.route='settings';else if(destination==='game')f.context.client.game.gameId=102;else if(destination==='source'){f.context.buildSourceEpoch++;f.context.data.buildSource={region:'kr',tier:'emerald_plus'};}else f.publish({draft:{preselection:{...intent(),champion:'Ahri'}}},20);
 const owner=f.context.overlay.firstElementChild,saved=f.context.saved;gate.resolve(reply);await running;
 assert.equal(f.context.overlay.firstElementChild,owner);assert.equal(f.context.saved,saved);assert.deepEqual(f.effects.accepted,[]);assert.equal(f.effects.closed,0);assert.equal(f.effects.painted,0);
});

for(const finalRole of ['bottom','mid'])test(`a known older local publication cannot beat latest ${finalRole} or close a new modal`,async()=>{
 const f=fixture(),gate=Promise.withResolvers(),entered=Promise.withResolvers();let older;
 f.context.api.stageSelection=async request=>{f.requests.push(structuredClone(request));if(request.role==='support'){older=receipt(request,11);entered.resolve();return gate.promise;}const latest=receipt(request,12);f.publish(latest.state,12);return latest;};
 const first=f.run({role:'support'});await entered.promise;const latest=f.run({role:finalRole});await Promise.resolve();
 f.publish(older.state,11);const modal=f.context.overlay.firstElementChild={kind:'configuration',draft:'keep'};gate.resolve(older);
 const settled=await Promise.allSettled([first,latest]);assert(settled.every(result=>result.status==='fulfilled'));assert.deepEqual(f.requests.map(request=>request.role),['support',finalRole]);assert.equal(f.context.saved.draft.preselection.role,finalRole);assert.equal(f.context.saved.draft.preselection.champion,'Lux');assert.equal(f.context.overlay.firstElementChild,modal);assert.equal(f.effects.closed,0);
});

test('a same-hero external revision is not mistaken for the older local receipt',async()=>{
 const f=fixture(),gate=Promise.withResolvers(),entered=Promise.withResolvers();let older;
 f.context.api.stageSelection=async request=>{f.requests.push(structuredClone(request));older=receipt(request,11);entered.resolve();return gate.promise;};
 const first=f.run({role:'support'});await entered.promise;const latest=f.run({role:'bottom'});
 f.publish({draft:{preselection:{...older.state.draft.preselection,selection:{...older.state.draft.preselection.selection,runeId:'external-own-choice'}}}},12);gate.resolve(older);
 const settled=await Promise.allSettled([first,latest]);assert.equal(settled[0].status,'fulfilled');assert.equal(settled[1].status,'rejected');assert.equal(f.requests.length,1);assert.equal(f.context.saved.draft.preselection.selection.runeId,'external-own-choice');
});

test('a superseded API rejection stays quiet and the latest actual lane edit can still dispatch',async()=>{
 const f=fixture(),gate=Promise.withResolvers(),entered=Promise.withResolvers();
 f.context.api.stageSelection=async request=>{f.requests.push(structuredClone(request));if(request.role==='support'){entered.resolve();return gate.promise;}return {};};
 const first=f.run({role:'support'});await entered.promise;const latest=f.run({role:'bottom'});gate.reject(Error('old isolated IPC failure'));
 const settled=await Promise.allSettled([first,latest]);assert(settled.every(result=>result.status==='fulfilled'));assert.deepEqual(f.requests.map(request=>request.role),['support','bottom']);
});

for(const mode of ['clear-hero','position-only','consumed','clear-role'])test(`${mode} keeps its existing position-only request instead of retaining the hero`,async()=>{
 const f=fixture();let change={role:'support'};
 if(mode==='clear-hero')change.champion=null;
 else if(mode==='position-only'){change.kind='position';f.context.saved.draft.preselection={role:'mid',champion:null,kind:'position'};}
 else if(mode==='consumed')f.context.saved.draft.preselection.attemptedGameId='101';
 else change={role:''};
 await f.run(change);assert.equal(f.requests.length,1);assert.equal(f.requests[0].champion,null);assert.equal(f.requests[0].kind,'position');assert.equal(f.requests[0].selection,undefined);assert.equal(f.requests[0].selectionFields,undefined);
});
