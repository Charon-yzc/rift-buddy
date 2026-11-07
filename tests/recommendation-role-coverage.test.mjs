import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import {createCompositionMechanics} from '../src/core/composition-mechanics.mjs';
import {compositionFit} from '../src/core/composition-fit.mjs';
import {createRecommendationSearch,createSlots,recommend,replaceMember} from '../src/core/recommend.mjs';
import {createRecommendationLane,createRecommendationSearchSession} from '../src/core/recommendation-search.mjs';
import {meetsRecommendationFit,orderRecommendationPage} from '../src/core/recommendation-policy.mjs';
import {lineupFit} from '../src/core/room-ballot.mjs';
import {BUNDLED_CATALOG} from '../src/core/catalog.mjs';
import {clientRecommendationDraft, recommendationDraft} from '../src/core/draft-intents.mjs';
import {recommendationKey} from '../src/core/preparation.mjs';
import {recommendationConditionsKey} from '../src/core/recommendation-input.mjs';
import {captureCreativePlan} from '../src/core/creative-plan.mjs';

test('community search revisits the player role across batches and still covers other roles',()=>{
 const targets=['top','jungle','mid','bottom','support'];
 const fixed=targets.map(role=>({role,champion:null}));
 const candidates=Object.fromEntries(targets.map(role=>[role,[{id:role+'1'},{id:role+'2'}]]));
 const record=(id,roles,index=1)=>({id,roles,seed:fixed.map(slot=>roles.includes(slot.role)?{...slot,champion:slot.role+index}:slot)});
 const communityRecords=[record('a-bottom',['bottom','support']),record('b-bottom',['bottom','support'],2),record('m-mid',['mid','support']),
  record('top-jungle-a',['top','jungle']),record('top-jungle-b',['top','jungle'],2),record('top-mid-a',['top','mid']),record('top-mid-b',['top','mid'],2)];
 function firstVisits(communityAfter=''){
  const evaluated=new Set();
  const {community}=createRecommendationLane({fixed,targets,candidates,seeds:[],weights:{},communityRecords,focusRole:'top',randomSeed:'ranked',communityAfter,evaluate:(_slots,id)=>{evaluated.add(id);return null;}});
  for(let step=0;step<300&&!community.exhausted;step++)community.work(true,true);
  return [...evaluated];
 }
 const order=firstVisits();
 assert.deepEqual(new Set(order),new Set(communityRecords.map(record=>record.id)));
 assert.deepEqual(order.map(id=>id.startsWith('top-')),[true,true,false,true,true,false,false]);
 assert.notEqual(order[0].split('-')[1],order[1].split('-')[1]);
 assert.deepEqual(firstVisits(order[1]).slice(0,3),order.slice(2,5));
});

test('a manually selected position guides recipe search before it is bound to the client slot',()=>{
 const slots=createSlots().map(slot=>({...slot,party:['top','jungle'].includes(slot.role)}));
 const clientSession={localPlayerCellId:1,myTeam:[{cellId:1,championId:0,assignedPosition:''}]};
 const focusRole=recommend({slots,champions:game.champions,patch:game.patch,scope:'party',soloRole:'top',clientSession},lane=>lane.focusRole);
 assert.equal(focusRole,'top');
});

test('a manually confirmed position overrides the formal assignment and invalidates draft searches',()=>{
 const slots=createSlots().map(slot=>({...slot,party:['top','jungle'].includes(slot.role),champion:slot.role==='top'?'Shen':null}));
 const session={localPlayerCellId:3,myTeam:[{cellId:3,championId:0,assignedPosition:'BOTTOM'}]};
 const confirmed=clientRecommendationDraft(slots,session,game.champions,{ownRole:'top'});
 const input={slots:recommendationDraft(confirmed.slots,confirmed.session,game.champions,{ownRole:'top'}),fitSlots:slots,fitSession:session,clientSession:confirmed.session,champions:game.champions,patch:game.patch,scope:'context',soloRole:'top'};
 const searchFocus=options=>recommend(options,lane=>lane.focusRole);
 assert.equal(searchFocus(input),'bottom');
 const claimed={...input,ownRole:'top'};
 assert.equal(searchFocus(claimed),'top');
 assert.notEqual(recommendationKey(claimed),recommendationKey(input));
 assert.notEqual(recommendationConditionsKey(claimed),recommendationConditionsKey(input));
});

