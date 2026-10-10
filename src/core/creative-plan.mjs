import {RULES_PATCH,RULES_VERSION} from './rules.mjs';
import {fingerprint} from './catalog-review.mjs';
import {curatedDescriptor,validateSavedCurated} from './curated-plan.mjs';
import {TEMPOS} from './strategy.mjs';

const roles=['top','jungle','mid','bottom','support'];
const archetypes=['chain','poke','dive','protect','mixed','cooperation','shared','curated'];
const tempos=['early','teamfight','protect','poke','growth'];
const hero=id=>typeof id==='string'&&/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(id);
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const memberKey=m=>m.role+':'+m.champion;
const content=plan=>Object.fromEntries([...['schema','archetype','archetypeName','name','tempo','members','ordered','why','plan','steps','window','caution','feasibility','patch','dataVersion','rulesVersion'],...(plan.archetype==='cooperation'?['cooperation']:plan.archetype==='shared'?['shared']:plan.archetype==='curated'?['curated']:[])].map(key=>[key,plan[key]]));
export const creativePlanId=plan=>'creative-'+plan.archetype+'-'+fingerprint(content(plan));

// Keep the original conditional interactions with the saved member pages.
// A future rules update must not silently rewrite an accepted plan.
function savedCooperation(value,members){
 if(!value||!Array.isArray(value.members)||JSON.stringify(value.members)!==JSON.stringify(members)||!Array.isArray(value.edges)||value.edges.length<members.length-1||value.edges.length>3)throw Error('机制搭配成员与联动不一致');
 const ids=new Set(members.map(m=>m.champion)),seen=new Set(),edges=value.edges.map(edge=>{
  if(!edge||!ids.has(edge.a)||!ids.has(edge.b)||edge.a===edge.b||typeof edge.current!=='boolean'||!tempos.includes(edge.tempo))throw Error('机制搭配联动格式不正确');
  const pair=[edge.a,edge.b].sort().join(':');if(seen.has(pair))throw Error('机制搭配联动重复');seen.add(pair);
  const result={a:edge.a,b:edge.b,current:edge.current,tempo:edge.tempo};
  if(edge.control!==undefined){if(typeof edge.control!=='boolean')throw Error('机制搭配控制条件不正确');result.control=edge.control;}
  for(const [field,max] of [['id',120],['family',40],['name',80],['step',400],['condition',400],['failure',400],['patch',30],['reviewedAt',40]]){if(!text(edge[field],max))throw Error('机制搭配联动内容不完整');result[field]=edge[field];}
  if(!Array.isArray(edge.sourceUrls)||edge.sourceUrls.length>2||edge.sourceUrls.some(url=>typeof url!=='string'||!/^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/[0-9.]+\/data\/en_US\/champion\/[A-Za-z][A-Za-z0-9]{0,39}\.json$/.test(url)))throw Error('机制搭配技能来源不正确');
  result.sourceUrls=[...edge.sourceUrls];return result;
 });
 if(!edges.some(e=>e.current)||members.some(m=>!edges.some(e=>e.a===m.champion||e.b===m.champion)))throw Error('机制搭配缺少成员联动');
 const result={members:members.map(m=>({...m})),edges};
 if(value.opening!==undefined||value.economy!==undefined||value.memberJobs!==undefined){
  if(!text(value.opening,700)||!text(value.economy,500)||!Array.isArray(value.memberJobs)||value.memberJobs.length!==members.length)throw Error('机制搭配开局与经济分工不完整');
  const jobs=new Map();for(const job of value.memberJobs){if(!members.some(m=>memberKey(m)===memberKey(job))||jobs.has(memberKey(job))||!text(job.job,700))throw Error('机制搭配分工与成员不一致');jobs.set(memberKey(job),job.job);}
  result.opening=value.opening;result.economy=value.economy;result.memberJobs=members.map(m=>({...m,job:jobs.get(memberKey(m))}));
 }
 if(value.relaySteps!==undefined){if(!result.memberJobs||!Array.isArray(value.relaySteps)||value.relaySteps.length!==members.length||!value.relaySteps.every(step=>text(step,400)))throw Error('机制搭配整体接力不完整');result.relaySteps=[...value.relaySteps];}
 for(const [field,max] of [['name',100],['sourceNote',300],['patch',30],['reviewedAt',40]]){if(!text(value[field],max))throw Error('机制搭配说明不完整');result[field]=value[field];}
 if(!tempos.includes(value.tempo))throw Error('机制搭配节奏不正确');result.tempo=value.tempo;
 result.steps=result.relaySteps||edges.map(e=>e.step);result.conditions=edges.map(e=>e.condition);result.failures=edges.map(e=>e.failure);result.why=result.steps.join(' ');result.sourceUrls=[...new Set(edges.flatMap(e=>e.sourceUrls))];
 return result;
}

