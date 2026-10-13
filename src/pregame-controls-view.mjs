import {escape as e,button} from './ui.mjs';
import {ROLES} from './core/rules.mjs';

export function pregameControls({scope='party',style='balanced',ownRole='',slots=[],room=null,party=null,compact=false}={}){
 const solo=scope==='solo',selectedStyle=['balanced','fun','wild'].includes(style)?style:'balanced';
 const lobbyCount=Number.isInteger(party?.lobbyCount)?party.lobbyCount:party?.status==='known'?party.members?.length:null;
 const partyCount=new Set(slots.filter(slot=>slot.party&&ROLES.some(role=>role.id===slot.role)).map(slot=>slot.role)).size;
 const joined=room&&['host','client'].includes(room.mode);
 const roomLabel=joined?`${room.room?`房间 ${e(room.room)}`:'房间'}${Array.isArray(room.members)?` · ${room.members.length} 人`:''}`:'连接队友';
 const choice=(action,field,id,label,active,extra='')=>button(action,e(label),'',`pregame-choice${active?' active':''}`,`data-${field}="${e(id)}" aria-pressed="${active}" ${extra}`);
 return `<section class="pregame-controls${compact?' pregame-controls-compact':''}" aria-label="选人条件">
  <div class="pregame-primary">
   <label class="pregame-role">预选位置<select id="solo-role" class="select" aria-label="预选位置"><option value="" ${ownRole?'':'selected'}>选择分路</option>${ROLES.map(role=>`<option value="${e(role.id)}" ${ownRole===role.id?'selected':''}>${e(role.name)}</option>`).join('')}</select></label>
   <div class="pregame-modes" role="group" aria-label="推荐任务">${choice('draft-scope','scope','solo','给我推荐',solo)}${choice('draft-scope','scope','party','开黑阵容',!solo)}</div>
   ${button('task-members',lobbyCount?`组队 ${lobbyCount} 人`:`范围 ${partyCount} 路`,'','pregame-members',`aria-label="成员与开黑位置${partyCount?`，已标记 ${partyCount} 个位置`:''}"`)}
  </div>
  <div class="pregame-secondary">
   <div class="pregame-styles" role="group" aria-label="推荐风格">${[['balanced','稳妥'],['fun','娱乐'],['wild','花活']].map(([id,label])=>choice('draft-style','style',id,label,selectedStyle===id)).join('')}</div>
   ${button('room-focus',roomLabel,'',`pregame-room${joined?' is-connected':''}`)}
   <details class="pregame-more" data-companion-disclosure="pregame-options"><summary>更多选项</summary><div class="pregame-more-content"><div class="pregame-scopes" role="group" aria-label="开黑推荐范围">${[['context','考虑全队'],['party','只看开黑'],['bot','下路双排']].map(([id,label])=>choice('draft-scope','scope',id,label,scope===id)).join('')}</div>${button('draft-filters','英雄池与偏好','','pregame-preferences')}</div></details>
  </div>
 </section>`;
}
