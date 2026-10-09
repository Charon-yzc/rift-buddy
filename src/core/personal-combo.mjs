import {comboMembers} from './combo-members.mjs';

// Preserve metadata that the friendly editor does not expose, including old
// review dates and additional sources. Actual validation belongs to the store.
export function personalCombo({previous,kind,values,patch,today,id}){
 const read=key=>String(values[key]||'').trim(),count=kind==='duo'?2:3;
 const members=Array.from({length:count},(_,i)=>({role:read('role-'+i),champion:read('hero-'+i),job:read('job-'+i),loadoutId:read('loadout-'+i)||'default'}));
 const source=read('source'),priorSources=previous?.sources||[];
 const sources=source===String(priorSources[0]?.url||'')?structuredClone(priorSources):source?[{name:priorSources[0]?.name||'自定义玩法来源',url:source,kind:priorSources[0]?.kind||'用户整理'},...priorSources.slice(1)]:priorSources.slice(1);
 const entry={...previous,id:previous?.id||id,name:read('name'),style:previous?.style||'fun',difficulty:read('difficulty'),tempo:read('tempo'),tags:previous?.tags||['自定义组合'],why:read('why'),plan:read('plan'),risk:read('risk'),patch:read('review-current')?patch:previous?.patch||patch,reviewedAt:read('review-current')?today:previous?.reviewedAt||today,sources};
 const isBot=members.some(m=>m.role==='bottom')&&members.some(m=>m.role==='support');
 const modern=kind==='trio'||!previous||previous.members||!isBot||members.some(m=>m.job);
 if(modern){
  if(members.some(m=>!m.job)||!read('window')||!read('early')||!read('economy'))throw Error('请补齐每位成员分工、行动条件、开局安排和经济分工');
  delete entry.carry;delete entry.support;delete entry.loadouts;
  Object.assign(entry,{members,steps:read('plan').split(/\n/).map(s=>s.trim()).filter(Boolean),window:read('window'),early:read('early'),economy:read('economy')});
  if(kind==='duo')entry.partners=previous?.partners||[];
 }else{
  const bottom=members.find(m=>m.role==='bottom'),support=members.find(m=>m.role==='support');
  Object.assign(entry,{carry:bottom.champion,support:support.champion,partners:previous.partners||[],loadouts:{bottom:bottom.loadoutId,support:support.loadoutId}});
 }
 return entry;
}

export function loadPersonalCombo(slots,combo){
 const members=comboMembers(combo);
 if(members.some(m=>slots.some(s=>s.champion===m.champion&&s.role!==m.role)))throw Error('组合英雄已在其他位置，请先调整位置再载入');
 if(members.some(m=>{const slot=slots.find(s=>s.role===m.role);return !slot?.party&&slot?.champion!==m.champion;}))throw Error('这套组合涉及队友的位置，先确认其英雄；只会改动标记为“我们”的位置');
 return slots.map(s=>{const m=members.find(m=>m.role===s.role);return m&&s.party?(s.champion===m.champion?{...s,locked:true}:{role:s.role,party:s.party,champion:m.champion,locked:true}):{...s};});
}
