import {compactGuideView} from './guide-compact-view.mjs';
import {escape as e} from './ui.mjs';
import {guideMismatch} from './core/guide-stage.mjs';
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
// Compact damage reference uses the same explicitly selected public target
// as the full view, preserving model scope and omitted effects.
// Layout mirrors the ball: a narrow drag grip owns the -webkit-app-region:drag
// zone (drag regions swallow every pointer event), while the content stays
// no-drag so the click that restores the full guide actually reaches us.
export function killStrip(m){
 const value=m?.estimate;if(!value||!Array.isArray(value.duels)||!value.duels.length)return '';
 const basis=value.mineSkillBasis,partial=basis==='vayne-attacks'?'仅普攻 + W；Q / E / R未计入':basis==='ashe-attacks'?'仅普攻 + 被动；Q / W / R未计入':'技能须就绪并命中';
 const allowed=['reviewed','yone-reviewed','vayne-attacks','ashe-attacks'].includes(basis);
 const target=value.targetSelected&&allowed&&Number.isFinite(value.killThreshold);
 const row=target?`<span>vs ${e(value.enemy?.name)} · 六秒约 <strong>${approximate(value.killThreshold)}</strong></span>`:`<span>${!value.targetSelected?'先在完整指引选择公开对手':'当前英雄技能未复核，不显示数字'}</span>`;
 return `<div class="strip-frame"><span class="strip-grip" aria-hidden="true"></span><button class="kill-strip" data-action="strip" title="点击回到完整指引" aria-label="透明伤害参考，点击回到完整指引">${row}${target?`<small>${partial}</small><small>持续命中估算；对手生命抗性反推</small><small>未计冷却、距离、护盾和治疗；不是立即斩杀</small>`:''}<small>点击回到完整指引</small></button></div>`;
}
export function renderGuide(snapshot,tab,isPreview,image){
 const m=snapshot?.model;
 if(!m)return '<header class="compact-header drag"><b>尚未选择配置</b><button data-action="hide" aria-label="关闭">×</button></header>';
 const wrong=['champion','mode','role','combo'].includes(m.live?.kind)||guideMismatch(m.selection,snapshot.current)||m.live?.champion&&m.live.champion!==m.champion.id;
 // All persisted layouts and former tabs resolve to the retained compact card.
 // Hex is hosted by its dedicated micro windows, including manual previews.
 return compactGuideView(snapshot,image,{wrong});
}
