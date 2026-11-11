import {escape as e,button} from './ui.mjs';
const feedbackError=error=>String(error?.message||'反馈操作未完成，请重试').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,'');
export function feedbackDialog({text='',images=[],busy=false,submitting=false,error='',sent='',retrySeconds=0}={}){
 return `<div class="modal-backdrop" data-backdrop="true"><section class="modal feedback-dialog" role="dialog" aria-modal="true" aria-label="反馈"><header class="modal-header"><h2>反馈</h2>${button('close','','close','quiet icon-only','aria-label="关闭"')}</header><div class="panel-body">${sent?`<p role="status">已收到，谢谢。<small class="feedback-id">编号 ${e(sent)}</small></p>`:`<label for="feedback-text">遇到了什么问题？</label><textarea id="feedback-text" rows="4" maxlength="2000" placeholder="发生了什么，怎样重现…" ${busy?'disabled':''}>${e(text)}</textarea><div class="feedback-images">${images.map((image,i)=>`<figure><img src="${e(image.preview)}" alt="待发送截图 ${i+1}"/><button data-action="feedback-remove" data-id="${e(image.id)}" aria-label="移除截图 ${i+1}" ${busy?'disabled':''}>×</button></figure>`).join('')}</div><div class="feedback-tools">${button('feedback-images',images.length?'更换截图':'添加截图','','small',busy?'disabled':'')}<small>最多3张 · 合计10MB</small></div><p class="feedback-notice">仅发送填写的文字、所选截图和软件版本，保存7天。请先遮挡个人信息。</p>${error?`<p class="feedback-error" role="alert">${e(error)}</p>`:''}<div class="detail-actions">${button('feedback-send',busy&&submitting?'发送中…':retrySeconds?retrySeconds+' 秒后重试':'发送反馈','','primary',busy||retrySeconds>0||!text.trim()&&!images.length?'disabled':'')}</div>`}</div></section></div>`;
}

export function createFeedbackUI({overlay,api}){
 let state={},epoch=0,cooldownTimer;
 const remaining=()=>Math.max(0,Math.ceil(((state.retryAt||0)-Date.now())/1000));
 function refreshCooldown(){
  clearTimeout(cooldownTimer);if(!active())return;const send=overlay.querySelector('[data-action="feedback-send"]');if(!send)return;const seconds=remaining();
  send.disabled=!!state.busy||seconds>0||!text().trim()&&!state.images?.length;
  send.textContent=state.busy&&state.submitting?'发送中…':seconds?seconds+' 秒后重试':'发送反馈';
  if(seconds)cooldownTimer=setTimeout(refreshCooldown,Math.min(1000,Math.max(1,state.retryAt-Date.now())));
 }
 async function readCooldown(serial){
  try{const value=await api.feedbackStatus?.();if(serial===epoch&&active()){const ms=Number(value?.retryAfterMs);state.retryAt=Date.now()+(Number.isFinite(ms)?Math.max(0,Math.min(30000,ms)):0);}}catch{}
 }
 const active=()=>!!overlay.querySelector('.feedback-dialog'),text=()=>overlay.querySelector('#feedback-text')?.value??state.text??'';
 function render(fallbackFocus){
  const editor=overlay.querySelector('#feedback-text'),document=overlay.ownerDocument,focused=document?.activeElement;
  const selection=editor&&{start:editor.selectionStart,end:editor.selectionEnd,direction:editor.selectionDirection,scroll:editor.scrollTop};
  let focus=fallbackFocus;
  if(overlay.contains?.(focused))focus=focused.id==='feedback-text'?{editor:true}:focused.dataset?.action?{action:focused.dataset.action,id:focused.dataset.id}:null;
  else if(focused&&focused!==document?.body)focus=null;
  overlay.innerHTML=feedbackDialog({...state,retrySeconds:remaining()});refreshCooldown();
  const nextEditor=overlay.querySelector('#feedback-text');
  if(selection&&nextEditor){if(Number.isInteger(selection.start))nextEditor.setSelectionRange?.(selection.start,selection.end,selection.direction);nextEditor.scrollTop=selection.scroll;}
  if(focus){
   let target=focus.editor?nextEditor:Array.from(overlay.querySelectorAll?.('[data-action]')||[]).find(element=>element.dataset.action===focus.action&&element.dataset.id===focus.id);
   if(!target&&focus.action==='feedback-remove')target=overlay.querySelector('[data-action="feedback-images"]');
   if(target?.disabled)target=nextEditor;
   if(state.sent)target=overlay.querySelector('[data-action="close"]');
   if(!target?.disabled)target?.focus({preventScroll:true});
  }
  return focus;
 }
 overlay.addEventListener('input',event=>{
  if(event.target.id!=='feedback-text'||!active()||state.busy)return;
  state.text=event.target.value;refreshCooldown();
 });
 async function action(name,element){
  if(name==='feedback-open'){
   if(!api.feedbackImages){state={error:'请使用桌面版发送反馈'};render();return;}
   clearTimeout(cooldownTimer);const serial=++epoch;state={text:'',images:[],busy:true};render();const openingFocus=overlay.ownerDocument?.activeElement;
   try{await api.feedbackClear();}catch(error){if(serial===epoch&&active())state.error=feedbackError(error);}
   if(serial!==epoch||!active())return;await readCooldown(serial);if(serial!==epoch||!active())return;
   const focusUnchanged=overlay.ownerDocument?.activeElement===openingFocus;
   state.busy=false;render();if(focusUnchanged)overlay.querySelector('textarea')?.focus();return;
  }
  if(!active()||state.busy)return;state={...state,text:text(),error:''};
  if(name==='feedback-remove'){state.images=state.images.filter(i=>i.id!==element.dataset.id);render();return;}
  if(name==='feedback-send'&&(remaining()>0||!state.text.trim()&&!state.images?.length))return;
  const serial=++epoch;state.busy=true;state.submitting=name==='feedback-send';const returnFocus=render();
  try{
   if(name==='feedback-images'){const images=await api.feedbackImages();if(serial!==epoch||!active())return;if(images)state.images=images;}
   if(name==='feedback-send'){const result=await api.feedbackSend({text:state.text,images:state.images.map(i=>i.id),consent:true});if(serial!==epoch||!active())return;state={sent:result.id};}
  }catch(error){if(serial!==epoch||!active())return;state.error=feedbackError(error);if(name==='feedback-send')await readCooldown(serial);}
  finally{if(serial===epoch&&active()){state.busy=false;render(returnFocus);}}
 }
 return {action};
}
