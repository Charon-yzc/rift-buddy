import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {runeComparisonView} from '../src/rune-comparison-view.mjs';
import {runeSelector} from '../src/build-options-view.mjs';
import {companionPlanView} from '../src/companion-view.mjs';
import {getBuild,validateRunePage} from '../src/core/builds.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const inspiration={primaryStyleId:8200,subStyleId:8300,selectedPerkIds:[8229,8226,8210,8237,8304,8347,5008,5008,5001]};
const resolve={primaryStyleId:8200,subStyleId:8400,selectedPerkIds:[8229,8226,8210,8237,8444,8451,5005,5008,5011]};

test('same-keystone pages expose the actual gains, losses and shard choices without inventing strength rankings',()=>{
 assert.ok(validateRunePage(inspiration,data.runes));assert.ok(validateRunePage(resolve,data.runes));
 const html=runeComparisonView(resolve,inspiration,data);
 assert.match(html,/改选：.*复苏之风.*过度生长/s);assert.match(html,/放弃：.*神奇之鞋.*星界洞悉/s);
 assert.match(html,/进攻碎片：/);assert.match(html,/防御碎片：/);assert.doesNotMatch(html,/灵活碎片：/);
 assert.ok(html.includes('title='),'Changed rune effects remain available to inspect');
 assert.doesNotMatch(html,/更高胜率|最佳|最强/);
 const reversed=runeComparisonView(inspiration,resolve,data);assert.match(reversed,/改选：.*神奇之鞋/);assert.match(reversed,/放弃：.*复苏之风/);
});

test('secondary ordering alone is not a gameplay difference and missing pages stay absent',()=>{
 const reversed={...inspiration,selectedPerkIds:[...inspiration.selectedPerkIds]};[reversed.selectedPerkIds[4],reversed.selectedPerkIds[5]]=[reversed.selectedPerkIds[5],reversed.selectedPerkIds[4]];
 assert.match(runeComparisonView(reversed,inspiration,data),/与当前选择相同/);
 assert.equal(runeComparisonView(null,inspiration,data),'');
 assert.equal(runeComparisonView(inspiration,{selectedPerkIds:[]},data),'');
 const hostile=structuredClone(data);hostile.runes.flatMap(t=>t.slots.flatMap(s=>s.runes)).find(r=>r.id===8444).name='<script>bad</script>';
 const escaped=runeComparisonView(resolve,inspiration,hostile);assert.doesNotMatch(escaped,/<script>/);assert.ok(escaped.includes('&lt;script&gt;bad&lt;/script&gt;'));
});

test('full configuration and sidebar both compare against the current complete page after an independent rune change',()=>{
 const champion=data.champions.find(c=>c.id==='Karma');
 const first=getBuild(champion,'support',data),other=first.runeOptions.find(o=>o.id!==first.selectedRuneId);
 assert.ok(other);
 const selected=getBuild(champion,'support',data,{runeId:other.id});
 for(const build of [first,selected]){
  const full=runeSelector(build,data),side=companionPlanView(data,{selection:{id:champion.id,role:'support',mode:'rift'},build});
  for(const html of [full,side])assert.ok(html.includes(runeComparisonView(build.runePage,build.runePage,data)));
  const expected=build.runeOptions.map(o=>runeComparisonView(o.page,build.runePage,data)).filter(text=>text.includes('与当前选择比较'));
  assert.ok(expected.length);assert.ok(full.includes(expected[0]));assert.ok(side.includes('rune-page-difference'));
 }
 assert.equal(first.selectedCoreId,selected.selectedCoreId,'Comparing and selecting runes must not change the item route');
});
