// Navigation shared by packaged smoke tests after the task-first draft redesign.
// Return the current visible entry; never synthesize state or bypass a handler.
async function revealDraftAction(js,selector){
 let target=selector,openedComparison=false;
 const exists=sel=>js(`!!document.querySelector(${JSON.stringify(sel)})`);
 const click=sel=>js(`document.querySelector(${JSON.stringify(sel)}).click()`);
 const advanced=/data-action=(role-pools|hero-pool|combination-library|exclusions|reset-draft|example|refresh-pairs|style)(?:\]|\b)/.test(selector);
 if(advanced||/data-action=(recommend|reroll|combination-library|draft-filters|draft-scope)/.test(selector)){
  // Favorites and other main pages expose the draft tools through navigation.
  // Use the same entry a player would use before opening the draft disclosure.
  if(!await exists('[data-action=recommend],[data-action=reroll],[data-action=task-compare],[data-action=draft-filters]')&&await exists('[data-action=navigate][data-route=draft]'))await click('[data-action=navigate][data-route=draft]');
  if(!await exists('[data-action=recommend],[data-action=reroll]')&&await exists('[data-action=task-compare]')){
   await click('[data-action=task-compare]');
   openedComparison=true;
   for(let n=0;n<150&&!await exists('[data-action=recommend],[data-action=reroll]');n++)await new Promise(resolve=>setTimeout(resolve,100));
   if(!await exists('[data-action=recommend],[data-action=reroll]'))throw Error('Draft comparison did not open');
  }
  if(/data-action=(recommend|reroll)/.test(selector)){
   if(openedComparison){
    const ready=()=>js('document.querySelector("[data-action=recommend],[data-action=reroll]")?.disabled===false');
    for(let n=0;n<150&&!await ready();n++)await new Promise(resolve=>setTimeout(resolve,100));
    if(!await ready())throw Error('Initial draft comparison stayed pending');
   }
   target=await exists('[data-action=recommend]')?'[data-action=recommend]':'[data-action=reroll]';
  }
 }
 if(selector==='[data-action=my-build]'&&!await exists(selector))target='[data-action=task-edit]';
 if(!await exists(target)&&advanced&&await exists('[data-action=draft-filters]'))await click('[data-action=draft-filters]');
 const filters='[role=dialog][aria-label="推荐偏好"]';
 if(await js(`(()=>{const dialog=document.querySelector(${JSON.stringify(filters)}),el=document.querySelector(${JSON.stringify(target)});return !!dialog&&!!el&&!dialog.contains(el);})()`))await click(filters+' [data-action=close]');
 // Follow the same disclosure path available to a player before clicking.
 if(await exists(target))await js(`(()=>{const el=document.querySelector(${JSON.stringify(target)}),closed=[];for(let parent=el.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS'&&!parent.open&&parent.querySelector(':scope > summary')!==el)closed.push(parent);for(const parent of closed.reverse())parent.querySelector(':scope > summary')?.click();})()`);
 return target;
}
module.exports={revealDraftAction};
