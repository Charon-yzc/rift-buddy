// A readable current source is not a review of its effects or game rules.
export function isReadableHexData(data){
 const patch=data?.patch,version=data?.version;
 return /^\d{2}\.\d{1,2}$/.test(patch||'')&&/^\d+\.\d+\.\d+$/.test(version||'')&&version.split('.').slice(0,2).join('.')===patch&&!data.augmentError&&(data.augmentVersion===undefined||data.augmentVersion===version)&&Array.isArray(data.augments)&&data.sources?.augmentDescriptions===`https://raw.communitydragon.org/${patch}/game/maps/modespecificdata/kiwi.bin.json`&&data.sources?.augments===`https://raw.communitydragon.org/${patch}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/augment-lists.json`&&data.sources?.items===`https://ddragon.leagueoflegends.com/cdn/${version}/data/zh_CN/item.json`;
}
// The 4.0 catalogue and its explanations are reviewed together. A newer Rift
// snapshot, old cache or failed augment refresh cannot renew Hex authority.
export function isCurrentHexData(data){
 return data?.patch==='16.21'&&/^16\.21\.\d+$/.test(data.version||'')&&!data.augmentError&&(data.augmentVersion===undefined||data.augmentVersion===data.version)&&data.sources?.augmentDescriptions==='https://raw.communitydragon.org/16.21/game/maps/modespecificdata/kiwi.bin.json';
}
export const HEX_DATA_PENDING='海克斯4.0资料尚未就绪，旧版建议已停用。请更新资料后重试。';
