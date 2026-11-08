import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import {BUNDLED_CATALOG,catalogIssues} from '../src/core/catalog.mjs';
import {publicLinkOrigins,linkReviewStatuses,reviewedCatalogLinks} from '../src/core/catalog-link-review.mjs';
import {createSlots,recommend,replaceMember,createRecommendationSearch} from '../src/core/recommend.mjs';
const champions=game.champions,catalogStatus=catalogIssues(BUNDLED_CATALOG,game).status;
const preference=(hero,member)=>({member,mass:1,usage:{sampled:20,counts:{[hero]:20}}});
test('a fixed teammate combination cannot name an unrelated single-player recommendation',()=>{
 const slots=createSlots().map(s=>({...s,party:s.role==='top',...(s.role==='bottom'?{champion:'Yasuo',locked:true}:s.role==='support'?{champion:'Alistar',locked:true}:{})}));
 const rows=recommend({slots,champions,patch:game.patch,catalogStatus,scope:'context',rolePools:{top:{mode:'only',heroes:['Garen','Malphite']}},limit:2});
 assert.equal(rows.length,2);for(const row of rows){assert.deepEqual(row.targets,['top']);assert.notEqual(row.duo?.id,'wind-cow');assert(!row.title.includes('快乐击飞'));}
});
test('replacing an old candidate cannot override a client lock',()=>{
 const key=id=>champions.find(c=>c.id===id).key,slots=createSlots().map(s=>({...s,party:['bottom','support'].includes(s.role),...(s.role==='bottom'?{champion:'Ashe',locked:true,clientCellId:0}:{})}));
 const session={localPlayerCellId:0,myTeam:[{cellId:0,championId:key('Ashe'),assignedPosition:'BOTTOM',pickState:'locked'}],theirTeam:[],actions:[[{type:'pick',actorCellId:0,championId:key('Ashe'),completed:true}]]};
 assert.throws(()=>replaceMember({slots,scope:'bot',targets:['bottom'],editableTargets:['bottom']},'bottom',{slots,champions,clientSession:session}),/已在客户端锁定/);
});
test('a current-patch recommendation does not automatically attach historical counterplay',()=>{
 const rows=recommend({slots:createSlots(),champions,patch:game.patch,catalogStatus,scope:'bot',enemy:['Poppy'],rolePools:{bottom:{mode:'only',heroes:['Yasuo']},support:{mode:'only',heroes:['Alistar']}},limit:1});
 assert.equal(rows.length,1);assert.equal(rows[0].counterplay,undefined);
});
test('cached pages preserve personal and room weights without filling exhausted zero-weight choices',()=>{
 for(const partner of ['Lulu','Lux']){
  const engine=createRecommendationSearch({slots:createSlots(),champions,patch:game.patch,catalogStatus,scope:'bot',rolePools:{bottom:{mode:'only',heroes:['Ashe','Jinx']},support:{mode:'only',heroes:['Lulu','Lux']}},familiarityByRole:{bottom:preference('Ashe','self')},roomFamiliarity:[preference(partner,'friend')],minimumFitScore:60});
  const first=engine.advance({limit:6});assert.equal(first.complete,true);assert.equal(first.rows.length,1);
  assert.equal(first.rows[0].slots.find(s=>s.role==='bottom').champion,'Ashe');assert.equal(first.rows[0].slots.find(s=>s.role==='support').champion,partner);
  assert.deepEqual(engine.advance({limit:6}).rows,[]);
 }
});

test('member replacement uses the same visible fit and minimum score as ordinary recommendation',()=>{
 const picks={top:'Akali',jungle:'Shaco',mid:'Zed',bottom:'Jhin',support:'Lulu'},slots=createSlots().map(s=>({...s,party:s.role==='support',champion:picks[s.role]}));
 const result={slots,scope:'context',targets:['support']},input={slots,champions,patch:game.patch,catalogStatus,scope:'context',rolePools:{support:{mode:'only',heroes:['Brand','Velkoz','Xerath','Senna','Shaco','Zyra','Lux']}},minimumFitScore:60};
 const unrestricted=replaceMember(result,'support',{...input,minimumFitScore:0});assert(unrestricted.length>0);assert(unrestricted.every(r=>r.recommendationFit&&r.recommendationFit.score<60));
 assert.deepEqual(replaceMember(result,'support',input),[]);
 const valid=createSlots().map(s=>({...s,party:['bottom','support'].includes(s.role),champion:s.role==='bottom'?'Ashe':s.role==='support'?'Lux':null}));
 const rows=replaceMember({slots:valid,scope:'bot',targets:['support']},'support',{slots:valid,champions,patch:game.patch,scope:'bot',minimumFitScore:60,rolePools:{support:{mode:'only',heroes:['Lulu','Braum']}}});
 assert(rows.length>0);for(const row of rows){assert(row.recommendationFit.score>=60);assert.equal(row.slots.find(s=>s.role==='bottom').champion,'Ashe');}
});

test('withdrawn real catalog link evidence cannot return through reasons, contributions or solo recursion',()=>{
 const link=BUNDLED_CATALOG.links.find(row=>row[0]==='Alistar'&&row[1]==='Yasuo'||row[0]==='Yasuo'&&row[1]==='Alistar');assert(link);
 const context=data=>({baseKind:'bundled',...publicLinkOrigins(BUNDLED_CATALOG),status:linkReviewStatuses(BUNDLED_CATALOG,{...data,allowHistoricalLinks:true})});
 const beforeContext=context(game);assert(reviewedCatalogLinks(BUNDLED_CATALOG,{...beforeContext,patch:game.patch}).some(row=>row[2]===link[2]));
 const changed=structuredClone(game),alistar=changed.champions.find(c=>c.id==='Alistar');assert(Number.isFinite(alistar.mechanics.spells[0].cooldown[0]));alistar.mechanics.spells[0].cooldown[0]+=1;
 const afterContext=context(changed),afterStatus=catalogIssues(BUNDLED_CATALOG,changed).status;assert.equal(afterContext.status['Alistar:Yasuo'].stale,true);assert.equal(afterStatus['wind-cow'].stale,true);assert(!reviewedCatalogLinks(BUNDLED_CATALOG,{...afterContext,patch:changed.patch}).some(row=>row[2]===link[2]));
 for(const [scope,fixedSupport]of [['bot',false],['bot',true],['solo',true]]){
  const slots=createSlots().map(slot=>slot.role==='support'&&fixedSupport?{...slot,champion:'Alistar',locked:true}:slot);
  const row=(data,linkReviewContext,status)=>createRecommendationSearch({slots,champions:data.champions,patch:data.patch,catalogStatus:status,linkReviewContext,scope,soloRole:scope==='solo'?'bottom':'',rolePools:{bottom:{mode:'only',heroes:['Yasuo']},support:{mode:'only',heroes:['Alistar']}},minimumFitScore:60}).advance({limit:1}).rows[0];
  const before=row(game,beforeContext,catalogStatus);assert(before);assert(before.connections.some(value=>value[2]===link[2]));if(fixedSupport)assert(before.contributions.some(member=>member.pairings.includes(link[2])));
  const after=row(changed,afterContext,afterStatus);assert(after);assert.notEqual(after.duo?.id,'wind-cow');assert.deepEqual(after.connections,[]);assert(after.contributions.every(member=>!member.pairings.includes(link[2])));
  assert.equal([after.reason,...after.reasonPoints,...after.contributions.flatMap(member=>member.pairings)].join(' ').includes(link[2]),false);
 }
});
