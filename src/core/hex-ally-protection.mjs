import review from './hex-ally-protection-review.json' with {type:'json'};
import {mechanicSourceInput} from './mechanic-source.mjs';
import {fingerprint} from './content-fingerprint.mjs';

// A named ally-protection path is not a full-kit review, an offer pool, or
// evidence that this augment is stronger than another actual choice.
export function hexAllyProtection(champion,patch,{ultimateDisabled=false}={}){
 const record=review.heroes[champion?.id],source=mechanicSourceInput(champion,patch);
 if(review.schema!==1||review.scope!=='hex-1141-ally-protection'||patch!==review.patch||!record||!source||fingerprint(source)!==fingerprint(record.source))return null;
 if(!Array.isArray(record.channels)||!record.channels.length||record.channels.length>5||record.channels.some(c=>!['P','Q','W','E','R'].includes(c.slot)||typeof c.condition!=='string'||!c.condition.trim()||c.condition.length>180))return null;
 const active=record.channels.filter(c=>!ultimateDisabled||c.slot!=='R'),blocked=record.channels.filter(c=>ultimateDisabled&&c.slot==='R'),cautions=[];
 if(blocked.length)cautions.push(active.length?'已选回归基本功，R 的友方治疗或护盾路径已撤回；仍须满足上列基础技能条件。':'已选回归基本功，R 无法使用，本次核对的友方治疗或护盾路径不能利用；装备等其他途径须另行核对，不据此认定强化整体无效。');
 if(ultimateDisabled&&champion.id==='Nidalee')cautions.push('回归基本功禁用形态切换；这里只确认人类形态 E，不推定当前形态或仍能切回人类。');
 return {scope:review.scope,available:active.length>0,conditions:active.map(c=>c.condition),cautions};
}
