import {getBuild} from './builds.mjs';
import {currentCombo} from './recommend.mjs';
import {captureCreativePlan,creativeComboContext,validateCreativePlan,creativePlanMatches,creativeMemberCombo} from './creative-plan.mjs';
import {recallPreparation,preparationIdentity} from './preparation.mjs';
import {sanitizeRoomConfiguration} from './room.mjs';
import {validateRunePage} from './rune-page.mjs';
import {validateCustomSkillOrder} from './skill-advice.mjs';
import {validateSummonerIds} from './summoner-selection.mjs';
import {currentPlayerSelection} from './guide.mjs';
import {manualPlayerSlot,CLIENT_POSITION_ROLES} from './draft.mjs';

// A saved solo preference can outlive its mode or game. When the client has
// identified this player, share that player's current public/manual slot.
// Unknown positions and slots occupied by another client cell stay unknown.
export function roomPlayerRole(slots,champions,client,soloRole=''){
 const session=client?.connected?client.session:null;
 if(!session)return soloRole;
 const own=currentPlayerSelection(session,champions,slots);
 if(own)return own.positionKnown&&slots.some(s=>s.role===own.role&&s.champion===own.id)?own.role:'';
 const cell=session.localPlayerCellId;
 if(!Number.isInteger(cell))return '';
 const player=session.myTeam?.find(p=>p.cellId===cell);
 const role=manualPlayerSlot(slots,cell)?.role||CLIENT_POSITION_ROLES[String(player?.assignedPosition||'').toUpperCase()];
 const slot=slots.find(s=>s.role===role);
 return slot&&(!Number.isInteger(slot.clientCellId)||slot.clientCellId===cell)?role:'';
}

// Catalog adoption uses the visible lineup rather than an accepted result
// object. Freeze that same catalog text too, before it crosses machines.
export function captureRoomStrategy(slots,data,active=null,mode='rift'){
 if(mode!=='rift')return null;
 // A cleared slot can retain a local plan for later restoration. Publish the
 // current public lineup now, without claiming its incomplete plan is active.
 if(active){const plan=validateCreativePlan(active);return creativePlanMatches(plan,slots)?plan:null;}
 const combo=currentCombo(slots,null,null,data.catalogInfo?.status);if(!combo)return null;
 return captureCreativePlan({slots,scope:'party',...(combo.members?.length===3?{trio:combo}:{duo:combo})},data);
}

export function captureRoomConfigurations(slots,data,store,{creativePlan=null,guide=null,current=null,mode='rift'}={}){
 return slots.filter(s=>s.champion).map(slot=>{
  const champion=data.champions.find(c=>c.id===slot.champion);if(!champion)return null;
  const combo=mode==='rift'?currentCombo(slots,champion.id,slot.role,data.catalogInfo?.status,null,creativePlan):null;
  const context={id:champion.id,role:slot.role,mode,...creativeComboContext(combo)};
  const selection=current&&preparationIdentity(current)===preparationIdentity(context)?current:{coreIndex:0,conditions:[],...recallPreparation(store,guide,context),...context};
  const b=getBuild(champion,slot.role,data,selection);
  return sanitizeRoomConfiguration({champion:champion.id,role:slot.role,mode:selection.mode,patch:data.patch,start:b.start.map(i=>Number(i.id)),items:b.items.map(i=>Number(i.id)),boots:b.boots?[Number(b.boots)]:[],spells:b.summoners,runes:b.runePage,skills:b.skillOrder,priority:b.priority,basis:{title:b.title,note:b.sourceNote,rune:b.selectedRune?[b.selectedRune.name,b.selectedRune.source,b.selectedRune.when].filter(Boolean).join('；'):'发送方未提供普通符文',skill:b.selectedSkill?.when||b.skillMechanism||'按发送方加点优先与游戏内可升级选项核对，不伪造逐级序列'}});
 }).filter(Boolean);
}

// Adoption is an explicit local edit, never a network-triggered rune write.
// The equipment snapshot remains visible separately: local item references
// can differ, so this action promises only the concrete runes/skills/spells.
export function roomPreparation(raw,data,strategy){
 const config=sanitizeRoomConfiguration(raw);
 if(config?.mode==='hex')throw Error('海克斯配置可查看和复制，不应用峡谷符文');
 if(!config||config.patch!==data.patch||!data.champions.some(c=>c.id===config.champion))throw Error('配置与当前英雄或资料版本不一致，请先核对发送方配置');
 if(!config.runes||!validateRunePage(config.runes,data.runes))throw Error('发送方符文在当前资料中不可用，不能采用替代页');
 const skills=config.skills?validateCustomSkillOrder({order:config.skills,patch:config.patch},config.champion):undefined;
 const summonerIds=validateSummonerIds(config.spells,'rift');
 const plan=strategy&&strategy.members?.some(m=>m.champion===config.champion&&m.role===config.role)?validateCreativePlan(strategy):null;
 const combo=plan?creativeMemberCombo(plan,config.champion,config.role):null;
 return {id:config.champion,role:config.role,mode:'rift',...creativeComboContext(combo),customRunePage:{...config.runes,patch:config.patch},...(skills?{customSkillOrder:skills}:{}),summonerIds};
}
