export function versionNotice(version,currentPatch){
 if(!currentPatch)return '当前版本未知，待核对';
 if(!version)return '来源版本未知，待核对';
 return version===currentPatch?'':version+' · 不同版本待核';
}

// A stage can include other members' saved steps from a different patch.
export function stageVersionNotice(stage,play,currentPatch){
 if(!currentPatch)return '当前版本未知，待核对';
 const versions=[stage?.sourcePatch,stage?.patch||play?.patch,...(stage?.memberPatches||[]),...(stage?.memberJobs||[]).map(member=>member.patch)].filter(Boolean);
 if(!versions.length)return '来源版本未知，待核对';
 const different=[...new Set(versions.filter(version=>version!==currentPatch))];
 return different.length?different.join('、')+' · 不同版本待核':'';
}
