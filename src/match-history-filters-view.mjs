import {escape as e,button} from './ui.mjs';
import {RULE_FIELDS,validateHistoryFilterTree} from './core/match-history/filters.mjs';
import {QUEUES} from './core/match-history/model.mjs';
import {HISTORY_FILTER_KINDS,HISTORY_FILTER_PRESET_LIMITS,historyFilterSupportsShare,historyFilterUsesEquality,historyFilterIsResource} from './match-history-filter-tree.mjs';

const OPERATORS=[['>=','≥'],['<=','≤'],['=','='],['!=','≠'],['>','>'],['<','<']];
const SCOPES=[['self','当前玩家'],['ally','同队任一玩家（含本人）'],['enemy','对手任一玩家'],['anyone','任意玩家'],['everyone','所有玩家'],['named','指定玩家']];
const MEASURES=[['value','实际数值'],['teamShare','队伍占比 %'],['teamMaxShare','队内最高占比 %'],['gameShare','全场占比 %'],['gameMaxShare','全场最高占比 %']];
const CHOICES={result:[['win','胜利'],['loss','失败'],['remake','重开'],['abort','已中止']],position:[['TOP','上单'],['JUNGLE','打野'],['MIDDLE','中单'],['BOTTOM','下路'],['UTILITY','辅助']],pve:[['true','是'],['false','否']],matched:[['true','是'],['false','否']],surrender:[['true','是'],['false','否']]};
const EXAMPLE={type:'and',children:[{field:'kills',operator:'>=',value:5},{type:'or',children:[{field:'queue',operator:'=',value:420},{field:'queue',operator:'=',value:440}]},{type:'not',child:{field:'deaths',operator:'>',value:5}},{type:'scope',scope:'ally',child:{type:'and',children:[{field:'item',operator:'=',value:1055,minQuantity:2},{field:'style',operator:'=',value:8000,slot:0}]}}]};
const options=(values,current)=>values.map(([value,label])=>`<option value="${e(value)}" ${String(value)===String(current??'')?'selected':''}>${e(label)}</option>`).join('');
const simpleSelect=(index,field,values,current)=>`<select aria-label="${e(field)}" data-history-rule="${index}" data-rule-field="${field}">${options(values,current)}</select>`;
const treeAttrs=(path,field)=>`data-history-tree-path="${e(path)}" data-history-tree-field="${e(field)}"`;
const treeSelect=(path,field,label,values,current)=>`<label>${e(label)}<select ${treeAttrs(path,field)}>${options(values,current)}</select></label>`;
const treeInput=(path,field,label,value,extra='')=>`<label>${e(label)}<input ${treeAttrs(path,field)} aria-label="${e(label)}" value="${e(value)}" maxlength="160" ${extra}></label>`;
const treeButton=(action,label,path,kind='')=>button(action,label,'','small quiet',`data-path="${e(path)}"${kind?` data-kind="${e(kind)}"`:''}`);
const listValues=value=>Array.isArray(value)?value:value&&typeof value==='object'?Object.values(value):[];

