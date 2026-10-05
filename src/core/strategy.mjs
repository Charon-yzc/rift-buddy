export const TEMPOS={early:'抓人节奏',teamfight:'团战连招',protect:'保护核心',poke:'控制消耗'};
export function strategyTraits(analysis,combo){
 const t=analysis.traits,values={early:t.engage*2,teamfight:t.aoe*2+t.engage,protect:t.peel*3+t.sustain,poke:t.poke*3};
 if(combo?.tempo)values[combo.tempo]+=6;
 return values;
}
export function preferredTempo(analysis,combo){const values=strategyTraits(analysis,combo);return Object.keys(TEMPOS).sort((a,b)=>values[b]-values[a])[0];}
export function strategySummary(analysis,combo,requested){
 const values=strategyTraits(analysis,combo),tempo=preferredTempo(analysis,combo);
 return {tempo,label:TEMPOS[tempo],preference:requested&&requested!=='any'?TEMPOS[requested]:null,matched:requested==='any'||!requested||tempo===requested,
  benefit:combo?.why||({early:'围绕留人和支援距离一起抓机会。',teamfight:'控制与范围技能接力，等关键技能齐再接团。',protect:'把保护技能留给主要输出，让核心持续作战。',poke:'先用远程技能压低状态，再决定是否接近目标。'}[tempo]),
  tradeoff:combo?.risk||({early:'抓人失败时先退回兵线或野区，避免多人一起损失发育。',teamfight:'大招冷却或队友跟不上时，先分散发育。',protect:'保护技能交掉后容易被再次进场，别同时追不同目标。',poke:'被近身或技能落空后优势会减少，保留撤退路径。'}[tempo])};
}
