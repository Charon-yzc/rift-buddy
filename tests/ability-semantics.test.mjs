import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const reference=JSON.parse(await fs.readFile('data/abilities.json','utf8'));
const ability=(id,key)=>reference.champions.find(c=>c.id===id).abilities.find(a=>a.key===key);
const metric=(id,key,label)=>ability(id,key).metrics.find(m=>m.label===label);

test('Taric healing multiplies a constant per-stack formula once, including AP and max health',()=>{
 const q=ability('Taric','Q'),formula=q.description.match(/\((\d+)\+(\d+)%【法术强度】\+(\d+)%【最大生命值】\)×消耗层数/);
 assert(formula,'per-stack healing formula must be explicit');
 const [,base,ap,hp]=formula.map(Number),heal=(power,maxHP,stacks)=>(base+ap/100*power+hp/100*maxHP)*stacks;
 assert.equal(heal(0,1000,5),175);assert.equal(heal(100,2000,3),180);
 assert.deepEqual(metric('Taric','Q','最多储存').values,[1,2,3,4,5]);
 assert.doesNotMatch(q.description,/25\/50\/75\/100\/125/);
});

test('growth and conditional damage use their actual rank or current-stat basis',()=>{
 assert.match(ability('Rumble','W').description,/15%\/22.5%\/30%\/37.5%\/45%/);
 assert.match(ability('MissFortune','R').description,/280\/480\/720/);
 assert.match(ability('MissFortune','R').description,/840%\/960%\/1080%/);
 assert.doesNotMatch(ability('MissFortune','R').description,/787-1813|造成73=/);
 assert.match(ability('Volibear','W').description,/1.5\+0.0025×【额外攻击力】/);
 assert.match(ability('TahmKench','P').description,/1.25%×\(【额外生命值】÷100\)×【法术强度】/);
 const devour=ability('TahmKench','R').description;assert.match(devour,/100\/250\/400】\+\(15%\+0.07%×【法术强度】\)×目标最大生命值/);assert.doesNotMatch(devour,/目标16%=/);
 const devourDamage=(rank,ap,hp)=>[100,250,400][rank-1]+(.15+.0007*ap)*hp;assert.equal(devourDamage(1,0,1000),250);assert.equal(devourDamage(3,100,2000),840);
 assert.match(ability('Kaisa','E').description,/随E等级/);assert.doesNotMatch(ability('Kaisa','E').description,/77.33%|当前：【0.84】/);
 for(const id of ['Yasuo','Yone']){assert.match(ability(id,'P').description,/通常倍率的95%/);assert.doesNotMatch(ability(id,'P').description,/190%|当前加成：0/);}
});

test('enhanced rank values remain queryable between endpoints and cannot look like hero-level growth',()=>{
 for(const[id,key,values,basis]of[
  ['Lillia','W','240/300/360/420/480','随W等级'],['Soraka','R','225/375/525','随R等级'],
  ['Nunu','Q','39/57/75/93/111','随Q等级'],['Nunu','E','20/30/40/50/60','随E等级'],
  ['Nunu','R','30%/40%/50%','随R等级'],['Vex','R','75/125/175','随R等级'],
  ['Vladimir','R','60/100/140','随R等级'],['Tristana','E','120/170/220/270/320','随E等级'],
 ]){const d=ability(id,key).description;assert(d.includes(values),id+key);assert(d.includes(basis),id+key);assert.doesNotMatch(d,/随等级提升/,id+key);}
 assert.match(ability('Nunu','E').description,/0.5—1.5【随英雄等级提升】/);
 assert.match(ability('Nasus','Q').description,/层数伤害不随暴击翻倍/);
 assert.doesNotMatch(ability('MasterYi','Q').description,/17.32|242.48|随等级提升/);
});

test('same-card cooldown agrees and charged range shows states instead of only its initial distance',()=>{
 assert.deepEqual(metric('Velkoz','E','冷却').values,[12,11.5,11,10.5,10]);assert.match(ability('Velkoz','E').description,/12\/11.5\/11\/10.5\/10/);assert.doesNotMatch(ability('Velkoz','E').description,/14\/13.5\/13\/12.5\/12/);
 const q=ability('Pyke','Q');assert.deepEqual(q.variants.map(v=>v.name),['秒放','蓄力']);assert.equal(q.metrics.length,0);
 assert.doesNotMatch(q.variants[0].description,/将其拉拽/);assert.match(q.variants[1].description,/将其拉拽/);
 assert.match(q.variants[1].metrics.find(m=>m.label==='瞄准指示').text,/400.*1025.*1秒/);assert.match(q.variants[1].notes.join(''),/500—1100.*400—1025.*尚未取得真实游戏证据/);
 for(const id of ['Varus','Xerath','Vi']){assert(!metric(id,'Q','资料范围'));assert(ability(id,'Q').metrics.some(m=>m.text?.includes('→')));}
 assert.deepEqual(metric('Zac','E','满蓄力距离参数').values,[1200,1350,1500,1650,1800]);assert(!metric('Zac','E','资料范围'));
});

