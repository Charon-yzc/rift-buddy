import {normalizePresentation} from './core/presentation.mjs';
import {presentationSettings} from './presentation-view.mjs';
import {escape as e,icon} from './ui.mjs';
import {GUIDE_STAGES,guideMismatch} from './core/guide-stage.mjs';
import {phaseLabel} from './core/guide.mjs';
import {clockLabel} from './core/live-rhythm.mjs';
import {heroCoachView} from './hero-coach-view.mjs';
import {duoPlayView} from './duo-play-view.mjs';
const conditionNames=[['ad','普攻压力'],['ap','魔法伤害'],['control','控制多'],['heal','回血多'],['burst','需要保命']];
const approximate=n=>Number.isFinite(n)?Math.round(n/50)*50:'—';
export function estimateRows(model){
 const value=model?.estimate;
 if(!value?.targetSelected)return '';
 const source=value.liveReal?'己方实时面板 · 对手按公开装备和等级反推估算':'双方按公开装备和等级反推估算';
 const vayne=value.mineSkillBasis==='vayne-attacks',ashe=value.mineSkillBasis==='ashe-attacks';
 const skills=value.mineSkillBasis==='yone-reviewed'?'永恩按实际技能等级计算 Q 重复施放、W / R 混合伤害和五秒 E 回身；Q 与普攻计入破败，E 不重复装备特效。':vayne?'薇恩仅计算当前面板攻速下的普攻与 W 三环真实伤害，从零层开始持续攻击同一对手，间隔超过3.5秒重置。Q / E施放、R新增增益与羊刀幻影攻击未计入；面板已有增益不重复添加。':ashe?'艾希仅计算普攻与冰霜射击被动：首发也适用，伤害随实际暴击率和暴击伤害增益变化。Q箭束伤害、W / R施放与Q新增攻速未计入；面板已有攻速增益不重复添加。':value.mineSkillBasis==='reviewed'?'己方技能使用人工复核公式，对手技能按总点数近似。':'技能项按总点数近似，当前英雄的被动与持续技能尚未完整建模。';
 const w=value.mineWindow;
 return `<p class="note">${source}。${value.mineSkillBasis==='heuristic'?'当前英雄技能模型未完成，下列通用估算不能作为斩杀线。':vayne?'仅复核普攻与 W，Q / E / R未完整建模，不能作为整套斩杀线。':ashe?'仅复核普攻与被动，Q / W / R未完整建模，不能作为整套斩杀线。':'技能模型已复核，仍需确认技能就绪与命中条件。'}对手技能等级与冷却不可读，不给出胜负或即将被击杀的判断。</p>
 ${w?`<p class="estimate-row damage-breakdown">${w.attacks} 次普攻${w.qCasts?' / '+w.qCasts+' 次 Q':''}${vayne?' / '+w.silverBolts+' 次三环':''}<span>${ashe?'普攻含被动':'普攻'}约 ${approximate(w.autos)}${ashe?'':` · ${vayne?'W真实伤害':`技能${value.mineSkillBasis==='heuristic'?'（通用估算）':''}`}约 ${approximate(w.skills)}`} · 装备约 ${approximate(w.items)}${ashe?'':` · 延迟约 ${approximate(w.delayed)}`}</span></p>`:''}
 <details class="estimate-assumptions" data-guide-section="estimate-assumptions"><summary>计算范围与斩杀线误差</summary><p>六秒持续输出的粗略模型，${skills}${ashe?'假设持续普攻命中':'假设技能就绪并持续命中'}；对手生命与抗性按公开装备、等级估算，破败按逐次下降的生命值计算。未计距离、实际技能冷却、穿透、护盾、治疗、其他条件装备特效与海克斯强化；不是实际伤害或立即斩杀判断，也不表示对手在附近。${w?.percentOnHitUnknown?'近战或远程形态未确认，破败百分比伤害未计入。':w?.unparsedOnHit?'部分攻击特效尚未计入。':''}</p></details>`;
}
// Only the explicitly selected target gets numbers. A generic model cannot
// decide fight safety, and whole-team rankings are not the player's opponent.
export function verdictBanner(m){
 const est=m?.estimate;
 if(!est?.targetSelected)return '';
 return `<section class="combat-summary"><b>伤害参考 · ${e(est.enemy.name)}</b><div><span>2 秒约 <strong>${approximate(est.mineShort?.total)}</strong></span><span>6 秒约 <strong>${approximate(est.killThreshold)}</strong></span></div><small>${est.mineSkillBasis==='heuristic'?'通用模型 · 英雄技能待复核':est.mineSkillBasis==='vayne-attacks'?'普攻 + W参考 · Q / E / R未计入':est.mineSkillBasis==='ashe-attacks'?'普攻 + 被动参考 · Q / W / R未计入':'持续输出模型 · 假设技能命中'}${est.mineWindow?.percentOnHitUnknown?' · 形态待确认，未计破败':''}</small></section>`;
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
  const mirror=cd.own.id===cd.foe.id,ownLabel=mirror?`${cd.own.self?'我':'我方'} · ${cd.own.name} ${cd.own.level}级`:cd.own.name,foeLabel=mirror?`对方 · ${cd.foe.name} ${cd.foe.level}级`:cd.foe.name;
  result=`<p class="estimate-row"><b>${e(ownLabel)} vs ${e(foeLabel)}</b>${mirror?'<br />':' '}六秒输出通用估算约 <strong>${approximate(cd.killMine)}</strong> / <strong>${approximate(cd.killTheirs)}</strong><span class="est-src">${e(cd.skillsNote)}；英雄技能与被动未完整建模，不作为胜负或斩杀判断</span></p>`;
 }else if(cd?.unresolved){
  result=`<p class="note">${e(cd.reason||'所选英雄、等级或装备暂不可读，请等待同步或重选')}</p>`;
 }
 return `<div class="duel-box"><div class="duel-pick"><select id="guide-duel-own" aria-label="我方英雄">${ownOpts}</select><span>vs</span><select id="guide-duel-foe" aria-label="对方英雄">${foeOpts}</select></div>${result}</div>`;
}
// Transparent kill strip: one direction only — my kill line against each
// visible enemy, no incoming damage, no warnings. Numbers come from the same
// estimate model, only killMine is rendered.
// Layout mirrors the ball: a narrow drag grip owns the -webkit-app-region:drag
// zone (drag regions swallow every pointer event), while the content stays
// no-drag so the click that restores the full guide actually reaches us.
export function killStrip(m){
 const duels=Array.isArray(m?.estimate?.duels)?m.estimate.duels.slice(0,5):[];
 if(!duels.length)return '';
 const rows=duels.map(d=>`<span>vs ${e(d.enemy?.name)} · 我方约 <strong>${d.killMine??'—'}</strong></span>`).join('');
 return `<div class="strip-frame"><span class="strip-grip" aria-hidden="true"></span><button class="kill-strip" data-action="strip" title="点击回到完整指引" aria-label="透明斩杀线，点击回到完整指引">${rows}<small>六秒输出估算 · 点击回到完整指引</small></button></div>`;
}
export function renderGuide(snapshot,tab,isPreview,image){
 const m=snapshot?.model;
 if(!m)return `<header class="drag"><b>开黑搭子 · 本局指引</b><button data-action="hide" aria-label="隐藏">${icon('close')}</button></header><div class="empty"><h2>先准备这一局</h2><p>打开英雄配置，点击“本局指引”，把出装与配合带到这个小窗口。</p><button class="primary" data-action="main">打开助手</button></div>`;
 const next=m.next,plan=m.targetPlan||m.purchase.find(p=>p.id===next?.id),action=m.action,current=snapshot.current;
 const wrong=['champion','mode','role','combo'].includes(m.live.kind)||guideMismatch(m.selection,current)||m.live.champion&&m.live.champion!==m.champion.id;
 const inventoryPending=m.live.matched&&m.live.inventoryKnown===false;
 const liveText=(current?.positionKnown===false?'位置待确认 · ':'')+(m.live.matched?`本机同步 · ${m.live.gold??'—'} 金 · ${m.live.level??'—'} 级${inventoryPending?' · 背包待恢复':''}`:'手动参考 · '+m.live.reason);
 const inputText=snapshot.mousePassThrough?'点击标题栏“交互”可调整 · Ctrl + Shift + H':snapshot.interactionHotkeyAvailable?'可交互 · 游戏中 Ctrl + Shift + H 切换穿透':'可交互 · 穿透快捷键未注册';
 if(snapshot.strip){
  return killStrip(m)||`<div class="strip-frame"><span class="strip-grip" aria-hidden="true"></span><button class="kill-strip" data-action="strip" title="点击回到完整指引" aria-label="透明斩杀线，点击回到完整指引"><span>暂无对局估算</span><small>点击回到完整指引</small></button></div>`;
 }
 if(snapshot.ball){
  const mainImg=(next&&!wrong)?image('item',action?.id||next.id,action?.name||next.name):image('champion',m.champion.id,m.champion.name);
  const title=wrong?'方案与当前选择不一致 · 点击展开核对':next?`下一件：${action?.name||next.name} · 点击展开窗口`:m.routeBlocked?.length?'路线需要确认换装 · 点击展开窗口':'路线已完成 · 点击展开窗口';
  return `<button class="ball-btn" data-action="ball" title="${e(title)}" aria-label="${e(title)}">${mainImg}<span class="ball-label">展开</span>${next&&!wrong?`<span class="ball-hero">${image('champion',m.champion.id,m.champion.name)}</span>`:`<span class="ball-done">${m.routeBlocked?.length?'!':'✓'}</span>`}</button>`;
 }
 return `<header class="drag"><div><span class="brand-dot">K</span><button class="guide-hero-link" data-action="main" title="${e(m.champion.name)} · ${m.mode==='hex'?'海克斯大乱斗':e(m.role)} · 打开完整配置"><b>${e(m.champion.name)} · 本局指引</b></button><small>${isPreview?'预览':snapshot.connected?phaseLabel(snapshot.phase):'方案参考'}</small></div><div class="window-actions"><button data-action="strip" aria-label="切换透明文本条" title="透明文本条：只显示我方斩杀线">▤</button><button data-tab="settings" aria-label="字号与指引设置" title="字号与指引设置">${icon('settings')}</button><button data-action="interaction" aria-label="切换指引交互" title="游戏中 Ctrl + Shift + H 切换鼠标穿透">${snapshot.mousePassThrough?'交互':'穿透'}</button><button data-action="collapse" aria-label="${m.collapsed?'展开':'收起'}" title="${m.collapsed?'展开':'收起'}">${m.collapsed?'展开':'收起'}</button><button data-action="hide" aria-label="隐藏指引" title="隐藏指引">${icon('close')}</button></div></header>
 <section class="hero-summary"><div class="hero-id">${image('champion',m.champion.id,m.champion.name)}<div><h1>${e(m.champion.name)}</h1><p>${m.mode==='hex'?'海克斯大乱斗':e(m.role)} <span>· ${e(m.version)}</span></p></div></div><button class="text-button" data-action="main" title="打开完整配置">完整配置 ${icon('arrow')}</button></section>
 <div class="guide-status ${m.live.matched&&!inventoryPending?'fresh':'manual'}" title="${e(liveText)}">${e(liveText)}${m.live.at?`<small>读取 ${new Date(m.live.at).toLocaleTimeString('zh-CN')}</small>`:''}</div>
 ${wrong?`<section class="guide-mismatch"><b>这份方案与当前英雄、正式位置、模式或组合不一致</b><p>正在查看 ${e(m.champion.name)}${current?'；当前选择 '+e(current.name||current.id):''}。</p><button data-action="${current?'current':'main'}">${current?'换入当前英雄与正式位置':'打开助手重新选择'}</button></section>`:`<section class="next-item ${next?'':'complete'}">${next?`${image('item',action?.id||next.id,action?.name||next.name)}<div><small>${action?({component:'本次回城 · 可买组件',complete:'本次回城 · 可合成',save:'下一步组件参考',upgrade:'查看商店升级条件',space:'背包已满 · 先合成或腾格'}[action.kind]):m.purchaseTarget?'本次回城目标 · 手动参考':'下一件成装参考 · 手动进度'}</small><b>${e(action?.name||next.name)}</b><p>${action?`${action.cost?`约 ${action.cost} 金`:'基础装备已持有'}${action.shortfall===null?' · 金币暂不可读':action.shortfall>0?' · 还差 '+action.shortfall+' 金':''}${action.kind==='component'?' · 通向 '+e(next.name):action.kind==='upgrade'?' · 以游戏任务为准':''}`:next.purchaseBase?`先购买${e(next.purchaseBase.name)}`:`${inventoryPending?'背包未完整读取 · ':''}完整价格 ${next.cost} 金`}</p></div>${!m.live.matched&&m.route.some(i=>i.id===next.id)?`<button data-action="item" data-id="${next.id}" aria-label="标记已买${e(next.name)}">已买 ${icon('check')}</button>`:''}`:`${icon('check')}<div><b>${m.routeBlocked?.length?'路线需要确认换装':'这套路线已完成'}</b><small>${m.routeBlocked?.length?'已跳过与背包互斥的装备，请展开核对':'仍需按实际局势调整'}</small></div>`}</section>`}
 ${wrong?'':`<div class="quick-reminders"><p class="quick-skill" title="${e(m.skillAdvice?.reason)}"><b>${m.skillAdvice?.changed?'局势加点':'加点参考'}</b> ${m.nextSkill?`有技能点可升 <strong>${m.nextSkill}</strong>`:e(m.priority?m.priority.split('').join(' › '):'按游戏内提示')}<span>${e(m.skillAdvice?.reason||'以游戏可升级技能为准')}</span></p>${m.combo?`<p class="quick-plan" title="${e(m.stageHint?.text||m.combo.ownJob||m.combo.plan)}"><b>${e(m.stageHint?.label||'你的配合')}</b> ${e(m.stageHint?.text||m.combo.ownJob||m.combo.plan)}</p>`:''}</div>`}
 <p class="input-hint" title="${e(inputText)}">${e(inputText)}</p>
 <div class="expanded"><nav aria-label="指引内容"><button data-tab="overview" class="${tab==='overview'?'active':''}">概览</button><button data-tab="items" class="${tab==='items'?'active':''}" title="购买计划与局势应对">购买</button><button data-tab="skills" class="${tab==='skills'?'active':''}" title="加点建议与当前符文">加点</button><button data-tab="combat" class="${tab==='combat'?'active':''}" title="按所选对手查看伤害参考">伤害</button><button data-tab="scoreboard" class="${tab==='scoreboard'?'active':''}" title="双方公开 KDA、补刀与装备">双方</button>${m.mode==='rift'?`<button data-tab="rhythm" class="${tab==='rhythm'?'active':''}" title="资源计时、准备行动与成装强势期">节奏</button>`:''}${m.mode==='rift'?`<button data-tab="team" class="${tab==='team'?'active':''}" title="自己打法、公开对手技能与组合配合">打法</button>`:''}${m.mode==='hex'?`<button data-tab="augments" class="${tab==='augments'?'active':''}" title="已选与备选强化">强化</button>`:''}</nav><main>${tab==='settings'?presentationSettings(snapshot.presentation,{guide:true,opacity:m.opacity}):tab==='overview'?overview(m,snapshot.presentation,image):tab==='team'&&m.mode==='rift'?stageControls(m)+focusControls(m)+heroCoachView(m.coach)+(m.combo?team(m):''):tab==='skills'?skillDecision(m)+skills(m,image):tab==='augments'&&m.mode==='hex'?augments(m,image):tab==='combat'?combat(m):tab==='rhythm'&&m.mode==='rift'?rhythm(m):tab==='scoreboard'?`<section class="scoreboard-data">${equipmentView(m,image,true)}</section>`:items(m,plan,image)}</main>
 <footer><div class="footer-controls"><button class="text-button" data-action="recover">恢复窗口</button><button class="text-button" data-action="new-game" title="清空购买标记与本局已选强化">新一局</button><button class="text-button" data-action="copy">${icon('copy')}复制</button><select id="guide-opacity" aria-label="窗口不透明度">${[[1,'完全不透明'],[0.85,'85% 不透明'],[0.65,'65% 不透明']].map(([v,n])=>`<option value="${v}" ${m.opacity===v?'selected':''}>${n}</option>`).join('')}</select><span>${snapshot.hotkeyAvailable?'Ctrl + Shift + G':'托盘可呼出'}</span></div></footer></div>`;
}
function ultimateCard(m){
 const value=m.ultimateReference;if(!value)return '';
 if(!value.available)return `<p class="note"><b>${e(value.name)}</b> · ${e(value.reason)}</p>`;
 const cho=value.kind==='chogath-r';
 return `<section class="combat-summary ultimate-reference"><b>${e(value.name)} · 单次技能参考</b>${cho?`<div><span>对英雄约 <strong>${value.championDamage}</strong></span><span>小兵 / 野怪约 <strong>${value.nonChampionDamage}</strong></span></div><small>R ${value.rank}级 · 实时法强 ${Math.round(value.ap)} · 额外生命约 ${Math.round(value.bonusHp)}</small>`:`<div><span>基础 <strong>${value.baseDamage}</strong></span><span>已损生命 <strong>${Math.round(value.missingHealthRatio*100)}%</strong></span></div><small>R ${value.rank}级 · 两项相加为基础真实伤害；目标已损生命请在游戏中判断。</small>`}</section><details data-guide-section="ultimate-reference"><summary>单次 R 的计算条件</summary><p class="note">${cho?'对英雄基础300 / 475 / 650，对小兵与野怪基础1200，加50%实时法强和10%额外生命；额外生命由实时最大生命减去当前等级基础生命得到，包含面板已反映的叠层，不重复添加。':'基础125 / 200 / 275，加目标已损生命的25% / 30% / 35%；当前公式已按26.14调整核对，不使用旧版基础伤害。助手没有对手当前生命，不给出即时斩杀判断。'}仅核对单次R公式，技能冷却、距离、护盾、免疫与特殊效果仍需在游戏中确认；不与下方通用输出估算相加。${cho?'未叠加惩戒或其他技能。':''}</p></details>`;
}
function combat(m){
 const rows=m.duelOptions?.foe||[],selected=m.selection.threatId||m.duelPick?.foe||'';
 const options=rows.map(r=>`<option value="${r.id}" ${selected===r.id?'selected':''}>${e(r.name)}</option>`).join('');
 return `${ultimateCard(m)}<section class="combat-target"><label for="${m.mode==='rift'?'guide-threat':'guide-duel-foe'}">比较对手</label><select id="${m.mode==='rift'?'guide-threat':'guide-duel-foe'}" aria-label="比较对手"><option value="">请选择对手</option>${options}</select></section>${m.estimate?.targetSelected?verdictBanner(m)+estimateRows(m):`<p class="note">${m.combatUnavailable?e(m.combatUnavailable):m.live.inventoryKnown===false?'背包读取不完整，暂停伤害估算；读取恢复后继续比较。':selected&&!m.estimate?.targetSelected?'所选对手、等级或装备暂不可读，请等待同步或重选。':rows.length?'先选择要比较的对手，避免把其他敌人的估算当成当前对线情况。':'等待读取公开英雄与等级。'}</p>`}${rows.length?`<details data-guide-section="custom-duel"><summary>比较其他英雄 · 通用估算</summary>${duelBox(m)}</details>`:''}`;
}
function items(m,plan,image){
 const early=m.early.map(i=>i.name).join('、');
 return `${m.selectionWarnings.map(w=>`<div class="tip"><p>${e(w)}</p></div>`).join('')}

 ${shopping(m)}${situation(m,image)}${m.phase?`<details data-guide-section="rhythm"><summary>节奏参考 · ${e(m.phase.label)}</summary>${m.phase.tips.map(t=>`<p class="note">${e(t)}</p>`).join('')}</details>`:''}${(m.routeBlocked||[]).map(i=>`<div class="tip"><b>${e(i.name)} · 暂不直接购买</b><p>${e(i.reason)}</p></div>`).join('')}<section class="quick-conditions"><b>手动调整局势</b><div>${conditionNames.map(([id,name])=>`<button data-action="condition" data-id="${id}" aria-pressed="${m.selection.conditions.includes(id)}" class="${m.selection.conditions.includes(id)?'active':''}">${name}</button>`).join('')}</div><p>按你观察到的情况调整；保留仍在路线里的购买进度。</p></section>
 ${early?`<div class="tip"><b>也可提前补</b><p>${e(early)}。结合对线与回城安排。</p></div>`:''}
 ${plan?`<details data-guide-section="components"><summary>${e(m.next.name)} · 完整合成组件</summary><div class="component-list">${plan.components.map(i=>`<span>${image('item',i.id,i.name)}${e(i.name)}${i.count>1?' ×'+i.count:''}</span>`).join('')}</div><p class="note">${m.live.matched&&m.live.inventoryKnown!==false?'扣除已有组件约 '+plan.remaining+' 金':'未读取背包，展示完整组件参考'}。静态价格与任务升级以游戏商店为准。</p></details>`:''}
 <details data-guide-section="start" ${!m.live.matched||m.live.gameTime<180?'open':''}><summary>出门准备</summary><div class="starters">${m.start.map(i=>`<div title="${e(i.description)}">${image('item',i.id,i.name)}<span>${e(i.name)}</span></div>`).join('')}</div>${m.granted.length?`<p class="note">辅助任务自动给予：${m.granted.map(i=>e(i.name)).join('、')}，以客户端正式位置为准。</p>`:''}</details>
 <details data-guide-section="route"><summary>成装路线 · ${e(m.title)}</summary><div class="route-list">${m.route.map((i,n)=>`<button class="route-item ${m.completedItems.includes(i.id)||m.autoCompletedItems.includes(i.id)?'bought':''}" data-action="item" data-id="${i.id}" ${m.live.matched?'disabled':''} aria-pressed="${m.completedItems.includes(i.id)}" title="${e(i.description)}"><span class="number">${m.autoCompletedItems.includes(i.id)?'✓':m.completedItems.includes(i.id)?'计划':n+1}</span>${image('item',i.id,i.name)}<span class="item-name"><b>${e(i.name)}</b><small>${i.purchaseBase?'购买'+e(i.purchaseBase.name)+'后升级':i.cost+' 金'}</small></span><span class="mark">${m.autoCompletedItems.includes(i.id)?'背包已有':m.completedItems.includes(i.id)?'手动计划':m.live.matched?(m.live.inventoryKnown===false?'持有待确认':'未持有'):'标记计划'}</span></button>`).join('')}</div><p class="note">手动标记只在未同步背包时推进参考路线。背包未完整读取时暂停精确购买建议与持有判断；读取恢复后以实际背包为准，卖出后更新；手动计划不算已持有。鞋子可选为本次回城目标。${m.support?'为辅助装保留升级位置。':''}</p><button class="text-button" data-action="reset">重置手动进度</button></details>
 ${m.adjustments.length?`<details data-guide-section="adjustments"><summary>其他情况怎么调整</summary>${m.adjustments.map(a=>`<div class="tip"><b>${e(a.title)}</b><p>${e(a.text)}</p></div>`).join('')}</details>`:''}
 <details data-guide-section="source"><summary>配置说明与来源</summary><p class="note">${e(m.tips)}</p>${m.status?Object.values(m.status).map(t=>`<p class="note">${e(t)}</p>`).join(''):''}<p class="note">${e(m.sourceNote)} · ${m.fetchedAt?'获取于 '+new Date(m.fetchedAt).toLocaleDateString('zh-CN'):'规则整理 '+e(m.rulesDate)}</p></details>`;
}
function skills(m,image){return `${m.live.matched?`<p class="note">当前 ${m.live.level||'—'} 级 · ${['Q','W','E','R'].map(key=>key+' '+(m.live.skills[key]??'—')).join(' / ')}</p>`:''}${m.skillOrder?`<p class="note">${e(m.skillTitle)} · 前 ${m.skillOrder.length} 个技能点：${e(m.skillOrder.split('').join(' → '))}</p>`:''}<div class="section-label"><b>升级优先级</b><span>${m.skillOrder?'沿所选技能节点':'通常优先大招'}</span></div><div class="skills">${(m.priority||'').split('').map((s,n)=>`${n?'<span>›</span>':''}<b>${e(s)}</b>`).join('')||'<p>请按游戏内技能提示决定</p>'}</div>${m.first?`<p class="note">前三级参考：${m.first.split('').join(' → ')}；一级按对线或入侵调整。</p>`:'<p class="note">前三级请结合对线和特殊技能机制调整。</p>'}<div class="section-label"><b>召唤师技能</b></div><div class="spells">${m.summoners.map(s=>`<div>${image('spell',s.id,s.name)}<span>${e(s.name)}</span></div>`).join('')}</div>${m.runes.length?`<div class="section-label"><b>符文速查</b><span>完整配置中点击应用</span></div><p class="note">${e(m.runeTitle||'')}</p><div class="runes">${m.runes.map((r,n)=>`<div class="${n===0?'keystone':''}">${n<6?image('rune',r.id,r.name):'<span class="shard-dot">◇</span>'}<span>${e(r.name)}</span></div>`).join('')}</div>`:'<div class="tip"><b>海克斯大乱斗</b><p>不应用常规峡谷符文，按实际选项选择强化。</p></div>'}`;}
function team(m){const c=m.combo;if(c.play)return `<section class="duo-guide"><h3>${e(c.title)} · ${e(m.stageHint?.label||'关键配合')}</h3>${m.comboConfirmed?'':'<p class="note">队友阵容尚未确认，按已准备的组合展示配合参考。</p>'}${duoPlayView(c.play,{stage:m.stageHint?.id||'key'})}</section>`;return `${m.comboConfirmed?'':'<p class="note">队友阵容尚未确认，按已准备的组合展示配合参考。</p>'}<div class="tip"><b>${e(c.title)}${c.ownJob?' · 你的职责':''}</b><p>${e(c.ownJob||c.plan)}</p></div>${c.window?`<div class="tip"><b>行动窗口</b><p>${e(c.window)}</p></div>`:''}${c.steps.length?`<ol class="team-steps">${c.steps.map(s=>`<li>${e(s)}</li>`).join('')}</ol>`:`<p class="note">${e(c.plan)}</p>`}${c.early?`<div class="tip"><b>开局怎么打</b><p>${e(c.early)}</p></div>`:''}${c.economy?`<div class="tip"><b>经济分工</b><p>${e(c.economy)}</p></div>`:''}<div class="tip"><b>提前知道的短板</b><p>${e(c.risk)}</p></div><p class="note">配合是机制参考，请自行沟通技能状态和进退时机。</p>`;}
function augments(m,image){return `${m.comparison.length?`<div class="section-label"><b>本次选项比较</b><span>手动录入</span></div>${m.comparison.map(a=>`<article class="augment"><h3>${e(a.name)}</h3>${a.reasons.map(t=>`<p>${e(t)}</p>`).join('')}${a.interactions.map(t=>`<p class="interaction">${e(t)}</p>`).join('')}${a.cautions.map(t=>`<p class="caution">${e(t)}</p>`).join('')}</article>`).join('')}`:''}<div class="section-label"><b>${e(m.augmentKind)}</b><span>以实际选项为准</span></div>${m.augments.length?m.augments.map(a=>`<article class="augment"><div>${image('augment',a.id,a.name)}<div><h3>${e(a.name)}</h3><small>${({kSilver:'白银',kGold:'黄金',kPrismatic:'棱彩'})[a.rarity]||'特殊'}</small></div></div><p>${e(a.description)}</p>${a.status==='partial'?'<small>动态数值请查看游戏内说明</small>':''}</article>`).join(''):'<p class="note">暂无备选，去海克斯手册挑选后带入指引。</p>'}<p class="note">来源为 OP.GG 海克斯大乱斗；备选不保证出现，也不是组合胜率。</p>`;}

