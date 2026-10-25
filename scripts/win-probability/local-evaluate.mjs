import {createHash} from 'node:crypto';
import {chronologicalSplit} from './local-features.mjs';
import {equalMatchWeights} from './contract.mjs';
import {fitLogistic,predictLogistic,fitCalibration,calibratedProbability} from './model.mjs';
import {evaluatePredictions} from './metrics.mjs';
function trainAndReport(split,features){
 const weights=equalMatchWeights(split.train),model=fitLogistic(split.train.map(features),split.train.map(r=>r.label),{iterations:160,l2:.1,learningRate:.15,weights});
 const predictions=rows=>rows.map(r=>({game:r.game,label:r.label,time:r.time,probability:predictLogistic(model,features(r))}));
 const calibration=predictions(split.calibration),canCalibrate=new Set(calibration.map(r=>r.label)).size===2,calibrator=canCalibrate?fitCalibration(calibration.map(r=>r.probability),calibration.map(r=>r.label),{weights:equalMatchWeights(calibration)}):null,raw=predictions(split.test),calibrated=calibrator?raw.map(r=>({...r,probability:calibratedProbability(calibrator,r.probability)})):null;
 return {trainingFingerprint:createHash('sha256').update(JSON.stringify(model)).digest('hex'),calibration:calibrator,calibrationUnavailableReason:canCalibrate?null:'Calibration set contains only one outcome class',raw:evaluatePredictions(raw),calibrated:calibrated?evaluatePredictions(calibrated):null,timeBands:[5,10,15,20,25,30,35,40].map(minute=>{const r=(calibrated||raw).filter(v=>v.time>=minute*60&&v.time<(minute+5)*60);return {minute,calibrated:!!calibrator,metrics:r.length?evaluatePredictions(r):null};})};
}
const splitCounts=split=>Object.fromEntries(['train','calibration','test'].map(k=>[k,{games:new Set(split[k].map(r=>r.game)).size,rows:split[k].length}]));
function eligibleSplit(rows){const split=chronologicalSplit(rows);if(new Set(split.train.map(r=>r.label)).size<2)throw Error('Training needs both outcome classes');return split;}
export function evaluateLocalExperiment({pregame,live,featureNames}){
 if(new Set(pregame.map(r=>r.game)).size!==pregame.length)throw Error('Duplicate pregame target');
 const targetMetadata=new Map(pregame.map(r=>[r.game,r]));
 for(const row of live){const target=targetMetadata.get(row.game);if(!target||target.created!==row.created||target.label!==row.label||target.endedAt!==row.endedAt)throw Error('Live/target metadata conflict');}
 const result={schema:1,scope:'Small local CN feasibility sample; exploratory, not production calibration',hyperparameters:{kind:'l2-logistic',iterations:160,l2:.1,learningRate:.15,fixedBeforeTest:true},featureNames};
 let split;
 try{split=eligibleSplit(pregame);}catch(error){result.pregame={status:'unavailable',reason:error.message};result.live={status:'unavailable',reason:'No valid independent pregame split'};return result;}
 const trainRate=split.train.reduce((s,r)=>s+r.label,0)/split.train.length;
 result.pregame={status:'evaluated',split:{method:split.method,purgedGames:split.purgedGames,...splitCounts(split)},testGames:new Set(split.test.map(r=>r.game)).size,constant:evaluatePredictions(split.test.map(r=>({game:r.game,label:r.label,probability:trainRate}))),coverage:{meanPlayersWithHistory:pregame.reduce((s,r)=>s+r.coverage,0)/pregame.length},models:{champions:trainAndReport(split,r=>r.champions),championsAndHistory:trainAndReport(split,r=>[...r.champions,...r.history])}};
 result.pregame.classBalance=Object.fromEntries(['train','calibration','test'].map(k=>[k,{losses:split[k].filter(r=>r.label===0).length,wins:split[k].filter(r=>r.label===1).length}]));
 if(!result.pregame.models.champions.calibration)result.pregame.status='evaluated-without-calibration';
 if(!live.length){result.live={status:'unavailable',reason:'No eligible complete-team timelines'};return result;}
 const liveSplit={...split,train:[],calibration:[],test:[]};
 const memberships=new Map(['train','calibration','test'].flatMap(k=>split[k].map(r=>[r.game,k])));
 for(const row of live){const k=memberships.get(row.game);if(!k){if(pregame.some(r=>r.game===row.game))continue;throw Error('Timeline has no target match');}liveSplit[k].push(row);}
 if(['train','calibration','test'].some(k=>!liveSplit[k].length||new Set(liveSplit[k].map(r=>r.label)).size!==2)){result.live={status:'unavailable',reason:'Live split has insufficient games or outcomes'};return result;}
 const w=equalMatchWeights(liveSplit.train),rate=liveSplit.train.reduce((s,r,i)=>s+r.label*w[i],0)/w.reduce((a,b)=>a+b,0);
 result.live={status:'evaluated',split:splitCounts(liveSplit),constant:evaluatePredictions(liveSplit.test.map(r=>({game:r.game,label:r.label,probability:rate}))),scoreboard:trainAndReport(liveSplit,r=>r.features)};
 return result;
}
