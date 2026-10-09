import {currentPlayerSelection} from './guide.mjs';
import {profile} from './rules.mjs';

const inGame=phase=>['InProgress','Reconnect'].includes(phase);
const activeGame=phase=>phase==='GameStart'||inGame(phase);
const manualSlot=(slots,id)=>slots.find(s=>s.champion===id&&(s.manualPosition===true||!Number.isInteger(s.clientCellId)));
const publicRole=role=>['top','jungle','mid','bottom','support'].includes(role)?role:null;
// Ephemeral evidence for the current game only; no player identity or history.
export function createCurrentGameTracker(){
 let own=null,mode=null,lastPhase=null,gameId=null,liveTime=null;
 return {
  observe(client,champions,slots=[]){
   if(!client?.connected)return;
   const phase=client.phase,id=client.game?.gameId?String(client.game.gameId):null;
   // Loading no longer has a selection session, but it belongs to the same game.
   if(phase==='ChampSelect'&&lastPhase!=='ChampSelect'||activeGame(phase)&&activeGame(lastPhase)&&id&&gameId&&id!==gameId||!activeGame(phase)&&phase!=='ChampSelect'){own=null;mode=null;liveTime=null;}
   if(phase==='ChampSelect'){
    const selected=currentPlayerSelection(client.session,champions,slots),formal=currentPlayerSelection(client.session,champions);
    own=selected?{...selected,role:formal?.positionKnown?formal.role:selected.role,formalKnown:formal?.positionKnown===true}:null;
   }
   if(client.mode?.id)mode=client.mode.id;else if(!own)mode=null;
   lastPhase=phase;if(id)gameId=id;
  },
  current(client,live,champions,slots=[],now=Date.now()){
   const fresh=live?.available&&Number.isFinite(live.at)&&now>=live.at&&now-live.at<=12000;
   if(fresh){
    if(own?.id===live.champion&&mode===live.mode&&Number.isFinite(live.gameTime)&&Number.isFinite(liveTime)&&live.gameTime+30<liveTime)own=null;
    if(own?.id!==live.champion){
     const champion=champions.find(c=>c.id===live.champion),slot=manualSlot(slots,live.champion),position=publicRole(live.position);
     own=champion?{id:champion.id,role:slot?.role||position||profile(champion).roles[0],positionKnown:!!slot||!!position,formalKnown:false}:null;
     liveTime=null;
    }
    if(own&&!own.formalKnown&&publicRole(live.position)){own.role=live.position;own.positionKnown=true;}
    if(live.mode)mode=live.mode;
    if(own&&live.mode===mode&&Number.isFinite(live.gameTime))liveTime=live.gameTime;
    // An unconfirmed mode cannot anchor the game clock; reset the baseline so a
    // later confirmed restart is not measured against a null-mode reading.
    if(live.mode===null||live.mode===undefined)liveTime=null;
   }
   if(!own||!['rift','hex'].includes(mode))return null;
   const slot=manualSlot(slots,own.id),role=own.formalKnown?own.role:slot?.role||own.role;
   return {id:own.id,role,mode,positionKnown:own.formalKnown||!!slot||own.positionKnown,...(own.formalKnown?{formalRole:own.role}:{})};
  },
 };
}
