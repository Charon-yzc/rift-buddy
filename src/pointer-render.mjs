// A status/recommendation arriving between pointerdown and click must not
// replace the button under the player. This delays painting, never the action.
export function holdRenderDuringPointer({document,root,render,setTimer=setTimeout,clearTimer=clearTimeout}){
 let pressed=null,pending=false,timer=null;
 const release=()=>{clearTimer(timer);timer=null;pressed=null;if(pending){pending=false;render();}};
 const afterClick=()=>{if(!pressed)return;clearTimer(timer);timer=setTimer(release,0);};
 document.addEventListener('pointerdown',event=>{
  if(event.button!==0||event.isPrimary===false)return;
  const button=event.target.closest?.('button[data-action="build"][data-id],button[data-action="companion-preview"][data-id],button[data-action="hex-quick-pick"],[data-drag-role],[data-drag-cell]');
  if(!button||!root.contains(button)||button.disabled)return;
  clearTimer(timer);timer=null;pressed=button;
 },true);
 // The click listener releases after all click handlers have captured their
 // target. Pointerup also covers releasing outside the app without a click.
 document.addEventListener('click',afterClick,true);
 document.addEventListener('pointerup',()=>{if(pressed){clearTimer(timer);timer=setTimer(release,100);}},true);
 document.addEventListener('pointercancel',afterClick,true);
 document.addEventListener('dragend',afterClick,true);
 document.defaultView?.addEventListener('blur',afterClick);
 return {defer(){if(!pressed)return false;if(!pressed.isConnected){clearTimer(timer);timer=null;pressed=null;pending=false;return false;}pending=true;return true;}};
}
