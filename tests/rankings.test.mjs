import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {rankingKey,rankingReference,rankingURL,validRankingReference,parseRankings,RANKING_ROLES} from '../src/core/rankings.mjs';
import {createRankingsCache,loadRankings} from '../services/rankings-cache.mjs';
import {rankingRows,rankingsView} from '../src/rankings-view.mjs';
const game=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url)));
const bundled=JSON.parse(await fs.readFile(new URL('../data/rankings.json',import.meta.url)));
const source={region:'global',tier:'emerald_plus'},key=rankingKey(game.patch,source),ref=bundled.entries[key];
function rawFor(reference=ref){
 const names=Object.fromEntries(Object.entries(RANKING_ROLES).map(([key,value])=>[value,key]));
 return {meta:{version:reference.patch,analyzed_at:reference.analyzedAt,match_count:reference.totalMatches},data:game.champions.map(hero=>({id:hero.key,positions:Object.entries(reference.boards).flatMap(([role,rows])=>rows.filter(r=>r.champion===hero.id).map(r=>({name:names[role],stats:{play:r.samples,win_rate:r.winRate,pick_rate:r.pickRate,ban_rate:r.banRate,role_rate:r.roleRate,tier_data:{tier:r.tier,rank:r.rank,rank_prev_patch:r.previousPatchRank}},counters:[]})))}))};
}
const response=raw=>async()=>({ok:true,text:async()=>JSON.stringify(raw)});
test('bundled six sources contain valid complete five-role aggregates and preserve source tier zero',()=>{
 assert.equal(Object.keys(bundled.entries).length,6);
 for(const [key,entry] of Object.entries(bundled.entries)){assert.equal(key,rankingKey(game.patch,entry));assert.ok(validRankingReference(entry,game),key);assert.equal(Object.keys(entry.boards).length,5);}
 assert.ok(Object.values(ref.boards).flat().some(row=>row.tier===0));
 assert.deepEqual(Object.values(ref.boards).map(rows=>rows.length),[63,60,56,39,49]);
 assert.ok(validRankingReference(parseRankings(rawFor(),{data:game,source}),game));
});
test('wrong patch, URL scope, incomplete roster and invalid statistical values cannot become a reference',()=>{
 const raw=rawFor();raw.meta.version='16.19';assert.throws(()=>parseRankings(raw,{data:game,source}),/版本/);
 assert.throws(()=>parseRankings(rawFor(),{data:game,source,requestURL:rankingURL(game.patch,{region:'kr',tier:'emerald_plus'})}),/身份/);
 const missing=rawFor();missing.data.pop();assert.throws(()=>parseRankings(missing,{data:game,source}),/清单/);
 const corrupt=rawFor();corrupt.data.find(r=>r.positions.length).positions[0].stats.win_rate=1.5;assert.throws(()=>parseRankings(corrupt,{data:game,source}),/数值/);
 const duplicate=rawFor();const hero=duplicate.data.find(r=>r.positions.length);hero.positions.push(hero.positions[0]);assert.throws(()=>parseRankings(duplicate,{data:game,source}),/重复/);
 const saved=structuredClone(ref);saved.boards.top[0].samples=-1;assert.equal(validRankingReference(saved,game),false);
});
test('failed refresh retains its own last valid scope and does not substitute a different region',async()=>{
 const data={...game,rankings:{[key]:ref}},refresh=createRankingsCache({root:'unused',getData:()=>data,fetcher:async()=>{throw Error('offline');}});
 const cached=await refresh(source);assert.equal(cached.reference,ref);assert.equal(cached.usedLastValid,true);assert.match(cached.refreshError,/offline/);
 const missing=await refresh({region:'kr',tier:'emerald_plus'});assert.equal(missing.reference,null);assert.equal(missing.usedLastValid,false);assert.deepEqual(data.rankings,{[key]:ref});
});
test('invalid response and failed atomic persistence leave previous rankings intact',async()=>{
 const data={...game,rankings:{[key]:ref}},raw=rawFor();raw.data.find(r=>r.positions.length).positions[0].stats.ban_rate=-1;
 const invalid=createRankingsCache({root:'unused',getData:()=>data,fetcher:response(raw)});assert.ok((await invalid(source)).refreshError);assert.equal(data.rankings[key],ref);
 const newer=rawFor();newer.meta.analyzed_at='2026-10-13T12:00:00Z';
 const failure=createRankingsCache({root:'unused',getData:()=>data,fetcher:response(newer),write:async()=>{throw Error('disk full');}});
 assert.match((await failure(source)).refreshError,/disk full/);assert.equal(data.rankings[key],ref);
});
test('successful refresh survives restart, concurrent scopes merge and a same-scope request is shared',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-rankings-'));
 try{
  const data={...game,rankings:{}},raw=rawFor();raw.meta.analyzed_at='2026-10-13T12:00:00Z';let calls=0;
  const refresh=createRankingsCache({root,getData:()=>data,fetcher:async()=>{calls++;await new Promise(r=>setTimeout(r,10));return {ok:true,text:async()=>JSON.stringify(raw)};}});
  const first=refresh(source),same=refresh(source),other=refresh({region:'kr',tier:'diamond_plus'});assert.equal(first,same);
  const results=await Promise.all([first,other]);assert.ok(results.every(r=>!r.refreshError));assert.equal(calls,2);
  const restarted=await loadRankings([root],game);assert.equal(Object.keys(restarted).length,2);assert.ok(rankingReference({...game,rankings:restarted},source));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('version changes during fetch or persistence never publish rankings into a newer snapshot',async()=>{
 let data={...game,rankings:{[key]:ref}};const raw=rawFor();raw.meta.analyzed_at='2026-10-13T12:00:00Z';
 const refresh=createRankingsCache({root:'unused',getData:()=>data,fetcher:async()=>{data={...game,patch:'16.21',rankings:{}};return {ok:true,text:async()=>JSON.stringify(raw)};}});
 assert.equal((await refresh(source)).reference,null);assert.deepEqual(data.rankings,{});
 data={...game,rankings:{[key]:ref}};
 const delayed=createRankingsCache({root:'unused',getData:()=>data,fetcher:response(raw),write:async()=>{data={...game,patch:'16.21',rankings:{}};}});
 assert.ok((await delayed(source)).refreshError);assert.deepEqual(data.rankings,{});
});
test('outdated analysis cannot replace a newer cached analysis just because fetched later',async()=>{
 const data={...game,rankings:{[key]:ref}},raw=rawFor();raw.meta.analyzed_at='2026-10-01T12:00:00Z';let writes=0;
 const refresh=createRankingsCache({root:'unused',getData:()=>data,fetcher:response(raw),write:async()=>{writes++;}});
 assert.equal((await refresh(source)).reference,ref);assert.equal(writes,0);
});
test('ranking search covers aliases and sorting retains real samples; compact rows expose explicit configuration actions',()=>{
 const data={...game,rankings:bundled.entries};
 assert.ok(rankingRows(data,{source,role:'mid',query:'Ahri'}).some(r=>r.champion==='Ahri'));
 const rows=rankingRows(data,{source,role:'top',sort:'winRate'});assert.ok(rows.every((r,i)=>i===0||rows[i-1].winRate>=r.winRate));
 const html=rankingsView(data,{source,role:'mid',compact:true,heroAction:()=>({label:'预选并配置'})});assert.match(html,/data-action="ranking-hero"/);assert.match(html,/预选并配置/);assert.match(html,/不代表国服/);
});
