import {escape as e} from './ui.mjs';
import {ROLES} from './core/rules.mjs';
import {publicDraftTeam} from './core/ranked-draft.mjs';
import {championDurationReference} from './core/ranked-statistics.mjs';
import {durationChart,statisticsSourceDates} from './duration-chart-view.mjs';
export function championStatisticsView(client,data,selection){
 const own=publicDraftTeam(client?.session).find(player=>player.cellId===client?.session?.localPlayerCellId),hero=data.champions.find(champion=>champion.id===selection?.id);
 if(!hero||selection.mode!=='rift'||!client.connected||client.phase!=='ChampSelect'||Number(hero.key)!==Number(own?.championId||own?.championPickIntent))return '';
 const curve=championDurationReference(hero.id,selection.role,data.builds,{patch:data.patch,source:data.buildSource});
 if(!curve)return '<section class="champion-statistics" aria-label="个人英雄胜率曲线"><header>英雄走势 · 暂无完整统计</header><p>所选来源缺少当前版本、当前分路的时长统计。</p></section>';
 const role=ROLES.find(role=>role.id===selection.role)?.name||'';
 return `<section class="champion-statistics" aria-label="个人英雄胜率曲线"><header><b>${e(hero.name)}走势</b> <small>${role} · ${e(curve.patch)}</small></header>${durationChart([{name:hero.name,id:'ally',points:curve.points}],{label:hero.name+'按对局结束时长分组的历史胜率',compact:true})}<details class="ranked-curve-method"><summary>历史统计 · 非本场预测</summary><p>按对局结束时长分组；0–25 分钟为同一统计区间，不是每分钟预测。OP.GG ${curve.source.region==='kr'?'韩国':'全球'} · ${e(curve.source.tier)} · 单双排。</p>${statisticsSourceDates(curve)}<p>不代表本场胜率，来源未提供各区间样本量。</p></details></section>`;
}
