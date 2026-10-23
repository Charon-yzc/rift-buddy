// Preserve native browser state only around a changed card's HTML boundary.
// Vue owns list identity; this directive does not diff DOM or scan other cards.
const snapshots=new WeakMap();
const summary=detail=>Array.from(detail.children).find(child=>child.tagName==='SUMMARY')?.textContent.trim()||'';
function disclosures(root){
 const unique=new Map(),ambiguous=new Set();
 for(const detail of root.querySelectorAll('details')){
  const labels=[];for(let parent=detail.parentElement;parent&&parent!==root;parent=parent.parentElement)if(parent.tagName==='DETAILS')labels.unshift(summary(parent));
  const event=detail.closest('.history-event'),build=detail.closest('.history-build'),panel=detail.closest('[role="tabpanel"]');
  const key=JSON.stringify([panel?.getAttribute('aria-labelledby'),build?.id,event?.querySelector('p')?.textContent,labels,detail.id||detail.getAttribute('data-disclosure-key')||summary(detail)]);
  if(ambiguous.has(key))continue;
  if(unique.has(key)){unique.delete(key);ambiguous.add(key);}else unique.set(key,detail);
 }
 return unique;
}
const fields=['id','data-action','data-history-chart','data-chart-field','data-value','data-tip-player','data-history-tip','data-tip-id'];
const controlKey=node=>JSON.stringify([node.tagName,...fields.map(field=>node.getAttribute(field))]);
export const preserveHistoryCard={
 beforeUpdate(root,binding){
  if(binding.value===binding.oldValue)return;
  const active=root.ownerDocument.activeElement,focused=root.contains(active)&&active.matches('input,textarea,select,button,summary')?active:null;
  const states=new Map([...disclosures(root)].map(([key,node])=>[key,node.open]));
  const focus=focused?{key:controlKey(focused),start:focused.selectionStart,end:focused.selectionEnd}:null;
  snapshots.set(root,{states,focus});
 },
 updated(root){
  const snapshot=snapshots.get(root);if(!snapshot)return;snapshots.delete(root);
  for(const [key,node] of disclosures(root))if(snapshot.states.has(key))node.open=snapshot.states.get(key);
  if(snapshot.focus){
   const targets=[...root.querySelectorAll('input,textarea,select,button,summary')].filter(node=>controlKey(node)===snapshot.focus.key);
   if(targets.length===1&&!targets[0].disabled){const target=targets[0];target.focus({preventScroll:true});try{target.setSelectionRange(snapshot.focus.start,snapshot.focus.end);}catch{}}
  }
 },
};
