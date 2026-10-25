// Offline metrics. Every match receives equal total weight across its snapshots.
export function evaluatePredictions(rows,{bins=10}={}){
 if(!Array.isArray(rows)||!rows.length)throw Error('No predictions');
 const games=new Map();
 for(const row of rows){
  if(typeof row.game!=='string'||!row.game||![0,1].includes(row.label))throw Error('Invalid match or label');
  if(!Number.isFinite(row.probability)||row.probability<0||row.probability>1)throw Error('Invalid probability');
  const old=games.get(row.game);if(old&&old.label!==row.label)throw Error('Outcome conflict within match');
  games.set(row.game,{label:row.label,count:(old?.count||0)+1});
 }
 const reliability=Array.from({length:bins},(_,index)=>({low:index/bins,high:(index+1)/bins,rows:0,weight:0,predicted:0,observed:0}));
 let brier=0,logLoss=0,accuracy=0,positive=0,negative=0;
 const sorted=rows.map(row=>({...row,weight:1/games.get(row.game).count})).sort((a,b)=>a.probability-b.probability);
 for(const {label,probability:p,weight:w} of sorted){
  brier+=w*(p-label)**2;logLoss-=w*(label*Math.log(Math.max(1e-15,p))+(1-label)*Math.log(Math.max(1e-15,1-p)));
  accuracy+=w*Number(Number(p>=.5)===label);if(label)positive+=w;else negative+=w;
  const bin=reliability[Math.min(bins-1,Math.floor(p*bins))];bin.rows++;bin.weight+=w;bin.predicted+=p*w;bin.observed+=label*w;
 }
 let negativesBelow=0,pairs=0;
 for(let i=0;i<sorted.length;){let j=i,pos=0,neg=0;
  while(j<sorted.length&&sorted[j].probability===sorted[i].probability){if(sorted[j].label)pos+=sorted[j].weight;else neg+=sorted[j].weight;j++;}
  pairs+=pos*(negativesBelow+.5*neg);negativesBelow+=neg;i=j;
 }
 let ece=0;
 const resultBins=reliability.map(bin=>{if(!bin.weight)return {...bin,predicted:null,observed:null};const predicted=bin.predicted/bin.weight,observed=bin.observed/bin.weight;ece+=bin.weight*Math.abs(predicted-observed);return {...bin,predicted,observed};});
 const n=games.size;
 return {rows:rows.length,games:n,positiveRate:positive/n,brier:brier/n,logLoss:logLoss/n,accuracy:accuracy/n,auc:positive&&negative?pairs/(positive*negative):null,ece:ece/n,reliability:resultBins};
}
