// Historical 16.20 rule/continuity contract; current 4.0 data is tested independently.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createSlots,recommend,replaceMember,createRecommendationSearch,createRecommendationResources} from '../src/core/recommend.mjs';
import {configureCatalog,BUNDLED_CATALOG} from '../src/core/catalog.mjs';
import {lineupFit} from '../src/core/room-ballot.mjs';
import {orderRecommendationPage,recommendationStyleTier,meetsRecommendationFit} from '../src/core/recommendation-policy.mjs';
import {clientRecommendationDraft,recommendationDraft} from '../src/core/draft-intents.mjs';
import {recommendationKey} from '../src/core/preparation.mjs';
import {recommendationConditionsKey,splitRecommendationInput} from '../src/core/recommendation-input.mjs';
import {renderResultCard} from '../src/draft-result-view.mjs';
import {companionView} from '../src/companion-view.mjs';
import {defaultState} from '../services/storage.mjs';
import {familiarityWinner} from '../src/core/recommendation-familiarity.mjs';

const data=JSON.parse(await fs.readFile(new URL('./fixtures/snapshot-16.20/game.json',import.meta.url),'utf8'));
const {champions,patch}=data,key=id=>champions.find(c=>c.id===id).key;
const workerSource=(await fs.readFile(new URL('../src/recommend-worker.mjs',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
function workerPages(input,{order=orderRecommendationPage}={}){
 let response,requestId=0;
 let state=Array.from(input.randomSeed||'fixture').reduce((seed,char)=>Math.imul(seed,31)+char.charCodeAt(0)|0,1);
 const crypto={randomUUID:()=> 'test-draft',getRandomValues(bytes){
  for(let i=0;i<bytes.length;i++){state^=state<<13;state^=state>>>17;state^=state<<5;bytes[i]=state>>>24;}return bytes;
 }};
 const context=vm.createContext({self:{postMessage:value=>response=value},crypto,replaceMember,configureCatalog,BUNDLED_CATALOG,orderRecommendationPage:order,createRecommendationSearch,createRecommendationResources,recommendationConditionsKey});
 vm.runInContext(workerSource,context);
 const {factory,conditions}=splitRecommendationInput(input);
 const send=data=>{
  const native=Object.getOwnPropertyDescriptor(globalThis,'crypto');
  Object.defineProperty(globalThis,'crypto',{value:crypto,configurable:true});
  try{context.self.onmessage({data:{requestId:++requestId,...data}});}
  finally{Object.defineProperty(globalThis,'crypto',native);}
  assert.equal(response.error,undefined);
  const page=response;
  if(page.search)context.self.onmessage({data:{commit:{handle:page.search.handle,step:page.search.step}}});
  return page;
 };
 let page;
 return ()=>{
  page=page?.search?send({resume:{handle:page.search.handle,step:page.search.step,newPage:true}}):send({factory,factoryToken:1,initialize:true,input:conditions});
  for(let i=0;i<400&&page.search&&!page.search.complete&&!page.search.capacity;i++)page=send({resume:{handle:page.search.handle,step:page.search.step,newPage:false}});
  assert.ok(!page.search||page.search.complete,'Worker did not finish the bounded fixture page');
  return page.results;
 };
}
const worker=input=>workerPages(input)();
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

test('member replacement applies the same displayed-fit floor and public projection as a new search',()=>{
 const slots=createSlots().map(s=>({...s,party:['top','jungle','mid'].includes(s.role),...(['top','jungle'].includes(s.role)?{champion:s.role==='top'?'Kayle':'Kindred',locked:true,manualPosition:true}:{})}));
 const input={slots,fitSlots:slots,champions,patch,scope:'party',minimumFitScore:60,rolePools:{mid:{mode:'only',heroes:['Vladimir','Viktor']}}};
 const [current]=recommend({...input,rolePools:{mid:{mode:'only',heroes:['Vladimir']}}}),before=structuredClone(current);
 const [raw]=recommend({...input,excluded:['Vladimir']});
 const fit=lineupFit(raw.slots,slots,champions,{scope:'party',editableRoles:raw.targets,patch});assert.equal(fit.score,54);
 assert.deepEqual(replaceMember(current,'mid',input),[],'The 54-point alternative cannot bypass the 60-point replacement floor');
 const [allowed]=replaceMember(current,'mid',{...input,minimumFitScore:54});assert.ok(allowed);assert.equal(allowed.recommendationFit.score,54);
 for(const role of ['top','jungle'])assert.deepEqual(allowed.slots.find(s=>s.role===role),current.slots.find(s=>s.role===role));
 assert.deepEqual(current,before);
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
 for(const style of ['balanced','fun','wild']){const rows=worker({...input,style});assert.ok(rows.length);sets.push(rows.map(r=>r.id).join(','));for(const row of rows){assert.ok(row.recommendationFit.score>=60);assert.equal(row.recommendationFit.score,lineupFit(row.slots,input.slots,champions,{scope:'party',editableRoles:row.targets,patch}).score);}assert.ok(rows.every(row=>row.slots.filter(slot=>row.targets.includes(slot.role)).every(slot=>input.rolePools[slot.role].heroes.includes(slot.champion))));}
 assert.equal(new Set(sets).size,3,'All styles must make an observable selection difference on the same hero pools');
});

test('sorting a page preserves the worker stream and successive pages have no duplicates',()=>{
 const input={slots:createSlots().map(s=>({...s,party:['bottom','support'].includes(s.role)})),champions,patch,scope:'party',style:'fun',randomSeed:'pages',limit:6,rolePools:{bottom:{mode:'only',heroes:['Ashe','Jinx','Lucian','Kalista']},support:{mode:'only',heroes:['Braum','Nami','Alistar','Malphite']}}};
 const sorted=workerPages(input),unsorted=workerPages(input,{order:rows=>rows});
 const ids=rows=>rows.map(row=>row.id);
 const left=ids(sorted()),right=ids(sorted());
 assert.ok(left.length&&right.length);
 assert.deepEqual(new Set(left),new Set(ids(unsorted())));
 assert.deepEqual(new Set(right),new Set(ids(unsorted())));
 assert.equal(new Set([...left,...right]).size,left.length+right.length);
});

test('teammate variant multiplicity cannot change the bound member hero probability',()=>{
 const entries=['Ashe','Jinx'].flatMap(champion=>['Braum','Malphite'].map(support=>({slots:[{role:'bottom',champion},{role:'support',champion:support}],score:80}))),weights={bottom:{Ashe:.85,Jinx:.15}};
 let familiar=0;
 for(let i=0;i<300;i++){
  const plain=familiarityWinner(entries,['bottom','support'],weights,'style-mass',i,{bestVariant:true});
  const expanded=[...entries,...entries.filter(row=>row.slots[0].champion==='Jinx').flatMap(row=>Array(12).fill(row))];const withVariants=familiarityWinner(expanded,['bottom','support'],weights,'style-mass',i,{bestVariant:true});assert.equal(withVariants.slots[0].champion,plain.slots[0].champion);assert.equal(withVariants.score,80);
  if(plain.slots[0].champion==='Ashe')familiar++;
 }
 assert.ok(familiar>=235&&familiar<=275,String(familiar));
});

test('actual worker keeps a fixed familiar population across successive cursor pages',()=>{
 const slots=createSlots().map(s=>({...s,party:['bottom','support'].includes(s.role),...(s.role==='support'?{champion:'Nami',locked:true}:{})})),base={slots,champions,patch,scope:'bot',style:'wild',limit:6,rolePools:{bottom:{mode:'only',heroes:['Ashe','Jinx','Vayne','Jhin','Ezreal','MissFortune','Lucian','KogMaw']}}};
 let unfamiliar=0;
 // A weighted unique page samples without replacement: probability belongs
 // to its first draw, not to the count of distinct heroes after exhaustion.
 for(let seed=0;seed<96;seed++){
  const input={...base,randomSeed:'fixed-mass:'+seed,familiarityByRole:{bottom:{member:'own',mass:.85,usage:{sampled:100,counts:{Ashe:100}}}}},pages=workerPages(input,{order:rows=>rows}),rows=pages();
  assert.ok(rows.length);unfamiliar+=Number(rows[0].slots.find(s=>s.role==='bottom').champion!=='Ashe');
  const strict=worker({...input,familiarityByRole:{bottom:{member:'own',mass:1,usage:{sampled:100,counts:{Ashe:100}}}}});assert.equal(strict.length,1);assert.equal(strict[0].slots.find(s=>s.role==='bottom').champion,'Ashe');
  const next=pages();
  assert.equal(new Set([...rows,...next].map(r=>r.id)).size,rows.length+next.length);
 }
 assert.ok(unfamiliar>=5&&unfamiliar<=30,`The first weighted draw should retain 85% familiarity across independent seeds: ${unfamiliar}/96`);
});

test('production styles preserve explicit tempo and each bound member hero preference',()=>{
 const slots=createSlots().map(s=>({...s,party:['bottom','support'].includes(s.role),...(s.role==='support'?{champion:'Nami',locked:true}:{})})),base={slots,champions,patch,scope:'bot',randomSeed:'tempo',limit:24,play:{tempo:'growth'},rolePools:{bottom:{mode:'only',heroes:['Ashe','Jinx','Vayne','Jhin','Ezreal','MissFortune','Lucian','KogMaw']}}};
 for(const style of ['balanced','fun','wild'])assert.deepEqual(worker({...base,style,familiarityByRole:{bottom:{member:'own',mass:1,usage:{sampled:10,counts:{Ashe:10}}}}}),[]);
 const familiar={mid:'Annie',bottom:'Ashe',support:'Braum'},familiarityByRole=Object.fromEntries(Object.entries(familiar).map(([role,id])=>[role,{member:role,mass:1,usage:{sampled:100,counts:{[id]:100}}}]));
 for(const style of ['balanced','fun','wild']){const rows=worker({slots:createSlots(),champions,patch,scope:'party',style,limit:6,randomSeed:'all-members',familiarityByRole});assert.equal(rows.length,1);for(const [role,id]of Object.entries(familiar))assert.equal(rows[0].slots.find(s=>s.role===role).champion,id,'Style cannot replace a member who explicitly chose 100% familiar heroes');}
});
