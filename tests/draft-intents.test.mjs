import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {recommendationDraft,comparisonDraft,companionRosterDraft,clientRecommendationDraft} from '../src/core/draft-intents.mjs';
import {createSlots,recommend,mergeClientSession} from '../src/core/recommend.mjs';
import {draftTargets} from '../src/core/draft.mjs';
import {recommendationKey} from '../src/core/preparation.mjs';

const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const key=id=>data.champions.find(c=>c.id===id).key;
const slots=()=>createSlots().map(s=>({...s,party:['jungle','mid','bottom'].includes(s.role)}));
const player=(cellId,champion,assignedPosition='')=>({cellId,championId:0,championPickIntent:key(champion),assignedPosition});
const session=(bottom='Ashe',mid='Ahri')=>({localPlayerCellId:0,myTeam:[player(0,bottom,'BOTTOM'),player(1,mid,'MIDDLE')],theirTeam:[],bans:[],allowDuplicatePicks:false});
test('the sidebar display binds a public hover for dragging without admitting it to confirmed recommendations',()=>{
 const canonical=slots(),client=session(),before=structuredClone(canonical),displayed=companionRosterDraft(canonical,client,data.champions);
 assert.equal(displayed.find(s=>s.role==='bottom').clientCellId,0);assert.equal(displayed.find(s=>s.role==='bottom').champion,'Ashe');
 assert.equal(displayed.find(s=>s.role==='mid').clientCellId,1);assert.equal(displayed.find(s=>s.role==='mid').publicIntent,true);
 assert(clientRecommendationDraft(canonical,client,data.champions,{includePreselected:false}).slots.every(s=>!s.champion));
 assert.deepEqual(canonical,before);
 const duplicate=companionRosterDraft(canonical,{...client,myTeam:[...client.myTeam,{...client.myTeam[0]}]},data.champions);
 assert(!Number.isInteger(duplicate.find(s=>s.role==='bottom').clientCellId),'Ambiguous public ownership cannot authorize a position change');
});
const input=temporary=>({slots:temporary,champions:data.champions,scope:'party',style:'fun',limit:3,poolMode:'only',pool:['Vi','JarvanIV','Amumu','Sejuani']});

test('compare another lineup releases a proposal without erasing it or replacing actual client and manual picks',()=>{
 const picks={jungle:'Vi',mid:'Ahri',bottom:'Ashe'},canonical=slots().map(s=>({...s,...(picks[s.role]?{champion:picks[s.role],locked:true,automaticPosition:true}:{})}));
 const plan={members:Object.entries(picks).map(([role,champion])=>({role,champion}))},before=structuredClone(canonical);
 const current=session();current.myTeam[1]={...current.myTeam[1],championId:key('Ahri')};
 const temporary=comparisonDraft(canonical,plan,current,data.champions);
 assert.deepEqual(draftTargets(temporary,'party'),['jungle','bottom']);
 const results=recommend({...input(temporary),pool:[],poolMode:'prefer'});
 assert.ok(results.length>1);assert.ok(results.every(r=>r.slots.find(s=>s.role==='mid').champion==='Ahri'));
 assert.ok(results.some(r=>r.slots.find(s=>s.role==='bottom').champion!=='Ashe'||r.slots.find(s=>s.role==='jungle').champion!=='Vi'));
 assert.deepEqual(canonical,before,'Returning from comparison still has the original proposal');
 for(const markers of [{manualPosition:true},{clientCellId:4},{automaticPosition:false}]){
  const manual=canonical.map(s=>s.role==='jungle'?{...s,...markers}:s);
  assert.equal(comparisonDraft(manual,plan,current,data.champions).find(s=>s.role==='jungle').champion,'Vi');
 }
 const friends=recommendationDraft(temporary,session('Jinx','Ahri'),data.champions);
 assert.equal(friends.find(s=>s.role==='bottom').champion,'Jinx','Other public hovers remain constraints after releasing proposals');
});

