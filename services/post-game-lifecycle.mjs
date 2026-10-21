const phases=new Set(['PreEndOfGame','WaitingForStats','EndOfGame']);
const gameId=value=>/^[1-9]\d{0,19}$/.test(String(value??''))?String(value):'';

// One bounded, local result per client/account/game. Incomplete statistics are
// retried by the existing status poll; an old request can never own a new round.
export function createPostGameLifecycle({read,show,hide,current,now=Date.now}){
 let context=null,flight=null,handled='',retryAt=0,attempts=0,disposed=false;
 const identity=c=>c?.connected&&phases.has(c.phase)&&c.enabled!==false&&c.transport&&gameId(c.gameId)&&c.account?
  {gameId:gameId(c.gameId),account:c.account,transport:c.transport,game:c.game}:null;
 const same=(a,b)=>a&&b&&a.gameId===b.gameId&&a.account===b.account&&a.transport===b.transport;
 function observe(){
  const next=disposed?null:identity(current());
  if(!same(context,next)){context=next;handled='';attempts=0;retryAt=0;hide();}
  if(!context||flight||handled||now()<retryAt||attempts>=12)return flight;
  const captured=context,requestContext={...captured,game:structuredClone(current()?.game)};attempts++;
  const task=Promise.resolve().then(()=>read(requestContext)).then(report=>{
   if(disposed||context!==captured||!same(captured,identity(current()))||!report||gameId(report.gameId)!==captured.gameId)return;
   show(report);handled=captured.gameId;
  }).catch(()=>{}).finally(()=>{if(flight===task)flight=null;if(context===captured)retryAt=now()+Math.min(15000,1500*attempts);});
  flight=task;return task;
 }
 return {observe,dispose(){disposed=true;context=null;hide();}};
}
