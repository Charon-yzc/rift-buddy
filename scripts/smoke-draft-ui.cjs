// Navigation shared by packaged smoke tests after the task-first draft redesign.
// Return the current visible entry; never synthesize state or bypass a handler.
async function revealDraftAction(js,selector){
 let target=selector;
 const exists=sel=>js(`!!document.querySelector(${JSON.stringify(sel)})`);
 const click=sel=>js(`document.querySelector(${JSON.stringify(sel)}).click()`);
 if(/data-action=(recommend|reroll|combination-library|draft-filters)/.test(selector)){
  if(!await exists('[data-action=recommend]')&&await exists('[data-action=task-compare]'))await click('[data-action=task-compare]');
  if(/data-action=(recommend|reroll)/.test(selector))target=await exists('[data-action=recommend]')?'[data-action=recommend]':'[data-action=reroll]';
 }
 if(selector==='[data-action=my-build]'&&!await exists(selector))target='[data-action=task-edit]';
 if(!await exists(target)&&/data-action=(role-pools|hero-pool|exclusions|reset-draft|example|refresh-pairs)|data-action=style/.test(selector)&&await exists('[data-action=draft-filters]'))await click('[data-action=draft-filters]');
 // Follow the same disclosure path available to a player before clicking.
 if(await exists(target))await js(`(()=>{const el=document.querySelector(${JSON.stringify(target)});for(let parent=el.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;})()`);
 return target;
}
module.exports={revealDraftAction};
