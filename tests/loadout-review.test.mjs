import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {BUNDLED_CATALOG,validateCatalog,catalogIssues} from '../src/core/catalog.mjs';
import {getBuild,buildAsText} from '../src/core/builds.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {loadoutSelector} from '../src/build-options-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
data.catalogInfo=catalogIssues(BUNDLED_CATALOG,data);
const hero=id=>data.champions.find(c=>c.id===id);

test('no-immobilize support routes cannot recommend Imperial Mandate from poison, blind or revealed targets',()=>{
 for(const id of ['Nidalee','Teemo']){const build=getBuild(hero(id),'support',data,{loadoutId:'poke-no-immobilize'});assert.equal(build.loadoutId,'poke-no-immobilize');assert.ok(!build.items.some(i=>Number(i.id)===4005));assert.match(build.configurationNote,/不购买它/);assert.ok(build.loadoutOptions.every(l=>![...l.items,...l.late].includes(4005)));}
 const ashe=getBuild(hero('Ashe'),'support',data,{loadoutId:'ashe-utility'});assert.ok(!ashe.items.some(i=>Number(i.id)===4005));assert.match(ashe.configurationNote,/W\/普攻减速不能触发/);
 const nami=getBuild(hero('Nami'),'support',data,{loadoutId:'nami-empower'});assert.ok(!nami.items.slice(0,3).some(i=>Number(i.id)===4005));assert.match(nami.configurationNote,/仅 Q\/R 实际定身可触发/);
});

test('current Galio Nilah Rakan preparations carry actual rationale and primary sources into copied text and guides',()=>{
 const trio=BUNDLED_CATALOG.trios.find(t=>t.id==='galio-nilah-rakan');assert.equal(data.catalogInfo.status[trio.id].stale,false);
 for(const m of trio.members){const build=getBuild(hero(m.champion),m.role,data,{comboId:trio.id});assert.equal(build.loadoutId,m.loadoutId);assert.equal(build.rulesPatch,data.patch);assert.equal(build.stale,false);assert.ok(build.configurationSources.length>=3);assert.match(loadoutSelector(build,data),/本配置的一手依据/);const text=buildAsText(build,hero(m.champion),data);assert.ok(text.includes(build.configurationNote));for(const s of build.configurationSources)assert.ok(text.includes(s.url));const guide=createGuideModel(data,selectGuide(null,{id:m.champion,role:m.role,mode:'rift',comboId:trio.id}),null,{id:m.champion,role:m.role,mode:'rift',comboId:trio.id,comboKnown:true});assert.equal(guide.configurationNote,build.configurationNote);assert.deepEqual(guide.configurationSources,build.configurationSources);}
 const legacy=getBuild(hero('Galio'),'mid',data,{loadoutId:'trio-control-mid'});assert.equal(legacy.loadoutId,'trio-control-mid');assert.ok(!legacy.selectionWarnings.some(w=>w.includes('不适用')));
 const unrelated=BUNDLED_CATALOG.loadouts.find(l=>l.id==='onhit-carry');assert.equal(unrelated.patch,'16.19');assert.equal(data.catalogInfo.loadoutStatus[unrelated.id].stale,true);
 const malformed=structuredClone(BUNDLED_CATALOG);malformed.loadouts[0].sources=[{name:'bad',url:'javascript:alert(1)'}];assert.throws(()=>validateCatalog(malformed,data),/来源格式/);
});
