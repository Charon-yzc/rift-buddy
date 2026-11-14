// Exercise the actual feedback DOM without bootstrapping the app or its live APIs.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const results=[],blockedRequests=[];let root,win;
async function run(){
 await fs.mkdir(path.resolve('.local'),{recursive:true});root=await fs.mkdtemp(path.resolve('.local/feedback-interaction-'));app.setPath('userData',path.join(root,'profile'));
 const source=path.resolve(process.env.RIFT_BUDDY_SMOKE_APP||'.'),url=file=>pathToFileURL(path.join(source,file)).href;
 await fs.writeFile(path.join(root,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><link rel="stylesheet" href="${url('src/styles.css')}"><link rel="stylesheet" href="${url('src/feedback.css')}"><body><button id="background">主界面按钮</button><button data-action="feedback-open">反馈</button><div id="overlay-root"></div><script type="module">
 import {createFeedbackUI} from ${JSON.stringify(url('src/feedback-view.mjs'))};
 const overlay=document.querySelector('#overlay-root'),f=window.feedbackFixture={cooldown:0,images:[],calls:{clear:0,choices:0,sends:[]}};
 f.wait=name=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});f[name]={promise,resolve,reject};};
 f.finish=(name,value,error=false)=>{const pending=f[name];delete f[name];if(error)pending.reject(Error(value));else pending.resolve(value);};
 const ui=createFeedbackUI({overlay,api:{feedbackClear:()=>{f.calls.clear++;if(f.clearWait)f.clearWait.entered=true;return f.clearWait?.promise;},feedbackStatus:()=>{if(f.statusWait)f.statusWait.entered=true;return f.statusWait?.promise??Promise.resolve({retryAfterMs:f.cooldown});},feedbackImages:()=>{f.calls.choices++;return f.choiceWait?.promise??Promise.resolve(f.images);},feedbackSend:payload=>{f.calls.sends.push(payload);return f.sendWait?.promise??Promise.resolve({id:'isolated-receipt'});}}});
 document.addEventListener('click',event=>{const el=event.target.closest('[data-action]');if(!el)return;if(el.dataset.action==='close'){overlay.innerHTML='';return;}if(el.dataset.action.startsWith('feedback-'))f.pending=ui.action(el.dataset.action,el);});
 f.ready=true;
 </script></body></html>`);
 await app.whenReady();win=new BrowserWindow({show:false,width:1000,height:760,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,callback)=>{blockedRequests.push(details.url);callback({cancel:true});});
 await win.loadFile(path.join(root,'index.html'));
 const js=code=>win.webContents.executeJavaScript(code,true),until=async(code,label)=>{for(let i=0;i<80;i++){if(await js(code))return;await delay(25);}throw Error(label);};
 const click=selector=>js(`{const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw Error('Missing control');element.focus();element.click();}`),settled=()=>js('feedbackFixture.pending'),check=async(label,code)=>{results.push({label,passed:!!await js(code)});};
 const open=async()=>{await click('[data-action="feedback-open"]');await settled();};
 const type=async(value='原始问题 & <现象>：截图后继续编辑')=>js(`{const field=document.querySelector('#feedback-text');field.focus();field.value=${JSON.stringify(value)};field.dispatchEvent(new Event('input',{bubbles:true}));field.setSelectionRange(4,8,'backward');}`);
 await until('window.feedbackFixture?.ready','Feedback module did not load');await open();
 await check('opening focuses the empty editor and blocks empty sends','document.activeElement.id==="feedback-text"&&document.querySelector("[data-action=feedback-send]").disabled');
 await type('原始问题 & <现象>：截图后继续编辑\n'+Array.from({length:24},(_,i)=>'复现步骤 '+(i+1)).join('\n'));await js('document.querySelector("#feedback-text").scrollTop=80;feedbackFixture.scroll=document.querySelector("#feedback-text").scrollTop;feedbackFixture.draft=document.querySelector("#feedback-text").value;feedbackFixture.wait("choiceWait")');await click('[data-action="feedback-images"]');
 await check('chooser pending locks editing without claiming submission','document.querySelector("#feedback-text").disabled&&!document.querySelector("[data-action=feedback-send]").textContent.includes("发送中")');
 await js('feedbackFixture.finish("choiceWait",null)');await settled();
 await check('cancelling the chooser preserves the draft, caret and scroll','document.querySelector("#feedback-text").value===feedbackFixture.draft&&document.querySelector("#feedback-text").selectionStart===4&&document.querySelector("#feedback-text").selectionEnd===8&&document.querySelector("#feedback-text").selectionDirection==="backward"&&feedbackFixture.scroll>0&&document.querySelector("#feedback-text").scrollTop===feedbackFixture.scroll');
 await check('cancelling the chooser returns keyboard focus to its button','document.activeElement.dataset.action==="feedback-images"');
 await js('feedbackFixture.images=[{id:"mock-a",preview:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII="},{id:"mock-b",preview:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII="}]');await click('[data-action="feedback-images"]');await settled();
 await check('adding screenshots keeps the editor range and keyboard focus','document.querySelectorAll(".feedback-images figure").length===2&&document.querySelector("#feedback-text").value===feedbackFixture.draft&&document.querySelector("#feedback-text").selectionStart===4&&document.activeElement.dataset.action==="feedback-images"');
 await click('[data-action="feedback-remove"][data-id="mock-a"]');await settled();
 await check('removing a screenshot keeps keyboard focus in the dialog','document.querySelectorAll(".feedback-images figure").length===1&&document.activeElement.dataset.action==="feedback-images"');
 await click('[data-action="feedback-remove"][data-id="mock-b"]');await settled();
 await check('removing the last screenshot preserves a sendable text draft','!document.querySelector(".feedback-images figure")&&!document.querySelector("[data-action=feedback-send]").disabled&&feedbackFixture.calls.sends.length===0');
 await js('feedbackFixture.wait("choiceWait")');await click('[data-action="feedback-images"]');await click('[data-action="close"]');await open();await type('新弹窗的草稿');await js('feedbackFixture.finish("choiceWait",[{id:"stale",preview:"data:image/png;base64,"}])');await delay(30);
 await check('late screenshot reply cannot replace a reopened draft','document.querySelector("#feedback-text").value==="新弹窗的草稿"&&!document.querySelector(".feedback-images figure")');
 await js('feedbackFixture.wait("choiceWait")');await click('[data-action="feedback-images"]');await js('document.querySelector("[data-action=close]").focus();feedbackFixture.finish("choiceWait",null)');await settled();
 await check('chooser completion respects a close button focused while waiting','document.activeElement.dataset.action==="close"');
 await type('失败后继续补充这个问题');await js('feedbackFixture.wait("sendWait");feedbackFixture.cooldown=1000');await click('[data-action="feedback-send"]');
 await check('pending submission shows sending and prevents double send','document.querySelector("[data-action=feedback-send]").disabled&&document.querySelector("[data-action=feedback-send]").textContent==="发送中…"&&feedbackFixture.calls.sends.length===1');
 await js('feedbackFixture.finish("sendWait","Error invoking remote method \'feedback-send\': Error: 发送未完成，请稍后重试",true)');await settled();
 await check('failed submission keeps a usable editor and clear reason','document.querySelector("#feedback-text").value==="失败后继续补充这个问题"&&document.querySelector("#feedback-text").selectionStart===4&&document.activeElement.id==="feedback-text"&&document.querySelector(".feedback-error").textContent==="发送未完成，请稍后重试"&&document.querySelector("[data-action=feedback-send]").disabled');
 await js('feedbackFixture.field=document.querySelector("#feedback-text")');await delay(1050);
 await check('cooldown completion leaves the editor and caret untouched','document.querySelector("#feedback-text")===feedbackFixture.field&&document.activeElement===feedbackFixture.field&&feedbackFixture.field.selectionStart===4&&!document.querySelector("[data-action=feedback-send]").disabled');
 await click('[data-action="feedback-send"]');await settled();
 await check('successful retry confirms receipt and focuses close','document.querySelector("[role=status]").textContent.includes("isolated-receipt")&&document.activeElement.dataset.action==="close"&&feedbackFixture.calls.sends.length===2');
 await click('[data-action="close"]');await js('feedbackFixture.cooldown=0');await open();
 await check('reopening starts a clean draft','document.querySelector("#feedback-text").value===""&&!document.querySelector(".feedback-images figure")&&!document.querySelector(".feedback-error")');
 await type('旧的发送请求');await js('feedbackFixture.wait("sendWait")');await click('[data-action="feedback-send"]');await click('[data-action="close"]');await open();await type('新的草稿不应变成已发送');await js('feedbackFixture.finish("sendWait",{id:"old-receipt"})');await delay(30);
 await check('late send reply cannot mark a reopened draft sent','document.querySelector("#feedback-text").value==="新的草稿不应变成已发送"&&!document.querySelector("[role=status]")');
 await click('[data-action="close"]');await js('feedbackFixture.wait("clearWait")');await click('[data-action="feedback-open"]');await click('[data-action="close"]');await js('feedbackFixture.finish("clearWait")');await settled();
 await check('late prepare reply cannot reopen a closed dialog','!document.querySelector(".feedback-dialog")');
 for(const wait of ['clearWait','statusWait'])for(const destination of ['close','outside','launcher','replacement','closed']){
  await js(`feedbackFixture.wait(${JSON.stringify(wait)})`);await click('[data-action="feedback-open"]');await until(`feedbackFixture[${JSON.stringify(wait)}]?.entered`,'Opening did not reach '+wait);
  if(destination==='close')await js('document.querySelector("[data-action=close]").focus()');
  if(destination==='outside')await js('document.querySelector("#background").focus()');
  if(destination==='replacement')await js('document.querySelector("#overlay-root").innerHTML="<section class=other-dialog><input id=other-dialog-field></section>";document.querySelector("#other-dialog-field").focus()');
  if(destination==='closed')await click('[data-action="close"]');
  await js(`feedbackFixture.finish(${JSON.stringify(wait)},${wait==='statusWait'?'{retryAfterMs:0}':'undefined'})`);await settled();
  const expected=destination==='close'?'document.activeElement.dataset.action==="close"':destination==='outside'?'document.activeElement.id==="background"':destination==='launcher'?'document.activeElement.id==="feedback-text"':destination==='replacement'?'document.activeElement.id==="other-dialog-field"&&!document.querySelector(".feedback-dialog")':'!document.querySelector(".feedback-dialog")';
  await check(`opening after ${wait} respects ${destination} focus`,expected);await js('document.querySelector("#overlay-root").innerHTML=""');
 }
 const result={passed:results.every(r=>r.passed),source,checks:results,actualFeedbackUploads:false,actualScreenshotPicker:false,blockedRequests,root};
 await fs.writeFile(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));assert.equal(result.passed,true,'Feedback interaction checks failed');app.quit();
}
run().catch(async error=>{console.error(error);if(root)await fs.writeFile(path.join(root,'error.txt'),error.stack).catch(()=>{});app.exit(1);});
