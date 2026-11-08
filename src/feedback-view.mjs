import {escape as e,button} from './ui.mjs';
export function feedbackDialog({text='',images=[],busy=false,submitting=false,error='',sent=''}={}){
 return `<div class="modal-backdrop" data-backdrop="true"><section class="modal feedback-dialog" role="dialog" aria-modal="true" aria-label="反馈"><header class="modal-header"><h2>反馈</h2>${button('close','','close','quiet icon-only','aria-label="关闭"')}</header><div class="panel-body">${sent?`<p role="status">已收到，谢谢。<small class="feedback-id">编号 ${e(sent)}</small></p>`:`<label for="feedback-text">遇到了什么问题？</label><textarea id="feedback-text" rows="4" maxlength="2000" placeholder="发生了什么，怎样重现…" ${busy?'disabled':''}>${e(text)}</textarea><div class="feedback-images">${images.map((image,i)=>`<figure><img src="${e(image.preview)}" alt="待发送截图 ${i+1}"/><button data-action="feedback-remove" data-id="${e(image.id)}" aria-label="移除截图 ${i+1}" ${busy?'disabled':''}>×</button></figure>`).join('')}</div><div class="feedback-tools">${button('feedback-images',images.length?'更换截图':'添加截图','','small',busy?'disabled':'')}<small>最多3张 · 合计10MB</small></div><p class="feedback-notice">仅发送填写的文字、所选截图和软件版本，保存7天。请先遮挡个人信息。</p>${error?`<p class="feedback-error" role="alert">${e(error)}</p>`:''}<div class="detail-actions">${button('feedback-send',busy&&submitting?'发送中…':'发送反馈','','primary',busy||!text.trim()&&!images.length?'disabled':'')}</div>`}</div></section></div>`;
}

export function createFeedbackUI({overlay,api}){
 let state={},epoch=0;
 const active=()=>!!overlay.querySelector('.feedback-dialog'),text=()=>overlay.querySelector('#feedback-text')?.value??state.text??'',render=()=>{overlay.innerHTML=feedbackDialog(state);};
 overlay.addEventListener('input',event=>{
  if(event.target.id!=='feedback-text'||!active()||state.busy)return;
  state.text=event.target.value;const send=overlay.querySelector('[data-action="feedback-send"]');
  if(send)send.disabled=!state.text.trim()&&!state.images?.length;
 });
 async function action(name,element){
  if(name==='feedback-open'){
   if(!api.feedbackImages){state={error:'请使用桌面版发送反馈'};render();return;}
   const serial=++epoch;state={text:'',images:[],busy:true};render();
   try{await api.feedbackClear();}catch(error){if(serial===epoch&&active())state.error=error.message;}
   if(serial!==epoch||!active())return;
   state.busy=false;render();overlay.querySelector('textarea')?.focus();return;
  }
  if(!active()||state.busy)return;state={...state,text:text(),error:''};
  if(name==='feedback-remove'){state.images=state.images.filter(i=>i.id!==element.dataset.id);render();return;}
  if(name==='feedback-send'&&!state.text.trim()&&!state.images?.length)return;
  const serial=++epoch;state.busy=true;state.submitting=name==='feedback-send';render();
  try{
   if(name==='feedback-images'){const images=await api.feedbackImages();if(serial!==epoch||!active())return;if(images)state.images=images;}
   if(name==='feedback-send'){const result=await api.feedbackSend({text:state.text,images:state.images.map(i=>i.id),consent:true});if(serial!==epoch||!active())return;state={sent:result.id};}
  }catch(error){if(serial!==epoch||!active())return;state.error=error.message;}
  finally{if(serial===epoch&&active()){state.busy=false;render();}}
 }
 return {action};
}
