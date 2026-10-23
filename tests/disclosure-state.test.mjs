import test from 'node:test';
import assert from 'node:assert/strict';
import {createDisclosureState} from '../src/disclosure-state.mjs';
import fs from 'node:fs/promises';import vm from 'node:vm';import {escape} from '../src/ui.mjs';

// Minimal DOM-shaped fixtures; only standard Element properties are used by the module.
class Element{
 constructor(tag,attributes={},content=[]){
  this.tagName=tag.toUpperCase();this.attributes=attributes;this.children=[];this.parentElement=null;this.content='';this.open=!!attributes.open;
  for(const child of content){if(typeof child==='string')this.content+=child;else{this.children.push(child);child.parentElement=this;}}
 }
 getAttribute(name){return this.attributes[name]??null;}
 get textContent(){return this.content+this.children.map(child=>child.textContent).join(' ');}
 querySelectorAll(selector){
  const nodes=this.children.flatMap(child=>[child,...child.querySelectorAll('*')]);
  return selector==='*'?nodes:nodes.filter(child=>child.tagName===selector.toUpperCase());
 }
}
const el=(tag,attributes={},...content)=>new Element(tag,attributes,content);
const root=(...content)=>el('main',{},...content);
const detail=(label,attributes={},...content)=>el('details',attributes,el('summary',{},label),...content);
const panel=(title,...content)=>el('section',{class:'panel'},el('div',{class:'panel-head'},el('h3',{},title)),el('div',{class:'panel-body'},...content));
const select=(id,values)=>el('select',{id},...values.map(value=>el('option',{value},value)));
const candidate=(index,hero,{role='mid',combo='team-a',plan='接控',open=false,companion=true}={})=>{
 const disclosure=detail('详情',{'data-companion-disclosure':companion?`candidate-${index}`:'',class:'candidate-details',open});
 disclosure.children[0].attributes['aria-label']='查看'+plan+'的详情';
 return {disclosure,node:el('article',{class:`companion-candidate ${index===0?'featured':''}`,'data-result-index':String(index)},
  el('button',{'data-id':hero,'data-role':role,'data-combo':combo}),el('p',{class:'candidate-summary',title:plan},plan),disclosure)};
};

test('actual Hex tools render opens the first owned note through disclosure restoration, then respects explicit closing',async()=>{
 const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8'),start=source.indexOf('function renderHexTools(){'),end=source.indexOf('\n',start),state=createDisclosureState();let round='first';
 const context=vm.createContext({e:escape,hexOptions:[],hexOwned:[],hexHero:'Sona',data:{},hexPreparedPlan:()=>null,currentHexRound:()=>({context:round}),renderHexComparison:()=>'',renderHexReference:()=>''});vm.runInContext(source.slice(start,end),context);
 const rendered=()=>{const html=context.renderHexTools(),match=/<details class="hex-handbook-tools"([^>]*)><summary>([^<]*)<\/summary>/.exec(html);assert(match);const key=/data-disclosure-key="([^"]+)"/.exec(match[1])?.[1];return detail(match[2],{class:'hex-handbook-tools',...(key?{'data-disclosure-key':key}:{}),open:/\sopen(?:\s|$)/.test(match[1])});};
 const empty=rendered();assert.equal(empty.open,false);state.capture('hex',root(empty));context.hexOwned=[1141];const first=rendered();state.restore('hex',root(first));assert.equal(first.open,true,'initial closed empty panel must not hide the first owned note');
 first.open=false;state.capture('hex',root(first));context.hexOwned=[1141,1048];const closed=rendered();state.restore('hex',root(closed));assert.equal(closed.open,false,'a deliberate close is respected within the same game');round='next';const next=rendered();state.restore('hex',root(next));assert.equal(next.open,true,'another game cannot inherit a closed panel');
});

test('rendered open and closed choices survive per page and sidebar scope',()=>{
 const state=createDisclosureState(),settings=detail('连接说明',{'data-companion-disclosure':'help',open:true});
 state.capture('page:settings',root(settings));
 const room=detail('连接说明',{'data-companion-disclosure':'help'});state.capture('sidebar:room',root(room));
 const settingsAgain=detail('文案可以调整',{'data-companion-disclosure':'help'});
 const roomAgain=detail('连接说明',{'data-companion-disclosure':'help',open:true});
 assert.equal(state.restore('page:settings',root(settingsAgain)),1);assert.equal(settingsAgain.open,true);
 state.restore('sidebar:room',root(roomAgain));assert.equal(roomAgain.open,false);
 const other=detail('连接说明',{'data-companion-disclosure':'help'});assert.equal(state.restore('page:reference',root(other)),0);assert.equal(other.open,false);
});

