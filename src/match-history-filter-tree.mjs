import {HISTORY_FILTER_LIMITS,RULE_FIELDS,validateHistoryFilterTree} from './core/match-history/filters.mjs';

// Pure UI operations: no storage, clock reads, network requests or filter evaluation.
// Paths are '' for the root, '0.1' for group children; NOT/scope have child index 0.
// Every operation returns a fresh validated tree (or null), or throws for the UI to report.
export const HISTORY_FILTER_PRESET_LIMITS=Object.freeze({count:12,name:64,text:32768});
export const HISTORY_FILTER_KINDS=Object.freeze([['rule','条件'],['and','全部满足 AND'],['or','任一满足 OR'],['not','不满足 NOT'],['scope','同一玩家范围']]);
const LIST_FIELDS=new Set(['item','rune','style','augment','spell']);
const EQUALITY_FIELDS=new Set(['player','position','result','mode','gameType','pve','matched','surrender',...LIST_FIELDS]);
const NO_SHARE=new Set([...EQUALITY_FIELDS,'queue','duration','created','map','kp','dgr','champion']);
const EDIT_FIELDS=new Set(['field','operator','value','scope','player','quantifier','measure','minQuantity','slot']);
const fail=message=>{throw Error('筛选编辑：'+message);};
const typeOf=node=>node?.type||'rule';
const defaultValue=field=>({item:1055,rune:8005,style:8000,augment:1,spell:4,champion:1,queue:420,map:11,player:'待选择玩家',position:'TOP',result:'win',mode:'CLASSIC',gameType:'MATCHED_GAME',pve:false,matched:true,surrender:false}[field]??0);
const defaultRule=()=>({field:'kills',operator:'>=',value:0});
const group=node=>['and','or'].includes(typeOf(node));
function pathParts(path=''){
 if(typeof path!=='string'||path.length>32||path!==''&&!/^(?:0|[1-9]\d?)(?:\.(?:0|[1-9]\d?))*$/.test(path))fail('条件路径不正确');
 const parts=path===''?[]:path.split('.').map(Number);
 if(parts.length>=HISTORY_FILTER_LIMITS.depth)fail('条件路径超过深度上限');
 return parts;
}
function visitPath(node,parts,change){
 if(!parts.length)return change(node);
 const [index,...rest]=parts;
 if(group(node)){
  if(index>=node.children.length)fail('条件路径不存在');
  const children=node.children.map((child,i)=>i===index?visitPath(child,rest,change):child).filter(child=>child!==null);
  return children.length?{...node,children}:null;
 }
 if(['not','scope'].includes(typeOf(node))&&index===0){const child=visitPath(node.child,rest,change);return child?{...node,child}:null;}
 fail('条件路径不存在');
}
function changeKind(node,kind){
 if(!HISTORY_FILTER_KINDS.some(([value])=>value===kind))fail('节点类型不正确');
 if(kind===typeOf(node)&&node)return node;
 if(kind==='rule')return defaultRule();
 const child=node||defaultRule();
 if(kind==='and'||kind==='or')return {type:kind,children:group(node)?node.children:[child]};
 return kind==='not'?{type:kind,child}:{type:kind,scope:'self',child};
}
function setField(node,field,value){
 if(!node||!EDIT_FIELDS.has(field))fail('不可编辑的字段');
 if(typeOf(node)==='scope'&&!['scope','player','quantifier'].includes(field)||!['scope','rule'].includes(typeOf(node)))fail('此节点不支持该字段');
 const next={...node};
 if(field==='field'){
  if(!Object.hasOwn(RULE_FIELDS,value))fail('筛选字段不正确');
  next.field=value;next.value=defaultValue(value);next.operator=EQUALITY_FIELDS.has(value)?'=':'>=';
  delete next.measure;delete next.minQuantity;delete next.slot;
 }else if(field==='scope'&&value===''){
  delete next.scope;delete next.player;delete next.quantifier;
 }else if(value===''&&['player','quantifier','measure','minQuantity','slot'].includes(field))delete next[field];
 else next[field]=value;
 return next;
}
/** action: add | remove | kind | set. add targets a parent; kind wraps existing nodes. */
export function updateHistoryFilterTree(tree,{action,path='',kind='rule',field,value}={}){
 const parts=pathParts(path);
 if(action==='remove'&&!parts.length)return null;
 const copy=validateHistoryFilterTree(tree??null);
 const result=visitPath(copy,parts,node=>{
  if(action==='remove')return null;
  if(action==='kind')return changeKind(node,kind);
  if(action==='set')return setField(node,field,value);
  if(action==='add'){
   const child=changeKind(null,kind);
   if(!node)return child;
   if(!group(node))fail('请先把父节点改为 AND / OR 组合');
   return {...node,children:[...node.children,child]};
  }
  fail('编辑操作不正确');
 });
 return validateHistoryFilterTree(result);
}
export const historyFilterSupportsShare=field=>Object.hasOwn(RULE_FIELDS,field)&&!NO_SHARE.has(field);
export const historyFilterUsesEquality=field=>EQUALITY_FIELDS.has(field);
export const historyFilterIsResource=field=>LIST_FIELDS.has(field);

