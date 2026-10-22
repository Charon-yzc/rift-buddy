import {HEX_OWNED_LIMIT} from './hex-note-limits.mjs';
import {hexRecommendations} from './hex-recommendations.mjs';
import {compareAugments} from './hex-compare.mjs';

const unique=(values,limit)=>[...new Set(Array.isArray(values)?values:[])].slice(0,limit);
const championOf=({data,hero})=>data.champions.find(c=>c.id===hero);
// Augment-to-augment facts do not depend on a reviewed hero kit. The shared
// advice pass still gates every hero affinity on its separate kit review.
const hexContext=args=>(args.mode===undefined||args.mode==='hex')&&!!championOf(args);
function optionAdvice(args){
 const {data,hero,options=[],owned=[],mode='hex'}=args;
 if(mode==='hex')return hexRecommendations({data,hero,options,owned});
 return {bestChoice:null,rows:compareAugments({champion:championOf(args),options,owned,augments:data.augments,patch:data.patch,mode}).map(row=>({...row,level:'reference',label:'资料参考',mechanicReviewed:false}))};
}
function rankedOptions(args,advice){
 if(!unique(args.options,4).length)return [];
 const eligible=hexContext(args),preferred=advice.rows.filter(row=>eligible&&row.heroReviewed&&row.mechanicReviewed&&row.level==='preferred').sort((a,b)=>b.priority-a.priority);
 return advice.rows.map(row=>{
  if(!eligible||!row.mechanicReviewed){
   const record=args.data.augments.find(a=>a.id===row.id),cautions=[];
   if(record?.descriptionStatus==='partial')cautions.push('动态数值或适用技能未完全展开，以局内当前说明为准');
   if(unique(args.owned,HEX_OWNED_LIMIT).includes(row.id))cautions.push('你已标记选过这一项，请确认它是否还能再次出现');
   return {...row,rank:null,top:false,priority:'待核对',level:'reference',label:'资料参考',reasons:['适配尚待核对，请对照局内当前效果与触发条件。'],cautions,interactions:[]};
  }
  const place=preferred.findIndex(value=>value.id===row.id),rank=place<0?null:preferred.findIndex(value=>value.priority===row.priority)+1;
  // Coverage is not evidence that an unreviewed card is a bad choice. Preserve
  // the entered order so a player can keep matching our rows to the live cards.
  return {...row,rank,top:row.heroReviewed&&advice.bestChoice===row.id,priority:row.level==='conflict'?'有冲突':row.level==='preferred'?'优先参考':row.level==='owned'?'已选':'看条件'};
 });
}
export function rankAugmentOptions(args){return rankedOptions(args,optionAdvice(args));}
function rerollAdvice(args,rows){
 const options=unique(args.options,4),known=new Set(args.data.augments.map(a=>a.id)),owned=new Set(unique(args.owned,HEX_OWNED_LIMIT));
 if(!championOf(args))return {recommended:false,status:'hero',text:'选择英雄后再比较。'};
 if(options.length!==3||options.some(id=>!known.has(id)||owned.has(id)))return {recommended:false,status:'incomplete',text:'先录入3个不同的实际选项，再判断是否重随。'};
 const best=rows.find(row=>row.top);
 if(best)return {recommended:false,status:'choice',text:`先看${best.name}的触发条件，不必为凑流派急着重随。`};
 if(hexContext(args)&&rows.length===3&&rows.every(row=>row.mechanicReviewed&&row.level==='conflict'))return {recommended:true,status:'conflict',text:'三项都与已选强化存在已核对冲突，可以考虑重随；新选项仍是随机的。'};
 const unresolved=rows.filter(row=>!row.mechanicReviewed||!hexContext(args)).length;
 return {recommended:false,status:'review',text:unresolved?`${unresolved}项适配尚待核对，不能因此判断重随更好。`:'先比较触发条件与当前打法，暂不判断重随更好。'};
}
export function recommendAugmentReroll(args){return rerollAdvice(args,rankAugmentOptions(args));}

export function analyzeAugmentSet(args){
 const {data,hero,mode='hex'}=args,owned=unique(args.owned,HEX_OWNED_LIMIT),known=new Set(data.augments.map(a=>a.id)),present=owned.filter(id=>known.has(id)),synergies=[],conflicts=[];
 let pending=0;
 for(const id of present){
  const row=optionAdvice({...args,options:[id],owned:present.filter(other=>other!==id)}).rows[0];
  if(!hexContext(args)||!row?.mechanicReviewed){pending++;continue;}
  synergies.push(...row.interactions);
  if(row.level==='conflict'&&row.cautions[0])conflicts.push(row.cautions[0]);
 }
 // General hero affinity is not a synergy with the marked set. The shared
 // recommendation pass separately records only the marks' reviewed contribution.
 const next=present.length&&mode==='hex'&&hexContext(args)?hexRecommendations({data,hero,owned:present,limit:12}).rows.filter(row=>row.mechanicReviewed&&['preferred','conditional'].includes(row.level)&&!owned.includes(row.id)&&row.markedReasons?.length).slice(0,2).map(row=>({id:row.id,name:row.name,reason:row.markedReasons[0]})):[];
 return {count:present.length,missing:owned.length-present.length,pending,synergies:[...new Set(synergies)].slice(0,4),conflicts:[...new Set(conflicts)].slice(0,4),next,note:'只列已核对的机制，未列出的联动不代表无效。'};
}
export function hexDecision(args){const advice=optionAdvice(args),rows=rankedOptions(args,advice);return {rows,reroll:rerollAdvice(args,rows),set:analyzeAugmentSet(args),equipment:advice.equipment||[]};}