test('a native role select keeps focus across background updates but a changed or ambiguous enum is rejected',()=>{
 const state=createDisclosureState(),old=select('solo-role',['','top','mid']),before=root(old);before.ownerDocument={activeElement:old};
 const key=state.captureFocus(before);assert.ok(key);
 const current=select('solo-role',['','top','mid']);let focused=0;current.focus=options=>{focused++;assert.equal(options.preventScroll,true);};
 assert.equal(state.restoreFocus(key,root(current)),true);assert.equal(focused,1);
 const changed=select('solo-role',['','support']);changed.focus=()=>{throw Error('Different choices must not inherit focus');};
 assert.equal(state.restoreFocus(key,root(changed)),false);
 const duplicate=select('solo-role',['','top','mid']);duplicate.focus=()=>{throw Error('Ambiguous IDs must not inherit focus');};
 assert.equal(state.restoreFocus(key,root(current,duplicate)),false);
 current.disabled=true;assert.equal(state.restoreFocus(key,root(current)),false);
});

test('candidate state follows its semantics when indexes and featured position change',()=>{
 const state=createDisclosureState(),a=candidate(0,'Ahri',{open:true}),b=candidate(1,'Lux');
 state.capture('draft',root(a.node,b.node));
 const reorderedB=candidate(0,'Lux'),reorderedA=candidate(1,'Ahri'),newCandidate=candidate(2,'Vex');
 state.restore('draft',root(reorderedB.node,reorderedA.node,newCandidate.node));
 assert.equal(reorderedA.disclosure.open,true);assert.equal(reorderedB.disclosure.open,false);assert.equal(newCandidate.disclosure.open,false);
});

test('focused summaries follow the same candidate across replacement without scrolling',()=>{
 const state=createDisclosureState(),before=candidate(0,'Ahri'),oldRoot=root(before.node);
 oldRoot.ownerDocument={activeElement:before.disclosure.children[0]};
 const key=state.captureFocus(oldRoot);assert.ok(key);
 const after=candidate(2,'Ahri'),newRoot=root(candidate(0,'Lux').node,after.node),document={activeElement:null};newRoot.ownerDocument=document;
 let options;after.disclosure.children[0].focus=value=>{options=value;document.activeElement=after.disclosure.children[0];};
 assert.equal(state.restoreFocus(key,newRoot),true);assert.equal(document.activeElement,after.disclosure.children[0]);assert.deepEqual(options,{preventScroll:true});
});

test('a different or ambiguous candidate never inherits keyboard focus',()=>{
 const state=createDisclosureState(),before=candidate(0,'Ahri'),oldRoot=root(before.node);oldRoot.ownerDocument={activeElement:before.disclosure.children[0]};
 const key=state.captureFocus(oldRoot);
 for(const replacement of [candidate(0,'Lux'),candidate(0,'Ahri',{role:'support'}),candidate(0,'Ahri',{combo:'team-b'})]){
  replacement.disclosure.children[0].focus=()=>assert.fail('Focus moved to another candidate');
  assert.equal(state.restoreFocus(key,root(replacement.node)),false);
 }
 const a=candidate(0,'Ahri'),b=candidate(1,'Ahri');a.disclosure.children[0].focus=b.disclosure.children[0].focus=()=>assert.fail('Ambiguous focus');
 assert.equal(state.restoreFocus(key,root(a.node,b.node)),false);
});

test('disclosure focus capture ignores unrelated controls and foreign summaries',()=>{
 const state=createDisclosureState(),inside=detail('更多',{id:'inside'}),foreign=detail('更多',{id:'outside'}),view=root(inside);
 view.ownerDocument={activeElement:el('button')};assert.equal(state.captureFocus(view),null);
 view.ownerDocument.activeElement=foreign.children[0];assert.equal(state.captureFocus(view),null);
 assert.equal(state.restoreFocus(null,view),false);
});

test('hero and proposal button focus follows the same candidate after vote filtering or reordering',()=>{
 const state=createDisclosureState(),before=candidate(0,'Ahri'),button=before.node.children[0];button.attributes['data-action']='build';button.attributes['data-result-index']='0';
 const proposal=el('button',{'data-action':'propose-result','data-index':'0'});before.node.children.push(proposal);proposal.parentElement=before.node;
 for(const active of [button,proposal]){
  const oldRoot=root(before.node);oldRoot.ownerDocument={activeElement:active};const key=state.captureFocus(oldRoot);assert.ok(key);
  const after=candidate(3,'Ahri'),hero=after.node.children[0];hero.attributes['data-action']='build';hero.attributes['data-result-index']='3';
  const nextProposal=el('button',{'data-action':'propose-result','data-index':'3'});after.node.children.push(nextProposal);nextProposal.parentElement=after.node;
  const target=active===button?hero:nextProposal;let options;target.focus=value=>{options=value;};
  assert.equal(state.restoreFocus(key,root(candidate(0,'Lux').node,after.node)),true);assert.deepEqual(options,{preventScroll:true});
  const changed=candidate(0,'Lux');changed.node.children[0].attributes['data-action']='build';changed.node.children[0].focus=()=>assert.fail('Different candidate received focus');
  assert.equal(state.restoreFocus(key,root(changed.node)),false);
 }
});

