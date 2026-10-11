import {sanitizeShare,ROOM_PROTOCOL,MAX_FRAME} from './room.mjs';
export const MAX_PREPARATION_FILE_BYTES=256*1024;
const bytes=text=>new TextEncoder().encode(text).length;
// Manual file exchange carries the same public snapshots as a full room.
// It never exports saved preferences, client identities, room PINs or accounts.
export function preparationDocument(raw){
 const share=sanitizeShare(raw);if(!share||!['rift','hex'].includes(share.mode))throw Error('准备文件缺少有效模式或阵容');
 const selected=share.lineup.filter(s=>s.champion);if(!selected.length||new Set(selected.map(s=>s.champion)).size!==selected.length)throw Error('准备文件英雄阵容不完整或重复');
 if(!share.configurations||share.configurations.length!==selected.length||share.configurations.some(c=>c.mode!==share.mode||c.mode==='rift'&&!c.runes))throw Error('准备文件未包含每位所选英雄的同模式完整配置');
 if(share.pick&&!selected.some(s=>s.champion===share.pick.champion&&s.role===share.pick.role)||share.pick&&share.pick.mode!==share.mode||share.mode==='hex'&&share.strategy)throw Error('准备文件的个人选择或组合与模式不一致');
 if(bytes(JSON.stringify(share))>MAX_FRAME)throw Error('准备内容过大，请减少说明后重新导出');
 return {kind:'rift-buddy-preparation',schema:1,share};
}
export function preparationFileText(raw){const text=JSON.stringify(preparationDocument(raw),null,2)+'\n';if(bytes(text)>MAX_PREPARATION_FILE_BYTES)throw Error('准备文件过大');return text;}
export function parsePreparationFile(text){
 if(typeof text!=='string'||bytes(text)>MAX_PREPARATION_FILE_BYTES)throw Error('准备文件超过256KB或不是文本');
 let value;try{value=JSON.parse(text);}catch{throw Error('准备文件不是有效JSON');}
 if(!value||value.kind!=='rift-buddy-preparation'||value.schema!==1)throw Error('这不是支持的开黑准备文件；收藏备份请使用数据与连接中的导入');
 return preparationDocument(value.share).share;
}
export function preparationShare({from,lineup,pick=null,mode,configurations,strategy,at=Date.now()}){
 return preparationDocument({kind:'state',v:ROOM_PROTOCOL,from,lineup,pick,mode,configurations,...(strategy?{strategy}:{}),at}).share;
}