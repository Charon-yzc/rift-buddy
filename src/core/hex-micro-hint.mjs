// Keep action conditions ahead of effect text; provenance belongs in the app.
export function hexMicroHint(route,entry,kind){
 const selection=kind==='augment'?(entry.owned?'已选。':route.state==='offered'?'本轮若选。':entry.core?'需选到。':'参考。')+(entry.catalogDisabled?'目录停用；':''):'';
 const equipment=route.kind==='item-synergy'?(route.equipmentState==='suggested'?'若购买，':route.equipmentState==='held'?'已装备，仍需触发。':route.equipmentState==='mixed'?'装备状态分项核对。':'方案装备，非已购确认。'):'';
 const condition=selection+equipment;
 return {name:(entry.core?'核心 · ':'')+entry.name,brief:condition+(entry.brief||'效果待核对')};
}
