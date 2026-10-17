import {escape as e,button} from './ui.mjs';
import {ROLES} from './core/rules.mjs';
import {partyRoleConflicts} from './core/party-range.mjs';

export function pregameControls({scope='party',style='balanced',ownRole='',slots=[],room=null,party=null,compact=false,moreContent='',preselection=null,preselectionHero=''}={}){
 const selectedStyle=['balanced','fun','wild'].includes(style)?style:'balanced';
 const conflicts=partyRoleConflicts(party);
 const lobbyCount=Number.isInteger(party?.lobbyCount)?party.lobbyCount:party?.status==='known'?party.members?.length:null;
 const partyCount=new Set(slots.filter(slot=>slot.party&&ROLES.some(role=>role.id===slot.role)).map(slot=>slot.role)).size;
 const unlocatedSelf=party?.status==='unknown'&&partyCount===0;
 const joined=room&&['host','client'].includes(room.mode);
 const roomLabel=joined?`${room.room?`房间 ${e(room.room)}`:'房间'}${Array.isArray(room.members)?` · ${room.members.length} 人`:''}`:'连接队友';
 const choice=(action,field,id,label,active,extra='')=>button(action,e(label),'',`pregame-choice${active?' active':''}`,`data-${field}="${e(id)}" aria-pressed="${active}" ${extra}`);
 return `<section class="pregame-controls${compact?' pregame-controls-compact':''}" aria-label="选人条件" data-role-conflict="${!!conflicts.length}">
  <div class="pregame-primary">
   <label class="pregame-role" data-role-needed="${!ownRole}"><span>预选</span><select id="solo-role" class="select" aria-label="预选分路"><option value="" ${ownRole?'':'selected'}>分路</option>${ROLES.map(role=>`<option value="${e(role.id)}" ${ownRole===role.id?'selected':''}>${e(role.name)}</option>`).join('')}</select></label>${button('pregame-hero',preselectionHero||'<span class="pregame-hero-empty" aria-hidden="true">+</span>','','pregame-hero',`aria-label="${preselection?.champion?'更换预选英雄':'预选英雄'}" title="选择英雄"`)}
  </div>
  <div class="pregame-secondary">
   <div class="pregame-styles" role="group" aria-label="推荐风格">${[['balanced','稳妥'],['fun','娱乐'],['wild','花活']].map(([id,label])=>choice('draft-style','style',id,label,selectedStyle===id)).join('')}</div>
   <label class="pregame-style-select"><select id="companion-style" class="select" aria-label="推荐风格">${[['balanced','稳妥'],['fun','娱乐'],['wild','花活']].map(([id,label])=>`<option value="${id}" ${selectedStyle===id?'selected':''}>${label}</option>`).join('')}</select></label>
   <details class="pregame-more" data-companion-disclosure="pregame-options"><summary>更多</summary><div class="pregame-more-content"><div class="pregame-scopes" role="group" aria-label="开黑推荐范围">${[['party','自动参考范围'],['context','参考全队']].map(([id,label])=>choice('draft-scope','scope',id,label,scope===id)).join('')}</div>${button('task-members','调整开黑成员','','pregame-members',`aria-label="成员与开黑位置${partyCount?`，已标记 ${partyCount} 个位置`:''}" title="${unlocatedSelf?'未读取到组队大厅，请选择预选位置；开黑成员可手动标记':(lobbyCount?`游戏组队 ${lobbyCount} 人；`:'')+'点击调整推荐范围'}"`)}${button('draft-filters','英雄池与偏好','','pregame-preferences')}${compact?'':button('room-focus',roomLabel,'',`pregame-room${joined?' is-connected':''}`)}${moreContent}</div></details>
  </div>
 ${conflicts.length?`<p class="pregame-conflict" role="status">${conflicts.map(id=>ROLES.find(role=>role.id===id).name).join('、')}意向重复，请协商分路</p>`:''}</section>`;
}
