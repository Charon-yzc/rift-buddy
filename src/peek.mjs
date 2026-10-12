const button=document.getElementById('restore'),api=window.windowPeek;
function render(value){button.textContent=value.side==='left'?'›':'‹';button.title='展开'+value.title+' · 恢复收起前的大小和位置';button.setAttribute('aria-label','展开'+value.title);document.body.dataset.side=value.side;}
button.addEventListener('click',()=>api.restore().catch(error=>{button.title=error.message;}));api.onUpdate(render);render(await api.bootstrap());
