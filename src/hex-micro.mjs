import {escape as e} from './ui.mjs';
import {hexEconomyView,hexMicroRoutesView,hexMicroLineView} from './hex-micro-view.mjs';
import {holdRenderDuringPointer} from './pointer-render.mjs';
const api=window.hexMicro,root=document.getElementById('hex-micro-root');let state=null,painted=null,context=null,hoverKey='';
const interaction=holdRenderDuringPointer({document,root,render:()=>render(state),selector:'button[data-action]'});
function image(kind,id,name){return `<img src="${e(state.images?.[kind+'/'+id]||'../data/images/'+kind+'/'+id+'.png')}" alt="${e(name)}">`;}
function render(value){state=value;const nextContext=JSON.stringify([value?.context,value?.interactionContext,value?.session,value?.active,value?.kind,value?.layout,value?.expanded,value?.hero?.id,value?.routes?.map(route=>route.id)]);
 if(context!==nextContext)interaction.invalidate();else if(interaction.defer())return;context=nextContext;
 const sameSession=painted?.session===value?.session,sameLayout=painted?.layout===value?.layout;painted=value;hoverKey='';api.hover(null);document.documentElement.style.setProperty('--hex-scale',String(value?.scale||1));
 if(!value?.active){root.innerHTML='';return;}
 document.documentElement.dataset.layout=value.layout||'full';document.documentElement.dataset.kind=value.kind;
 const line=document.querySelector('[data-action="line"]'),collapsed=value.layout==='line';line.textContent=collapsed?'▣':'▁';line.title=value.kind==='routes'?(collapsed?'展开配置':'只显示首套配置'):(collapsed?'恢复完整小窗':'收成一行');line.setAttribute('aria-label',line.title);line.setAttribute('aria-pressed',String(collapsed));
 const previous=sameSession&&sameLayout?root.querySelector('.hex-micro-route-list,.hex-micro-line:not(.hex-economy-line)'):null,scroll={top:previous?.scrollTop||0,left:previous?.scrollLeft||0};
 root.innerHTML=collapsed?hexMicroLineView(value,image):value.kind==='economy'?hexEconomyView(value.equipment,image):value.routes?.length?hexMicroRoutesView(value.routes,image,{expanded:value.expanded}):`<div class="hex-micro-pending" data-micro-pending="true" aria-label="${e(value.pending)}">${image('champion',value.hero?.id,value.hero?.name)}<span aria-hidden="true">—</span></div>`;
 const list=root.querySelector('.hex-micro-route-list,.hex-micro-line:not(.hex-economy-line)');if(list){list.scrollTop=scroll.top;list.scrollLeft=scroll.left;}requestAnimationFrame(reportRegions);
}
function reportRegions(){
 if(!state?.active)return;
 const rows=[],list=root.querySelector('.hex-micro-route-list'),viewport=list?.getBoundingClientRect();
 for(const button of document.querySelectorAll('button[data-action]')){
  if(button.disabled)continue;const r=button.getBoundingClientRect(),pin=button.dataset.action==='pin';
  const y=Math.max(r.y,pin?viewport?.y||0:0),bottom=Math.min(r.bottom,pin?viewport?.bottom||innerHeight:innerHeight);
  if(bottom<=y)continue;rows.push({action:button.dataset.action,id:button.dataset.id,x:r.x,y,width:r.width,height:bottom-y});
 }
 if(list&&(list.scrollHeight>list.clientHeight||list.scrollWidth>list.clientWidth)){const r=list.getBoundingClientRect();rows.push({action:'scroll',x:r.x,y:r.y,width:r.width,height:r.height});}
 const line=root.querySelector('.hex-micro-line:not(.hex-economy-line)');if(state.layout==='line'&&line&&line.scrollWidth>line.clientWidth){const r=line.getBoundingClientRect();rows.push({action:'scroll-line',x:r.x,y:r.y,width:r.width,height:r.height});}
 api.regions({context:state.context,view:state.view,rows}).catch(()=>{});
}
document.addEventListener('scroll',reportRegions,true);root.addEventListener('wheel',event=>{const line=event.target.closest('.hex-micro-line:not(.hex-economy-line)');if(line&&line.scrollWidth>line.clientWidth&&event.deltaY){line.scrollLeft+=event.deltaY;event.preventDefault();}else{const list=event.target.closest('.hex-micro-route-list');if(list&&list.scrollHeight<=list.clientHeight&&list.scrollWidth>list.clientWidth&&event.deltaY){list.scrollLeft+=event.deltaY;event.preventDefault();}}},{passive:false});new ResizeObserver(()=>requestAnimationFrame(reportRegions)).observe(root);
api.onMeasure(()=>requestAnimationFrame(reportRegions));
document.addEventListener('click',event=>{const control=event.target.closest('[data-action]');if(!control||!control.isConnected||control.disabled)return;
 if(['pin','expand'].includes(control.dataset.action)&&(!root.contains(control)||!state?.active||state.layout!=='full'||control.dataset.action==='pin'&&!state.routes?.some(route=>route.id===control.dataset.id)))return;
 if(control.dataset.action==='pin'){const list=root.querySelector('.hex-micro-route-list');if(list){list.scrollTop=0;list.scrollLeft=0;}}api.control(control.dataset.action,{context:state?.context,view:state?.view,id:control.dataset.id}).catch(()=>{});
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')api.control('tooltip-hide').catch(()=>{});});
api.onPointer(point=>{const target=point?document.elementFromPoint(point.x,point.y)?.closest('[data-micro-id],[data-micro-hint],[data-micro-pending]'):null;let input=null;
 if(target&&state?.active){const r=target.getBoundingClientRect();if(state.kind==='economy'){const row=target.closest('.ally,.enemy'),side=row?.classList.contains('ally')?'ally':'enemy',index=[...target.parentElement.children].indexOf(target),player=state.equipment?.[side]?.players?.[index];if(player)input={side,id:player.id};}else input=target.dataset.microPending?{kind:'status'}:{kind:target.dataset.microKind,id:target.dataset.microId,route:target.closest('[data-micro-route]')?.dataset.microRoute};if(input)input={...input,context:state.context,rect:{x:r.x,y:r.y,width:r.width,height:r.height}};}
 const key=JSON.stringify(input);if(key!==hoverKey){hoverKey=key;api.hover(input).catch(()=>{});}
});
api.onUpdate(render);render(await api.bootstrap());
