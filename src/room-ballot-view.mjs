import {roomBallotBoard} from './core/room-ballot.mjs';
import {escape as e,portrait,button,roleIcon} from './ui.mjs';
import {lineupFitView} from './lineup-fit-view.mjs';
import {proposalKey,ballotVotes} from './core/room.mjs';

export function proposalNicknames(names){
 const values=[...new Set(names.filter(Boolean))];
 const full=values.join('、'),short=values.length>1?values.map(name=>[...name].slice(0,values.length>3?1:2).join('')).join('、'):full;
 return `<small class="ballot-proposers" tabindex="0" title="${e(full)}" aria-label="提议者：${e(full)}">${e(short)}</small>`;
}

// Use the exact public proposal, including configuration choices, for votes.
export function candidateBallotActions(room,key,index){
 if(!room||room.mode==='idle')return button('propose-result','提议','','small candidate-propose',`data-index="${index}"`);
 const proposals=room.ballots?(room.members||[]).filter(m=>m.online!==false&&m.share?.ballot?.proposal&&proposalKey(m.share.ballot.proposal)===key):[];
 const voters=(room.members||[]).filter(m=>m.online!==false&&ballotVotes(m.share?.ballot).includes(key)),mine=voters.some(m=>m.self);
 return proposals.length?button('room-vote',mine?'已投':'未投','',`small${mine?' active':''}`,`data-key="${e(key)}" aria-pressed="${mine}" title="${mine?'已支持此阵容；再点撤回':'支持此阵容'}"`):button('propose-result','提议','','small candidate-propose',`data-index="${index}" ${room.ballots?'':'disabled'}`);
}
export function roomBallotView(room,slots,champions,options={}){
 if(!room||room.mode==='idle')return '';
 const board=roomBallotBoard(room,slots,champions,options);
 const warning=room.warning?`<p class="ballot-adoption has-change" role="alert">${e(room.warning)}</p>`:'';
 const incompatible=(room.members||[]).filter(m=>!m.self&&m.online!==false&&m.packedStates===false);
 const compatibility=room.packedStates&&incompatible.length&&board.some(r=>r.proposal.strategy?.members.length>=4)?`<p class="ballot-adoption has-change" role="status" title="${e(incompatible.map(m=>m.nick).join('、'))}">${incompatible.length} 位队友需更新助手，才能同步完整多人方案</p>`:'';
 if(!room.ballots)return warning+'<details class="ballot-support"><summary>房间候选投票</summary><p>此中继尚未支持投票，阵容分享仍可使用。中继维护者升级后重新连接即可开启。</p></details>';
 const adoptionView=row=>{
  if(!row.adopters.length)return '';
  const labels={pending:'已采用，待预选',matched:'方案一致','changed-pick':'已改选','changed-configuration':'配置已调整','pending-configuration':'配置待确认'};
  const changed=row.adopters.filter(m=>m.state.startsWith('changed')).length;
  const title=row.adopters.map(m=>m.nick+'：'+labels[m.state]).join('；')||'投票表示意向，采用由各位成员分别确认';
  return `<p class="ballot-adoption${changed?' has-change':''}" role="status" title="${e(title)}">已采用 ${row.adopters.length}${changed?' · '+changed+' 人已改选或调整配置':''}${row.adopters.some(m=>m.state==='pending')?' · 有人待预选':''}</p>`;
 };
 const names={top:'上路',jungle:'打野',mid:'中路',bottom:'下路',support:'辅助'};
 if(!board.length)return warning+compatibility;
 return `${warning}${compatibility}<section class="room-ballot-board" aria-label="阵容投票"><header><h3>大家提议的阵容</h3><span>${board.length} 套</span></header><div class="room-ballot-scroll">${board.map((r,index)=>`<article class="room-ballot-row ${r.fit.compatible?'':'conflict'}" data-proposal-key="${e(r.key)}"><div class="ballot-row-top"><b class="ballot-rank">${index+1}</b>${proposalNicknames(r.proposers)}<div class="ballot-heroes" data-member-count="${r.proposal.lineup.filter(s=>s.champion).length}">${r.proposal.lineup.filter(s=>s.champion).map(s=>{const c=champions.find(c=>c.id===s.champion);return `<button class="ballot-member" data-own="${!!options.soloRole&&s.role===options.soloRole}" data-action="room-ballot-hero" data-key="${e(r.key)}" data-id="${e(s.champion)}" data-role="${s.role}" aria-label="${e(c?.name||s.champion)} · ${names[s.role]} · 选择英雄" title="${e(c?.name||s.champion)} · ${names[s.role]} · 选择英雄">${c?portrait(c,'sm'):e(s.champion)}${roleIcon(s.role,'ballot-role-mark')}${options.soloRole&&s.role===options.soloRole?'<span class="candidate-self">你</span>':''}</button>`;}).join('')}</div></div><div class="ballot-row-actions">${button('room-vote',`${r.mine?'已投':'投票'} ${r.voters.length}`,'',r.mine?'small active':'small',`data-key="${e(r.key)}" aria-pressed="${r.mine}" title="${e(r.voters.join('、')||'暂无投票')} · 投票仅表示意向；可多选，再点撤回本票"`)}</div>${adoptionView(r)}<div class="ballot-row-detail">${button('room-ballot-details',e(r.proposal.strategy?.name||'详情'),'','quiet small',`data-key="${e(r.key)}" title="${e(r.proposers.join('、'))}提议，查看阵容详情"`)}${lineupFitView(r.fit,{disclosure:'ballot-fit-'+r.key})}</div></article>`).join('')}</div></section>`;
}