test('public hovers change real recommendation inputs and preserve both intended heroes while filling the remaining friend',()=>{
 const canonical=slots(),before=structuredClone(canonical),firstSession=session(),secondSession=session('Jinx','Veigar');
 const first=recommendationDraft(canonical,firstSession,data.champions),second=recommendationDraft(canonical,secondSession,data.champions);
 assert.deepEqual(canonical,before);assert.deepEqual(draftTargets(first,'party'),['jungle']);
 assert.notEqual(recommendationKey(input(first)),recommendationKey(input(second)));
 const firstResults=recommend(input(first)),secondResults=recommend(input(second));
 for(const [results,bottom,mid] of [[firstResults,'Ashe','Ahri'],[secondResults,'Jinx','Veigar']]){
  assert.ok(results.length);
  for(const result of results){
   assert.deepEqual(result.targets,['jungle']);assert.ok(result.slots.find(s=>s.role==='jungle').champion);
   for(const [role,id] of [['bottom',bottom],['mid',mid]]){
    const held=result.slots.find(s=>s.role===role);assert.equal(held.champion,id);assert.equal(held.publicIntent,true);assert.equal(held.locked,false);
   }
  }
 }
 assert.notEqual(firstResults[0].id,secondResults[0].id);assert.deepEqual(canonical,before);
 const editable=first.map(({publicIntent,...s})=>s);
 assert.notEqual(recommendationKey(input(first)),recommendationKey(input(editable)));
 assert.deepEqual(draftTargets(editable,'party'),['jungle','mid','bottom']);
});

test('saved fixed members stay fixed when an older adoption overmarked them as automatic suggestions',()=>{
 const picks={jungle:'Vi',mid:'Ahri',bottom:'Ashe'};
 const canonical=slots().map(s=>({...s,...(picks[s.role]?{champion:picks[s.role],locked:true,automaticPosition:true}:{})}));
 const plan={members:Object.entries(picks).map(([role,champion])=>({role,champion})),editableTargets:[]};
 const restored=JSON.parse(JSON.stringify({slots:canonical,plan}));
 assert.deepEqual(comparisonDraft(restored.slots,restored.plan,null,data.champions),canonical);
 restored.plan.editableTargets=['jungle'];
 const compared=comparisonDraft(restored.slots,restored.plan,null,data.champions);
 assert.equal(compared.find(s=>s.role==='jungle').champion,null);
 assert.equal(compared.find(s=>s.role==='mid').champion,'Ahri');
 assert.equal(compared.find(s=>s.role==='bottom').champion,'Ashe');
 assert.deepEqual(restored.slots,canonical,'Comparing preserves the saved lineup');
});

test('blind-pick public hovers use temporary usual lanes while manual bindings and explicit own roles take priority',()=>{
 const canonical=slots(),unknown={...session(),myTeam:[player(0,'Ashe'),player(1,'Ahri')]};
 const inferred=recommendationDraft(canonical,unknown,data.champions);
 assert.equal(inferred.find(s=>s.role==='bottom').champion,'Ashe');assert.equal(inferred.find(s=>s.role==='mid').champion,'Ahri');
 assert.ok(inferred.filter(s=>s.champion).every(s=>s.publicIntent&&!s.locked&&!Number.isInteger(s.clientCellId)));
 assert.ok(canonical.every(s=>!s.champion),'Inferring a hover must not assign the persisted draft or claim a lane');
 const own=recommendationDraft(canonical,unknown,data.champions,{ownRole:'bottom'});
 assert.equal(own.find(s=>s.role==='bottom').champion,'Ashe');assert.equal(own.find(s=>s.role==='mid').champion,'Ahri');
 const manual=canonical.map(s=>s.role==='support'?{...s,manualPosition:true,clientCellId:0}:s);
 const bound=recommendationDraft(manual,session(),data.champions,{ownRole:'bottom'});
 assert.equal(bound.find(s=>s.role==='support').champion,'Ashe');assert.equal(bound.find(s=>s.role==='support').manualPosition,true);
 assert.equal(bound.find(s=>s.role==='bottom').champion,null);assert.equal(bound.find(s=>s.role==='mid').champion,'Ahri');
 const explicit=recommendationDraft(canonical,session(),data.champions,{ownRole:'support'});
 assert.equal(explicit.find(s=>s.role==='support').champion,'Ashe');assert.equal(explicit.find(s=>s.role==='bottom').champion,null);
});

