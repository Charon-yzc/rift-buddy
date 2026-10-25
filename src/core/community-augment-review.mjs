import {fingerprint} from './content-fingerprint.mjs';
import {isCurrentHexData} from './hex-data-current.mjs';

// A manual, signed route review binds the complete effect, including limits
// absent from the summary. It never renews shared rules or other authors.
export function communityHexAugmentFingerprint(augment,data){
 if(!isCurrentHexData(data)||!augment||!Number.isSafeInteger(augment.id)||augment.id<=0||typeof augment.key!=='string'||!augment.key||typeof augment.description!=='string'||!augment.description||augment.description.length>7000||augment.descriptionStatus!=='complete'||!Array.isArray(augment.unresolved)||augment.unresolved.length||augment.tooltip?.revision!==1||augment.tooltip.status!=='complete'||typeof augment.tooltip.description!=='string'||!augment.tooltip.description||augment.tooltip.description.length>7000||!Array.isArray(augment.tooltip.unresolved)||augment.tooltip.unresolved.length||augment.tooltipParserRevision!==5||!/^[a-f0-9]{64}$/.test(augment.effectSourceHash||''))return null;
 return fingerprint({id:augment.id,key:augment.key,description:augment.description,sourceKey:augment.sourceKey,tooltip:{description:augment.tooltip.description,sourceKey:augment.tooltip.sourceKey},parserRevision:augment.tooltipParserRevision,effectSourceHash:augment.effectSourceHash});
}
export function validCommunityAugmentReview(review,route,patch,reviewedAt){
 if(!review||typeof review!=='object'||Array.isArray(review)||Object.keys(review).sort().join('|')!=='algorithm|effects|patch|reviewedAt|schema'||review.schema!==1||review.algorithm!=='hex-effect-detail-v1'||review.patch!==patch||route.patch!==patch||typeof review.reviewedAt!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(review.reviewedAt)||!Number.isFinite(Date.parse(review.reviewedAt))||new Date(review.reviewedAt).toISOString().slice(0,10)!==review.reviewedAt||review.reviewedAt>reviewedAt||!Array.isArray(route.optional)||typeof route.requiresUltimate!=='boolean'||!review.effects||typeof review.effects!=='object'||Array.isArray(review.effects))return false;
 const ids=new Set([route.augment,...route.optional]),keys=Object.keys(review.effects);
 return ids.size>0&&ids.size<=21&&keys.length===ids.size&&keys.every(key=>{const value=review.effects[key];return /^[1-9]\d*$/.test(key)&&Number.isSafeInteger(Number(key))&&ids.has(Number(key))&&value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')==='fingerprint|requiresUltimate'&&typeof value.fingerprint==='string'&&/^[a-f0-9]{16}$/.test(value.fingerprint)&&typeof value.requiresUltimate==='boolean';})&&review.effects[route.augment].requiresUltimate===route.requiresUltimate;
}
