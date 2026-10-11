import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan,selectPartyRoute,creativeMemberCombo,creativeComboContext} from '../src/core/creative-plan.mjs';
import {createPreparationStore,partyRoutePreparations,recallPreparation} from '../src/core/preparation.mjs';
import {captureTeamConfigurations} from '../src/core/team-favorites.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {validateState,defaultState} from '../services/storage.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const setup=picks=>createSlots().map(s=>({...s,party:!!picks[s.role],champion:picks[s.role]||null,locked:!!picks[s.role]}));
const context=(plan,m)=>({id:m.champion,role:m.role,mode:'rift',...creativeComboContext(creativeMemberCombo(plan,m.champion,m.role))});

for(const picks of [{top:'Jax',jungle:'Sejuani',mid:'Ahri'},{top:'Fiora',jungle:'Graves',mid:'TwistedFate',support:'Bard'},{top:'Fiora',jungle:'Ivern',mid:'Zoe',bottom:'Jhin',support:'Bard'}]){
 test(`${Object.keys(picks).length}-person alternate route preserves actual personal choices through restart and favorite capture`,()=>{
  const slots=setup(picks),[result]=recommend({slots,champions:data.champions,scope:'party'}),from=captureCreativePlan(result,data),to=selectPartyRoute(from,'side-pressure'),store=createPreparationStore();
  for(const m of from.members){const c=context(from,m),b=getBuild(data.champions.find(h=>h.id===m.champion),m.role,data,c);store.remember({...c,conditions:['ap'],customRunePage:{...b.runePage,patch:data.patch},customSkillOrder:{order:'QEW',priority:'EWQ',patch:data.patch},summonerIds:['SummonerFlash','SummonerExhaust'],sourceOpponent:'Ashe'});}
  const old=store.snapshot(),next=partyRoutePreparations(store,from,to);assert.deepEqual(store.snapshot(),old,'preview helper never writes');assert.equal(next.length,from.members.length);
  let preview=from;for(const route of from.shared?.routes||from.cooperation?.routes||[])preview=selectPartyRoute(preview,route.id);const repeated=selectPartyRoute(preview,'side-pressure');assert.equal(partyRoutePreparations(store,from,repeated).length,from.members.length,'repeated previews remain within the original route family');
  for(const p of next)store.remember(p);
  const restarted=createPreparationStore();restarted.restore(validateState({...defaultState(),preparations:store.snapshot()}).preparations);
  for(const m of to.members){const p=recallPreparation(restarted,null,context(to,m)),b=getBuild(data.champions.find(h=>h.id===m.champion),m.role,data,p);assert.equal(p.creativePlan.id,to.id);assert.equal(b.skillOrder,'QEW');assert.equal(b.priority,'EWQ');assert.deepEqual(p.conditions,['ap']);assert.deepEqual(b.summoners,['SummonerFlash','SummonerExhaust']);assert.equal(p.sourceOpponent,'Ashe');assert.deepEqual(restarted.recall(context(from,m)),old.find(p=>p.id===m.champion));}
  const configs=captureTeamConfigurations({...result,creativePlan:to},data,restarted);assert.equal(configs.length,to.members.length);for(const p of configs){assert.equal(p.customSkillOrder.order,'QEW');assert.deepEqual(p.summonerIds,['SummonerFlash','SummonerExhaust']);assert.equal(p.creativePlan.id,to.id);}
 });
}
test('destination edits win, while unrelated plans, positions and modes never supply route choices',()=>{
 const slots=setup({top:'Fiora',jungle:'Graves',mid:'TwistedFate',support:'Bard'}),[result]=recommend({slots,champions:data.champions,scope:'party'}),from=captureCreativePlan(result,data),to=selectPartyRoute(from,'side-pressure'),store=createPreparationStore(),m=from.members.find(m=>m.champion==='Bard'),old=context(from,m),target=context(to,m);
 store.remember({...old,customSkillOrder:{order:'QEW',patch:data.patch}});store.remember({...target,customSkillOrder:{order:'EQW',patch:data.patch}});
 assert.deepEqual(partyRoutePreparations(store,from,to),[]);assert.equal(store.recall(target).customSkillOrder.order,'EQW');assert.deepEqual(partyRoutePreparations(store,from,from),[]);
 const isolated=createPreparationStore();isolated.remember({...old,mode:'hex',creativePlan:undefined});isolated.remember({...old,role:'mid',creativePlan:undefined});isolated.remember({...old,comboId:'unrelated',creativePlan:undefined});assert.deepEqual(partyRoutePreparations(isolated,from,to),[]);
 const [other]=recommend({slots:setup({top:'Garen',jungle:'Graves',mid:'TwistedFate',support:'Bard'}),champions:data.champions,scope:'party'});assert.throws(()=>partyRoutePreparations(store,captureCreativePlan(other,data),to),/路线/);
 assert.deepEqual(partyRoutePreparations(store,null,to),[]);
});