test('stable button actions restore without using vote labels and reject disabled or ambiguous controls',()=>{
 const state=createDisclosureState(),old=el('button',{'data-action':'room-vote','data-key':'proposal-a'},'投票 1'),view=root(old);view.ownerDocument={activeElement:old};
 const key=state.captureFocus(view),after=el('button',{'data-action':'room-vote','data-key':'proposal-a'},'已投 2');let focused=0;after.focus=()=>focused++;
 assert.equal(state.restoreFocus(key,root(after)),true);assert.equal(focused,1);
 after.disabled=true;assert.equal(state.restoreFocus(key,root(after)),false);after.disabled=false;
 after.checkVisibility=()=>false;assert.equal(state.restoreFocus(key,root(after)),false);delete after.checkVisibility;
 const duplicate=el('button',{'data-action':'room-vote','data-key':'proposal-a'});duplicate.focus=()=>assert.fail('Ambiguous target');
 assert.equal(state.restoreFocus(key,root(after,duplicate)),false);
});

test('a reused candidate index never opens a different hero, role, combination or plan',()=>{
 const state=createDisclosureState(),original=candidate(0,'Ahri',{open:true});state.capture('draft',root(original.node));
 for(const replacement of [candidate(0,'Lux'),candidate(0,'Ahri',{role:'support'}),candidate(0,'Ahri',{combo:'team-b'}),candidate(0,'Ahri',{plan:'保护核心'})]){
  assert.equal(state.restore('draft',root(replacement.node)),0);assert.equal(replacement.disclosure.open,false);
 }
 const anonymous=detail('详情',{'data-companion-disclosure':'candidate-0',open:true});
 assert.equal(state.capture('unknown',root(el('article',{'data-result-index':'0'},anonymous))),0);
});

test('main-window candidates without explicit disclosure attributes use the same safe context',()=>{
 const state=createDisclosureState(),before=candidate(0,'Garen',{companion:false,role:'top',open:true});state.capture('draft',root(before.node));
 const moved=candidate(3,'Garen',{companion:false,role:'top'});state.restore('draft',root(moved.node));assert.equal(moved.disclosure.open,true);
 const changed=candidate(0,'Darius',{companion:false,role:'top'});state.restore('draft',root(changed.node));assert.equal(changed.disclosure.open,false);
});

test('plain settings summaries use labeled structure without sibling positions',()=>{
 const state=createDisclosureState(),connection=detail('说明',{open:true}),display=detail('说明');
 state.capture('settings',root(panel('连接',connection),panel('显示',display)));
 const displayAgain=detail('说明'),connectionAgain=detail('说明');
 state.restore('settings',root(el('p',{},'新增状态'),panel('显示',displayAgain),panel('连接',connectionAgain)));
 assert.equal(connectionAgain.open,true);assert.equal(displayAgain.open,false);
});

test('ambiguous identities are ignored on capture and restore',()=>{
 const state=createDisclosureState();
 assert.equal(state.capture('duplicate',root(detail('说明',{id:'same',open:true}),detail('说明',{id:'same'}))),0);
 const after=detail('说明',{id:'same'});state.restore('duplicate',root(after));assert.equal(after.open,false);
 state.capture('single',root(detail('说明',{id:'same',open:true})));
 const a=detail('说明',{id:'same'}),b=detail('说明',{id:'same'});assert.equal(state.restore('single',root(a,b)),0);assert.equal(a.open,false);assert.equal(b.open,false);
});

test('hero and role context prevents another object inheriting a stable disclosure name',()=>{
 const state=createDisclosureState(),before=detail('来源',{'data-companion-disclosure':'source',open:true});
 state.capture('reference',root(el('section',{'data-reference-champion':'Ahri'},before)));
 const other=detail('来源',{'data-companion-disclosure':'source'});state.restore('reference',root(el('section',{'data-reference-champion':'Lux'},other)));assert.equal(other.open,false);
 const roleBefore=detail('配合',{open:true});state.capture('room',root(el('article',{},el('button',{'data-id':'Ahri','data-role':'mid'}),roleBefore)));
 const roleAfter=detail('配合');state.restore('room',root(el('article',{},el('button',{'data-id':'Ahri','data-role':'support'}),roleAfter)));assert.equal(roleAfter.open,false);
});

test('configuration plan keys and enclosing disclosures separate nested explanations',()=>{
 const state=createDisclosureState(),source=detail('配置来源',{id:'source',open:true},el('button',{'data-plan':'Ahri:mid:rift'}));state.capture('plan',root(source));
 const next=detail('配置来源',{id:'source'},el('button',{'data-plan':'Lux:support:rift'}));state.restore('plan',root(next));assert.equal(next.open,false);
 const first=detail('依据',{open:true}),second=detail('依据');state.capture('nested',root(detail('装备',{},first),detail('符文',{},second)));
 const firstAgain=detail('依据'),secondAgain=detail('依据');state.restore('nested',root(detail('符文',{},secondAgain),detail('装备',{},firstAgain)));
 assert.equal(firstAgain.open,true);assert.equal(secondAgain.open,false);
});
