// Player-card rules adapted from League Akari 60f1584c (MIT, Copyright 2026 Hanxven).
// Card anatomy follows Akari's ongoing-game panel: 240px cards in a fixed
// column grid, avatar + level, one rank strip, one win-rate / KDA / position
// row, tags, champion usage and a compact match list.
import {escape as e,portrait,asset,button,roleIcon} from './ui.mjs';
import {queueName} from './core/match-history/model.mjs';
import {normalizeOngoingSettings,ONGOING_TAGS} from './core/ongoing-game.mjs';
import {ongoingGameAnalysisView,ongoingPositionName,ongoingTeamAnalysisView} from './ongoing-game-analysis-view.mjs';
import {ongoingJungleView} from './ongoing-game-jungle-view.mjs';
import {historicalSpell} from './match-history-spells.mjs';
import {findOutliersByIqr} from './core/akari/bridge.mjs';
import {ongoingTipAttributes} from './ongoing-game-hover.mjs';

const finite=Number.isFinite;
const num=(v,d=0)=>finite(v)?v.toLocaleString('zh-CN',{maximumFractionDigits:d}):'未读取';
const pct=v=>finite(v)?`${(v*100).toFixed(0)}%`:'未读取';
const champion=(data,id)=>(data?.champions||[]).find(c=>Number(c.key)===Number(id));
const heroName=(data,id)=>champion(data,id)?.name||(id>0?`英雄 ${id}`:'英雄未选择');
const heroPortrait=(data,id)=>champion(data,id)?portrait(champion(data,id)):'<span class="ongoing-empty-icon" aria-label="英雄未读取">?</span>';
const RANKS={IRON:'坚韧黑铁',BRONZE:'英勇黄铜',SILVER:'不屈白银',GOLD:'荣耀黄金',PLATINUM:'华贵铂金',EMERALD:'流光翡翠',DIAMOND:'璀璨钻石',MASTER:'超凡大师',GRANDMASTER:'傲世宗师',CHALLENGER:'最强王者',UNRANKED:'未定级',NONE:'未定级'};
const RESULT={win:'胜',loss:'负',remake:'重开',abort:'中止',unknown:'未知'};
const PHASES={lobby:'组队大厅','champ-select':'英雄选择','in-game':'对局进行中',draft:'已保留的对局',unavailable:'等待客户端'};
const POSITION_ORDER={TOP:1,JUNGLE:2,MIDDLE:3,MID:3,BOTTOM:4,UTILITY:5,SUPPORT:5};
const POSITION_ICON={TOP:'top',JUNGLE:'jungle',MIDDLE:'mid',MID:'mid',BOTTOM:'bottom',UTILITY:'support',SUPPORT:'support'};
const ROLE_REASONS={PRIMARY:'主选',SECONDARY:'副选',FILL_PRIMARY:'主选补位',FILL_SECONDARY:'副选补位',AUTOFILL:'系统补位'};
const TEAM_COLORS={'TEAM-100':'blue','TEAM-200':'red',LOBBY:'lobby'};
const currentPosition=p=>p.position||p.role?.current||'';
const canRead=p=>!!p&&!p.hidden&&!!p.puuid;
const playerName=(p,index,streamer)=>p.hidden?'身份隐藏':streamer?`玩家 ${index+1}`:p.name||'玩家名称未读取';
const playerAttr=p=>`data-player="${e(p.key)}"`;
const options=(rows,value)=>rows.map(([v,label])=>`<option value="${e(v)}"${String(v)===String(value)?' selected':''}>${e(label)}</option>`).join('');
const select=(field,label,rows,value)=>`<label class="ongoing-setting"><span>${e(label)}</span><select id="ongoing-setting-${field}" data-ongoing-field="${field}">${options(rows,value)}</select></label>`;
const integer=(field,label,value,min,max)=>`<label class="ongoing-setting"><span>${e(label)}</span><input type="number" data-ongoing-field="${field}" value="${value}" min="${min}" max="${max}" step="1"></label>`;
const toggle=(field,label,value)=>`<label class="ongoing-check"><input type="checkbox" data-ongoing-field="${field}"${value?' checked':''}><span>${e(label)}</span></label>`;
const positionIcon=position=>POSITION_ICON[position]?roleIcon(POSITION_ICON[position],'ongoing-position-icon'):'';

