import {buildSourceSelectors} from './build-source-view.mjs';
import {normalizeBuildSource,sameBuildSource,buildSourceLabel} from './core/build-source.mjs';
import {escape as e,button,dateLabel} from './ui.mjs';
import {ROLES} from './core/rules.mjs';
import {mechanicSourceInput} from './core/mechanic-source.mjs';

export function mechanicCoverageView(data,members){
 const champions=[...new Set(members.map(member=>member.champion))].map(id=>data.champions.find(champion=>champion.id===id)).filter(Boolean);
 if(!champions.length)return '';
 const monitored=champions.filter(champion=>mechanicSourceInput(champion,data.patch)),dates=monitored.map(champion=>champion.mechanicSource.observedAt).sort();
 return `<details class="more-builds mechanic-source-coverage"><summary>机制资料 · 已监测 ${monitored.length} / ${champions.length}</summary><p class="bottom-note">${monitored.length?`${e(dateLabel(dates[0]))}起监测角色数据与完整技能字段的变化；变化后需复核。`:'角色源不完整，当前机制规则待复核。'}原技能摘要的复核记录保留；共享法术依赖及具体玩法仍需人工核对。</p></details>`;
}

export function pairRefreshTargets(slots,scope,soloRole){
 return slots.filter(s=>s.champion&&(scope==='solo'?s.role===soloRole:scope==='bot'?['bottom','support'].includes(s.role):s.party)).map(({champion,role})=>({champion,role}));
}
export function pairRefreshView(data,members,{pending=false,error='',open=false}={}){
 const source=normalizeBuildSource(data.buildSource),snapshots=data.pairStatistics?.snapshots||(data.pairStatistics?[data.pairStatistics]:[]),byId=new Map(data.champions.map(c=>[c.id,c]));
 const usable=snapshots.filter(s=>sameBuildSource(s,source)&&s.patch.split('.').map(Number).every(Number.isFinite)).filter(s=>{const [a,b]=s.patch.split('.').map(Number),[x,y]=data.patch.split('.').map(Number);return a<x||a===x&&b<=y;}).sort((a,b)=>b.patch.localeCompare(a.patch,undefined,{numeric:true}));
 const status=members.map(m=>{const snapshot=usable.find(s=>s.entries.some(e=>e.champion===m.champion&&e.role===m.role)),entry=snapshot?.entries.find(e=>e.champion===m.champion&&e.role===m.role);return `${byId.get(m.champion)?.name||m.champion}·${ROLES.find(r=>r.id===m.role)?.name||m.role}：${entry?`${snapshot.patch}${snapshot.patch!==data.patch?' 旧版本':''} · ${dateLabel(entry.fetchedAt)}`:'暂无缓存'}`;});
 return `<details class="pair-refresh" data-pair-refresh ${open?'open':''}><summary>同队数据 · ${e(buildSourceLabel(source))}${pending?' · 刷新中…':''}</summary><div class="pair-refresh-controls">${buildSourceSelectors(data)}${button('refresh-pairs',pending?'刷新中…':'刷新已选成员','refresh','small',pending||!members.length||members.length>5?'disabled':'')}</div><p class="bottom-note" role="status" data-pair-refresh-status>${e(error||status.join('；')||'先选自己或朋友的英雄与位置，再刷新相关搭配。')}</p><p class="bottom-note">只获取已选成员位置的同队样本，最多五位逐一获取；切换筛选只读本机缓存，刷新联网获取。旧版本保留供参考，不参与当前版本排序；未收录不代表配合差。</p></details>${mechanicCoverageView(data,members)}`;
}