test('a single editable player receives their own plan while fixed teammate pairs still count in fit',()=>{
 const owners=BUNDLED_CATALOG.duos.filter(combo=>['jinx-lulu','vi-ahri-jungle-mid-confirmed-catch'].includes(combo.id));
 const catalogStatus=Object.fromEntries(owners.map(combo=>[combo.id,{patch:combo.patch,invalid:false,stale:false,historicalCompatible:true,historicalPatch:game.patch,historicalEvidence:'fixture'}]));
 assert.equal(owners.length,2);
 const picks={top:'Ornn',jungle:'Vi',mid:'Ahri',bottom:'Jinx',support:'Lulu'};
 const key=id=>Number(game.champions.find(hero=>hero.id===id)?.key)||0;
 let lastInput;
 const candidate=(role,champion,creativePlan,allyChanges={})=>{
  const fitSlots=createSlots().map((slot,clientCellId)=>({...slot,clientCellId,party:slot.role===role,champion:slot.role===role?(creativePlan?champion:null):allyChanges[slot.role]||picks[slot.role],locked:slot.role!==role||!!creativePlan}));
  const fitSession={localPlayerCellId:fitSlots.find(slot=>slot.role===role).clientCellId,myTeam:fitSlots.map((slot,i)=>({cellId:i,assignedPosition:['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'][i],championId:key(slot.champion),pickState:slot.locked?'locked':'empty'})),actions:[],bans:[]};
  const confirmed=clientRecommendationDraft(fitSlots,fitSession,game.champions,{ownRole:role});
  lastInput={slots:confirmed.slots,clientSession:confirmed.session,fitSlots,fitSession,ownRole:role,champions:game.champions,patch:game.patch,scope:'context',catalogStatus,creativePlan,rolePools:{[role]:{mode:'only',heroes:[champion]}}};
  const search=createRecommendationSearch(lastInput);
  for(let i=0;i<12;i++){
   const [row]=search.advance({limit:6}).rows;
   if(row)return row;
  }
  assert.fail('Expected an eligible recommendation');
 };
 const mid=candidate('mid','Ahri');
 assert.equal(mid.duo?.id,'vi-ahri-jungle-mid-confirmed-catch');
 assert.equal(mid.recommendationFit.known,5);
 assert.deepEqual(mid.slots.filter(slot=>slot.role!=='mid').map(slot=>slot.champion),['Ornn','Vi','Jinx','Lulu']);
 assert.ok(mid.recommendationFit.score>=60);
 const plan=captureCreativePlan(mid,{...game,catalog:BUNDLED_CATALOG});
 assert.deepEqual(plan.editableTargets,['mid']);
 const locked=candidate('mid','Ahri',plan);
 assert.equal(locked.creativePlan?.id,plan.id);
 assert.deepEqual(locked.creativePlan.editableTargets,['mid']);
 assert.deepEqual(locked.editableTargets,[]);
 assert.throws(()=>replaceMember(mid,'mid',lastInput),/客户端锁定/);
 const changed=candidate('mid','Ahri',plan,{jungle:'JarvanIV'});
 assert.equal(changed.creativePlan,undefined);
 assert.notEqual(changed.duo?.id,'jinx-lulu');
 assert.equal(candidate('support','Lulu').duo?.id,'jinx-lulu');
});

