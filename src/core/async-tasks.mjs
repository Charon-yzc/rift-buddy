// Coalesce background polling while preserving a user-requested foreground sync.
// A click during an in-flight poll must never silently disappear.
// Rune-context verification must start a read after any older read settles.
export function createClientSync(run){
 let current=null,isManual=false;
 return async function request(manual=false,{fresh=false}={}){
  while(current){
   const previous=current;
   if(!fresh&&(!manual||isManual))return previous;
   await previous.catch(()=>{});
  }
  isManual=manual;
  const operation=Promise.resolve().then(()=>run(manual,fresh));current=operation;
  try{return await operation;}finally{if(current===operation)current=null;}
 };
}
