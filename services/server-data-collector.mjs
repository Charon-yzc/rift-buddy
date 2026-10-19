import fs from 'node:fs/promises';
import path from 'node:path';
import {collectSnapshot,atomicJSON,loadSnapshot} from './data.mjs';
import {fetchRankings,loadRankings} from './rankings-cache.mjs';
import {fetchChampionBuild} from './build-sources.mjs';
import {fetchHexBuild} from './hex-sources.mjs';
import {loadBuildSources,loadHexBuilds} from './build-cache.mjs';
import {createServerDataFetch} from './server-data-fetch.mjs';
import {contentEqual,validateServerGame,validateServerData,loadServerData,stageServerData} from './server-data-store.mjs';
import {BUILD_REGIONS,BUILD_TIERS,DEFAULT_BUILD_SOURCE,buildSourceKey,sameBuildSource} from '../src/core/build-source.mjs';
import {validReference,validHexReference,compareBuildPatches} from '../src/core/builds.mjs';
import {rankingKey,validRankingReference} from '../src/core/rankings.mjs';
import {defaultBuildJobs} from '../src/core/default-build-jobs.mjs';
import {createGenerationRecipe} from './data-generation.mjs';

const scopes=BUILD_REGIONS.flatMap(region=>BUILD_TIERS.map(tier=>({region:region.id,tier:tier.id})));
const counts=bundle=>Object.fromEntries(['rankings','builds','hex-builds'].map(name=>[name,Object.keys(bundle[name].entries).length]));
const errorText=error=>String(error?.message||error).replace(/[\r\n]/g,' ').slice(0,240);

