import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createSlots,mergeClientSession} from '../src/core/recommend.mjs';
import {restorePlayerPosition,unassignedPublicPicks} from '../src/core/draft.mjs';
import {canonicalJSON} from '../src/core/content-fingerprint.mjs';
import {validateState,defaultState} from '../services/storage.mjs';

const app=fs.readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
const start=app.indexOf('   const merged=mergeClientSession('),end=app.indexOf('slots=merged.slots;',start)+'slots=merged.slots;'.length;
// The slot merge of the periodic client sync, exactly as app.mjs runs it.
const block=app.slice(start,end);
const session=extra=>({gameId:777,localPlayerCellId:0,myTeam:data.champions.slice(0,5).map((hero,cellId)=>({cellId,championId:hero.key,assignedPosition:''})),theirTeam:[],bans:[],allowDuplicatePicks:true,bench:{championIds:[]},...extra});
function sync(slots,publicSession){
 const context=vm.createContext({mergeClientSession,restorePlayerPosition,unassignedPublicPicks,canonicalJSON,JSON,slots,unassigned:[],client:{session:publicSession},data:{champions:data.champions},saved:{draft:{}},ownIntentChanged:false,
  clientSyncOptions:()=>({autoArrange:true,autoParty:true,party:null,roleOrder:{},ownRole:'',creativePlan:null}),reconcileCreativePlan:()=>false});
 return vm.runInContext('(()=>{let changed=false;'+block+';return {changed,slots};})()',context);
}
// The renderer saves the draft and adopts the main process's normalized copy.
const saved=slots=>validateState({...defaultState(),draft:{slots}}).draft.slots;

test('the slot merge runs from app.mjs and produces a lineup from the public session',()=>{
 assert.ok(block.includes('mergeClientSession(')&&block.endsWith('slots=merged.slots;'));
 const result=sync(createSlots().map(slot=>({...slot,party:slot.role==='top'})),session());
 assert.equal(result.changed,true);assert.equal(result.slots.filter(slot=>slot.champion).length,5);
});

test('an unchanged public session never looks like a draft change on later syncs',()=>{
 const publicSession=session();
 let slots=saved(sync(createSlots().map(slot=>({...slot,party:slot.role==='top'})),publicSession).slots);
 for(let pass=0;pass<3;pass++){
  const result=sync(slots,publicSession);
  assert.equal(result.changed,false,'sync '+pass+' must not rewrite and repaint an unchanged draft');
  slots=saved(result.slots);
 }
});

test('a real change in the public session is still detected after normalization',()=>{
 const publicSession=session();
 const slots=saved(sync(createSlots().map(slot=>({...slot,party:slot.role==='top'})),publicSession).slots);
 const swapped=session({myTeam:publicSession.myTeam.map(p=>p.cellId===2?{...p,championId:data.champions[9].key}:p)});
 assert.equal(sync(slots,swapped).changed,true);
});
