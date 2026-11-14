import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const plain=v=>String(v??'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').trim();
const retiredMelQ='b53b95210de813c662348686003b68bb0a45eaaea0098024d158e5d9d67ec96c';

export function retiredAbilityAlternate(patch,hero,key,alternate,primary){
 if(patch!=='16.22'||hero!=='Mel'||key!=='q'||primary.name!=='耀光弹幕'||alternate.abilityIconPath!==primary.abilityIconPath)return false;
 const fields=[alternate.name,plain(alternate.description),alternate.cost,alternate.cooldown,alternate.range,alternate.abilityIconPath];
 return createHash('sha256').update(JSON.stringify(fields)).digest('hex')===retiredMelQ;
}

// Other corrections are replayed against same-patch client bindings. These
// cover actual 26.22 changes and source conflicts rather than relabelling 21.
export function correctCurrentPatch({patch,ability,values,spell,replace,corrections}){
 if(patch!=='16.22')return;
 assert.deepEqual(values('Mel','MelQ','BaseDamageInitial',5),[60,60,60,60,60]);
 assert.deepEqual(values('Mel','MelQ','APRatioInitial',5),[.25,.25,.25,.25,.25]);
 assert.deepEqual(values('Locke','LockeW','BaseDuration',1),[5]);
 assert.deepEqual(values('Mel','MelE','RootDurationMax',5),[1.6,1.75,1.9,2.05,2.2]);
 replace('Mel','E','0.95-20.5','0.95-2.05','Same-patch MelE RootDurationMax[4]=2.05, not the Tencent decimal typo 20.5');
 const announcement='https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-22-notes/';
 ability('Mel','Q').notes.push('26.22公告：至少命中一名英雄时返还0.5—1秒冷却，随英雄等级提升。');
 assert.deepEqual(values('Mel','MelW','BaseShield',5),[50,80,110,140,170]);
 assert.equal(spell('Mel','MelW').mSpellCalculations.TotalShield.mFormulaParts[1].mCoefficient,.5);
 replace('Mel','W','【50/80/110/140/170】+50%【法术强度】','【80/110/140/170/200】+70%【法术强度】',announcement+' · Official shield replaces conflicting static tooltip');
 const mana=ability('Mel','W').metrics.find(m=>m.label==='法力消耗');
 assert.deepEqual(mana.values,[100,75,50,25,0]);
 mana.values=[100,80,60,40,0];mana.basis='技能等级1—5；26.22正式公告，静态字段存在差异';
 ability('Mel','W').notes.push('护盾与法力按26.22正式公告校正；部分客户端静态字段仍保留旧值，来源差异已记录。');
 corrections.push({champion:'Mel',key:'Q',field:'mechanism',evidence:announcement,value:'Champion hit refunds 0.5–1.0 seconds by champion level'},
  {champion:'Mel',key:'W',field:'cost',evidence:announcement,old:[100,75,50,25,0],value:mana.values},
  {champion:'Mel',key:'W',field:'sourceConflict',evidence:announcement,value:'Official shield/cost used explicitly; Tencent/CommunityDragon shield and static costs disagree, original records retained in source evidence'});
}