test('blind-pick hovers reserve declared and manual lanes, use another available lane on conflict, and constrain recommendations',()=>{
 const current={...session(),myTeam:[player(2,'Lux'),player(1,'Ahri'),player(0,'Ashe','BOTTOM')]};
 const context=recommendationDraft(slots(),current,data.champions),reverse=recommendationDraft(slots(),{...current,myTeam:[...current.myTeam].reverse()},data.champions);
 assert.deepEqual(context,reverse);assert.equal(context.find(s=>s.role==='mid').champion,'Ahri');assert.equal(context.find(s=>s.role==='support').champion,'Lux');
 const candidates=recommend({...input(context),pool:[],poolMode:'prefer'});
 assert.ok(candidates.length);assert.ok(candidates.every(r=>r.slots.some(s=>s.champion==='Ahri'&&s.role==='mid')));
 const manual=slots().map(s=>s.role==='mid'?{...s,manualPosition:true,clientCellId:9}:s);
 assert.deepEqual(recommendationDraft(manual,current,data.champions).find(s=>s.role==='mid'),manual.find(s=>s.role==='mid'));
 const unpicked={...current,myTeam:[{cellId:0,championId:0,championPickIntent:0,assignedPosition:'MIDDLE'},player(1,'Ahri')]};
 assert.equal(recommendationDraft(slots(),unpicked,data.champions).find(s=>s.role==='mid').champion,null,'An inferred peer hover cannot take an unpicked player’s declared lane');
 assert.ok(recommendationDraft(slots(),unpicked,data.champions).some(s=>s.champion==='Ahri'));
 assert.deepEqual(recommendationDraft(context,{...current,myTeam:[]},data.champions),slots());
});

test('known party hovers define the recommendation range without becoming selected heroes or overriding manual scope',()=>{
 const canonical=createSlots(),current={...session(),localPlayerCellId:2,myTeam:[player(0,'Garen'),player(1,'LeeSin'),player(2,'Ahri'),player(3,'Nami')]};
 const party={status:'known',unmatched:0,members:[{cellId:0},{cellId:1},{cellId:2,local:true}]},options={autoParty:true,party,ownRole:'mid'};
 const merged=mergeClientSession(canonical,current,data.champions,options).slots;
 assert.deepEqual(merged.filter(s=>s.party).map(s=>s.role),['top','jungle','mid']);
 assert.ok(merged.every(s=>!s.champion&&!s.locked&&!s.publicIntent),'A hover must not be persisted as a selected hero');
 const temporary=recommendationDraft(merged,current,data.champions,{ownRole:'mid'});
 assert.deepEqual(temporary.filter(s=>s.party).map(s=>s.champion),['Garen','LeeSin','Ahri']);
 assert.equal(temporary.find(s=>s.champion==='Nami').party,false,'A stranger hover must not join our party');
 const results=recommend({...input(temporary),pool:[],poolMode:'prefer'});
 assert.ok(results.length);for(const result of results)assert.deepEqual(result.slots.filter(s=>s.party).map(s=>s.champion),['Garen','LeeSin','Ahri']);
 const manual=canonical.map(s=>s.role==='jungle'?{...s,party:false,partyManual:true}:s);
 assert.equal(mergeClientSession(manual,current,data.champions,options).slots.find(s=>s.role==='jungle').party,false);
 const conflict={...current,myTeam:[player(0,'Lux'),player(1,'Ahri'),player(2,'Ashe')]},conflictOptions={...options,ownRole:'bottom'};
 const conflicted=mergeClientSession(canonical,conflict,data.champions,conflictOptions).slots,visible=recommendationDraft(conflicted,conflict,data.champions,{ownRole:'bottom'});
 assert.deepEqual(visible.filter(s=>s.party).map(s=>s.champion).sort(),['Ahri','Ashe','Lux']);
 assert.deepEqual(canonical,createSlots(),'Public party inference must preserve the source draft');
});

test('confirmed picks and manual locks survive different hovers without duplicates or ownership changes',()=>{
 const canonical=slots().map(s=>s.role==='bottom'?{...s,champion:'Jinx',locked:true,manualPosition:true,clientCellId:0}:s);
 const before=structuredClone(canonical),result=recommendationDraft(canonical,session(),data.champions);
 assert.deepEqual(result.find(s=>s.role==='bottom'),canonical.find(s=>s.role==='bottom'));assert.deepEqual(canonical,before);
 const selected=session();selected.myTeam[0]={...selected.myTeam[0],championId:key('Jinx')};
 const confirmed=mergeClientSession(slots(),selected,data.champions).slots;
 const kept=recommendationDraft(confirmed,selected,data.champions);
 assert.deepEqual(kept.find(s=>s.role==='bottom'),confirmed.find(s=>s.role==='bottom'));
 assert.equal(kept.find(s=>s.role==='bottom').publicIntent,undefined);
 const occupied=slots().map(s=>s.role==='bottom'?{...s,clientCellId:3,manualPosition:true}:s);
 assert.equal(recommendationDraft(occupied,session(),data.champions).find(s=>s.role==='bottom').champion,null);
});

