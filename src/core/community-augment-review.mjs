import {fingerprint} from './content-fingerprint.mjs';
import {isCurrentHexData} from './hex-data-current.mjs';
import {validAugmentCounterBasis} from './augment-counter-basis.mjs';

// A manual, signed route review binds full static text and source objects.
// Explicit current-player counters may remain dynamic; formulas may not.
// It never renews shared rules or other authors.
export function communityHexAugmentFingerprint(augment,data,coverage='complete'){
 if(!['complete','dynamic-counters','buff-counter'].includes(coverage)||!isCurrentHexData(data)||!augment||!Number.isSafeInteger(augment.id)||augment.id<=0||typeof augment.key!=='string'||!augment.key||typeof augment.description!=='string'||!augment.description||augment.description.length>7000||augment.descriptionStatus!=='complete'||!Array.isArray(augment.unresolved)||augment.unresolved.length||augment.tooltip?.revision!==1||typeof augment.tooltip.description!=='string'||!augment.tooltip.description||augment.tooltip.description.length>7000||!Array.isArray(augment.tooltip.unresolved)||augment.tooltipParserRevision!==5||!/^[a-f0-9]{64}$/.test(augment.effectSourceHash||''))return null;
 const detail=augment.tooltip,unknown=/〔数值未解析〕|@|\{\{|\}\}/;if(unknown.test(augment.description)||augment.description.includes('〔动态数值〕')||unknown.test(detail.description))return null;
 if(coverage==='complete'?(detail.status!=='complete'||detail.unresolved.length||detail.description.includes('〔动态数值〕')):(detail.status!=='partial'||!detail.unresolved.length||detail.unresolved.length>16||new Set(detail.unresolved).size!==detail.unresolved.length||!detail.description.includes('〔动态数值〕')))return null;
 if(coverage==='dynamic-counters'&&!detail.unresolved.every(key=>typeof key==='string'&&/^f\d{1,3}(?:\.\d{1,3})?$/.test(key)))return null;
 if(coverage==='buff-counter'&&(!validAugmentCounterBasis(augment)||augment.tooltipCounterBasis.entries.length!==detail.unresolved.length||!detail.unresolved.every(key=>augment.tooltipCounterBasis.entries.some(entry=>entry.token===key))))return null;
 return fingerprint({coverage,id:augment.id,key:augment.key,description:augment.description,sourceKey:augment.sourceKey,tooltip:{status:detail.status,description:detail.description,unresolved:detail.unresolved,sourceKey:detail.sourceKey},parserRevision:augment.tooltipParserRevision,effectSourceHash:augment.effectSourceHash,...(coverage==='buff-counter'?{counterBasis:augment.tooltipCounterBasis}:{})});
}
export function validCommunityExclusions(route){
 const ids=route.excludedAugments;
 return ids===undefined||Array.isArray(ids)&&ids.length>0&&ids.length<=20&&new Set(ids).size===ids.length&&ids.every(id=>Number.isSafeInteger(id)&&id>0&&id!==route.augment&&Array.isArray(route.optional)&&!route.optional.includes(id));
}
export function validCommunityAugmentReview(review,route,patch,reviewedAt){
 if(!review||typeof review!=='object'||Array.isArray(review)||Object.keys(review).sort().join('|')!=='algorithm|effects|patch|reviewedAt|schema'||review.schema!==1||review.algorithm!=='hex-effect-detail-v1'||review.patch!==patch||route.patch!==patch||typeof review.reviewedAt!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(review.reviewedAt)||!Number.isFinite(Date.parse(review.reviewedAt))||new Date(review.reviewedAt).toISOString().slice(0,10)!==review.reviewedAt||review.reviewedAt>reviewedAt||!Array.isArray(route.optional)||typeof route.requiresUltimate!=='boolean'||!review.effects||typeof review.effects!=='object'||Array.isArray(review.effects))return false;
 if(!validCommunityExclusions(route))return false;
 const ids=new Set([route.augment,...route.optional,...(route.excludedAugments||[])]),keys=Object.keys(review.effects);
 return ids.size>0&&ids.size<=21&&keys.length===ids.size&&keys.every(key=>{const value=review.effects[key];return /^[1-9]\d*$/.test(key)&&Number.isSafeInteger(Number(key))&&ids.has(Number(key))&&value&&typeof value==='object'&&!Array.isArray(value)&&['fingerprint|requiresUltimate','coverage|fingerprint|requiresUltimate'].includes(Object.keys(value).sort().join('|'))&&(value.coverage===undefined||['complete','dynamic-counters','buff-counter'].includes(value.coverage))&&typeof value.fingerprint==='string'&&/^[a-f0-9]{16}$/.test(value.fingerprint)&&typeof value.requiresUltimate==='boolean';})&&review.effects[route.augment].requiresUltimate===route.requiresUltimate;
}

// Authored compact wording is allowed only beside a scoped current-effect review.
// Leave room for selection and no-ultimate prefixes in the native 100-char card.
export function validCommunityCoreBrief(route){
 return route.coreBrief===undefined||typeof route.coreBrief==='string'&&route.coreBrief===route.coreBrief.trim()&&route.coreBrief.length>0&&route.coreBrief.length<=80&&!/[\u0000-\u001f\u007f<>]/.test(route.coreBrief)&&!!route.augmentReview?.effects?.[route.augment];
}
