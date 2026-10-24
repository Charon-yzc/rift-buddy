import {communitySourceMedium} from './community-source.mjs';
// The route's provenance and the hero's skill reference are separate evidence.
// A generic skill order must never be attributed to a community creator.
export function hexRouteCard(route,build={}){
 const community=[route.source,...(route.sources||[]).map(s=>s.url)].find(url=>typeof url==='string'&&/^https:\/\/arammayhem\.com\//.test(url));
 const creator=communitySourceMedium(route.communitySource)?route.communitySource:null;
 const source=route.kind==='reference'?'当前配置':creator?creator.author+' · 改编':community?'ARAM Mayhem · 改编':'机制整理';
 const authored=creator&&Array.isArray(route.skillPriority)&&route.skillPriority.length>=1&&route.skillPriority.length<=3&&new Set(route.skillPriority).size===route.skillPriority.length&&route.skillPriority.every(key=>['Q','W','E'].includes(key));
 const order=authored?route.skillPriority:typeof build.priority==='string'?[...new Set(build.priority.toUpperCase().replace(/[^QWE]/g,''))]:[];
 const priority=order.length>=2?`主${order[0]}副${order[1]}`:authored?`主${order[0]}`:'';
 return {title:route.title,source,sourceUrl:creator?.url||community||route.source||null,priority,
  skillSource:priority?(authored?creator.author:build.selectedSkill?.source||build.source||'英雄默认加点'):'',
  skillNote:authored?(order.length===1?'作者仅提供主技能，副技能与逐级加点未核实。':'作者提供的技能优先级；不是完整逐级加点。'):priority?'英雄加点参考；未单独提供此路线的专属加点。':'此路线尚无已核实加点'};
}

export function orderHexCards(routes,pinned=[]){
 const unique=[...new Map(routes.slice(0,30).map(route=>[route.id,route])).values()];
 return [...new Set(pinned)].flatMap(id=>unique.find(r=>r.id===id)||[]).concat(unique.filter(r=>!pinned.includes(r.id)));
}
