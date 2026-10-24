import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
import {hexAugmentAcquisition,hexHandbookAugments,hexOrdinaryAugments,hexCurrentAugmentIds,hexFavoriteIsCurrent} from '../src/core/hex-acquisition.mjs';
import {hexCatalogDisabled} from '../src/core/hex-catalog.mjs';import {isCurrentHexData,HEX_DATA_PENDING} from '../src/core/hex-data-current.mjs';
import {hexHeroPool} from '../src/core/hex-pool.mjs';import {hexPoolView,hexPoolBadge} from '../src/hex-pool-view.mjs';
import {hexAugmentReference} from '../src/core/hex-augment-reference.mjs';import {escape,asset,icon,button} from '../src/ui.mjs';
import {hexConfigurationView} from '../src/hex-configuration-view.mjs';
import {companionPlanView} from '../src/companion-view.mjs';import {getBuild} from '../src/core/builds.mjs';import {selectedBuildFields} from '../src/core/build-favorites.mjs';
import {resolveHexAugmentInput} from '../src/core/hex-recommendations.mjs';import {hexAugmentDetail} from '../src/core/hex-augment-detail.mjs';
import FavoriteList from '../src/generated/FavoriteList.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
data.hexBuilds=JSON.parse(await fs.readFile(new URL('../data/hex-builds.json',import.meta.url))).entries;
const line=name=>source.split('\n').find(line=>line.startsWith('function '+name+'(')||line.startsWith('async function '+name+'('));
const visible=hexHandbookAugments(data),retired=data.augments.filter(a=>hexCatalogDisabled(data,a)),active=hexOrdinaryAugments(data)[0];

test('current handbook and manual picker exclude retired catalogue rows, retaining immutable diagnostics and live-choice inspection',()=>{
 const before=JSON.stringify(data);assert.equal(retired.length,9);assert.equal(visible.length,239);assert(visible.every(a=>!retired.some(r=>r.id===a.id)));assert.equal(hexHandbookAugments(data,{includeDisabled:true}).length,248);
 assert(hexOrdinaryAugments(data).every(a=>visible.includes(a)));assert(!visible.some(a=>a.id===3176));
 const reenabled=structuredClone(data);reenabled.augments.find(a=>a.id===retired[0].id).catalogEnabled=true;assert(hexHandbookAugments(reenabled).some(a=>a.id===retired[0].id));
 for(const mutate of [d=>d.patch='16.20',d=>d.patch='16.22',d=>d.augmentVersion='16.20.1',d=>d.augmentError='failed']){const changed=structuredClone(data);mutate(changed);assert.deepEqual(hexHandbookAugments(changed),[]);assert.deepEqual(hexCurrentAugmentIds(changed,[active.id]),[]);}
 assert.equal(JSON.stringify(data),before);
});

test('current-only favorite projection preserves original records, non-Hex favorites and same-patch minor versions',()=>{
 const favorite={type:'hex',version:data.version,augments:[active.id]},before=JSON.stringify(favorite);
 assert(hexFavoriteIsCurrent(data,favorite));assert(hexFavoriteIsCurrent(data,{...favorite,version:'16.21.99'}));
 for(const version of ['16.20.1','16.22.1',undefined,'unknown'])assert(!hexFavoriteIsCurrent(data,{...favorite,version}));
 for(const augments of [[],[retired[0].id],[999999],[active.id,active.id]])assert(!hexFavoriteIsCurrent(data,{...favorite,augments}));
 assert(!hexFavoriteIsCurrent(data,{type:'build',mode:'hex',version:'16.20.1'}));assert(hexFavoriteIsCurrent(data,{type:'build',mode:'hex',version:data.version}));
 assert(hexFavoriteIsCurrent(data,{type:'build',mode:'rift',version:'16.20.1'}));assert(hexFavoriteIsCurrent(data,{type:'team',version:'16.20.1'}));
 assert.deepEqual(hexCurrentAugmentIds(data,[active.id,retired[0].id,999999,active.id]),[active.id]);assert.equal(JSON.stringify(favorite),before);
});

