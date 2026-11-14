/*
 * xxHash - Extremely Fast Hash algorithm
 * Header File
 * Copyright (C) 2012-2023 Yann Collet
 *
 * BSD 2-Clause License (https://www.opensource.org/licenses/bsd-license.php)
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *    * Redistributions of source code must retain the above copyright
 *      notice, this list of conditions and the following disclaimer.
 *    * Redistributions in binary form must reproduce the above
 *      copyright notice, this list of conditions and the following disclaimer
 *      in the documentation and/or other materials provided with the
 *      distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * You can contact the author at:
 *   - xxHash homepage: https://www.xxhash.com
 *   - xxHash source repository: https://github.com/Cyan4973/xxHash
 */
// Riot RST text keys use lowercase UTF-8 XXH3 with a 38-bit mask (CDTB >=15.2).
// This bounded port handles translation keys up to240 bytes. Unsupported keys
// remain unresolved; this non-cryptographic hash is never an integrity check.
// Upstream: github.com/Cyan4973/xxHash/blob/v0.8.3/xxhash.h (seed0 short-key paths).
const mask=(1n<<64n)-1n,prime1=0x9e3779b185ebca87n,mx1=0x165667919e3779f9n,mx2=0x9fb21c651e98df25n;
const secret=Buffer.from('b8fe6c3923a44bbe7c01812cf721ad1cded46de9839097db7240a4a4b7b3671fcb79e64eccc0e578825ad07dccff7221b8084674f743248ee03590e6813a264c3c2852bb91c300cb88d0658b1b532ea371644897a20df94e3819ef46a9deacd8a8fa763fe39c343ff9dcbbc7c70b4f1d8a51e04bcdb45931c89f7ec9d9787364eac5ac8334d3ebc3c581a0fffa1363eb170ddd51b7f0da49d316552629d4689e2b16be587d47a1fc8ff8b8d17ad031ce45cb3a8f95160428afd7fbcabb4b407e','hex');
const read64=(bytes,at)=>bytes.readBigUInt64LE(at),read32=(bytes,at)=>BigInt(bytes.readUInt32LE(at));
const rotate=(n,bits)=>((n<<BigInt(bits))|(n>>BigInt(64-bits)))&mask;
const fold=(a,b)=>{const product=a*b;return (product^(product>>64n))&mask;};
function avalanche(h){h^=h>>37n;h=(h*mx1)&mask;return h^(h>>32n);}
function classicAvalanche(h){h^=h>>33n;h=(h*0xc2b2ae3d27d4eb4fn)&mask;h^=h>>29n;h=(h*0x165667b19e3779f9n)&mask;return h^(h>>32n);}
function reverse(h){let result=0n;for(let i=0;i<8;i++){result=(result<<8n)|(h&255n);h>>=8n;}return result;}
function shortHash(bytes){
 const size=bytes.length,n=BigInt(size),mix=(at,key)=>fold(read64(bytes,at)^read64(secret,key),read64(bytes,at+8)^read64(secret,key+8));
 if(size===0)return classicAvalanche(read64(secret,56)^read64(secret,64));
 if(size<=3){const combined=BigInt(((bytes[0]<<16)|(bytes[size>>1]<<24)|bytes[size-1]|(size<<8))>>>0);return classicAvalanche(combined^(read32(secret,0)^read32(secret,4)));}
 if(size<=8){let h=(read32(bytes,size-4)|(read32(bytes,0)<<32n))^(read64(secret,8)^read64(secret,16));h^=rotate(h,49)^rotate(h,24);h=(h*mx2)&mask;h^=(h>>35n)+n;h=(h*mx2)&mask;return h^(h>>28n);}
 if(size<=16){const low=read64(bytes,0)^(read64(secret,24)^read64(secret,32)),high=read64(bytes,size-8)^(read64(secret,40)^read64(secret,48));return avalanche((n+reverse(low)+high+fold(low,high))&mask);}
 let acc=(n*prime1)&mask;
 if(size<=128){for(let i=0;i<=Math.floor((size-1)/32);i++)acc=(acc+mix(16*i,32*i)+mix(size-16*(i+1),32*i+16))&mask;return avalanche(acc);}
 for(let i=0;i<8;i++)acc=(acc+mix(16*i,16*i))&mask;
 let end=mix(size-16,119);acc=avalanche(acc);
 for(let i=8;i<Math.floor(size/16);i++)end=(end+mix(16*i,16*(i-8)+3))&mask;
 return avalanche((acc+end)&mask);
}
export function riotStringHash(key){
 if(typeof key!=='string'||key.length>240)return null;const bytes=Buffer.from(key.toLowerCase(),'utf8');if(bytes.length>240)return null;
 return '{'+(shortHash(bytes)&((1n<<38n)-1n)).toString(16).padStart(10,'0')+'}';
}
export function stringTableLookup(entries){
 const dictionary=new Map(Object.entries(entries||{}).filter(([,value])=>typeof value==='string').map(([key,value])=>[key.toLowerCase(),value]));
 return key=>{if(typeof key!=='string')return undefined;const name=key.toLowerCase();if(dictionary.has(name))return dictionary.get(name);const hashed=riotStringHash(name);return hashed===null?undefined:dictionary.get(hashed);};
}
