const slots=['P','Q','W','E','R'];
const vector=v=>Array.isArray(v)&&v.length>0&&v.length<=18&&v.every(n=>Number.isFinite(n)&&n>=0&&n<100000);
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<20000&&!/@[^@]+@|\{\{|<[^>]+>/.test(v);
const source=v=>v&&/^https:\/\/(?:game\.gtimg\.cn|ddragon\.leagueoflegends\.com|raw\.communitydragon\.org)\//.test(v.url)&&/^[a-f0-9]{64}$/.test(v.sha256);
export function validAbilityReference(ref,data,{allowOlder=false}={}){
 if(ref?.schema!==1||!/^\d+\.\d+$/.test(ref.patch)||!/^\d+\.\d+\.\d+$/.test(ref.version)||ref.version.split('.').slice(0,2).join('.')!==ref.patch||!Number.isFinite(Date.parse(ref.fetchedAt))||(!allowOlder&&ref.patch!==data.patch)||!Array.isArray(ref.champions)||!ref.champions.length||!Array.isArray(ref.sources)||!ref.sources.every(source))return false;
 const heroes=new Set(data.champions.map(c=>c.id)),seen=new Set();
 if(!allowOlder&&ref.champions.length!==heroes.size)return false;
 for(const hero of ref.champions){
  if(!heroes.has(hero.id)||seen.has(hero.id)||!text(hero.resource)||!source(hero.source)||!Array.isArray(hero.abilities)||hero.abilities.length!==5)return false;seen.add(hero.id);
  for(let i=0;i<5;i++){
   const a=hero.abilities[i];
   if(a.key!==slots[i]||!text(a.name)||!text(a.description)||!/^https:\/\/(?:game\.gtimg\.cn|ddragon\.leagueoflegends\.com)\//.test(a.icon)||!(a.maxRank===null||Number.isInteger(a.maxRank)&&a.maxRank>=1&&a.maxRank<=6)||!Array.isArray(a.variants)||a.variants.length>12)return false;
   for(const entry of [a,...a.variants]){
    if(!text(entry.name)||!text(entry.description)||!Array.isArray(entry.metrics)||entry.metrics.length>12||!Array.isArray(entry.notes)||entry.notes.some(n=>!text(n)))return false;
    for(const metric of entry.metrics)if(!text(metric.label)||!(metric.values===undefined?text(metric.text):vector(metric.values))||metric.values!==undefined&&!text(metric.unit)||metric.basis!==undefined&&!text(metric.basis))return false;
   }
  }
 }
 return true;
}
export function championAbilities(data,id){return data.abilityReference?.champions?.find(c=>c.id===id)||null;}
export function abilityVector(values){return [...new Set(values)].length===1?String(values[0]):values.join(' / ');}
// Only standalone rank vectors in the resolved source prose are marked. Percent
// coefficients and champion-level growth retain their original meaning.
export function abilityDescriptionSegments(description){
 return String(description).split(/(【[^【】\n]*\/[^【】\n]*】)/g).map((text,index)=>({text,rankVector:index%2===1}));
}
