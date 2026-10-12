export const windowResizeGrip='<button class="window-resize-grip" data-window-resize aria-label="调整窗口大小" title="拖动调整大小；拖动顶部移动窗口。">◢</button>';
export function installWindowResize(root,control){
 let pointer=null,chain=Promise.resolve();
 const send=(action,value)=>{chain=chain.catch(()=>{}).then(()=>control(action,value)).catch(error=>{root.title=error.message||'调整未完成';});};
 root.addEventListener('pointerdown',event=>{if(!event.target.closest('[data-window-resize]')||event.button!==0)return;event.preventDefault();pointer=event.pointerId;root.setPointerCapture(pointer);send('resize-start');});
 root.addEventListener('pointermove',event=>{if(event.pointerId===pointer)send('resize');});
 const end=event=>{if(event.pointerId!==pointer)return;pointer=null;send('resize-end');};
 root.addEventListener('pointerup',end);root.addEventListener('pointercancel',end);root.addEventListener('lostpointercapture',end);
 window.addEventListener('blur',()=>{if(pointer!==null){pointer=null;send('resize-end');}});
 root.addEventListener('keydown',event=>{if(!event.target.closest('[data-window-resize]')||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();send('resize-key',{axis:['ArrowLeft','ArrowRight'].includes(event.key)?'width':'height',delta:['ArrowLeft','ArrowUp'].includes(event.key)?-10:10});});
}
