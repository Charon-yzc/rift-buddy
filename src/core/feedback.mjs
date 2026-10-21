export const FEEDBACK_LIMITS=Object.freeze({text:2000,images:3,imageBytes:10*1024*1024,bodyBytes:14*1024*1024,pixels:16*1024*1024,dimension:8192});
export const FEEDBACK_URL='https://room.riftbuddy.dpdns.org/v1/feedback';
export function feedbackText(value){
 if(typeof value!=='string'||value.length>FEEDBACK_LIMITS.text||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))throw Error('文字最多2000字');
 return value.trim();
}
