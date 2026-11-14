const sigmoid=x=>x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x));
const logit=p=>Math.log(Math.max(1e-6,Math.min(1-1e-6,p))/(1-Math.max(1e-6,Math.min(1-1e-6,p))));
function validate(matrix,labels){
 if(!Array.isArray(matrix)||!matrix.length||matrix.length!==labels.length||!matrix[0].length)throw Error('Invalid training rows');
 const width=matrix[0].length;
 if(matrix.some(row=>row.length!==width||row.some(v=>!Number.isFinite(v))))throw Error('Features must be finite');
 if(labels.some(v=>![0,1].includes(v))||new Set(labels).size!==2)throw Error('Training needs both classes');
 return width;
}
export function fitLogistic(matrix,labels,{iterations=160,l2=.01,learningRate=.3,weights=null}={}){
 const d=validate(matrix,labels),n=matrix.length,w=weights||Array(n).fill(1),total=w.reduce((a,b)=>a+b,0);
 if(w.length!==n||w.some(v=>!Number.isFinite(v)||v<=0))throw Error('Invalid training weights');
 const means=Array(d).fill(0),scales=Array(d).fill(0);
 for(let i=0;i<n;i++)for(let j=0;j<d;j++)means[j]+=matrix[i][j]*w[i]/total;
 for(let i=0;i<n;i++)for(let j=0;j<d;j++)scales[j]+=(matrix[i][j]-means[j])**2*w[i]/total;
 for(let j=0;j<d;j++)scales[j]=Math.sqrt(scales[j])||1;
 const x=matrix.map(row=>Float64Array.from(row,(v,j)=>(v-means[j])/scales[j]));
 const coefficients=new Float64Array(d),grad=new Float64Array(d);
 const positive=labels.reduce((s,y,i)=>s+y*w[i],0)/total;let intercept=logit(positive);
 for(let step=0;step<iterations;step++){
  grad.fill(0);let biasGrad=0;
  for(let i=0;i<n;i++){let z=intercept;for(let j=0;j<d;j++)z+=coefficients[j]*x[i][j];const error=(sigmoid(z)-labels[i])*w[i]/total;biasGrad+=error;for(let j=0;j<d;j++)grad[j]+=error*x[i][j];}
  const rate=learningRate/Math.sqrt(1+step/40);intercept-=rate*biasGrad;
  for(let j=0;j<d;j++)coefficients[j]-=rate*(grad[j]+l2*coefficients[j]);
 }
 return {kind:'l2-logistic-v1',means,scales,coefficients:Array.from(coefficients),intercept,iterations,l2,learningRate};
}
export function predictLogistic(model,row){
 if(row.length!==model.coefficients.length||row.some(v=>!Number.isFinite(v)))throw Error('Features must be finite and aligned');
 let z=model.intercept;for(let j=0;j<row.length;j++)z+=model.coefficients[j]*(row[j]-model.means[j])/model.scales[j];return sigmoid(z);
}
export function fitCalibration(probabilities,labels,{iterations=400,learningRate=.1,weights=null}={}){
 if(probabilities.length!==labels.length||!labels.length||new Set(labels).size!==2||labels.some(y=>![0,1].includes(y)))throw Error('Calibration needs both classes');
 if(probabilities.some(p=>!Number.isFinite(p)||p<0||p>1))throw Error('Invalid calibration probability');
 const w=weights||Array(labels.length).fill(1);if(w.length!==labels.length||w.some(v=>!Number.isFinite(v)||v<=0))throw Error('Invalid calibration weights');
 const total=w.reduce((a,b)=>a+b,0),x=probabilities.map(logit);let slope=1,intercept=0;
 for(let step=0;step<iterations;step++){let a=0,b=0;for(let i=0;i<x.length;i++){const error=(sigmoid(slope*x[i]+intercept)-labels[i])*w[i]/total;a+=error*x[i];b+=error;}slope=Math.max(.001,slope-learningRate*a);intercept-=learningRate*b;}
 return {kind:'positive-slope-sigmoid-v1',slope,intercept};
}
export function calibratedProbability(calibrator,probability){return calibrator?sigmoid(calibrator.slope*logit(probability)+calibrator.intercept):probability;}
