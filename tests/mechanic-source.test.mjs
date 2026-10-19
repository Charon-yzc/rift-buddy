import test from 'node:test';
import assert from 'node:assert/strict';
import {characterSourceRecord,captureChampionMechanicSource} from '../services/champion-mechanics.mjs';
import {mechanicSourceInput,captureMechanicSourceAnchor,mechanicSourceMatches,validMechanicSourceAnchor} from '../src/core/mechanic-source.mjs';
import {reviewBaseline,reviewSourceAnchors,dependencyChanges,fingerprint} from '../src/core/catalog-review.mjs';
import {mechanicReview} from '../src/core/mechanic-review.mjs';

const patch='16.20',version='16.20.1',observedAt='2026-10-19T00:00:00Z';
const raw={character:{stats:{health:630},spell:{range:800,WmAmmoRechargeTime:20,unknownFutureField:[1,2]}}};
function fixture(){
 const champion={id:'Ivern',stats:{hp:630},mechanics:{spells:[{key:'W',description:'种草'}]},characterSource:characterSourceRecord(raw,patch,'Ivern'),passive:{name:'森林之友',description:'解救野怪'},spells:['Q','W','E','R'].map(id=>({id,description:id,tooltip:'范围 {{ castrange }}',range:[800],effect:[null,[1,2]],maxrank:id==='R'?3:5}))};
 champion.mechanicSource=captureChampionMechanicSource(champion,patch,version,observedAt);
 const catalog={loadouts:[],runes:{}},entry={champion:'Ivern'},data={patch,mechanicSourceRevision:1,champions:[champion],runes:[]};
 entry.reviewBaseline=reviewBaseline(entry,catalog,data);entry.reviewSourceAnchors=reviewSourceAnchors(entry,catalog,data,{kind:'migration-anchor'});
 const legacy=entry.reviewBaseline['champion:Ivern'],baseline={schema:2,patch,champions:{Ivern:legacy},sourceAnchors:entry.reviewSourceAnchors};
 return {champion,catalog,entry,data,legacy,baseline};
}
function assertPending(f){
 assert.equal(mechanicReview(f.champion,patch,f.baseline),'pending-review');
 assert.equal(dependencyChanges(f.entry,f.catalog,f.data).some(row=>row.id==='Ivern'),true);
}
test('source monitoring retains the original summary review and captures a fixed dated anchor',()=>{
 const f=fixture(),anchor=f.entry.reviewSourceAnchors.Ivern;
 assert.equal(anchor.kind,'migration-anchor');assert.equal(anchor.reviewCoverage,'summary-v1');assert.equal(anchor.observedAt,observedAt);
 assert.equal(anchor.legacyFingerprint,f.legacy);assert(validMechanicSourceAnchor(anchor));
 assert.equal(mechanicReview(f.champion,patch,f.baseline),'current');assert.deepEqual(dependencyChanges(f.entry,f.catalog,f.data),[]);
 assert.equal(f.legacy,fingerprint({stats:f.champion.stats,mechanics:f.champion.mechanics}));
});
for(const [label,mutate]of [
 ['charge-only character change',f=>{const changed=structuredClone(raw);changed.character.spell.WmAmmoRechargeTime=19;f.champion.mechanicSource.character=characterSourceRecord(changed,patch,'Ivern');}],
 ['unknown character field change',f=>{const changed=structuredClone(raw);changed.character.spell.unknownFutureField.push(3);f.champion.mechanicSource.character=characterSourceRecord(changed,patch,'Ivern');}],
 ['Data Dragon range-only change',f=>{f.champion.mechanicSource.spells[0].range=[900];}],
 ['Data Dragon tooltip-only change',f=>{f.champion.mechanicSource.spells[1].tooltip+=' 热修';}],
 ['Data Dragon effect-only change',f=>{f.champion.mechanicSource.spells[2].effect[1][0]=4;}],
 ['Data Dragon passive-only change',f=>{f.champion.mechanicSource.passive.description+=' 热修';}]
])test(label+' invalidates both gates without renewing the review',()=>{
 const f=fixture(),before=structuredClone(f.entry);mutate(f);assertPending(f);assert.deepEqual(f.entry,before);
 assert.equal(reviewBaseline(f.entry,f.catalog,f.data)['champion:Ivern'],f.legacy,'The formerly invisible change leaves summary-v1 unchanged');
});
test('key ordering and transport observation times do not invent a semantic change',()=>{
 const f=fixture(),reordered={character:{spell:{unknownFutureField:[1,2],WmAmmoRechargeTime:20,range:800},stats:{health:630}}};
 assert.deepEqual(characterSourceRecord(reordered,patch,'Ivern'),characterSourceRecord(raw,patch,'Ivern'));
 f.champion.mechanicSource.character={...characterSourceRecord(reordered,patch,'Ivern'),checkedAt:'2026-10-20T00:00:00Z'};
 f.champion.mechanicSource.observedAt='2026-10-20T00:00:00Z';
 assert(mechanicSourceMatches(f.champion,patch,f.entry.reviewSourceAnchors.Ivern,f.legacy));
});
for(const [label,mutate]of [
 ['missing source',f=>{delete f.champion.mechanicSource;}],
 ['unknown source schema',f=>{f.champion.mechanicSource.schema=2;}],
 ['unknown normalizer',f=>{f.champion.mechanicSource.normalizer=2;}],
 ['other hero',f=>{f.champion.mechanicSource.champion='Ahri';}],
 ['other patch',f=>{f.champion.mechanicSource.patch='16.21';}],
 ['other locale',f=>{f.champion.mechanicSource.locale='en_US';}],
 ['other host',f=>{f.champion.mechanicSource.character.url='https://example.com/ivern.json';}],
 ['incomplete spells',f=>{f.champion.mechanicSource.spells.pop();}],
 ['invalid spell rank',f=>{f.champion.mechanicSource.spells[0].maxrank=0;}],
 ['missing anchor',f=>{delete f.entry.reviewSourceAnchors.Ivern;delete f.baseline.sourceAnchors.Ivern;}],
 ['unknown anchor schema',f=>{f.entry.reviewSourceAnchors.Ivern.schema=2;}]
])test(label+' requires review rather than qualifying automatically',()=>{const f=fixture();mutate(f);assertPending(f);});
test('a source anchor never promotes a mismatched original summary review',()=>{
 const f=fixture();f.champion.mechanics.spells[0].description+=' 改动';assertPending(f);
 assert.equal(mechanicReview(f.champion,'16.21',f.baseline),'pending-review');
});
test('unknown dataset revisions and unanchored legacy imports cannot bypass source review',()=>{
 const f=fixture();f.data.mechanicSourceRevision=2;assert(dependencyChanges(f.entry,f.catalog,f.data).length);
 delete f.data.mechanicSourceRevision;delete f.entry.reviewSourceAnchors;assert(dependencyChanges(f.entry,f.catalog,f.data).length);
});
test('collection rejects incomplete sources and cannot mutate a previous accepted input',()=>{
 const f=fixture(),previous=structuredClone(f.champion.mechanicSource);f.champion.spells.pop();
 assert.throws(()=>captureChampionMechanicSource(f.champion,patch,version,'2026-10-20T00:00:00Z'),/不完整/);
 assert.deepEqual(f.champion.mechanicSource,previous);assert.equal(mechanicSourceInput(f.champion,patch).champion,'Ivern');
});
test('only a new explicit review captures changed input; the old anchor remains fixed',()=>{
 const f=fixture(),before=structuredClone(f.entry.reviewSourceAnchors.Ivern);f.champion.mechanicSource.spells[0].range=[900];
 assertPending(f);const reviewed=captureMechanicSourceAnchor(f.champion,patch,f.legacy);
 assert.equal(reviewed.kind,'explicit-review');assert(mechanicSourceMatches(f.champion,patch,reviewed,f.legacy));assert.deepEqual(f.entry.reviewSourceAnchors.Ivern,before);
});
