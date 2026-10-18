// Ongoing-game hover details. Adapted from League Akari 60f1584c (MIT) ranked
// table, stats and position popovers. Only data already loaded for the page is
// shown; anything the source did not return stays "未读取".
import {escape as e,portrait} from './ui.mjs';
import {queueName} from './core/match-history/model.mjs';
import {ongoingPositionName} from './ongoing-game-analysis-view.mjs';

const num=(value,digits=0)=>Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumFractionDigits:digits}):'未读取';
const pct=value=>Number.isFinite(value)?(value*100).toFixed(0)+'%':'未读取';
const TIERS={IRON:'黑铁',BRONZE:'青铜',SILVER:'白银',GOLD:'黄金',PLATINUM:'铂金',EMERALD:'翡翠',DIAMOND:'钻石',MASTER:'大师',GRANDMASTER:'宗师',CHALLENGER:'王者',UNRANKED:'未定级',NONE:'未定级'};
const RANK_QUEUES=[['RANKED_SOLO_5x5','单 / 双排'],['RANKED_FLEX_SR','灵活组排'],['RANKED_CHERRY','斗魂竞技场'],['CHERRY','斗魂竞技场']];
const rankLabel=queue=>RANK_QUEUES.find(([id])=>id===queue)?.[1]||'排位';
const tierText=(tier,division)=>{const name=TIERS[String(tier||'').toUpperCase()]||'段位未读取';const part=['I','II','III','IV'].includes(division)?` ${division}`:'';return name+part;};

