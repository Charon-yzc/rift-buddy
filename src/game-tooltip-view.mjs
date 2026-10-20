import {escape as e,gameDescription,asset} from './ui.mjs';
import {itemPatchNotes,patchDirectionLabel} from './core/patch-notes.mjs';
import {compareBuildPatches} from './core/builds.mjs';
const numbers=value=>String(value).split(/(\d+(?:\.\d+)?(?:%|秒|金币|金)?)/g).map((part,index)=>index%2?`<strong>${e(part)}</strong>`:e(part)).join('');
export function gameTooltipView(data,kind,id,{mode='rift',image=asset}={}){
 let name,description,meta='',partial=false,changes=[],basic='';
 if(kind==='item'){
  const item=data.items[id];if(!item)return '';
  const detailed=item.tooltip?.patch===data.patch&&typeof item.tooltip.description==='string'?item.tooltip:null;
  name=item.name;description=detailed?.description||item.description;partial=detailed?.status==='partial';
  if(partial){const official=gameDescription(item.description).split(/\n\s*\n/).find(block=>/^\s*\d/.test(block));if(official&&official.trim()!==gameDescription(description).split(/\n\s*\n/)[0].trim())basic=official;}
  meta=['峡谷',data.patch,Number.isFinite(item.gold?.total)?item.gold.total+' 金':''].filter(Boolean).join(' · ');
  changes=itemPatchNotes(data,id).filter(row=>compareBuildPatches(row.patch,data.patch)<=0).slice(0,2);
 }else if(kind==='rune'){
  const rune=data.runes.flatMap(tree=>tree.slots.flatMap(slot=>slot.runes)).find(rune=>String(rune.id)===String(id));if(!rune)return '';
  name=rune.name;description=rune.longDesc||rune.shortDesc;meta=data.patch;
 }else if(kind==='spell'){
  const spell=data.spells[id];if(!spell)return '';
  name=spell.name;description=spell.description;meta=[data.patch,spell.cooldownBurn?'冷却 '+spell.cooldownBurn+' 秒':''].filter(Boolean).join(' · ');
 }else return '';
 const paragraphs=gameDescription(description).slice(0,7000).split(/\n\s*\n/).filter(Boolean);
 return `<header>${image(kind,id,name)}<div><b>${e(name)}</b><small>${e(meta)}</small></div></header>${mode==='hex'?'<p class="game-tooltip-note">以下为峡谷基础值，海克斯模式调整未核对。</p>':''}${basic?`<section class="game-tooltip-basics"><small>基础属性 · 同版本官方简介</small><p>${numbers(basic)}</p></section>`:''}<div class="game-tooltip-description">${paragraphs.map(text=>`<p>${numbers(text)}</p>`).join('')}</div>${partial?'<small class="game-tooltip-note">部分数值尚未解析，请以游戏内显示为准。</small>':''}${changes.length?`<section class="game-tooltip-changes"><b>近期峡谷改动</b>${changes.map(row=>`<div><small>${e(row.officialPatch)} · ${patchDirectionLabel(row.direction)}</small>${row.changes.slice(0,5).map(change=>`<p><span>${e(change.field)}</span><span>${numbers(change.before)} <i>→</i> ${numbers(change.after)}</span></p>`).join('')}</div>`).join('')}</section>`:''}`;
}

