// Streaming UTF-8 CSV, including quoted newlines. Empty fields remain empty.
export async function* parseCsv(chunks,{maxRecordBytes=1_000_000}={}){
 let field='',record=[],quoted=false,pendingQuote=false,afterQuote=false,skipLf=false,headers=null,first=true,recordBytes=0;
 const decoder=new TextDecoder();
 function finish(){
  record.push(field);field='';afterQuote=false;recordBytes=0;
  if(!headers){headers=record;record=[];if(new Set(headers).size!==headers.length||headers.some(k=>!k))throw Error('Invalid CSV headers');return null;}
  if(record.length===1&&record[0]===''){record=[];return null;}
  if(record.length!==headers.length)throw Error('CSV columns do not match header');
  const result=Object.fromEntries(headers.map((k,i)=>[k,record[i]]));record=[];return result;
 }
 async function* consume(text){
  for(const ch of text){
   if(first){first=false;if(ch==='\ufeff')continue;}
   if(skipLf){skipLf=false;if(ch==='\n')continue;}
   recordBytes+=ch.codePointAt(0)<128?1:Buffer.byteLength(ch);if(recordBytes>maxRecordBytes)throw Error('CSV record exceeds budget');
   if(pendingQuote){pendingQuote=false;if(ch==='"'){field+='"';continue;}quoted=false;afterQuote=true;}
   if(quoted){if(ch==='"')pendingQuote=true;else field+=ch;continue;}
   if(ch==='"'){if(field||afterQuote)throw Error('Unexpected CSV quote');quoted=true;continue;}
   if(ch===','){record.push(field);field='';afterQuote=false;continue;}
   if(ch==='\n'||ch==='\r'){const row=finish();if(ch==='\r')skipLf=true;if(row)yield row;continue;}
   if(afterQuote)throw Error('Unexpected character after CSV quote');field+=ch;
  }
 }
 for await(const chunk of chunks){const text=typeof chunk==='string'?chunk:decoder.decode(chunk,{stream:true});yield* consume(text);}
 yield* consume(decoder.decode());
 if(pendingQuote){pendingQuote=false;quoted=false;afterQuote=true;}
 if(quoted)throw Error('Unterminated CSV quote');
 if(field||record.length||afterQuote){const row=finish();if(row)yield row;}
}