function shopping(m){return `<section class="shopping-goal"><label for="guide-purchase-target"><b>本次回城先补什么</b></label><select id="guide-purchase-target" aria-label="本次回城目标"><option value="">沿成装路线推进</option>${m.shoppingTargets.filter(i=>!i.owned).map(i=>`<option value="${i.id}" ${i.blockedReason?'disabled':''} ${m.purchaseTarget===i.id?'selected':''}>${e(i.kind)} · ${e(i.name)}${i.blockedReason?' · 需先确认换装':''}</option>`).join('')}</select><p class="note">切换目标只调整本次购买参考；保留原成装路线。${m.targetBlockedReason?e(m.targetBlockedReason):''}${m.targetFallback?'原目标已完成、已持有、与背包装备互斥或退出方案，已回到可用路线参考；换装前请核对商店条件。':''}${m.live.matched&&m.completedItems.length?'手动计划保留，当前不计入已持有。':''}</p></section>`;}
function situation(m,image,compact=false){
 const s=m.situation;if(!s)return '';
 return `<section class="live-situation"><div class="section-label"><b>局势建议</b><button data-action="live-advice" aria-pressed="${m.liveAdvice!==false}" title="关闭后沿原路线与手动条件推进">${m.liveAdvice===false?'开启自动建议':'自动建议已开'}</button></div><p class="note">${e(s.summary)}</p>${focusControls(m)}
 ${m.next&&!compact?`<div class="tip purchase-reason"><b>${m.automaticTarget?'提前应对 · ':''}本次购买为什么</b><p>${e(m.nextReason)}</p><p class="decision-caution">${e(m.nextCaution)}</p></div>`:''}
 ${s.candidates.length?`<details data-guide-section="situation"><summary>可考虑的局势备选 · ${s.candidates.length} 项</summary>${s.candidates.map(c=>`<article class="situation-choice"><div>${image('item',c.id,c.name)}<b>${e(c.name)}</b><button data-action="purchase-target" data-id="${c.id}" ${m.purchaseTarget===c.id?'disabled':''}>${m.purchaseTarget===c.id?'已选目标':'本次先补'}</button></div><p>${e(c.reason)}</p>${c.action?`<small>${c.action.kind==='save'?'可先攒钱':'当前可考虑'}：${e(c.action.name)} · 约 ${c.action.cost} 金${c.action.shortfall>0?' · 还差 '+c.action.shortfall+' 金':''}</small>`:''}<p class="decision-caution">${e(c.caution)}</p></article>`).join('')}</details>`:''}
 <p class="note">${e(s.caution)}${s.stale?` 规则整理于 ${e(s.rulesPatch)}，与当前资料版本不同，需核对游戏内说明。`:''}</p></section>`;
}
function skillDecision(m){
 const a=m.skillAdvice;if(!a)return '';
 return `<section class="skill-decision tip"><b>${a.next?`当前建议升 ${e(a.next)}`:'当前加点状态'}${a.changed?` · 原方案 ${e(a.base)}`:''}</b><p>${e(a.reason)}</p>${a.changed?`<p>局势优先级：${e(a.priority?.split('').join(' › '))}；只影响后续技能点。</p>`:''}${a.caution?`<p class="decision-caution">${e(a.caution)}</p>`:''}<small>${e(m.skillSource||'机制整理')} · ${e(m.situation?.rulesPatch)}${m.situation?.stale?' · 需复核':''} · 原方案如下</small></section>`;
}
function focusControls(m){
 if(m.mode!=='rift')return '';
 const s=m.selection,select=(id,label,rows,value,empty)=>`<label>${label}<select id="${id}" aria-label="${label}"><option value="">${empty}</option>${rows.map(r=>`<option value="${r.id}" ${value===r.id?'selected':''}>${e(r.name)}</option>`).join('')}</select></label>`;
 return `<details class="situation-focus" data-guide-section="focus"><summary>关注目标 · 可选</summary><div class="focus-controls"><label>这次关注<select id="guide-focus" aria-label="这次关注"><option value="teamfight" ${s.combatFocus!=='lane'?'selected':''}>全队团战投入</option><option value="lane" ${s.combatFocus==='lane'?'selected':''}>我的对线目标</option></select></label>${select('guide-threat','重点对手',m.situation.enemies||[],s.threatId,'观察全体，不猜对线')}${select('guide-protect','优先保护的队友',m.situation.allies||[],s.protectId,'保留原组合分工')}</div><p class="note">只列已读取的公开英雄。对线目标由你确认；不会根据击杀数猜对线，也不读取敌方位置或技能冷却。</p></details>`;
}
function stageControls(m){return `<section class="stage-controls"><label for="guide-stage"><b>配合阶段</b></label><select id="guide-stage" aria-label="配合阶段">${GUIDE_STAGES.map(([id,n])=>`<option value="${id}" ${m.stage===id?'selected':''}>${n}</option>`).join('')}</select><p class="note">${e(m.stageHint?.note||'按自己等级与时间展示参考，可手动切换；不判断队友技能是否就绪')}。</p></section>`;}

