// Adapted scope/share semantics from Akari predicates/combinators.ts (MIT).
export const RULE_FIELDS={kills:'击杀',deaths:'死亡',assists:'助攻',kda:'KDA',cs:'补刀',damage:'英雄伤害',damageTaken:'承伤',gold:'金币',vision:'视野分',heal:'治疗',towerDamage:'推塔伤害',kp:'参团率',duration:'时长（秒）',queue:'队列 ID',champion:'英雄 ID',item:'装备 ID',rune:'符文 ID',augment:'强化 ID',spell:'召唤师技能 ID',player:'玩家标识'};
const compare=(a,op,b)=>op==='='?a===b:op==='!='?a!==b:op==='>'?a>b:op==='>='?a>=b:op==='<'?a<b:op==='<='?a<=b:false;
export function matchesRules(game,{rules=[],mode='all'}={}){
 if(!Array.isArray(rules)||rules.length>20)return false;if(!rules.length)return true;
 const apply=rule=>{
  if(!rule||!Object.hasOwn(RULE_FIELDS,rule.field))return false;
  if(['queue','duration'].includes(rule.field))return Number.isFinite(game[rule.field])&&compare(game[rule.field],rule.operator,Number(rule.value));
  const self=game.self,scope=rule.scope||'self',players=scope==='self'?(self?[self]:[]):scope==='ally'?game.participants.filter(p=>p.team===self?.team):scope==='enemy'?game.participants.filter(p=>p.team!==self?.team):game.participants;
  if(rule.field==='player')return players.some(p=>compare(p.puuid,rule.operator,String(rule.value)));
  return players.some(p=>{
   const list={item:'items',rune:'runes',augment:'augments',spell:'spells'}[rule.field];if(list)return rule.operator==='!='?!(p[list]||[]).includes(Number(rule.value)):(p[list]||[]).includes(Number(rule.value));
   let value=p[rule.field];if(!Number.isFinite(value))return false;
    if(['teamShare','gameShare','teamMaxShare','gameMaxShare'].includes(rule.measure)){
    if(game.completeTeams===false)return false;
    const group=rule.measure.startsWith('team')?game.participants.filter(q=>q.team===p.team):game.participants,values=group.map(q=>q[rule.field]);if(values.some(v=>!Number.isFinite(v)))return false;const baseline=rule.measure.includes('Max')?Math.max(...values):values.reduce((a,b)=>a+b,0);if(!baseline)return false;value=value/baseline*100;
   }else if(rule.field==='kp')value*=100;
   return compare(value,rule.operator,Number(rule.value));
  });
 };
 return mode==='any'?rules.some(apply):rules.every(apply);
}