function settingsView(s){
 return `<details class="ongoing-settings" data-disclosure-key="ongoing-settings"><summary>对局设置 <small>${s.count} 场历史 · ${s.details} 场详细 · ${s.streamer?'主播模式':'本机显示'}</small></summary><div class="ongoing-settings-content"><div class="ongoing-settings-grid">${integer('count','历史加载场数',s.count,1,200)}${integer('details','详细对局上限',s.details,0,Math.min(50,s.count))}${integer('concurrency','并发查询',s.concurrency,1,3)}${select('source','数据源',[['auto','自动'],['lcu','客户端'],['sgp','游戏后台']],s.source)}${select('tag','标签分析范围',[['current','当前队列'],['all','全部已加载队列']],s.tag)}${select('sort','卡片排序',[['default','客户端顺序'],['win-rate','历史胜率'],['kda','平均 KDA'],['akari-score','Akari 参考分'],['position','当前分路'],['premade-team','历史共同对局']],s.sort)}${select('usage','常用英雄',[['recent','近期使用'],['mastery','英雄成就'],['none','不显示']],s.usage)}${integer('threshold','共同对局阈值',s.threshold,2,20)}</div><div class="ongoing-settings-checks">${toggle('enabled','启用对局分析',s.enabled)}${toggle('lobby','显示组队大厅',s.lobby)}${toggle('jungle','显示历史打野分析',s.jungle)}${toggle('jungleAll','显示所有玩家的历史打野样本',s.jungleAll)}${toggle('borders','历史对局边框',s.borders)}${toggle('autoRoute','自动切换到对局页',s.autoRoute)}${toggle('streamer','主播模式（隐藏名称与备注）',s.streamer)}</div><fieldset class="ongoing-tag-settings"><legend>卡片标签</legend>${Object.entries(ONGOING_TAGS).map(([tag,label])=>`<label class="ongoing-check"><input type="checkbox" data-ongoing-tag="${e(tag)}"${s.tags.includes(tag)?' checked':''}><span>${e(tag==='premade'?'历史共同对局':label)}</span></label>`).join('')}</fieldset><p class="ongoing-muted">标签和打野位置均来自已结束对局。共同对局仅为历史关联推断，不能证明当前预组队。</p></div></details>`;
}

/** One compact rank line per queue, with the full table on hover. */
function rankView(p,entry){
 const ranks=(entry.profile?.ranked||[]).slice(0,4),tip=ongoingTipAttributes('rank',{player:p.key});
 if(!ranks.length)return `<p class="ongoing-rank-empty" ${entry.loading?'':tip}>${entry.loading?'正在读取排位资料…':'排位资料未读取'}</p>`;
 return `<div class="ongoing-rank-strip" ${tip} aria-label="排位资料，查看详情">${ranks.map(r=>{const tier=String(r.tier||'').toUpperCase(),label=['RANKED_SOLO_5x5','RANKED_SOLO_5X5','420',420].includes(r.queue)?'单 / 双排':['RANKED_FLEX_SR','440',440].includes(r.queue)?'灵活组排':r.queue==='CHERRY'?'斗魂竞技场':'排位',division=['I','II','III','IV'].includes(r.division)?` ${r.division}`:'';return `<p title="${e(label)} · ${num(r.wins)} 胜 / ${num(r.losses)} 负"><small>${e(label)}</small><span>${e(RANKS[tier]||'段位未读取')}${e(division)}${finite(r.lp)?` · ${num(r.lp)} LP`:''}</span></p>`;}).join('')}</div>`;
}

