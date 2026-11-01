// Display-only label: never modify or persist the underlying room/plan object.
export function attributeReference(plan,currentPatch,compact=false){
 if(!Array.isArray(plan?.priority)||!plan.priority.length)return '';
 const valid=v=>typeof v==='string'&&/^\d+\.\d+$/.test(v);
 const source=valid(plan.patch)?plan.patch:null,current=valid(currentPatch)?currentPatch:null;
 let label='版本未知参考',short='版本未知';
 if(source){
  if(!current){label=source+'参考（当前版本未知）';short=source+'待核';}
  else{const [a,b]=source.split('.').map(Number),[c,d]=current.split('.').map(Number),order=a-c||b-d;label=source+(order<0?'旧参考':order>0?'非当前参考':'参考');short=source+(order<0?'旧':order>0?'异版':'参考');}
 }
 if(compact)return plan.priority.join('›')+' · '+short;
 return label+'（可自行调整） · '+plan.priority.join(' › ');
}
// Opening order and maxing priority are different decisions; keep both visible.
export function skillSummary(model,{wrong=false}={}){
 if(wrong)return {text:'—',detail:'当前英雄或方案不符，请核对后查看加点。'};
 const m=model||{},attrs=m.attributePlan?.priority;
 if(attrs?.length){const patch=typeof m.version==='string'&&/^\d+\.\d+\.\d+$/.test(m.version)?m.version.split('.').slice(0,2).join('.'):null,text=attributeReference(m.attributePlan,patch,true),detail=attributeReference(m.attributePlan,patch);return {text,detail:detail+'；'+(m.attributePlan.note||'属性升级参考')};}
 const opening=String(m.skillOrder||m.first||'').slice(0,3),priority=String(m.priority||'').replace(/[^QWER]/g,'');
 const text=[/^[QWER]{3}$/.test(opening)?opening.split('').join('→'):'—',priority?`主${priority[0]}${priority[1]?' 副'+priority[1]:''}`:''].filter(Boolean).join(' · ');
 return {text,detail:[m.nextSkill?'当前可升 '+m.nextSkill:'',m.skillAdvice?.reason,m.skillStale?'旧版加点参考':''].filter(Boolean).join('；')||'前三级顺序 · 优先点满；升级由你操作。'};
}