test('community pages explore distinct positions when several larger recipes all use bottom',()=>{
 const targets=['top','jungle','mid','bottom','support'];
 const fixed=targets.map(role=>({role,champion:null}));
 const roleGroups=[
  ['top','jungle','bottom'],['top','mid','bottom'],['top','support','bottom'],
  ['top','jungle'],['jungle','mid','bottom'],['mid','support'],
 ];
 const communityRecords=roleGroups.map((roles,index)=>({
  id:String(index),roles,seed:fixed.map(slot=>roles.includes(slot.role)?{...slot,champion:slot.role+index}:slot),
 }));
 const candidates=Object.fromEntries(targets.map(role=>[role,communityRecords.flatMap(record=>record.seed.filter(slot=>slot.role===role&&slot.champion).map(slot=>({id:slot.champion})))]));
 function collect(communityAfter=''){
  const lane=createRecommendationLane({
   fixed,targets,candidates,seeds:[],weights:{},communityRecords,communityAfter,focusRole:'top',randomSeed:'review',
   evaluate:(slots,id)=>({slots,recommendationFit:{score:85},communityCombinationId:id,reviewedCombinationIds:id?[id]:[]}),format:row=>row,
  });
  const session=createRecommendationSearchSession([lane]),ids=[];
  let newPage=false;
  for(let attempt=0;attempt<300&&ids.length<communityRecords.length;attempt++){
   const page=session.advance({limit:6,newPage});
   newPage=page.complete;
   if(page.complete)for(const row of page.rows)if(row.communityCombinationId&&!ids.includes(row.communityCombinationId))ids.push(row.communityCombinationId);
  }
  return ids;
 }
 const order=collect();
 assert.deepEqual(new Set(order),new Set(communityRecords.map(record=>record.id)));
 assert.ok(order.slice(0,2).every(id=>roleGroups[id].includes('top')));
 assert.ok(order.slice(0,3).some(id=>!roleGroups[id].includes('bottom')));
 const resumed=collect(order[0]);
 assert.ok(resumed.slice(0,3).some(id=>!roleGroups[id].includes('bottom')),JSON.stringify({order,resumed}));
});

test('a recipe excluded by member weights does not alter visible role coverage',()=>{
 const targets=['top','jungle','mid','support'];
 const fixed=targets.map(role=>({role,champion:null}));
 const candidates=Object.fromEntries(targets.map(role=>[role,[{id:role+'A'},{id:role+'B'}]]));
 const record=(id,roles,top)=>({id,roles,seed:fixed.map(slot=>({
  ...slot,champion:roles.includes(slot.role)?slot.role+(slot.role==='top'?top:'A'):null,
 }))});
 const legal=[record('jg',['top','jungle'],'A'),record('mid',['top','mid'],'A')];
 const excluded=record('off',['top','jungle','support'],'B');
 function visits(communityRecords){
  const ids=new Set();
  const {community}=createRecommendationLane({
   fixed,targets,candidates,seeds:[],weights:{top:{topA:1,topB:0}},communityRecords,focusRole:'top',randomSeed:'ranked',
   evaluate:(_slots,id)=>{ids.add(id);return null;},
  });
  for(let step=0;step<300&&!community.exhausted;step++)community.work(true,true);
  return [...ids];
 }
 assert.deepEqual(visits([...legal,excluded]),visits(legal));
 assert.deepEqual(new Set(visits(legal)),new Set(['jg','mid']));
});

test('area control and ally damage routes require the actual spell conditions',()=>{
 const graph=createCompositionMechanics(new Map(game.champions.map(champion=>[champion.id,champion])),game.patch);
 const kennen={role:'top',champion:'Kennen'},viktor={role:'mid',champion:'Viktor'};
 const area=graph.match(kennen,viktor,true).tactic.evidence;
 assert.equal(area.setupSpell,'Kennen_Passive.png');
 assert.equal(area.followSpell,'ViktorW');
 assert.match(area.condition,/三层雷缚印.*1\.25 秒/);
 assert.match(area.failure,/提前离开/);
 const jhin={role:'bottom',champion:'Jhin'},card={role:'mid',champion:'TwistedFate'};
 const mark=graph.match(card,jhin,true).tactic.evidence;
 assert.equal(mark.setupSpell,'PickACard');
 assert.equal(mark.followSpell,'JhinW');
 assert.match(mark.condition,/造成伤害.*第一个敌方英雄/);
});

