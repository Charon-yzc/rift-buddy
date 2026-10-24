const videoURL=/^https:\/\/www\.bilibili\.com\/video\/BV[A-Za-z0-9]+\/$/;
const textURL=/^https:\/\/www\.reddit\.com\/r\/[A-Za-z0-9_]+\/comments\/[a-z0-9]+\/(?:comment\/[a-z0-9]+|[a-z0-9_]+(?:\/[a-z0-9]+)?)\/$/;
const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max;
export function communitySourceMedium(source){
 if((source?.medium===undefined||source.medium==='video')&&videoURL.test(source?.url||''))return 'video';
 return source?.medium==='text'&&textURL.test(source.url||'')?'text':null;
}
export function validCommunitySource(source,reviewedAt){
 const medium=communitySourceMedium(source);
 if(!medium||!text(source.author,100)||typeof source.publishedAt!=='string'||!Number.isFinite(Date.parse(source.publishedAt))||reviewedAt&&source.publishedAt.slice(0,10)>reviewedAt||!text(source.adaptation,1000))return false;
 if(source.editedAt!==undefined&&(typeof source.editedAt!=='string'||!Number.isFinite(Date.parse(source.editedAt))||Date.parse(source.editedAt)<Date.parse(source.publishedAt)||reviewedAt&&source.editedAt.slice(0,10)>reviewedAt))return false;
 return medium==='video'?Array.isArray(source.evidenceSeconds)&&source.evidenceSeconds.length>0&&source.evidenceSeconds.length<=20&&source.evidenceSeconds.every(s=>Number.isInteger(s)&&s>=0&&s<86400):source.evidenceSeconds===undefined&&Array.isArray(source.evidenceSections)&&source.evidenceSections.length>0&&source.evidenceSections.length<=12&&source.evidenceSections.every(s=>text(s,160));
}
export function communitySourceLabel(source){
 const medium=communitySourceMedium(source),patch=source.sourcePatch?`来源补丁 ${source.sourcePatch}`:medium==='text'?'原文未标注补丁号':'录像补丁号未标注';
 return source.author+' · '+source.publishedAt.slice(0,10)+'（'+patch+'）';
}
