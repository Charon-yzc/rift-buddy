import {selectedCatalogCombo} from './core/recommend.mjs';
import {comboMembers} from './core/combo-members.mjs';
import {escape as e} from './ui.mjs';

// The badge describes a real, currently usable catalogue entry. A generated
// plan name or an untrusted shared metadata field cannot manufacture it.
export function verifiedCommunityCombination(row,data){
 const source=row?.communityRecommendation;
 if(source?.kind!=='catalog'||source.id!==row.communityCombinationId||!Array.isArray(row.slots)||!Array.isArray(source.members)||source.members.some(m=>!m||typeof m.role!=='string'||typeof m.champion!=='string'))return null;
 const combo=selectedCatalogCombo(row.slots,source.id,data.catalogInfo?.status,data.patch);
 const key=m=>m.role+':'+m.champion;
 return combo&&comboMembers(combo).map(key).sort().join('|')===source.members.map(key).sort().join('|')?combo:null;
}
export function communityCombinationBadge(row,data){
 const combo=verifiedCommunityCombination(row,data);
 return combo?`<span class="community-combination-badge" title="${e(combo.name)} · 社区玩法来源，契合分按实际配合计算" aria-label="社区组合：${e(combo.name)}">社区组合</span>`:'';
}