/** Win rate, KDA and position cells; each opens its own detail on hover. */
function statsView(p,entry,state,s,outliers){
 const a=entry.analysis,hasAnalysis=a?.count>0,w=state.roster?.mode==='CHERRY'?a?.winLoss?.cherry:a?.winLoss?.all,scope=s.tag==='all'?'全部已加载队列':'当前队列';
 const rate=hasAnalysis&&w?.count>0?w.winRate:null,tone=finite(rate)?rate>=.53?'is-good':rate<=.47?'is-bad':'':'',kda=hasAnalysis&&finite(a.summary?.avgKda)?a.summary.avgKda:null,kdaTone=kda===null?'':outliers?.over?.includes(kda)?'is-good':outliers?.below?.includes(kda)?'is-bad':'';
 const role=p.role&&typeof p.role==='object'?p.role:null,reason=ROLE_REASONS[role?.assignmentReason],position=currentPosition(p);
 const history=a?.positions?Object.entries(a.positions).sort((x,y)=>(y[1]?.count||0)-(x[1]?.count||0)).slice(0,3):[];
 return `<div class="ongoing-card-stats"><div class="ongoing-stat ${tone}" ${ongoingTipAttributes('winrate',{player:p.key})} aria-label="历史胜率，查看详情"><strong>${finite(rate)?pct(rate):'—'}</strong><small>历史胜率${state.roster?.mode==='CHERRY'&&w?.count>0?' · 第一 '+pct(w.top1Rate):''}${finite(w?.count)?` (${num(w.count)})`:''}</small></div><div class="ongoing-stat ${kdaTone}" ${ongoingTipAttributes('kda',{player:p.key})} aria-label="平均 KDA，查看详情"><strong>${kda===null?'N/A':num(kda,2)}</strong><small>平均 KDA</small></div><div class="ongoing-stat ongoing-stat-position" ${ongoingTipAttributes('position',{player:p.key})} aria-label="位置资料，查看详情">${reason?`<span class="ongoing-role-reason${role.assignmentReason.includes('FILL')?' is-fill':''}">${e(reason)}</span>`:''}${position?`<span class="ongoing-position-now" title="${e(ongoingPositionName(position))}">${positionIcon(position)}</span>`:''}${history.length?`<span class="ongoing-position-history">${history.map(([id,value])=>`<span title="历史 ${e(ongoingPositionName(id))} ${num(value?.count)} 局">${positionIcon(id)}</span>`).join('')}</span>`:''}${!position&&!history.length&&!reason?'<small>位置未读取</small>':''}</div></div><p class="ongoing-sample">${e(scope)} · 有效 ${num(hasAnalysis?a.count:0)} / 已加载 ${Math.min(s.count,entry.page?.games?.length||0)} 局 · 详细 ${num(hasAnalysis?a.detailsCount:0)} 局</p>`;
}

