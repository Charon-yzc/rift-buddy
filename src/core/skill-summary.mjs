// Opening order and maxing priority are different decisions; keep both visible.
export function skillSummary(model,{wrong=false}={}){
 if(wrong)return {text:'—',detail:'当前英雄或方案不符，请核对后查看加点。'};
 const m=model||{},attrs=m.attributePlan?.priority;
 if(attrs?.length)return {text:attrs.join(' › '),detail:m.attributePlan.note||'属性升级参考'};
 const opening=String(m.skillOrder||m.first||'').slice(0,3),priority=String(m.priority||'').replace(/[^QWER]/g,'');
 const text=[/^[QWER]{3}$/.test(opening)?opening.split('').join('→'):'—',priority?`主${priority[0]}${priority[1]?' 副'+priority[1]:''}`:''].filter(Boolean).join(' · ');
 return {text,detail:[m.nextSkill?'当前可升 '+m.nextSkill:'',m.skillAdvice?.reason,m.skillStale?'旧版加点参考':''].filter(Boolean).join('；')||'前三级顺序 · 优先点满；升级由你操作。'};
}
