// Preserve native details across app renders without treating list positions as identity.
const attr=(node,name)=>node?.getAttribute?.(name)?.trim()||'';
const text=node=>(node?.textContent||'').replace(/\s+/g,' ').trim();
const children=node=>Array.from(node.children||[]);
const descendants=node=>Array.from(node.querySelectorAll('*'));
const summary=node=>children(node).find(child=>child.tagName==='SUMMARY');
const classes=node=>attr(node,'class').split(/\s+/).filter(name=>name&&!/^(active|on|featured|open|expanded|collapsed|selected|disabled|loading|pending)$/.test(name)).sort();
const companionKey=node=>attr(node,'data-companion-disclosure').replace(/^candidate-\d+$/,'candidate');
const explicitKey=node=>attr(node,'data-disclosure-key')||companionKey(node)||attr(node,'id');

function objectControls(node){
 return [...new Set(descendants(node).filter(child=>attr(child,'data-id')&&attr(child,'data-role')).map(child=>JSON.stringify([
  attr(child,'data-id'),attr(child,'data-role'),attr(child,'data-mode'),attr(child,'data-combo'),attr(child,'data-member'),
 ])))].sort();
}

function candidateKey(node,detail){
 const result=attr(node,'data-result-id'),objects=objectControls(node);
 // An index alone cannot identify a candidate after rerolling or reordering.
 if(!result&&!objects.length)return null;
 const description=descendants(node).find(child=>classes(child).includes('candidate-summary'));
 const label=summary(detail);
 return ['candidate',result,objects,attr(description,'title')||text(description),attr(label,'aria-label')||text(label)];
}

function heading(node){
 const direct=children(node).find(child=>/^H[1-6]$/.test(child.tagName));
 if(direct)return text(direct);
 const header=children(node).find(child=>child.tagName==='HEADER'||classes(child).includes('panel-head'));
 return header?text(descendants(header).find(child=>/^H[1-6]$/.test(child.tagName))):'';
}

function identity(detail,root){
 const ancestors=[];
 for(let node=detail.parentElement;node&&node!==root;node=node.parentElement)ancestors.unshift(node);
 const context=[],parents=[],structure=[];
 const candidate=ancestors.findLast(node=>attr(node,'data-result-index'));
 if(candidate){const key=candidateKey(candidate,detail);if(!key)return null;context.push(key);}
 for(const node of ancestors){
  for(const name of ['data-reference-champion','data-plan','data-disclosure-context','data-result-id']){
   const value=attr(node,name);if(value)context.push([name,value]);
  }
  if(attr(node,'data-id')&&attr(node,'data-role'))context.push(['hero',attr(node,'data-id'),attr(node,'data-role'),attr(node,'data-mode')]);
  if(node.tagName==='ARTICLE'&&node!==candidate){const objects=objectControls(node);if(objects.length)context.push(['objects',objects]);}
  if(node.tagName==='DETAILS')parents.push(explicitKey(node)||text(summary(node)));
  const id=attr(node,'id'),label=attr(node,'aria-label'),names=classes(node),title=heading(node);
  if(id||label||names.length||title||node.tagName==='DETAILS')structure.push([node.tagName,id,names,label,title,node.tagName==='DETAILS'?explicitKey(node)||text(summary(node)):'']);
 }
 // Configuration controls often carry the plan key rather than their container.
 const plans=[...new Set(descendants(detail).map(node=>attr(node,'data-plan')).filter(Boolean))];
 if(plans.length===1)context.push(['plan',plans[0]]);
 const key=explicitKey(detail);
 if(key)return JSON.stringify(['key',key,context,parents]);
 const label=text(summary(detail));
 return label?JSON.stringify(['summary',label,context,structure,classes(detail)]):null;
}

function uniqueDisclosures(root){
 const found=new Map(),ambiguous=new Set();
 for(const detail of root?.querySelectorAll('details')||[]){
  const key=identity(detail,root);
  if(!key||ambiguous.has(key))continue;
  if(found.has(key)){found.delete(key);ambiguous.add(key);}else found.set(key,detail);
 }
 return found;
}

export function createDisclosureState(){
 const scopes=new Map();
 return {
  capture(scope,root){
   if(!scope||!root)return 0;
   const current=uniqueDisclosures(root);
   if(!scopes.has(scope)&&scopes.size>=32)scopes.delete(scopes.keys().next().value);
   scopes.set(scope,new Map([...current].map(([key,detail])=>[key,!!detail.open])));
   return current.size;
  },
  restore(scope,root){
   const saved=scopes.get(scope);if(!saved||!root)return 0;
   let restored=0;
   for(const [key,detail]of uniqueDisclosures(root))if(saved.has(key)){detail.open=saved.get(key);restored++;}
   return restored;
  },
 };
}
