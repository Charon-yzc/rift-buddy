import baseline from './hex-pool-baseline.json' with {type:'json'};

export function hexCatalogDisabled(data,augment){
 const source=`https://raw.communitydragon.org/${data.patch}/game/maps/modespecificdata/kiwi.bin.json`;
 if(!augment||data.augmentError||data.augmentVersion&&data.augmentVersion!==data.version||data.sources?.augmentDescriptions!==source)return false;
 if(typeof augment.catalogEnabled==='boolean')return augment.catalogEnabled===false;
 return baseline.patches[data.patch]?.disabled[augment.id]?.key===augment.key;
}
