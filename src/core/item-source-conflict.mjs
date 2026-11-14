import {fingerprint} from './content-fingerprint.mjs';

// Explicitly reviewed discrepancy, not an automatic comparison of descriptions.
// The fingerprint covers both complete stored descriptions, their source URLs,
// the tooltip status, item-source digest and both patch/version identifiers.
// It is change detection, not authentication or proof of the effect in game.
const zekesReview={patch:'16.21',version:'16.21.1',fingerprint:'da65dcadab3d118a'};
export function itemSourceConflict(data,id){
 if(String(id)!=='3050')return null;
 const item=data?.items?.[id],tooltip=item?.tooltip,source=item?.modeTooltips?.hex;
 const input={patch:data?.patch,version:data?.version,dataDragon:{source:data?.sources?.items,description:item?.description},communityDragon:{patch:tooltip?.patch,source:tooltip?.source,status:tooltip?.status,description:tooltip?.description,itemSource:{patch:source?.patch,source:source?.source,sourceHash:source?.sourceHash}}};
 if(data?.patch!==zekesReview.patch||data?.version!==zekesReview.version||fingerprint(input)!==zekesReview.fingerprint)return {status:'review-needed'};
 return {status:'conflict'};
}

// These are the available snapshot texts, not a resolution of their semantics.
// Never relabel an old detailed tooltip as belonging to the current patch.
export function itemSourceDescriptions(data,id){
 const item=data?.items?.[id];if(!item)return [];
 const patch=typeof data.patch==='string'?data.patch:'',version=typeof data.version==='string'?data.version:'',tooltip=item.tooltip;
 const ddCurrent=/^\d+\.\d+\.\d+$/.test(version)&&version.split('.').slice(0,2).join('.')===patch&&data.sources?.items===`https://ddragon.leagueoflegends.com/cdn/${version}/data/zh_CN/item.json`;
 const rows=[];
 if(tooltip?.patch===patch&&patch&&typeof tooltip.description==='string'&&tooltip.description){
  const cdCurrent=/^\d+\.\d+$/.test(patch)&&tooltip.source===`https://raw.communitydragon.org/${patch}/game/items.cdtb.bin.json`;
  rows.push({label:cdCurrent?`CommunityDragon · ${patch} 峡谷详细文本`:'同补丁详细文本 · 来源待核',description:tooltip.description,partial:tooltip.status==='partial'});
 }
 if(typeof item.description==='string'&&item.description)rows.push({label:ddCurrent?`Riot Data Dragon · ${version} 峡谷简介`:'装备快照简介 · 来源版本待核',description:item.description});
 return rows;
}
