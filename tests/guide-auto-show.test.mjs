import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';import {createRequire} from 'node:module';
const file=new URL('../electron/guide-window.cjs',import.meta.url),source=await fs.readFile(file,'utf8'),realRequire=createRequire(file);
for(const entry of ['InProgress','Reconnect'])test(`late game data displays once after ${entry}, and closing cancels automatic reopening`,async()=>{
 let now=1000,model=null,shows=0,visible=false;const module={exports:{}},state={selection:{id:'Ahri',role:'mid',mode:'hex'},match:{gameId:'777'}},child=new Proxy({publish(){},show(){visible=true;shows++;},visible:()=>visible,hide(){visible=false;},requested:()=>visible},{get:(t,k)=>t[k]||(()=>false)});
 const quiet=new Proxy({},{get:()=>()=>false});
 const require=name=>name==='electron'?{ipcMain:{handle(){}},screen:{on(){},removeListener(){}}}:name==='./hex-micro-windows.cjs'?()=>child:['./skill-window.cjs','./jungle-window.cjs','./window-peek.cjs','./window-resize.cjs'].includes(name)?()=>quiet:realRequire(name);
 vm.runInNewContext(source,{module,exports:module.exports,require,Date:{now:()=>now},setInterval:()=>0,clearInterval(){},setTimeout,clearTimeout,process:{env:{}}});
 const guide=module.exports({root:'.',getState:()=>state,getModel:()=>model,setState:async()=>{},isQuitting:()=>false,showMain(){},diagnostic(){},currentSelection:()=>state.selection,prepareCurrent:async()=>true,getPreferences:()=>({guideAutoShow:true})});
 await guide.phase(entry,true);assert.equal(shows,0);assert.equal(guide.needsAutoShow(),true);
 if(entry==='Reconnect'){
  model={mode:'hex',champion:{id:'Ahri'},live:{matched:false}};await guide.phase(entry,true);assert.equal(shows,0,'Do not show over the reconnect screen while the game is still closed');
 }
 now+=70000;model={mode:'hex',champion:{id:'Ahri'},live:{matched:true}};await guide.phase(entry,true);assert.equal(shows,1);assert.equal(guide.needsAutoShow(),false);
 guide.toggle();assert.equal(visible,false);await guide.phase('InProgress',true);await guide.phase('Reconnect',true);await guide.phase('InProgress',true);assert.equal(shows,1);guide.destroy();
});
