import {escape as e,icon} from './ui.mjs';
import {GUIDE_STAGES,guideMismatch} from './core/guide-stage.mjs';
import {phaseLabel} from './core/guide.mjs';
const conditionNames=[['ad','普攻压力'],['ap','魔法伤害'],['control','控制多'],['heal','回血多'],['burst','需要保命']];
export function estimateRows(model){
 const value=model?.estimate;
 if(!value)return '';
 const tendency=d=>d.edge>0.25?'偏你':d.edge<-0.25?'偏对方':'均势';
 const source=value.liveReal?'己方实时面板 · 对手按公开装备和等级反推估算':'双方按公开装备和等级反推估算';
 const warningNames=(value.warningEnemies||[]).map(d=>d.name).join('、');
 const skills=value.mineSkillBasis==='reviewed'?'己方技能使用人工复核公式，对手技能按总点数近似。':'技能项按总点数近似。';
 // Glance shows the verdict banner numbers; the full rows fold into a
 // collapsed <details> so one screen holds verdict + warning + summary.
 // The danger row stays outside so a warning is never hidden behind a click.
 const summary=`6 秒输出估算 · ${e(value.enemy.name)} · 换血模型${tendency(value)}`;
 return `${value.danger?`<p class="estimate-row danger" title="六秒模型估算，不表示立即斩杀或对手在附近"><b>模型提示 · ${e(warningNames)}</b> ${e(value.enemy.name)}估算 ${value.theirKill}，达到你当前 ${value.curHp} 血</p>`:''}
 <details class="estimate-detail"><summary>${summary}</summary><p class="estimate-row"><b>6 秒输出估算 · ${e(value.enemy.name)}</b> 我方约 <strong>${value.killThreshold}</strong> / 对方约 <strong>${value.theirKill}</strong> · 换血模型${tendency(value)}<span>${source}；优先显示估算输出最高的对手</span></p>
 ${value.duels.length>1?`<p class="estimate-row rivals">其他对手（我方 / 对方估算）：${value.duels.slice(1,6).map(d=>`${e(d.enemy.name)} ${d.killMine} / ${d.killTheirs}`).join(' · ')}</p>`:''}</details>
 <details class="estimate-assumptions" data-guide-section="estimate-assumptions"><summary>估算前提</summary><p>六秒持续输出的粗略模型，${skills}未计命中、距离、技能冷却、穿透、护盾、条件装备特效与海克斯强化；不是实际伤害或立即斩杀判断，也不表示对手在附近。</p></details>`;
}
// Glanceable combat headline: same computed numbers as estimateRows, only
// bigger. No new claims — word mirrors the edge direction, danger mirrors
// the existing warning row.
export function verdictBanner(m){
 const est=m?.estimate;
 if(!est)return '';
 const dir=est.edge>0.25?'偏你':est.edge<-0.25?'偏对方':'均势';
 const cls=est.danger?'danger':est.edge>0.25?'good':est.edge<-0.25?'bad':'even';
 const word=est.danger?'注意':dir;
 return `<section class="verdict ${cls}"><b>${word}</b><div class="verdict-nums"><span>六秒输出约 <em>${est.killThreshold??'—'}</em></span><span>承受输出约 <em>${est.theirKill??'—'}</em></span></div><small>${e(est.enemy?.name||'')} · 估算</small></section>`;
}
// Custom duel simulator: pick one ally side and one enemy side from the
// live scoreboard feed. Same computed numbers as estimateRows, no new
// claims — options come only from visible allies/enemies.
export function duelBox(m){
 const opts=m?.duelOptions;
 if(!opts||(!opts.own.length&&!opts.foe.length))return '';
 const pick=m?.duelPick||{};
 const opt=(id,name,sel)=>`<option value="${id}"${sel?' selected':''}>${e(name)}</option>`;
 const ownOpts=`<option value="">我方…</option>`+opts.own.map(o=>opt(o.id,(o.self?'我 · ':'')+o.name,pick.own===o.id)).join('');
 const foeOpts=`<option value="">对方…</option>`+opts.foe.map(o=>opt(o.id,o.name,pick.foe===o.id)).join('');
 const cd=m?.customDuel;
 let result='';
 if(cd&&!cd.unresolved){
  const dir=cd.edge>0.25?'偏'+cd.own.name:cd.edge<-0.25?'偏'+cd.foe.name:'均势';
  result=`<p class="estimate-row"><b>${e(cd.own.name)} vs ${e(cd.foe.name)}</b> ${e(dir)} · ${e(cd.own.name)}六秒输出约 <strong>${cd.killMine??'—'}</strong> · ${e(cd.foe.name)}六秒输出约 <strong>${cd.killTheirs??'—'}</strong> <span class="est-src">${e(cd.skillsNote)}；六秒粗略模型${cd.approx?' · 部分为估算':''}</span></p>`;
 }else if(cd?.unresolved){
  result=`<p class="note">所选英雄或等级暂不可读，请等待同步或重选</p>`;
 }
 return `<div class="duel-box"><div class="duel-pick"><select id="guide-duel-own" aria-label="我方英雄">${ownOpts}</select><span>vs</span><select id="guide-duel-foe" aria-label="对方英雄">${foeOpts}</select></div>${result}</div>`;
}
// Transparent kill strip: one direction only — my kill line against each
// visible enemy, no incoming damage, no warnings. Numbers come from the same
// estimate model, only killMine is rendered.
export function killStrip(m){
 const duels=Array.isArray(m?.estimate?.duels)?m.estimate.duels.slice(0,5):[];
 if(!duels.length)return '';
 const rows=duels.map(d=>`<span>vs ${e(d.enemy?.name)} · 我方约 <strong>${d.killMine??'—'}</strong></span>`).join('');
 return `<button class="kill-strip" data-action="strip" title="点击回到完整指引" aria-label="透明斩杀线，点击回到完整指引">${rows}<small>六秒输出估算 · 点击回到完整指引</small></button>`;
}
export function renderGuide(snapshot,tab,isPreview,image){
 const m=snapshot?.model;
 if(!m)return `<header class="drag"><b>开黑搭子 · 本局指引</b><button data-action="hide" aria-label="隐藏">${icon('close')}</button></header><div class="empty"><h2>先准备这一局</h2><p>打开英雄配置，点击“本局指引”，把出装与配合带到这个小窗口。</p><button class="primary" data-action="main">打开助手</button></div>`;
 const next=m.next,plan=m.targetPlan||m.purchase.find(p=>p.id===next?.id),action=m.action,current=snapshot.current;
 const wrong=['champion','mode','role','combo'].includes(m.live.kind)||guideMismatch(m.selection,current)||m.live.champion&&m.live.champion!==m.champion.id;
 const liveText=m.live.matched?`本机同步 · ${m.live.gold??'—'} 金 · ${m.live.level??'—'} 级`:'手动参考 · '+m.live.reason;
 const inputText=snapshot.mousePassThrough?'鼠标穿透中 · 标题栏可拖动点击 · Ctrl + Shift + H 进入完整交互':snapshot.interactionHotkeyAvailable?'可交互 · 游戏中 Ctrl + Shift + H 切换穿透':'可交互 · 穿透快捷键未注册';
 if(snapshot.strip){
  return killStrip(m)||`<button class="kill-strip" data-action="strip" title="点击回到完整指引" aria-label="透明斩杀线，点击回到完整指引"><span>暂无对局估算</span><small>点击回到完整指引</small></button>`;
 }
 if(snapshot.ball){
  const mainImg=(next&&!wrong)?image('item',action?.id||next.id,action?.name||next.name):image('champion',m.champion.id,m.champion.name);
  const title=wrong?'方案与当前选择不一致 · 点击展开核对':next?`下一件：${action?.name||next.name} · 点击展开窗口`:'路线已完成 · 点击展开窗口';
  return `<button class="ball-btn" data-action="ball" title="${e(title)}" aria-label="${e(title)}">${mainImg}${next&&!wrong?`<span class="ball-hero">${image('champion',m.champion.id,m.champion.name)}</span>`:'<span class="ball-done">✓</span>'}</button>`;
 }
 return `<header class="drag"><div><span class="brand-dot">K</span><b>${m.collapsed?e(m.champion.name)+' · '+e(m.role)+' · ':''}本局指引</b><small>${isPreview?'预览':snapshot.connected?phaseLabel(snapshot.phase):'方案参考'}</small></div><div class="window-actions"><button data-action="ball" aria-label="收起为悬浮球" title="收起为悬浮球，点击悬浮球展开">●</button><button data-action="strip" aria-label="切换透明文本条" title="透明文本条：只显示我方斩杀线">▤</button><button data-action="interaction" aria-label="切换指引交互" title="游戏中 Ctrl + Shift + H 切换鼠标穿透">${snapshot.mousePassThrough?'◉':'⌖'}</button><button data-action="collapse" aria-label="${m.collapsed?'展开':'收起'}" title="${m.collapsed?'展开':'收起'}">${m.collapsed?'+':'−'}</button><button data-action="hide" aria-label="隐藏指引" title="隐藏指引">${icon('close')}</button></div></header>
 <section class="hero-summary"><div class="hero-id">${image('champion',m.champion.id,m.champion.name)}<div><h1>${e(m.champion.name)}</h1><p>${m.mode==='hex'?'海克斯大乱斗':e(m.role)} <span>· ${e(m.version)}</span></p></div></div><button class="text-button" data-action="main" title="打开完整配置">完整配置 ${icon('arrow')}</button></section>
 <div class="guide-status" title="${e(liveText)}">${e(liveText)}${m.live.at?`<small>读取 ${new Date(m.live.at).toLocaleTimeString('zh-CN')}</small>`:''}</div>
 ${wrong?`<section class="guide-mismatch"><b>这份方案与当前英雄、正式位置、模式或组合不一致</b><p>正在查看 ${e(m.champion.name)}${current?'；当前选择 '+e(current.name||current.id):''}。</p><button data-action="${current?'current':'main'}">${current?'换入当前英雄与正式位置':'打开助手重新选择'}</button></section>`:`<section class="next-item ${next?'':'complete'}">${next?`${image('item',action?.id||next.id,action?.name||next.name)}<div><small>${action?({component:'本次回城 · 可买组件',complete:'本次回城 · 可合成',save:'下一步组件参考',upgrade:'查看商店升级条件'}[action.kind]):m.purchaseTarget?'本次回城目标 · 手动参考':'下一件成装参考 · 手动进度'}</small><b>${e(action?.name||next.name)}</b><p>${action?`${action.cost?`约 ${action.cost} 金`:'基础装备已持有'}${action.shortfall===null?' · 金币暂不可读':action.shortfall>0?' · 还差 '+action.shortfall+' 金':''}${action.kind==='component'?' · 通向 '+e(next.name):action.kind==='upgrade'?' · 以游戏任务为准':''}`:next.purchaseBase?`先购买${e(next.purchaseBase.name)}`:`完整价格 ${next.cost} 金`}</p></div>${!m.live.matched&&m.route.some(i=>i.id===next.id)?`<button data-action="item" data-id="${next.id}" aria-label="标记已买${e(next.name)}">已买 ${icon('check')}</button>`:''}`:`${icon('check')}<div><b>这套路线已完成</b><small>仍需按实际局势调整</small></div>`}</section>${verdictBanner(m)}`}
 ${wrong?'':`<div class="quick-reminders">${estimateRows(m)}${duelBox(m)}<p class="quick-skill"><b>加点参考</b> ${m.nextSkill?`有技能点可升 <strong>${m.nextSkill}</strong>`:e(m.priority?m.priority.split('').join(' › '):'按游戏内提示')}<span>以游戏可升级技能为准</span></p>${m.combo?`<p class="quick-plan" title="${e(m.stageHint?.text||m.combo.ownJob||m.combo.plan)}"><b>${e(m.stageHint?.label||'你的配合')}</b> ${e(m.stageHint?.text||m.combo.ownJob||m.combo.plan)}</p>`:''}</div>`}
 <p class="input-hint">${e(inputText)}</p>
 <div class="expanded"><nav aria-label="指引内容"><button data-tab="items" class="${tab==='items'?'active':''}">购买 / 局势</button><button data-tab="skills" class="${tab==='skills'?'active':''}">加点 / 符文</button>${m.combo?`<button data-tab="team" class="${tab==='team'?'active':''}">配合速记</button>`:''}${m.mode==='hex'?`<button data-tab="augments" class="${tab==='augments'?'active':''}">强化备选</button>`:''}</nav><main>${tab==='team'&&m.combo?team(m):tab==='skills'?skills(m,image):tab==='augments'&&m.mode==='hex'?augments(m,image):items(m,plan,image)}</main>
 <footer><div class="footer-controls"><button class="text-button" data-action="new-game" title="清空购买标记与本局已选强化">新一局</button><button class="text-button" data-action="copy">${icon('copy')}复制</button><select id="guide-opacity" aria-label="窗口不透明度">${[[1,'完全不透明'],[0.85,'85% 不透明'],[0.65,'65% 不透明']].map(([v,n])=>`<option value="${v}" ${m.opacity===v?'selected':''}>${n}</option>`).join('')}</select><span>${snapshot.hotkeyAvailable?'Ctrl + Shift + G':'托盘可呼出'}</span></div><p>${e(m.source)}${m.stale?' · 机制待复核':''} · 资料 ${e(m.version)}</p></footer></div>`;
}
function items(m,plan,image){
 const early=m.early.map(i=>i.name).join('、');
 return `${m.selectionWarnings.map(w=>`<div class="tip"><p>${e(w)}</p></div>`).join('')}
 ${m.phase?`<div class="tip"><b>对局节奏 · ${e(m.phase.label)}</b>${m.phase.tips.map(t=>`<p>${e(t)}</p>`).join('')}</div>`:''}
 ${shopping(m)}<section class="quick-conditions"><b>手动调整局势</b><div>${conditionNames.map(([id,name])=>`<button data-action="condition" data-id="${id}" aria-pressed="${m.selection.conditions.includes(id)}" class="${m.selection.conditions.includes(id)?'active':''}">${name}</button>`).join('')}</div><p>按你观察到的情况调整；保留仍在路线里的购买进度。</p></section>
 ${early?`<div class="tip"><b>也可提前补</b><p>${e(early)}。结合对线与回城安排。</p></div>`:''}
 ${plan?`<details data-guide-section="components"><summary>${e(m.next.name)} · 完整合成组件</summary><div class="component-list">${plan.components.map(i=>`<span>${image('item',i.id,i.name)}${e(i.name)}${i.count>1?' ×'+i.count:''}</span>`).join('')}</div><p class="note">${m.live.matched?'扣除已有组件约 '+plan.remaining+' 金':'未读取背包，展示完整组件参考'}。静态价格与任务升级以游戏商店为准。</p></details>`:''}
 <details data-guide-section="start" ${!m.live.matched||m.live.gameTime<180?'open':''}><summary>出门准备</summary><div class="starters">${m.start.map(i=>`<div title="${e(i.description)}">${image('item',i.id,i.name)}<span>${e(i.name)}</span></div>`).join('')}</div>${m.granted.length?`<p class="note">辅助任务自动给予：${m.granted.map(i=>e(i.name)).join('、')}，以客户端正式位置为准。</p>`:''}</details>
 <details data-guide-section="route"><summary>成装路线 · ${e(m.title)}</summary><div class="route-list">${m.route.map((i,n)=>`<button class="route-item ${m.completedItems.includes(i.id)||m.autoCompletedItems.includes(i.id)?'bought':''}" data-action="item" data-id="${i.id}" ${m.live.matched?'disabled':''} aria-pressed="${m.completedItems.includes(i.id)}" title="${e(i.description)}"><span class="number">${m.autoCompletedItems.includes(i.id)?'✓':m.completedItems.includes(i.id)?'计划':n+1}</span>${image('item',i.id,i.name)}<span class="item-name"><b>${e(i.name)}</b><small>${i.purchaseBase?'购买'+e(i.purchaseBase.name)+'后升级':i.cost+' 金'}</small></span><span class="mark">${m.autoCompletedItems.includes(i.id)?'背包已有':m.completedItems.includes(i.id)?'手动计划':m.live.matched?'未持有':'标记计划'}</span></button>`).join('')}</div><p class="note">手动标记只在未同步背包时推进参考路线。同步中以实际背包为准，卖出后更新；手动计划不算已持有。鞋子可选为本次回城目标。${m.support?'为辅助装保留升级位置。':''}</p><button class="text-button" data-action="reset">重置手动进度</button></details>
 ${m.adjustments.map(a=>`<div class="tip"><b>${e(a.title)}</b><p>${e(a.text)}</p></div>`).join('')}
 <details data-guide-section="source"><summary>配置说明与来源</summary><p class="note">${e(m.tips)}</p>${m.status?Object.values(m.status).map(t=>`<p class="note">${e(t)}</p>`).join(''):''}<p class="note">${e(m.sourceNote)} · ${m.fetchedAt?'获取于 '+new Date(m.fetchedAt).toLocaleDateString('zh-CN'):'规则整理 '+e(m.rulesDate)}</p></details>`;
}
function skills(m,image){return `${m.live.matched?`<p class="note">当前 ${m.live.level||'—'} 级 · ${['Q','W','E','R'].map(key=>key+' '+(m.live.skills[key]??'—')).join(' / ')}</p>`:''}<div class="section-label"><b>升级优先级</b><span>有大招可点时优先大招</span></div><div class="skills">${(m.priority||'').split('').map((s,n)=>`${n?'<span>›</span>':''}<b>${e(s)}</b>`).join('')||'<p>请按游戏内技能提示决定</p>'}</div>${m.first?`<p class="note">前三级参考：${m.first.split('').join(' → ')}；一级按对线或入侵调整。</p>`:'<p class="note">前三级请结合对线和特殊技能机制调整。</p>'}<div class="section-label"><b>召唤师技能</b></div><div class="spells">${m.summoners.map(s=>`<div>${image('spell',s.id,s.name)}<span>${e(s.name)}</span></div>`).join('')}</div>${m.runes.length?`<div class="section-label"><b>符文速查</b><span>完整配置中点击应用</span></div><p class="note">${e(m.runeTitle||'')}</p><div class="runes">${m.runes.map((r,n)=>`<div class="${n===0?'keystone':''}">${n<6?image('rune',r.id,r.name):'<span class="shard-dot">◇</span>'}<span>${e(r.name)}</span></div>`).join('')}</div>`:'<div class="tip"><b>海克斯大乱斗</b><p>不应用常规峡谷符文，按实际选项选择强化。</p></div>'}`;}
function team(m){const c=m.combo;return `${m.comboConfirmed?'':'<p class="note">队友阵容尚未确认，按已准备的组合展示配合参考。</p>'}${stageControls(m)}<div class="tip"><b>${e(c.title)}${c.ownJob?' · 你的职责':''}</b><p>${e(c.ownJob||c.plan)}</p></div>${c.window?`<div class="tip"><b>行动窗口</b><p>${e(c.window)}</p></div>`:''}${c.steps.length?`<ol class="team-steps">${c.steps.map(s=>`<li>${e(s)}</li>`).join('')}</ol>`:`<p class="note">${e(c.plan)}</p>`}${c.early?`<div class="tip"><b>开局怎么打</b><p>${e(c.early)}</p></div>`:''}${c.economy?`<div class="tip"><b>经济分工</b><p>${e(c.economy)}</p></div>`:''}<div class="tip"><b>提前知道的短板</b><p>${e(c.risk)}</p></div><p class="note">配合是机制参考，请自行沟通技能状态和进退时机。</p>`;}
function augments(m,image){return `${m.comparison.length?`<div class="section-label"><b>本次选项比较</b><span>手动录入</span></div>${m.comparison.map(a=>`<article class="augment"><h3>${e(a.name)}</h3>${a.reasons.map(t=>`<p>${e(t)}</p>`).join('')}${a.interactions.map(t=>`<p class="interaction">${e(t)}</p>`).join('')}${a.cautions.map(t=>`<p class="caution">${e(t)}</p>`).join('')}</article>`).join('')}`:''}<div class="section-label"><b>${e(m.augmentKind)}</b><span>以实际选项为准</span></div>${m.augments.length?m.augments.map(a=>`<article class="augment"><div>${image('augment',a.id,a.name)}<div><h3>${e(a.name)}</h3><small>${({kSilver:'白银',kGold:'黄金',kPrismatic:'棱彩'})[a.rarity]||'特殊'}</small></div></div><p>${e(a.description)}</p>${a.status==='partial'?'<small>动态数值请查看游戏内说明</small>':''}</article>`).join(''):'<p class="note">暂无备选，去海克斯手册挑选后带入指引。</p>'}<p class="note">来源为 OP.GG 海克斯大乱斗；备选不保证出现，也不是组合胜率。</p>`;}

function shopping(m){return `<section class="shopping-goal"><label for="guide-purchase-target"><b>本次回城先补什么</b></label><select id="guide-purchase-target" aria-label="本次回城目标"><option value="">沿成装路线推进</option>${m.shoppingTargets.filter(i=>!i.owned).map(i=>`<option value="${i.id}" ${m.purchaseTarget===i.id?'selected':''}>${e(i.kind)} · ${e(i.name)}</option>`).join('')}</select><p class="note">切换目标只调整本次购买参考；保留原成装路线。${m.targetFallback?'原目标已完成计划、已持有或退出方案，已回到路线参考。':''}${m.live.matched&&m.completedItems.length?'手动计划保留，当前不计入已持有。':''}</p></section>`;}
function stageControls(m){return `<section class="stage-controls"><label for="guide-stage"><b>配合阶段</b></label><select id="guide-stage" aria-label="配合阶段">${GUIDE_STAGES.map(([id,n])=>`<option value="${id}" ${m.stage===id?'selected':''}>${n}</option>`).join('')}</select><div class="tip"><b>${e(m.stageHint?.label)}</b><p>${e(m.stageHint?.text)}</p></div><p class="note">${e(m.stageHint?.note)}。完整行动顺序如下。</p></section>`;}