test('a small search prefix explores both open positions and continuation visits each completion once',()=>{
 const targets=['top','jungle'];
 const fixed=targets.map(role=>({role,champion:null}));
 const candidates={top:['a','b','c'],jungle:['d','e','f','g','h']};
 for(const role of targets)candidates[role]=candidates[role].map(id=>({id}));
 const lane=createRecommendationLane({fixed,targets,candidates,seeds:[],weights:{},evaluate:slots=>({slots})});
 assert.equal(lane.prepare(),true);
 const {stream}=lane.draw(),rows=[];
 const compare=()=>0;
 assert.equal(stream.prepare(),true);
 while(stream.advance())rows.push(stream.take(compare).slots.map(slot=>slot.champion));
 assert.equal(stream.exhausted,true);
 assert.equal(new Set(rows.slice(0,3).map(([top])=>top)).size,3);
 assert.equal(new Set(rows.slice(0,3).map(([,jungle])=>jungle)).size,3);
 assert.equal(rows.length,15);
 assert.equal(new Set(rows.map(row=>row.join('|'))).size,15);
});

test('overlapping role pools offer a legal first completion and retain every legal assignment',()=>{
 const targets=['top','jungle','mid'];
 const fixed=targets.map(role=>({role,champion:null}));
 const heroes=['a','b','c','d'].map(id=>({id}));
 const candidates=Object.fromEntries(targets.map(role=>[role,heroes]));
 const lane=createRecommendationLane({fixed,targets,candidates,seeds:[],weights:{},evaluate:slots=>({slots})});
 lane.prepare();
 const {stream}=lane.draw(),rows=[];
 stream.prepare();
 assert.equal(stream.advance(),true);
 assert.equal(stream.hasRows,true);
 do{
  const row=stream.take(()=>0);
  if(row)rows.push(row.slots.map(slot=>slot.champion).join('|'));
 }while(stream.advance());
 assert.equal(rows.length,24);
 assert.equal(new Set(rows).size,24);
});

test('the score floor rejects an incomplete lineup when its public constraints already make it ineligible',()=>{
 assert.equal(meetsRecommendationFit({score:null,compatible:false}),false);
 assert.equal(meetsRecommendationFit({score:null,compatible:true,scoreCeiling:45}),false);
 assert.equal(meetsRecommendationFit({score:null,compatible:true}),true);
 assert.equal(meetsRecommendationFit({score:60,compatible:true}),true);
});

test('only a score and matchup tie favors a verified interaction for my position',()=>{
 const row=(id,score,adjustment=0,ranked=0,recommendationFocus=0)=>({id,recommendationFit:{score},opponentFit:{adjustment,ranked:{adjustment:ranked}},recommendationFocus});
 const rows=[row('weak-fit',79,12,4,2),row('same-fit',81),row('my-interaction',81,0,0,1),row('my-plan',81,0,0,2),row('known-matchup',81,0,2),row('strong-fit',83),row('unknown-fit',null,12,4,2)];
 assert.deepEqual(orderRecommendationPage(rows).map(r=>r.id),['strong-fit','known-matchup','my-plan','my-interaction','same-fit','weak-fit','unknown-fit']);
});

function communityCompletionRows(supports,statistics){
 const roles=['top','jungle','mid','bottom','support'];
 const fixed=roles.map(role=>({role,champion:['top','support'].includes(role)?null:'Fixed'+role}));
 const record={id:'top-jungle',roles:['top','jungle'],seed:fixed.map(slot=>slot.role==='top'?{...slot,champion:'TopAnchor'}:slot)};
 const lane=createRecommendationLane({fixed,targets:['top','support'],candidates:{top:[{id:'TopAnchor'}],support:supports.map(id=>({id}))},seeds:[],weights:{},communityRecords:[record],
  evaluate:(slots,id)=>({slots,recommendationFit:{score:85,...statistics(slots.find(slot=>slot.role==='support').champion).fit},opponentFit:statistics(slots.find(slot=>slot.role==='support').champion).opponent,communityCombinationId:id,reviewedCombinationIds:[id]}),format:row=>row});
 const rows=[];
 for(let step=0;step<600&&!lane.community.exhausted;step++){
  lane.community.work(true,true);
  const {row}=lane.community.take([]);if(row)rows.push(row);
 }
 assert.equal(lane.community.exhausted,true,'The bounded fixture must finish');
 return rows.map(row=>row.slots.find(slot=>slot.role==='support').champion);
}

