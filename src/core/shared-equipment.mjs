import {itemConflicts} from './mechanics.mjs';
export function validateSharedEquipment(value){
 if(!value||!/^\d{1,2}\.\d{1,2}$/.test(value.patch)||!Array.isArray(value.start)||value.start.length>6||!Array.isArray(value.items)||!value.items.length||value.items.length>7||![...value.start,...value.items].every(id=>Number.isSafeInteger(id)&&id>0&&id<10000000)||new Set(value.items).size!==value.items.length)throw Error('共享出装格式不正确');
 return {patch:value.patch,start:[...value.start],items:[...value.items]};
}
export function sharedEquipmentBuild(base,raw,data){
 const shared=validateSharedEquipment(raw);
 if(shared.patch!==data.patch)return {...base,selectionWarnings:[...base.selectionWarnings,'保存的队友出装版本已变化，原记录保留；当前使用本机默认参考，请重新核对后采用。']};
 const cap=base.support?5:base.bottomQuestPlan?7:6;
 const allowed=id=>{const i=data.items[id];return i?.maps?.['11']&&!i.requiredAlly&&(!i.requiredChampion||i.requiredChampion===base.champion);};
 if(shared.items.length>cap||![...shared.start,...shared.items].every(allowed)||shared.items.some((id,n)=>itemConflicts(id,shared.items.slice(0,n)))||shared.items.filter(id=>data.items[id]?.tags?.includes('Boots')).length>1)throw Error('共享出装在当前英雄、装备位或资料中不可用，请重新核对');
 const resolve=id=>data.items[id],items=shared.items.map(resolve),boots=items.find(i=>i.tags?.includes('Boots'));
 return {...base,items,start:shared.start.map(resolve),early:[],boots:boots?.id||null,reference:null,referenceStale:false,selectedCoreId:null,selectedCoreIndex:0,selectedLaterIds:[],laterOptions:[],unavailableLaterOptions:[],startOptions:[],bootsOptions:[],adapted:false,adjustments:[],rulesPatch:shared.patch,stale:false,title:'队友共享出装',source:'本人采用的队友出装',sourceNote:'出装顺序来自你点击采用的队友快照，没有统计优势证据。局内仍按当前背包与公开装备信号比较调整。符文、技能与组合职责各自保留依据。'};
}
