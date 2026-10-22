import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {buildAugmentDescriptions} from '../services/augments.mjs';
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/hex-value-identities-16.21.json',import.meta.url))),game=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url)));
test('six exact current source records resolve hashed aliases while keeping runtime counters and unsupported formulas unknown',()=>{
 const before=structuredClone(fixture),rows=buildAugmentDescriptions(fixture.catalog,fixture.bin,fixture.entries),by=id=>rows.find(a=>a.id===id);
 assert.equal(fixture.source.binSha256,'e1ed4bfa49ae574f9ea27e9261587e363f2ac3b0f2299a78b5ca42e518053351');
 assert.match(by(3018).tooltip.description,/每1%攻击速度转为0\.7%暴击伤害/);assert.deepEqual(by(3018).tooltip.unresolved,['f1.1']);
 assert.match(by(3052).tooltip.description,/超过75%最大攻击距离/);assert.deepEqual(by(3052).tooltip.unresolved,['AdditionalDamage','f1']);
 assert.match(by(3134).tooltip.description,/600码.*15%攻击速度、10护甲和10魔法抗性/);assert.equal(by(3134).tooltip.status,'complete');
 assert.match(by(3039).description,/低于50%/);assert.match(by(3039).tooltip.description,/低于50%/);assert.deepEqual(by(3039).tooltip.unresolved,['Damage','TotalHeal']);
 assert.match(by(3058).tooltip.description,/每1攻击力转为1\.8%攻击速度/);assert.deepEqual(by(3058).tooltip.unresolved,['f1.1*100']);
 assert.match(by(3150).tooltip.description,/（10 \+ 0\.02×法术强度）%最大生命值/);assert.equal(by(3150).tooltip.status,'complete');
 for(const a of rows){const bundled=game.augments.find(b=>b.id===a.id);assert.equal(a.tooltipParserRevision,2);assert.deepEqual(a.tooltip,bundled.tooltip);assert.equal(a.description,bundled.description);assert.equal(a.tooltip.revision,1);}
 assert.deepEqual(fixture,before);assert.equal(game.contentRevision,12);assert(game.augments.every(a=>a.tooltipParserRevision===2));
});
