import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {renderResultCard} from '../src/draft-result-view.mjs';
import {restoreTeamFavorite} from '../src/core/team-favorites.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));

test('locked friends retain the same reviewed strategy and preference as the identical completion result',()=>{
 for(const scope of ['party','context'])for(const [members,tempo] of [[{mid:'Ahri',jungle:'Vi'},'early'],[{top:'Garen',jungle:'MasterYi'},'growth'],[{bottom:'KogMaw',support:'Lulu'},'protect']]){
  const slots=createSlots().map(s=>({...s,party:!!members[s.role],champion:members[s.role]||null,locked:!!members[s.role]})),role=Object.keys(members).at(-1),input={champions:data.champions,scope,play:{tempo},pool:[members[role]],poolMode:'only',limit:1};
  const open=recommend({...input,slots:slots.map(s=>s.role===role?{...s,champion:null,locked:false}:s)})[0],locked=recommend({...input,slots})[0];
  assert.deepEqual(locked.slots.map(s=>s.champion),open.slots.map(s=>s.champion));assert.deepEqual(locked.strategy,open.strategy);assert.equal(locked.strategy.tempo,tempo);assert.equal(locked.strategy.matched,true);
  const restored=restoreTeamFavorite({slots,scope:'party'},slots.map(s=>({...s,champion:null,locked:false})),data.champions),again=recommend({...input,slots:restored.slots})[0];assert.deepEqual(again.strategy,locked.strategy);
  assert.doesNotMatch(renderResultCard(locked,0,data,{favorites:[],preferences:{}},'fun'),/你偏好.*这套更偏向/);
 }
});

test('a partial party does not replace the known whole-team strategy when all five heroes are already picked',()=>{
 const members={top:'Malphite',jungle:'JarvanIV',mid:'Orianna',bottom:'Varus',support:'Ashe'},slots=createSlots().map(s=>({...s,champion:members[s.role],locked:true}));
 const [result]=recommend({slots,champions:data.champions,scope:'context',play:{tempo:'poke'}});
 assert.equal(result.adaptive.tempo,'poke');assert.equal(result.adaptive.members.length,3);assert.equal(result.analysis.members.length,5);assert.equal(result.strategy.tempo,'teamfight');assert.equal(result.strategy.matched,false);
});
