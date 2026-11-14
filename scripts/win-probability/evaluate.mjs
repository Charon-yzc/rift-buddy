import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {splitByPatch,pregameFeatures,equalMatchWeights,FEATURE_SCHEMA} from './contract.mjs';
import {evaluatePredictions} from './metrics.mjs';
import {fitLogistic,predictLogistic,fitCalibration,calibratedProbability} from './model.mjs';
import {DEFAULT_ROOT} from './sources.mjs';
export function evaluateBaseline(dataset,{calibrationPatch='16.17',testPatch='16.18',iterations=160}={}){
 if(new Set(dataset.rows.map(r=>r.game)).size!==dataset.rows.length)throw Error('Duplicate pregame match row');
 const split=splitByPatch(dataset.rows,{calibrationPatch,testPatch}),matrix=rows=>rows.map(r=>pregameFeatures(r.blue,r.red,dataset.vocabulary));
 const trainX=matrix(split.train),trainY=split.train.map(r=>r.label),model=fitLogistic(trainX,trainY,{iterations,l2:.01,learningRate:.3});
 const predict=rows=>{const x=matrix(rows);return rows.map((r,i)=>({game:r.game,label:r.label,probability:predictLogistic(model,x[i])}));};
 const calibration=predict(split.calibration),test=predict(split.test),calibrator=fitCalibration(calibration.map(r=>r.probability),calibration.map(r=>r.label));
 const constant=trainY.reduce((a,b)=>a+b,0)/trainY.length;
 const report={schema:1,featureSchema:FEATURE_SCHEMA,source:dataset.source,scope:'Public overseas champion-set baseline; exact queue and creation times unverified; not CN calibration',split:{method:split.method,calibrationPatch,testPatch,...Object.fromEntries(['train','calibration','test'].map(k=>[k,{games:split[k].length,patches:[...new Set(split[k].map(r=>r.patch))],regions:[...new Set(split[k].map(r=>r.region))]}]))},features:{kind:'unordered-champion-set-difference',count:dataset.vocabulary.length,playerHistory:false,roles:false,postgameMeasurements:false},hyperparameters:{iterations,l2:.01,learningRate:.3,selectedBeforeTest:true},calibration:{kind:calibrator.kind,slope:calibrator.slope,intercept:calibrator.intercept,fittedOn:'calibration-only'},test:{constant:evaluatePredictions(test.map(r=>({...r,probability:constant}))),logistic:evaluatePredictions(test),calibratedLogistic:evaluatePredictions(test.map(r=>({...r,probability:calibratedProbability(calibrator,r.probability)})))},limitations:['No exact queue IDs or match creation timestamps in source.','Patch holdout is not a within-patch chronological test.','No CN data; reported calibration applies only to held-out public-source samples.','Champion-set baseline has no confirmed roles, player history or live states.','Reliability bins are descriptive, not proof of calibration in every subgroup.']};
 return {report,model,calibrator};
}
export function evaluateLiveBaseline(dataset,{calibrationPatch='16.17',testPatch='16.18',iterations=160}={}){
 if(!dataset.rows.length)return {status:'unavailable',reason:'No complete ten-player snapshots in audited source',modelsTrained:0};
 let split;
 try{split=splitByPatch(dataset.rows,{calibrationPatch,testPatch});}
 catch(error){if(error.message!=='Empty independent split')throw error;return {status:'unavailable',reason:error.message,modelsTrained:0};}
 if(['train','calibration','test'].some(k=>new Set(split[k].map(r=>r.label)).size!==2))return {status:'unavailable',reason:'Independent splits need both outcome classes',modelsTrained:0};
 const weights=equalMatchWeights(split.train);
 const model=fitLogistic(split.train.map(r=>r.features),split.train.map(r=>r.label),{iterations,l2:.01,weights});
 const predict=rows=>rows.map(r=>({game:r.game,label:r.label,time:r.time,probability:predictLogistic(model,r.features)}));
 const calibration=predict(split.calibration),test=predict(split.test),calibrator=fitCalibration(calibration.map(r=>r.probability),calibration.map(r=>r.label),{weights:equalMatchWeights(calibration)});
 const constant=split.train.reduce((s,r,i)=>s+r.label*weights[i],0)/weights.reduce((a,b)=>a+b,0);
 const calibrated=test.map(r=>({...r,probability:calibratedProbability(calibrator,r.probability)}));
 return {status:'evaluated',scope:'Public source complete-team scoreboard baseline, not CN validation',split:{method:split.method,calibrationPatch,testPatch,counts:Object.fromEntries(['train','calibration','test'].map(k=>[k,{rows:split[k].length,games:new Set(split[k].map(r=>r.game)).size}]))},test:{constant:evaluatePredictions(test.map(r=>({...r,probability:constant}))),logistic:evaluatePredictions(test),calibratedLogistic:evaluatePredictions(calibrated)},timeBands:[5,10,15,20,25,30,35,40].map(minute=>{const rows=calibrated.filter(r=>r.time>=minute*60&&r.time<(minute+5)*60);return {fromMinute:minute,toMinute:minute+5,metrics:rows.length?evaluatePredictions(rows):null};}),model,calibrator};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),i=args.indexOf('--root'),root=i>=0?args[i+1]:DEFAULT_ROOT;
 const raw=await fs.readFile(path.resolve(root,'prepared/pregame.json')),dataset=JSON.parse(raw),result=evaluateBaseline(dataset);
 result.report.inputSha256=createHash('sha256').update(raw).digest('hex');result.report.runtime=process.version;
 const live=JSON.parse(await fs.readFile(path.resolve(root,'prepared/live.json'),'utf8'));const liveResult=evaluateLiveBaseline(live);
 const {model:liveModel,calibrator:liveCalibrator,...liveReport}=liveResult;result.report.live=liveReport;
 await fs.writeFile(path.resolve(root,'baseline-results.json'),JSON.stringify(result.report,null,2)+'\n');
 await fs.writeFile(path.resolve(root,'baseline-model.evaluation.json'),JSON.stringify({schema:FEATURE_SCHEMA,source:dataset.source,vocabulary:dataset.vocabulary,model:result.model,calibrator:result.calibrator,productionReady:false}));
 console.log(JSON.stringify({split:result.report.split,test:Object.fromEntries(Object.entries(result.report.test).map(([k,v])=>[k,{games:v.games,brier:v.brier,logLoss:v.logLoss,auc:v.auc,accuracy:v.accuracy,ece:v.ece}]))},null,2));
}
