module.exports=function buildFixture(ref,data){
 const row=(key,ids)=>['$','tr',key,{children:ids.map(id=>({metaType:'item',metaId:Number(id)}))}];
 const champ=data.champions.find(c=>c.id===ref.champion);
 const nodes=[{championId:champ.key,position:{bottom:'adc',mid:'mid',support:'support',top:'top',jungle:'jungle'}[ref.role],patch:ref.patch,region:'global',tier:'emerald_plus',type:'ranked'},
  {rune_pages:ref.runeOptions.map(r=>({play:r.samples,importClientData:r.page}))},
  ...ref.core.map((r,n)=>row('core_items_'+n,r.items)),...ref.boots.map((r,n)=>row('boots_'+n,r.items)),...ref.start.map((r,n)=>row('starter_items_'+n,r.items)),
  ...ref.later.flatMap((rows,n)=>rows.map((r,i)=>row('depth_'+(n+4)+'_item_'+i,r.items))),
  ...(ref.priority||'').split('').map(k=>({metaType:'skill',metaId:ref.champion.toLowerCase(),extraData:k})),
  ...(ref.summoners||[]).map(id=>({metaType:'spell',metaId:Number(data.spells[id].key)}))];
 return '<script>self.__next_f.push([1,'+JSON.stringify(nodes.map((v,n)=>n.toString(16)+':'+JSON.stringify(v)).join('\n'))+'])</script>';
};
