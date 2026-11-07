import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const filename=new URL('../electron/guide-window.cjs',import.meta.url);
const source=await fs.readFile(filename,'utf8'),realRequire=createRequire(filename);
function controller(getModel){
 const published=[],diagnostics=[],child=new Proxy({publish:value=>published.push(value)},{get:(target,key)=>target[key]||(()=>false)});
 const module={exports:{}};
 const require=name=>name==='electron'?{ipcMain:{handle(){}},screen:{on(){},removeListener(){}}}:
  ['./skill-window.cjs','./jungle-window.cjs','./hex-micro-windows.cjs','./window-peek.cjs','./window-resize.cjs'].includes(name)?()=>child:realRequire(name);
 vm.runInNewContext(source,{module,exports:module.exports,require,setInterval:()=>0,clearInterval(){},setTimeout,clearTimeout,process:{env:{}}},{filename:filename.pathname});
 const guide=module.exports({root:'.',getState:()=>({selection:{id:'Ashe',role:'bottom',mode:'rift'},clickThrough:true}),getModel,setState:async()=>{},isQuitting:()=>false,showMain(){},diagnostic:value=>diagnostics.push(value)});
 return {guide,published,diagnostics};
}
test('an unavailable restored guide cannot abort shortcut initialization or later publications',()=>{
 let reads=0;
 const {guide,published,diagnostics}=controller(()=>{reads++;throw Error('Saved guide reference is unavailable');});
 assert.doesNotThrow(()=>guide.setInteractionHotkey(true));
 assert.equal(reads,1);
 assert.equal(published.at(-1).model,null);
 assert.equal(published.at(-1).mousePassThrough,false);
 assert.match(diagnostics[0],/Saved guide reference is unavailable/);
 assert.doesNotThrow(()=>guide.publish());
 assert.equal(reads,2);
 guide.destroy();
});
test('one publication computes the guide once and uses that same model for mouse handling',()=>{
 let reads=0;
 const model={live:{matched:true}};
 const {guide,published}=controller(()=>{reads++;return model;});
 guide.setInteractionHotkey(true);
 assert.equal(reads,1);
 assert.equal(published.at(-1).model,model);
 assert.equal(published.at(-1).mousePassThrough,true);
 guide.destroy();
});
