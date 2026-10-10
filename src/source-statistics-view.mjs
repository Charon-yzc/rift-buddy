// Each row keeps its own source denominator. Missing values are not zero.
export function sourceStatisticsLabel(row,{source=row?.source,scope='来源'}={}){
 if(!(Number.isSafeInteger(row?.samples)&&row.samples>0))return source==='OP.GG'?`${scope}样本未提供`:source==='个人自选'?'个人自选 · 无统计样本':'机制备选 · 无统计样本';
 const percentage=(value,label)=>Number.isFinite(value)&&value>=0&&value<=100?`${label} ${value.toFixed(1)}%`:`${label}未提供`;
 return `${row.samples.toLocaleString()} 场${scope}样本${row.samples<200?' · 样本较少':''} · ${percentage(row.winRate,'胜率')} · ${percentage(row.pickRate,'使用率')}`;
}
