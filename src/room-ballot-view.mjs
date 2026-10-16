import {roomBallotBoard} from './core/room-ballot.mjs';
import {escape as e,portrait,button} from './ui.mjs';
import {lineupFitView} from './lineup-fit-view.mjs';
import {proposalKey} from './core/room.mjs';

// Use the exact public proposal, including configuration choices, for votes.
export function candidateBallotActions(room,key,index){
 if(!room||room.mode==='idle')return button('propose-result','提议','','small candidate-propose',`data-index="${index}"`);
 const proposals=(room.members||[]).filter(m=>m.share?.ballot?.proposal&&proposalKey(m.share.ballot.proposal)===key);
 const voters=(room.members||[]).filter(m=>m.online!==false&&m.share?.ballot?.vote===key),mine=voters.some(m=>m.self);
 return button('propose-result',proposals.some(m=>m.self)?'已提议':'提议','','small candidate-propose',`data-index="${index}" ${room.ballots?'':'disabled'}`)+
  (proposals.length?button('room-vote',`${mine?'已投':'投票'} ${voters.length}`,'',`small${mine?' active':''}`,`data-key="${e(key)}" aria-pressed="${mine}"`):'');
}
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
 if(!board.length)return warning+compatibility;
 return `${warning}${compatibility}<section class="room-ballot-board" aria-label="阵容投票"><header><h3>大家提议的阵容</h3><span>${board.length} 套</span></header><div class="room-ballot-scroll">${board.map((r,index)=>`<article class="room-ballot-row ${r.fit.compatible?'':'conflict'}"><div class="ballot-row-top"><b>${index+1}</b><div class="ballot-heroes">${r.proposal.lineup.filter(s=>s.champion).map(s=>{const c=champions.find(c=>c.id===s.champion);return `<button data-action="room-ballot-hero" data-key="${e(r.key)}" data-id="${e(s.champion)}" data-role="${s.role}" title="${e(c?.name||s.champion)} · ${names[s.role]} · 选择英雄">${c?portrait(c,'sm'):e(s.champion)}<span>${e(c?.name||s.champion)}</span><small>${names[s.role]}</small></button>`;}).join('')}</div></div><div class="ballot-row-actions"><small title="${e(r.proposers.join('、'))}">${e(r.proposers[0])}提议</small>${button('room-vote',`${r.mine?'已投':'投票'} ${r.voters.length}`,'',r.mine?'small active':'small',`data-key="${e(r.key)}" aria-pressed="${r.mine}" title="${e(r.voters.join('、')||'暂无投票')} · 投票仅表示意向"`)}${button('room-adopt-ballot','采用','','primary small',`data-key="${e(r.key)}"`)}</div>${adoptionView(r)}<div class="ballot-row-detail">${lineupFitView(r.fit,{disclosure:'ballot-fit-'+r.key})}${button('room-ballot-details','详情','','quiet small',`data-key="${e(r.key)}"`)}</div></article>`).join('')}</div></section>`;
}
