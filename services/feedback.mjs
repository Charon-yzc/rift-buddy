import https from 'node:https';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {FEEDBACK_LIMITS as L,FEEDBACK_URL,feedbackText} from '../src/core/feedback.mjs';
import {validateFeedbackPng} from './feedback-images.mjs';

export function createFeedbackClient({chooseFiles,encodeImage,version,request=https.request,now=Date.now}){
 let pending=new Map(),busy=false,last=-Infinity,picking=false,epoch=0,expiry;
 const clear=()=>{epoch++;clearTimeout(expiry);pending.clear();};
 async function choose(){
  if(busy||picking)throw Error('请等待当前操作完成');picking=true;const generation=++epoch;
  try{
   const files=await chooseFiles();if(!files)return null;
   if(files.length>L.images)throw Error('最多选择3张图片');const next=new Map(),views=[];let total=0;
   for(const file of files){
    const info=await fs.stat(file);if(!info.isFile()||info.size>L.imageBytes)throw Error('图片合计不超过10MB');
    // Read with a hard bound even if the chosen file grows after stat().
    const handle=await fs.open(file,'r');let original;try{original=Buffer.alloc(info.size+1);const {bytesRead}=await handle.read(original,0,original.length,0);if(bytesRead!==info.size)throw Error('图片已变化，请重新选择');original=original.subarray(0,bytesRead);}finally{await handle.close();}
    const {bytes,preview}=await encodeImage(original);validateFeedbackPng(bytes);total+=bytes.length;if(total>L.imageBytes)throw Error('图片合计不超过10MB');
    const id=randomUUID();next.set(id,bytes);views.push({id,preview});
   }
   if(generation!==epoch)return null;clearTimeout(expiry);pending=next;expiry=setTimeout(clear,600000);expiry.unref?.();return views;
  }finally{picking=false;}
 }
 async function send(input){
  if(busy||picking)throw Error('请等待当前操作完成');if(now()-last<30000)throw Error('请稍后再发');
  const text=feedbackText(input?.text),ids=input?.images;
  if(input?.consent!==true||!Array.isArray(ids)||ids.length>L.images||new Set(ids).size!==ids.length||ids.some(id=>!pending.has(id)))throw Error('请确认反馈内容和图片');
  if(!text&&!ids.length)throw Error('请填写问题或添加截图');
  const body=Buffer.from(JSON.stringify({version:1,appVersion:version,text,images:ids.map(id=>({type:'image/png',data:pending.get(id).toString('base64')}))}));
  if(body.length>L.bodyBytes)throw Error('反馈过大');busy=true;last=now();
  try{
   const result=await new Promise((resolve,reject)=>{
    let req,timer,settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(Error(error));else resolve(value);};const fail=message=>{finish(message);req?.destroy();};
    try{req=request(new URL(FEEDBACK_URL),{method:'POST',headers:{'Content-Type':'application/json','Content-Length':body.length},agent:false},res=>{
     const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>4096){res.destroy();fail('反馈响应无效');}else chunks.push(b);});res.on('error',()=>fail('发送未完成，请稍后重试'));res.on('end',()=>{
      if(res.statusCode!==201){finish(res.statusCode===429?'发送太频繁，请稍后再试':res.statusCode===503?'反馈暂满，请稍后再试':'发送未完成，请稍后重试');return;}
      try{const out=JSON.parse(Buffer.concat(chunks));if(!/^[0-9a-f-]{36}$/.test(out.id))throw Error();finish(null,{id:out.id});}catch{finish('反馈响应无效');}
     });
    });req.on('error',()=>finish('发送未完成，请稍后重试'));timer=setTimeout(()=>fail('发送超时，请稍后重试'),20000);timer.unref?.();req.end(body);}catch{finish('发送未完成，请稍后重试');}
   });clear();return result;
  }finally{busy=false;}
 }
 return {choose,send,clear};
}