test('community completions use the same known-opponent tiebreak as ordinary candidates',()=>{
 const stats=id=>({opponent:{adjustment:id==='Zyra'?12:0}});
 assert.deepEqual(communityCompletionRows(['Aardvark','Zyra'],stats),['Zyra']);
 assert.deepEqual(communityCompletionRows(['Aardvark','Zyra'],id=>({opponent:{ranked:{adjustment:id==='Zyra'?4:0}}})),['Zyra']);
 assert.deepEqual(communityCompletionRows(['Aardvark','Zyra'],id=>({...stats(id),fit:{score:id==='Aardvark'?86:85}})),['Aardvark'],'Matchup cannot override a higher fit score');
});

test('a later same-fit completion with better matchup can replace an already presented recipe',()=>{
 const supports=['A','B','C','D','E','F','Zyra'];
 assert.deepEqual(communityCompletionRows(supports,id=>({opponent:{adjustment:id==='Zyra'?12:0}})),['A','Zyra']);
});

test('a scored skill relationship can involve my position even when a different team tactic wins',()=>{
 const slots=createSlots().map(slot=>({...slot,party:['jungle','mid'].includes(slot.role),...(slot.role==='jungle'?{champion:'Vi',locked:true}:{})}));
 const search=createRecommendationSearch({slots,champions:game.champions,patch:game.patch,scope:'party',soloRole:'mid',rolePools:{mid:{mode:'only',heroes:['Ahri']}}});
 let result;
 for(let i=0;i<5&&!result?.rows.length;i++)result=search.advance({limit:6});
 const [row]=result.rows;
 assert.equal(row.recommendationFit.tacticEvidence,undefined);
 assert.ok(row.recommendationFit.relationships.some(link=>link.from==='Vi'&&link.to==='Ahri'&&link.mechanicLabel));
 assert.equal(row.recommendationFocus,1);
});

test('solo recommendation retains the chosen position through the search lane',()=>{
 const slots=createSlots().map(slot=>({...slot,party:slot.role==='mid',...(slot.role==='top'?{champion:'Poppy',locked:true}:{})}));
 const search=createRecommendationSearch({slots,champions:game.champions,patch:game.patch,scope:'solo',soloRole:'mid',rolePools:{mid:{mode:'only',heroes:['Anivia']}}});
 let result;
 for(let i=0;i<5&&!result?.rows.length;i++)result=search.advance({limit:6});
 const [row]=result.rows;
 assert.equal(row.recommendationFit.tacticEvidence?.from,'Anivia');
 assert.equal(row.recommendationFocus,2);
});

test('the bundled Rift source supports unchanged verified spells and rejects changed source content',()=>{
 const byId=new Map(game.champions.map(c=>[c.id,c]));
 const vi={role:'jungle',champion:'Vi'},ahri={role:'mid',champion:'Ahri'};
 const graph=createCompositionMechanics(byId,game.patch);
 const detailed=graph.match(vi,ahri,true),scalar=graph.match(vi,ahri,false);
 assert.equal(detailed.tactic.evidence.setupSpell,'ViR');
 assert.equal(detailed.tactic.evidence.followSpell,'AhriE');
 assert.equal(detailed.tactic.evidence.patch,game.patch);
 assert.equal(detailed.relation.quality,scalar.relation.quality);
 assert.equal(detailed.tactic.tactic,scalar.tactic.tactic);
 const changed=structuredClone(byId.get('Ahri'));
 changed.mechanicSource.spells[2].tooltip+='changed';
 assert.equal(createCompositionMechanics(new Map(byId).set('Ahri',changed),game.patch).match(vi,ahri,true),null);
});

