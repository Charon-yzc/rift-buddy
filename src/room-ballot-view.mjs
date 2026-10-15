import {roomBallotBoard} from './core/room-ballot.mjs';
import {escape as e,portrait,button} from './ui.mjs';
import {lineupFitView} from './lineup-fit-view.mjs';
export function roomBallotView(room,slots,champions,options={}){
 if(!room||room.mode==='idle')return '';
 const board=roomBallotBoard(room,slots,champions,options);
 const warning=room.warning?`<p class="ballot-adoption has-change" role="alert">${e(room.warning)}</p>`:'';
 const incompatible=(room.members||[]).filter(m=>!m.self&&m.online!==false&&m.packedStates===false);
 const compatibility=room.packedStates&&incompatible.length&&board.some(r=>r.proposal.strategy?.members.length>=4)?`<p class="ballot-adoption has-change" role="status" title="${e(incompatible.map(m=>m.nick).join('、'))}">${incompatible.length} 位队友需更新助手，才能同步完整多人方案</p>`:'';
 if(!room.ballots)return warning+'<details class="ballot-support"><summary>房间候选投票</summary><p>此中继尚未支持投票，阵容分享仍可使用。中继维护者升级后重新连接即可开启。</p></details>';
 const adoptionView=row=>{
  if(!room.adoptions&&!row.adopters.length)return '';
  const labels={pending:'已采用，待预选',matched:'方案一致','changed-pick':'已改选','changed-configuration':'配置已调整','pending-configuration':'配置待确认'};
  const changed=row.adopters.filter(m=>m.state.startsWith('changed')).length;
  const title=row.adopters.map(m=>m.nick+'：'+labels[m.state]).join('；')||'投票表示意向，采用由各位成员分别确认';
  return `<p class="ballot-adoption${changed?' has-change':''}" role="status" title="${e(title)}">已采用 ${row.adopters.length}${changed?' · '+changed+' 人已改选或调整配置':''}${row.adopters.some(m=>m.state==='pending')?' · 有人待预选':''}</p>`;
 };
 const names={top:'上路',jungle:'打野',mid:'中路',bottom:'下路',support:'辅助'};
 return `${warning}${compatibility}<details class="room-ballot-board" aria-label="阵容投票" data-companion-disclosure="room-ballots"><summary>队友候选 · ${board.length} 套${board.length?' · 最高 '+Math.max(...board.map(r=>r.voters.length))+' 票':''}</summary><div class="room-ballot-scroll">${board.length?board.map((r,index)=>`<article class="room-ballot-row ${r.fit.compatible?'':'conflict'}"><div class="ballot-row-top"><b>${index+1}</b><div class="ballot-heroes">${r.proposal.lineup.filter(s=>s.champion).map(s=>{const c=champions.find(c=>c.id===s.champion);return `<button data-action="room-ballot-hero" data-key="${e(r.key)}" data-id="${e(s.champion)}" data-role="${s.role}" title="${e(c?.name||s.champion)} · ${names[s.role]} · 查看或预选配置">${c?portrait(c,'sm'):e(s.champion)}<small>${names[s.role]}</small></button>`;}).join('')}</div>${lineupFitView(r.fit,{disclosure:'ballot-fit-'+r.key})}</div><p class="ballot-plan-summary">${e(r.proposal.strategy?.why||r.proposal.strategy?.name||'按分路搭配，点击头像核对配置')}</p>${adoptionView(r)}<div class="ballot-row-actions"><small title="${e(r.proposers.join('、'))}">${e(r.proposers[0])}提议${r.fit.compatible?r.fit.exact?'':' · 英雄吻合，位置不同':' · 已选英雄有冲突'}</small>${button('room-ballot-details','详情','','quiet small',`data-key="${e(r.key)}"`)}${button('room-vote',`${r.mine?'已投':'投票'} ${r.voters.length}`,'',r.mine?'small active':'small',`data-key="${e(r.key)}" aria-pressed="${r.mine}" title="${e(r.voters.join('、')||'暂无投票')} · 投票仅表示意向，采用需分别确认"`)}${button('room-adopt-ballot','采用','','primary small',`data-key="${e(r.key)}" title="${room.adoptions?'采用本机方案并同步采用状态':'仅采用到本机，此中继不支持采用状态同步'}"`)}</div></article>`).join(''):'<p>在组合候选中点“提议”，邀请队友投票。</p>'}</div></details>`;
}