const ROLE_REASONS={PRIMARY:'主选',SECONDARY:'副选',FILL_PRIMARY:'主选补位',FILL_SECONDARY:'副选补位',AUTOFILL:'系统补位'};
const metrics=rows=>`<dl class="history-hover-metrics">${rows.map(([label,value])=>`<div><dt>${e(label)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
const champion=(data,id)=>(data?.champions||[]).find(c=>Number(c.key)===Number(id));
const heroName=(data,id)=>champion(data,id)?.name||(id>0?`英雄 ${id}`:'英雄未选择');
const member=(state,key)=>(state.roster?.players||[]).find(p=>p.key===key);
const playerName=(state,p,key)=>p?.hidden?'身份隐藏':p?.name||member(state,key)?.name||'玩家名称未读取';

/** Content for one ongoing-game tooltip target. Returns '' when nothing is known. */
export function ongoingTooltipView(state={},element,data={}){
 const kind=element?.dataset?.ongoingTip,key=element?.dataset?.tipPlayer||'',entry=key?state.players?.[key]||{}:null,p=key?member(state,key):null;
 if(kind==='text'){const title=element.dataset.tipTitle,text=element.dataset.tipText;return title||text?`<h3>${e(title||'')}</h3>${text?`<div class="history-hover-description">${e(text)}</div>`:''}`:'';}
 if(kind==='premade'){
  const keys=String(element.dataset.tipPlayers||'').split(',').filter(Boolean).slice(0,12);
  if(!keys.length)return '';
  return `<h3>历史共同对局</h3>${metrics([['人数',num(keys.length)],['至少共同对局',num(Number(element.dataset.tipCount))+' 次']])}<div class="ongoing-hover-members">${keys.map(id=>{const player=member(state,id);return `<span>${champion(data,player?.champion)?portrait(champion(data,player?.champion)):'<span class="ongoing-empty-icon"></span>'}${e(playerName(state,player,id))}</span>`;}).join('')}</div><small>依据已加载历史的共同对局次数推断，不能证明当前预组队。</small>`;
 }
 if(!entry)return '';
 const analysis=entry.analysis,scope=state.settings?.tag==='all'?'全部已加载队列':'当前队列';
 if(kind==='rank'){
  const ranks=(entry.profile?.ranked||[]).slice(0,8);
  if(!ranks.length)return `<h3>排位资料</h3><p>${entry.loading?'正在读取玩家资料…':'数据源未返回排位资料'}</p>`;
  return `<h3>排位资料</h3><div class="history-table-scroll"><table><thead><tr><th>队列</th><th>段位</th><th>胜 / 负</th><th>最高</th><th>上赛季</th></tr></thead><tbody>${ranks.map(r=>`<tr><td>${e(rankLabel(r.queue))}</td><td>${e(tierText(r.tier,r.division))}${Number.isFinite(r.lp)?` · ${num(r.lp)} LP`:''}</td><td>${num(r.wins)} / ${num(r.losses)}</td><td>${e(tierText(r.peak,r.peakDivision))}</td><td>${e(tierText(r.previousTier,r.previousDivision))}</td></tr>`).join('')}</tbody></table></div><small>资料来自当前大区按需读取；未返回的字段显示未读取。</small>`;
 }
 if(kind==='winrate'){
  const cherry=state.roster?.mode==='CHERRY',w=cherry?analysis?.winLoss?.cherry:analysis?.winLoss?.all;
  if(!analysis?.count>0||!w?.count>0)return `<h3>历史胜率</h3><p>${scope}：没有可用的已结束对局样本。</p>`;
  return `<h3>历史胜率 · ${e(scope)}</h3>${metrics([['样本',num(w.count)+' 局'],['胜 / 负',`${num(w.wins)} / ${num(w.losses)}`],['胜率',pct(w.winRate)],['当前连胜 / 连败',`${num(w.winningStreak)} / ${num(w.losingStreak)}`],...(cherry?[['第一率',pct(w.top1Rate)],['前半名次率',pct(w.topHalfRate)],['平均名次',num(w.avgSubteamPlacement,2)]]:[]),['活跃时段胜 / 负',`${num(w.activeSessionWins)} / ${num(w.activeSessionLosses)}`]])}<small>只统计已加载且胜负可知的已结束对局；样本 ${num(analysis.count)} 局。不代表本局获胜概率。</small>`;
 }
 if(kind==='kda'){
  if(!analysis?.count>0)return `<h3>平均 KDA</h3><p>没有可用的已结束对局样本。</p>`;
  const s=analysis.summary||{};
  return `<h3>平均 KDA · ${e(scope)}</h3>${metrics([['平均 KDA',num(s.avgKda,2)],['KDA 变异系数',num(s.kdaCv,2)],['累计 K / D / A',`${num(s.kills)} / ${num(s.deaths)} / ${num(s.assists)}`],['单杀',num(s.avgSoloKills,2)],['击杀伤害比',pct(s.avgKillDamageEfficiency)]])}<small>变异系数越大表示表现波动越大；缺失的测量不补零。</small>`;
 }
 if(kind==='position'){
  const role=p?.role&&typeof p.role==='object'?p.role:null,positions=analysis?.positions||null,current=p?.position||role?.current||'';
  const rows=[['当前 / 分配位置',current?ongoingPositionName(current):'位置未读取'],...(role?.assignmentReason&&ROLE_REASONS[role.assignmentReason]?[['分配原因',ROLE_REASONS[role.assignmentReason]]]:[]),...(role?.primary?[['主选位置',ongoingPositionName(role.primary)]]:[]),...(role?.secondary?[['副选位置',ongoingPositionName(role.secondary)]]:[]),...(role?.fill&&role.fill!=='NONE'?[['补位信息',ongoingPositionName(role.fill)||'客户端已提供补位标记']]:[]),...Object.entries(positions||{}).sort((a,b)=>(b[1]?.count||0)-(a[1]?.count||0)).slice(0,5).map(([id,value])=>[`历史 ${ongoingPositionName(id)}`,num(value?.count)+' 局'])];
  return `<h3>位置</h3>${metrics(rows.map(([label,value])=>[label,e(value)]))}<small>历史分路来自已结束对局的公开记录。</small>`;
 }
 if(kind==='champion'){
  const id=Number(element.dataset.tipChampion),aggregate=analysis?.champions?.[id];
  if(!aggregate)return `<h3>${e(heroName(data,id))}</h3><p>没有该英雄的已加载历史样本。</p>`;
  const w=aggregate.winLoss?.all||{},s=aggregate.summary||{};
  return `<h3>${e(heroName(data,id))} · ${e(scope)}</h3>${metrics([['样本',num(w.count)+' 局'],['胜 / 负',`${num(w.wins)} / ${num(w.losses)}`],['胜率',pct(w.winRate)],['平均 KDA',num(s.avgKda,2)],['伤害占比',pct(s.avgChampionDamagePercentageOfTeam)],['分均补刀',num(s.avgCsPerMinute,1)],...(Number.isFinite(aggregate.akariScore?.total)?[['Akari 参考分',num(aggregate.akariScore.total,2)+' / '+num(aggregate.akariScore.maxScore)]]:[])])}<small>点击图标查看该英雄的历史战绩。</small>`;
 }
 if(kind==='history'){
  const id=Number(element.dataset.tipId),game=(entry.page?.games||[]).find(value=>value.id===id);
  if(!game)return '';
  const self=game.self||{},label=self.result==='win'?'胜利':self.result==='loss'?'失败':self.result==='remake'?'重开':self.result==='abort'?'已中止':'结果未读取';
  return `<h3>${e(queueName(game.queue))} · ${e(label)}</h3>${metrics([['时间',Number.isFinite(game.created)?e(new Date(game.created).toLocaleString('zh-CN')):'时间未读取'],['时长',Number.isFinite(game.duration)?`${Math.floor(game.duration/60)}:${String(Math.floor(game.duration%60)).padStart(2,'0')}`:'未读取'],['英雄',e(heroName(data,self.champion))],['K / D / A',`${num(self.kills)} / ${num(self.deaths)} / ${num(self.assists)}`],['分均补刀',num(self.csPerMinute,1)],['伤害占比',pct(self.damageShare)]])}<small>点击查看这一局的完整复盘。</small>`;
 }
 return '';
}

/** Attribute helper so targets share one namespace with the tooltip binder. */
export function ongoingTipAttributes(kind,{player,champion,game,players,count,title,text}={}){
 return `data-ongoing-tip="${e(kind)}"${player?` data-tip-player="${e(player)}"`:''}${champion?` data-tip-champion="${e(champion)}"`:''}${game?` data-tip-id="${e(game)}"`:''}${players?` data-tip-players="${e(players)}"`:''}${Number.isFinite(count)?` data-tip-count="${e(count)}"`:''}${title?` data-tip-title="${e(title)}"`:''}${text?` data-tip-text="${e(String(text).slice(0,2500))}"`:''} tabindex="0"`;
}