function isJungler(p){return currentPosition(p)==='JUNGLE'||(p.spells||[]).includes(11);}
function tagsView(p,entry,state,s){
 const a=entry.analysis?.count>0?entry.analysis:null,summary=a?.summary||{},w=a?.winLoss?.all||{},score=a?.akariScore,enabled=new Set(s.tags),tags=[];
 const add=(id,label,title,tone='')=>{if(enabled.has(id))tags.push(`<span class="ongoing-tag ${tone}" data-ongoing-tag-id="${id}" ${ongoingTipAttributes('text',{title,text:title})}>${e(label)}</span>`);};
 const scope=s.tag==='current'?'当前队列':'全部已加载队列',basis=`${scope} · ${num(a?.count)} 场有效历史样本`;
 if(p.self||p.puuid&&p.puuid===state.roster?.selfPuuid)add('self','自己','当前客户端玩家','self');
 if(p.hidden||entry.page?.player?.privacy==='PRIVATE'||entry.profile?.privacy==='PRIVATE')add('privacy',p.hidden?'身份隐藏':'生涯隐藏','仅显示客户端公开提供的资料','warning');
 if(p.hidden)return tags.join('');
 const groups=(state.groups||[]).filter(g=>(g.players||[]).includes(p.puuid)&&g.count>=s.threshold);
 for(const g of groups.slice(0,3))add('premade',`历史共同对局 ${num(g.count)}+`,`与 ${num((g.players||[]).length-1)} 位当前玩家至少共同对局 ${num(g.count)} 次（历史关联推断，不能证明预组队）`,'group');
  const met=state.met?.[p.puuid];if(met?.count>0)add('met',`曾同局 ${num(met.count)}`,`本机本次运行记录共同对局 ${num(met.count)} 次 · 同队 ${num(met.ally)} / 对手 ${num(met.enemy)}${met.unknown?' / 关系未读取 '+num(met.unknown):''}`);
 const note=state.notes?.[p.puuid];if(note&&!s.streamer)add('tagged','有备注',note);
 if(!a)return tags.join('');
 if(a.spells?.flashOnD>0&&a.spells?.flashOnF>0)add('flash','闪现异位',`${basis}；D 位 ${num(a.spells.flashOnD)} 次 / F 位 ${num(a.spells.flashOnF)} 次，历史中两个位置均使用过闪现`);
 if(w.winningStreak>=3)add('winning',`${num(w.winningStreak)} 连胜`,`${basis}；最近连续胜利 ${num(w.winningStreak)} 场`,'positive');
 if(w.losingStreak>=3)add('losing',`${num(w.losingStreak)} 连败`,`${basis}；最近连续失败 ${num(w.losingStreak)} 场`,'negative');
 if(finite(summary.avgSoloKills)&&summary.avgSoloKills>0)add('solo',`${num(summary.avgSoloKills,1)} 单杀`,`${basis}；场均单杀 ${num(summary.avgSoloKills,2)} 次`);
 const deaths=a.details?.avgEarlyDeathsWithEnemyJunglerInvolved;
 if(!isJungler(p)&&a.detailsCount>0&&finite(deaths)){
  const label=deaths>2?'历史非常好抓':deaths>=1.5?'历史好抓':deaths<1?'历史难抓':'';
  if(label)add('gank',label,`历史 ${num(a.detailsCount)} 场详细峡谷对局；15 分钟前被敌方打野参与击杀场均 ${num(deaths,2)} 次。阈值：<1 难抓，1.5–2 好抓，>2 非常好抓；不代表本局行踪。`,deaths>=1.5?'warning':'');
 }
 if(w.count>=16&&w.winRate>=.85)add('performance','极高历史胜率',`历史胜率至少 85%，且至少 16 场：${num(w.wins)} 胜 / ${num(w.count)} 场`,'positive');
 if(finite(score?.total)){
  if(score.extraordinary&&score.total>=8&&a.count>=8)add('performance','参考表现突出',`${basis}；Akari ≥ 8，至少 8 场。Akari 自定义权重，非官方评分。`,'positive');
  else if(score.outstanding&&score.total>=6.5&&a.count>=5)add('performance','参考表现优异',`${basis}；Akari ≥ 6.5，至少 5 场。Akari 自定义权重，非官方评分。`,'positive');
  add('akari',`Akari ${num(score.total,2)}`,`${basis}；Akari 自定义参考评分 ${num(score.total,2)} / ${num(score.maxScore)}，非官方评分。`);
 }
 for(const [id,key,label,format] of [['damage','avgChampionDamagePercentageOfTeam','伤害','pct'],['taken','avgDamageTakenPercentageOfTeam','承伤','pct'],['gold','avgGoldPercentageOfTeam','金币','pct'],['cs','avgCsPerMinute','补刀 / 分','num'],['efficiency','avgDamageGoldEfficiency','伤转率','pct'],['pings','avgEnemyMissingPings','消失信号','num'],['vision','avgVisionScore','视野','num']])if(finite(summary[key]))add(id,`${label} ${format==='pct'?pct(summary[key]):num(summary[key],1)}`,`${basis}；平均${label} ${format==='pct'?pct(summary[key]):num(summary[key],2)}${id==='efficiency'?'，英雄伤害 ÷ 获得金币':''}`);
 const kde=summary.avgKillDamageEfficiency;
 if(finite(kde)&&(kde>1.35||kde<.65))add('killEfficiency',kde>1.35?'K 头':'打工',`${basis}；平均击杀伤害比 ${pct(kde)}。>135% 为 K 头，<65% 为打工；只描述历史击杀与队伍伤害的比例。`);
 return tags.join('');
}

