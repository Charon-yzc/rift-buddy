// Closed disclosures in an events card hold most of its markup (per-kill damage
// tables, event maps). Their content waits in an inert <template> until first
// opened, so unopened rows add no DOM nodes, style work or card-state scanning.
export const lazyDetails=(summary,body)=>`<details data-lazy-details><summary>${summary}</summary><template>${body}</template></details>`;
export function expandLazyDetails(detail){
 if(!detail?.matches?.('details[data-lazy-details]'))return false;
 const template=Array.from(detail.children).find(child=>child.tagName==='TEMPLATE');
 if(!template)return false;
 template.replaceWith(template.content);return true;
}
// Fill before a summary click opens it (no empty frame), and on any other open.
export function installLazyDetails(doc){
 doc.addEventListener('click',event=>{const summary=event.target.closest?.('summary');if(summary)expandLazyDetails(summary.parentElement);},true);
 doc.addEventListener('toggle',event=>{if(event.target.open)expandLazyDetails(event.target);},true);
}
