import {escape as e} from './ui.mjs';
import {hexRouteCardFooter} from './hex-route-card-view.mjs';

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
export function hexMicroRoutesView(routes,image,{expanded=false}={}){
 const slots=(entries,kind,conditional)=>entries.map(entry=>`<button type="button" class="hex-micro-icon${entry.core?' is-core':''}" data-micro-kind="${kind}" data-micro-id="${e(entry.id)}" aria-label="${e((conditional?'联动条件 · ':entry.core?'核心 · ':'备选 · ')+entry.name)}">${image(kind,entry.id,entry.name)}</button>`).join('');
 return `<div class="hex-micro-routes ${expanded?'is-expanded':''}" aria-label="海克斯配置"><div class="hex-micro-route-list">${routes.slice(0,expanded?30:3).map((route,index)=>`<section class="hex-micro-route" data-micro-route="${e(route.id)}" aria-label="${e(route.title)}">${expanded?`<button class="hex-micro-pin" data-action="pin" data-id="${e(route.id)}" aria-label="置顶 ${e(route.title)}" title="置顶" ${index===0?'disabled':''}>↑</button>`:''}<div class="hex-micro-augments">${slots(route.augments,'augment',route.kind==='item-synergy')}</div><div class="hex-route-bottom"><div class="hex-micro-items">${slots(route.items,'item',route.kind==='item-synergy')}</div>${hexRouteCardFooter(route.card||{title:route.title,source:'来源待核'})}</div></section>`).join('')}</div>${routes.length>3?`<button class="hex-micro-expand" data-action="expand" aria-expanded="${expanded}" aria-label="${expanded?'收起':'更多配置'}" title="${expanded?'收起':'更多配置'}">${expanded?'⌃':'⌄'}</button>`:''}</div>`;
}
