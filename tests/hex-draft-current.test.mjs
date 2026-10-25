import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {hexDraft} from '../src/core/hex-draft.mjs';import {hexDraftProfile,HEX_DRAFT_TRAITS} from '../src/core/hex-draft-profiles.mjs';import {hexDraftView} from '../src/hex-draft-view.mjs';import {mechanicReview} from '../src/core/mechanic-review.mjs';import {pickEligibilityContext} from '../src/core/pick-eligibility.mjs';import {sanitizeSession} from '../services/lcu.mjs';
const offline=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),routes=JSON.parse(await fs.readFile(new URL('./fixtures/hex-routes-16.21.json',import.meta.url))),draft=JSON.parse(await fs.readFile(new URL('./fixtures/hex-draft-16.21.json',import.meta.url))),review=JSON.parse(await fs.readFile(new URL('../src/core/hex-draft-review.json',import.meta.url))),current=[...routes.game.champions,...draft.champions],data={...offline,patch:draft.patch,version:draft.version,champions:offline.champions.map(c=>({...c,...current.find(n=>n.id===c.id)}))};
const client=(team=['Lux','Jhin','Veigar','Sona','Jinx'],bench=['Hecarim','Teemo','Ashe'])=>({connected:true,phase:'ChampSelect',mode:{id:'hex'},session:sanitizeSession({localPlayerCellId:0,myTeam:team.map((id,cellId)=>({cellId,championId:data.champions.find(c=>c.id===id).key})),benchEnabled:true,benchChampions:bench.map(id=>({championId:data.champions.find(c=>c.id===id).key}))})});

test('current public-bench comparison restores reviewed base functions without renewing Rift or using augment routes',()=>{
 const input=client(),before=JSON.stringify({data,input}),model=hexDraft({data,client:input});assert.equal(model.reviewed,true);assert.equal(model.coverage.length,5);assert(model.candidates.every(c=>c.comparable&&!c.pending));assert.equal(model.candidates[0].hero.id,'Hecarim');assert(model.candidates[0].added.includes('补承伤手段'));assert.equal(model.coverage.find(c=>c.label==='保护').count,2);
 assert.equal(hexDraftProfile(data.champions.find(c=>c.id==='Jhin'),data.patch).traits.sustain,true);assert.equal(mechanicReview(data.champions.find(c=>c.id==='Jhin'),data.patch),'pending-review');assert(!HEX_DRAFT_TRAITS.some(([key])=>key==='aoe'));
 for(const row of model.candidates)assert.deepEqual(row.lineup.slice(1).map(p=>p.hero.id),['Jhin','Veigar','Sona','Jinx']);assert.equal(JSON.stringify({data,input}),before);
});

test('uncertain base functions never imply missing capacity or influence add/loss ordering',()=>{
 const c=client(['Karma','Hwei','Annie','Sona','Jhin'],['Hecarim','Trundle']),m=hexDraft({data,client:c}),capacity=m.coverage.find(t=>t.label==='承伤手段');assert.equal(capacity.count,0);assert(capacity.uncertain>0);assert(m.candidates.every(r=>r.comparable&&!r.added.includes('补承伤手段')));
 const html=hexDraftView({data,client:c});assert.match(html,/待核/);assert.doesNotMatch(html,/承伤手段 缺/);assert.match(html,/<details class="hex-party-traits">/);assert.doesNotMatch(html,/<details class="hex-party-traits" open/);
});

test('changed current kit input withdraws only affected claims and keeps the actual public alternatives',()=>{
 for(const id of ['Hecarim','Lux'])for(const change of [c=>c.mechanicSource.character.sha256='0'.repeat(64),c=>c.mechanicSource.spells[0].tooltip+='changed',c=>delete c.mechanicSource]){
  const altered=structuredClone(data);change(altered.champions.find(c=>c.id===id));const m=hexDraft({data:altered,client:client()}),row=m.candidates.find(r=>r.hero.id==='Hecarim');assert.equal(m.candidates.length,3);assert.equal(row.comparable,false);assert.equal(row.priority,0);assert.deepEqual(row.added,[]);assert.deepEqual(row.lost,[]);if(id==='Lux'){assert.equal(m.coverage.length,0);assert(m.candidates.every(r=>!r.comparable));}else assert(m.candidates.some(r=>r.comparable));
 }
 const refreshed=structuredClone(data);refreshed.champions.find(c=>c.id==='Hecarim').mechanicSource.observedAt=new Date().toISOString();assert.deepEqual(hexDraft({data:refreshed,client:client()}).candidates.map(r=>[r.hero.id,r.priority]),hexDraft({data,client:client()}).candidates.map(r=>[r.hero.id,r.priority]));
});

