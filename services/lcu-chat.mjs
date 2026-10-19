import {discoverClient,lcuRequest} from './lcu.mjs';

/**
 * Format a concise team chat announcement for champion select, like WeGame.
 * Includes champion, keystone/trees, 1st level skill and skill priority order.
 */
export function formatChampSelectAnnouncement({
 championName='英雄',
 primaryStyleName='',
 subStyleName='',
 keystoneName='',
 firstSkill='',
 priority='',
 attributePriority='',
 mode='rift'
}={}){
 const hero=String(championName||'英雄').trim();
 const modeTag=mode==='hex'?'大乱斗':'';
 const runePart=primaryStyleName&&subStyleName?`符文：${primaryStyleName}+${subStyleName}${keystoneName?`（${keystoneName}）`:''}`:keystoneName?`基石：${keystoneName}`:'';
 let skillPart='';
 if(attributePriority){
  skillPart=`属性加点：${attributePriority}`;
 }else if(firstSkill&&priority&&priority.length>=2){
  skillPart=`推荐加点：1级学 ${firstSkill}，主 ${priority[0]} 副 ${priority[1]}`;
 }else if(firstSkill){
  skillPart=`推荐加点：1级学 ${firstSkill}`;
 }else if(priority&&priority.length>=2){
  skillPart=`推荐加点：主 ${priority[0]} 副 ${priority[1]}`;
 }
 const parts=[
  `已配置 ${hero}${modeTag?`（${modeTag}）`:''}`,
  runePart,
  skillPart
 ].filter(Boolean);
 const line=`【开黑搭子】${parts.join(' | ')}`;
 return line.replace(/[\r\n\0]/g,' ').trim().slice(0,200);
}

/**
 * Locate the champion select chat room from the active conversations list.
 */
export function findChampSelectConversation(conversations){
 if(!Array.isArray(conversations))return null;
 const rooms=conversations.filter(c=>c&&typeof c.id==='string'&&/^[a-zA-Z0-9_@.-]+$/.test(c.id)&&(c.type==='championSelect'||!c.type&&c.id.includes('@champ-select')));
 return rooms.length===1?rooms[0]:null;
}

/**
 * Send an announcement to the champion select team chat via official LCU loopback API.
 * Never throws: client state changes or missing chat rooms resolve gracefully.
 */
export async function sendChampSelectAnnouncement({text,context,championId,pageId,page,installPath=''},{discover=discoverClient,request=lcuRequest,allowed=()=>false}={}){
 if(!text||typeof text!=='string')return {sent:false,reason:'empty-message'};
 const clean=text.replace(/[\r\n\0]/g,' ').trim().slice(0,200);
 if(!clean)return {sent:false,reason:'empty-message'};
 if(context?.phase!=='ChampSelect'||!/^([1-9]\d{0,19})$/.test(context.gameId)||!Number.isInteger(context.cellId)||context.cellId<0||context.cellId>=30||!Number.isSafeInteger(championId)||championId<=0||!Number.isSafeInteger(pageId)||pageId<=0||!Number.isSafeInteger(page?.primaryStyleId)||!Number.isSafeInteger(page?.subStyleId)||!Array.isArray(page?.selectedPerkIds)||page.selectedPerkIds.length!==9||!page.selectedPerkIds.every(Number.isSafeInteger))return {sent:false,reason:'missing-operation-context'};
 const expected=structuredClone({context,championId,pageId,page}),perks=value=>[...value].sort((a,b)=>a-b).join(',');
 try{
  if(!await allowed())return {sent:false,reason:'notice-disabled'};
  const auth=await discover(installPath);
  if(!auth?.port)return {sent:false,reason:'client-unavailable'};
  const current=async()=>{
   if(!await allowed())return false;
   const pages=await request(auth,'/lol-perks/v1/pages','GET'),active=Array.isArray(pages)&&pages.find(p=>p.id===expected.pageId&&p.current===true);
   if(!active||active.primaryStyleId!==expected.page.primaryStyleId||active.subStyleId!==expected.page.subStyleId||!Array.isArray(active.selectedPerkIds)||perks(active.selectedPerkIds)!==perks(expected.page.selectedPerkIds))return false;
   const session=await request(auth,'/lol-champ-select/v1/session','GET'),own=session?.myTeam?.find(p=>p.cellId===session.localPlayerCellId);
   if(String(session?.gameId)!==expected.context.gameId||session.localPlayerCellId!==expected.context.cellId||Number(own?.championId||own?.championPickIntent)!==expected.championId)return false;
   return await request(auth,'/lol-gameflow/v1/gameflow-phase','GET')==='ChampSelect'&&await allowed();
  };
  if(!await current())return {sent:false,reason:'configuration-changed'};
  const conversations=await request(auth,'/lol-chat/v1/conversations','GET');
  const target=findChampSelectConversation(conversations);
  if(!target?.id)return {sent:false,reason:'no-champ-select-conversation'};
  if(!await current())return {sent:false,reason:'configuration-changed'};
  await request(auth,`/lol-chat/v1/conversations/${target.id}/messages`,'POST',{body:clean,type:'chat'});
  return {sent:true,conversationId:target.id,text:clean};
 }catch{
  return {sent:false,reason:'chat-request-failed'};
 }
}
