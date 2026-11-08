import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
import {heroClickSelection} from '../src/core/configuration-choices.mjs';
import {runeWriteContext} from '../src/core/rune-context.mjs';
const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const implementation=source.slice(source.indexOf('let riftHeroClickRevision='),source.indexOf('\nasync function prepareHeroClick('));
function setup({busy=false}={}){
 const calls=[],client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{gameId:'777',localPlayerCellId:1,myTeam:[{cellId:1,championId:0,championPickIntent:0,assignedPosition:'BOTTOM'}]}},context=vm.createContext({
  client,data:{},runeWriteContext,preparationGameId:()=>client.session.gameId,heroClickSelection,
  api:{prepareSelection:async value=>{calls.push(value);return {complete:true,steps:{hover:{status:'done'}}};}},
  clientPreparing:busy,runeApplying:false,itemSetPending:null,lastTaskSelection:null,companionPreview:null,
  closeOverlay(){},render(){},sync:async()=>{},toast(){},prepareHeroClick:async(s,_expected,selectedFirst)=>{calls.push({configuration:s,selectedFirst});return {complete:true};}
 });vm.runInContext(implementation,context);return {calls,context,client};
}
test('avatar chooses a hero before any build or lineup adoption and configures the role default',async()=>{
 const f=setup();await f.context.selectRiftHero({id:'Ashe',role:'bottom',mode:'rift',comboId:'old-combo',loadoutId:'old-loadout',runeId:'old-rune'});
 assert.equal(f.calls[0].preselectOnly,true);assert.equal(f.calls[0].champion,'Ashe');assert.equal(f.calls[0].selection,undefined);assert.equal(f.calls[0].page,undefined);
 assert.equal(f.calls[1].selectedFirst,true);assert.equal(f.calls[1].configuration.loadoutId,'default');assert.equal(f.calls[1].configuration.comboId,undefined);assert.equal(f.calls[1].configuration.runeId,undefined);
});
test('an older busy configuration cannot block a new explicit hero selection',async()=>{
 const f=setup({busy:true});await f.context.selectRiftHero({id:'Jinx',role:'bottom',mode:'rift'});
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].champion,'Jinx');assert.equal(f.context.lastTaskSelection.id,'Jinx');
});
test('latest avatar wins without configuring the old hero after its delayed reply',async()=>{
 const f=setup();let firstReply;f.context.api.prepareSelection=value=>{f.calls.push(value);return value.champion==='Ashe'?new Promise(r=>firstReply=r):Promise.resolve({steps:{hover:{status:'done'}}});};
 const first=f.context.selectRiftHero({id:'Ashe',role:'bottom',mode:'rift'});await f.context.selectRiftHero({id:'Jinx',role:'bottom',mode:'rift'});firstReply({steps:{hover:{status:'done'}}});await first;
 assert.equal(f.context.lastTaskSelection.id,'Jinx');assert.deepEqual(f.calls.filter(c=>c.configuration).map(c=>c.configuration.id),['Jinx']);
});
test('a reply from a previous game cannot restore a hero or configure the new game',async()=>{
 const f=setup();f.context.api.prepareSelection=async value=>{f.calls.push(value);f.client.session.gameId='778';return {steps:{hover:{status:'done'}}};};
 await f.context.selectRiftHero({id:'Ashe',role:'bottom',mode:'rift'});assert.equal(f.context.lastTaskSelection,null);assert.equal(f.calls.length,1);
});
