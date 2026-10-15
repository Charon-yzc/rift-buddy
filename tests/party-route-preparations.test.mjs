import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan,selectPartyRoute,creativeMemberCombo,creativeComboContext,validateCreativePlan,creativePlanId} from '../src/core/creative-plan.mjs';
import {createPreparationStore,partyRoutePreparations,recallPreparation} from '../src/core/preparation.mjs';
import {captureTeamConfigurations} from '../src/core/team-favorites.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {validateState,defaultState} from '../services/storage.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const setup=picks=>createSlots().map(s=>({...s,party:!!picks[s.role],champion:picks[s.role]||null,locked:!!picks[s.role]}));
const context=(plan,m)=>({id:m.champion,role:m.role,mode:'rift',...creativeComboContext(creativeMemberCombo(plan,m.champion,m.role))});

test('adding fourth and fifth members retains the active reviewed trio preparation, while another route and personal choices remain independent',()=>{
 const core={top:'Camille',jungle:'Vi',mid:'Galio'},hero=id=>data.champions.find(h=>h.id===id);
 const [trio]=recommend({slots:setup(core),champions:data.champions,scope:'party'}),three=captureCreativePlan(trio,data);
 const expected=new Map(three.members.map(m=>[m.champion,getBuild(hero(m.champion),m.role,data,context(three,m))]));
 for(const added of [{support:'Rakan'},{support:'Rakan',bottom:'Jinx'}]){
  const [result]=recommend({slots:setup({...core,...added}),champions:data.champions,scope:'party'}),plan=captureCreativePlan(result,data),saved=validateCreativePlan(JSON.parse(JSON.stringify(plan)));
  assert.equal(saved.shared.routes[0].loadoutGroup.id,three.curated.id);
  for(const m of three.members){const b=getBuild(hero(m.champion),m.role,data,context(saved,m)),before=expected.get(m.champion);assert.equal(b.loadoutId,before.loadoutId);assert.deepEqual(b.runePage,before.runePage);assert.equal(b.skillOrder,before.skillOrder);if(m.champion!=='Camille'){assert.notEqual(b.loadoutId,'default');assert.equal(b.skillOrder.length,18);}assert.deepEqual(b.summoners,before.summoners);const manual=getBuild(hero(m.champion),m.role,data,{...context(saved,m),loadoutId:'default'});assert.equal(manual.loadoutId,'default');}
  for(const m of saved.members.filter(m=>!three.members.some(p=>p.champion===m.champion)))assert.equal(getBuild(hero(m.champion),m.role,data,context(saved,m)).loadoutId,'default');
  const alternate=saved.shared.routes.find(r=>!r.loadoutGroup),changed=selectPartyRoute(saved,alternate.id);
  assert.equal(getBuild(hero('Camille'),'top',data,context(changed,{role:'top',champion:'Camille'})).loadoutId,'default');
  const invalid=structuredClone(saved);invalid.shared.routes[0].loadoutGroup.members[0].champion='Ashe';invalid.id=creativePlanId(invalid);assert.throws(()=>validateCreativePlan(invalid),/配置与当前行动路线/);
 }
});

for(const picks of [{top:'Jax',jungle:'Sejuani',mid:'Ahri'},{top:'Fiora',jungle:'Graves',mid:'TwistedFate',support:'Bard'},{top:'Fiora',jungle:'Ivern',mid:'Zoe',bottom:'Jhin',support:'Bard'}]){
 test(`${Object.keys(picks).length}-person alternate route preserves actual personal choices through restart and favorite capture`,()=>{
  const slots=setup(picks),[result]=recommend({slots,champions:data.champions,scope:'party'}),initial=captureCreativePlan(result,data);
  const from=initial.shared?.routes[0].id==='side-pressure'?selectPartyRoute(initial,initial.shared.routes.find(r=>r.id!=='side-pressure').id):initial;
  const to=selectPartyRoute(from,'side-pressure'),store=createPreparationStore();
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
