// One-time offline migration. Collection and application startup never call it.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {catalogIssues,validateCatalog} from '../src/core/catalog.mjs';
import {reviewBaseline,reviewSourceAnchors,fingerprint} from '../src/core/catalog-review.mjs';
import {captureMechanicSourceAnchor,mechanicSourceInput} from '../src/core/mechanic-source.mjs';

export function migrateMechanicSourceAnchors(previous,candidate,baseline,catalog){
 assert.equal(baseline.schema,1,'This migration must never replace an existing source anchor');
 assert.equal(previous.patch,baseline.patch);assert.equal(candidate.patch,previous.patch);assert.equal(candidate.version,previous.version);
 assert.equal(previous.mechanicSourceRevision,undefined);assert.equal(candidate.mechanicSourceRevision,1);
 const metadata=({champions,contentRevision,mechanicSourceRevision,...rest})=>rest;
 assert.deepEqual(metadata(candidate),metadata(previous),'Source capture must not renew statistics or other content dates');
 assert.equal(candidate.champions.length,previous.champions.length);
 const oldHeroes=new Map(previous.champions.map(hero=>[hero.id,hero]));
 const sourceAnchors={};
 for(const hero of candidate.champions){
  const old=oldHeroes.get(hero.id),legacy=fingerprint({stats:hero.stats,mechanics:hero.mechanics});
  assert(old&&mechanicSourceInput(hero,candidate.patch),'Every source must be complete and bound to its champion');
  const {mechanicSource,...summary}=hero;assert.deepEqual(summary,old,'The migration only adds source monitoring');
  assert.equal(legacy,fingerprint({stats:old.stats,mechanics:old.mechanics}),'Do not migrate changed legacy summaries');
  assert.equal(legacy,baseline.champions[hero.id],'Do not promote a previously pending rule');
  sourceAnchors[hero.id]=captureMechanicSourceAnchor(hero,candidate.patch,legacy,{kind:'migration-anchor'});
 }
 assert.equal(Object.keys(sourceAnchors).length,previous.champions.length);
 const before=catalogIssues(catalog,previous),next=structuredClone(catalog),anchored={};
 for(const [kind,statusKey]of [['loadouts','loadoutStatus'],['skillPlans','skillPlanStatus'],['duos','status'],['trios','status']]){
  anchored[kind]=[];
  for(const entry of next[kind]||[]){
   assert.equal(entry.reviewSourceAnchors,undefined,'Do not replace existing catalogue anchors');
   const status=before[statusKey][entry.id],current=reviewBaseline(entry,catalog,candidate);
   if(!status||status.stale||status.invalid||!entry.reviewBaseline||fingerprint(current)!==fingerprint(entry.reviewBaseline))continue;
   entry.reviewSourceAnchors=reviewSourceAnchors(entry,catalog,candidate,{kind:'migration-anchor'});anchored[kind].push(entry.id);
  }
 }
 validateCatalog(next,candidate);const after=catalogIssues(next,candidate);
 for(const key of ['status','loadoutStatus','skillPlanStatus'])for(const [id,status]of Object.entries(before[key])){
  if(status.stale||status.invalid)assert(after[key][id].stale||after[key][id].invalid,'A prior pending/invalid record must never be promoted');
 }
 return {game:structuredClone(candidate),baseline:{...structuredClone(baseline),schema:2,sourceAnchors},catalog:next,report:{patch:candidate.patch,sourceCount:Object.keys(sourceAnchors).length,coverage:'summary-v1',anchored,reviewDatesPreserved:true,previouslyPendingPromoted:0,statisticsFreshnessUnchanged:candidate.fetchedAt===previous.fetchedAt}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2),candidatePath=args[args.indexOf('--candidate')+1],output=args[args.indexOf('--output')+1];
 if(!args.includes('--candidate')||!args.includes('--output')||!candidatePath||!output)throw Error('Use --candidate <captured-game.json> --output <new-directory>');
 const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
 const result=migrateMechanicSourceAnchors(await read('data/game.json'),await read(candidatePath),await read('src/core/cooperation-baseline.json'),await read('src/core/catalog-data.json'));
 await fs.mkdir(output,{recursive:false});
 for(const [key,value]of Object.entries(result))await fs.writeFile(path.join(output,key+'.json'),JSON.stringify(value));
 console.log(JSON.stringify(result.report));
}
