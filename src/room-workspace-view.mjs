import {escape as e,portrait,button} from './ui.mjs';
import {ROLES} from './core/rules.mjs';
import {SHARDS} from './core/builds.mjs';
import {creativeMemberCombo} from './core/creative-plan.mjs';
import {duoPlayView} from './duo-play-view.mjs';

const roleName=id=>ROLES.find(r=>r.id===id)?.name||'位置未定';
export function roomPlanSummary(config,data){
 const runeMap=new Map(data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes.map(r=>[r.id,r.name]))));
 const perks=config.runes?.selectedPerkIds||[];
 return `<dl class="room-plan-facts"><div><dt>核心出装</dt><dd>${e(config.items.slice(0,3).map(id=>data.items[id]?.name||id).join(' → ')||'暂未提供')}</dd></div><div><dt>符文</dt><dd>${e(perks.map(id=>runeMap.get(id)||SHARDS[id]||id).join(' / ')||'此模式未提供普通符文')}</dd></div><div><dt>D / F</dt><dd>${e(config.spells.map(id=>data.spells[id]?.name||id).join(' / '))}</dd></div><div><dt>加点</dt><dd>${config.attributePlan?e(config.attributePlan.priority.join(' > ')):`${config.first?'前三点 '+e(config.first.split('').join(' → '))+'；':''}${config.priority?'优先 '+e(config.priority.split('').join(' > ')):'按游戏内机制核对'}`} ${config.skills?'· 已有逐级参考':'· 后续按可升级选项核对'}</dd></div></dl>`;
}
export function roomWorkspace({data,role,configurations,share,ownPlan,clientControls='',connection='',connected=false,connectionLabel='',notice='',clientMessage=''}){
 const champion=id=>data.champions.find(c=>c.id===id),strategy=share?.strategy,own=configurations.find(c=>c.champion===ownPlan?.selection.id&&c.role===ownPlan.selection.role);
 const myRole=`<label class="room-own-role">我的位置<select id="room-role" class="select" aria-label="我的位置"><option value="">尚未确认</option>${ROLES.map(r=>`<option value="${r.id}" ${r.id===role?'selected':''}>${r.name}</option>`).join('')}</select></label>`;
 const hasOwn=!!(own&&ownPlan),hasParty=!!(strategy||configurations.length);
 return `<div class="room-workspace">
  <div class="room-workspace-heading"><h1>开黑房间</h1><div class="room-heading-actions">${connected?button('room-connect-focus',e(connectionLabel||'连接与邀请队友'),'link','small'):''}${button('navigate','调整阵容','team','small','data-route="draft"')}</div></div>
  ${notice?`<p class="callout warning">${e(notice)}</p>`:''}
  ${!connected?`<section id="room-connection" class="room-connection-section" aria-label="连接房间">${connection}</section>`:''}
  <section class="${hasOwn?'panel':'room-empty-section'} room-own-plan"><div class="panel-head"><h2>我的本局准备</h2>${myRole}${!hasOwn&&role?button('pick-slot','选择我的英雄','team','primary small',`data-role="${role}"`):''}</div><div class="panel-body">
   ${hasOwn?`<div class="room-own-hero">${portrait(champion(own.champion))}<div><h3>${e(champion(own.champion)?.name)} · ${e(roleName(own.role))}</h3><p>${e(own.basis?.title||'当前方案')}${strategy?' · '+e(strategy.name):''}</p></div>${button('room-own-edit','调整配置','sword','small')}</div>${roomPlanSummary(own,data)}${clientControls}`:`<p class="room-empty-copy">${role?'尚未选择英雄。':'先确认自己的位置，再选择英雄。'}</p>`}
   ${clientMessage?`<p class="bottom-note">${e(clientMessage)}</p>`:''}
  </div></section>
  <section class="${hasParty?'panel':'room-empty-section'} room-party-plan"><div class="panel-head"><div><h2>${strategy?e(strategy.name):'我们的配合方案'}</h2>${strategy?`<p>${e(strategy.plan)}</p>`:''}</div>${button('room-combinations','选择组合','spark','small')}</div><div class="panel-body">
   ${strategy?`<div class="room-team-brief"><p><b>配合窗口</b> ${e(strategy.window)}</p><p><b>停止条件</b> ${e(strategy.caution)}</p></div>`:''}
   <div class="room-local-roster">${configurations.map(c=>{const play=strategy?creativeMemberCombo(strategy,c.champion,c.role)?.play:null;return `<article class="room-local-member"><header>${portrait(champion(c.champion),'sm')}<div><b>${e(champion(c.champion)?.name)} · ${e(roleName(c.role))}</b><small>${c.role===role?'我的方案':'本机拟定 · 请与队友确认'}</small></div>${button('build','配置','sword','quiet small',`data-id="${c.champion}" data-role="${c.role}" data-mode="${c.mode}"`)}</header>${roomPlanSummary(c,data)}${play?`<details class="ui-disclosure"><summary>配合玩法与停止条件</summary>${duoPlayView(play,{compact:true})}</details>`:''}</article>`;}).join('')||'<p class="room-empty-copy">选择组合后查看配置与分工。</p>'}</div>
   ${strategy?button('room-copy-plan','复制配合与配置','copy','small'):''}
  </div></section>
  ${connected?`<section id="room-connection" class="room-connection-section" aria-label="连接房间与队友分享"><h2>队友的实际分享</h2>${connection}</section>`:''}
 </div>`;
}
