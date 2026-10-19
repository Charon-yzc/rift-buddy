// One place for tier names, because the pages show the same fact differently:
// the client wording on the live page ("荣耀黄金") and the short everyday name
// in history ("黄金"). Both spellings stay here so a new tier is added once.
export const RANK_TIER_SHORT={IRON:'黑铁',BRONZE:'青铜',SILVER:'白银',GOLD:'黄金',PLATINUM:'铂金',EMERALD:'翡翠',DIAMOND:'钻石',MASTER:'大师',GRANDMASTER:'宗师',CHALLENGER:'王者',UNRANKED:'未定级'};
export const RANK_TIER_FULL={IRON:'坚韧黑铁',BRONZE:'英勇黄铜',SILVER:'不屈白银',GOLD:'荣耀黄金',PLATINUM:'华贵铂金',EMERALD:'流光翡翠',DIAMOND:'璀璨钻石',MASTER:'超凡大师',GRANDMASTER:'傲世宗师',CHALLENGER:'最强王者',UNRANKED:'未定级',NONE:'未定级'};
const DIVISIONS=['I','II','III','IV'];
/**
 * Tier name plus a real division. A missing tier reads as `missing`, never as a
 * tier the client did not report. `none` labels the client's own "NONE" rep.
 */
export function rankTierLabel(tier,{division='',honorific=false,missing='未读取',none=''}={}){
 const key=String(tier??'').toUpperCase();
 if(!key)return missing;
 if(key==='NONE'&&none)return none;
 const table=honorific?RANK_TIER_FULL:RANK_TIER_SHORT,name=table[key]??key;
 return name+(DIVISIONS.includes(division)?` ${division}`:'');
}
