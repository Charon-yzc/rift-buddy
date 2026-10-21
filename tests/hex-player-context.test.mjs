import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {hexAugmentReference} from '../src/core/hex-augment-reference.mjs';
import {compareAugments,augmentCategories} from '../src/core/hex-compare.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {renderGuide} from '../src/guide-view.mjs';
import {escape,asset,icon,button} from '../src/ui.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
data.hexBuilds=JSON.parse(await fs.readFile(new URL('../data/hex-builds.json',import.meta.url),'utf8')).entries;
const find=id=>data.augments.find(a=>a.id===id),champion=data.champions.find(c=>c.id==='Ashe');

test('current Mayhem review corrects known stale descriptions without changing downloaded data',()=>{
 const before=JSON.stringify(data.augments),missile=hexAugmentReference(find(2072),{patch:'16.20'}),inferno=hexAugmentReference(find(2005),{patch:'16.20'});
 assert.doesNotMatch(missile.description,/在命中时/);assert.match(missile.description,/飞弹结束或再次施放/);assert.match(inferno.description,/冷却：5秒/);
 for(const a of [missile,inferno]){assert.equal(a.review.patch,'16.20');assert.match(a.review.sourceUrl,/leagueoflegends.com/);assert.equal(a.rawDescription,find(a.id).description);}
 assert.equal(JSON.stringify(data.augments),before);
 for(const options of [{patch:'16.21'},{patch:'16.19'},{patch:'16.20',mode:'arena'},{patch:'16.20',mode:'rift'}])assert.equal(hexAugmentReference(find(2072),options),find(2072));
 const wrong={...find(2072),key:'OtherSpell'};assert.equal(hexAugmentReference(wrong,{patch:'16.20'}),wrong);
 const samePatchNewEffect={...find(2005),description:find(2005).description+' 强化冷却改为10秒。'};
 assert.equal(hexAugmentReference(samePatchNewEffect,{patch:'16.20'}),samePatchNewEffect,'An updated effect must not acquire an old numeric correction');
});

test('main cards, details, three-choice comparison and restored guide share the reviewed effect',async()=>{
 const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8'),extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
 const context=vm.createContext({data,e:escape,asset,icon,button,hexAugmentReference,augmentCategories,hexHero:null,hexCategory:'all',hexForHero:false,hexSelectedOnly:false,hexRarity:'all',hexQuery:'',hexSelected:[],hexOptions:[],hexOwned:[],currentHexRound:()=>null,rarityName:{},overlay:{innerHTML:''},picker:null,buildView:null,detailResult:null});
 vm.runInContext(extract('function augmentTiles(){','function renderFavorites(){')+extract('function showAugment(','const recommendationRunner='),context);
 assert.doesNotMatch(context.augmentTiles(),/在命中时、最大距离时/);context.showAugment(2005);assert.match(context.overlay.innerHTML,/冷却：5秒/);
 const comparison=compareAugments({champion,options:[2072,2005],augments:data.augments,patch:data.patch});assert.match(comparison[1].description,/冷却：5秒/);assert.ok(comparison.every(a=>a.review));
 const state={...selectGuide(null,{id:'Ashe',role:'bottom',mode:'hex',augmentIds:[2072],ownedAugmentIds:[2005],compareIds:[]}),compact:false},model=createGuideModel(data,state),html=renderGuide({model},'augments',false,()=>'<img>');
 assert.deepEqual(model.ownedAugments.map(a=>a.id),[2005]);assert.equal(model.comparison.length,0);assert.match(html,/本局已选强化/);assert.match(html,/冷却：5秒/);assert.doesNotMatch(html,/在命中时、最大距离时/);
 const restored=createGuideModel(data,structuredClone(state));assert.deepEqual(restored.ownedAugments,model.ownedAugments);
});

test('owned augments remain distinct from a wish list and preserve unavailable records honestly',()=>{
 const model=createGuideModel(data,{...selectGuide(null,{id:'Ashe',role:'bottom',mode:'hex',augmentIds:[1047],ownedAugmentIds:[2005,999999],compareIds:[]}),compact:false});
 assert.deepEqual(model.augments.map(a=>a.id),[1047]);assert.deepEqual(model.ownedAugments.map(a=>a.id),[2005,999999]);assert.equal(model.ownedAugments[1].status,'missing');
 assert.match(renderGuide({model},'augments',false,()=>'<img>'),/当前资料未收录/);
 const rift=createGuideModel(data,selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift',ownedAugmentIds:[2005]}));assert.deepEqual(rift.ownedAugments,[]);
});

test('on-hit item direction alone is not evidence of a conventional critical-strike build',()=>{
 const vayne=data.champions.find(c=>c.id==='Vayne'),[row]=compareAugments({champion:vayne,options:[1047],augments:data.augments});
 assert.doesNotMatch(row.reasons.join(' '),/常规暴击装备方向/);
});