test('a candidate with uncertain functions still exposes independent confirmed additions',()=>{
 const c=client(['Jhin','Brand','Gwen','Jax','Shyvana'],['Karma']),row=hexDraft({data,client:c}).candidates[0];assert.equal(row.comparable,true);assert.equal(row.pending,false);assert.deepEqual(row.added,['补保护']);assert.deepEqual(row.lost,[]);assert(row.evidence.frontline.pending);assert(row.evidence.engage.pending);assert.equal(typeof row.evidence.peel,'string');
});

test('unknown versions, partial teams and unknown heroes cannot produce completed missing-feature claims',()=>{
 const c=client();c.session.myTeam[4].championId=0;const m=hexDraft({data,client:c});assert.equal(m.known,4);assert(m.candidates.every(r=>!r.comparable&&!r.added.length&&!r.lost.length));assert.doesNotMatch(hexDraftView({data,client:c}),/承伤手段 缺/);
 const empty=client();empty.session.myTeam.forEach(p=>p.championId=0);assert.equal(hexDraft({data,client:empty}).reviewed,false);
 const unknown=hexDraft({data:{...data,patch:'99.1'},client:client()});assert.equal(unknown.coverage.length,0);assert(unknown.candidates.every(r=>!r.comparable));
 const future=structuredClone(data);future.champions.find(c=>c.id==='Hecarim').id='FutureHero';assert.equal(hexDraft({data:future,client:client()}).candidates.find(r=>r.hero.id==='FutureHero').comparable,false);
});

test('current availability still limits public bench and same priority retains client order',()=>{
 const c=client(),keys=c.session.bench.championIds;c.eligibility={context:pickEligibilityContext(c.session),localPlayerCellId:0,receivedAt:new Date().toISOString(),pickable:keys,disabled:[keys[0]]};assert.deepEqual(hexDraft({data,client:c}).candidates.map(r=>r.hero.id),['Teemo','Ashe']);c.eligibility.receivedAt=new Date(Date.now()-60000).toISOString();assert.equal(hexDraft({data,client:c}).candidates[0].hero.id,'Hecarim');
});

test('unselected bench heroes expose their own conditions in a separate collapsed disclosure',()=>{
 const c=client(undefined,['Naafiri','Hecarim']),m=hexDraft({data,client:c}),row=m.candidates.find(r=>r.hero.id==='Naafiri');assert(row.added.includes('补承伤手段'));assert.match(row.evidence.frontline,/参与击杀.*重施.*第二次施放才获盾/);assert(!m.evidence.some(p=>p.hero.id==='Naafiri'));
 const html=hexDraftView({data,client:c}),article=[...html.matchAll(/<article class="hex-party-lineup"[\s\S]*?<\/article>/g)].map(r=>r[0]).find(r=>r.includes('data-id="Naafiri"'));assert(article);assert.match(article,/参与击杀.*第二次施放才获盾/);assert.match(article,/<details class="hex-party-traits">/);assert.doesNotMatch(article,/<details[^>]*\sopen(?:\s|>)/);assert.match(article,/data-action="hex-quick-pick"[^>]+data-id="Naafiri"/);
});

test('draft snapshot contains independently scoped source bindings and five-feature three-state evidence for every reviewed hero',()=>{
 const ids=offline.champions.map(c=>c.id).sort();assert.deepEqual(Object.keys(review.champions).sort(),ids);assert.deepEqual(Object.keys(review.sourceAnchors).sort(),ids);assert.deepEqual(Object.keys(review.traits).sort(),ids);assert.equal(review.scope,'hex-public-bench-base-kit');assert.equal(review.patch,'16.21');
 for(const [id,evidence]of Object.entries(review.traits)){assert.deepEqual(Object.keys(evidence).sort(),HEX_DRAFT_TRAITS.map(([key])=>key).sort());for(const value of Object.values(evidence))assert(value===null||typeof value==='string'&&value.trim()||typeof value?.pending==='string'&&value.pending.trim(),id);}
 for(const hero of current)assert(hexDraftProfile(hero,data.patch),hero.id);assert.equal(hexDraftProfile(current.find(c=>c.id==='Kayn'),data.patch).traits.frontline,null);assert.equal(hexDraftProfile(current.find(c=>c.id==='Hwei'),data.patch).traits.peel,true);assert.equal(hexDraftProfile(current.find(c=>c.id==='Shyvana'),data.patch).traits.frontline,true);
});
