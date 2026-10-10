import {escape as e,button} from './ui.mjs';
import {ROLES} from './core/rules.mjs';
const scopeNotice=evidence=>evidence.expectedPairs===3?' 每一对分别统计，未提供三人组合或全队胜率。':evidence.expectedPairs>3?' 每一对分别统计，不参与四五人排序，未提供四人、五人或全队胜率。':'';

export function pairStatisticsText(evidence,data){
 if(!evidence)return '';
 const member=m=>`${data.champions.find(c=>c.id===m.champion)?.name||m.champion}·${ROLES.find(r=>r.id===m.role)?.name||m.role}`;
 return `OP.GG 同队参考 · ${evidence.sourceLabel}${evidence.patch?' · '+evidence.patch+(evidence.current?'':' · 旧版本'):evidence.mixed?' · 不同版本':''}\n${evidence.pairs.map(p=>`${p.members.map(member).join(' + ')}：${p.games} 场，同队胜率 ${p.winRate.toFixed(1)}%${p.games<200?'，样本较少':''} · ${p.patch}${p.current?'':' 旧版本'}；${p.sourceUrl}`).join('\n')}${evidence.missingPairs?.length?'\n来源表未收录：'+evidence.missingPairs.map(pair=>pair.map(member).join(' + ')).join('；'):''}\n${evidence.notice}${scopeNotice(evidence)}`;
}

export function pairStatisticsView(evidence,data,{compact=false}={}){
 if(!evidence)return '';
 const member=m=>`${data.champions.find(c=>c.id===m.champion)?.name||m.champion} · ${ROLES.find(r=>r.id===m.role)?.name||m.role}`;
 const summary=`OP.GG 同队参考 · ${evidence.sourceLabel}${evidence.patch?' · '+evidence.patch+(evidence.current?'':' · 旧版本'):evidence.mixed?' · 不同版本':''}`;
 if(compact)return `<details class="result-reason pair-statistics"><summary>${e(summary)} · ${evidence.pairs.length}/${evidence.expectedPairs} 对有样本</summary>${details()}</details>`;
 return `<section class="detail-section pair-statistics"><h3>同队统计参考</h3><p>${e(summary)}</p>${details()}</section>`;
 function details(){return `${evidence.pairs.map(p=>`<p><b>${p.members.map(m=>e(member(m))).join(' + ')}</b><br>${p.games.toLocaleString()} 场 · 同队胜率 ${p.winRate.toFixed(1)}%${p.games<200?' · 样本较少':''} · ${e(p.patch)}${p.current?'':' · 旧版本'}<br><small>获取于 ${e(p.fetchedAt.slice(0,10))}；两个方向的重叠样本只保留一份。</small></p>${button('link','查看这对的来源','arrow','quiet small',`data-url="${e(p.sourceUrl)}"`)}`).join('')}${evidence.missingPairs?.length?`<p class="bottom-note">来源表未收录：${evidence.missingPairs.map(pair=>pair.map(m=>e(member(m))).join(' + ')).join('；')}。</p>`:''}<p class="bottom-note">${e(evidence.notice)}${e(scopeNotice(evidence))}来源未提供的搭配不会记为零场或低胜率。</p>`;}
}
