import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const implementation=source.slice(source.indexOf('async function prepareHeroClick('),source.indexOf('\nfunction refreshClickedResult'));
test('actual Hex avatar handler leaves manual Rift roles, slots, preselection and pending resources intact on success and failure',async()=>{
 for(const failed of [false,true]){
  const state={soloRole:'support',slots:[{role:'top',party:false,champion:null},{role:'support',champion:'Lux',party:true,manualPosition:true}],saved:{draft:{playerPosition:{role:'support',cellId:0},preselection:{champion:'Lux'}}},preparationPendingKey:'rune-key',preparationTarget:{id:'Lux'},clientPreparing:true};
  const before=structuredClone(state);let calls=0;
  const context=vm.createContext({...state,client:{connected:true,phase:'ChampSelect',mode:{id:'hex'}},runeApplying:true,itemSetPending:'old-items',pregamePhase:()=>false,
   memberHeroAction:()=>({prepare:true,hexHover:true}),taskOwnRole:()=>'support',setCompanionRole:()=>{throw Error('Hex must never change Rift roles');},
   data:{},champ:id=>({id}),getBuild:()=>({}),clickedHeroPreparation:null,companionPreview:null,companionTab:'recommend',closeOverlay(){},render(){},
   useClientPreparation:async()=>{calls++;if(failed)throw Error('mock unavailable hero');return {complete:true};}});
  vm.runInContext(implementation,context);const promise=context.prepareHeroClick({id:'Malphite',role:'top',mode:'hex',quickSwitch:true});
  if(failed)await assert.rejects(promise,/unavailable/);else assert.equal((await promise).complete,true);
  assert.equal(calls,1);for(const key of Object.keys(before))assert.deepEqual(context[key],before[key],key);assert.equal(context.clickedHeroPreparation,null);
 }
});