// A single top-layer card follows game assets across renderers and dialogs.
// It never renders source HTML or requires a client call.
export function createGameTooltips({document,getData,getMode=()=> 'rift',getContent,observeRoots=[document.getElementById('app'),document.getElementById('overlay-root')]}){
 const view=document.defaultView,selector='[data-game-tooltip-kind][data-game-tooltip-id]',card=document.createElement('div');
 card.className='game-tooltip';card.id='game-tooltip';card.setAttribute('role','tooltip');card.setAttribute('popover','manual');document.body.append(card);
 let anchor=null,focusOwner=null,timer=null,closeTimer=null,titles=[],request=0,repainting=false;
 function removeDescription(owner){const ids=(owner.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!==card.id);if(ids.length)owner.setAttribute('aria-describedby',ids.join(' '));else owner.removeAttribute('aria-describedby');}
 function assignOwner(owner){if(focusOwner&&focusOwner!==owner)removeDescription(focusOwner);focusOwner=owner;if(card.matches(':popover-open')){const ids=new Set((owner.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));ids.add(card.id);owner.setAttribute('aria-describedby',[...ids].join(' '));}}
 function hide({restore=true}={}){
  request++;
  view.clearTimeout(timer);view.clearTimeout(closeTimer);timer=null;closeTimer=null;if(card.matches(':popover-open'))card.hidePopover();
  if(focusOwner){removeDescription(focusOwner);focusOwner=null;}
  if(restore){for(const [node,title] of titles)if(node.isConnected&&!node.hasAttribute('title'))node.setAttribute('title',title);titles=[];anchor=null;}
 }
 function muteTitles(node){
  titles=titles.filter(([node])=>node.isConnected);
  for(let parent=node;parent&&parent!==document.body;parent=parent.parentElement){if(parent.hasAttribute('title')){titles.push([parent,parent.getAttribute('title')]);parent.removeAttribute('title');}if(parent.matches('button,a,[role=button]'))break;}
 }
 function place(){
  const r=anchor.getBoundingClientRect(),box=card.getBoundingClientRect(),margin=8;
  card.style.left=Math.max(margin,Math.min(view.innerWidth-box.width-margin,r.left+r.width/2-box.width/2))+'px';
  const below=r.bottom+8;card.style.top=(below+box.height<=view.innerHeight-margin?below:Math.max(margin,r.top-box.height-8))+'px';
 }
 function show(node,owner=node){
  view.clearTimeout(closeTimer);if(node===anchor){assignOwner(owner);return;}hide();const serial=request,mode=getMode();
  anchor=node;assignOwner(owner);
  muteTitles(node);
  timer=view.setTimeout(async()=>{
   if(serial!==request||anchor!==node||!node.isConnected||getMode()!==mode)return;
   let html;try{html=await (getContent?getContent(node.dataset.gameTooltipKind,node.dataset.gameTooltipId,mode):gameTooltipView(getData(),node.dataset.gameTooltipKind,node.dataset.gameTooltipId,{mode}));}catch{if(serial===request)hide();return;}
   if(serial!==request||anchor!==node||!node.isConnected||getMode()!==mode)return;
   timer=null;
   if(typeof html!=='string'||!html){hide();return;}
   card.innerHTML=html;card.showPopover();place();
   assignOwner(focusOwner);
  },100);
 }
 const contextual='[data-history-tip],[data-ongoing-tip],.history-hover';
 const find=target=>{const node=target.closest?.(selector)||target.closest?.('button,a,[tabindex]')?.querySelector(selector);return node&&!node.closest(contextual)?node:null;};
 document.addEventListener('pointerover',event=>{if(card.contains(event.target)){view.clearTimeout(closeTimer);return;}const node=find(event.target);if(node)show(node);else if(event.target.closest?.(contextual))hide();});
 document.addEventListener('pointerout',event=>{if(anchor&&!anchor.contains(event.relatedTarget)&&!card.contains(event.relatedTarget)&&!event.relatedTarget?.closest?.(selector)){view.clearTimeout(closeTimer);closeTimer=view.setTimeout(()=>hide(),180);}});
 document.addEventListener('focusin',event=>{const node=find(event.target);if(node)show(node,event.target);else hide();});
 document.addEventListener('focusout',()=>{if(!repainting)hide();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&(card.matches(':popover-open')||timer)){event.preventDefault();hide({restore:false});}},true);
 document.addEventListener('scroll',event=>{if(repainting||card.contains(event.target))return;const node=anchor,owner=focusOwner,focused=owner===document.activeElement;if(node?.isConnected&&focused&&card.matches(':popover-open')){place();return;}hide();if(node?.isConnected&&focused)show(node,owner);},true);view.addEventListener('resize',()=>hide());view.addEventListener('blur',()=>hide());
 const observer=new view.MutationObserver(()=>{if(anchor&&!anchor.isConnected)hide();});for(const root of observeRoots)if(root)observer.observe(root,{childList:true,subtree:true});
 function rebind(root){
  if(!anchor||root.contains(anchor))return;
  const kind=anchor.dataset.gameTooltipKind,id=anchor.dataset.gameTooltipId,ownerKey=focusOwner?.dataset.referenceFocus;
  const node=[...root.querySelectorAll(selector)].find(node=>node.dataset.gameTooltipKind===kind&&node.dataset.gameTooltipId===id&&(!ownerKey||node.closest('[data-reference-focus]')?.dataset.referenceFocus===ownerKey)&&node.getBoundingClientRect().width>0);
  if(!node){hide();return;}
  const owner=focusOwner===anchor?node:node.closest('button,a,[tabindex]')||node;
  if(!card.matches(':popover-open')){if(timer)show(node,owner);else{anchor=node;muteTitles(node);assignOwner(owner);}return;}
  request++;view.clearTimeout(timer);view.clearTimeout(closeTimer);timer=null;closeTimer=null;
  anchor=node;muteTitles(node);assignOwner(owner);place();
 }
 return {close:hide,repaint(root,paint){repainting=true;try{paint();rebind(root);}finally{repainting=false;}}};
}
