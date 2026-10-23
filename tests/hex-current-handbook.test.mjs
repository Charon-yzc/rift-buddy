import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
import {hexHandbookAugments,hexOrdinaryAugments,hexCurrentAugmentIds,hexFavoriteIsCurrent} from '../src/core/hex-acquisition.mjs';
import {hexCatalogDisabled} from '../src/core/hex-catalog.mjs';import {isCurrentHexData,HEX_DATA_PENDING} from '../src/core/hex-data-current.mjs';
import {hexHeroPool} from '../src/core/hex-pool.mjs';import {hexPoolView,hexPoolBadge} from '../src/hex-pool-view.mjs';
import {hexAugmentReference} from '../src/core/hex-augment-reference.mjs';import {escape,asset,icon,button} from '../src/ui.mjs';
import {hexConfigurationView} from '../src/hex-configuration-view.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
data.hexBuilds=JSON.parse(await fs.readFile(new URL('../data/hex-builds.json',import.meta.url))).entries;
const line=name=>source.split('\n').find(line=>line.startsWith('function '+name+'('));
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

test('actual favorites keep action indices stable while hiding obsolete Hex collections',()=>{
 const favorites=[{type:'hex',title:'obsolete-hex',version:'16.20.1',augments:[active.id]},{type:'build',title:'rift-kept',mode:'rift',version:'16.20.1'},{type:'hex',title:'current-hex',version:data.version,augments:[active.id]},{type:'hex',title:'disabled-hex',version:data.version,augments:[retired[0].id]},{type:'build',title:'obsolete-hex-build',mode:'hex',version:'16.20.1'}],before=JSON.stringify(favorites);
 const context=vm.createContext({data,saved:{favorites},hexFavoriteIsCurrent,heading:()=>'',e:escape,icon,button,portrait:()=>'',champ:()=>null,favoriteBuildSummary:()=>'',favoriteTeamSummary:()=>'',dateLabel:()=>''});vm.runInContext(line('renderFavorites'),context);
 const html=context.renderFavorites();assert.match(html,/rift-kept/);assert.match(html,/current-hex/);assert.doesNotMatch(html,/obsolete-hex|disabled-hex|旧版强化/);assert.match(html,/data-action="open-favorite" data-index="1"/);assert.match(html,/data-action="open-favorite" data-index="2"/);assert.equal(JSON.stringify(favorites),before);
 context.saved.favorites=[favorites[0]];assert.match(context.renderFavorites(),/留住想玩的点子/);
});

test('saving a current Hex collection cannot toggle-delete an invisible previous-patch collection with the same hero and IDs',()=>{
 const old={id:'hex:Ahri:'+active.id,type:'hex',champion:'Ahri',version:'16.20.1',augments:[active.id]},context=vm.createContext({data,saved:{favorites:[old]},hexFavoriteIsCurrent,findSavedBuild:rows=>rows[0],buildFavoriteId:()=> 'same-build',hexHero:'Ahri',hexSelected:[active.id]});
 const definitions=['const savedBuild=','const currentBuildFavoriteId=','const hexFavoriteId='].map(prefix=>source.split('\n').find(line=>line.startsWith(prefix))).join('\n');vm.runInContext(definitions+'\nglobalThis.keys={hex:hexFavoriteId,build:currentBuildFavoriteId,saved:savedBuild};',context);
 assert.notEqual(context.keys.hex(),old.id);assert.match(context.keys.hex(),/^hex:16\.21:/);assert.equal(context.keys.saved({}),undefined);assert.equal(context.keys.build({mode:'rift'}),'same-build');assert.equal(context.keys.build({mode:'hex'}),'hex-current:16.21:same-build');
 context.saved.favorites=[{...old,version:data.version}];assert.equal(context.keys.hex(),old.id,'Existing current-patch IDs keep their toggle behavior');assert.equal(context.keys.saved({}).id,old.id);
 const navigation=source.slice(source.indexOf('function mainNavigation(){'),source.indexOf('function mainWindowActions(){'));context.nav=[['favorites','收藏','star']];context.route='favorites';context.icon=()=>'';vm.runInContext(navigation,context);assert.match(context.mainNavigation(),/class="badge">1/);context.saved.favorites=[old];assert.doesNotMatch(context.mainNavigation(),/class="badge"/);
});

test('four selection timings are noninteractive context, never four copies claimed as complete hero pools',()=>{
 const pool=hexHeroPool({data,hero:'Yasuo'}),html=hexPoolView(pool);assert.equal(pool.rules.stages.length,4);assert.equal(pool.roundsComplete,false);assert.equal(pool.complete,false);
 for(const timing of ['开局','7级','11级','15级'])assert(html.includes(timing));assert.match(html,/不代表四次池子相同/);assert.doesNotMatch(html,/data-round="[1-4]"/);assert(!html.includes('value="disabled"'));
 const configuration=hexConfigurationView({data,hero:data.champions.find(c=>c.id==='Yasuo'),round:{context:'isolated',revision:0,options:[],owned:[]}});
 assert.match(configuration,/<h3>强化参考<\/h3>/);assert.match(configuration,/常规四次强化选择/);assert.doesNotMatch(configuration,/目录停用|<h3>强化池<\/h3>/);for(const a of retired)assert(!configuration.includes('data-game-tooltip-id="'+a.id+'"'));
});