function usageView(p,entry,data,s){
 if(s.usage==='none')return '';
 let rows;
 if(s.usage==='mastery')rows=[...(entry.profile?.mastery||[])].sort((a,b)=>(b.points||0)-(a.points||0)).map(m=>({id:m.champion,title:`${heroName(data,m.champion)} · 成就 ${num(m.level)} 级 · ${num(m.points)} 点`,text:`${num(m.level)} 级`,star:m.level>=60}));
 else rows=Object.values(entry.analysis?.champions||{}).sort((a,b)=>(b.winLoss?.all?.count||0)-(a.winLoss?.all?.count||0)).map(c=>({id:c.championId,title:`${heroName(data,c.championId)} · ${num(c.winLoss?.all?.count)} 局`,text:`${num(c.winLoss?.all?.count)} 局`,rate:c.winLoss?.all?.winRate}));
 return `<section class="ongoing-usage"><h4>${s.usage==='mastery'?'英雄成就':'近期常用'}<small>最多 9 位</small></h4><div>${rows.slice(0,9).map(c=>`<button type="button" data-action="ongoing-history" ${playerAttr(p)} data-champion="${e(c.id)}" ${ongoingTipAttributes('champion',{player:p.key,champion:c.id,title:c.title})} aria-label="查看${e(heroName(data,c.id))}战绩">${heroPortrait(data,c.id)}${c.star?'<span class="ongoing-mastery-star" title="成就至少 60 级">★</span>':''}${finite(c.rate)?`<i class="ongoing-usage-rate ${c.rate>=.5?'is-good':'is-bad'}" aria-hidden="true"></i>`:''}<small>${e(c.text)}</small></button>`).join('')||'<span class="ongoing-muted">暂无样本</span>'}</div></section>`;
}

function historyRows(p,entry,data,s){
 const games=(entry.page?.games||[]).filter(g=>g?.self).slice(0,s.count);
 return `<section class="ongoing-history"><h4>近期战绩 <small>已显示 ${games.length} / 上限 ${s.count}</small></h4><div class="ongoing-history-list" tabindex="0" aria-label="近期战绩列表">${games.map(g=>{const v=g.self,result=Object.hasOwn(RESULT,v.result)?v.result:'unknown',created=finite(g.created)&&!Number.isNaN(new Date(g.created).getTime())?new Date(g.created).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'时间未读取',label=g.arena&&v.placement>0?`第 ${num(v.placement)} 名`:RESULT[result];return `<button type="button" class="ongoing-history-row ${result}${s.borders?' with-border':''}" data-action="ongoing-preview" ${playerAttr(p)} data-id="${e(g.id)}" ${ongoingTipAttributes('history',{player:p.key,game:g.id,title:`${queueName(g.queue)} · ${created}`})} aria-label="${e(queueName(g.queue))} · ${e(created)} · ${e(label)} · 查看完整复盘">${heroPortrait(data,v.champion)}<span class="ongoing-history-queue">${e(queueName(g.queue))}<small>${e(created)} <b>${e(label)}</b></small></span><span class="ongoing-history-kda">${num(v.kills)} / ${num(v.deaths)} / ${num(v.assists)}</span></button>`;}).join('')||`<p class="ongoing-card-empty">${entry.loading?'正在读取历史对局…':p.hidden?'客户端未提供公开身份':'没有读取到历史对局'}</p>`}</div></section>`;
}

function jungleView(p,entry,data,s){
 if(!s.jungle||!s.jungleAll&&!isJungler(p))return '';
 const a=entry.analysis;if(!a)return '';
 const current=a.champions?.[p.champion]?.jungle;
 if(isJungler(p)&&current?.gamesAnalyzed>0)return ongoingJungleView(current,{label:heroName(data,p.champion),compact:true});
 if(isJungler(p)&&p.champion>0)return `<details class="ongoing-jungle compact"><summary>当前英雄暂无打野样本</summary>${ongoingJungleView(a.jungle,{compact:true})}</details>`;
 return ongoingJungleView(a.jungle,{compact:true});
}