function cooperationDescriptor(source,data){
 const members=source.members.map(m=>({role:m.role,champion:m.champion})),cooperation=savedCooperation(source,members);
 return {archetype:'cooperation',archetypeName:'机制搭配',name:cooperation.name,tempo:cooperation.tempo,members,cooperation,
  ordered:cooperation.memberJobs||members.map(m=>({...m,job:cooperation.edges.filter(e=>[e.a,e.b].includes(m.champion)).map(e=>e.step).join(' ')})),
  why:cooperation.why,plan:cooperation.opening?[cooperation.opening,cooperation.economy].join(' '):'先确认双方技能与站位，再按已保存的联动顺序行动；任一成立条件不满足就停止强接。',steps:cooperation.steps,
  window:cooperation.conditions.join(' '),caution:cooperation.failures.join(' '),feasibility:cooperation.sourceNote,
  patch:cooperation.patch,dataVersion:data.version,rulesVersion:cooperation.reviewedAt};
}

// A shared tactical/resource plan contains no control edges and earns no
// mechanism bonus. Persist its reviewed jobs and original source identities.
function savedShared(value,members){
 if(!value||value.kind!=='shared'||!(members.length>=4?tempos:['poke','protect','growth']).includes(value.tempo)||value.bonus!==0||!Array.isArray(value.edges)||value.edges.length||JSON.stringify(value.members)!==JSON.stringify(members))throw Error('共同分工不能包含机制联动或加分');
 const result={kind:'shared',tempo:value.tempo,bonus:0,members:members.map(m=>({...m})),edges:[]};
 for(const [field,max] of [['name',100],['why',700],['sourceNote',300],['opening',700],['economy',500],['patch',30],['reviewedAt',40]]){if(!text(value[field],max))throw Error('共同分工说明不完整');result[field]=value[field];}
 const seen=new Set();if(!Array.isArray(value.memberJobs)||value.memberJobs.length!==members.length)throw Error('共同分工成员不完整');
 result.memberJobs=value.memberJobs.map(m=>{if(!members.some(member=>memberKey(member)===memberKey(m))||seen.has(memberKey(m))||!text(m.job,700))throw Error('共同分工与成员不一致');seen.add(memberKey(m));return {role:m.role,champion:m.champion,job:m.job};});
 for(const [field,count,max] of [['steps',3,400],['conditions',2,value.routes?400:200],['failures',2,value.routes?400:200]]){if(!Array.isArray(value[field])||value[field].length!==count||!value[field].every(v=>text(v,max)))throw Error('共同分工条件不完整');result[field]=[...value[field]];}
 if(JSON.stringify(value.relaySteps)!==JSON.stringify(result.steps))throw Error('共同分工步骤不一致');result.relaySteps=[...result.steps];
 if(value.routes!==undefined){
  if(members.length<4||!Array.isArray(value.routes)||value.routes.length!==2)throw Error('全队主备路线不完整');
  const ids=new Set();result.routes=value.routes.map(route=>{
   const saved={};for(const [field,max] of [['id',120],['label',100],['step',400],['condition',400],['failure',400]]){if(!text(route?.[field],max))throw Error('全队行动路线说明不完整');saved[field]=route[field];}
   if(route.tempo!==undefined){if(!tempos.includes(route.tempo))throw Error('全队行动路线节奏不正确');saved.tempo=route.tempo;}
   if(ids.has(saved.id))throw Error('全队行动路线重复');ids.add(saved.id);
   const jobs=new Map();if(!Array.isArray(route.memberJobs)||route.memberJobs.length!==members.length)throw Error('全队行动路线缺少成员分工');
   for(const m of route.memberJobs){if(!members.some(p=>memberKey(p)===memberKey(m))||jobs.has(memberKey(m))||!text(m.job,700))throw Error('全队行动路线分工不一致');jobs.set(memberKey(m),m.job);}
   saved.memberJobs=members.map(m=>({...m,job:jobs.get(memberKey(m))}));return saved;
  });
  if(JSON.stringify(result.memberJobs)!==JSON.stringify(result.routes[0].memberJobs)||result.steps[1]!=='主线：'+result.routes[0].step||result.steps[2]!=='备选：'+result.routes[1].step||result.conditions[1]!==result.routes[0].condition||result.failures[1]!==result.routes[0].failure)throw Error('全队当前分工与主线不一致');
  if(result.routes[0].tempo!==undefined&&result.tempo!==result.routes[0].tempo)throw Error('全队当前节奏与主线不一致');
 }
 if(!Array.isArray(value.sourceUrls)||value.sourceUrls.length!==members.length||new Set(value.sourceUrls).size!==members.length)throw Error('共同分工技能来源不完整');
 const sourceIds=value.sourceUrls.map(url=>typeof url==='string'&&url.match(/^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/[0-9.]+\/data\/en_US\/champion\/([A-Za-z][A-Za-z0-9]{0,39})\.json$/)?.[1]);
 if(sourceIds.some(id=>!members.some(m=>m.champion===id))||new Set(sourceIds).size!==members.length)throw Error('共同分工技能来源与成员不一致');result.sourceUrls=[...value.sourceUrls];
 return result;
}
function sharedDescriptor(source,data){
 const members=source.members.map(m=>({role:m.role,champion:m.champion})),shared=savedShared(source,members);
 return {archetype:'shared',archetypeName:'共同分工',name:shared.name,tempo:shared.tempo,members,shared,ordered:shared.memberJobs,why:shared.why,plan:[shared.opening,shared.economy].join(' '),steps:shared.steps,window:shared.conditions.join(' '),caution:shared.failures.join(' '),feasibility:shared.sourceNote,patch:shared.patch,dataVersion:data.version,rulesVersion:shared.reviewedAt};
}

