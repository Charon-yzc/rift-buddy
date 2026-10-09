import {RULES_PATCH,RULES_VERSION} from './rules.mjs';
import {fingerprint} from './catalog-review.mjs';

const roles=['top','jungle','mid','bottom','support'];
const archetypes=['chain','poke','dive','protect','mixed','cooperation'];
const hero=id=>typeof id==='string'&&/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(id);
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const memberKey=m=>m.role+':'+m.champion;
const content=plan=>Object.fromEntries([...['schema','archetype','archetypeName','name','tempo','members','ordered','why','plan','steps','window','caution','feasibility','patch','dataVersion','rulesVersion'],...(plan.archetype==='cooperation'?['cooperation']:[])].map(key=>[key,plan[key]]));
export const creativePlanId=plan=>'creative-'+plan.archetype+'-'+fingerprint(content(plan));

// Keep the original conditional interactions with the saved member pages.
// A future rules update must not silently rewrite an accepted plan.
function savedCooperation(value,members){
 if(!value||!Array.isArray(value.members)||JSON.stringify(value.members)!==JSON.stringify(members)||!Array.isArray(value.edges)||value.edges.length<members.length-1||value.edges.length>3)throw Error('机制搭配成员与联动不一致');
 const ids=new Set(members.map(m=>m.champion)),seen=new Set(),edges=value.edges.map(edge=>{
  if(!edge||!ids.has(edge.a)||!ids.has(edge.b)||edge.a===edge.b||typeof edge.current!=='boolean'||!['early','teamfight','protect','poke'].includes(edge.tempo))throw Error('机制搭配联动格式不正确');
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
 if(!['early','teamfight','protect','poke'].includes(value.tempo))throw Error('机制搭配节奏不正确');result.tempo=value.tempo;
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

// This is one reusable cooperation plan, never game history or a performance
// claim. Its content identity keeps different members and revisions separate.
export function validateCreativePlan(value,slots,{allowUnknown=false}={}){
 if(!value||value.schema!==1||!archetypes.includes(value.archetype)||value.verified!==false||!['early','teamfight','protect','poke'].includes(value.tempo))throw Error('创意组合说明格式不正确');
 const result={schema:1,archetype:value.archetype,tempo:value.tempo,verified:false};
 for(const [key,max] of [['archetypeName',80],['name',100],['why',700],['plan',700],['window',400],['caution',500],['feasibility',300],['patch',30],['dataVersion',30],['rulesVersion',40]]){
  if(!text(value[key],max))throw Error('创意组合说明内容不完整');result[key]=value[key];
 }
 const cooperation=value.archetype==='cooperation',count=value.members?.length;
 if(!Array.isArray(value.members)||!(cooperation?[2,3].includes(count):count===3)||!Array.isArray(value.ordered)||value.ordered.length!==count)throw Error('创意组合成员格式不正确');
 result.members=value.members.map(m=>{if(!m||!roles.includes(m.role)||!hero(m.champion))throw Error('创意组合成员格式不正确');return {role:m.role,champion:m.champion};});
 if(new Set(result.members.map(m=>m.role)).size!==count||new Set(result.members.map(m=>m.champion)).size!==count)throw Error('创意组合成员重复');
 // Draft ownership is saved alongside the plan, not part of the immutable
 // cooperation text. Keep its content ID compatible with older saved pages.
 if(value.editableTargets!==undefined){
  if(!Array.isArray(value.editableTargets)||new Set(value.editableTargets).size!==value.editableTargets.length||value.editableTargets.some(role=>!result.members.some(m=>m.role===role)))throw Error('组合可替换位置与成员不一致');
  result.editableTargets=[...value.editableTargets];
 }
 const members=new Set(result.members.map(memberKey)),ordered=new Set();
 result.ordered=value.ordered.map(m=>{if(!m||!members.has(memberKey(m))||ordered.has(memberKey(m))||!text(m.job,cooperation?700:200))throw Error('创意组合分工与成员不一致');ordered.add(memberKey(m));return {role:m.role,champion:m.champion,job:m.job};});
 if(!Array.isArray(value.steps)||!(cooperation?value.steps.length>=count-1&&value.steps.length<=3:value.steps.length===3)||!value.steps.every(s=>text(s,400)))throw Error('创意组合衔接顺序格式不正确');result.steps=[...value.steps];
 if(cooperation){
  result.cooperation=savedCooperation(value.cooperation,result.members);
  if(JSON.stringify(result.steps)!==JSON.stringify(result.cooperation.steps)||result.window!==result.cooperation.conditions.join(' ')||result.caution!==result.cooperation.failures.join(' '))throw Error('机制搭配条件与保存说明不一致');
  if(result.cooperation.memberJobs&&(JSON.stringify(result.ordered)!==JSON.stringify(result.cooperation.memberJobs)||result.plan!==[result.cooperation.opening,result.cooperation.economy].join(' ')))throw Error('机制搭配分工与保存说明不一致');
 }
 if(typeof value.createdAt!=='string'||!Number.isFinite(Date.parse(value.createdAt)))throw Error('创意组合保存时间格式不正确');result.createdAt=value.createdAt;
 result.id=creativePlanId(result);if(value.id!==result.id)throw Error('创意组合内容与标识不一致');
 if(slots&&!(allowUnknown?creativePlanCompatible(result,slots):creativePlanMatches(result,slots)))throw Error('创意组合说明与保存阵容不一致');
 return result;
}
const validMemberCount=plan=>Array.isArray(plan?.members)&&(plan.archetype==='cooperation'?[2,3].includes(plan.members.length):plan.members.length===3);
export function creativePlanMatches(plan,slots){return !!plan&&validMemberCount(plan)&&plan.members.every(m=>slots?.some(s=>s.role===m.role&&s.champion===m.champion));}
export function creativePlanCompatible(plan,slots){return !!plan&&validMemberCount(plan)&&Array.isArray(slots)&&plan.members.every(m=>!slots.some(s=>s.role===m.role&&s.champion&&s.champion!==m.champion||s.champion===m.champion&&s.role!==m.role));}
export function captureCreativePlan(result,data,now=new Date().toISOString()){
 if(result.creativePlan)return validateCreativePlan(result.creativePlan,result.slots);
 const source=result.creative||(result.adaptive&&!result.trio&&!result.duo?cooperationDescriptor(result.adaptive,data):null);if(!source)return null;
 const editable=result.editableTargets??result.targets;
 const plan={patch:RULES_PATCH,dataVersion:data.version,rulesVersion:RULES_VERSION,...source,schema:1,verified:false,createdAt:now,...(Array.isArray(editable)?{editableTargets:roles.filter(role=>editable.includes(role)&&source.members.some(m=>m.role===role))}:{})};plan.id=creativePlanId(plan);
 return validateCreativePlan(plan,result.slots);
}
export function creativeMemberCombo(value,champion,role){
 if(!value)return null;const plan=validateCreativePlan(value);
 if(!plan.members.some(m=>m.champion===champion&&m.role===role))return null;
 return {...plan,origin:'creative',risk:plan.caution,members:plan.ordered,...(plan.cooperation?{early:plan.cooperation.opening||null,economy:plan.cooperation.economy||null,sources:plan.cooperation.sourceUrls.map(url=>({name:'Riot 官方技能资料',kind:'技能依据',url}))}:{})};
}
export const creativeComboContext=combo=>combo?{comboId:combo.id,...(combo.origin==='creative'?{creativePlan:validateCreativePlan(combo)}:{})}:{};
