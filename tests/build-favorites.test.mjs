import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {buildFavoriteId,findSavedBuild,selectedBuildFields} from '../src/core/build-favorites.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {defaultState,validateState,mergeState} from '../services/storage.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {companionPlanView} from '../src/companion-view.mjs';
import {favoriteBuildSummary} from '../src/favorites-view.mjs';

const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
data.hexBuilds=JSON.parse(await fs.readFile('data/hex-builds.json','utf8')).entries;
const value=(selection)=>({...selection,conditions:selection.conditions||[],build:getBuild(data.champions.find(c=>c.id===selection.id),selection.role,data,selection)});
const base={id:'Volibear',role:'top',mode:'rift',coreIndex:0};
const save=v=>({id:buildFavoriteId(v),...selectedBuildFields(v),type:'build',title:'测试搭配',champion:v.id,role:v.role,mode:v.mode,conditions:v.conditions,coreIndex:v.build.selectedCoreIndex});

test('different later choices remain separate favorites and survive validated save and import',()=>{
 const plain=value(base),option=plain.build.laterOptions.find(row=>row.items.length===1);
 assert.ok(option);
 const ids=option.items.map(i=>Number(i.id)),later=value({...base,laterIds:ids});assert.deepEqual(later.build.selectedLaterIds,ids);
 const a=save(plain),b=save(later);assert.notEqual(a.id,b.id);
 assert.equal(findSavedBuild([a],later),undefined,'Saving a late choice must not toggle away the earlier plan');
 const state=validateState({...defaultState(),favorites:[a,b]}),imported=mergeState(validateState(defaultState()),state,data.champions);
 assert.equal(imported.favorites.length,2);
 const restored=value({...base,...imported.favorites[1],id:imported.favorites[1].champion});
 assert.deepEqual(restored.build.selectedLaterIds,ids);
 assert.equal(findSavedBuild(imported.favorites,restored).id,b.id);
 const store=createPreparationStore();store.remember({...base,...selectedBuildFields(later)});
 assert.deepEqual(store.recall(base).laterIds,ids);
});

test('legacy default favorites match only the actual default late and skill selections',()=>{
 const plain=value(base),legacy={...save(plain),id:'legacy-custom'};delete legacy.laterIds;delete legacy.skillId;
 assert.equal(findSavedBuild([legacy],plain),legacy);
 const late=plain.build.laterOptions[0].items.map(i=>Number(i.id));
 assert.equal(findSavedBuild([legacy],value({...base,laterIds:late})),undefined);
 const alternate=plain.build.skillChoices.find(o=>o.id!==plain.build.defaultSkillId);
 assert.ok(alternate);assert.equal(findSavedBuild([legacy],value({...base,skillId:alternate.id})),undefined);
});

test('Hex favorite identity and content include all three augmentation contexts',()=>{
 const chosen=value({...base,mode:'hex',augmentIds:[1048],compareIds:[1048,1002],ownedAugmentIds:[1047]});
 const favorite=save(chosen),saved=validateState({...defaultState(),favorites:[favorite]}).favorites[0];
 assert.deepEqual(saved.augmentIds,[1048]);assert.deepEqual(saved.compareIds,[1048,1002]);assert.deepEqual(saved.ownedAugmentIds,[1047]);
 for(const change of [{augmentIds:[1002]},{compareIds:[1048]},{ownedAugmentIds:[]}]){
  const next=value({...chosen,...change});assert.notEqual(buildFavoriteId(next),favorite.id);assert.equal(findSavedBuild([saved],next),undefined);
 }
 const reordered=value({...chosen,compareIds:[1002,1048]});assert.equal(buildFavoriteId(reordered),favorite.id);
 assert.equal(findSavedBuild([saved],reordered).id,favorite.id);
});

test('Hex core identity survives source sorting, guide validation and favorites',()=>{
 const chosen=value({...base,mode:'hex',coreIndex:1}),fields=selectedBuildFields(chosen);
 assert.ok(fields.coreId);
 const state=validateState({...defaultState(),favorites:[save(chosen)],guide:{selection:{...base,mode:'hex',coreIndex:1,...fields}}});
 assert.equal(state.favorites[0].coreId,fields.coreId);assert.equal(state.guide.selection.coreId,fields.coreId);
 const changed=structuredClone(data);changed.hexBuilds.Volibear.core.reverse();
 const restored=getBuild(data.champions.find(c=>c.id===base.id),base.role,changed,{...state.guide.selection});
 assert.equal(restored.selectedCoreId,chosen.build.selectedCoreId);
 const store=createPreparationStore();store.remember(state.guide.selection);assert.equal(store.recall({...base,mode:'hex'}).coreId,fields.coreId);
});

test('sidebar favorite button reflects the exact plan and changed late items',()=>{
 const plain=value(base),plan={selection:base,build:plain.build};
 const before=companionPlanView(data,plan,[]);assert.match(before,/aria-pressed="false"/);assert.match(before,/收藏当前搭配/);
 const after=companionPlanView(data,plan,[save(plain)]);assert.match(after,/已收藏 · 点击取消/);
 const later=value({...base,laterIds:plain.build.laterOptions[0].items.map(i=>Number(i.id))});
 const changed=companionPlanView(data,{selection:later,build:later.build},[save(plain)]);
 assert.match(changed,/收藏当前搭配/);assert.doesNotMatch(changed,/已收藏 · 点击取消/);
});

test('favorite cards distinguish later choices and keep unavailable saved data visible',()=>{
 const plain=value(base),laterIds=plain.build.laterOptions[0].items.map(i=>Number(i.id));
 const empty=favoriteBuildSummary(data,save(plain));assert.match(empty,/上路/);assert.match(empty,/自选后期：尚未添加/);
 const late=favoriteBuildSummary(data,save(value({...base,laterIds})));
 for(const id of laterIds)assert.ok(late.includes(data.items[id].name));assert.notEqual(late,empty);
 const removed=favoriteBuildSummary(data,{...save(plain),version:'15.1.1',laterIds:[999999]});
 assert.match(removed,/已移除装备 #999999/);assert.match(removed,/按当前资料还原/);
 assert.match(favoriteBuildSummary(data,{...save(plain),champion:'MissingHero'}),/原收藏保留/);
 const hex=favoriteBuildSummary(data,save(value({...base,mode:'hex',augmentIds:[1048],compareIds:[1002],ownedAugmentIds:[1047]})));
 assert.match(hex,/强化备选：/);assert.match(hex,/本次比较：/);assert.match(hex,/本局已选：/);
});
