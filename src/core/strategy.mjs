import {profile} from './rules.mjs';

export const TEMPOS={early:'抓人节奏',teamfight:'团战连招',protect:'保护核心',poke:'控制消耗'};
export function strategyTraits(analysis,combo){
 const t=analysis.traits,values={early:t.engage*2,teamfight:t.aoe*2+t.engage,protect:t.peel*3+t.sustain,poke:t.poke*3};
 if(combo?.tempo)values[combo.tempo]+=6;
 return values;
}
// Enemy traits below come only from visibly picked enemy champions supplied by
// the caller (e.g. no-mirror draft). They describe team functions, never win
// rates or hidden counter relationships.
export function summarizeEnemyTraits(enemyIds,champions){
 const byId=new Map(champions.map(c=>[c.id,c]));
 const traits={count:0,frontline:0,engage:0,peel:0,sustain:0,poke:0,aoe:0,ad:0,ap:0};
 for(const id of new Set((enemyIds||[]).filter(Boolean))){
  const c=byId.get(id);if(!c)continue;
  const p=profile(c);
  traits.count++;
  for(const k of ['frontline','engage','peel','sustain','poke','aoe'])if(p[k])traits[k]++;
  traits.ad+=p.damageWeights.ad;traits.ap+=p.damageWeights.ap;
 }
 return traits;
}
export function threatNotes(analysis,enemyTraits){
 if(!enemyTraits||!enemyTraits.count)return [];
 const t=analysis.traits,e=enemyTraits,notes=[];
 if(e.engage>=2&&!t.peel)notes.push('对方先手较多，我方保护偏少，注意站位分散、留好自保技能');
 if(e.engage>=2&&t.peel)notes.push('对方先手较多，我方有保护手段，把关键保护留给被开的人');
 if(e.poke>=2)notes.push(t.sustain?'对方消耗较多，可利用视野逼位置，找果断开局的机会':'对方消耗较多，我方持续作战偏弱，避免长时间正面拉扯');
 if(e.sustain>=2)notes.push('对方持续输出较多，接团前先确认目标，不要拖成持久战');
 if(e.frontline>=2)notes.push('对方前排较多，优先处理能碰到的人，不要只盯着够不到的后排');
 if(e.ap>=2&&e.ad<1)notes.push('对方以法术伤害为主，可在局势选项里勾选“魔法伤害多”看防御调整');
 else if(e.ad>=2&&e.ap<1)notes.push('对方以物理伤害为主，可在局势选项里勾选“普攻压力大”看鞋子调整');
 return notes.slice(0,3);
}
export function preferredTempo(analysis,combo){const values=strategyTraits(analysis,combo);return Object.keys(TEMPOS).sort((a,b)=>(values[b]||0)-(values[a]||0))[0];}
// Curve, forgiveness and control-chain below are mechanism heuristics computed
// from role traits only (no win rates): they describe which phase the team
// functions cover and how punishing mistakes are, not how strong the team is.
export function describeCurve(traits){
 const early=Math.min(traits.engage,2)*2+Math.min(traits.poke,2)*1.5+(traits.poke&&traits.engage?1:0);
 const late=Math.min(traits.sustain,2)*2+Math.min(traits.aoe,2)*1.5+Math.min(traits.peel,2);
 return {early,late,label:early-late>=3?'前期主动':late-early>=3?'偏后期团战':'前后兼顾'};
}
export function describeForgiveness(traits,balancedDamage){
 const score=Math.min(traits.peel,2)*2+Math.min(traits.frontline,2)*2+Math.min(traits.sustain,1)*1.5+(balancedDamage?1.5:0);
 return {score:Math.min(10,score),label:score>=6?'容错较高':score>=3.5?'容错中等':'容错偏低'};
}
export function controlChainLabel(traits){
 if(traits.engage>=2&&traits.aoe>=1)return '控制链完整';
 if(traits.engage>=2)return '先手充足、缺范围衔接';
 if(traits.engage>=1)return '有先手、缺衔接';
 return '缺少稳定先手';
}
export function strategySummary(analysis,combo,requested,enemyTraits=null){
 const values=strategyTraits(analysis,combo),tempo=preferredTempo(analysis,combo);
 return {tempo,label:TEMPOS[tempo],preference:requested&&requested!=='any'?TEMPOS[requested]:null,matched:requested==='any'||!requested||tempo===requested,
  benefit:combo?.why||({early:'围绕留人和支援距离一起抓机会。',teamfight:'控制与范围技能接力，等关键技能齐再接团。',protect:'把保护技能留给主要输出，让核心持续作战。',poke:'先用远程技能压低状态，再决定是否接近目标。'}[tempo]),
  tradeoff:combo?.risk||({early:'抓人失败时先退回兵线或野区，避免多人一起损失发育。',teamfight:'大招冷却或队友跟不上时，先分散发育。',protect:'保护技能交掉后容易被再次进场，别同时追不同目标。',poke:'被近身或技能落空后优势会减少，保留撤退路径。'}[tempo]),
  threats:threatNotes(analysis,enemyTraits)};
}
