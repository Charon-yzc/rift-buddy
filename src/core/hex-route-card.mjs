// The route's provenance and the hero's skill reference are separate evidence.
// A generic skill order must never be attributed to a community creator.
export function hexRouteCard(route,build={}){
 const community=[route.source,...(route.sources||[]).map(s=>s.url)].find(url=>typeof url==='string'&&/^https:\/\/arammayhem\.com\//.test(url));
 const source=route.kind==='reference'?'当前配置':community?'ARAM Mayhem · 改编':'机制整理';
 const order=typeof build.priority==='string'?[...new Set(build.priority.toUpperCase().replace(/[^QWE]/g,''))]:[];
 const priority=order.length>=2?`主${order[0]}副${order[1]}`:'';
 return {title:route.title,source,sourceUrl:community||route.source||null,priority,
  skillSource:priority?(build.selectedSkill?.source||build.source||'英雄默认加点'):'',
  skillNote:priority?'英雄加点参考；未单独提供此路线的专属加点。':'此路线尚无已核实加点'};
}

export function orderHexCards(routes,pinned=[]){
 const unique=[...new Map(routes.slice(0,30).map(route=>[route.id,route])).values()];
 return [...new Set(pinned)].flatMap(id=>unique.find(r=>r.id===id)||[]).concat(unique.filter(r=>!pinned.includes(r.id)));
}
