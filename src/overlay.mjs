// Keep the reading position and keyboard target when a configuration changes.
export function preserveOverlay(root){
 const scroll=(root.querySelector('.plan-drawer .drawer-content')||root.querySelector('.drawer'))?.scrollTop||0,active=document.activeElement;
 const expanded=[...root.querySelectorAll('details')].map((d,i)=>({i,label:d.querySelector(':scope > summary')?.textContent,open:d.open}));
 const focused=root.contains(active)?{id:active.id,tag:active.tagName,data:{...active.dataset}}:null;
 return ()=>{
  for(const [i,d] of [...root.querySelectorAll('details')].entries())if(expanded[i]?.label===d.querySelector(':scope > summary')?.textContent)d.open=expanded[i].open;
  const drawer=root.querySelector('.plan-drawer .drawer-content')||root.querySelector('.drawer');if(drawer)drawer.scrollTop=scroll;
  const controls=[...root.querySelectorAll('button,input,select,a')];
  const target=focused?.id?controls.find(el=>el.id===focused.id):focused?.data.action?controls.find(el=>el.tagName===focused.tag&&Object.entries(focused.data).every(([key,value])=>el.dataset[key]===value)):null;
  (target||controls[0])?.focus({preventScroll:true});
 };
}

export function foldConfigurationSections(root){
 let previous=root.querySelector('.guide-launch');
 for(const section of root.querySelectorAll('.drawer-content > section.detail-section')){
  const title=section.querySelector(':scope > h3');if(!title)continue;
  const details=document.createElement('details'),summary=document.createElement('summary');
  details.className='configuration-options';summary.textContent=title.textContent;details.append(summary);if(previous){previous.after(details);previous=details;}else section.before(details);details.append(section);title.remove();
 }
}
