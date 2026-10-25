const videoURL=/^https:\/\/www\.bilibili\.com\/video\/BV[A-Za-z0-9]+\/$/;
export function isYouTubeCommunitySourceURL(url){
 if(typeof url!=='string')return false;
 const match=/^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/.exec(url);
 return !!match&&url==='https://www.youtube.com/watch?v='+match[1];
}
const textURL=/^https:\/\/www\.reddit\.com\/r\/[A-Za-z0-9_]+\/comments\/[a-z0-9]+\/(?:comment\/[a-z0-9]+|[a-z0-9_]+(?:\/[a-z0-9]+)?)\/$/;
const kitchenURL=/^https:\/\/deeparam\.com\/embed\/fun\/cook-builds\/#chefs-special-(\d{4}-\d{2}-\d{2})$/;
const editorialURL=/^https:\/\/expcarry\.com\/lol-aram-mayhem-builds$/;
const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max;
export function communitySourceMedium(source){
 if((source?.medium===undefined||source.medium==='video')&&(videoURL.test(source?.url||'')||isYouTubeCommunitySourceURL(source?.url)))return 'video';
 return source?.medium==='text'&&(textURL.test(source.url||'')||kitchenURL.test(source.url||'')||editorialURL.test(source.url||''))?'text':null;
}
export function validCommunitySource(source,reviewedAt){
 const medium=communitySourceMedium(source);
 const dated=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&(!reviewedAt||value.slice(0,10)<=reviewedAt);
 // This article reports modification time but no first-publication date.
 // Keep the missing fact explicit instead of relabelling an update as publication.
 const updatedOnly=editorialURL.test(source?.url||'')&&source?.publishedAt===null&&source.dateBasis==='author-updated'&&dated(source.editedAt);
 if(!medium||!text(source.author,100)||!updatedOnly&&!dated(source.publishedAt)||source.dateBasis!==undefined&&!updatedOnly||!text(source.adaptation,1000))return false;
 const kitchenDay=kitchenURL.exec(source.url||'')?.[1];
 if(kitchenDay&&(source.publishedAt.slice(0,10)!==kitchenDay||new Date(kitchenDay).toISOString().slice(0,10)!==kitchenDay))return false;
 if(source.editedAt!==undefined&&(!dated(source.editedAt)||!updatedOnly&&Date.parse(source.editedAt)<Date.parse(source.publishedAt)))return false;
 return medium==='video'?Array.isArray(source.evidenceSeconds)&&source.evidenceSeconds.length>0&&source.evidenceSeconds.length<=20&&source.evidenceSeconds.every(s=>Number.isInteger(s)&&s>=0&&s<86400):source.evidenceSeconds===undefined&&Array.isArray(source.evidenceSections)&&source.evidenceSections.length>0&&source.evidenceSections.length<=12&&source.evidenceSections.every(s=>text(s,160));
}
export function communitySourceLabel(source){
 const medium=communitySourceMedium(source),patch=source.sourcePatch?`来源补丁 ${source.sourcePatch}`:medium==='text'?'原文未标注补丁号':'录像补丁号未标注';
 const date=source.publishedAt===null?'原文更新 '+source.editedAt.slice(0,10):source.publishedAt.slice(0,10);
 return source.author+' · '+date+'（'+patch+'）';
}