// Datalists use public bundled resource names and participants already loaded in this tab only.
function resources(tab,data){
 const lists=new Map(),add=(field,value,label)=>{
  if(value===null||value===undefined||value===''||String(value).length>160)return;
  const list=lists.get(field)||new Map();if(list.size<2048||list.has(String(value)))list.set(String(value),String(label||value));lists.set(field,list);
 };
 for(const c of listValues(data.champions))add('champion',c.key??c.id,c.name);
 for(const [key,item] of Object.entries(data.items||{}))add('item',item.id??key,item.name);
 for(const style of listValues(data.runes)){
  add('style',style.id,style.name);
  for(const slot of listValues(style.slots))for(const rune of listValues(slot.runes))add('rune',rune.id,rune.name);
 }
 for(const augment of listValues(data.augments))add('augment',augment.id,augment.name);
 for(const [key,spell] of Object.entries(data.spells||{}))add('spell',spell.key??key,spell.name);
 for(const [id,name] of Object.entries(QUEUES))add('queue',id,name);
 for(const game of (tab.page?.games||[]).slice(0,500))for(const p of (game.participants||[]).slice(0,30)){
  if(p.puuid)add('player',p.puuid,p.name||p.puuid);
  else if(p.name)add('player',p.name,p.name);
  for(const [field,key] of [['item','items'],['rune','runes'],['augment','augments'],['spell','spells']])for(const id of p[key]||[])if(id>0&&!lists.get(field)?.has(String(id)))add(field,id,'历史 ID '+id);
 }
 const prefix='history-filter-'+String(tab.id??'current').replace(/[^\w-]/g,'');
 const id=field=>lists.has(field)?prefix+'-'+field:'';
 return {id,html:[...lists].map(([field,list])=>`<datalist id="${id(field)}">${[...list].map(([value,name])=>`<option value="${e(value)}" label="${e(name)} · ${e(value)}">${e(name)}</option>`).join('')}</datalist>`).join('')};
}
function scopeFields(node,path,lookup,isScope){
 const aliases={any:'anyone',all:'everyone',allies:'ally',enemies:'enemy',player:'named'},scope=aliases[node.scope]||node.scope;
 return treeSelect(path,'scope','玩家范围',isScope?SCOPES:[['','沿用上层玩家范围'],...SCOPES],scope??'')+
  treeInput(path,'player','玩家标识 / 同队或对手的参照玩家',node.player||'',`list="${lookup.id('player')}" placeholder="可搜索已加载玩家；指定范围请先填写"`)+
  treeSelect(path,'quantifier','范围满足方式',[['','按范围默认'],['any','任一玩家满足'],['all','范围内全部玩家满足']],node.quantifier??'');
}
function ruleFields(node,path,lookup){
 const field=node.field,choices=CHOICES[field],list=lookup.id(field),value=choices?treeSelect(path,'value','筛选值',choices,node.value):treeInput(path,'value',list?'筛选值 · 搜索名称并选择 ID / 标识':'筛选值',node.value,`${list?`list="${list}"`:''} ${['player','mode','gameType'].includes(field)?'':'inputmode="decimal"'}`);
 return `<div class="history-rule">${treeSelect(path,'field','统计 / 资源',Object.entries(RULE_FIELDS),field)}${treeSelect(path,'operator','比较',historyFilterUsesEquality(field)?OPERATORS.filter(([value])=>['=','!='].includes(value)):OPERATORS,node.operator)}${value}${historyFilterSupportsShare(field)?treeSelect(path,'measure','数值方式',MEASURES,node.measure||'value'):''}${historyFilterIsResource(field)?treeInput(path,'minQuantity','至少数量（留空为 1）',node.minQuantity??'','type="number" min="1" max="30" step="1"')+treeInput(path,'slot','记录槽位（留空 / -1 为任意）',node.slot??'','type="number" min="-1" max="8" step="1"'):''}</div><details data-disclosure-key="history-tree-scope-${e(path||'root')}"><summary>此条件的玩家范围${node.scope?' · '+e(node.scope):' · 沿用上层'}</summary><div class="history-rule">${scopeFields(node,path,lookup,false)}</div></details>`;
}
function visualNode(node,path,lookup){
 const type=node.type||'rule',label=HISTORY_FILTER_KINDS.find(([kind])=>kind===type)?.[1]||'条件',pathLabel=path?path.split('.').map(v=>Number(v)+1).join('.'):'根条件';
 const kinds=HISTORY_FILTER_KINDS.filter(([kind])=>kind!==type).map(([kind,name])=>treeButton('history-tree-kind',kind==='rule'?'改为条件（清空分组）':(type==='and'||type==='or')&&(kind==='and'||kind==='or')?'切换 '+name:'包为 '+name,path,kind)).join('');
 const children=type==='and'||type==='or'?node.children.map((child,i)=>visualNode(child,path?path+'.'+i:String(i),lookup)).join(''):['not','scope'].includes(type)?visualNode(node.child,path?path+'.0':'0',lookup):'';
 return `<fieldset class="history-tree-node" data-tree-node-path="${e(path)}"><legend>${e(pathLabel)} · ${e(label)}</legend><div class="history-rule">${treeButton('history-tree-remove','移除此'+(type==='rule'?'条件':'分组'),path)}<details data-disclosure-key="history-tree-kind-${e(path||'root')}"><summary>更改 / 嵌套节点</summary><div class="history-rule">${kinds}</div></details></div>${type==='rule'?ruleFields(node,path,lookup):type==='scope'?`<div class="history-rule">${scopeFields(node,path,lookup,true)}</div><small>子条件应用于同一位玩家。指定玩家范围请先填写标识，再切换范围。</small>`:type==='not'?'<small>反转已知判断；缺失数据仍保持未知。</small>':''}${children}${type==='and'||type==='or'?`<div class="history-rule">${HISTORY_FILTER_KINDS.map(([kind,name])=>treeButton('history-tree-add','添加 '+name,path,kind)).join('')}</div>`:''}</fieldset>`;
}
function runtimeTools(tab){
 const presets=(Array.isArray(tab.filterPresets)?tab.filterPresets:[]).slice(-HISTORY_FILTER_PRESET_LIMITS.count);
 return `<details data-disclosure-key="history-filter-presets"><summary>时间快捷筛选 / 本次运行预设</summary><div class="history-rule">${[['today','今天'],['7d','近 7 天'],['30d','近 30 天'],['90d','近 90 天'],['all','不限时间']].map(([value,label])=>button('history-relative-time',label,'','small quiet',`data-value="${value}" data-range="${value}"`)).join('')}</div><div class="history-rule"><label>筛选预设名称<input data-history-tool="filter-preset-name" aria-label="筛选预设名称" maxlength="64" placeholder="例如：排位高参团"></label>${button('history-tree-preset','保存当前筛选','','small', 'data-preset-action="save"')}</div>${presets.map(p=>`<div class="history-rule"><span>${e(p.name)}</span>${button('history-tree-preset','应用','','small quiet',`data-preset-action="load" data-name="${e(p.name)}"`)}${button('history-tree-preset','删除','','small quiet',`data-preset-action="remove" data-name="${e(p.name)}"`)}</div>`).join('')}<small>预设包含当前简单、嵌套和日期筛选，最多 12 个，仅保留在本次运行内存中；关闭后清除。日期快捷方式按本机日历日期包含今天。</small></details>`;
}
function jsonEditor(tree){
 return `<details data-disclosure-key="history-filter-tree"><summary>嵌套条件 JSON · 导入 / 导出</summary><p>在简单条件之外，额外满足此处的 AND / OR / NOT 条件。复制文本即可导出，粘贴后点击保存；留空并保存可清除嵌套条件。</p><label>嵌套筛选条件<textarea aria-label="嵌套筛选条件 JSON" data-history-tool="filter-tree" rows="12" cols="36" maxlength="32768" spellcheck="false">${e(tree)}</textarea></label>${button('history-filter-tree','保存嵌套条件','','small')}<small>最多 8 层、100 个节点，每组最多 20 个子条件。不会执行代码。</small><details data-disclosure-key="history-filter-example"><summary>示例与范围说明</summary><p>示例：本人至少 5 杀、单双排或灵活组排、死亡不超过 5 次，且同队有一位玩家同时持有两件多兰之刃并选择精密主系。</p><pre>${e(JSON.stringify(EXAMPLE,null,2))}</pre><p>type 为 and / or 时使用 children 数组，not 使用 child。scope 节点把 child 中的条件应用于同一位玩家；范围可选 self、anyone、everyone、ally、enemy、named。ally 包含本人；ally / enemy 默认相对当前玩家，添加 player 可指定参照玩家。named 必须添加 player（完整玩家标识或游戏 ID）。quantifier: "all" 表示范围中的所有玩家均满足，默认只需任一位满足。</p><p>装备、符文、符文系、强化和召唤师技能使用 = / != 比较 ID。minQuantity 为至少数量，默认 1；slot 为从 0 开始的实际记录槽位，-1 表示任意槽位。参团率、伤害 / 金币和各类占比填写百分数，例如 50 表示 50%。布尔字段填写 true / false；结果使用 win / loss / remake / abort。时间字段 created 使用开始时间的毫秒时间戳。</p></details></details>`;
}
/** Optional data is the current bundled champions/items/runes/augments/spells catalog. */
export function advancedHistoryFilters(tab,data={}){
 const advanced=tab.filter?.advanced||{mode:'all',rules:[]},rules=Array.isArray(advanced.rules)?advanced.rules:[],lookup=resources(tab,data||{});
 let tree=null,error='';try{tree=validateHistoryFilterTree(advanced.tree??null);}catch(cause){error=cause.message;}
 const simple=rules.map((rule,index)=>`<div class="history-rule">${simpleSelect(index,'scope',[['self','当前玩家'],['ally','同队任一玩家'],['enemy','对手任一玩家'],['any','任意玩家'],['everyone','所有玩家']],rule.scope||'self')}${simpleSelect(index,'field',Object.entries(RULE_FIELDS),rule.field)}${simpleSelect(index,'measure',MEASURES,rule.measure||'value')}${simpleSelect(index,'operator',OPERATORS,rule.operator)}<input aria-label="筛选数值" data-history-rule="${index}" data-rule-field="value" value="${e(rule.value)}" maxlength="160" ${lookup.id(rule.field)?`list="${lookup.id(rule.field)}"`:''}>${button('history-rule-remove','移除','','small quiet',`data-index="${index}"`)}</div>`).join('');
 const visual=error?`<p class="history-error" role="alert">${e(error)}</p>${treeButton('history-tree-remove','清除无效嵌套条件','')}`:tree?visualNode(tree,'',lookup):`<p class="muted">尚未添加嵌套条件。选择根节点后，可逐层添加 AND / OR / NOT 与同一玩家范围。</p><div class="history-rule">${HISTORY_FILTER_KINDS.map(([kind,name])=>treeButton('history-tree-add','创建 '+name,'',kind)).join('')}</div>`;
 return `<details class="history-advanced" data-disclosure-key="history-advanced"><summary>高级筛选 · ${rules.length} 个条件${advanced.tree?' + 嵌套条件':''}</summary>${runtimeTools(tab)}<div class="history-rule-mode"><label>组合方式<select data-history-field="advanced-mode">${options([['all','满足全部（AND）'],['any','满足任一（OR）']],advanced.mode||'all')}</select></label>${button('history-rule-add','添加条件','','small')}</div>${simple}<small>只筛选已加载的对局。缺失数值不作为零参与筛选，NOT 也不会把缺失记录视为满足条件。</small><details data-disclosure-key="history-tree-editor" open><summary>可视化嵌套条件 · AND / OR / NOT</summary><p>嵌套条件与上方简单条件同时生效。可按资源名称或已加载玩家搜索，再选中对应 ID / 标识；历史 ID 仍可手动输入。</p>${visual}</details>${jsonEditor(tree?JSON.stringify(tree,null,2):'')}${lookup.html}</details>`;
}
