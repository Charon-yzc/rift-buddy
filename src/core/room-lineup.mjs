import {sanitizeShare} from './room.mjs';
import {createSlots,mergeClientSession} from './recommend.mjs';
import {restoreTeamFavorite} from './team-favorites.mjs';
import {roomClientPlan,captureRoomStrategy} from './room-configuration.mjs';
import {fingerprint} from './catalog-review.mjs';
import {creativePlanMatches} from './creative-plan.mjs';
import {recommendationDraft} from './draft-intents.mjs';

export const roomLineupIdentity=(share,from=share.from)=>fingerprint({from,mode:share.mode,lineup:share.lineup,configurations:share.configurations,strategy:share.strategy});

// Explicit adoption only changes this assistant's draft and saved choices.
// Public picks/manual locks survive; no client write is performed here.
export function adoptRoomLineup(raw,data,current,client,availability={},syncOptions={}){
 const share=sanitizeShare(raw);if(!share)throw Error('队友阵容格式已变化，请重新查看');
 const inDraft=client?.connected&&client.phase==='ChampSelect'&&client.session;
 if(inDraft&&client.mode?.id!=='rift')throw Error('当前选人不是已确认的峡谷模式，请先查看队友分享');
 if(share.mode!=='rift'&&(share.mode!==undefined||!inDraft||client.mode?.id!=='rift'))throw Error('尚未确认峡谷模式，请先查看队友分享');
 const members=share.strategy?.members||share.lineup.filter(s=>s.champion);
 const desired=createSlots().map(s=>{const champion=share.lineup.find(p=>p.role===s.role)?.champion||null;return {...s,champion,locked:!!champion,automaticPosition:!!champion,party:members.some(m=>m.role===s.role&&m.champion===champion)};});
 // Adopting a team plan does not change a player's public hover. Reject an
 // obsolete proposal before claiming its duties are active or saving choices.
 const context=recommendationDraft(current,inDraft?client.session:null,data.champions,{ownRole:syncOptions.ownRole});
 const changed=context.find(s=>s.publicIntent&&desired.some(d=>d.role===s.role&&d.champion&&d.champion!==s.champion));
 if(changed)throw Error(`当前已预选${data.champions.find(c=>c.id===changed.champion)?.name||changed.champion}，与这套阵容不同；请按当前选人重新推荐，或点击自己的英雄头像更换预选。`);
 const cells=new Set((inDraft?client.session.myTeam:[]).filter(p=>Number(p.championId)>0).map(p=>p.cellId));
 const reusable=current.map(s=>s.automaticPosition&&!s.manualPosition&&!cells.has(s.clientCellId)?{...s,locked:false}:s);
 const restored=restoreTeamFavorite({slots:desired,scope:'party',...(share.strategy?{creativePlan:share.strategy}:{})},reusable,data.champions,inDraft?client.session:null,availability);
 // Lineup-only messages have no party identities. Keep the receiver's marks.
 for(const slot of restored.slots){const prior=current.find(s=>s.role===slot.role);if(!share.strategy||prior.partyManual){slot.party=prior.party;if(prior.partyManual)slot.partyManual=true;}}
 if(inDraft){const merged=mergeClientSession(restored.slots,client.session,data.champions,syncOptions);restored.slots=merged.slots;restored.unassigned=merged.unassigned;}
 if(restored.creativePlan&&(!creativePlanMatches(restored.creativePlan,restored.slots)||restored.creativePlan.members.some(m=>!restored.slots.some(s=>s.role===m.role&&s.party)))){restored.creativePlan=null;restored.conflicts.push({kind:'plan'});}
 if(!share.strategy)restored.creativePlan=captureRoomStrategy(restored.slots,data);
 const configurations=[],configurationErrors=[];
 for(const config of share.configurations||[]){
  if(restored.conflicts.some(c=>c.role===config.role)||!restored.slots.some(s=>s.role===config.role&&s.champion===config.champion))continue;
  try{configurations.push(roomClientPlan(config,data,restored.creativePlan,{localStrategy:restored.creativePlan}).selection);}
  catch(error){configurationErrors.push({champion:config.champion,role:config.role,message:error.message});}
 }
 return {...restored,configurations,configurationErrors,modeAssumed:share.mode===undefined};
}
