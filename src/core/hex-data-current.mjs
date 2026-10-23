// The 4.0 catalogue and its explanations are reviewed together. A newer Rift
// snapshot, old cache or failed augment refresh cannot renew Hex authority.
export function isCurrentHexData(data){
 return data?.patch==='16.21'&&/^16\.21\.\d+$/.test(data.version||'')&&!data.augmentError&&(data.augmentVersion===undefined||data.augmentVersion===data.version)&&data.sources?.augmentDescriptions==='https://raw.communitydragon.org/16.21/game/maps/modespecificdata/kiwi.bin.json';
}
export const HEX_DATA_PENDING='海克斯4.0资料尚未就绪，旧版建议已停用。请更新资料后重试。';