export async function loadServerSeed(root){
 const game=await loadSnapshot(root);
 const [rankings,builds,hex]=await Promise.all([loadRankings([root],game),loadBuildSources([root],game),loadHexBuilds([root],game)]);
 const bundle={game,rankings:{schema:1,entries:rankings},builds:{schema:2,entries:builds},'hex-builds':{schema:1,entries:hex}};
 validateServerData(bundle);return bundle;
}
function compatibleBundle(previous,game){
 const heroes=new Map(game.champions.map(c=>[c.id,c]));
 return {game,
  rankings:{schema:1,entries:Object.fromEntries(Object.entries(previous.rankings.entries).filter(([,ref])=>validRankingReference(ref,game)))},
  builds:{schema:2,entries:Object.fromEntries(Object.entries(previous.builds.entries).filter(([,ref])=>heroes.has(ref.champion)&&validReference(ref,heroes.get(ref.champion),ref.role,game,{allowOlder:true})))},
  'hex-builds':{schema:1,entries:Object.fromEntries(Object.entries(previous['hex-builds'].entries).filter(([id,ref])=>heroes.has(id)&&validHexReference(ref,heroes.get(id),game,{allowOlder:true})))}};
}
export function serverBuildJobs(bundle,champions=bundle.game.champions){
 return defaultBuildJobs(bundle.game,bundle.rankings.entries,bundle.builds.entries,champions);
}
// Called under an OS-held flock by the deployment. Every refresh keeps source
// patch/scope; a new base patch is held back until all ranking scopes validate.
export async function collectServerData({root,seedRoot,clock=()=>new Date().toISOString(),network=createServerDataFetch(),
 providers={},maxChampions=null,onProgress=()=>{}}){
 if(maxChampions!==null&&(!Number.isInteger(maxChampions)||maxChampions<1))throw Error('采集数量无效');
 const current=await loadServerData(root),previous=current?.bundle||await loadServerSeed(seedRoot);
 let priorStatus={};try{priorStatus=JSON.parse(await fs.readFile(path.join(root,'status.json'),'utf8'));}catch{}
 const status={schema:1,state:'running',startedAt:clock(),checkedAt:null,limited:maxChampions!==null,
  release:current?.pointer.release||null,previousRelease:current?.pointer.release||null,changed:false,datasets:{},network:network.stats()};
 const checkpoint=async()=>{status.network=network.stats();await atomicJSON(path.join(root,'status.json'),status);await onProgress(status);};
 const begin=(name,total)=>{
  const prior=priorStatus.datasets?.[name]||{};
  return status.datasets[name]={state:'running',total,checked:0,changed:0,failed:0,skipped:0,errors:[],
   checkedAt:null,lastCompleteAt:prior.lastCompleteAt||null,changedAt:prior.changedAt||null};
 };
 const fail=(state,key,error)=>{state.failed++;if(state.errors.length<12)state.errors.push({key,message:errorText(error)});};
 const finish=state=>{state.checkedAt=clock();state.state=state.failed||state.skipped?'partial':'ok';if(state.state==='ok')state.lastCompleteAt=state.checkedAt;if(state.changed)state.changedAt=state.checkedAt;};
 await checkpoint();
 const base=begin('game',1);let game=previous.game;await checkpoint();
 try{
  base.checked++;
  const candidate=await (providers.game||collectSnapshot)(()=>{},game,{readJSON:network.readJSON,recheckVersion:true});
  validateServerGame(candidate);
  const next=candidate.version.split('.').map(Number),old=game.version.split('.').map(Number);
  if((next[0]-old[0]||next[1]-old[1]||next[2]-old[2])<0||candidate.contentRevision<game.contentRevision)throw Error('拒绝基础资料版本回退');
  if(!contentEqual(game,candidate)){game=candidate;base.changed++;}
 }catch(error){fail(base,'game',error);}
 finish(base);
 const bundle=compatibleBundle(previous,game);await checkpoint();
 const rankings=begin('rankings',scopes.length);await checkpoint();
 for(const source of scopes){
  const key=rankingKey(game.patch,source);rankings.checked++;
  try{
   const ref=await (providers.rankings||fetchRankings)(game,source,{fetcher:network.fetcher,clock}),old=bundle.rankings.entries[key];
   if(ref.key!==key||!validRankingReference(ref,game))throw Error('排行榜版本、地域或段位不匹配');
   if(old&&Date.parse(ref.analyzedAt)<Date.parse(old.analyzedAt))throw Error('来源统计时间倒退，保留较新的统计');
   if(!contentEqual(ref,old)){bundle.rankings.entries[key]=ref;rankings.changed++;}
  }catch(error){fail(rankings,key,error);if(['SOURCE_PAUSED','ROUND_LIMIT'].includes(error.code)){rankings.skipped=scopes.length-rankings.checked;break;}}
 }
 finish(rankings);await checkpoint();
 const champions=game.champions.slice(0,maxChampions??game.champions.length),allJobs=serverBuildJobs(bundle),jobs=allJobs.filter(job=>champions.includes(job.champion)),totalJobs=allJobs.length,builds=begin('builds',totalJobs);
 try{status.generationRecipe=createGenerationRecipe(bundle,allJobs);}catch(error){status.generationError=errorText(error);}await checkpoint();
 for(const {champion,role} of jobs){
  const key=buildSourceKey(champion.id,role,DEFAULT_BUILD_SOURCE,game.patch);builds.checked++;
  try{
   const ref=await (providers.builds||fetchChampionBuild)(champion,role,game,{fetcher:network.fetcher,jsonOnly:true,...DEFAULT_BUILD_SOURCE});
   if(ref.patch!==game.patch||!sameBuildSource(ref,DEFAULT_BUILD_SOURCE)||!validReference(ref,champion,role,game))throw Error('出装版本、位置或来源不匹配');
   if(!contentEqual(ref,bundle.builds.entries[key])){bundle.builds.entries[key]=ref;builds.changed++;}
  }catch(error){fail(builds,champion.id+':'+role,error);if(['SOURCE_PAUSED','ROUND_LIMIT'].includes(error.code)){builds.skipped=jobs.length-builds.checked;break;}}
  if(builds.checked%25===0)await checkpoint();
 }
 if(maxChampions!==null)builds.skipped+=Math.max(0,totalJobs-jobs.length);
 finish(builds);await checkpoint();
 const hex=begin('hex-builds',game.champions.length);await checkpoint();
 for(const champion of champions){
  hex.checked++;
  try{
   const ref=await (providers.hex||fetchHexBuild)(champion,game,{fetcher:network.fetcher});
   if(ref.patch!==game.patch||!validHexReference(ref,champion,game))throw Error('海克斯资料版本或英雄不匹配');
   const old=bundle['hex-builds'].entries[champion.id];
   if(old&&compareBuildPatches(ref.patch,old.patch)<0)throw Error('拒绝海克斯资料版本回退');
   if(!contentEqual(ref,old)){bundle['hex-builds'].entries[champion.id]=ref;hex.changed++;}
  }catch(error){fail(hex,champion.id,error);if(['SOURCE_PAUSED','ROUND_LIMIT'].includes(error.code)){hex.skipped=champions.length-hex.checked;break;}}
  if(hex.checked%25===0)await checkpoint();
 }
 if(maxChampions!==null)hex.skipped+=Math.max(0,game.champions.length-champions.length);
 finish(hex);
 try{
  const result=await stageServerData(root,bundle,{expectedRelease:current?.pointer.release||null,clock});
  status.release=result.pointer.release;status.changed=result.changed;status.coverage=counts(result.bundle);
  status.state=maxChampions!==null||status.generationError||Object.values(status.datasets).some(state=>state.state!=='ok')?'partial':'ok';
 }catch(error){status.state='failed';status.error=errorText(error);}
 status.checkedAt=clock();await checkpoint();return status;
}
