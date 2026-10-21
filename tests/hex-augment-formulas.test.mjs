import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {buildAugmentDescriptions} from '../services/augments.mjs';
const source=JSON.parse(fs.readFileSync(new URL('./fixtures/hex-augment-formulas-16.20.json',import.meta.url))),render=(fixture=source)=>buildAugmentDescriptions(fixture.catalog,fixture.bin,fixture.entries),byId=id=>render().find(a=>a.id===id);

test('actual KIWI AP probability formulas keep percentage units and do not pretend to know current AP',()=>{
 assert.match(byId(1048).description,/（25 \+ 0\.045×法术强度）%/);assert.equal(byId(1048).descriptionStatus,'complete');
 const zealot=byId(2009);assert.match(zealot.description,/（35 \+ 0\.05×法术强度）%/);assert.match(zealot.description,/（25 \+ 0\.05×法术强度）%/);assert.equal(zealot.descriptionStatus,'complete');
 assert.match(byId(2132).description,/（10 \+ 0\.035×法术强度）%/);assert.equal(byId(2132).descriptionStatus,'complete');
});
test('actual shielding distinguishes bonus health from maximum health and applies source multipliers',()=>{
 assert.match(byId(1331).description,/100–250（随等级） \+ 100%法术强度 \+ 10%额外生命值/);assert.equal(byId(1331).descriptionStatus,'complete');
 assert.match(byId(2100).description,/160/);assert.ok(!byId(2100).unresolved.includes('MaxAbilityHasteReward'));assert.equal(byId(2100).descriptionStatus,'partial','Hero-specific skill and quest remain unknown');
 assert.ok(byId(1061).unresolved.includes('Cooldown'),'BaseCooldown is not blindly substituted for live cooldown');assert.ok(byId(1415).unresolved.includes('AdditionalMis'),'Unverified stat8 missile behavior stays explicit');
});
test('missing coefficient, unknown stat or formula and unknown multiplier never emit partial invented formulas',()=>{
 for(const change of ['coefficient','stat','formula','multiplier','wrapper','invalid base','null stat']){
  const fixture=structuredClone(source),entry=Object.values(fixture.bin).find(row=>row?.AugmentNameId==='ARAM_JeweledGauntlet'),spell=fixture.bin[entry.RootSpell].mSpell,calc=spell.mSpellCalculations.CritGranted;
  if(change==='coefficient')spell.DataValues=spell.DataValues.filter(row=>row.name!=='CritConverRatio');
  if(change==='stat')calc.mFormulaParts[1].mStat=999;
  if(change==='formula')calc.mFormulaParts[1].mStatFormula=999;
  if(change==='multiplier')calc.mMultiplier={__type:'UnknownCalculationPart',mNumber:2};
  if(change==='wrapper')calc.__type='UnknownGameCalculation';
  if(change==='invalid base')spell.DataValues.find(row=>row.name==='CritChance').values[2]=null;
  if(change==='null stat')calc.mFormulaParts[1].mStat=null;
  const row=render(fixture).find(a=>a.id===1048);assert.equal(row.descriptionStatus,'partial',change);assert.ok(row.unresolved.includes('CritGranted'));assert.doesNotMatch(row.description,/（25|0\.045/);
 }
});
