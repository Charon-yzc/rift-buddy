import {escape as e} from './ui.mjs';
import {hexEconomyView,hexMicroRoutesView} from './hex-micro-view.mjs';
const api=window.hexMicro,root=document.getElementById('hex-micro-root');let state=null,hoverKey='';
function image(kind,id,name){return `<img src="${e(state.images?.[kind+'/'+id]||'../data/images/'+kind+'/'+id+'.png')}" alt="${e(name)}">`;}
function render(value){const sameSession=state?.session===value?.session;hoverKey='';api.hover(null);state=value;document.documentElement.style.setProperty('--hex-scale',String(value?.scale||1));
 if(!value?.active){root.innerHTML='';return;}
 const scroll=sameSession?root.querySelector('.hex-micro-route-list')?.scrollTop||0:0;
 root.innerHTML=value.kind==='economy'?hexEconomyView(value.equipment,image):value.routes?.length?hexMicroRoutesView(value.routes,image,{expanded:value.expanded}):`<div class="hex-micro-pending" data-micro-pending="true" aria-label="${e(value.pending)}">${image('champion',value.hero?.id,value.hero?.name)}<span aria-hidden="true">—</span></div>`;
 const list=root.querySelector('.hex-micro-route-list');if(list)list.scrollTop=scroll;requestAnimationFrame(reportRegions);
}
function reportRegions(){
 if(state?.kind!=='routes')return;
 const rows=[],list=root.querySelector('.hex-micro-route-list'),viewport=list?.getBoundingClientRect(),scale=state.scale||1;
 for(const button of root.querySelectorAll('button[data-action]')){
  if(button.disabled)continue;const r=button.getBoundingClientRect(),pin=button.dataset.action==='pin';
  const y=Math.max(r.y,pin?viewport?.y||0:0),bottom=Math.min(r.bottom,pin?viewport?.bottom||innerHeight:innerHeight);
  if(bottom<=y)continue;rows.push({action:button.dataset.action,id:button.dataset.id,x:r.x,y,width:r.width,height:bottom-y});
 }
 if(list&&list.scrollHeight>list.clientHeight){const r=list.getBoundingClientRect();rows.push({action:'scroll',x:r.right-8*scale,y:r.y,width:8*scale,height:r.height});}
 api.regions({context:state.context,rows}).catch(()=>{});
}
document.addEventListener('scroll',reportRegions,true);new ResizeObserver(()=>requestAnimationFrame(reportRegions)).observe(root);
document.addEventListener('click',event=>{const control=event.target.closest('[data-action]');if(control){if(control.dataset.action==='pin'){const list=root.querySelector('.hex-micro-route-list');if(list)list.scrollTop=0;}api.control(control.dataset.action,{context:state?.context,id:control.dataset.id}).catch(()=>{});}});
document.addEventListener('keydown',event=>{if(event.key==='Escape')api.control('tooltip-hide').catch(()=>{});});
api.onPointer(point=>{document.documentElement.dataset.chrome=point&&point.y<16*(state?.scale||1)?'true':'false';const target=point?document.elementFromPoint(point.x,point.y)?.closest('[data-micro-id],[data-micro-hint],[data-micro-pending]'):null;let input=null;
 if(target&&state?.active){const r=target.getBoundingClientRect();if(state.kind==='economy'){const row=target.closest('.ally,.enemy'),side=row?.classList.contains('ally')?'ally':'enemy',index=[...target.parentElement.children].indexOf(target),player=state.equipment?.[side]?.players?.[index];if(player)input={side,id:player.id};}else input=target.dataset.microPending?{kind:'status'}:{kind:target.dataset.microKind,id:target.dataset.microId,route:target.closest('[data-micro-route]')?.dataset.microRoute};if(input)input={...input,context:state.context,rect:{x:r.x,y:r.y,width:r.width,height:r.height}};}
 const key=JSON.stringify(input);if(key!==hoverKey){hoverKey=key;api.hover(input).catch(()=>{});}
});
api.onUpdate(render);render(await api.bootstrap());
