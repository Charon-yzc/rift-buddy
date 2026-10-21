import {fingerprint} from './content-fingerprint.mjs';
// A display projection only. Keep the downloaded/signed source immutable and
// apply a review only to its exact mode, data patch, augment ID and game key.
const source='https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-20-notes/';
const reviews=new Map([
 [2072,{descriptionHash:"e0e2fd989943ae20",key:'Missile_Split',expected:/在命中时、最大距离时或再次施放时/,description:text=>text.replace('在命中时、最大距离时或再次施放时','在飞弹结束或再次施放时'),note:'26.20：不再于首次命中时分裂，改为飞弹结束或再次施放时触发。'}],
 [2005,{descriptionHash:"5bb233f7b1ca9c6c",key:'ARAM_InfernoTriggered',expected:/达到S评价等级.*自动使用炼狱扳机/,description:text=>text+'\n\n强化冷却：5秒（26.20版本校核）。',note:'26.20：强化冷却由15秒缩短至5秒；这是强化自身的冷却。'}],
]);
export function hexAugmentReference(augment,{patch,mode='hex'}={}){
 const rule=reviews.get(augment?.id);
 if(mode!=='hex'||patch!=='16.20'||!rule||rule.key!==augment.key||rule.descriptionHash!==fingerprint(augment.description)||!rule.expected.test(augment.description||''))return augment;
 return {...augment,description:rule.description(augment.description),rawDescription:augment.description,
  review:{patch:'16.20',label:'26.20版本校核',sourceUrl:source,note:rule.note}};
}
