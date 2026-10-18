// Preserve the fast explicit hero click when a source filter has no cache.
// The first operation only hovers; generic fallback runes are never written
// while waiting for the selected provider. An existing/offline reference or
// an explicitly selected mechanism route remains immediately usable.
export async function prepareHeroWithSource({build,canRefresh,apply,refresh,snapshot,operationSnapshot=snapshot,rebuild}){
 const needsSource=canRefresh&&build.mode==='rift'&&!build.reference&&build.loadoutId==='default'&&!build.sharedEquipment;
 if(!needsSource)return apply(false);
 const operation=operationSnapshot(),hovered=await apply(true);if(hovered?.steps?.hover?.status!=='done')return hovered;
 // Hover may succeed in the old draft while its follow-up sync observes a
 // new one. Do not adopt that new identity and continue an old explicit click.
 if(operation!==operationSnapshot())throw Error('选人或配置已变化，请按当前英雄重新选择配置');
 const context=snapshot(),reference=await refresh();
 if(!reference)throw Error('英雄已选好，所选来源暂未取得；请刷新配置后再应用');
 if(context!==snapshot())throw Error('英雄已选好，但选人或配置已变化；请查看当前方案再应用');
 const next=rebuild();if(!next.reference)throw Error('英雄已选好，来源尚未匹配本次筛选；请重新核对');
 return apply(false);
}
