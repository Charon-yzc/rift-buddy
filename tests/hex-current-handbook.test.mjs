import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import builds from '../data/hex-builds.json' with {type:'json'};

import fs from 'node:fs/promises';
import vm from 'node:vm';
import {hexHandbookAugments,hexManualAugments,hexOrdinaryAugments,hexCurrentAugmentIds,hexFavoriteIsCurrent} from '../src/core/hex-acquisition.mjs';
import {hexCatalogDisabled} from '../src/core/hex-catalog.mjs';
import {isCurrentHexData,isReadableHexData,HEX_DATA_PENDING} from '../src/core/hex-data-current.mjs';
import {hexHeroPool} from '../src/core/hex-pool.mjs';
import {hexPoolView,hexPoolBadge} from '../src/hex-pool-view.mjs';
import {hexAugmentReference} from '../src/core/hex-augment-reference.mjs';
import {escape,asset,icon,button} from '../src/ui.mjs';
import FavoriteList from '../src/generated/FavoriteList.mjs';
const data={...game,hexBuilds:builds.entries},source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const line=name=>source.split('\n').find(s=>s.startsWith('function '+name+'(')||s.startsWith('async function '+name+'('));
const active=hexManualAugments(data)[0],retired=data.augments.filter(a=>hexCatalogDisabled(data,a));
test('current handbook filters disabled and internal records without mutating the source or asserting offer eligibility',()=>{
 const before=JSON.stringify(data),visible=hexHandbookAugments(data);assert(visible.length>0);assert(retired.length>0);
 for(const a of retired)assert(!visible.some(row=>row.id===a.id));
 assert(!visible.some(a=>a.id===3176));assert.deepEqual(hexOrdinaryAugments(data),[]);
 assert.deepEqual(hexCurrentAugmentIds(data,[active.id,retired[0].id,999999,active.id]),[active.id]);assert.equal(JSON.stringify(data),before);
});
test('current source build favorites preserve original indices and hidden historical records',()=>{
 const current={id:'current-source',type:'build',title:'current-source',champion:'Ashe',role:'bottom',mode:'hex',version:data.version};
 const favorites=[{id:'old',type:'hex',title:'old',version:'16.20.1',augments:[active.id]},{id:'rift',type:'build',title:'rift',mode:'rift',version:'16.20.1'},current,{id:'authored',type:'hex',title:'authored',version:data.version,augments:[active.id]}],before=structuredClone(favorites);
 const rows=FavoriteList.computed.rows.call({data,favorites});assert.deepEqual(rows.map(row=>[row.id,row.index]),[['rift',1],['current-source',2]]);
 assert(hexFavoriteIsCurrent(data,{...current,version:data.patch+'.99'}));assert.deepEqual(favorites,before);
});
test('actual current handbook removes stale wishlist chips while keeping valid source entries visible',()=>{
 const context=vm.createContext({data,hexSelected:[retired[0].id,active.id,999999],hexCurrentAugmentIds,hexHandbookAugments,hexAugmentReference,isCurrentHexData,isReadableHexData,HEX_DATA_PENDING,hexHeroPool,hexPoolView,hexPoolBadge,hexHero:null,hexPoolRound:0,hexMechanism:'unknown',hexPoolFilter:'all',hexSelectedOnly:false,hexCategory:'all',hexRarity:'all',hexQuery:'',hexForHero:false,AUGMENT_CATEGORIES:[],rarityName:{},saved:{favorites:[]},hexFavoriteId:()=>'',renderHexTools:()=>'',augmentCategories:()=>[],e:escape,asset,button,icon});
 vm.runInContext(line('augmentTiles')+'\n'+line('renderHex'),context);const html=context.renderHex();
 assert.equal((html.match(/class="augment-card /g)||[]).length,hexHandbookAugments(data).length);assert.deepEqual([...context.hexSelected],[active.id]);
 for(const a of retired)assert(!html.includes('data-id="'+a.id+'"'));assert(!html.includes('data-id="999999"'));
});
// Keep genuine saved-setting cleanup compatibility, not old gameplay advice.
// The destructive path still requires the reviewed legacy source and an exact
// captured record; current unreadable/unreviewed data cannot authorize deletion.
import legacy from './fixtures/snapshot-16.21/game.json' with {type:'json'};
test('legacy saved settings: 500 hidden Hex favorites offer explicit cleanup, preserve everything before confirmation, then allow a current save',async()=>{
 const data=legacy,active=hexOrdinaryAugments(data)[0],retired=data.augments.filter(a=>hexCatalogDisabled(data,a));
 const favorites=Array.from({length:500},(_,i)=>({id:'old-'+i,type:'hex',champion:null,title:'obsolete-private-'+i,version:'16.20.1',augments:[active.id]})),before=JSON.stringify(favorites),context=vm.createContext({data,saved:{favorites},isCurrentHexData,hexFavoriteIsCurrent,heading:()=>'',e:escape,icon,button,portrait:()=>'',champ:()=>null,favoriteBuildSummary:()=>'',favoriteTeamSummary:()=>'',dateLabel:()=>'',changeFavorites:async next=>context.saved.favorites=next});
 vm.runInContext(source.split('\n').find(line=>line.startsWith('const obsoleteHexFavorites='))+'\n'+line('captureObsoleteHexFavorites')+'\n'+line('obsoleteHexFavoriteControl')+'\n'+line('clearObsoleteHexFavorites')+'\n'+line('addFavorite')+'\n'+line('renderFavorites'),context);
 const html=context.renderFavorites();assert.match(html,/旧版收藏管理 · 500/);assert.match(html,/data-action="review-obsolete-hex"/);assert.doesNotMatch(html,/obsolete-private-/);assert.equal(JSON.stringify(favorites),before);await assert.rejects(context.addFavorite({id:'current'}),/500/);await assert.rejects(context.clearObsoleteHexFavorites({version:'16.20.1',targets:[]}),/版本已变化/);assert.equal(JSON.stringify(favorites),before);
 await context.clearObsoleteHexFavorites(context.captureObsoleteHexFavorites());await context.addFavorite({id:'current',type:'hex',champion:null,augments:[active.id]});assert.equal(context.saved.favorites.length,1);assert.equal(context.saved.favorites[0].id,'current');
 const rift={id:'rift',type:'build',mode:'rift',version:'16.20.1'},current=context.saved.favorites[0];context.saved.favorites=[favorites[0],rift,current];await context.clearObsoleteHexFavorites(context.captureObsoleteHexFavorites());assert.deepEqual([...context.saved.favorites],[rift,current]);context.data={...data,augmentError:'unavailable'};await assert.rejects(context.clearObsoleteHexFavorites(context.captureObsoleteHexFavorites()),/版本已变化/);assert.deepEqual([...context.saved.favorites],[rift,current]);
});


test('legacy saved settings: old Hex cleanup removes only confirmed exact records and rejects edited or newly eligible targets',async()=>{
 const data=legacy,active=hexOrdinaryAugments(data)[0],retired=data.augments.filter(a=>hexCatalogDisabled(data,a));
 const old={id:'old',type:'hex',version:'16.20.1',augments:[active.id]},current={id:'current',type:'hex',version:data.version,augments:[active.id]},added={...old,id:'added'},context=vm.createContext({data,saved:{favorites:[old,current]},isCurrentHexData,hexFavoriteIsCurrent,changeFavorites:async next=>context.saved.favorites=next});
 vm.runInContext(source.split('\n').find(line=>line.startsWith('const obsoleteHexFavorites='))+'\n'+line('captureObsoleteHexFavorites')+'\n'+line('clearObsoleteHexFavorites'),context);
 const review=context.captureObsoleteHexFavorites();context.saved.favorites.push(added);context.data={...data,augments:data.augments.map(a=>a.id===active.id?{...a,catalogEnabled:false}:a)};
 await context.clearObsoleteHexFavorites(review);assert.deepEqual([...context.saved.favorites],[current,added],'newly hidden or imported entries stay untouched');
 context.data=data;context.saved.favorites=[old];const editedReview=context.captureObsoleteHexFavorites();context.saved.favorites=[{...old,title:'edited after confirmation'}];const before=JSON.stringify(context.saved.favorites);await assert.rejects(context.clearObsoleteHexFavorites(editedReview),/收藏已变化/);assert.equal(JSON.stringify(context.saved.favorites),before);
 context.saved.favorites=[{...old,version:data.version,augments:[retired[0].id]}];const eligibilityReview=context.captureObsoleteHexFavorites();context.data={...data,augments:data.augments.map(a=>a.id===retired[0].id?{...a,catalogEnabled:true}:a)};await assert.rejects(context.clearObsoleteHexFavorites(eligibilityReview),/收藏已变化/);assert.equal(context.saved.favorites.length,1);
 context.data=data;context.saved.favorites=[old];const removedReview=context.captureObsoleteHexFavorites();context.saved.favorites=[];await assert.rejects(context.clearObsoleteHexFavorites(removedReview),/收藏已变化/);
});


import {resolveHexAugmentInput} from '../src/core/hex-recommendations.mjs';
import {hexAugmentAcquisition} from '../src/core/hex-acquisition.mjs';
import {hexAugmentDetail} from '../src/core/hex-augment-detail.mjs';
test('actual typed disabled offers remain inspectable without entering browse, bookmarks or system options',async()=>{
 let handler;const changes=[],errors=[],context=vm.createContext({document:{addEventListener:(_event,fn)=>handler=fn,querySelector:()=>null},data,hexManualAugments,resolveHexAugmentInput,overlay:{contains:()=>false},buildView:null,hexRoundSnapshot:{manual:{context:'actual-offer',options:[]}},changeHexRound:async(operation,id)=>changes.push([operation,id]),render:()=>{},toast:message=>errors.push(message)});
 vm.runInContext(source.split('\n').find(s=>s.startsWith("document.addEventListener('change'")&&s.includes('[data-hex-option-input]')),context);
 const submit=async a=>handler({target:{matches:()=>true,value:a.name+' · #'+a.id,closest:()=>({dataset:{hexContext:'actual-offer'}})}});
 await submit(retired[0]);assert.deepEqual(changes,[['compare',retired[0].id]]);assert.deepEqual(errors,[]);assert(!hexManualAugments(data).some(a=>a.id===retired[0].id));
 for(const id of [3170,3171,3172,3173,3176])await submit(data.augments.find(a=>a.id===id));assert.equal(changes.length,1);assert.equal(errors.length,5);
 const view=vm.createContext({data,isCurrentHexData,isReadableHexData,hexHandbookAugments,hexCurrentAugmentIds,hexAugmentAcquisition,hexAugmentReference,hexAugmentDetail,hexHeroPool,hexPoolBadge,hexHero:'Ahri',hexPoolRound:0,hexMechanism:'unknown',hexOptions:[retired[0].id],hexOwned:[],hexSelected:[],rarityName:{},picker:null,buildView:null,detailResult:null,overlay:{innerHTML:''},currentHexRound:()=>null,refreshHexNotes:()=>{},windowLayout:{docked:false},e:escape,asset,button});
 vm.runInContext(line('showAugment'),view);view.showAugment(retired[0].id);assert.match(view.overlay.innerHTML,/augment-modal/);assert.match(view.overlay.innerHTML,/compare-augment/);assert.doesNotMatch(view.overlay.innerHTML,/toggle-augment/);
 view.overlay.innerHTML='';view.hexOptions=[];view.showAugment(retired[0].id);assert.equal(view.overlay.innerHTML,'');
});


import {getBuild} from '../src/core/builds.mjs';
import {selectedBuildFields,buildFavoriteId,findSavedBuild} from '../src/core/build-favorites.mjs';
import {companionPlanView} from '../src/companion-view.mjs';

test('current default source build saves separately from a hidden same-key favorite and renderer toggle removes only the new record',async()=>{
 const selection={id:'Ashe',role:'bottom',mode:'hex',conditions:[],coreIndex:0,augmentIds:[active.id],compareIds:[],ownedAugmentIds:[]};
 const hero=data.champions.find(c=>c.id===selection.id),build=getBuild(hero,selection.role,data,selection),plan={selection,build},value={...selection,build};
 assert.equal(build.reference,data.hexBuilds[hero.id]);assert.equal(build.loadoutId,'default');assert.equal(build.combo,null);
 const old={...selectedBuildFields(value),id:buildFavoriteId(value),type:'build',title:'Personal setting carried across patches',champion:selection.id,role:selection.role,mode:'hex',conditions:[],coreIndex:0,version:legacy.version};
 // This is a saved user configuration with the same key, not an old source
 // record relabelled to authorize a current recipe.
 const oldBytes=Buffer.from(JSON.stringify(old));assert.equal(findSavedBuild([old],value),old);assert.equal(hexFavoriteIsCurrent(data,old),false);
 const definitions=['const savedBuild=','const currentBuildFavoriteId='].map(prefix=>source.split('\n').find(s=>s.startsWith(prefix))).join('\n');
 const change=source.slice(source.indexOf('async function changeFavorites('),source.indexOf('async function addFavorite(')),action=source.split('\n').find(s=>s.startsWith(" if(action==='companion-favorite')"));assert(action);
 for(const surface of ['companion','build']){
  const writes=[],context=vm.createContext({data,saved:{favorites:[old]},favoriteSaving:false,hexFavoriteIsCurrent,findSavedBuild,buildFavoriteId,selectedBuildFields,companionPreparation:()=>plan,overlay:{contains:()=>false},buildView:null,champ:id=>data.champions.find(c=>c.id===id),render:()=>{},toast:()=>{},persist:async()=>writes.push(JSON.stringify(context.saved.favorites))});
  vm.runInContext(definitions+'\n'+change+'\n'+line('addFavorite')+'\nasync function click(action,el){'+action+'}',context);
  const control=()=>{
   const html=companionPlanView(data,plan,context.saved.favorites,{surface}),match=html.match(/<button\b[^>]*data-action="companion-favorite"[^>]*>[\s\S]*?<\/button>/);
   assert(match,'The actual renderer must expose a favorite action');return match[0];
  };
  const clickRendered=async()=>{
   const html=control(),planKey=html.match(/data-plan="([^"]+)"/)?.[1];assert.equal(planKey,'Ashe:bottom:hex');
   await context.click('companion-favorite',{dataset:{plan:planKey}});
  };
  assert.match(control(),/收藏当前搭配/);assert.match(control(),/aria-pressed="false"/);assert.doesNotMatch(control(),/已收藏 · 点击取消/);
  await clickRendered();assert.equal(context.saved.favorites.length,2);
  const added=context.saved.favorites.find(f=>f.id!==old.id);assert(added);assert.equal(added.version,data.version);assert.equal(added.champion,old.champion);assert.deepEqual([...added.augmentIds],old.augmentIds);assert.equal(hexFavoriteIsCurrent(data,added),true);
  assert.notEqual(added.id,old.id);assert(added.id.startsWith('hex-current:'+data.patch+':'));
  assert.match(control(),/已收藏 · 点击取消/);assert.match(control(),/aria-pressed="true"/);
  await clickRendered();assert.equal(context.saved.favorites.length,1);assert.equal(context.saved.favorites[0],old);
  assert.match(control(),/收藏当前搭配/);assert.match(control(),/aria-pressed="false"/);
  assert.equal(writes.length,2);for(const bytes of writes){const persistedOld=JSON.parse(bytes).find(f=>f.id===old.id);assert(oldBytes.equals(Buffer.from(JSON.stringify(persistedOld))));}
  assert(oldBytes.equals(Buffer.from(JSON.stringify(old))));
 }
});

test('legacy saved settings: real 16.21 collection save and toggle preserve an invisible older same-hero same-IDs record',async()=>{
 const data=legacy,id=hexOrdinaryAugments(data)[0].id,hero='Ahri';
 assert.equal(data.patch,'16.21');assert.notEqual(data.patch,game.patch);
 const old={id:'hex:'+hero+':'+id,type:'hex',champion:hero,version:'16.20.1',augments:[id]},oldBytes=Buffer.from(JSON.stringify(old)),writes=[];
 const context=vm.createContext({data,saved:{favorites:[old]},favoriteSaving:false,hexFavoriteIsCurrent,hexCurrentAugmentIds,hexHero:hero,hexSelected:[id],hexOptions:[],hexOwned:[],buildView:null,render:()=>{},toast:()=>{},champ:champion=>data.champions.find(c=>c.id===champion),persist:async()=>writes.push(JSON.stringify(context.saved.favorites))});
 const definition=source.split('\n').find(s=>s.startsWith('const hexFavoriteId=')),change=source.slice(source.indexOf('async function changeFavorites('),source.indexOf('async function addFavorite(')),action=source.split('\n').find(s=>s.startsWith(" else if(action==='save-hex')"));assert(action);
 vm.runInContext(definition+'\n'+change+'\n'+line('addFavorite')+'\nasync function click(action){if(false){}'+action+'}',context);
 assert.equal(hexFavoriteIsCurrent(data,old),false);await context.click('save-hex');assert.equal(context.saved.favorites.length,2);
 const added=context.saved.favorites.find(f=>f.id!==old.id);assert(added);assert.equal(added.champion,hero);assert.deepEqual([...added.augments],[id]);assert.equal(added.version,data.version);assert(added.id.startsWith('hex:16.21:'));assert.equal(hexFavoriteIsCurrent(data,added),true);
 await context.click('save-hex');assert.equal(context.saved.favorites.length,1);assert.equal(context.saved.favorites[0],old);
 assert.equal(writes.length,2);for(const bytes of writes){const persistedOld=JSON.parse(bytes).find(f=>f.id===old.id);assert(oldBytes.equals(Buffer.from(JSON.stringify(persistedOld))));}
 assert(oldBytes.equals(Buffer.from(JSON.stringify(old))));
});
