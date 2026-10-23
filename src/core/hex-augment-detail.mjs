import {fingerprint} from './content-fingerprint.mjs';
// Full static source text is for inspection only. Recommendation reviews keep
// using the separately frozen summary and never inherit a tooltip's status.
export function hexAugmentDetail(augment){
 const reviewedTooltip=augment?.review?.patch==='16.21'&&augment.review.projectedTooltipHash===fingerprint(augment.tooltip);
 const tooltip=augment?.review&&!reviewedTooltip?null:augment?.tooltip,description=typeof tooltip?.description==='string'&&tooltip.description.trim()?tooltip.description:null;
 if(!description)return {description:augment?.description||'',partial:augment?.descriptionStatus==='partial'};
 return {description,partial:tooltip.status==='partial'};
}
