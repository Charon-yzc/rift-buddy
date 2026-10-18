import {fingerprint} from './content-fingerprint.mjs';
const hash=/^[a-f0-9]{64}$/,legacyHash=/^[a-f0-9]{16}$/,patchPattern=/^\d+\.\d+$/,heroPattern=/^[A-Za-z][A-Za-z0-9]+$/;
export function characterSourceURL(patch,id){
 if(!patchPattern.test(patch)||!heroPattern.test(id))throw Error('英雄机制来源编号或补丁无效');
 const name=id.toLowerCase();return `https://raw.communitydragon.org/${patch}/game/data/characters/${name}/${name}.bin.json`;
}
export const dataDragonMechanicURL=version=>`https://ddragon.leagueoflegends.com/cdn/${version}/data/zh_CN/championFull.json`;
function validInput(input){
 return !!(input?.schema===1&&input.normalizer===1&&heroPattern.test(input.champion||'')&&patchPattern.test(input.patch||'')&&/^\d+\.\d+\.\d+$/.test(input.version||'')&&input.version.split('.').slice(0,2).join('.')===input.patch&&input.locale==='zh_CN'&&input.character?.algorithm==='canonical-json-sha256-v1'&&hash.test(input.character.sha256||'')&&input.character.url===characterSourceURL(input.patch,input.champion)&&input.dataDragon?.url===dataDragonMechanicURL(input.version)&&legacyHash.test(input.dataDragon.fingerprint||''));
}
// Transport/check timestamps are intentionally outside this input. Do not
// remove any fields from the character bin, including real time/charge fields.
export function mechanicSourceInput(champion,patch){
 const source=champion?.mechanicSource;
 if(!source||source.schema!==1||source.normalizer!==1||source.champion!==champion.id||source.patch!==patch||source.locale!=='zh_CN'||!Number.isFinite(Date.parse(source.observedAt)))return null;
 if(!source.passive||typeof source.passive.description!=='string'||!Array.isArray(source.spells)||source.spells.length!==4||source.spells.some(spell=>!spell||typeof spell.id!=='string'||typeof spell.description!=='string'||typeof spell.tooltip!=='string'||!Number.isInteger(spell.maxrank)||spell.maxrank<1||spell.maxrank>6))return null;
 const payload={passive:source.passive,spells:source.spells};if(JSON.stringify(payload).length>262144)return null;
 const character=source.character&&{algorithm:source.character.algorithm,url:source.character.url,sha256:source.character.sha256};
 const input={schema:source.schema,normalizer:source.normalizer,champion:champion.id,patch:source.patch,version:source.version,locale:source.locale,character,dataDragon:{url:source.dataDragonURL,fingerprint:fingerprint(payload)}};
 return validInput(input)?input:null;
}
export function validMechanicSourceAnchor(anchor){
 return !!(anchor?.schema===1&&['migration-anchor','explicit-review'].includes(anchor.kind)&&anchor.reviewCoverage==='summary-v1'&&legacyHash.test(anchor.legacyFingerprint||'')&&Number.isFinite(Date.parse(anchor.observedAt))&&validInput(anchor.input));
}
export function mechanicSourceMatches(champion,patch,anchor,legacyFingerprint){
 if(!validMechanicSourceAnchor(anchor)||anchor.legacyFingerprint!==legacyFingerprint)return false;
 const input=mechanicSourceInput(champion,patch);return !!input&&fingerprint(input)===fingerprint(anchor.input);
}
// Call only for an explicit review or the one-time, reviewed migration tool.
// Collection, cache restoration and statistics refresh never create anchors.
export function captureMechanicSourceAnchor(champion,patch,legacyFingerprint,{kind='explicit-review'}={}){
 const input=mechanicSourceInput(champion,patch);
 if(!input||!legacyHash.test(legacyFingerprint||''))throw Error('角色源不完整，保留原复核记录');
 const anchor={schema:1,kind,reviewCoverage:'summary-v1',legacyFingerprint,observedAt:champion.mechanicSource.observedAt,input};
 if(!validMechanicSourceAnchor(anchor))throw Error('角色源锚点格式无效');return structuredClone(anchor);
}
