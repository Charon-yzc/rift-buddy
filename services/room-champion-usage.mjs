import {ownSharedChampionUsage} from '../src/core/room-champion-usage.mjs';

// One main-process publisher owns both windows' own statistics. In particular,
// a renderer cannot republish a previous account's or somebody else's counts.
export function createRoomUsagePublisher({getService,getSummary,getMass,setTimer=setTimeout,clearTimer=clearTimeout}){
 let timer=null,closed=false;
 const expected=snapshot=>snapshot.championUsage?ownSharedChampionUsage(getSummary(),getMass()):undefined;
 function publish(share,options){
  const service=getService();if(!service||closed)throw Error('尚未连接房间');
  const {championUsage:ignored,...publicShare}=share||{},summary=expected(service.snapshot());
  return service.publish({...publicShare,...(summary!==undefined?{championUsage:summary}:{})},options);
 }
 function flush(){
  timer=null;const service=getService(),snapshot=service?.snapshot();if(closed||!snapshot||snapshot.mode==='idle')return false;
  const own=snapshot.members.find(member=>member.self)?.share,summary=expected(snapshot);
  if(JSON.stringify(own?.championUsage)===JSON.stringify(summary))return false;
  try{publish({...own,lineup:own?.lineup||[],pick:own?.pick||null,at:undefined});return true;}catch{return false;}
 }
 function sync(){
  if(closed)return;const snapshot=getService()?.snapshot();if(!snapshot||snapshot.mode==='idle')return;
  const summary=expected(snapshot),own=snapshot.members.find(member=>member.self)?.share;
  if(JSON.stringify(own?.championUsage)===JSON.stringify(summary))return;
  // Revocation must not wait for a normal batch debounce. Ordinary pages are
  // coalesced to stay below the relay's four-frame/second input allowance.
  if(summary===null||summary===undefined){if(timer!==null){clearTimer(timer);timer=null;}getService()?.clearChampionUsage?.();flush();}
  else if(timer===null){timer=setTimer(flush,600);timer?.unref?.();}
 }
 return {publish,sync,dispose(){closed=true;if(timer!==null)clearTimer(timer);timer=null;}};
}
