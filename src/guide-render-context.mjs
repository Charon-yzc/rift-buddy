// Paint identity only. This never authorizes a main-process operation.
export function guideRenderContext(value){
 const m=value?.model;
 return JSON.stringify([m?.champion?.id,m?.selection,m?.mode,m?.matchId,value?.referenceRevision,m?.version,m?.source,m?.sourceUrl,m?.fetchedAt,m?.skillSource,m?.skillSourceUrl,m?.skillPatch,m?.live?.kind]);
}
