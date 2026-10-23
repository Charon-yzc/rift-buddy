// Historical 16.20 rule/continuity contract; current 4.0 data is tested independently.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createSlots,recommend,replaceMember} from '../src/core/recommend.mjs';
import {configureCatalog,BUNDLED_CATALOG} from '../src/core/catalog.mjs';
import {lineupFit} from '../src/core/room-ballot.mjs';
import {orderRecommendationPage,recommendationStyleTier,meetsRecommendationFit} from '../src/core/recommendation-policy.mjs';
import {clientRecommendationDraft,recommendationDraft} from '../src/core/draft-intents.mjs';
import {recommendationKey} from '../src/core/preparation.mjs';
import {renderResultCard} from '../src/draft-result-view.mjs';
import {companionView} from '../src/companion-view.mjs';
import {defaultState} from '../services/storage.mjs';
import {familiarityWinner} from '../src/core/recommendation-familiarity.mjs';

const data=JSON.parse(await fs.readFile(new URL('./fixtures/snapshot-16.20/game.json',import.meta.url),'utf8'));
const {champions,patch}=data,key=id=>champions.find(c=>c.id===id).key;
const workerSource=(await fs.readFile(new URL('../src/recommend-worker.mjs',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
function worker(input){let response;const context=vm.createContext({self:{postMessage:value=>response=value},recommend,replaceMember,configureCatalog,BUNDLED_CATALOG,orderRecommendationPage});vm.runInContext(workerSource,context);context.self.onmessage({data:{requestId:1,input,initialize:true}});assert.equal(response.error,undefined);return response.results;}
const scores=html=>[...html.matchAll(/class="lineup-fit-number"[^>]*>契合 (\d+)/g)].map(m=>Number(m[1]));
const rawRoster=(ids,local=4)=>({localPlayerCellId:local,myTeam:ids.map((id,cellId)=>({cellId,assignedPosition:['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'][cellId],championId:id?key(id):0})),actions:[],bans:[]});
const visibleRoster=(ids,controlled=['support'])=>createSlots().map((s,i)=>({...s,champion:ids[i],party:controlled.includes(s.role),clientCellId:i}));

test('actual worker filters the displayed score and both surfaces show the same current-patch full-team fit',()=>{
 const ids=['Garen','Amumu','TwistedFate','Ashe',null],fitSession=rawRoster(ids),fitSlots=visibleRoster(ids),confirmed=clientRecommendationDraft(fitSlots,fitSession,champions,{ownRole:'support'});
 const input={...confirmed,clientSession:confirmed.session,slots:confirmed.slots,champions,patch,scope:'context',soloRole:'support',fitSlots,fitSession,limit:6,rolePools:{support:{mode:'only',heroes:['Braum','Nami','Pyke','Leona','Zyra','Yuumi']}},randomSeed:'display-fit'};
 const rows=worker(input);assert.ok(rows.length>1);assert.deepEqual(rows.map(r=>r.recommendationFit.score),rows.map(r=>r.recommendationFit.score).sort((a,b)=>b-a));
 const saved=defaultState();saved.draft={slots:fitSlots,scope:'context'};const client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:fitSession};
 for(const row of rows){
  const fit=lineupFit(row.slots,fitSlots,champions,{scope:row.scope,soloRole:'support',clientSession:fitSession,editableRoles:row.targets,patch});
  assert.equal(fit.referenceCount,4);assert.equal(row.recommendationFit.score,fit.score);assert.ok(fit.score>=60);
  assert.deepEqual(scores(renderResultCard(row,0,data,saved,'fun',null,confirmed.slots,fitSession,'','support',null,undefined,{displayScope:'context',visibleRoster:fitSlots})),[fit.score]);
  const sidebar=companionView({data,client,slots:fitSlots,unassigned:[],scope:'context',soloRole:'support',style:'fun',tab:'recommend',results:[row],preferences:saved.preferences});assert.deepEqual(scores(sidebar),[fit.score]);
 }
});

test('solo filtering uses the final solo role even when an old party contains other lanes',()=>{
 for(const role of ['top','support']){
  const ids=role==='top'?[null,'Amumu','Ahri','Ashe','Nami']:['Garen','Amumu','Ahri','Ashe',null],local=role==='top'?0:4,fitSession=rawRoster(ids,local);fitSession.myTeam.forEach(p=>{if(p.championId)p.pickState='locked';});
  const fitSlots=visibleRoster(ids,['mid','bottom','support']),confirmed=clientRecommendationDraft(fitSlots,fitSession,champions,{ownRole:role});
  const rows=worker({slots:confirmed.slots,champions,patch,clientSession:confirmed.session,scope:'solo',soloRole:role,fitSlots,fitSession,limit:4});assert.ok(rows.length);
  for(const row of rows){const fit=lineupFit(row.slots,fitSlots,champions,{scope:'solo',soloRole:role,clientSession:fitSession,editableRoles:row.targets,patch});assert.equal(row.recommendationFit.score,fit.score);assert.equal(fit.known,5);assert.ok(fit.score>=60);}
 }
});

test('60 is inclusive; conflicts cannot leak through and fixed current lineups are preserved',()=>{
 assert.equal(meetsRecommendationFit({score:59}),false);assert.equal(meetsRecommendationFit({score:60}),true);assert.equal(meetsRecommendationFit({score:null}),true);
 const slots=createSlots().map(s=>({...s,party:['bottom','support'].includes(s.role)})),fitSlots=slots.map(s=>s.role==='bottom'?{...s,champion:'Jinx',locked:true,manualPosition:true}:s);
 const input={slots,champions,patch,scope:'party',fitSlots,rolePools:{bottom:{mode:'only',heroes:['Ashe']},support:{mode:'only',heroes:['Lulu']}},familiarityByRole:{bottom:{member:'own',mass:1,usage:{sampled:100,counts:{Ashe:100}}}}};
 const unrestricted=recommend(input);assert.equal(unrestricted.length,1);assert.equal(lineupFit(unrestricted[0].slots,fitSlots,champions,{scope:'party',patch}).score,20);assert.deepEqual(worker(input),[],'Do not substitute an unfamiliar hero when the 100% familiar option fails fit');
 const current=fitSlots.map(s=>({...s,champion:s.role==='support'?'Lulu':s.champion,locked:true}));assert.equal(worker({...input,slots:current,fitSlots:current}).length,1,'A current locked lineup is not a new recommendation to delete');
});

test('low-fit retained pairs are filtered as new suggestions but chosen growth lineups remain readable',()=>{
 const slots=createSlots().map(s=>({...s,party:['top','jungle','mid'].includes(s.role),...(['top','jungle'].includes(s.role)?{champion:s.role==='top'?'Kayle':'Kindred',locked:true,manualPosition:true}:{})}));
 const input={slots,champions,patch,scope:'party',style:'fun',rolePools:{mid:{mode:'only',heroes:['Vladimir']}}};
 const [legacy]=recommend(input);assert.equal(legacy.adaptive.edges[0].id,'pair:Kayle:Kindred');assert.match(legacy.adaptive.sourceNote,/未确认额外三人协同/);
 assert.ok(lineupFit(legacy.slots,slots,champions,{scope:'party',editableRoles:legacy.targets,patch}).score<60);assert.deepEqual(worker(input),[]);
 const growth=createSlots().map(s=>({...s,party:['top','jungle','mid'].includes(s.role),...({top:'Kayle',jungle:'Karthus',mid:'Vladimir'}[s.role]?{champion:{top:'Kayle',jungle:'Karthus',mid:'Vladimir'}[s.role],locked:true,manualPosition:true}:{})}));
 const [chosen]=worker({...input,slots:growth});assert.ok(chosen);assert.deepEqual(chosen.targets,[]);assert.equal(chosen.adaptive.kind,'shared');assert.equal(chosen.adaptive.tempo,'growth');
});

test('fit evidence changes cache identity while ignored hovers and timer refreshes do not',()=>{
 const ids=['Garen','Amumu','Ahri','Ashe',null],fitSlots=visibleRoster(ids),fitSession=rawRoster(ids),confirmed=clientRecommendationDraft(fitSlots,fitSession,champions,{ownRole:'support'}),base={slots:confirmed.slots,clientSession:confirmed.session,champions,scope:'context',soloRole:'support',fitSlots,fitSession},before=recommendationKey(base);
 for(const id of ['Veigar',null]){const next=structuredClone(base);next.fitSession.myTeam[2].championId=id?key(id):0;next.fitSlots[2].champion=id;assert.notEqual(recommendationKey(next),before);}
 const refreshed=structuredClone(base);refreshed.fitSession.timer={adjustedTimeLeftInPhase:1};refreshed.fitSession.myTeam[4].championPickIntent=key('Nami');assert.equal(recommendationKey(refreshed),before);
 const unfinished=structuredClone(base);unfinished.fitSession.actions=[[{type:'pick',actorCellId:2,championId:key('Ahri'),completed:false}]];assert.notEqual(recommendationKey(unfinished),before);
 unfinished.fitSession.myTeam[2].championId=key('Veigar');unfinished.fitSlots[2].champion='Veigar';const ignored=recommendationKey(unfinished);unfinished.fitSession.myTeam[2].championId=key('Lux');unfinished.fitSlots[2].champion='Lux';assert.equal(recommendationKey(unfinished),ignored);
});

test('style selects different actual trio candidates, without adding points to their fit',()=>{
 const input={slots:createSlots(),champions,patch,scope:'party',minimumFitScore:60,stylePolicy:true,limit:3,randomSeed:'style-proof',rolePools:{mid:{mode:'only',heroes:['Annie','Ahri','Orianna','Yasuo']},bottom:{mode:'only',heroes:['Ashe','Lucian','Kalista','Yasuo']},support:{mode:'only',heroes:['Braum','Nami','Alistar','Malphite']}}},sets=[];
 for(const style of ['balanced','fun','wild']){const rows=orderRecommendationPage(recommend({...input,style}));assert.ok(rows.length);sets.push(rows.map(r=>r.id).join(','));for(const row of rows){assert.ok(row.recommendationFit.score>=60);assert.equal(row.recommendationFit.score,lineupFit(row.slots,input.slots,champions,{scope:'party',editableRoles:row.targets,patch}).score);}if(style==='balanced')assert.ok(rows.every(row=>recommendationStyleTier(row,style)===2));if(style==='wild')assert.ok(rows.every(row=>recommendationStyleTier(row,style)===2));}
 assert.equal(new Set(sets).size,3,'All styles must make an observable selection difference on the same hero pools');
});

test('sorting a page never changes the sampled stream or returns duplicate offset candidates',()=>{
 const input={slots:createSlots().map(s=>({...s,party:['bottom','support'].includes(s.role)})),champions,patch,scope:'party',style:'fun',minimumFitScore:60,stylePolicy:true,randomSeed:'pages',rolePools:{bottom:{mode:'only',heroes:['Ashe','Jinx','Lucian','Kalista']},support:{mode:'only',heroes:['Braum','Nami','Alistar','Malphite']}}};
 const all=recommend({...input,limit:12}),left=worker({...input,limit:6}),right=worker({...input,limit:6,offset:6});assert.deepEqual(new Set([...left,...right].map(r=>r.id)),new Set(all.map(r=>r.id)));assert.equal(new Set([...left,...right].map(r=>r.id)).size,left.length+right.length);
});

test('style picks teammate variants after the familiar draw without changing the member hero probabilities',()=>{
 const entries=['Ashe','Jinx'].flatMap(champion=>['Braum','Malphite'].map(support=>({slots:[{role:'bottom',champion},{role:'support',champion:support}],score:80}))),weights={bottom:{Ashe:.85,Jinx:.15}};
 let familiar=0;
 for(let i=0;i<300;i++){
  const plain=familiarityWinner(entries,['bottom','support'],weights,'style-mass',i,{bestVariant:true});
  for(const preferred of ['Braum','Malphite']){const styled=familiarityWinner(entries,['bottom','support'],weights,'style-mass',i,{bestVariant:true,variantPriority:row=>Number(row.slots[1].champion===preferred)});assert.equal(styled.slots[0].champion,plain.slots[0].champion);assert.equal(styled.slots[1].champion,preferred);}
  if(plain.slots[0].champion==='Ashe')familiar++;
 }
 assert.ok(familiar>=235&&familiar<=275,String(familiar));
});

test('actual worker keeps a fixed familiar population across all six draws and offset pages',()=>{
 const slots=createSlots().map(s=>({...s,party:['bottom','support'].includes(s.role),...(s.role==='support'?{champion:'Nami',locked:true}:{})})),base={slots,champions,patch,scope:'bot',style:'wild',limit:6,rolePools:{bottom:{mode:'only',heroes:['Ashe','Jinx','Vayne','Jhin','Ezreal','MissFortune','Lucian','KogMaw']}}};
 let unfamiliar=0;
 for(let seed=0;seed<24;seed++){
  const input={...base,randomSeed:'fixed-mass:'+seed,familiarityByRole:{bottom:{member:'own',mass:.85,usage:{sampled:100,counts:{Ashe:100}}}}},rows=worker(input);
  unfamiliar+=rows.filter(row=>row.slots.find(s=>s.role==='bottom').champion!=='Ashe').length;
  const strict=worker({...input,familiarityByRole:{bottom:{member:'own',mass:1,usage:{sampled:100,counts:{Ashe:100}}}}});assert.equal(strict.length,1);assert.equal(strict[0].slots.find(s=>s.role==='bottom').champion,'Ashe');
  assert.deepEqual(new Set([...worker({...input,limit:3}),...worker({...input,limit:3,offset:3})].map(r=>r.id)),new Set(rows.map(r=>r.id)));
 }
 assert.ok(unfamiliar<35,`Repeated familiar draws must be skipped, never donated to strangers: ${unfamiliar}`);
});

test('production styles preserve explicit tempo and each bound member hero preference',()=>{
 const slots=createSlots().map(s=>({...s,party:['bottom','support'].includes(s.role),...(s.role==='support'?{champion:'Nami',locked:true}:{})})),base={slots,champions,patch,scope:'bot',randomSeed:'tempo',limit:30,play:{tempo:'growth'},rolePools:{bottom:{mode:'only',heroes:['Ashe','Jinx','Vayne','Jhin','Ezreal','MissFortune','Lucian','KogMaw']}}};
 for(const style of ['balanced','fun','wild'])assert.deepEqual(worker({...base,style,familiarityByRole:{bottom:{member:'own',mass:1,usage:{sampled:10,counts:{Ashe:10}}}}}),[]);
 const familiar={mid:'Annie',bottom:'Ashe',support:'Braum'},familiarityByRole=Object.fromEntries(Object.entries(familiar).map(([role,id])=>[role,{member:role,mass:1,usage:{sampled:100,counts:{[id]:100}}}]));
 for(const style of ['balanced','fun','wild']){const rows=worker({slots:createSlots(),champions,patch,scope:'party',style,limit:6,randomSeed:'all-members',familiarityByRole});assert.equal(rows.length,1);for(const [role,id]of Object.entries(familiar))assert.equal(rows[0].slots.find(s=>s.role===role).champion,id,'Style cannot replace a member who explicitly chose 100% familiar heroes');}
});
