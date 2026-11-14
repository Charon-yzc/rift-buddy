import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import {BUNDLED_CATALOG,catalogIssues,configureCatalog} from '../src/core/catalog.mjs';
import {createSlots,recommend,createRecommendationSearch} from '../src/core/recommend.mjs';
import {communityFitException,communityLineups} from '../src/core/recommendation-community.mjs';
import {orderRecommendationPage} from '../src/core/recommendation-policy.mjs';
import {lineupFit} from '../src/core/room-ballot.mjs';
import {createCooperationGraph} from '../src/core/cooperation.mjs';
import {compositionFit} from '../src/core/composition-fit.mjs';
import {profile} from '../src/core/rules.mjs';

const champions=game.champions,patch=game.patch,catalogStatus=catalogIssues(BUNDLED_CATALOG,game).status;
const base={champions,patch,catalogStatus,scope:'party',randomSeed:'honest-community',minimumFitScore:0};
const board=roles=>createSlots().map(s=>({...s,party:roles.includes(s.role)}));
function collect(input){
 const engine=createRecommendationSearch(input),rows=[];
 for(let i=0;i<100;i++){const page=engine.advance({limit:6});rows.push(...page.rows);if(page.exhausted)return rows;}
 assert.fail('Bounded offline search must exhaust');
}
const identity=rows=>rows.filter(row=>row.recommendationSource==='algorithm').map(row=>[row.id,row.score,row.compositionFit.rawScore,row.recommendationFit.rawScore,row.recommendationFit.score]);

test('community display has its own bounded queue and leaves every ordinary identity, score and preference draw intact',()=>{
 const input={...base,slots:board(['mid','bottom','support'])};
 const without=collect({...input,includeCommunityRecommendations:false}),withCommunity=collect(input);
 assert.deepEqual(identity(withCommunity),identity(without));
 assert.ok(withCommunity.some(row=>row.recommendationSource==='community'));
 assert.ok(withCommunity.filter(row=>row.recommendationSource==='community').length<=48);
 assert.equal(new Set(withCommunity.map(row=>row.id)).size,withCommunity.length);
 const preference={member:'self',mass:1,usage:{sampled:20,counts:{Ahri:20}}};
 const familiar={...input,familiarityByRole:{mid:preference}};
 assert.deepEqual(identity(collect(familiar)),identity(collect({...familiar,includeCommunityRecommendations:false})));
 assert.ok(collect(familiar).every(row=>row.slots.find(s=>s.role==='mid').champion==='Ahri'));
 assert.deepEqual(identity(createRecommendationSearch(familiar).advance({limit:6}).rows),identity(createRecommendationSearch({...familiar,includeCommunityRecommendations:false}).advance({limit:6}).rows));
 const empty={member:'empty',mass:.85,usage:{sampled:0,counts:{}}};
 const first=options=>createRecommendationSearch({...input,...options}).advance({limit:6}).rows.map(row=>[row.id,row.recommendationSource]);
 assert.deepEqual(first({familiarityByRole:{mid:empty},roomFamiliarity:[empty]}),first({}),'Empty progress summaries cannot hide community opportunities or change an ordinary page');
});

test('adding a default-loadout catalogue identity never adds raw mechanism or algorithm points',()=>{
 const id='vi-ahri-jungle-mid-confirmed-catch',entry=BUNDLED_CATALOG.duos.find(c=>c.id===id);assert.ok(entry);
 const input={...base,slots:board(['jungle','mid']),rolePools:{jungle:{mode:'only',heroes:['Vi']},mid:{mode:'only',heroes:['Ahri']}},limit:1};
 try{
  const [listed]=recommend(input);
  configureCatalog({...BUNDLED_CATALOG,duos:BUNDLED_CATALOG.duos.filter(c=>c.id!==id)});
  const [unlisted]=recommend(input);
  assert.equal(listed.score,unlisted.score);assert.deepEqual(listed.compositionFit,unlisted.compositionFit);
 }finally{configureCatalog(BUNDLED_CATALOG);}
});