function overview(m,presentation,image){
 const enabled=normalizePresentation(presentation).guideModules;
 const module=(id,title,body)=>`<section class="overview-module" data-overview-module="${id}"><h2>${title}</h2>${body}</section>`;
 const route=`<div class="overview-route">${m.route.map(i=>`<span title="${e(i.name)}" class="${m.autoCompletedItems.includes(i.id)||m.completedItems.includes(i.id)?'owned':''}">${image('item',i.id,i.name)}<small>${e(i.name)}</small></span>`).join('')}</div>`;
 const content={
  purchase:()=>module('purchase','回城计划',shopping(m)+`<details data-guide-section="overview-purchase"><summary>购买依据与成装路线</summary><p class="overview-reason">${e(m.nextReason)}</p><p class="note">${e(m.nextCaution)}</p>${route}</details>`),
  skills:()=>module('skills',m.nextSkill?`技能点可升 ${e(m.nextSkill)}`:'加点计划',`<p class="overview-priority">${e(m.priority?.split('').join(' › ')||'以游戏可升级技能为准')}</p><p class="overview-reason">${e(m.skillAdvice?.reason)}</p>${m.skillMechanism?`<p class="note skill-mechanism">${e(m.skillMechanism)}</p>`:''}${m.skillOrder?`<details data-guide-section="overview-skills"><summary>完整加点 · ${e(m.skillTitle||'所选方案')}</summary>${m.skillNote?`<p class="note">${e(m.skillNote)}</p>`:''}<div class="overview-skill-order">${[...m.skillOrder].map((key,n)=>`<span><small>${n+1}</small><b>${key}</b></span>`).join('')}</div></details>`:''}`),
  situation:()=>module('situation','局势应对',situation(m,image,true)),
  scoreboard:()=>module('scoreboard','双方公开装备',equipmentView(m,image)),
  rhythm:()=>m.mode==='rift'?module('rhythm',`资源与强势期${m.phase?' · '+e(m.phase.label):''}`,rhythm(m,true)):'',
  team:()=>m.mode==='rift'?module('team','英雄打法与配合',heroCoachView(m.coach,{compact:true})+(m.combo?`<p class="overview-reason">${e(m.stageHint?.text||m.combo.ownJob||m.combo.plan)}</p>`:'')+'<button data-tab="team">查看打法、对手与配合条件</button>'):'',
 };
 return `${m.selectionWarnings.map(w=>`<p class="overview-source-line" title="${e(w)}">${e(w)}</p>`).join('')}${enabled.length?enabled.map(id=>content[id]()).join(''):'<p class="note">概览模块已全部关闭。</p><button data-tab="settings">选择想看的内容</button>'}<details class="overview-module" data-guide-section="overview-source"><summary>当前方案与数据状态</summary><p class="note">${e(m.title)} · ${e(m.runeTitle||'')}</p>${Object.values(m.status||{}).map(t=>`<p class="note">${e(t)}</p>`).join('')}<p class="note">${e(m.sourceNote)}${m.fetchedAt?' · 获取于 '+new Date(m.fetchedAt).toLocaleString('zh-CN'):''}</p></details>`;
}
function rhythm(m,compact=false){
 const o=m.objectives,p=m.powers;
 const relevant=(o?.rows||[]).filter(r=>r.remaining===undefined||r.remaining<=180||!compact).slice(0,compact?2:6);
 const resources=relevant.length?relevant.map(r=>`<article class="resource-row ${r.state==='prepare'?'resource-soon':''}"><div><b>${e(r.name)}</b><strong>${e(r.label)}</strong></div><p>${e(r.action)}</p>${compact?'':`<small>${e(r.basis)}${Number.isFinite(r.spawn)?' · 游戏时间 '+clockLabel(r.spawn):''}</small>`}</article>`).join(''):`<p class="note">${e(o?.available?'最近三分钟没有即将到达的资源节点。':o?.reason||'等待本局资源数据。')}</p>`;
 const powers=(p?.current||[]).slice(0,compact?1:5).map(r=>`<article class="power-row"><b>${e(r.name)}</b><p>${e(r.text)}</p></article>`).join('');
 if(compact)return resources+powers+`<button class="text-button" data-tab="rhythm">查看资源、升级与成装节点</button>`;
 return `<section class="resource-timing"><h2>资源准备</h2>${resources}${o?.counts?`<p class="note">元素龙已读取：我方 ${o.counts.ally} · 对方 ${o.counts.enemy}${o.soul?' · 已进入龙魂后的阶段':''}</p>`:''}${o?.reason?`<p class="note">${e(o.reason)}</p>`:''}${o?.stale?`<p class="decision-caution">资源规则核对于 ${e(o.rules.patch)}，当前资料版本不同；计时供参考，请以游戏内显示为准。</p>`:''}</section><section class="power-windows"><h2>自己的技能与成装节点</h2>${powers||`<p class="note">${p?.available?'当前没有已核对的成装提示，沿购买计划继续。':'等待读取自己的等级与背包。'}</p>`}${(p?.upcoming||[]).map(r=>`<article class="power-row"><b>${e(r.name)}</b><p>${e(r.text)}</p></article>`).join('')}</section>${o?.recent?.length?`<details data-guide-section="resource-events"><summary>最近资源事件 · ${o.recent.length} 条</summary><ol class="resource-events">${o.recent.map(r=>`<li><time>${clockLabel(r.time)}</time><span>${e(r.label)} · ${r.side==='ally'?'我方击杀':r.side==='enemy'?'对方击杀':'击杀队伍未确认'}</span></li>`).join('')}</ol></details>`:''}${m.phase?`<details data-guide-section="rhythm"><summary>${e(m.phase.label)} · 兵线与回城</summary>${m.phase.tips.map(t=>`<p class="overview-reason">${e(t)}</p>`).join('')}</details>`:''}<p class="note">只读取公开资源事件与自己的等级、装备。倒计时到达后需在游戏内确认资源状态；不会操作游戏或判断队友技能冷却。</p>`;
}
function equipmentView(m,image,expanded=false){
 const v=m.equipment;
 if(!v?.available)return `<p class="note">${e(v?.reason||'等待读取双方公开装备')}。局内接口可用后自动显示。</p>`;
 const total=team=>team.value===null?'未读完整':team.value.toLocaleString()+' 金';
 const roles={top:'上路',jungle:'打野',mid:'中路',bottom:'下路',support:'辅助'},number=n=>n===null||n===undefined?'—':n;
 const players=(team,label)=>`<details data-guide-section="equipment-${label}" ${expanded?'open':''}><summary>${label} · ${team.players.length} 位已读</summary>${team.players.map(p=>`<article class="equipment-player"><div class="equipment-player-head">${image('champion',p.id,p.name)}<span><b>${e(p.name)}${p.self?' · 你':''}</b><small>${p.level===null?'等级未读':p.level+'级'} · ${roles[p.position]||'位置未确认'}</small></span><small>${p.value===null?'装备未读完整':p.value.toLocaleString()+' 金'}</small></div><div class="equipment-player-scores"><span><small>K / D / A</small><b>${number(p.scores?.kills)} / ${number(p.scores?.deaths)} / ${number(p.scores?.assists)}</b></span><span><small>补刀</small><b>${number(p.scores?.creepScore)}</b></span><span><small>每分钟补刀</small><b>${p.csPerMinute===null||p.csPerMinute===undefined?'—':p.csPerMinute.toFixed(1)}</b></span></div><div class="equipment-items">${p.items.map(i=>`<span title="${e(i.name)}${i.count>1?' ×'+i.count:''}">${image('item',i.id,i.name)}${i.count>1?`<small>×${i.count}</small>`:''}</span>`).join('')||`<small>${p.known?'背包为空':'暂无已读装备'}</small>`}</div></article>`).join('')}</details>`;
 const names=rows=>rows.map(p=>e(p.name)+'（'+p.recovery.map(i=>e(i.name)).join('、')+'）').join('；');
 const effects=`<p class="overview-reason">${v.recoveryEnemies.length?'敌方回血相关装备：'+names(v.recoveryEnemies):v.coverageKnown?'未发现敌方回血相关装备。':'当前已读装备中未发现回血相关装备。'}</p><p class="overview-reason">${v.grievousAllies.length?'我方重伤装备：'+v.grievousAllies.map(p=>e(p.name)+'（'+p.grievous.map(i=>e(i.name)).join('、')+'）').join('；'):v.coverageKnown?'我方暂无重伤装备。':'当前已读队友中未发现重伤装备。'}</p>`;
 const summary=`<div class="equipment-totals"><span>我方背包标价<strong>${total(v.ally)}</strong></span><span>敌方背包标价<strong>${total(v.enemy)}</strong></span></div><p class="note">${v.difference===null?'双方五人装备未读完整，暂不比较。':`当前背包标价差：我方${v.difference>=0?'+':''}${v.difference.toLocaleString()} 金。`}</p>`;
 return expanded?`<details data-guide-section="equipment-value"><summary>背包标价 · ${v.difference===null?'数据未读全':`我方${v.difference>=0?'+':''}${v.difference.toLocaleString()} 金`}</summary>${summary}<p class="note">${e(v.caution)}</p></details>${players(v.ally,'我方')}${players(v.enemy,'敌方')}<details data-guide-section="equipment-effects"><summary>回血 / 重伤装备</summary>${effects}</details><details data-guide-section="equipment-method"><summary>数据来源与缺失说明</summary><p class="note">KDA与补刀来自当前公开记分板，缺失显示—；每分钟补刀按本局时长计算。位置未提供时保留未确认。</p></details>`:`${summary}<button data-tab="scoreboard">查看双方 KDA / 补刀 / 装备</button>${effects}${players(v.ally,'我方')}${players(v.enemy,'敌方')}<p class="note">${e(v.caution)}</p>`;
}
