// Keep the reading position and keyboard target when a configuration changes.
export function preserveOverlay(root){
 const scroll=(root.querySelector('.plan-drawer .drawer-content')||root.querySelector('.drawer'))?.scrollTop||0,active=document.activeElement;
 const focused=root.contains(active)?{id:active.id,tag:active.tagName,data:{...active.dataset}}:null;
 return ()=>{
  const drawer=root.querySelector('.plan-drawer .drawer-content')||root.querySelector('.drawer');if(drawer)drawer.scrollTop=scroll;
  const controls=[...root.querySelectorAll('button,input,select,a')];
  const target=focused?.id?controls.find(el=>el.id===focused.id):focused?.data.action?controls.find(el=>el.tagName===focused.tag&&Object.entries(focused.data).every(([key,value])=>el.dataset[key]===value)):null;
  (target||controls[0])?.focus({preventScroll:true});
 };
}
