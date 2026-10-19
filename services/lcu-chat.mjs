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
 return conversations.find(c=>c&&typeof c.id==='string'&&/^[a-zA-Z0-9_@.-]+$/.test(c.id)&&(c.type==='championSelect'||c.id.includes('@champ-select')))||null;
}

/**
 * Send an announcement to the champion select team chat via official LCU loopback API.
 * Never throws: client state changes or missing chat rooms resolve gracefully.
 */
export async function sendChampSelectAnnouncement({text,installPath=''},{discover=discoverClient,request=lcuRequest}={}){
 if(!text||typeof text!=='string')return {sent:false,reason:'empty-message'};
 const clean=text.replace(/[\r\n\0]/g,' ').trim().slice(0,200);
 if(!clean)return {sent:false,reason:'empty-message'};
 try{
  const auth=await discover(installPath);
  if(!auth?.port)return {sent:false,reason:'client-unavailable'};
  const conversations=await request(auth,'/lol-chat/v1/conversations','GET');
  const target=findChampSelectConversation(conversations);
  if(!target?.id)return {sent:false,reason:'no-champ-select-conversation'};
  await request(auth,`/lol-chat/v1/conversations/${target.id}/messages`,'POST',{body:clean,type:'chat'});
  return {sent:true,conversationId:target.id,text:clean};
 }catch(error){
  return {sent:false,error:error?.message||'chat-request-failed'};
 }
}
