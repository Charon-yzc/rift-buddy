import {escape as e,portrait,button} from './ui.mjs';
import {BUILD_REGIONS,BUILD_TIERS,normalizeBuildSource,buildSourceLabel} from './core/build-source.mjs';
import {rankingReference} from './core/rankings.mjs';
import {ROLES} from './core/rules.mjs';

const percent=v=>(v*100).toFixed(2)+'%';
const number=v=>v.toLocaleString('zh-CN');
const time=v=>new Date(v).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
export function rankingRows(data,{source,role='top',query='',sort='rank'}={}){
 const ref=rankingReference(data,normalizeBuildSource(source));if(!ref)return [];
 const needle=query.trim().toLowerCase(),heroes=new Map(data.champions.map(c=>[c.id,c]));
 const rows=(ref.boards[role]||[]).filter(row=>{const hero=heroes.get(row.champion);return !needle||[hero.id,hero.name,hero.title,hero.keywords].join(' ').toLowerCase().includes(needle);});
 return rows.toSorted((a,b)=>sort==='winRate'?b.winRate-a.winRate||b.samples-a.samples:sort==='pickRate'?b.pickRate-a.pickRate||b.samples-a.samples:sort==='samples'?b.samples-a.samples:(a.rank??Infinity)-(b.rank??Infinity)||b.samples-a.samples);
}
export function rankingsView(data,{source=data.buildSource,role='top',query='',sort='rank',pending=false,error='',compact=false,heroAction=()=>({label:'查看配置'})}={}){
 source=normalizeBuildSource(source);const ref=rankingReference(data,source),rows=rankingRows(data,{source,role,query,sort});
 const stale=ref&&Date.now()-Date.parse(ref.analyzedAt)>36*3600000;
 const filter=(id,label,values,value)=>`<label>${label}<select class="select" data-ranking-filter="${id}" aria-label="排行榜${label}">${values.map(v=>`<option value="${v.id}" ${v.id===value?'selected':''}>${v.name}</option>`).join('')}</select></label>`;
 const summary=ref?`${ref.patch} · ${buildSourceLabel(source)} · 总样本${number(ref.totalMatches)}场；统计 ${time(ref.analyzedAt)}，获取 ${time(ref.fetchedAt)}${stale?' · 统计已超过36小时，请刷新':''}`:`${data.patch} · ${buildSourceLabel(source)} · 此筛选暂无有效缓存`;
 return `<section class="ranking-workspace ${compact?'ranking-compact':''}" aria-label="各路英雄排行榜" data-ranking-scope="${e(ref?.key||[data.patch,source.region,source.tier].join(':'))}">
 ${compact?'<h3>各路排行</h3>':'<div class="page-heading"><div><h1>各路排行榜</h1></div></div>'}
 <nav class="ranking-roles" aria-label="排行榜位置">${ROLES.map(r=>`<button data-action="ranking-role" data-role="${r.id}" class="${r.id===role?'active':''}" aria-pressed="${r.id===role}">${compact?({top:'上',jungle:'野',mid:'中',bottom:'下',support:'辅'})[r.id]:r.name}</button>`).join('')}</nav>
 <div class="ranking-filters">${filter('region','地区',BUILD_REGIONS,source.region)}${filter('tier','段位',BUILD_TIERS,source.tier)}${filter('sort','排序',[{id:'rank',name:'来源名次'},{id:'winRate',name:'胜率'},{id:'pickRate',name:'登场率'},{id:'samples',name:'样本数'}],sort)}${button('ranking-refresh',pending?'刷新中…':'刷新','refresh','small',pending?'disabled':'')}</div>
 <p class="ranking-meta" data-ranking-status>${e(`${ref?.patch||data.patch} · ${buildSourceLabel(source)}${ref?`${compact?'':' · '+number(ref.totalMatches)+' 场'} · ${time(ref.analyzedAt)}`:' · 暂无缓存'}${stale?' · 统计已超过36小时，请刷新':''}`)}</p>
 <p class="ranking-scope-note">OP.GG公开排位统计 · 不代表国服或组合胜率。</p>
 <details class="ranking-source ui-disclosure" ${compact?'data-companion-disclosure="ranking-source"':''}><summary>统计范围与更新时间</summary><p>${e(summary)}</p><p>${source.region==='global'?'全球':'韩国'}样本；胜率排序会受样本量影响，请同时看场次。</p></details>
 ${error?`<p class="callout warning" role="status">刷新未完成：${e(error)}${ref?'。下方保留上次有效榜单。':'。没有使用其他筛选的数据代替。'}</p>`:''}
 <label class="ranking-search">${compact?'找英雄':'搜索英雄'}<input id="ranking-search" type="search" value="${e(query)}" placeholder="名称、称号或简称" autocomplete="off" /></label>
 ${ref?`<p class="ranking-count">${ROLES.find(r=>r.id===role)?.name||''} · ${rows.length} 位${query?'匹配英雄':''}</p><div class="ranking-table-scroll"><table class="ranking-table"><thead><tr><th scope="col">英雄</th><th scope="col">梯级</th><th scope="col">胜率</th>${compact?'':'<th scope="col">登场率</th><th scope="col">禁用率</th>'}<th scope="col">场次</th></tr></thead><tbody>${rows.map(row=>{
 const hero=data.champions.find(c=>c.id===row.champion),action=heroAction(hero.id),difference=row.rank!==null&&row.previousPatchRank!==null?row.previousPatchRank-row.rank:null;
 return `<tr data-ranking-hero="${hero.id}"><td><button class="ranking-champion" data-action="ranking-hero" data-id="${hero.id}" data-role="${role}" title="${e(action.label)} · ${e(hero.name)}"><span class="ranking-position">${row.rank??'—'}</span>${portrait(hero)}<span><b>${e(hero.name)}</b><small>${e(action.label)}${!compact&&difference?` · 较上版${difference>0?'↑':'↓'}${Math.abs(difference)}`:''}</small></span></button></td><td><span class="ranking-tier">${row.tier===null?'—':'T'+row.tier}</span></td><td>${percent(row.winRate)}</td>${compact?'':`<td>${percent(row.pickRate)}</td><td>${percent(row.banRate)}</td>`}<td>${number(row.samples)}</td></tr>`;
 }).join('')||'<tr><td colspan="6">没有匹配的英雄，试试其他名称。</td></tr>'}</tbody></table></div>${compact?'<p class="ranking-scope-note">锁定仍需你在客户端确认。</p>':''}<details class="ui-disclosure" ${compact?'data-companion-disclosure="ranking-tier-info"':''}><summary>梯级与筛选说明</summary><p>梯级与名次沿用来源；T0为来源最高梯级。排行筛选不改变当前配置来源。</p></details>`:'<div class="ranking-empty"><p>暂无榜单。点击刷新，或切回已有缓存的筛选。</p></div>'}
 </section>`;
}
