import {guideIdentity} from './guide.mjs';

const active=phase=>['ChampSelect','GameStart','InProgress','Reconnect'].includes(phase);
const positiveId=value=>/^\d{1,20}$/.test(String(value||''))&&Number(value)>0?String(value):null;
const identity=selection=>selection?guideIdentity(selection):null;
const picked=selection=>({id:selection.id,role:selection.role,mode:selection.mode});
const notices={connection:'连接中断，尚未确认的对手已清除，请重新选择。',session:'选人场次已变化，尚未确认的对手已清除。',selection:'英雄或位置已变化，请重新选择重点对手。',withdrawn:'已选对手退出公开选人，请重新确认。'};

// A local continuity token is not a game ID. Unconfirmed choices live only in
// this process and cannot survive an interrupted observation or app restart.
export function createOpponentFocusTracker({newToken=()=>crypto.randomUUID()}={}){
 let session=null,notice='',choiceRevision=0;
 const clear=reason=>{if(session?.choice&&!session.choice.confirmed)notice=notices[reason];session=null;};
 const snapshot=()=>({selectionContext:session?.token||null,focus:session?.choice?{...session.selection,opponentId:session.choice.opponentId,status:session.choice.confirmed?'confirmed':'waiting'}:null,notice});
 return {
  observe({connected,phase,gameId,selection,enemyIds}){
   if(!connected){clear('connection');return snapshot();}
   if(!active(phase)){clear('session');return snapshot();}
   const id=positiveId(gameId),own=identity(selection),changedGame=!!(session?.gameId&&id&&session.gameId!==id);
   if(phase==='ChampSelect'&&(!session||session.phase!=='ChampSelect'||changedGame)){
    clear('session');session={token:newToken(),phase,gameId:id,identity:own,selection:selection?picked(selection):null,enemyIds:[],choice:null};
   }else if(changedGame){clear('session');return snapshot();}
   if(!session)return snapshot();
   if(own!==session.identity){if(session.choice)notice=notices.selection;session.choice=null;session.identity=own;session.selection=selection?picked(selection):null;session.token=newToken();}
   if(phase==='ChampSelect'&&Array.isArray(enemyIds)){
    const enemies=[...new Set(enemyIds)].sort();
    if(JSON.stringify(enemies)!==JSON.stringify(session.enemyIds))session.token=newToken();
    session.enemyIds=enemies;
    if(session.choice&&!enemies.includes(session.choice.opponentId)){session.choice=null;notice=notices.withdrawn;}
   }
   session.phase=phase;if(id)session.gameId=id;
   return snapshot();
  },
  choose(context){
   if(!session||session.phase!=='ChampSelect'||!session.selection||session.selection.mode!=='rift'||context?.selectionContext!==session.token||identity(context)!==session.identity||context.gameId!==null&&context.gameId!==undefined&&(!positiveId(context.gameId)||positiveId(context.gameId)!==session.gameId))throw Error('选人上下文已变化，请同步后重新选择对手');
   if(typeof context.opponentId!=='string'||context.opponentId&&!session.enemyIds.includes(context.opponentId))throw Error('对手已不在公开选人中，请重新确认');
   session.choice=context.opponentId?{opponentId:context.opponentId,confirmed:false,revision:++choiceRevision}:null;notice='';return snapshot();
  },
  binding(){return session?.gameId&&session.choice&&!session.choice.confirmed?{...session.selection,opponentId:session.choice.opponentId,gameId:session.gameId,selectionContext:session.token,choiceRevision:session.choice.revision,enemyIds:[...session.enemyIds]}:null;},
  confirm(binding){if(session?.token===binding.selectionContext&&session.gameId===binding.gameId&&session.choice?.revision===binding.choiceRevision)session.choice.confirmed=true;return snapshot();},
  snapshot,
 };
}
