export const FEATURE_SCHEMA='win-probability-offline-v1';
const patchParts=value=>{if(!/^\d+\.\d+$/.test(value||''))throw Error('Invalid patch');return value.split('.').map(Number);};
export function comparePatch(a,b){const x=patchParts(a),y=patchParts(b);return x[0]-y[0]||x[1]-y[1];}
export function splitByPatch(rows,{calibrationPatch,testPatch}){
 if(comparePatch(calibrationPatch,testPatch)>=0)throw Error('Invalid patch boundary order');
 const seen=new Map(),result={train:[],calibration:[],test:[],method:'whole-match-patch-holdout',calibrationPatch,testPatch};
 for(const row of rows){
  if(typeof row.game!=='string'||!row.game||![0,1].includes(row.label))throw Error('Invalid match or label');
  patchParts(row.patch);const prior=seen.get(row.game);
  if(prior&&prior.patch!==row.patch)throw Error('One match has multiple patches');
  if(prior&&prior.label!==row.label)throw Error('Outcome conflict within match');
  seen.set(row.game,row);
  const key=comparePatch(row.patch,calibrationPatch)<0?'train':comparePatch(row.patch,testPatch)<0?'calibration':'test';
  result[key].push(row);
 }
 if(['train','calibration','test'].some(key=>!result[key].length))throw Error('Empty independent split');
 return result;
}
export function pregameFeatures(blue,red,vocabulary){
 if(!Array.isArray(blue)||!Array.isArray(red)||blue.length!==5||red.length!==5)throw Error('Draft must be complete');
 const all=[...blue,...red];if(all.some(id=>!Number.isSafeInteger(id)||id<=0))throw Error('Invalid champion');
 if(new Set(all).size!==10)throw Error('Draft contains duplicate champion');
 const known=new Set(vocabulary);if(all.some(id=>!known.has(id)))throw Error('Draft contains unknown champion');
 const b=new Set(blue),r=new Set(red);return vocabulary.map(id=>Number(b.has(id))-Number(r.has(id)));
}
export function validateSnapshot({players,time}){
 if(!Number.isFinite(time)||time<0)return {valid:false,reason:'unknown-time'};
 if(!Array.isArray(players)||players.length!==10)return {valid:false,reason:'incomplete-teams'};
 if(new Set(players.map(p=>p.slot)).size!==10||players.some(p=>!Number.isInteger(p.slot)||p.slot<0||p.slot>9))return {valid:false,reason:'duplicate-or-invalid-slot'};
 for(const side of ['blue','red'])if(players.filter(p=>p.side===side).length!==5)return {valid:false,reason:'incomplete-teams'};
 if(players.some(p=>!Number.isInteger(p.level)||p.level<1||p.level>18||['kills','deaths','assists','cs'].some(k=>!Number.isInteger(p[k])||p[k]<0)))return {valid:false,reason:'unknown-measurement'};
 return {valid:true};
}
export function liveFeatures(snapshot){
 const valid=validateSnapshot(snapshot);if(!valid.valid)throw Error(`Unavailable snapshot: ${valid.reason}`);
 const sum=(side,key)=>snapshot.players.filter(p=>p.side===side).reduce((s,p)=>s+p[key],0);
 return [snapshot.time/60,(sum('blue','level')-sum('red','level'))/5,sum('blue','cs')-sum('red','cs'),sum('blue','kills')-sum('red','kills'),sum('blue','deaths')-sum('red','deaths'),sum('blue','assists')-sum('red','assists')];
}
export function equalMatchWeights(rows){
 const counts=new Map();for(const row of rows)counts.set(row.game,(counts.get(row.game)||0)+1);
 return rows.map(row=>1/counts.get(row.game));
}
