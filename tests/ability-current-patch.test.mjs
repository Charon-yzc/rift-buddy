import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import reference from '../data/abilities.json' with {type:'json'};
import retired from './fixtures/mel-q-retired-16.22.json' with {type:'json'};
import {validAbilityReference} from '../src/core/abilities.mjs';
import {retiredAbilityAlternate} from '../scripts/ability-reference-current.mjs';
const skill=(hero,key)=>reference.champions.find(c=>c.id===hero).abilities.find(a=>a.key===key);
test('current detailed atlas keeps validated bindings and the actual 26.22 changes',()=>{
 assert.equal(reference.patch,game.patch);assert(validAbilityReference(reference,game));
 assert.match(skill('Locke','W').description,/5 秒/);
 assert.match(skill('Mel','Q').description,/60\+25%/);assert.match(skill('Mel','Q').notes.join(''),/0.5—1秒冷却/);
 assert.match(skill('Mel','W').description,/80\/110\/140\/170\/200/);assert.match(skill('Mel','W').notes.join(''),/静态字段仍保留旧值/);
 assert.match(skill('Mel','E').description,/0.95-2.05/);assert.doesNotMatch(skill('Mel','E').description,/0.95-20.5/);
 assert(reference.corrections.some(c=>c.champion==='Mel'&&c.key==='W'&&c.field==='sourceConflict'&&c.evidence.includes('patch-26-22-notes/')));
});
test('only the recognized retired duplicate is ignored; unknown alternates and patches stay blocked',()=>{
 const {primary,alternate:old}=retired;
 assert.equal(retiredAbilityAlternate('16.22','Mel','q',old,primary),true);
 for(const patch of ['16.21','16.23'])assert.equal(retiredAbilityAlternate(patch,'Mel','q',old,primary),false);
 assert.equal(retiredAbilityAlternate('16.22','Mel','q',{...old,description:'unknown changed spell'},primary),false);
 assert.equal(retiredAbilityAlternate('16.22','Mel','q',{...old,description:old.description+'现在也会刷新所有技能冷却'},primary),false);
 assert.equal(retiredAbilityAlternate('16.22','Mel','q',{...old,cost:'999'},primary),false);
 assert.equal(retiredAbilityAlternate('16.22','Mel','q',{...old,abilityIconPath:'other.png'},primary),false);
});
