// Coalesce background polling while preserving a user-requested foreground sync.
// A click during an in-flight poll must never silently disappear.
export function createClientSync(run){
 let current=null,isManual=false;
 return async function request(manual=false){
  if(current){
   const previous=current;
   if(!manual||isManual)return previous;
   await previous.catch(()=>{});
   if(current)return current;
  }
  isManual=manual;
  const operation=Promise.resolve().then(()=>run(manual));current=operation;
  try{return await operation;}finally{if(current===operation)current=null;}
 };
}
