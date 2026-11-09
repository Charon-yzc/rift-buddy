import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import game from '../data/game.json' with {type:'json'};
import archived from '../src/core/hex-augment-statistics.json' with {type:'json'};
import {hexAugmentStatistics,HEX_AUGMENT_STATISTICS_SOURCE,HEX_AUGMENT_STATISTICS_LICENSE} from '../src/core/hex-augment-statistics.mjs';
import {hexAugmentRankingView} from '../src/hex-draft-view.mjs';
import {safeSourceURL} from '../src/core/catalog.mjs';
import historicalGame from './fixtures/snapshot-16.21/game.json' with {type:'json'};

// Genuine frozen statistics/parser contracts. These inputs retain 16.21 and
// never grant current-patch recommendations or statistical authority.
const historicalStatistics=()=>hexAugmentStatistics(historicalGame);
test('historical parser contract preserves all 229 rows and divides aggregated wins and holdings correctly',()=>{
 const before=JSON.stringify(historicalGame),ref=historicalStatistics();assert(ref);assert.equal(historicalGame.patch,'16.21');assert.equal(ref.patch,historicalGame.patch);assert.notEqual(ref.patch,game.patch);
 assert.equal(ref.rows.length,229);assert.equal(ref.validMatches,5376732);assert.equal(ref.validPlayerAppearances,53767320);
 const row=ref.rows.find(r=>r.id===1134);assert.equal(row.games,767215);assert.equal(row.wins,445157);assert.equal(row.winRate,445157/767215);assert.equal(row.holdingShare,767215/53767320);
 assert(!ref.rows.some(r=>r.id===1337));
 for(const [i,row]of ref.rows.entries()){assert.equal(row.winRate,row.wins/row.games);assert.equal(row.holdingShare,row.games/ref.validPlayerAppearances);if(i)assert(ref.rows[i-1].winRate>=row.winRate);}
 assert.equal(JSON.stringify(historicalGame),before);
});
test('historical parser contract rejects source tampering, incomplete rows, duplicates and inconsistent arithmetic',()=>{
 const ref=historicalStatistics();assert(ref);
 for(const change of [r=>r.patch='16.20',r=>r.sourceCommit='bad',r=>r.sourceDataSHA256='bad',r=>r.attribution='',r=>r.region='global',r=>r.validMatches--,r=>r.validPlayerAppearances--,r=>r.rows[0].wins=r.rows[0].games+1,r=>r.rows[0].winRate=.42,r=>r.rows[0].holdingShare=.5,r=>r.rows[0].games=0,r=>r.rows[0].id=999999,r=>r.rows[1]={...r.rows[0]},r=>r.rows.push({...r.rows[0]}),r=>r.rows.pop()]){
  const copy=structuredClone(ref);change(copy);assert.equal(hexAugmentStatistics({...historicalGame,hexAugmentStats:copy}),null);
 }
 assert.equal(hexAugmentStatistics({...historicalGame,augmentError:'unavailable'}),null);
});
test('historical parser contract returns independent rows with deterministic ties',()=>{
 const copy=structuredClone(historicalStatistics()),a=copy.rows[0],b=copy.rows[1];
 b.wins=a.wins;b.games=a.games;b.winRate=a.winRate;b.holdingShare=a.holdingShare;
 const result=hexAugmentStatistics({...historicalGame,hexAugmentStats:copy});assert(result);
 const tied=result.rows.filter(r=>r.winRate===a.winRate&&r.games===a.games);assert.deepEqual(tied.map(r=>r.id),[a.id,b.id].sort((x,y)=>x-y));
 result.rows[0].name='changed';assert.notEqual(copy.rows.find(r=>r.id===result.rows[0].id).name,'changed');
});
test('historical ranking contract renders every row in rate order with compact attribution and the correct denominator meaning',()=>{
 const stats=historicalStatistics(),html=hexAugmentRankingView(historicalGame);
 const ids=[...html.matchAll(/class="hex-augment-ranking-entry"[^>]*data-id="(\d+)"/g)].map(m=>Number(m[1]));
 assert.equal(ids.length,229);assert.deepEqual(ids,stats.rows.map(r=>r.id));assert.match(html,/结算时持有强化的玩家胜率，不是三选一选择率或可选资格/);assert.match(html,/CC BY-NC 4\.0/);assert.match(html,/data-game-tooltip-compact/);
});
test('old holdings statistics stay absent from current ranking rather than becoming a zero rate or offer chance',()=>{
 const before=JSON.stringify(archived);assert.notEqual(archived.patch,game.patch);assert.equal(hexAugmentStatistics(game),null);assert.equal(hexAugmentStatistics({...game,hexAugmentStats:archived}),null);
 const html=hexAugmentRankingView(game);assert.match(html,/暂无当版统计/);assert.doesNotMatch(html,/hex-augment-ranking-entry|[0-9]+[.][0-9]+%/);assert.equal(JSON.stringify(archived),before);
});
test('external link handler permits the exact statistics source and license without broadening GitHub access',async()=>{
 const source=fs.readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8'),handlers=new Map(),opened=[];
 const start=source.indexOf(" guard('open-link'"),end=source.indexOf(" guard('export-preparation'");assert(start>=0&&end>start);
 vm.runInNewContext(source.slice(start,end),{URL,Error,data:{catalog:{duos:[],trios:[]}},catalogCore:{safeSourceURL},hexCommunitySourceURLs:()=>[],HEX_CHAMPION_SOURCE:'https://aramgg.com/data/champions-stats.json',isReleaseNotesUrl:()=>false,guard:(name,handler)=>handlers.set(name,handler),shell:{openExternal:async value=>opened.push(value)}});
 const open=handlers.get('open-link');await open(HEX_AUGMENT_STATISTICS_SOURCE);await open(HEX_AUGMENT_STATISTICS_LICENSE);
 assert.deepEqual(opened,[HEX_AUGMENT_STATISTICS_SOURCE,HEX_AUGMENT_STATISTICS_LICENSE]);
 for(const url of [HEX_AUGMENT_STATISTICS_SOURCE+'?redirect=elsewhere',HEX_AUGMENT_STATISTICS_SOURCE+'/other',HEX_AUGMENT_STATISTICS_LICENSE+'?x=1','https://github.com.evil.invalid/czgreat/aramhex-data'])await assert.rejects(open(url),/不支持的链接/);
});
