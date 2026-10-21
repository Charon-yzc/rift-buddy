import itemsReview from './hex-route-items.json' with {type:'json'};
import {fingerprint} from './content-fingerprint.mjs';
import {mechanicReview} from './mechanic-review.mjs';
import {reviewedHexMechanic} from './hex-mechanics.mjs';

// Authored mechanism routes, not creator builds or statistical rankings. Each
// route requires the exact reviewed hero kit, augment effect and item effects.
const routes=[
 {hero:'Gwen',augment:1129,title:'法强普攻',summary:'E 后穿插普攻，法强同时服务技能与强化。',play:['用 E 接近后普攻叠 Q，Q 中心命中；别只放技能。','W 留给关键反击，能持续贴身时再考虑续航装。'],caution:'强化附加的是物理伤害；不能把这部分按技能魔法伤害计算。',gear:[['输出骨架',[3115,3089],'纳什补攻速与攻击特效，帽子补法强；这是方向，不是固定购买顺序。'],['能持续作战',[4633],'有足够交战时间再考虑裂隙。'],['需要自保',[3157],'对物理爆发或关键伤害考虑中娅；凝滞时不能继续普攻。']]},
 {hero:'Kayle',augment:1129,title:'成长型法强普攻',summary:'等攻击形态成型，用安全距离兑现法强普攻。',play:['前期先保住发育，不为触发强化强行走近。','获得远程攻击后持续普攻，E 留给合适的攻击窗口。'],caution:'强化不会让你提前获得远程形态；没有安全输出空间时先保命。',gear:[['法强与攻速',[3115,3089],'纳什与法强装备兼顾普通攻击和强化；不据此承诺固定六神装。'],['需要自保',[3157],'有法强路线且需要规避爆发时再考虑中娅。']]},
 {hero:'Teemo',augment:1129,title:'普攻提莫',summary:'有普攻空间才转，别照搬只放蘑菇的打法。',play:['先用 Q 限制对方普攻，再以攻击触发强化。','蘑菇负责区域限制；只依赖蘑菇不能兑现这项攻击强化。'],caution:'对手能持续强开、自己无法安全攻击时，这条路线不成立。',gear:[['普攻法强',[3115,3089],'纳什提供攻击频率，法强同时提高强化附加伤害。'],['需要自保',[3157],'需要规避突进爆发时考虑中娅；不要把它当持续输出装。']]},
 {hero:'Sona',augment:1141,title:'治疗护盾保核心',summary:'围绕 W 和队友站位，把强化用在友军身上。',play:['让需要保护的队友进入 W 光环范围，别只给自己恢复。','保留安全站位与蓝量；频繁施法不等于可以无限施法。'],caution:'别因为强化治疗护盾就放弃生存，死亡期间无法持续保护。',gear:[['团队治疗',[6617],'月石提供友军治疗/护盾连锁；具体收益取决于队友位置。'],['队友靠普攻',[3504],'香炉用于实际依赖普攻的队友，不能当作所有阵容必出。'],['需要蓝量',[3003],'提前考虑女神泪叠层；购买大天使不等于立即获得炽天使护盾。']]},
 {hero:'Soraka',augment:1141,title:'持续治疗',summary:'先维持自身状态，再给队友稳定治疗。',play:['有机会用 Q 命中恢复自己，再给需要保护的队友 W。','E 留给关键接近或持续施法；保持不会被先手击杀的位置。'],caution:'W 有自身生命代价，强化不会取消这个代价。',gear:[['团队治疗',[6617],'月石服务友军治疗；仍须满足距离与站位条件。'],['队友靠普攻',[3504],'队友确实能持续普攻时，再比较香炉的收益。']]},
 {hero:'Jax',augment:1058,title:'普攻循环',summary:'靠实际攻击减冷却，技能之间继续普攻。',play:['在攻击窗口穿插 W，再继续普攻，别把减冷却理解为自动连招。','E 处理对方普攻压力；结束后根据实际冷却决定是否继续追击。'],caution:'被控制、缴械或拉开距离时，攻击减冷却会中断，不承诺无缝 E。',gear:[['技能接普攻',[3078],'三相的咒刃需要施法后再攻击；不是每次攻击都额外触发咒刃。'],['需要抗爆发',[3053],'需要生命值与低血护盾时比较血手，避免只追求输出。']]},
 {hero:'Volibear',augment:1058,title:'贴身普攻续战',summary:'普攻减冷却，围绕同一目标维持 W 标记。',play:['能安全贴身时持续普攻，缩短技能空档。','W 尽量留在已标记目标，E 落点照顾自身护盾；不要为追击脱离队友。'],caution:'不要仅凭有减冷却就强行开团；无法攻击时没有这条路线的持续收益。',gear:[['技能接普攻',[3078],'需要普攻与技能轮转时比较三相；仍需考虑实际坦度。'],['对魔法压力',[3065],'有魔法伤害压力且能利用自身治疗护盾时考虑振奋。']]},
 {hero:'Brand',augment:1045,title:'技能灼烧循环',summary:'技能命中挂强化灼烧，再利用基础技能回转。',play:['先以技能挂被动，再用 Q 寻找眩晕机会。','拉开安全距离持续命中，不为叠灼烧强行近身普攻。'],caution:'不要把英雄被动、装备灼烧的每一跳都当成额外减冷却触发。',gear:[['持续伤害',[6653],'能持续命中与交战时比较兰德里。'],['需要留人',[3116],'瑞莱以伤害技能附加减速，不替代 Q 的眩晕条件。'],['需要自保',[3157],'被突进或关键爆发威胁时比较中娅。']]},
];

export const hexRouteItemFingerprint=item=>fingerprint({name:item?.name,description:item?.description,stats:item?.stats});
export function hexPlayerRoutes({data,hero,owned=[],options=[]}){
 const champion=data.champions.find(c=>c.id===hero);
 if(!champion||data.patch!==itemsReview.patch||mechanicReview(champion,data.patch)!=='current')return [];
 return routes.filter(route=>route.hero===hero).flatMap(route=>{
  const augment=data.augments.find(a=>a.id===route.augment);
  if(!reviewedHexMechanic(augment,data.patch)||options.length&&!owned.includes(augment.id)&&!options.includes(augment.id))return [];
  let pendingItems=0;
  const gear=route.gear.flatMap(([when,ids,why])=>{
   const items=ids.flatMap(id=>{
    const item=data.items[id];
    if(!item?.maps?.['12']||!item.inStore||item.gold?.purchasable===false||itemsReview.items[id]!==hexRouteItemFingerprint(item)){pendingItems++;return [];}
    return [{id,name:item.name,description:item.description}];
   });
   // A group explanation can depend on every listed item. Never leave old
   // combined claims behind when one of those item effects changes.
   return items.length===ids.length?[{when,why,items}]:[];
  });
  return [{id:hero+'-'+augment.id,hero,title:route.title,summary:route.summary,play:route.play,caution:route.caution,gear,pendingItems,augment:{id:augment.id,name:augment.name},state:owned.includes(augment.id)?'owned':options.includes(augment.id)?'offered':'preview',patch:data.patch,
   sources:[{name:'英雄技能',url:`https://ddragon.leagueoflegends.com/cdn/${data.version}/data/zh_CN/champion/${hero}.json`},{name:'海克斯强化',url:`https://raw.communitydragon.org/${data.patch}/game/maps/modespecificdata/kiwi.bin.json`},{name:'装备效果',url:`https://ddragon.leagueoflegends.com/cdn/${data.version}/data/zh_CN/item.json`}],basis:'按当前技能、强化与装备效果推导，不是胜率或固定购买顺序。'}];
 });
}
