// A status/recommendation arriving between pointerdown and click must not
// replace the button under the player. This delays painting, never the action.
export function holdRenderDuringPointer({document,root,render,selector='button[data-action="build"][data-id],button[data-action="companion-preview"][data-id],button[data-action="hex-quick-pick"],button[data-action="configuration-switch"],[data-drag-role],[data-drag-cell],#familiarity-mass',compositionSelector='',compositionContext=()=>null,setTimer=setTimeout,clearTimer=clearTimeout}){
 let pressed=null,composing=null,composingScope=null,pending=false,timer=null;
 const validComposition=()=>composing?.isConnected&&root.contains(composing)&&document.activeElement===composing&&compositionContext()===composingScope;
 const clearComposition=()=>{if(composing){composing.removeEventListener('compositionend',endComposition,true);composing.removeEventListener('blur',endComposition,true);}composing=null;composingScope=null;};
 const flush=()=>{if(composing&&!validComposition())clearComposition();if(!pressed&&!composing&&pending){pending=false;render();}};
 const endComposition=event=>{if(!composing||event&&event.target!==composing)return;clearComposition();queueMicrotask(flush);};
 const release=()=>{clearTimer(timer);timer=null;pressed=null;flush();};
 const afterClick=()=>{if(!pressed)return;clearTimer(timer);timer=setTimer(release,0);};
 document.addEventListener('pointerdown',event=>{
  if(event.button!==0||event.isPrimary===false)return;
  const button=event.target.closest?.(selector)||(composing&&event.target.closest?.('button[data-action],input,select,textarea,summary,a[href]'));
  if(!button||!root.contains(button)||button.disabled)return;
  clearTimer(timer);timer=null;pressed=button;
 },true);
 // The click listener releases after all click handlers have captured their
 // target. Pointerup also covers releasing outside the app without a click.
 document.addEventListener('click',afterClick,true);
 document.addEventListener('pointerup',()=>{if(pressed){clearTimer(timer);timer=setTimer(release,100);}},true);
 document.addEventListener('pointercancel',afterClick,true);
 document.addEventListener('dragend',afterClick,true);
 if(compositionSelector){
  document.addEventListener('compositionstart',event=>{const element=event.target.closest?.(compositionSelector);if(!element||!root.contains(element)||element.disabled)return;clearComposition();composing=element;composingScope=compositionContext();element.addEventListener('compositionend',endComposition,true);element.addEventListener('blur',endComposition,true);},true);
  document.addEventListener('compositionend',endComposition,true);document.addEventListener('focusout',endComposition,true);
 }
 document.defaultView?.addEventListener('blur',()=>{endComposition();afterClick();});
 return {invalidate(){clearTimer(timer);timer=null;pressed=null;clearComposition();pending=false;},defer(){if(pressed&&!pressed.isConnected){clearTimer(timer);timer=null;pressed=null;}if(composing&&!validComposition())clearComposition();if(!pressed&&!composing){pending=false;return false;}pending=true;return true;}};
}