function snapshot(filter={}){
 const result={};
 for(const key of ['result','position','from','to'])if(filter[key]!==undefined&&filter[key]!==''){
  const value=filter[key];if(typeof value!=='string'||value.length>160||/[\u0000-\u001f\u007f-\u009f]/.test(value))fail('预设文字不正确');
  if(['from','to'].includes(key)&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))))fail('预设日期不正确');
  result[key]=value;
 }
 for(const key of ['champion','queue','minKda'])if(filter[key]!==undefined&&filter[key]!==''&&filter[key]!==null){
  const value=Number(filter[key]);if(!Number.isFinite(value)||value<0)fail('预设数值不正确');result[key]=value;
 }
 if(typeof filter.excludePve==='boolean')result.excludePve=filter.excludePve;
 if(filter.advanced){
  const {mode='all',rules=[],tree=null}=filter.advanced;
  if(!['all','any'].includes(mode)||!Array.isArray(rules)||rules.length>HISTORY_FILTER_LIMITS.rules)fail('预设简单条件超出上限或格式不正确');
  result.advanced={mode,rules:rules.map(rule=>{const clean=validateHistoryFilterTree(rule);if(!clean||typeOf(clean)!=='rule')fail('简单条件必须为条件节点');return clean;}),tree:validateHistoryFilterTree(tree)};
 }
 if(JSON.stringify(result).length>HISTORY_FILTER_PRESET_LIMITS.text)fail('预设超过文本上限');
 return result;
}
const presetName=name=>{
 if(typeof name!=='string'||!name.trim()||name.trim().length>HISTORY_FILTER_PRESET_LIMITS.name||/[\u0000-\u001f\u007f-\u009f]/.test(name))fail('预设名称需要 1–64 个字符');
 return name.trim();
};
/** Store the returned array on tab.filterPresets in bounded runtime memory only. */
export function saveHistoryFilterPreset(presets,name,filter){
 const key=presetName(name),previous=Array.isArray(presets)?presets:[];
 const kept=previous.filter(p=>p?.name!==key).slice(-(HISTORY_FILTER_PRESET_LIMITS.count-1)).map(p=>({name:presetName(p.name),filter:snapshot(p.filter)}));
 return [...kept,{name:key,filter:snapshot(filter)}];
}
export function loadHistoryFilterPreset(presets,name){
 const key=presetName(name),preset=(Array.isArray(presets)?presets:[]).slice(-HISTORY_FILTER_PRESET_LIMITS.count).find(p=>p?.name===key);
 if(!preset)fail('预设不存在');return snapshot(preset.filter);
}
export function removeHistoryFilterPreset(presets,name){
 const key=presetName(name);return (Array.isArray(presets)?presets:[]).filter(p=>p?.name!==key).slice(-HISTORY_FILTER_PRESET_LIMITS.count).map(p=>({name:presetName(p.name),filter:snapshot(p.filter)}));
}
/** Local calendar dates for the existing inclusive from/to controls; pass the clock explicitly. */
export function historyRelativeTimeRange(shortcut,now){
 if(shortcut==='all')return {from:'',to:''};
 const days={today:1,'7d':7,'30d':30,'90d':90}[shortcut];
 const end=new Date(now);if(!days||!Number.isFinite(end.getTime()))fail('时间快捷方式不正确');
 const start=new Date(end);start.setDate(start.getDate()-days+1);
 const date=value=>`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
 return {from:date(start),to:date(end)};
}