test('actual handbook removes stale wishlist chips and disabled cards instead of showing old placeholders',()=>{
 const context=vm.createContext({data,hexSelected:[retired[0].id,active.id,999999],hexCurrentAugmentIds,hexHandbookAugments,hexAugmentReference,isCurrentHexData,HEX_DATA_PENDING,hexHeroPool,hexPoolView,hexPoolBadge,hexHero:null,hexPoolRound:0,hexMechanism:'unknown',hexPoolFilter:'all',hexSelectedOnly:false,hexCategory:'all',hexRarity:'all',hexQuery:'',hexForHero:false,AUGMENT_CATEGORIES:[],rarityName:{},saved:{favorites:[]},hexFavoriteId:()=>'',renderHexTools:()=>'',augmentCategories:()=>[],heading:()=>'',e:escape,asset,button,icon});
 vm.runInContext(line('augmentTiles')+'\n'+line('renderHex'),context);const html=context.renderHex();
 assert.equal((html.match(/class="augment-card /g)||[]).length,239);assert.deepEqual([...context.hexSelected],[active.id]);assert.doesNotMatch(html,/旧资料|旧版强化|data-id="999999"/);
 for(const a of retired)assert(!html.includes('data-id="'+a.id+'"'));assert(!html.includes('value="disabled"'));
});

test('Vue favorites preserve original action indices while hiding obsolete Hex collections',()=>{
 const favorites=[{type:'hex',title:'obsolete-hex',version:'16.20.1',augments:[active.id]},{type:'build',title:'rift-kept',mode:'rift',version:'16.20.1'},{type:'hex',title:'current-hex',version:data.version,augments:[active.id]},{type:'hex',title:'disabled-hex',version:data.version,augments:[retired[0].id]},{type:'build',title:'obsolete-hex-build',mode:'hex',version:'16.20.1'}],before=JSON.stringify(favorites);
 const rows=FavoriteList.computed.rows.call({data,favorites});
 assert.deepEqual(rows.map(row=>[row.title,row.index]),[['rift-kept',1],['current-hex',2]]);assert.equal(JSON.stringify(favorites),before);
 assert.deepEqual(FavoriteList.computed.rows.call({data,favorites:[favorites[0]]}),[]);
});

test('saving a current Hex collection cannot toggle-delete an invisible previous-patch collection with the same hero and IDs',()=>{
 const old={id:'hex:Ahri:'+active.id,type:'hex',champion:'Ahri',version:'16.20.1',augments:[active.id]},context=vm.createContext({data,saved:{favorites:[old]},hexFavoriteIsCurrent,findSavedBuild:rows=>rows[0],buildFavoriteId:()=> 'same-build',hexHero:'Ahri',hexSelected:[active.id]});
 const definitions=['const savedBuild=','const currentBuildFavoriteId=','const hexFavoriteId='].map(prefix=>source.split('\n').find(line=>line.startsWith(prefix))).join('\n');vm.runInContext(definitions+'\nglobalThis.keys={hex:hexFavoriteId,build:currentBuildFavoriteId,saved:savedBuild};',context);
 assert.notEqual(context.keys.hex(),old.id);assert.match(context.keys.hex(),/^hex:16\.21:/);assert.equal(context.keys.saved({}),undefined);assert.equal(context.keys.build({mode:'rift'}),'same-build');assert.equal(context.keys.build({mode:'hex'}),'hex-current:16.21:same-build');
 context.saved.favorites=[{...old,version:data.version}];assert.equal(context.keys.hex(),old.id,'Existing current-patch IDs keep their toggle behavior');assert.equal(context.keys.saved({}).id,old.id);
 const navigation=source.slice(source.indexOf('function mainNavigation(){'),source.indexOf('function mainWindowActions(){'));context.nav=[['favorites','收藏','star']];context.route='favorites';context.icon=()=>'';vm.runInContext(navigation,context);assert.match(context.mainNavigation(),/class="badge">1/);context.saved.favorites=[old];assert.doesNotMatch(context.mainNavigation(),/class="badge"/);
});

test('four selection stages are noninteractive context, never four copies claimed as complete hero pools',()=>{
 const pool=hexHeroPool({data,hero:'Yasuo'}),html=hexPoolView(pool);assert.equal(pool.rules.stages.length,4);assert.equal(pool.roundsComplete,false);assert.equal(pool.complete,false);
 for(const label of ['首次','第二次','第三次','第四次'])assert(html.includes(label));assert.equal(pool.rules.stageTimingsConfirmed,false);assert(pool.rules.stages.every(s=>!s.timing));assert.match(html,/不代表四次池子相同/);assert.doesNotMatch(html,/data-round="[1-4]"/);assert(!html.includes('value="disabled"'));
 const configuration=hexConfigurationView({data,hero:data.champions.find(c=>c.id==='Yasuo'),round:{context:'isolated',revision:0,options:[],owned:[]}});
 assert.match(configuration,/<h3>强化池/);for(const label of ['总池','第一次','第二次','第三次','第四次'])assert(configuration.includes(label));for(let n=1;n<=4;n++){const panel=configuration.split('data-stage="'+n+'">')[1].split('</div>')[0];assert(panel.includes('候选池待核实'));assert(!panel.includes('<img'));}for(const a of retired)assert(!configuration.includes('data-game-tooltip-id="'+a.id+'"'));
});

test('full configuration favorite caption follows old-only, add current, remove current without deleting the old record',()=>{
 const selection={id:'Ahri',role:'mid',mode:'hex',conditions:[],coreIndex:0},build=getBuild(data.champions.find(c=>c.id==='Ahri'),'mid',data,selection),plan={selection,build},old={...selectedBuildFields({...selection,build}),id:'old-hex-build',type:'build',champion:'Ahri',role:'mid',mode:'hex',version:'16.20.1'},current={...old,id:'current-hex-build',version:data.version},favorites=[old],before=JSON.stringify(old);
 for(const surface of ['companion','build']){const view=rows=>companionPlanView(data,plan,rows,{surface});assert.match(view(favorites),/收藏当前搭配/);assert.doesNotMatch(view(favorites),/已收藏 · 点击取消/);assert.match(view([...favorites,current]),/已收藏 · 点击取消/);assert.doesNotMatch(view(favorites),/已收藏 · 点击取消/);}assert.equal(JSON.stringify(old),before);
});

test('actual input handler accepts explicitly typed catalogue-conflicting offers while browse stays filtered and system offers stay rejected',async()=>{
 let handler;const changes=[],errors=[],context=vm.createContext({document:{addEventListener:(_event,fn)=>handler=fn,querySelector:()=>null},data,hexOrdinaryAugments,resolveHexAugmentInput,overlay:{contains:()=>false},buildView:null,hexRoundSnapshot:{manual:{context:'isolated',options:[]}},changeHexRound:async(operation,id)=>changes.push([operation,id]),render:()=>{},toast:message=>errors.push(message)});
 vm.runInContext(source.split('\n').find(line=>line.startsWith("document.addEventListener('change'")&&line.includes('[data-hex-option-input]')),context);
 const submit=async a=>handler({target:{matches:()=>true,value:a.name+' · #'+a.id,closest:()=>({dataset:{hexContext:'isolated'}})}});
 await submit(retired[0]);assert.deepEqual(changes,[['compare',retired[0].id]]);assert.deepEqual(errors,[]);assert(!hexOrdinaryAugments(data).some(a=>a.id===retired[0].id));
 for(const id of [3170,3171,3172,3173,3176])await submit(data.augments.find(a=>a.id===id));assert.equal(changes.length,1);assert.equal(errors.length,5);
});

test('explicit actual conflicting offer can show detail but cannot be added to current-only bookmarks',()=>{
 const context=vm.createContext({data,isCurrentHexData,hexHandbookAugments,hexCurrentAugmentIds,hexAugmentAcquisition,hexAugmentReference,hexAugmentDetail,hexHeroPool,hexPoolBadge,hexHero:'Ahri',hexPoolRound:0,hexMechanism:'unknown',hexOptions:[retired[0].id],hexOwned:[],hexSelected:[],rarityName:{},picker:null,buildView:null,detailResult:null,overlay:{innerHTML:''},currentHexRound:()=>null,e:escape,asset,button});vm.runInContext(line('showAugment'),context);context.showAugment(retired[0].id);assert.match(context.overlay.innerHTML,/augment-modal/);assert.match(context.overlay.innerHTML,/compare-augment/);assert.doesNotMatch(context.overlay.innerHTML,/toggle-augment/);
 context.overlay.innerHTML='';context.hexOptions=[];context.showAugment(retired[0].id);assert.equal(context.overlay.innerHTML,'');context.showAugment(active.id);assert.match(context.overlay.innerHTML,/toggle-augment/);
});

test('500 hidden Hex favorites offer explicit cleanup, preserve everything before confirmation, then allow a current save',async()=>{
 const favorites=Array.from({length:500},(_,i)=>({id:'old-'+i,type:'hex',champion:null,title:'obsolete-private-'+i,version:'16.20.1',augments:[active.id]})),before=JSON.stringify(favorites),context=vm.createContext({data,saved:{favorites},isCurrentHexData,hexFavoriteIsCurrent,heading:()=>'',e:escape,icon,button,portrait:()=>'',champ:()=>null,favoriteBuildSummary:()=>'',favoriteTeamSummary:()=>'',dateLabel:()=>'',changeFavorites:async next=>context.saved.favorites=next});
 vm.runInContext(source.split('\n').find(line=>line.startsWith('const obsoleteHexFavorites='))+'\n'+line('captureObsoleteHexFavorites')+'\n'+line('obsoleteHexFavoriteControl')+'\n'+line('clearObsoleteHexFavorites')+'\n'+line('addFavorite')+'\n'+line('renderFavorites'),context);
 const html=context.renderFavorites();assert.match(html,/旧版收藏管理 · 500/);assert.match(html,/data-action="review-obsolete-hex"/);assert.doesNotMatch(html,/obsolete-private-/);assert.equal(JSON.stringify(favorites),before);await assert.rejects(context.addFavorite({id:'current'}),/500/);await assert.rejects(context.clearObsoleteHexFavorites({version:'16.20.1',targets:[]}),/版本已变化/);assert.equal(JSON.stringify(favorites),before);
 await context.clearObsoleteHexFavorites(context.captureObsoleteHexFavorites());await context.addFavorite({id:'current',type:'hex',champion:null,augments:[active.id]});assert.equal(context.saved.favorites.length,1);assert.equal(context.saved.favorites[0].id,'current');
 const rift={id:'rift',type:'build',mode:'rift',version:'16.20.1'},current=context.saved.favorites[0];context.saved.favorites=[favorites[0],rift,current];await context.clearObsoleteHexFavorites(context.captureObsoleteHexFavorites());assert.deepEqual([...context.saved.favorites],[rift,current]);context.data={...data,augmentError:'unavailable'};await assert.rejects(context.clearObsoleteHexFavorites(context.captureObsoleteHexFavorites()),/版本已变化/);assert.deepEqual([...context.saved.favorites],[rift,current]);
});


test('old Hex cleanup removes only confirmed exact records and rejects edited or newly eligible targets',async()=>{
 const old={id:'old',type:'hex',version:'16.20.1',augments:[active.id]},current={id:'current',type:'hex',version:data.version,augments:[active.id]},added={...old,id:'added'},context=vm.createContext({data,saved:{favorites:[old,current]},isCurrentHexData,hexFavoriteIsCurrent,changeFavorites:async next=>context.saved.favorites=next});
 vm.runInContext(source.split('\n').find(line=>line.startsWith('const obsoleteHexFavorites='))+'\n'+line('captureObsoleteHexFavorites')+'\n'+line('clearObsoleteHexFavorites'),context);
 const review=context.captureObsoleteHexFavorites();context.saved.favorites.push(added);context.data={...data,augments:data.augments.map(a=>a.id===active.id?{...a,catalogEnabled:false}:a)};
 await context.clearObsoleteHexFavorites(review);assert.deepEqual([...context.saved.favorites],[current,added],'newly hidden or imported entries stay untouched');
 context.data=data;context.saved.favorites=[old];const editedReview=context.captureObsoleteHexFavorites();context.saved.favorites=[{...old,title:'edited after confirmation'}];const before=JSON.stringify(context.saved.favorites);await assert.rejects(context.clearObsoleteHexFavorites(editedReview),/收藏已变化/);assert.equal(JSON.stringify(context.saved.favorites),before);
 context.saved.favorites=[{...old,version:data.version,augments:[retired[0].id]}];const eligibilityReview=context.captureObsoleteHexFavorites();context.data={...data,augments:data.augments.map(a=>a.id===retired[0].id?{...a,catalogEnabled:true}:a)};await assert.rejects(context.clearObsoleteHexFavorites(eligibilityReview),/收藏已变化/);assert.equal(context.saved.favorites.length,1);
 context.data=data;context.saved.favorites=[old];const removedReview=context.captureObsoleteHexFavorites();context.saved.favorites=[];await assert.rejects(context.clearObsoleteHexFavorites(removedReview),/收藏已变化/);
});
