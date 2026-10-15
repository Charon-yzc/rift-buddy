import test from 'node:test';
import assert from 'node:assert/strict';
import {createDisclosureState} from '../src/disclosure-state.mjs';

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
const candidate=(index,hero,{role='mid',combo='team-a',plan='接控',open=false,companion=true}={})=>{
 const disclosure=detail('详情',{'data-companion-disclosure':companion?`candidate-${index}`:'',class:'candidate-details',open});
 disclosure.children[0].attributes['aria-label']='查看'+plan+'的详情';
 return {disclosure,node:el('article',{class:`companion-candidate ${index===0?'featured':''}`,'data-result-index':String(index)},
  el('button',{'data-id':hero,'data-role':role,'data-combo':combo}),el('p',{class:'candidate-summary',title:plan},plan),disclosure)};
};

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

test('candidate state follows its semantics when indexes and featured position change',()=>{
 const state=createDisclosureState(),a=candidate(0,'Ahri',{open:true}),b=candidate(1,'Lux');
 state.capture('draft',root(a.node,b.node));
 const reorderedB=candidate(0,'Lux'),reorderedA=candidate(1,'Ahri'),newCandidate=candidate(2,'Vex');
 state.restore('draft',root(reorderedB.node,reorderedA.node,newCandidate.node));
 assert.equal(reorderedA.disclosure.open,true);assert.equal(reorderedB.disclosure.open,false);assert.equal(newCandidate.disclosure.open,false);
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