test('an executable real community combination below 60 retains its score and can precede higher-fit ordinary choices',()=>{
 const picks={top:'Akali',jungle:'Shaco',mid:'Zed',bottom:'Jhin'};
 const slots=board(['support']).map(s=>picks[s.role]?{...s,champion:picks[s.role],locked:true}:s);
 const input={...base,scope:'context',slots,minimumFitScore:60,rolePools:{support:{mode:'only',heroes:['Lux']}}};
 const [row]=collect(input);assert.ok(row);assert.equal(row.communityRecommendation.id,'jhin-lux');
 assert.ok(row.recommendationFit.score<60);assert.ok(communityFitException(row,row.recommendationFit));
 assert.equal(row.recommendationFit.score,lineupFit(row.slots,slots,champions,{scope:'context',patch,catalogStatus}).score);
 assert.deepEqual(collect({...input,includeCommunityRecommendations:false}),[]);
 const ordinary=n=>({id:'ordinary-'+n,slots:[],recommendationFit:{score:n,exact:true,compatible:true}});
 const page=orderRecommendationPage([ordinary(90),row,ordinary(80),ordinary(85)]);
 assert.equal(page[0].id,row.id);assert.deepEqual(page.slice(1).map(r=>r.recommendationFit.score),[90,85,80]);
 assert.equal(communityFitException(row,{...row.recommendationFit,compatible:false}),false);
 assert.equal(communityFitException(row,{...row.recommendationFit,exact:false}),false);
 assert.equal(communityFitException({...row,slots:row.slots.map(s=>s.role==='bottom'?{...s,champion:'Ashe'}:s)},row.recommendationFit),false);
 assert.equal(communityFitException({...row,communityCombinationId:'invented',communityRecommendation:{...row.communityRecommendation,id:'invented'}},row.recommendationFit),false,'A generated name and matching-looking members do not certify a real catalogue source');
 assert.equal(communityFitException({...row,communityRecommendation:{...row.communityRecommendation,members:[{role:'top',champion:'Akali'},{role:'mid',champion:'Zed'}]}},row.recommendationFit),false);
});

test('page reservations leave ordinary choices room and preserve their order across every page',()=>{
 const input={...base,slots:board(['mid','bottom','support'])},engine=createRecommendationSearch(input),ordinary=[];
 for(let i=0;i<8;i++){
  const page=engine.advance({limit:6});
  assert.ok(page.rows.filter(row=>row.recommendationSource==='community').length<=3);
  assert.ok(page.rows.filter(row=>row.recommendationSource==='algorithm').length>=3);
  ordinary.push(...identity(page.rows));
 }
 assert.deepEqual(ordinary,identity(collect({...input,includeCommunityRecommendations:false})).slice(0,ordinary.length));
});

test('familiar players receive at most one supported community reservation without changing the ordinary population',()=>{
 const counts={Ahri:20},familiarityByRole={mid:{member:'self',mass:.85,usage:{sampled:20,counts}}};
 const input={...base,slots:board(['mid','bottom','support']),familiarityByRole,rolePools:{bottom:{mode:'only',heroes:['Ashe','Jinx','Jhin']},support:{mode:'only',heroes:['Lulu','Nami','Lux','Nautilus']}}};
 const engine=createRecommendationSearch(input);
 let reserved=0;
 for(let i=0;i<4;i++){
  const page=engine.advance({limit:6}),added=page.rows.filter(r=>r.recommendationSource==='community');
  assert.ok(added.length<=1);
  for(const row of added){assert.equal(row.communityRecommendation.priority,'familiar');assert.equal(row.slots.find(s=>s.role==='mid').champion,'Ahri');}
  const ordered=orderRecommendationPage(page.rows);
  if(page.rows.some(r=>r.communityRecommendation?.priority==='familiar')){assert.equal(ordered[0].communityRecommendation?.priority,'familiar');reserved++;}
 }
 assert.ok(reserved>0,'A real player with a hero history should still see supported community recipes');
 assert.deepEqual(identity(collect(input)),identity(collect({...input,includeCommunityRecommendations:false})));
});

