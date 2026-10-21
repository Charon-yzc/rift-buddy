import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {isDeepStrictEqual} from 'node:util';
import * as storage from '../services/storage.mjs';
import {publicClientGameId,reconcileClientDraft} from '../src/core/draft.mjs';
import {rebaseWindowState} from '../src/core/window-state.mjs';
import {currentEnemyRoles} from '../src/core/enemy-roles.mjs';
import {preparationIdentity,upsertPreparation} from '../src/core/preparation.mjs';

const source=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
const merge=source.slice(source.indexOf('function mergeSavedFields('),source.indexOf('function saveCurrentState('));
const handler=source.slice(source.indexOf(" guard('save-state'"),source.indexOf(" const {createClientSync}"));
const slots=()=>['top','jungle','mid','bottom','support'].map(role=>({role,champion:null,party:false,locked:false}));
function base(){const value=storage.defaultState();value.draft={slots:slots(),partyCount:0,scope:'party',style:'fun',clientGameId:'123'};return storage.validateState(value);}
async function setup(current=base(),gameId='123'){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-scope-save-'));let save;
 const context=vm.createContext({state:current,stateRevision:0,storage,structuredClone,isDeepStrictEqual,publicClientGameId,reconcileClientDraft,currentEnemyRoles,preparationIdentity,upsertPreparation,data:{champions:[]},latestClient:{connected:true,phase:'ChampSelect',game:{gameId},session:{gameId,localPlayerCellId:0,myTeam:[],actions:[]}},guard(name,callback){assert.equal(name,'save-state');save=callback;},closeAutoRoomIfRevoked(){},guide:{publish(){}},companion:{sync(){}}});
 context.saveCurrentState=async update=>{const next=update(structuredClone(context.state));await storage.saveState(root,next);context.state=next;context.stateRevision++;};
 vm.runInContext(merge+handler,context);
 return {context,save:(next,previous)=>save(next,previous,{sender:null}),read:()=>storage.readState(root)};
}

test('actual save handler retains an explicit same-visible-value scope over automatic initialization in either arrival order',async()=>{
 for(const explicitFirst of [false,true]){
  const before=base(),automatic=structuredClone(before),explicit=structuredClone(before);automatic.draft.scope='context';automatic.draft.referenceQueue=420;explicit.draft.scopeSelection='party';
  const f=await setup();
  for(const next of explicitFirst?[explicit,automatic]:[automatic,explicit])await f.save(next,before);
  assert.equal(f.context.state.draft.scope,'party');assert.equal(f.context.state.draft.scopeSelection,'party');assert.equal(f.context.state.draft.referenceQueue,420);assert.equal(f.context.state.draft.partyCount,0);assert(f.context.state.draft.slots.every(slot=>!slot.party));
  const disk=await f.read();assert.equal(disk.draft.scope,'party');assert.equal(disk.draft.scopeSelection,'party');
  const rebased=rebaseWindowState(before,explicit,automatic);assert.equal(rebased.draft.scope,'party');assert.equal(rebased.draft.scopeSelection,'party');
 }
});

test('actual save handler rejects stale-game scope resurrection and preserves unrelated conflict protection',async()=>{
 const previous=base(),current=base();current.draft.clientGameId='124';current.draft.referenceQueue=430;
 const f=await setup(current,'124'),old=structuredClone(previous);old.draft.scope='context';old.draft.scopeSelection='context';await f.save(old,previous);assert.equal(f.context.state.draft.clientGameId,'124');assert.equal(f.context.state.draft.scope,'party');assert.equal(f.context.state.draft.scopeSelection,undefined);
 const baseline=structuredClone(f.context.state),a=structuredClone(baseline),b=structuredClone(baseline);a.draft.style='balanced';b.draft.style='wild';await f.save(a,baseline);await assert.rejects(f.save(b,baseline),/同时发生变化/);assert.equal(f.context.state.draft.style,'balanced');
});

test('rebasing a queued old-game scope cannot disguise it as a new-game explicit choice',async()=>{
 const previous=base(),old=structuredClone(previous),current=base();old.draft.scopeSelection='party';old.preferences.autoCheck=false;current.draft.clientGameId='124';current.draft.scope='context';current.draft.referenceQueue=420;
 const queued=rebaseWindowState(previous,old,current);assert.equal(queued.draft.clientGameId,'124');assert.equal(queued.draft.scopeSelection,undefined);assert.equal(queued.draft.scope,'context');assert.equal(queued.draft.referenceQueue,420);assert.equal(queued.preferences.autoCheck,false);
 const f=await setup(current,'124');await f.save(queued,current);assert.equal(f.context.state.draft.scope,'context');assert.equal(f.context.state.draft.scopeSelection,undefined);
 const lobby=structuredClone(current);delete lobby.draft.clientGameId;delete lobby.draft.referenceQueue;lobby.draft.scope='party';assert.equal(rebaseWindowState(previous,old,lobby).draft.scopeSelection,undefined);
 const fresh=structuredClone(current);fresh.draft.scope='party';fresh.draft.scopeSelection='party';assert.equal(rebaseWindowState(previous,fresh,current).draft.scopeSelection,'party','A choice actually made in new game124 remains explicit');
});
