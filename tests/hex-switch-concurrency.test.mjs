import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
import {createHexSelectionQueue} from '../services/hex-selection-queue.mjs';
import {clientPreparationPlan} from '../src/client-preparation-view.mjs';import {runeWriteContext} from '../src/core/rune-context.mjs';
const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8'),data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const implementation=source.slice(source.indexOf('async function useClientPreparation('),source.indexOf('\nasync function claimPosition('));
const own={cellId:0,championId:22,championPickIntent:0,assignedPosition:''},client={connected:true,phase:'ChampSelect',mode:{id:'hex'},session:{gameId:'777',localPlayerCellId:0,myTeam:[own]}};
test('real Hex renderer handler ignores old replies in both orders without restoring busy flags or old pending state',async()=>{
 for(const order of [[0,1],[1,0]]){
  let plan;const pending=[],messages=[];
  const context=vm.createContext({structuredClone,client:structuredClone(client),data,clientPreparationPlan,runeWriteContext,preparationGameId:()=> '777',hexQuickSelectionRevision:0,
   clientPreparing:true,runeApplying:true,itemSetPending:'old-items',preparationPendingKey:'old-key',preparationTarget:{id:'old'},
   api:{prepareSelection:async value=>new Promise(resolve=>pending.push({value,resolve}))},selectedClientPreparation:()=>plan,memberHeroAction:()=>({prepare:true}),
   champ:id=>data.champions.find(c=>c.id===id),sync:async()=>{},render(){},toast:(...args)=>messages.push(args),persist:()=>{throw Error('Hex must not persist a captured build');}});
  vm.runInContext(implementation,context);
  const click=id=>{plan={selection:{id,role:'bottom',mode:'hex'},build:{}};return context.useClientPreparation({dataset:{preparationView:'clicked'}},true,null,true);};
  const first=click('Ashe'),last=click('Caitlyn');context.client.session.myTeam[0].championId=51;
  for(const i of order){pending[i].resolve({complete:true,steps:{hover:{status:'done'}}});await new Promise(resolve=>setImmediate(resolve));}
  await Promise.all([first,last]);assert.equal(messages.length,1);assert.equal(messages[0][0],'已切换英雄');
  assert.equal(context.clientPreparing,true);assert.equal(context.preparationPendingKey,'old-key');assert.equal(context.preparationTarget.id,'old');
 }
});
test('real Hex renderer does not announce success for an unsuccessful response',async()=>{
 const messages=[],plan={selection:{id:'Caitlyn',role:'bottom',mode:'hex'},build:{}};
 const context=vm.createContext({structuredClone,client:structuredClone(client),data,clientPreparationPlan,runeWriteContext,preparationGameId:()=> '777',hexQuickSelectionRevision:0,
  selectedClientPreparation:()=>plan,memberHeroAction:()=>({prepare:true}),api:{prepareSelection:async()=>({complete:false,steps:{hover:{status:'failed',message:'目标已被换走'}}})},sync:async()=>{},render(){},champ:id=>data.champions.find(c=>c.id===id),toast:(...args)=>messages.push(args)});
 vm.runInContext(implementation,context);await context.useClientPreparation({dataset:{preparationView:'clicked'}},true,null,true);
 assert.deepEqual(messages,[['目标已被换走',true]]);
});
test('actual main IPC Hex branch uses the one queue even while Rift resources are busy',async()=>{
 const main=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
 const block=main.slice(main.indexOf(' const {createHexSelectionQueue}'),main.indexOf(" guard('copy',"));
 const script=block.replaceAll("await import('../services/hex-selection-queue.mjs')",'queueModule').replaceAll("await import('../services/client-preparation.mjs')",'serviceModule');
 let handler,active=0,peak=0,release,started;const entered=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve),writes=[];
 const service={validateClientPreparation:value=>{assert.equal(value.mode,'hex');assert.equal(value.preselectOnly,true);return value;},prepareClientSelection:async({value},control)=>{active++;peak=Math.max(peak,active);if(value.champion==='Ashe'){started();await gate;}writes.push(value.champion);active--;return {complete:control.isCurrent()};}};
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 await new AsyncFunction('queueModule','serviceModule','guard','data','state','applyingRunes','importingItemSet',script)({createHexSelectionQueue},service,(name,fn)=>{assert.equal(name,'prepare-selection');handler=fn;},{},{preferences:{}},true,true);
 const first=handler({mode:'hex',preselectOnly:true,champion:'Ashe'});await entered;const last=handler({mode:'hex',preselectOnly:true,champion:'Caitlyn'});release();
 const results=await Promise.all([first,last]);assert.equal(results[0].superseded,true);assert.equal(results[1].complete,true);assert.equal(peak,1);assert.deepEqual(writes,['Ashe','Caitlyn']);
});