function playerCard(p,index,state,data,s,outliers){
 // Hidden champion-select identities must never pick up a stale cached player record.
 const entry=p.hidden?{}:state.players?.[p.key]||{},name=playerName(p,index,s.streamer),attrs=playerAttr(p),readable=canRead(p),disabled=!readable?'disabled':'';
 const error=entry.error&&(s.streamer?'该玩家资料读取失败，可单独刷新':entry.error),notice=entry.notice||entry.page?.notice;
 const nameButton=button('ongoing-history',e(name),'','ongoing-player-name quiet',`${attrs} ${disabled} title="${e(s.streamer||p.hidden?'查看玩家战绩':`查看 ${name} 的战绩`)}"`);
 const spells=(p.spells||[]).slice(0,2).map((id,i)=>{const spell=historicalSpell(data,id);return id>0?`<span title="${i===0?'D':'F'} · ${e(spell.name)}">${asset('spell',spell.id,spell.name,'ongoing-spell')}</span>`:'<span class="ongoing-spell-empty" aria-label="召唤师技能未读取"></span>';}).join('');
 const note=state.notes?.[p.puuid];
 const detailStatus=entry.detailsLoading?`<p class="ongoing-status" role="status">正在读取详细样本 ${num(entry.loadedDetails)} / ${s.details}…</p>`:entry.detailsError?`<p class="ongoing-notice">${e(s.streamer?'部分详细对局读取失败':entry.detailsError)}</p>`:'';
 const tags=tagsView(p,entry,state,s);
 return `<article class="ongoing-player-card${p.self?' is-self':''}" data-ongoing-player="${e(p.key)}" data-disclosure-context="ongoing-player:${e(p.key)}" aria-busy="${!!(entry.loading||entry.detailsLoading)}"><header class="ongoing-card-header"><span class="ongoing-avatar" title="${e(heroName(data,p.champion))}${p.champion>0&&!p.locked?' · 预选，未锁定':''}">${heroPortrait(data,p.champion)}${finite(p.level)?`<small class="ongoing-level">${num(p.level)}</small>`:''}</span><span class="ongoing-spell-pair" aria-label="召唤师技能">${spells}</span><div class="ongoing-player-identity">${nameButton}<p>${e(heroName(data,p.champion))}${p.champion>0&&!p.locked?'<small> · 预选</small>':''}</p></div>${button('ongoing-player-refresh','','refresh','quiet icon-only ongoing-refresh-player',`${attrs} ${disabled||entry.loading?'disabled':''} title="刷新玩家资料" aria-label="刷新玩家资料"`)}</header>${rankView(p,entry)}${statsView(p,entry,state,s,outliers)}${entry.loading?'<p class="ongoing-status" role="status">正在读取玩家资料…</p>':''}${detailStatus}${error?`<p class="ongoing-error" role="alert">${e(error)}</p>`:''}${notice?`<p class="ongoing-notice">${e(s.streamer?'部分历史资料有读取限制':notice)}</p>`:''}${jungleView(p,entry,data,s)}${tags?`<div class="ongoing-tags">${tags}</div>`:''}${usageView(p,entry,data,s)}${historyRows(p,entry,data,s)}<div class="ongoing-card-actions">${button('ongoing-history','全部战绩','','small quiet',`${attrs} ${disabled} title="查看玩家历史战绩"`)}${p.champion>0?button('ongoing-history','英雄战绩','','small quiet',`${attrs} data-champion="${e(p.champion)}" ${disabled}`):''}${POSITION_ORDER[currentPosition(p)]?button('ongoing-history','分路战绩','','small quiet',`${attrs} data-position="${e(currentPosition(p))}" ${disabled}`):''}${button('ongoing-note',s.streamer?'备注':note?'编辑备注':'备注','','small quiet',`${attrs} ${disabled} ${s.streamer?'disabled title="主播模式已隐藏备注"':'title="管理本机玩家备注"'}`)}</div>${note&&!s.streamer&&!p.hidden?`<p class="ongoing-player-note">${e(note)}</p>`:''}${ongoingGameAnalysisView(entry.analysis,data,{playerKey:readable?p.key:'',scope:s.tag==='all'?'全部已加载队列':'当前队列',showJungle:s.jungle&&(s.jungleAll||isJungler(p))})}</article>`;
}

