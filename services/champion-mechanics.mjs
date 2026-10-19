import {createHash} from 'node:crypto';
import {canonicalJSON} from '../src/core/content-fingerprint.mjs';
import {characterSourceURL,dataDragonMechanicURL,mechanicSourceInput} from '../src/core/mechanic-source.mjs';
export function characterSourceRecord(raw,patch,id){
 return {algorithm:'canonical-json-sha256-v1',url:characterSourceURL(patch,id),sha256:createHash('sha256').update(canonicalJSON(raw)).digest('hex')};
}
export function captureChampionMechanicSource(champion,patch,version,observedAt){
 const source={schema:1,normalizer:1,champion:champion.id,patch,version,locale:'zh_CN',observedAt,character:champion.characterSource,dataDragonURL:dataDragonMechanicURL(version),passive:structuredClone(champion.passive),spells:structuredClone(champion.spells)};
 if(!mechanicSourceInput({id:champion.id,mechanicSource:source},patch))throw Error(`${champion.id} 的角色机制来源不完整`);
 return source;
}
