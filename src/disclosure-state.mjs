// Preserve native details across app renders without treating list positions as identity.
const attr=(node,name)=>node?.getAttribute?.(name)?.trim()||'';
const text=node=>(node?.textContent||'').replace(/\s+/g,' ').trim();
const children=node=>Array.from(node.children||[]);
const descendants=node=>Array.from(node.querySelectorAll('*'));
const summary=node=>children(node).find(child=>child.tagName==='SUMMARY');
const managed=node=>{for(let p=node;p;p=p.parentElement)if(attr(p,'data-vue-host'))return true;return false;};
const classes=node=>attr(node,'class').split(/\s+/).filter(name=>name&&!/^(active|on|featured|open|expanded|collapsed|selected|disabled|loading|pending)$/.test(name)).sort();
const companionKey=node=>attr(node,'data-companion-disclosure').replace(/^candidate-\d+$/,'candidate');
const explicitKey=node=>attr(node,'data-disclosure-key')||companionKey(node)||attr(node,'id');

// One scan pass reuses each container's controls and heading: every
// disclosure inside a large card (one per champion on an ongoing player card)
// would otherwise rescan the whole card.
let passMemo=null;
function scanPass(run){if(passMemo)return run();passMemo={controls:new Map(),headings:new Map()};try{return run();}finally{passMemo=null;}}
const remembered=(kind,read)=>node=>{const memo=passMemo?.[kind];if(memo?.has(node))return memo.get(node);const value=read(node);memo?.set(node,value);return value;};
const objectControls=remembered('controls',scanControls);
function scanControls(node){
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

const heading=remembered('headings',readHeading);
function readHeading(node){
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

const uniqueDisclosures=root=>scanPass(()=>scanDisclosures(root));
function scanDisclosures(root){
 const found=new Map(),ambiguous=new Set();
 for(const detail of root?.querySelectorAll('details')||[]){
  if(managed(detail))continue;
  const key=identity(detail,root);
  if(!key||ambiguous.has(key))continue;
  if(found.has(key)){found.delete(key);ambiguous.add(key);}else found.set(key,detail);
 }
 return found;
}

function buttonIdentity(node,root){
 const action=attr(node,'data-action');if(!action)return null;
 const candidate=(()=>{for(let p=node.parentElement;p&&p!==root;p=p.parentElement)if(attr(p,'data-result-index'))return p;return null;})();
 const detail=candidate&&descendants(candidate).find(child=>child.tagName==='DETAILS'&&classes(child).includes('candidate-details'));
 const candidateContext=candidate?(detail?candidateKey(candidate,detail):null):null;
 if(candidate&&!candidateContext)return null;
 const names=node.getAttributeNames?.()||Object.keys(node.attributes||{});
 const attributes=names.filter(name=>name==='id'||name.startsWith('data-')&&!(candidate&&['data-index','data-result-index'].includes(name))).sort().map(name=>[name,attr(node,name)]);
 const parents=[];
 for(let p=node.parentElement;p&&p!==root;p=p.parentElement)if(p.tagName==='DETAILS')parents.unshift(explicitKey(p)||text(summary(p)));
 return JSON.stringify(['button',attributes,candidateContext,parents]);
}

const uniqueFocusTargets=root=>scanPass(()=>scanFocusTargets(root));
function scanFocusTargets(root){
 const found=new Map(),ambiguous=new Set();
 const add=(key,target)=>{if(!key||ambiguous.has(key))return;if(found.has(key)){found.delete(key);ambiguous.add(key);}else found.set(key,target);};
 for(const [key,detail]of uniqueDisclosures(root))add(key,summary(detail));
  for(const node of root?.querySelectorAll('button')||[])if(!managed(node))add(buttonIdentity(node,root),node);
  for(const node of root?.querySelectorAll('select')||[]){
   if(managed(node))continue;
  const id=attr(node,'id');if(!id)continue;
  const options=descendants(node).filter(child=>child.tagName==='OPTION').map(child=>[attr(child,'value'),child.getAttribute('disabled')!==null]);
  add(JSON.stringify(['select',id,attr(node,'name'),options]),node);
 }
 return found;
}

export function createDisclosureState(){
 const scopes=new Map();
 return {
  captureFocus(root){
   const active=root?.ownerDocument?.activeElement;
   if(!['SUMMARY','BUTTON','SELECT'].includes(active?.tagName))return null;
   if(managed(active))return null;
   for(const [key,target] of uniqueFocusTargets(root))if(target===active)return key;
   return null;
  },
  restoreFocus(key,root){
   if(!key)return false;
   const target=uniqueFocusTargets(root).get(key);
   if(typeof target?.focus!=='function'||target.disabled||target.checkVisibility?.()===false)return false;
   target.focus({preventScroll:true});
   return true;
  },
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
  clear(){scopes.clear();},
 };
}
