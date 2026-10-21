import {escape as e} from './ui.mjs';

// The values are public inventory prices, never anyone's unspent gold.
export function hexEconomyCells(equipment,side){
 const players=equipment?.available?equipment[side]?.players||[]:[];
 const rows=players.filter(p=>p&&typeof p.id==='string').slice(0,5);
 return Array.from({length:5},(_,i)=>{
  const p=rows[i];return p?{id:p.id,name:p.name,value:p.known&&Number.isFinite(p.value)&&p.value>=0?Math.floor(p.value):null}:null;
 });
}

export function hexEconomyView(equipment,image){
 const rows=side=>{
  const cells=hexEconomyCells(equipment,side);
  return `<div class="hex-economy-icons ${side}" aria-label="${side==='ally'?'我方':'敌方'}英雄">${cells.map(p=>p?`<span data-micro-hint="${e(p.name+' · 公开装备价值')}">${image('champion',p.id,p.name)}</span>`:'<span class="hex-micro-empty" aria-label="英雄尚未读取"></span>').join('')}</div><div class="hex-economy-values ${side}" aria-label="公开装备标价估算">${cells.map(p=>`<span data-micro-hint="${e(p?p.name+' · '+(p.value===null?'装备尚未读全':p.value+' 金，按公开装备标价估算'):'尚未读取')}">${p?.value===null||!p?'—':p.value}</span>`).join('')}</div>`;
 };
 return `<div class="hex-micro-economy">${rows('ally')}${rows('enemy')}</div>`;
}

// Display only: each route must be independently sourced and validated by the
// provider. Separate item/augment lists are not evidence of a paired build.
export function hexMicroRoutesView(routes,image){
 const slots=(entries,kind)=>entries.map(entry=>`<button type="button" class="hex-micro-icon${entry.core?' is-core':''}" data-micro-kind="${kind}" data-micro-id="${e(entry.id)}" aria-label="${e((entry.core?'核心 · ':'备选 · ')+entry.name)}">${image(kind,entry.id,entry.name)}</button>`).join('');
 return `<div class="hex-micro-routes" aria-label="海克斯配套路线">${routes.slice(0,3).map(route=>`<section class="hex-micro-route" data-micro-route="${e(route.id)}" aria-label="${e(route.title)}"><div class="hex-micro-augments">${slots(route.augments,'augment')}</div><div class="hex-micro-items">${slots(route.items,'item')}</div></section>`).join('')}</div>`;
}
