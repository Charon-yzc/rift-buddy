// Release only a main window that the game transition automatically hid.
// A quiet period lets the renderer finish queued saves after an IPC reply.
module.exports=function createMainWindowRelease({getWindow,canRelease,isBusy,getSaveTask,release,diagnostic,idleMs=1000,retryMs=200}){
 let target=null,timer=null,generation=0;
 const cancel=()=>{generation++;target=null;clearTimeout(timer);timer=null;};
 function schedule(delay=idleMs){clearTimeout(timer);timer=setTimeout(check,delay);timer.unref?.();}
 async function check(){
  timer=null;const window=target,version=generation;
  if(!window||window!==getWindow()||window.isDestroyed()||window.isVisible()||!canRelease()){cancel();return;}
  if(isBusy(window)){schedule(retryMs);return;}
  const barrier=getSaveTask();
  try{await barrier;}catch(error){if(version===generation){diagnostic('main renderer retained after failed save '+error.message);cancel();}return;}
  if(version!==generation)return;
  if(window!==getWindow()||window.isDestroyed()||window.isVisible()||!canRelease()){cancel();return;}
  if(isBusy(window)||barrier!==getSaveTask()){schedule();return;}
  cancel();release(window);
 }
 return {request(window){cancel();if(window&&!window.isDestroyed()){target=window;schedule();}},activity(window){if(target===window){generation++;schedule();}},cancel};
};