export function selectPartyRoute(value,routeId){
 const plan=validateCreativePlan(value),routes=plan.shared?.routes;
 if(!routes?.some(route=>route.id===routeId))throw Error('这套方案没有该行动路线，请重新推荐');
 const ordered=[routes.find(route=>route.id===routeId),...routes.filter(route=>route.id!==routeId)];
 const steps=[plan.shared.steps[0],'主线：'+ordered[0].step,'备选：'+ordered[1].step];
 const tempo=ordered[0].tempo||plan.shared.tempo;
 const shared={...plan.shared,tempo,name:`${plan.members.length}人分工 · ${TEMPOS[tempo]}`,routes:ordered,memberJobs:ordered[0].memberJobs,steps,relaySteps:steps,conditions:[plan.shared.conditions[0],ordered[0].condition],failures:[plan.shared.failures[0],ordered[0].failure]};
 const next={...plan,...sharedDescriptor(shared,{version:plan.dataVersion})};next.id=creativePlanId(next);
 return validateCreativePlan(next);
}

// This is one reusable cooperation plan, never game history or a performance
// claim. Its content identity keeps different members and revisions separate.
export function validateCreativePlan(value,slots,{allowUnknown=false}={}){
 if(!value||value.schema!==1||!archetypes.includes(value.archetype)||value.verified!==false||!tempos.includes(value.tempo))throw Error('创意组合说明格式不正确');
 const result={schema:1,archetype:value.archetype,tempo:value.tempo,verified:false};
 for(const [key,max] of [['archetypeName',80],['name',100],['why',700],['plan',700],['window',400],['caution',500],['feasibility',300],['patch',30],['dataVersion',30],['rulesVersion',40]]){
  if(!text(value[key],max))throw Error('创意组合说明内容不完整');result[key]=value[key];
 }
 const cooperation=value.archetype==='cooperation'||value.archetype==='shared',curated=value.archetype==='curated',count=value.members?.length;
 if(!Array.isArray(value.members)||!(value.archetype==='shared'?count>=2&&count<=5:cooperation||curated?[2,3].includes(count):count===3)||!Array.isArray(value.ordered)||value.ordered.length!==count)throw Error('创意组合成员格式不正确');
 result.members=value.members.map(m=>{if(!m||!roles.includes(m.role)||!hero(m.champion))throw Error('创意组合成员格式不正确');return {role:m.role,champion:m.champion};});
 if(new Set(result.members.map(m=>m.role)).size!==count||new Set(result.members.map(m=>m.champion)).size!==count)throw Error('创意组合成员重复');
 // Draft ownership is saved alongside the plan, not part of the immutable
 // cooperation text. Keep its content ID compatible with older saved pages.
 if(value.editableTargets!==undefined){
  if(!Array.isArray(value.editableTargets)||new Set(value.editableTargets).size!==value.editableTargets.length||value.editableTargets.some(role=>!result.members.some(m=>m.role===role)))throw Error('组合可替换位置与成员不一致');
  result.editableTargets=[...value.editableTargets];
 }
 const members=new Set(result.members.map(memberKey)),ordered=new Set();
 result.ordered=value.ordered.map(m=>{if(!m||!members.has(memberKey(m))||ordered.has(memberKey(m))||!text(m.job,cooperation||curated?700:200))throw Error('创意组合分工与成员不一致');ordered.add(memberKey(m));return {role:m.role,champion:m.champion,job:m.job};});
 if(!Array.isArray(value.steps)||!(curated?value.steps.length>=1&&value.steps.length<=6:value.archetype==='cooperation'?value.steps.length>=count-1&&value.steps.length<=3:value.steps.length===3)||!value.steps.every(s=>text(s,400)))throw Error('创意组合衔接顺序格式不正确');result.steps=[...value.steps];
 if(curated)result.curated=validateSavedCurated(value.curated,result.members);
 if(value.archetype==='cooperation'){
  result.cooperation=savedCooperation(value.cooperation,result.members);
  if(JSON.stringify(result.steps)!==JSON.stringify(result.cooperation.steps)||result.window!==result.cooperation.conditions.join(' ')||result.caution!==result.cooperation.failures.join(' '))throw Error('机制搭配条件与保存说明不一致');
  if(result.cooperation.memberJobs&&(JSON.stringify(result.ordered)!==JSON.stringify(result.cooperation.memberJobs)||result.plan!==[result.cooperation.opening,result.cooperation.economy].join(' ')))throw Error('机制搭配分工与保存说明不一致');
 }
 if(value.archetype==='shared'){
  result.shared=savedShared(value.shared,result.members);
  const expected=sharedDescriptor(result.shared,{version:result.dataVersion});
  for(const key of ['archetypeName','name','tempo','ordered','why','plan','steps','window','caution','feasibility','patch','rulesVersion'])if(JSON.stringify(result[key])!==JSON.stringify(expected[key]))throw Error('共同分工条件与保存说明不一致');
 }
 if(typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt)))throw Error('创意组合保存时间格式不正确');result.createdAt=value.createdAt;
 result.id=creativePlanId(result);if(value.id!==result.id)throw Error('创意组合内容与标识不一致');
 if(slots&&!(allowUnknown?creativePlanCompatible(result,slots):creativePlanMatches(result,slots)))throw Error('创意组合说明与保存阵容不一致');
 return result;
}
const validMemberCount=plan=>Array.isArray(plan?.members)&&(plan.archetype==='shared'?plan.members.length>=2&&plan.members.length<=5:['cooperation','curated'].includes(plan.archetype)?[2,3].includes(plan.members.length):plan.members.length===3);
export function creativePlanMatches(plan,slots){return !!plan&&validMemberCount(plan)&&plan.members.every(m=>slots?.some(s=>s.role===m.role&&s.champion===m.champion));}
export function creativePlanCompatible(plan,slots){return !!plan&&validMemberCount(plan)&&Array.isArray(slots)&&plan.members.every(m=>!slots.some(s=>s.role===m.role&&s.champion&&s.champion!==m.champion||s.champion===m.champion&&s.role!==m.role));}
export function captureCreativePlan(result,data,now=new Date().toISOString()){
 if(result.creativePlan)return validateCreativePlan(result.creativePlan,result.slots);
 const execution=resultCooperation(result),combo=result.trio||result.duo;
 const source=execution?(execution.kind==='shared'?sharedDescriptor:cooperationDescriptor)(execution,data):combo&&result.scope!=='solo'?curatedDescriptor(combo,data):!combo?result.creative:null;if(!source)return null;
 const editable=result.editableTargets??result.targets;
 const plan={patch:RULES_PATCH,dataVersion:data.version,rulesVersion:RULES_VERSION,...source,schema:1,verified:false,createdAt:now,...(Array.isArray(editable)?{editableTargets:roles.filter(role=>editable.includes(role)&&source.members.some(m=>m.role===role))}:{})};plan.id=creativePlanId(plan);
 return validateCreativePlan(plan,result.slots);
}
// Frozen accepted text wins. For new results, keep a complete authored group;
// otherwise prefer the concrete full-member jobs over a discovery label or a
// smaller curated subgroup. Creative seeds still serve ranking and discovery.
export function resultCooperation(result){
 if(result.creativePlan)return result.creativePlan.shared||result.creativePlan.cooperation||null;
 const plan=result.adaptive;if(!plan?.memberJobs?.length)return null;
 const authored=result.trio?.members||result.duo?.members||(result.duo?[{role:'bottom',champion:result.duo.carry},{role:'support',champion:result.duo.support}]:[]);
 const covers=m=>plan.members.some(p=>memberKey(p)===memberKey(m));
 return authored.length>=plan.members.length&&authored.every(covers)?null:plan;
}
export function creativeMemberCombo(value,champion,role){
 if(!value)return null;const plan=validateCreativePlan(value);
 if(!plan.members.some(m=>m.champion===champion&&m.role===role))return null;
 const source=plan.shared||plan.cooperation;
 return {...plan,origin:'creative',risk:plan.caution,members:plan.members.map(member=>({...member,job:plan.ordered.find(step=>memberKey(step)===memberKey(member)).job,...(plan.curated?{loadoutId:plan.curated.members.find(m=>memberKey(m)===memberKey(member)).loadoutId}:{})})),...(plan.curated?{catalogId:plan.curated.id,early:plan.curated.early,economy:plan.curated.economy,sources:plan.curated.sources,reviewedAt:plan.curated.reviewedAt}:source?{early:source.opening||null,economy:source.economy||null,sources:source.sourceUrls.map(url=>({name:'Riot 官方技能资料',kind:'技能依据',url}))}:{})};
}
export const creativeComboContext=combo=>combo?{comboId:combo.id,...(combo.origin==='creative'?{creativePlan:validateCreativePlan(combo)}:{})}:{};