test('life costs, continuous costs and passive/self targeting are actionable rather than engine sentinels',()=>{
 assert.deepEqual(metric('DrMundo','Q','生命消耗').values,[50,60,70,80,90]);
 assert.equal(metric('DrMundo','W','生命消耗').unit,'%当前生命值');
 assert.equal(metric('Vladimir','E','生命消耗').unit,'%最大生命值（完整蓄力）');
 assert.equal(metric('Briar','R','生命消耗').unit,'%当前生命值');
 assert.equal(metric('AurelionSol','Q','法力消耗').unit,'点/秒');assert.doesNotMatch(ability('AurelionSol','Q').description,/9999/);
 assert.equal(metric('Amumu','W','法力消耗').unit,'点/秒');assert.deepEqual(metric('Anivia','R','开启法力消耗').values,[60,60,60]);assert.deepEqual(metric('Anivia','R','持续法力消耗').values,[35,45,55]);
 assert.deepEqual(metric('MasterYi','W','开启法力消耗').values,[40,40,40,40,40]);assert.equal(metric('MasterYi','W','持续法力消耗').unit,'%最大法力值/秒');assert.deepEqual(metric('MasterYi','W','持续法力消耗').values,[6]);
 assert.equal(metric('Locke','W','持续自身伤害').unit,'%当前生命值/秒');assert.match(ability('Locke','W').notes.join(''),/实际运行关系尚未取得真实游戏证据/);
 assert.match(metric('Vi','W','触发方式').text,/被动/);assert(!metric('Vi','W','冷却'));assert(!metric('Vi','W','资料范围'));
 assert(!metric('Alistar','R','资料范围'));assert.match(metric('Alistar','R','施放方式').text,/自身施放/);
 assert(!metric('Ashe','Q','资料范围'));assert.match(metric('Ashe','Q','施放方式').text,/当前普攻射程/);
 assert.deepEqual(metric('Darius','Q','斧刃作用半径').values,[425]);
 assert(!metric('TahmKench','E','资料范围'));assert.match(metric('TahmKench','E','施放目标').text,/不是护盾施法距离/);
});

test('Kled and Kayn show independent forms and retain unresolved source conflicts',()=>{
 const kq=ability('Kled','Q');assert.equal(kq.variants.length,2);assert.equal(kq.metrics.length,0);
 const pistol=kq.variants[1];assert.deepEqual(pistol.metrics.find(m=>m.label==='充能恢复').values,[18,16,14,12,10]);
 assert.deepEqual(pistol.metrics.find(m=>m.label==='施放间隔').values,[3]);assert.deepEqual(pistol.metrics.find(m=>m.label==='最多储存').values,[2]);
 assert.match(pistol.notes.join(''),/固定20秒.*尚未取得真实游戏证据/);assert.doesNotMatch(pistol.description,/真实视野|小兵/);
 for(const key of ['Q','W','E','R'])assert.deepEqual(ability('Kayn',key).variants.map(v=>v.name),['凯隐','影流刺客','暗裔杀手']);
 assert.deepEqual(ability('Kayn','W').variants.map(v=>v.metrics.find(m=>m.label==='施法距离').values[0]),[700,900,700]);
 assert.match(ability('Kayn','W').variants[1].notes.join(''),/实际结算关系待真实游戏验证/);
 assert.deepEqual(ability('Kayn','E').variants[1].metrics.find(m=>m.label==='冷却').values,[10]);
 assert.deepEqual(ability('Kayn','R').variants.map(v=>v.metrics.find(m=>m.label==='施法距离').values[0]),[550,750,550]);
 assert.match(ability('Kayn','R').variants[2].description,/治疗自身.*目标最大生命值/);
});

test('resolved reference never presents an unbound coefficient, stuck rank separator or fabricated current counter',()=>{
 for(const c of reference.champions)for(const a of c.abilities)for(const part of [a,...a.variants]){
  assert.doesNotMatch(part.description,/[+]\s*\d+(?:\.\d+)?%[)）]|\d+%\d+%|【[^】\n]*\d+\.\d+\.\d+[^】]*】/,c.id+' '+a.key+' '+part.name);
 }
 assert.doesNotMatch(ability('Kaisa','P').description,/0.0%|0.0\//);assert.match(ability('Kaisa','P').description,/达到100%额外攻击速度可进化/);
 assert.doesNotMatch(ability('Bard','W').description,/当前已激活的圣坛数：0/);
});
