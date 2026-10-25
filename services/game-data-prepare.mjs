import fs from 'node:fs/promises';
import path from 'node:path';
import {loadBuildSources,loadHexBuilds} from './build-cache.mjs';
import {loadOpponentBuildSources} from './opponent-build-cache.mjs';
import {loadPairStatisticsCache} from './pair-statistics-cache.mjs';
import {loadRankings} from './rankings-cache.mjs';
import {loadPatchNotes} from './patch-notes.mjs';
import {loadAbilities} from './abilities.mjs';
import * as imageCache from './image-cache.mjs';
import {applyFeedBundle,feedHash} from './data-feed.mjs';
import {pureGameSnapshot,generationBaseIdentity} from './data-generation.mjs';
import {validSnapshot} from './data.mjs';
import {validReference,validHexReference,compareBuildPatches} from '../src/core/builds.mjs';
import {validRankingReference,newerRanking} from '../src/core/rankings.mjs';
import {buildSourceKey,preferBuildReference,selectBuildSource} from '../src/core/build-source.mjs';
import {validateCatalog} from '../src/core/catalog.mjs';
import {mergeHexPoolEvidence} from '../src/core/hex-pool-evidence.mjs';

export async function readManualBase(root){
 try{const bytes=await fs.readFile(path.join(root,'game.json'));const game=JSON.parse(bytes);if(!validSnapshot(game))return null;return {token:feedHash(bytes),version:game.version,baseHash:generationBaseIdentity(game)};}catch{return null;}
}

// All derived data and catalog issues are prepared without changing global
// rules or current references. The owner performs the final phase/context gate.
export async function createGameDataPreparer({bundleRoot,localRoot,catalogSummary,buildSource=()=>undefined,progress=()=>{},images=imageCache}){
 const bundled=JSON.parse(await fs.readFile(path.join(bundleRoot,'game.json'),'utf8')),bundledIdentity=generationBaseIdentity(bundled);
 const bundledAbilities=await loadAbilities(bundleRoot,bundled),bundledImages=new Map(images.imageEntries({...bundled,abilityReference:bundledAbilities}));
 let spellbook={};try{const file=JSON.parse(await fs.readFile(path.join(bundleRoot,'spells.json'),'utf8'));if(file.version===bundled.version)spellbook=file.champions||{};}catch{}
 return async function prepare(game,{current={},restore=false,bundle=null,manifest=null}={}){
  const next=pureGameSnapshot(game),heroes=new Map(next.champions.map(c=>[c.id,c]));if(!validSnapshot(next))throw Error('准备的基础资料不完整');
  const roots=[bundleRoot,localRoot];
  [next.buildSources,next.opponentBuildSources,next.pairStatistics,next.rankings,next.patchNotes,next.hexBuilds]=await Promise.all([
   loadBuildSources(roots,next),loadOpponentBuildSources(localRoot,next),loadPairStatisticsCache([path.join(bundleRoot,'pair-statistics.json'),path.join(localRoot,'pair-statistics-cache.json')],next),loadRankings(roots,next),loadPatchNotes(bundleRoot,next),loadHexBuilds(roots,next),
  ]);
  // Previously verified in-memory references can be newer than their unsigned
  // disk projections, including signed recheck metadata. Validate each scope.
  for(const [key,ref] of Object.entries(current.buildSources||{}))if(heroes.has(ref.champion)&&key===buildSourceKey(ref.champion,ref.role,ref,ref.patch)&&ref.scope===undefined&&ref.opponent===undefined&&validReference(ref,heroes.get(ref.champion),ref.role,next,{allowOlder:true})&&preferBuildReference(ref,next.buildSources[key]))next.buildSources[key]=ref;
  for(const [key,ref] of Object.entries(current.rankings||{}))if(key===ref.key&&validRankingReference(ref,next)&&newerRanking(ref,next.rankings[key]))next.rankings[key]=ref;
  for(const [key,ref] of Object.entries(current.hexBuilds||{})){
   const prior=next.hexBuilds[key],order=prior?compareBuildPatches(ref.patch,prior.patch):1;
   if(heroes.has(key)&&validHexReference(ref,heroes.get(key),next,{allowOlder:true})){
    if(!prior||order>0||order===0&&Date.parse(ref.fetchedAt)>Date.parse(prior.fetchedAt))next.hexBuilds[key]=mergeHexPoolEvidence(ref,prior);
    else if(order===0)next.hexBuilds[key]=mergeHexPoolEvidence(prior,ref);
   }
  }
  selectBuildSource(next,buildSource()||current.buildSource);
  if(bundle)applyFeedBundle(next,bundle,manifest);
  const identity=generationBaseIdentity(next),matchesBundle=identity===bundledIdentity;
  // Version alone cannot authenticate values against a same-version hotfix.
  next.abilityReference=matchesBundle?bundledAbilities:null;next.spellbook=matchesBundle?spellbook:{};
  const imageRoot=path.join(localRoot,'images','generations',identity),entries=images.imageEntries(next),bundledKeys=new Set(entries.filter(([key,url])=>bundledImages.get(key)===url).map(([key])=>key));
  const cached=restore?{overrides:await images.loadImageOverrides(imageRoot,next),saved:0,failed:0}:await images.cacheMissingImages({root:imageRoot,bundleRoot:path.join(bundleRoot,'images'),data:next,bundledKeys,progress});
  next.imageOverrides={...Object.fromEntries(entries.filter(([key])=>!bundledKeys.has(key))),...cached.overrides};
  const summary=catalogSummary(next);next.catalog=validateCatalog(summary.catalog);next.catalogInfo=summary.info;
  next.communityHexRoutes=current.patch===next.patch?current.communityHexRoutes||null:null;
  return {data:next,imageCache:{saved:cached.saved,failed:cached.failed}};
 };
}
