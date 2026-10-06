import {renderGuide} from './guide-view.mjs';
import {escape as e,icon} from './ui.mjs';
import {createGuideModel,selectGuide} from './core/guide.mjs';
let snapshot,tab='items',messageTimer;
const root=document.getElementById('guide-root');
const isPreview=!window.guide;
const api=window.guide||{
 bootstrap:async()=>{
  const {data,state}=await (await fetch('/api/bootstrap')).json();
  const id=new URLSearchParams(location.search).get('hero')||'Ashe',mode=new URLSearchParams(location.search).get('mode')||'rift';
  const selection={id,role:new URLSearchParams(location.search).get('role')||(mode==='hex'?'mid':'bottom'),mode,coreIndex:0,conditions:[],augmentIds:[]};
  window.previewGuideData=data;window.previewGuideState=selectGuide(state.guide,selection);
  return {model:createGuideModel(data,window.previewGuideState),phase:'Offline',connected:false,hotkeyAvailable:false};
 },
 hover:async()=>false,
 control:async(action,value)=>{
  const s=window.previewGuideState;
  if(action==='hide'){toast('桌面版可隐藏指引窗');return true;}if(action==='main'){location.href='/src/index.html';return true;}
  if(action==='item')s.completedItems=s.completedItems.includes(value)?s.completedItems.filter(id=>id!==value):[...s.completedItems,value];
  if(action==='purchase-target')s.purchaseTarget=value||undefined;if(action==='stage')s.stage=value==='auto'?undefined:value;
  if(action==='condition')s.selection.conditions=s.selection.conditions.includes(value)?s.selection.conditions.filter(c=>c!==value):[...s.selection.conditions,value];if(action==='interaction')s.clickThrough=!s.clickThrough;if(action==='new-game'){s.completedItems=[];s.selection.compareIds=[];s.selection.ownedAugmentIds=[];}if(action==='reset')s.completedItems=[];if(action==='collapse')s.collapsed=!s.collapsed;if(action==='opacity')s.opacity=value;if(action==='ball')s.ball=!s.ball;
  if(action==='copy'){toast('桌面版支持复制');return true;}
  return {...snapshot,ball:!!s.ball,model:createGuideModel(window.previewGuideData,s)};
 },
};
const image=(kind,id,name)=>`<img src="${e(snapshot.model?.imageOverrides?.[`${kind}/${id}`]||`../data/images/${kind}/${id}.png`)}" alt="${e(name)}" />`;
function toast(message){clearTimeout(messageTimer);const el=document.getElementById('guide-toast');el.textContent=message;el.className='visible';messageTimer=setTimeout(()=>el.className='',4000);}
function render(){
 const scroll=root.querySelector('main')?.scrollTop||0,focused=document.activeElement;
 const focus=root.contains(focused)?{id:focused.id,data:{...focused.dataset}}:null;
 const details=[...root.querySelectorAll('details[data-guide-section]')].map(d=>[d.dataset.guideSection,d.open]);
 const ball=!!snapshot?.ball;
 document.body.classList.toggle('ball',ball);
 root.className=ball?'ball':(snapshot?.model?.collapsed?'collapsed':'');
 root.innerHTML=renderGuide(snapshot,tab,isPreview,image);
 for(const [key,open] of details){const d=[...root.querySelectorAll('details[data-guide-section]')].find(d=>d.dataset.guideSection===key);if(d)d.open=open;}
 const main=root.querySelector('main');if(main)main.scrollTop=scroll;
 if(focus){const target=focus.id?document.getElementById(focus.id):[...root.querySelectorAll('button')].find(b=>Object.keys(focus.data).length&&Object.entries(focus.data).every(([k,v])=>b.dataset[k]===v));target?.focus({preventScroll:true});}
}
document.addEventListener('click',async event=>{
 const target=event.target.closest('button');if(!target)return;
 if(target.dataset.tab){tab=target.dataset.tab;render();return;}
 // The floating ball lives on a draggable region: a real drag must move the
 // window, never toggle it. Only a near-stationary press counts as a click.
 if(target.dataset.action==='ball'){const moved=dragMoved;dragMoved=false;if(moved)return;}
 target.disabled=true;
 try{const result=await api.control(target.dataset.action,target.dataset.id);if(result?.model!==undefined){snapshot=result;render();}if(target.dataset.action==='copy')toast('配置已复制');}
 catch(error){toast(error.message||'操作未完成');}finally{target.disabled=false;}
});
document.addEventListener('change',async event=>{const actions={'guide-opacity':'opacity','guide-purchase-target':'purchase-target','guide-stage':'stage'},action=actions[event.target.id];if(action){try{snapshot=await api.control(action,action==='opacity'?Number(event.target.value):event.target.value);render();}catch(error){toast(error.message);}}});
document.addEventListener('keydown',event=>{if(event.key==='Escape')api.control('hide').catch(error=>toast(error.message));});
let hoverHeader=false,downPos=null,dragMoved=false;
document.addEventListener('mousedown',event=>{downPos=[event.screenX,event.screenY];dragMoved=false;});
document.addEventListener('mousemove',event=>{if(event.buttons&&downPos&&Math.hypot(event.screenX-downPos[0],event.screenY-downPos[1])>6)dragMoved=true;});
document.addEventListener('mouseup',()=>{setTimeout(()=>{dragMoved=false;downPos=null;},0);});
function trackHeaderHover(event){
 // mousemove still reaches the page while the window passes clicks through
 // (forward:true). Report header hover on change only, so the main process
 // can lift pass-through for the drag bar + window buttons.
 const over=!!event.target?.closest?.('header');
 if(over!==hoverHeader){hoverHeader=over;api.hover?.(over).catch(()=>{});}
}
document.addEventListener('mousemove',trackHeaderHover);
document.addEventListener('mouseleave',()=>{if(hoverHeader){hoverHeader=false;api.hover?.(false).catch(()=>{});}});
document.addEventListener('error',event=>{if(event.target.tagName==='IMG')event.target.classList.add('missing');},true);
api.onUpdate?.(next=>{if(next.model?.mode!=='hex'&&tab==='augments'||!next.model?.combo&&tab==='team')tab='items';snapshot=next;render();});
try{snapshot=await api.bootstrap();render();}catch(error){root.innerHTML=`<div class="empty"><h2>指引暂时不可用</h2><p>${e(error.message)}</p><button data-action="main">打开完整助手</button></div>`;}
