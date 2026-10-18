import {escape as e,button,portrait} from './ui.mjs';
export function matchHistoryToolsView(tab,{streamer=false,note='',data=null,masteryQuery=tab.masteryQuery||''}={}){
 if(streamer){tab=privateHistoryState({streamer:true,tabs:[tab]}).tabs[0];masteryQuery='';}
 const fields=(name,label,type='number',value='',extra='')=>`<label>${label}<input type="${type}" data-history-tool="${name}" value="${e(value)}" ${extra}></label>`;
 return `<section class="history-tools"><details data-disclosure-key="history-tools"><summary>查询工具与玩家资料</summary><div class="history-tools-grid"><div><h3>按条件收集战绩</h3><p class="muted">逐页查找指定英雄或分路，最多扫描 500 局。</p><div class="history-chart-controls">${fields('collect-champion','英雄 ID','number',tab.filter?.champion||'','min="1" max="10000"')}${fields('collect-position','分路','text',tab.filter?.position||'','placeholder="TOP / JUNGLE / MIDDLE / BOTTOM / UTILITY" maxlength="16"')}${fields('collect-count','目标样本数','number',50,'min="1" max="500"')}</div>${button('history-collect-filtered','开始收集','','small',tab.loading?'disabled':'')}${button('history-analysis-details',tab.analysisLoading?'正在读取时间线…':'补齐最近 20 局深度分析','','small quiet',tab.analysisLoading?'disabled':'')}<small>深度分析仅使用数据源实际返回的历史事件，不显示当前局隐藏信息。</small>${tab.analysisError?`<p class="history-error">${e(tab.analysisError)}</p>`:''}</div><div><h3>本次运行备注</h3><label>仅保存在本机当前运行内存<input data-history-tool="note" maxlength="200" value="${e(streamer?'':note)}" ${streamer?'disabled':''}></label>${button('history-note-save','保存备注','','small',streamer?'disabled':'')}${button('history-copy-id','复制游戏 ID','copy','small quiet',streamer?'disabled':'')}<label class="history-checkbox"><input type="checkbox" data-history-tool="streamer" ${streamer?'checked':''}>隐私展示（隐藏玩家名字）</label></div></div>${privacyView(tab.page?.player?.privacy)}<details data-disclosure-key="history-profile-extra"><summary>排位详情、熟练度与主页</summary>${profileDetails(tab.profile,data,masteryQuery,streamer)}</details><details data-disclosure-key="history-challenges"><summary>挑战成就</summary>${button('history-challenges',tab.challengesLoading?'读取中…':'读取挑战成就','','small',tab.challengesLoading?'disabled':'')}${tab.challengesError?`<p class="history-error">${e(tab.challengesError)}</p>`:''}${challengesView(tab.challenges)}</details></details></section>`;
}
const num=value=>Number.isFinite(value)?value.toLocaleString('zh-CN'):'未读取';
const tier=value=>({IRON:'黑铁',BRONZE:'青铜',SILVER:'白银',GOLD:'黄金',PLATINUM:'铂金',EMERALD:'翡翠',DIAMOND:'钻石',MASTER:'大师',GRANDMASTER:'宗师',CHALLENGER:'王者',UNRANKED:'未定级',NONE:'无',NA:'未定级'}[value]||value||'未读取');
const rank=(value,division)=>`${tier(value)}${!['MASTER','GRANDMASTER','CHALLENGER','NONE','NA','UNRANKED'].includes(value)&&['I','II','III','IV','V'].includes(division)?' '+division:''}`;
const queue=value=>({RANKED_SOLO_5x5:'单双排',RANKED_FLEX_SR:'灵活组排',RANKED_TEAM_5x5:'战队排位',RANKED_TEAM_3x3:'战队排位（3 对 3）',RANKED_FLEX_TT:'灵活组排（扭曲丛林）',RANKED_TFT:'云顶之弈排位',RANKED_TFT_DOUBLE_UP:'云顶之弈双人作战',RANKED_TFT_PAIRS:'云顶之弈双人作战',RANKED_TFT_TURBO:'云顶之弈狂暴模式',RANKED_CHERRY:'斗魂竞技场',CHERRY:'斗魂竞技场'}[value]||value||'队列未读取');
const category=value=>({COLLECTION:'收藏',IMAGINATION:'奇思妙想',EXPERTISE:'专精',TEAMWORK:'团队合作与战略',VETERANCY:'经验',LEGACY:'传承',NONE:'无'}[value]||value||'未读取');
const percent=value=>Number.isFinite(value)&&value>=0&&value<=1?(value*100).toFixed(2)+'%':'未读取';
const played=value=>{const date=new Date(value);return Number.isFinite(value)&&value>0&&Number.isFinite(date.getTime())?date.toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}):'未读取';};
function privacyView(privacy){return privacy==='PUBLIC'?'<p class="history-notice">玩家主页：公开（PUBLIC）</p>':privacy==='PRIVATE'?'<p class="history-notice" role="status">玩家主页：私密（PRIVATE）。部分战绩或资料可能受限，请以数据源实际返回为准。</p>':'<p class="muted">玩家主页隐私状态未读取</p>';}
function profileDetails(profile,data,query,streamer){
 if(!profile)return '<p>资料尚未读取</p>';
 const champions=Array.isArray(data?.champions)?data.champions:Object.values(data?.champions||{}),hero=id=>champions.find(c=>Number(c.key??c.id)===id);
 const all=(profile.mastery||[]).slice().sort((a,b)=>(b.points??-1)-(a.points??-1)),pattern=String(query).normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
 const rows=all.filter(m=>!pattern||[m.champion,hero(m.champion)?.name,hero(m.champion)?.title,hero(m.champion)?.id,...(hero(m.champion)?.aliases||[])].some(value=>String(value??'').normalize('NFKC').toLocaleLowerCase('zh-CN').includes(pattern)));
 return `${profile.notice?`<p class="history-notice">${e(profile.notice)}</p>`:''}<div class="history-table-scroll"><table><thead><tr><th>队列</th><th>当前段位</th><th>胜 / 负</th><th>本赛季最高</th><th>上赛季结束 / 最高</th></tr></thead><tbody>${(profile.ranked||[]).map(q=>`<tr><td>${e(queue(q.queue))}</td><td>${e(rank(q.tier,q.division))} · ${num(q.lp)} LP${q.provisional===true?`<small>定位赛剩余 ${num(q.provisionalRemaining)} / ${num(q.provisionalThreshold)} 局</small>`:''}${Number.isFinite(q.rating)&&q.rating>0?`<small>积分 ${num(q.rating)}</small>`:''}</td><td>${num(q.wins)} / ${num(q.losses)}</td><td>${e(rank(q.peak,q.peakDivision))}</td><td>${e(rank(q.previousTier,q.previousDivision))}<small>最高 ${e(rank(q.previousPeak,q.previousPeakDivision))}</small></td></tr>`).join('')||'<tr><td colspan="5">没有读取到排位资料</td></tr>'}</tbody></table></div><h3>英雄熟练度</h3><p>总分 ${num(profile.masteryTotals?.score)} · 总点数 ${num(profile.masteryTotals?.points)} · 等级合计 ${num(profile.masteryTotals?.levels)} · 英雄数 ${num(profile.masteryTotals?.champions)}</p><label>搜索熟练度英雄<input type="search" data-history-tool="mastery-query" maxlength="96" placeholder="英雄名称、称号或 ID" value="${e(query)}" ${streamer?'disabled':''}></label><p class="muted">显示 ${rows.length} / ${all.length} 位英雄</p><div class="history-table-scroll"><table><thead><tr><th>英雄</th><th>等级 / 点数</th><th>升级点数进度</th><th>代币 / 印记</th><th>最高评价 / 赛季里程碑</th><th>最近使用</th></tr></thead><tbody>${rows.map(m=>{const champion=hero(m.champion);return `<tr><td><span class="history-player">${champion?portrait(champion):''}${e(champion?.name||'英雄 '+num(m.champion))}</span></td><td>${num(m.level)} 级<small>${num(m.points)} 点</small></td><td>本级已获 ${num(m.sinceLastLevel)} 点<small>距下一级 ${num(m.untilNextLevel)} 点</small></td><td>${num(m.tokens)} 枚代币<small>升级需要 ${num(m.marksRequired)} 枚印记</small></td><td>${e(m.grade||'未读取')}<small>赛季里程碑 ${num(m.milestone)}</small>${milestoneView(m)}</td><td>${played(m.lastPlay)}</td></tr>`;}).join('')||`<tr><td colspan="6">${all.length?'没有匹配的英雄':'没有读取到英雄熟练度'}</td></tr>`}</tbody></table></div>${profile.cosmetics?`<p>主页背景皮肤 ID ${num(profile.cosmetics.backgroundSkin)} · 纹章 ${e(profile.cosmetics.regalia||'未读取')}</p>`:''}`;
}
function milestoneView(m){const next=m.nextMilestone;return `${m.milestoneGrades?.length?`<small>已获评价 ${m.milestoneGrades.map(e).join(' / ')}</small>`:''}${next?`<small>下一里程碑：${Object.entries(next.requireGrades||{}).map(([grade,count])=>`${e(grade)} × ${num(count)}`).join('、')||'评价要求未读取'} · 奖励 ${num(next.rewardMarks)} 枚印记${next.bonus===true?'（额外奖励）':''}</small>`:''}`;}
function challengesView(value){
 if(!value)return '<p class="muted">按需从当前大区后台查询，接口不可用时保留错误说明。</p>';
 return `<p>挑战等级 ${e(tier(value.total?.level))} · ${num(value.total?.current)} / ${num(value.total?.max)} 分 · 头衔 ${e(value.title||'未设置')}</p><h3>玩家资产总数</h3><dl class="history-metrics">${(value.assets||[]).map(v=>`<div><dt>${e(v.label)} <small>挑战 ${num(v.id)}</small></dt><dd>${num(v.total)}</dd></div>`).join('')}</dl><div class="history-table-scroll"><table><thead><tr><th>挑战类别</th><th>等级</th><th>分数</th><th>达到该等级的玩家占比</th></tr></thead><tbody>${Object.entries(value.categories||{}).map(([key,v])=>`<tr><td>${e(category(key))}</td><td>${e(tier(v?.level))}</td><td>${num(v?.current)} / ${num(v?.max)}</td><td>${percent(v?.percentile)}</td></tr>`).join('')}</tbody></table></div><p class="muted">玩家占比表示达到该挑战等级的玩家比例；接口按 0–1 返回，显示时乘以 100。未知占比显示“未读取”。<a href="https://developer.riotgames.com/apis#lol-challenges-v1/GET_getChallengePercentiles" target="_blank" rel="noreferrer">官方字段说明</a></p><div class="history-table-scroll"><table><thead><tr><th>挑战 ID</th><th>类别</th><th>等级</th><th>进度</th><th>下一等级</th><th>达到该等级的玩家占比</th><th>达成日期 / 排名</th></tr></thead><tbody>${(value.challenges||[]).map(v=>`<tr><td>${num(v.id)}</td><td>${e(category(v.category))}</td><td>${e(tier(v.level))}</td><td>${num(v.current)} / ${num(v.threshold)}</td><td>${e(tier(v.next))} · ${num(v.nextThreshold)}</td><td>${percent(v.percentile)}</td><td>${played(v.achieved)}${Number.isFinite(v.position)?`<small>排名 ${num(v.position)} · 同等级 ${num(v.playersInLevel)} 人</small>`:''}</td></tr>`).join('')||'<tr><td colspan="7">没有读取到挑战记录</td></tr>'}</tbody></table></div>`;
}
// Filter datalists display their option values as well as labels. Use this copy
// for advancedHistoryFilters in private mode; keep the normal private tab for
// game/player buttons, whose data-puuid is still needed by explicit actions.
export function privateHistoryFilterTab(tab){
 const safe=privateHistoryState({streamer:true,tabs:[tab]}).tabs[0];
 const game=value=>value?{...value,self:value.self?{...value.self,puuid:''}:null,participants:(value.participants||[]).map(player=>({...player,puuid:''}))}:value;
 return {...safe,privacyMasked:true,page:safe.page?{...safe.page,player:safe.page.player?{...safe.page.player,puuid:''}:null,games:(safe.page.games||[]).map(game)}:null};
}
export function privateHistoryState(state){
 if(!state.streamer)return state;
 const identities=new Map(),labels=new Map();let index=0;
 const identity=(id,name)=>{
  const label=identities.get(id)||identities.get(name)||'玩家 '+(++index);
  if(id)identities.set(id,label);
  if(name){identities.set(name,label);labels.set(name,label);const base=name.split('#')[0];if(base&&!labels.has(base))labels.set(base,label);}
  return label;
 };
 const player=value=>{if(value)identity(value.puuid,value.name);};
 const game=value=>{if(value){player(value.self);for(const p of value.participants||[])player(p);}};
 for(const p of state.searchResults||[])player(p);
 for(const tab of state.tabs||[]){player(tab.page?.player);for(const g of tab.page?.games||[])game(g);for(const d of Object.values(tab.details||{}))game(d.game);}
 // Give identity rules the same display aliases as the players, so evaluating
 // this view copy still filters the same games. No query state is mutated.
 const visited=new WeakSet();
 const prepareFilter=node=>{if(!node||typeof node!=='object'||visited.has(node))return;visited.add(node);if(typeof node.player==='string')identity(node.player,'');if(node.field==='player'&&typeof node.value==='string')identity(node.value,'');for(const child of Array.isArray(node.children)?node.children:[])prepareFilter(child);if(node.child)prepareFilter(node.child);};
 for(const tab of state.tabs||[]){for(const rule of tab.filter?.advanced?.rules||[])prepareFilter(rule);prepareFilter(tab.filter?.advanced?.tree);for(const preset of tab.filterPresets||[]){for(const rule of preset.filter?.advanced?.rules||[])prepareFilter(rule);prepareFilter(preset.filter?.advanced?.tree);}}
 const replacements=[...labels].sort((a,b)=>b[0].length-a[0].length),cache=new WeakMap();
 function clean(value,key='',parent=null){
  if(typeof value==='string'){
   if(/error$/i.test(key))return value?'读取失败，请检查连接后重试':'';
   if(/notice$/i.test(key))return value?'部分资料读取受限，请以实际返回数据为准':'';
   if(['query','masteryQuery','note'].includes(key))return '';
   if(key==='name'&&parent?.filter)return '筛选预设';
   if(key==='player'||key==='value'&&parent?.field==='player')return identities.get(value)||'玩家';
   if(key==='name'&&identities.has(value))return identities.get(value);
   if(['puuid','handle','session','server'].includes(key))return value;
   for(const [name,label] of replacements)value=value.replaceAll(name,label);
   return value;
  }
  if(!value||typeof value!=='object')return value;
  if(cache.has(value))return cache.get(value);
  if(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))return value;
  const entries=Object.entries(value),copy=Array.isArray(value)?[]:{};cache.set(value,copy);let changed=false;
  for(const [childKey,child] of entries){copy[childKey]=clean(child,childKey,value);if(copy[childKey]!==child)changed=true;}
  if(!changed){cache.set(value,value);return value;}
  return copy;
 }
 return clean(state);
}
