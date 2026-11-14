// Current ephemeral notes and explicit storage/export compatibility.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {HEX_OWNED_LIMIT} from '../src/core/hex-note-limits.mjs';
import {createHexRoundStore,hexRoundSelection} from '../src/core/hex-round.mjs';
import {hexManualAugments} from '../src/core/hex-acquisition.mjs';
import {hexDecision} from '../src/core/hex-decisions.mjs';
import {createGuideModel,selectGuide,validateGuideSelection} from '../src/core/guide.mjs';
import {validatePreparation,createPreparationStore} from '../src/core/preparation.mjs';
import {captureRoomConfigurations} from '../src/core/room-configuration.mjs';
import {renderHexComparison} from '../src/hex-view.mjs';
import {renderGuide} from '../src/guide-view.mjs';
import {defaultState,saveState,readState,createBackup,validateState} from '../services/storage.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url)));data.hexBuilds=JSON.parse(await fs.readFile(new URL('../data/hex-builds.json',import.meta.url))).entries;
const ordinary=hexManualAugments(data).map(a=>a.id);
const marks=(last,length)=>[...ordinary.filter(id=>![last,1011,1349,2134,1047,1048].includes(id)).slice(0,length-1),last];
const selection=owned=>({id:'Sona',role:'support',mode:'hex',ownedAugmentIds:owned,compareIds:[1011,1349,2134]});

test('extra acquisition notes accept the seventh and 32nd distinct mark; overflow is atomic',()=>{
 let token=0;const store=createHexRoundStore({newToken:()=>String(++token)});
 store.observe({connected:true,phase:'ChampSelect',mode:'hex',gameId:'900',hero:'Sona'},data);
 const change=(operation,id)=>store.change({...store.snapshot().live,operation,id},data);
 const ids=marks(1004,HEX_OWNED_LIMIT);
 for(const [index,id]of ids.entries()){change('own',id);assert.equal(store.snapshot().live.owned.length,index+1);}
 change('own',1004);assert.deepEqual(store.snapshot().live.owned,ids,'Duplicate mark does not consume another slot');
 const before=store.snapshot();assert.throws(()=>change('own',ordinary.find(id=>!ids.includes(id))),/最多记录 32/);assert.deepEqual(store.snapshot(),before);
 assert.throws(()=>store.change({...before.live,revision:0,operation:'remove',id:ids[0]},data),/已变化/);
 store.observe({connected:false},data);assert.deepEqual(store.snapshot(),before);
 const missing={...data,augments:data.augments.filter(a=>a.id!==1004)};
 store.change({...before.live,operation:'remove',id:1004},missing);assert.equal(store.snapshot().live.owned.length,31);
 const old=store.snapshot().live;store.observe({connected:true,phase:'InProgress',mode:'hex',gameId:'901',hero:'Sona'},data);
 assert.deepEqual(store.snapshot().live.owned,[]);assert.throws(()=>store.change({...old,operation:'own',id:1004},data),/已变化/);
});

test('guide projection accepts all notes, preserves independent limits and strips reusable round context',()=>{
 const owned=marks(3150,HEX_OWNED_LIMIT),value=selection(owned),projected=hexRoundSelection(value,{hero:'Sona',owned,options:value.compareIds});
 const state=selectGuide(null,projected),model=createGuideModel(data,state);
 assert.equal(model.ownedAugments.length,HEX_OWNED_LIMIT);assert.deepEqual(model.hexRoutes,[]);assert.equal(model.hexDecision,null);assert.equal(hexDecision({data,hero:'Sona',owned}).set.count,HEX_OWNED_LIMIT);
 const html=renderHexComparison({data,hero:'Sona',owned,options:value.compareIds});
 assert.match(html,/<details class="hex-owned-details"[^>]*><summary>本局已选 · 32<\/summary>/);
 assert.equal((html.match(/data-action="remove-owned"/g)||[]).length,HEX_OWNED_LIMIT);
 assert.doesNotMatch(renderHexComparison({data,hero:'Sona',owned:owned.slice(0,6),options:[]}),/hex-owned-details/);
 assert.doesNotMatch(renderGuide({model:{...model,compact:false}},'augments',false,()=>'<img>'),/data-guide-section="owned"|查看全部 32 项/);
 assert.deepEqual(validateGuideSelection({...value,ownedAugmentIds:[...owned,...owned]}).ownedAugmentIds,owned);
 assert.throws(()=>validateGuideSelection({...value,ownedAugmentIds:[...owned,ordinary.find(id=>!owned.includes(id))]}),/格式/);
 assert.throws(()=>validateGuideSelection({...value,compareIds:[1002,1047,1048,1141]}),/格式/);
 assert.throws(()=>validateGuideSelection({...value,augmentIds:[1002,1047,1048,1141,1205,2072]}),/格式/);
 const reusable=validatePreparation(value);assert.equal(reusable.ownedAugmentIds,undefined);assert.equal(reusable.compareIds,undefined);
 const payload=captureRoomConfigurations([{role:'support',champion:'Sona'}],data,createPreparationStore(),{current:value,mode:'hex'});
 assert.equal(payload.length,1);assert(!JSON.stringify(payload).includes('ownedAugmentIds'));assert(!JSON.stringify(payload).includes('compareIds'));
});

test('explicit Hex and build favorites round-trip late marks through settings and export',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-hex-extra-'));
 try{
  const owned=marks(3150,HEX_OWNED_LIMIT),state={...defaultState(),guide:selectGuide(null,selection(owned)),favorites:[
   {id:'hex-extra',type:'hex',title:'本局记录',champion:'Sona',augments:[1048],ownedAugmentIds:owned,compareIds:[1011]},
   {id:'build-extra',type:'build',title:'配置记录',champion:'Sona',role:'support',mode:'hex',ownedAugmentIds:owned,compareIds:[1011]},
  ]};
  await saveState(root,state);const loaded=await readState(root),exported=validateState(JSON.parse(createBackup(loaded)));
  for(const result of [loaded,exported]){for(const favorite of result.favorites)assert.deepEqual(favorite.ownedAugmentIds,owned);assert.deepEqual(result.guide.selection.ownedAugmentIds,owned);}
  assert.equal(createHexRoundStore().snapshot().live,null,'A saved favorite never starts a live round');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
