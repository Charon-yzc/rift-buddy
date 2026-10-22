import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validAbilityReference,championAbilities,abilityVector,abilityDescriptionSegments} from '../src/core/abilities.mjs';
import {championReferenceView,referenceHeroTiles} from '../src/champion-reference-view.mjs';
import {loadAbilities} from '../services/abilities.mjs';
import {imageEntries} from '../services/image-cache.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.abilityReference=JSON.parse(await fs.readFile('data/abilities.json','utf8'));
data.patchNotes=JSON.parse(await fs.readFile('data/patch-notes.json','utf8'));
const ability=(id,key)=>championAbilities(data,id).abilities.find(a=>a.key===key);
test('all bundled champions have resolved five-slot descriptions, explicit provenance and offline icons',async()=>{
 assert.equal(validAbilityReference(data.abilityReference,data),true);
 assert.equal(data.abilityReference.champions.length,173);
 const icons=imageEntries(data).filter(([key])=>key.startsWith('ability/'));assert.equal(icons.length,865);
 for(const [key] of icons){const bytes=await fs.readFile('data/images/'+key+'.png');assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);}
 for(const c of data.abilityReference.champions)for(const a of c.abilities)for(const part of [a,...a.variants])assert.doesNotMatch(part.description,/@[^@]+@|\{\{|<[^>]+>/);
});
test('decreasing resource costs keep rank order instead of the Tencent sorted order',()=>{
 for(const [id,key,expected] of [['Akali','Q',[110,100,90,80,70]],['Darius','R',[100,100,0]],['Mel','W',[80,60,40,20,0]],['Shen','Q',[140,130,120,110,100]],['Teemo','R',[75,55,35]]])assert.deepEqual(ability(id,key).metrics.find(m=>m.label.endsWith('消耗')).values,expected);
 assert.equal(data.abilityReference.corrections.filter(c=>c.field==='cost').length,27);
});
test('two forms have independent rank-aware cooldowns, costs and growth',()=>{
 assert.deepEqual(ability('Jayce','W').variants[1].metrics.find(m=>m.label==='冷却').values,[13,11.4,9.8,8.2,6.6,5]);
 assert.deepEqual(ability('Jayce','Q').variants[1].metrics.find(m=>m.label==='法力消耗').values,[55,60,65,70,75,80]);
 assert.match(ability('Jayce','Q').variants[1].description,/112\/169.4\/226.8\/284.2\/341.6\/399/);
 assert.deepEqual(ability('Elise','E').variants[1].metrics.find(m=>m.label==='冷却').values,[22,21,20,19,18]);
 assert.match(ability('Nidalee','W').variants[1].description,/3\/2.5\/2\/1.5/);
 assert.match(ability('Nidalee','Q').variants[1].description,/目标每损失1%生命值/);
 assert.match(ability('Nidalee','E').variants[1].notes.join(''),/随R的1—4级/);
});
test('charge recovery, recast interval, passive slots and continuous costs retain different meanings',()=>{
 assert.deepEqual(ability('Rengar','Q').metrics.find(m=>m.label==='冷却').values,[6,5.5,5,4.5,4]);
 assert.deepEqual(ability('Rengar','W').metrics.find(m=>m.label==='冷却').values,[16,14.5,13,11.5,10]);
 assert.doesNotMatch(ability('Rengar','Q').description,/会暴击|【35-240【/);
 assert.match(ability('Rengar','Q').description,/第一次攻击造成/);
 assert.deepEqual(ability('Teemo','R').metrics.find(m=>m.label==='充能恢复').values,[35,30,25]);
 assert.deepEqual(ability('Teemo','R').metrics.find(m=>m.label==='施放间隔').values,[0.25,0.25,0.25]);
 assert.deepEqual(ability('Rakan','E').metrics.find(m=>m.label==='冷却').values,[20,18,16,14,12]);
 assert.deepEqual(ability('Kalista','E').metrics.find(m=>m.label==='冷却').values,[10,9.5,9,8.5,8]);
 assert.deepEqual(ability('TahmKench','R').metrics.find(m=>m.label==='冷却').values,[120,100,80]);
 assert.deepEqual(ability('TahmKench','R').metrics.find(m=>m.label==='法力消耗').values,[100,100,100]);
 assert.equal(ability('Singed','Q').metrics.find(m=>m.label==='法力消耗').unit,'点/秒');
 assert(!ability('Vayne','W').metrics.some(m=>m.label==='冷却'));
 assert.deepEqual(ability('Syndra','Q').metrics.find(m=>m.label==='超然升级后充能').values,[7,7,7,7,7]);
 assert.equal(ability('Gnar','W').variants[0].metrics[0].text,'被动效果，不可主动施放');
 assert.deepEqual(ability('RekSai','Q').variants[1].metrics.find(m=>m.label==='冷却').values,[12,11.5,11,10.5,10]);
 assert.match(ability('Karma','Q').variants[1].description,/40\/100\/160\/220/);
});
test('nine Hwei subskills and five Aphelios weapons do not inherit meaningless theme/wrapper ranges',()=>{
 assert.equal(['Q','W','E'].reduce((n,k)=>n+ability('Hwei',k).variants.length,0),9);
 assert.equal(ability('Hwei','Q').variants[1].metrics.find(m=>m.label==='资料范围').values[0],1900);
 assert.match(ability('Hwei','W').variants[1].description,/100\/140\/180\/220\/260/);
 assert.equal(ability('Aphelios','Q').variants.length,5);
 assert.deepEqual(ability('Aphelios','Q').variants[3].metrics.find(m=>m.label==='冷却').values,[8,7.5,7,6.5,6,5.5,5]);
 assert.match(ability('Aphelios','Q').variants[1].description,/客户端说明的总物理伤害/);
 assert.match(ability('Aphelios','Q').variants[1].notes.join(''),/实际结算关系尚未取得真实游戏证据/);
 assert.match(ability('Aphelios','E').metrics[0].text,/没有可施放/);
 for(const c of data.abilityReference.champions)for(const a of c.abilities)for(const p of [a,...a.variants])for(const m of p.metrics.filter(m=>/范围|距离/.test(m.label)&&m.values))assert(m.values.every(v=>v>0&&v<10000),c.id+a.key);
});
test('invalid, stale or incomplete reference cannot silently masquerade as current data',async()=>{
 const clone=()=>structuredClone(data.abilityReference);
 for(const change of [r=>r.champions.pop(),r=>r.champions.push(r.champions[0]),r=>r.champions[0].abilities[0].description='@unresolved@',r=>r.champions[0].abilities[1].metrics[0].values=[NaN],r=>r.champions[0].source.url='http://evil.test',r=>r.version='16.19.1']){const r=clone();change(r);assert.equal(validAbilityReference(r,data),false);}
 const next={...data,patch:'16.22',version:'16.22.1'};assert.equal(validAbilityReference(data.abilityReference,next),false);assert.equal(validAbilityReference(data.abilityReference,next,{allowOlder:true}),true);
 assert.match(championReferenceView(next,{id:'Ahri'}),/尚未完成新版技能复核/);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-buddy-ability-'));assert.equal(await loadAbilities(root,data),null);
 await fs.writeFile(path.join(root,'abilities.json'),'{broken');assert.equal(await loadAbilities(root,data),null);
});
test('hero query, concrete skill numbers, recent mixed changes and configuration links are reachable',()=>{
 assert.match(referenceHeroTiles(data,{query:'狐狸'}),/data-id="Ahri"/);
 assert.doesNotMatch(referenceHeroTiles(data,{query:'狐狸'}),/data-id="Garen"/);
 const ahri=championReferenceView(data,{id:'Ahri',skill:'Q'});assert.match(ahri,/data-reference-skill="Q"/);assert.match(ahri,/55 \/ 65 \/ 75 \/ 85 \/ 95/);assert.match(ahri,/data-action="build"/);assert.match(ahri,/ability\/Ahri-Q.png/);assert.doesNotMatch(ahri,/data-action="(?:apply-runes|prepare-client|lock-in)"/);
 const vayne=championReferenceView(data,{id:'Vayne',tab:'changes'});assert.match(vayne,/调整/);assert.match(vayne,/生命回复/);assert.match(vayne,/data-action="link"/);
 assert.equal(abilityVector([7,7,7]),'7');assert.equal(abilityDescriptionSegments('【10/20/30】 +50%【法术强度】')[1].rankVector,true);
});