test('a public hover can move an unconfirmed proposal hero to its declared lane without duplicating or changing the stored proposal',()=>{
 const canonical=slots().map(s=>s.role==='mid'?{...s,champion:'Lux',locked:true,automaticPosition:true}:s),before=structuredClone(canonical);
 const current={...session(),myTeam:[player(1,'Lux','UTILITY')]};
 const temporary=recommendationDraft(canonical,current,data.champions);
 assert.equal(temporary.find(s=>s.role==='mid').champion,null);assert.equal(temporary.find(s=>s.role==='support').champion,'Lux');
 assert.equal(temporary.filter(s=>s.champion==='Lux').length,1);assert.deepEqual(canonical,before);
 const manual=canonical.map(s=>s.role==='mid'?{...s,manualPosition:true}:s);
 assert.equal(recommendationDraft(manual,current,data.champions).find(s=>s.role==='support').champion,null);
});

test('duplicate, banned, unavailable and opposing public intents cannot enter the recommendation draft',()=>{
 const canonical=slots();
 const duplicated={...session(),myTeam:[player(0,'Ashe','BOTTOM'),player(1,'Ashe','MIDDLE')]};
 assert.deepEqual(recommendationDraft(canonical,duplicated,data.champions),canonical);
 const existing=canonical.map(s=>s.role==='support'?{...s,champion:'Ashe',locked:true}:s);
 assert.equal(recommendationDraft(existing,session(),data.champions).find(s=>s.role==='bottom').champion,null);
 for(const [current,options] of [
  [{...session(),bans:[key('Ashe')]},{}],
  [session(),{bans:['Ashe']}],
  [session(),{disabled:[key('Ashe')]}],
  [session(),{eligibleByRole:{bottom:['Jinx']}}],
  [session(),{eligibleByRole:{bottom:[]}}],
  [{...session(),theirTeam:[{cellId:5,championId:key('Ashe')}]},{}],
  [{...session(),myTeam:[...session().myTeam,{cellId:2,championId:key('Ashe')}]},{}],
 ])assert.equal(recommendationDraft(canonical,current,data.champions,options).find(s=>s.role==='bottom').champion,null);
 const enemyOnly={...session(),myTeam:[],theirTeam:[player(5,'Ashe','BOTTOM')]};
 assert.deepEqual(recommendationDraft(canonical,enemyOnly,data.champions),canonical);
 const ambiguous={...session(),myTeam:[player(0,'Ashe','MIDDLE'),player(1,'Ahri','MIDDLE')]};
 assert.deepEqual(recommendationDraft(canonical,ambiguous,data.champions),canonical);
});

test('cleared, changed or newly invalid hovers expire without mutating canonical slots or becoming locks',()=>{
 const canonical=slots(),temporary=recommendationDraft(canonical,session(),data.champions),signature=recommendationKey(input(temporary));
 for(const current of [null,{...session(),myTeam:session().myTeam.map(p=>({...p,championPickIntent:0}))}]){
  const cleared=recommendationDraft(temporary,current,data.champions);
  assert.deepEqual(cleared,canonical);assert.notEqual(recommendationKey(input(cleared)),signature);
 }
 const changed=recommendationDraft(temporary,session('Jinx','Veigar'),data.champions);
 assert.equal(changed.find(s=>s.role==='bottom').champion,'Jinx');assert.equal(changed.find(s=>s.role==='mid').champion,'Veigar');
 const banned=recommendationDraft(temporary,{...session(),bans:[key('Ashe'),key('Ahri')]},data.champions);
 assert.deepEqual(banned,canonical);assert.ok(canonical.every(s=>!s.champion&&!s.publicIntent&&!s.locked));
 const ownSolo=recommendationDraft(createSlots(),{...session(),myTeam:[player(0,'Ashe','BOTTOM')]},data.champions);
 const [solo]=recommend({slots:ownSolo,champions:data.champions,scope:'solo',soloRole:'bottom',limit:3});
 assert.equal(solo.slots.find(s=>s.role==='bottom').champion,'Ashe');assert.equal(solo.slots.find(s=>s.role==='bottom').locked,false);assert.deepEqual(solo.targets,[]);
});
