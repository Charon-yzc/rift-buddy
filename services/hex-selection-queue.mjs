// Explicit bench clicks share one transport lane. Keep only the newest waiting
// click; an in-flight POST must settle before the next swap can start.
export function createHexSelectionQueue(run){
 let revision=0,running=false,waiting=null;
 const superseded=()=>({complete:false,superseded:true});
 async function drain(){
  if(running)return;running=true;
  try{while(waiting){const job=waiting;waiting=null;
   try{const result=await run(job.value,{isCurrent:()=>job.revision===revision});job.resolve(job.revision===revision?result:superseded());}
   catch(error){if(job.revision===revision)job.reject(error);else job.resolve(superseded());}
  }}finally{running=false;}
 }
 return value=>new Promise((resolve,reject)=>{
  if(waiting)waiting.resolve(superseded());
  waiting={value,resolve,reject,revision:++revision};void drain();
 });
}
