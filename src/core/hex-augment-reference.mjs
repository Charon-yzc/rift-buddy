import {fingerprint} from './content-fingerprint.mjs';
// A display projection only. Keep the downloaded/signed source immutable and
// apply a review only to its exact mode, data patch, augment ID and game key.
const source='https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-20-notes/';
const reviews=new Map([
 [2072,{descriptionHash:"e0e2fd989943ae20",tooltipHash:'0e3d8fa3eca9a592',key:'Missile_Split',expected:/在命中时、最大距离时或再次施放时/,description:text=>text.replace('在命中时、最大距离时或再次施放时','在飞弹结束或再次施放时'),note:'官方26.20修正：不再于首次命中时分裂，改为飞弹结束或再次施放时触发；当前源文仍未同步，适用技能以局内标记为准。'}],
 [2005,{descriptionHash:"5bb233f7b1ca9c6c",tooltipHash:'eea6e650325e510a',key:'ARAM_InfernoTriggered',expected:/达到S评价等级.*自动使用炼狱扳机/,description:(text,patch)=>text+'\n\n强化冷却：5秒（'+(patch==='16.21'?'同版详细说明':'26.20版本校核')+'）。',note:'官方26.20修正：强化冷却由15秒缩短至5秒；这是强化自身的冷却，当前完整说明仍为5秒。'}],
]);
export function hexAugmentReference(augment,{patch,mode='hex'}={}){
 const rule=reviews.get(augment?.id);
 if(mode!=='hex'||!['16.20','16.21'].includes(patch)||!rule||rule.key!==augment.key||rule.descriptionHash!==fingerprint(augment.description)||!rule.expected.test(augment.description||'')||patch==='16.21'&&rule.tooltipHash!==fingerprint(augment.tooltip))return augment;
 const projected=structuredClone(augment);
 if(patch==='16.21'&&augment.id===2072)projected.tooltip.description=rule.description(augment.tooltip.description,patch);
 return {...projected,description:rule.description(augment.description,patch),rawDescription:augment.description,...(patch==='16.21'?{rawTooltip:structuredClone(augment.tooltip)}:{}),
  review:{patch,label:patch==='16.21'?'官方修正参考 · 16.21源文':'26.20版本校核',sourceUrl:source,note:rule.note,...(patch==='16.21'?{projectedTooltipHash:fingerprint(projected.tooltip)}:{})}};
}