test('only legal reviewed recipes for these real members receive the community exception',()=>{
 const slots=board(['jungle','mid']).map(s=>s.role==='jungle'?{...s,champion:'Vi',locked:true}:s);
 const input={...base,slots,rolePools:{mid:{mode:'only',heroes:['Ahri','Lux']}},limit:6};
 const id='vi-ahri-jungle-mid-confirmed-catch';
 assert.ok(collect(input).some(r=>r.communityRecommendation?.id===id));
 for(const changes of [{publicBans:['Ahri']},{excluded:['Ahri']},{enemy:['Ahri']},{publicPicks:['Ahri']},{eligibleByRole:{mid:['Lux']}},{rolePools:{mid:{mode:'only',heroes:['Lux']}}},{catalogStatus:{}},{mode:'hex'}]){
  assert.ok(collect({...input,...changes}).every(r=>r.communityRecommendation?.id!==id),JSON.stringify(changes));
 }
 const changed=slots.map(s=>s.role==='jungle'?{...s,champion:'JarvanIV'}:s);
 assert.ok(collect({...input,slots:changed}).every(r=>r.communityRecommendation?.id!==id));
 for(const row of collect(input)){
  if(!row.communityRecommendation)continue;
  const actual=[...BUNDLED_CATALOG.duos,...BUNDLED_CATALOG.trios].find(c=>c.id===row.communityRecommendation.id);assert.ok(actual);
  for(const member of row.communityRecommendation.members)assert.ok(row.slots.some(s=>s.role===member.role&&s.champion===member.champion));
 }
 const strangers=board(['top']).map(s=>s.role==='bottom'?{...s,champion:'Jinx',locked:true}:s.role==='support'?{...s,champion:'Lulu',locked:true}:s);
 assert.ok(collect({...base,scope:'context',slots:strangers,rolePools:{top:{mode:'only',heroes:['Garen']}}}).every(r=>r.communityRecommendation?.id!=='jinx-lulu'));
});

test('recipe completion is capped independently of a large bot catalogue and cannot enumerate all five pools',()=>{
 const input={fixed:board(['top','jungle','mid','bottom','support']),targets:['top','jungle','mid','bottom','support'],candidateSets:Object.fromEntries(['top','jungle','mid','bottom','support'].map(role=>[role,champions])),randomSeed:'cap',limit:12};
 const cross=BUNDLED_CATALOG.duos.filter(c=>c.members?.some(m=>m.role==='jungle'));
 const result=communityLineups({...input,combos:[...BUNDLED_CATALOG.duos,...cross,...BUNDLED_CATALOG.trios]});
 assert.equal(result.length,12);assert.ok(result.some(r=>r.combo.members?.some(m=>m.role==='jungle')));
 for(const row of result){assert.equal(new Set(row.slots.map(s=>s.champion)).size,5);assert.ok(row.slots.every(s=>s.champion));}
});

test('pinned non-ADC skill mechanisms earn only the existing budgets and changed source loses that evidence',()=>{
 const group=ids=>ids.map(([role,id])=>{const c=champions.find(c=>c.id===id);return {role,champion:id,c,p:profile(c,role)};});
 const members=group([['jungle','Vi'],['mid','Ahri']]),graph=createCooperationGraph(champions,{currentPatch:patch});
 const verified=compositionFit({members},graph),generic=compositionFit({members},{...graph,mechanics:null});
 assert.ok(verified.rawScore>generic.rawScore);assert.ok(verified.relationships.some(r=>r.mechanicEvidence?.setupSpell==='ViR'));
 const adc=compositionFit({members:group([['bottom','Jinx'],['support','Lulu']])},graph);
 const wall=compositionFit({members:group([['jungle','Poppy'],['mid','Anivia']])},graph);
 assert.ok(wall.score>adc.score,'A verified mid/jungle mechanism can outrank generic bot protection');
 const changed=structuredClone(champions);changed.find(c=>c.id==='Vi').mechanicSource.character.sha256='0'.repeat(64);
 const stale=compositionFit({members},createCooperationGraph(changed,{currentPatch:patch}));assert.equal(stale.rawScore,generic.rawScore);
 assert.equal(verified.breakdown.filter(r=>r.max).reduce((sum,r)=>sum+r.max,0),100);
 assert.equal(compositionFit({members},graph,{details:false}).rawScore,verified.rawScore);
});

test('real offline wide draft remains bounded and retained rerolls avoid another search',()=>{
 const input={...base,slots:board(['top','jungle','mid','bottom','support']),minimumFitScore:60},start=performance.now();
 const engine=createRecommendationSearch(input),first=engine.advance({limit:6}),initial=performance.now()-start;
 const after=performance.now(),next=engine.advance({limit:6}),reroll=performance.now()-after;
 assert.equal(first.rows.length,6);assert.equal(next.rows.length,6);
 assert.ok(initial<4000,`Wide offline draft: ${initial.toFixed(1)}ms`);assert.ok(reroll<100,`Retained reroll: ${reroll.toFixed(1)}ms`);
});