function sortedPlayers(players,state,s){
 const value=(p,field)=>{const a=state.players?.[p.key]?.analysis;if(p.hidden||!(a?.count>0))return -Infinity;return field==='win-rate'?a.winLoss?.all?.winRate:field==='kda'?a.summary?.avgKda:a.akariScore?.total;};
 return [...players].sort((a,b)=>{
  if(['win-rate','kda','akari-score'].includes(s.sort)){const x=value(a,s.sort),y=value(b,s.sort);return (finite(y)?y:-Infinity)-(finite(x)?x:-Infinity)||0;}
  if(s.sort==='position')return (POSITION_ORDER[currentPosition(a)]||99)-(POSITION_ORDER[currentPosition(b)]||99);
  if(s.sort==='premade-team'){const group=p=>(state.groups||[]).findIndex(g=>g.count>=s.threshold&&(g.players||[]).includes(p.puuid)),x=group(a),y=group(b);return (x<0?999:x)-(y<0?999:y);}
  return 0;
 });
}

function teamName(key,roster,players){
 if(key==='LOBBY')return '组队大厅';
 if(key==='TEAM-ALL')return '斗魂竞技场玩家';
 if(roster.phase==='in-game'&&['TEAM-100','TEAM-200'].includes(key))return key==='TEAM-100'?'蓝色方':'红色方';
 if(key.startsWith('CHERRY-'))return `斗魂小队 ${key.slice(7)}`;
 return players.some(p=>p.self||p.puuid&&p.puuid===roster.selfPuuid)?'我方队伍':key==='TEAM-200'?'对方队伍':'队伍';
}

/** KDA outliers inside one team, the same IQR rule Akari colors its cards with. */
function kdaOutliers(members,state){
 const values=members.map(p=>state.players?.[p.key]?.analysis).filter(a=>a?.count>0&&finite(a.summary?.avgKda)).map(a=>a.summary.avgKda);
 return values.length>=3?findOutliersByIqr(values,null,.65):null;
}

function teamsView(state,data,s){
 const roster=state.roster||{},players=(roster.players||[]).slice(0,30),keys=[...new Set([...Object.keys(roster.teams||{}),...players.map(p=>p.team||'UNKNOWN')])];
 return keys.map(team=>{
  const members=players.filter(p=>p.team===team||(roster.teams?.[team]||[]).includes(p.key));if(!members.length)return '';
  const sorted=sortedPlayers(members,state,s),analyzed=members.filter(p=>!p.hidden&&state.players?.[p.key]?.analysis?.count>0).length,outliers=kdaOutliers(members,state);
  const names=new Set(members.map(p=>p.puuid).filter(Boolean)),groups=(state.groups||[]).filter(g=>g.count>=s.threshold&&(g.players||[]).length>1&&g.players.every(id=>names.has(id)));
  const label=teamName(team,roster,members),dot=TEAM_COLORS[team]?`<span class="ongoing-team-dot is-${TEAM_COLORS[team]}" aria-hidden="true"></span>`:'';
  return `<section class="ongoing-team" data-ongoing-team="${e(team)}" data-disclosure-context="ongoing-team:${e(team)}"><header class="ongoing-team-heading"><div class="ongoing-team-title">${dot}<h2>${e(label)}<small>${members.length} 人</small></h2>${ongoingTeamAnalysisView(state.teamAnalysis?.[team],{members:members.length,analyzed})}</div>${groups.length?`<div class="ongoing-team-groups">${groups.map((g,i)=>{const keys=g.players.filter(id=>members.some(p=>p.puuid===id));return `<span class="ongoing-tag group" ${ongoingTipAttributes('premade',{players:keys.map(id=>members.find(p=>p.puuid===id)?.key||'').filter(Boolean).join(','),count:g.count,title:`历史共同对局 ${String.fromCharCode(65+i)}`})}>历史共同对局 ${String.fromCharCode(65+i)} · ${g.players.length} 人 / ${num(g.count)}+ 次</span>`;}).join('')}</div>`:''}</header><div class="ongoing-team-scroll${members.length>5?' is-large':''}" tabindex="0" aria-label="${e(label)}玩家卡片" style="--ongoing-cards:${members.length}"><div class="ongoing-player-grid">${sorted.map(p=>playerCard(p,players.indexOf(p),state,data,s,outliers)).join('')}</div></div></section>`;
 }).join('');
}

