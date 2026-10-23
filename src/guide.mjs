import {windowResizeGrip,installWindowResize} from './window-resize.mjs';
import {applyPresentation} from './presentation-view.mjs';
import {renderGuide} from './guide-view.mjs';
import {createGameTooltips,gameTooltipView} from './game-tooltip-view.mjs';
import {gameReference} from './core/game-reference.mjs';
import {escape as e} from './ui.mjs';
import {createGuideModel,selectGuide} from './core/guide.mjs';
const root=document.getElementById('guide-root'),isPreview=!window.guide;
let snapshot,referenceContext=null,messageTimer,hoverHeader=false;
const api=window.guide||{
 reference:async(kind,id,mode)=>gameReference(window.previewGuideData,kind,id,mode),
 bootstrap:async()=>{
  const {data,state}=await(await fetch('/api/bootstrap')).json(),params=new URLSearchParams(location.search),mode=params.get('mode')||'rift';
  data.flashSlot=state.preferences?.flashSlot;window.previewGuideData=data;
  window.previewGuideState=selectGuide(state.guide,{id:params.get('hero')||'Ashe',role:params.get('role')||(mode==='hex'?'mid':'bottom'),mode,coreIndex:0,conditions:[],augmentIds:[]});
  return {presentation:state.preferences?.presentation,model:createGuideModel(data,window.previewGuideState),phase:'Offline',connected:false};
 },
 hover:async()=>false,
 control:async(action,value)=>{
  const state=window.previewGuideState;
  if(action==='main'){location.href='/src/index.html';return true;}
  if(action==='hide'||action==='fold'){toast('桌面版可关闭或收起小窗');return true;}
  if(action==='reset')state.completedItems=[];
  if(action==='interaction')state.clickThrough=!state.clickThrough;
  if(action==='skill-widget')state.skillWidget={...state.skillWidget,enabled:state.skillWidget?.enabled===false};
  if(action==='jungle-widget')state.jungleWidget={...state.jungleWidget,enabled:state.jungleWidget?.enabled===false};
  if(action==='bottom-quest'&&snapshot.model.bottomQuest?.eligible)state.bottomQuestConfirmed=!state.bottomQuestConfirmed;
  if(action==='purchase-target'){state.purchaseTarget=value||undefined;state.purchaseTargetKind=snapshot.model.shoppingTargets.find(i=>i.id===value)?.kind==='局势备选'?'situation':undefined;}
  return {...snapshot,model:createGuideModel(window.previewGuideData,state)};
 }
};
const image=(kind,id,name)=>`<img ${['item','rune','spell'].includes(kind)?`data-game-tooltip-kind="${kind}" data-game-tooltip-id="${e(id)}"`:''} src="${e(snapshot.model?.imageOverrides?.[`${kind}/${id}`]||`../data/images/${kind}/${id}.png`)}" alt="${e(name)}">`;
const tooltips=createGameTooltips({document,observeRoots:[root],getMode:()=>snapshot?.model?.mode||'rift',getContent:async(kind,id,mode)=>{const reference=await api.reference?.(kind,id,mode,snapshot?.referenceRevision);return reference?gameTooltipView(reference,kind,id,{mode,image}):'';}});
function toast(message){clearTimeout(messageTimer);const el=document.getElementById('guide-toast');el.textContent=message;el.className='visible';messageTimer=setTimeout(()=>el.className='',4000);}
function render(){
 applyPresentation(snapshot?.presentation,{theme:false});
 const m=snapshot?.model,context=JSON.stringify([m?.champion?.id,m?.selection?.role,m?.mode,m?.matchId,snapshot?.referenceRevision,m?.version,m?.fetchedAt]);
 const focused=root.contains(document.activeElement)&&referenceContext===context?document.activeElement:null;
 const focus=focused?{action:focused.dataset.action,id:focused.dataset.id,reference:focused.dataset.referenceFocus}:null;
 if(referenceContext!==context)tooltips.close();referenceContext=context;
 const scroll=root.querySelector('main')?.scrollTop||0;
 document.body.className='compact';root.className='';root.dataset.workspace='overview';
 tooltips.repaint(root,()=>{
  root.innerHTML=renderGuide(snapshot,'overview',isPreview,image)+windowResizeGrip;
  for(const node of root.querySelectorAll('[data-game-tooltip-kind]')){const owner=node.closest('button,a,[tabindex]')||node;if(owner===node)node.tabIndex=0;owner.dataset.referenceFocus=node.dataset.gameTooltipKind+'/'+node.dataset.gameTooltipId;}
  const main=root.querySelector('main');if(main)main.scrollTop=scroll;
  if(focus&&(focus.action||focus.reference)){
   const target=[...root.querySelectorAll('[data-action],[data-reference-focus]')].find(node=>focus.reference?node.dataset.referenceFocus===focus.reference:node.dataset.action===focus.action&&node.dataset.id===focus.id);
   if(target&&!target.disabled)target.focus({preventScroll:true});
  }
 });
}
document.addEventListener('click',async event=>{
 const target=event.target.closest('button[data-action]');if(!target)return;target.disabled=true;
 try{const result=await api.control(target.dataset.action,target.dataset.id);if(result?.model!==undefined){snapshot=result;render();}}
 catch(error){toast(error.message||'操作未完成');}finally{target.disabled=false;}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented)api.control('hide').catch(error=>toast(error.message));});
document.addEventListener('mousemove',event=>{const over=!!event.target?.closest?.('#guide-root>header,[data-window-resize]');if(over!==hoverHeader){hoverHeader=over;api.hover?.(over).catch(()=>{});}});
document.addEventListener('mouseleave',()=>{if(hoverHeader){hoverHeader=false;api.hover?.(false).catch(()=>{});}});
document.addEventListener('error',event=>{if(event.target.tagName==='IMG')event.target.classList.add('missing');},true);
installWindowResize(root,(action,value)=>api.control(action,value));
api.onUpdate?.(next=>{snapshot=next;render();});
try{snapshot=await api.bootstrap();render();}catch(error){root.innerHTML=`<header class="compact-header drag"><b>${e(error.message)}</b><button data-action="hide">×</button></header>`;}
