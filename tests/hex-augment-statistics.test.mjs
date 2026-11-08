// Frozen 16.21 acceptance contract; tests/hex-live-bundle.test.mjs covers the actual current bundle.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {hexAugmentStatistics,HEX_AUGMENT_STATISTICS_SOURCE,HEX_AUGMENT_STATISTICS_LICENSE} from '../src/core/hex-augment-statistics.mjs';
import {hexAugmentRankingView} from '../src/hex-draft-view.mjs';
import {safeSourceURL} from '../src/core/catalog.mjs';

const game=JSON.parse(fs.readFileSync(new URL('./fixtures/snapshot-16.21/game.json',import.meta.url)));
const actual=()=>hexAugmentStatistics(game);
test('fixed source aggregates wins and holdings and leaves uncovered augments absent',()=>{
 const ref=actual();assert(ref);assert.equal(ref.rows.length,229);assert.equal(ref.validMatches,5376732);assert.equal(ref.validPlayerAppearances,53767320);
 const row=ref.rows.find(r=>r.id===1134);assert.equal(row.games,767215);assert.equal(row.wins,445157);assert.equal(row.winRate,445157/767215);assert.equal(row.holdingShare,767215/53767320);
 assert(!ref.rows.some(r=>r.id===1337));assert(ref.rows.every((r,i)=>i===0||ref.rows[i-1].winRate>=r.winRate));
});
test('snapshot is withdrawn on stale game or malformed source, duplicate and arithmetic',()=>{
 const ref=actual();
 for(const change of [r=>r.patch='16.20',r=>r.sourceCommit='bad',r=>r.attribution='',r=>r.region='global',r=>r.validMatches--,r=>r.rows[0].wins=r.rows[0].games+1,r=>r.rows[0].winRate=.42,r=>r.rows[0].holdingShare=.5,r=>r.rows[0].id=999999,r=>r.rows[1]={...r.rows[0]},r=>r.rows.push({...r.rows[0]}),r=>r.rows.pop()]){
  const copy=structuredClone(ref);change(copy);assert.equal(hexAugmentStatistics({...game,hexAugmentStats:copy}),null);
 }
 assert.equal(hexAugmentStatistics({...game,version:'16.22.1',patch:'16.22'}),null);
 assert.equal(hexAugmentStatistics({...game,augmentError:'unavailable'}),null);
});
test('returned rows are independent and tie order is deterministic',()=>{
 const ref=actual(),copy=structuredClone(ref),a=copy.rows[0],b=copy.rows[1];
 b.wins=a.wins;b.games=a.games;b.winRate=a.winRate;b.holdingShare=a.holdingShare;
 const result=hexAugmentStatistics({...game,hexAugmentStats:copy});assert(result);const tied=result.rows.filter(r=>r.winRate===a.winRate&&r.games===a.games);assert.deepEqual(tied.map(r=>r.id),[a.id,b.id].sort((x,y)=>x-y));
 result.rows[0].name='changed';assert.notEqual(copy.rows.find(r=>r.id===result.rows[0].id).name,'changed');
});

test('compact ranking displays current holdings with attribution and never treats missing rows as zero',()=>{
 const html=hexAugmentRankingView(game);
 assert.equal((html.match(/class="hex-augment-ranking-entry"/g)||[]).length,229);
 assert.match(html,/结算时持有强化的玩家胜率，不是三选一选择率或可选资格/);
 assert.match(html,/CC BY-NC 4\.0/);
 assert.match(html,/data-game-tooltip-compact/);
 assert.match(html,new RegExp(actual().rows[0].id+''));
 assert.match(hexAugmentRankingView({...game,patch:'16.22',version:'16.22.1'}),/暂无当版统计/);
});

test('external link handler permits the exact statistics source and license without broadening GitHub access',async()=>{
 const source=fs.readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8'),handlers=new Map(),opened=[];
 const start=source.indexOf(" guard('open-link'"),end=source.indexOf(" guard('export-preparation'");assert(start>=0&&end>start);
 vm.runInNewContext(source.slice(start,end),{URL,Error,data:{catalog:{duos:[],trios:[]}},catalogCore:{safeSourceURL},hexCommunitySourceURLs:()=>[],HEX_CHAMPION_SOURCE:'https://aramgg.com/data/champions-stats.json',isReleaseNotesUrl:()=>false,guard:(name,handler)=>handlers.set(name,handler),shell:{openExternal:async value=>opened.push(value)}});
 const open=handlers.get('open-link');await open(HEX_AUGMENT_STATISTICS_SOURCE);await open(HEX_AUGMENT_STATISTICS_LICENSE);
 assert.deepEqual(opened,[HEX_AUGMENT_STATISTICS_SOURCE,HEX_AUGMENT_STATISTICS_LICENSE]);
 for(const url of [HEX_AUGMENT_STATISTICS_SOURCE+'?redirect=elsewhere',HEX_AUGMENT_STATISTICS_SOURCE+'/other',HEX_AUGMENT_STATISTICS_LICENSE+'?x=1','https://github.com.evil.invalid/czgreat/aramhex-data'])await assert.rejects(open(url),/不支持的链接/);
});
