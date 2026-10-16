import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as recommendationCore from '../src/core/recommend.mjs';
import * as guideCore from '../src/core/guide.mjs';
import {publicClientGameId} from '../src/core/draft.mjs';
import {creativeComboContext} from '../src/core/creative-plan.mjs';
import {storedPreparation} from '../src/core/preparation.mjs';
import {rankedClientRoles,getBuild} from '../src/core/builds.mjs';

const main=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const code=main.slice(main.indexOf(' const currentGuideSelection=()=>{'),main.indexOf(' const setGuideState=async'));
const choose=new Function('currentGame','latestClient','latestLive','data','state','publicClientGameId','recommendationCore','creativeComboContext','storedPreparation','rankedClientRoles','guideCore','appliedGuideSelection',code+'return currentGuideSelection();');

test('the current game guide follows an applied reference build without moving an ally lane',()=>{
 const selection={id:'TahmKench',role:'support',mode:'rift',comboId:'kalista-tahm-rescue',loadoutId:'tank-peel'};
 const slots=recommendationCore.createSlots().map(s=>({...s,...(s.role==='top'?{champion:'TahmKench',clientCellId:1}:s.role==='support'?{champion:'Nami',clientCellId:2}:{})}));
 const own={id:'TahmKench',role:'top',formalRole:'top',positionKnown:true,mode:'rift'};
 const tracker={current:()=>({...own})},state={draft:{slots},preferences:{},preparations:[selection]},applied={gameId:'123',selection};
 const client={connected:true,phase:'ChampSelect',game:{gameId:'123'},session:{gameId:123,localPlayerCellId:1,myTeam:[{cellId:1,championId:223,assignedPosition:'TOP'},{cellId:2,championId:267,assignedPosition:'UTILITY'}]}};
 const before=structuredClone(state),hero=data.champions.find(c=>c.id===own.id);
 for(const phase of ['ChampSelect','GameStart','InProgress','Reconnect']){
  const current=choose(tracker,{...client,phase},null,data,state,publicClientGameId,recommendationCore,creativeComboContext,storedPreparation,rankedClientRoles,guideCore,applied);
  assert.equal(current.role,'support');assert.equal(current.formalRole,'top');assert.equal(current.loadoutId,'tank-peel');
  const actual=getBuild(hero,current.role,data,current),expected=getBuild(hero,selection.role,data,selection);
  assert.deepEqual(actual.runePage,expected.runePage);assert.deepEqual(actual.items,expected.items);
 }
 assert.deepEqual(state,before,'Reading the applied configuration must not rearrange the public team');
 const next=choose(tracker,{...client,session:{...client.session,gameId:124},game:{gameId:'124'}},null,data,state,publicClientGameId,recommendationCore,creativeComboContext,storedPreparation,rankedClientRoles,guideCore,applied);
 assert.equal(next.role,'top');assert.notEqual(next.loadoutId,'tank-peel','A next game must not inherit the old applied reference');
 own.id='Garen';const changed=choose(tracker,client,null,data,state,publicClientGameId,recommendationCore,creativeComboContext,storedPreparation,rankedClientRoles,guideCore,applied);
 assert.equal(changed.id,'Garen');assert.notEqual(changed.loadoutId,'tank-peel');
});