test('offline skill evidence distinguishes actual airborne and carried-zone triggers',()=>{
 const graph=createCompositionMechanics(new Map(game.champions.map(c=>[c.id,c])),game.patch);
 const match=(a,b)=>graph.match({role:'jungle',champion:a},{role:'mid',champion:b},true)?.tactic.evidence;
 assert.equal(match('JarvanIV','Yasuo').setupSpell,'JarvanIVDragonStrike');
 assert.equal(match('JarvanIV','Yasuo').followSpell,'YasuoR');
 assert.equal(match('Renekton','Yasuo'),undefined);
 assert.equal(match('Diana','Orianna').followSpell,'OrianaDetonateCommand');
});

test('open five-lane search does not spend each position pair on the same mechanic',()=>{
 const slots=createSlots().map(slot=>({...slot,party:true}));
 const graph=createCompositionMechanics(new Map(game.champions.map(c=>[c.id,c])),game.patch);
 const {seeds}=recommend({slots,champions:game.champions,patch:game.patch,scope:'party'},input=>input);
 const groups=new Map();
 for(const seed of seeds){
  const members=seed.filter(slot=>slot.champion);
  if(members.length!==2)continue;
  const match=graph.match(...members,false);if(!match)continue;
  const key=members.map(slot=>slot.role).join('|');
  if(!groups.has(key))groups.set(key,{tactic:match.tactic.label,heroes:members.map(slot=>slot.champion).sort().join('|')});
 }
 assert.equal(groups.size,10);
 const first=[...groups.values()];
 assert.ok(new Set(first.map(group=>group.tactic)).size>=4,JSON.stringify(first));
 assert.ok(new Set(first.map(group=>group.heroes)).size>=8,JSON.stringify(first));
});

test('one protected damage dealer cannot supply the whole team tactical score',()=>{
 const member=(role,p)=>({role,champion:role,c:{id:role},p:{reviewed:true,roles:[role],build:'mage',...p}});
 const shooter=member('bottom',{sustain:true}),guard=member('support',{build:'tank',frontline:true});
 const passives=[member('top',{build:'enchanter'}),member('jungle',{build:'enchanter'}),member('mid',{build:'enchanter'})];
 const duo=compositionFit({members:[shooter,guard]},null),team=compositionFit({members:[shooter,guard,...passives]},null);
 assert.ok(duo.tactic.quality>=.94);
 assert.ok(team.tactic.quality<.8,JSON.stringify(team.tactic));
});

test('cross-role mechanics require the actual second cast and enemy-targeted stun',()=>{
 const graph=createCompositionMechanics(new Map(game.champions.map(c=>[c.id,c])),game.patch);
 const match=(a,role,b)=>graph.match({role,champion:a},{role:'mid',champion:b},true).tactic.evidence;
 const arrival=match('Nocturne','jungle','Galio');
 assert.match(arrival.condition,/二段 R/);
 assert.equal(arrival.followSpell,'GalioR');
 const control=match('Renekton','top','Lissandra');
 assert.equal(control.setupSpell,'RenektonPreExecute');
 assert.match(control.failure,/自施 R/);
});

test('created terrain raises Poppy and Anivia fit without requiring an authored combination',()=>{
 const current=[{role:'top',party:true},{role:'mid',party:true}];
 const lineup=current.map(slot=>({...slot,champion:slot.role==='top'?'Poppy':'Anivia'}));
 const fit=lineupFit(lineup,current,game.champions,{patch:game.patch,scope:'party',editableRoles:['top','mid'],catalogStatus:{}});
 assert.ok(fit.score>=60);
 assert.equal(fit.tacticEvidence.setupSpell,'Crystallize');
 assert.equal(fit.tacticEvidence.followSpell,'PoppyE');
 assert.match(fit.tacticEvidence.failure,/墙体已经消失/);
});
