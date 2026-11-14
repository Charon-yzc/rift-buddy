import {crc32} from 'node:zlib';
import {FEEDBACK_LIMITS as L} from '../src/core/feedback.mjs';

export function feedbackImageDimensions(bytes){
 let width,height;
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.length>=24){width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);}
 else if(bytes[0]===255&&bytes[1]===216){
  let at=2;while(at+4<=bytes.length){if(bytes[at++]!==255)break;while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;
   const len=bytes.readUInt16BE(at);if(len<2||at+len>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&len>=8){height=bytes.readUInt16BE(at+3);width=bytes.readUInt16BE(at+5);break;}at+=len;
  }
 }
 if(!width||!height||width>L.dimension||height>L.dimension||width*height>L.pixels)throw Error('请使用分辨率不超过1600万像素的PNG或JPG截图');
 return {width,height};
}

// Only re-encoded PNGs travel to the server. No original filename or metadata.
export function validateFeedbackPng(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<57||bytes.length>L.imageBytes||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('图片格式无效');
 let at=8,count=0,idat=false,ended=false,width,height;
 while(at<bytes.length){
  if(++count>4096||at+12>bytes.length)throw Error('图片格式无效');
  const len=bytes.readUInt32BE(at),type=bytes.toString('ascii',at+4,at+8),end=at+12+len;
  if(end>bytes.length||crc32(bytes.subarray(at+4,at+8+len))!==bytes.readUInt32BE(at+8+len))throw Error('图片格式无效');
  if(count===1){if(type!=='IHDR'||len!==13)throw Error('图片格式无效');width=bytes.readUInt32BE(at+8);height=bytes.readUInt32BE(at+12);if(!width||!height||width>L.dimension||height>L.dimension||width*height>L.pixels)throw Error('图片分辨率过大');}
  else if(type==='IHDR')throw Error('图片格式无效');
  if(type==='IDAT')idat=true;
  if(type==='IEND'){if(len||end!==bytes.length||!idat)throw Error('图片格式无效');ended=true;}
  at=end;
 }
 if(!ended)throw Error('图片格式无效');return {width,height};
}