function previewView(state,data,s){
 const detail=state.details;if(!detail||Array.isArray(detail)||!detail.game)return '';
 const game=detail.game;
 return `<details class="ongoing-preview-panel" open><summary>历史对局预览 · ${e(queueName(game.queue))}<small>对局 ${e(game.id)}</small></summary>${detail.loading?'<p role="status">正在读取详细对局…</p>':''}${detail.error?`<p class="ongoing-error">${e(s.streamer?'历史对局详情读取失败':detail.error)}</p>`:''}<div class="ongoing-preview-scroll"><table><thead><tr><th>玩家 / 英雄</th><th>历史分路</th><th>K / D / A</th><th>英雄伤害</th><th>金币</th><th>补刀</th></tr></thead><tbody>${(game.participants||[]).map((p,i)=>`<tr><td><span class="ongoing-preview-player">${heroPortrait(data,p.champion)}<span>${e(s.streamer?`玩家 ${i+1}`:p.name||'玩家')}<small>${e(heroName(data,p.champion))}${p.placement>0?' · 第 '+num(p.placement)+' 名':''}</small></span></span></td><td>${e(ongoingPositionName(p.position))}</td><td>${num(p.kills)} / ${num(p.deaths)} / ${num(p.assists)}</td><td>${num(p.damage)}</td><td>${num(p.gold)}</td><td>${num(p.cs)}</td></tr>`).join('')}</tbody></table></div><small>已结束对局的历史数据。</small></details>`;
}

/** Pure renderer. All actions, loading, notes and data queries belong to the controller. */
export function ongoingGameView(state={},data={}){
 const s=normalizeOngoingSettings(state.settings),roster=state.roster||{},players=roster.players||[],draft=!!state.draft||roster.phase==='draft',phase=draft?'已保留的对局':PHASES[roster.phase]||'等待客户端';
 const showPlayers=s.enabled&&(s.lobby||roster.phase!=='lobby')&&players.length>0;
 return `<div class="ongoing-page${s.streamer?' is-streamer':''}"><header class="ongoing-heading"><div><h1>对局</h1><p><span class="ongoing-phase">${e(phase)}</span> · ${e(roster.queue!==null&&roster.queue!==undefined?queueName(roster.queue):'队列未读取')}${roster.mode?` · ${e(roster.mode==='CHERRY'?'斗魂竞技场':roster.mode==='CLASSIC'?'召唤师峡谷':roster.mode==='ARAM'?'大乱斗':roster.mode)}`:''}${draft?'<span class="ongoing-draft-mark">历史保留</span>':''}</p></div><div class="ongoing-heading-actions">${draft?button('ongoing-exit-draft','返回当前对局','','small quiet'):''}${button('ongoing-clear','清空本次分析','','small quiet')}${button('ongoing-refresh',state.loading?'正在刷新':'刷新全部','refresh','small',state.loading?'disabled':'')}</div></header><p class="ongoing-page-hint">当前阵容来自客户端公开资料；表现、标签与路线为已结束对局的历史参考。</p>${settingsView(s)}${state.error?`<p class="ongoing-error" role="alert">${e(s.streamer?'对局资料读取失败，请刷新重试':state.error)}</p>`:''}${state.loading?'<p class="ongoing-status" role="status">正在加载公开玩家资料与历史样本…</p>':''}${!s.enabled?'<div class="ongoing-empty"><h2>对局分析已关闭</h2><p>展开“对局设置”，开启对局分析。</p></div>':roster.phase==='lobby'&&!s.lobby?'<div class="ongoing-empty"><h2>已隐藏大厅分析</h2><p>进入英雄选择后会显示对局；也可在设置中开启大厅显示。</p></div>':!showPlayers?'<div class="ongoing-empty"><h2>等待客户端公开阵容</h2><p>登录客户端并进入组队大厅、英雄选择或对局后显示玩家卡片。身份隐藏的玩家会保留空卡，不推测身份。</p></div>':teamsView(state,data,s)}${previewView(state,data,s)}</div>`;
}
