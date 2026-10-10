import {getBuild} from './builds.mjs';
import {currentCombo} from './recommend.mjs';
import {captureCreativePlan,creativeComboContext,validateCreativePlan,creativeMemberCombo} from './creative-plan.mjs';
import {recallPreparation} from './preparation.mjs';
import {sanitizeRoomConfiguration} from './room.mjs';
import {validateRunePage} from './rune-page.mjs';
import {validateCustomSkillOrder} from './skill-advice.mjs';
import {validateSummonerIds} from './summoner-selection.mjs';

// Catalog adoption uses the visible lineup rather than an accepted result
// object. Freeze that same catalog text too, before it crosses machines.
export function captureRoomStrategy(slots,data,active=null,mode='rift'){
 if(mode!=='rift')return null;
 if(active)return validateCreativePlan(active,slots);
 const combo=currentCombo(slots,null,null,data.catalogInfo?.status);if(!combo)return null;
 return captureCreativePlan({slots,scope:'party',...(combo.members?.length===3?{trio:combo}:{duo:combo})},data);
}

export function captureRoomConfigurations(slots,data,store,{creativePlan=null,guide=null,current=null,mode='rift'}={}){
 return slots.filter(s=>s.champion).map(slot=>{
  const champion=data.champions.find(c=>c.id===slot.champion);if(!champion)return null;
  const combo=mode==='rift'?currentCombo(slots,champion.id,slot.role,data.catalogInfo?.status,null,creativePlan):null;
  const context={id:champion.id,role:slot.role,mode,...creativeComboContext(combo)};
  const selection=current?.id===champion.id&&current?.role===slot.role?current:{coreIndex:0,conditions:[],...recallPreparation(store,guide,context),...context};
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
