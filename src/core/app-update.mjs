export const RELEASE_FEED_URL='https://github.com/Legender134/rift-buddy/releases.atom';
const TAG_PATTERN=/^v?\d+\.\d+\.\d+$/;
export function parseReleaseFeed(xml){
 if(typeof xml!=='string'||!xml.includes('<feed'))throw Error('更新目录格式不正确');
 const entries=[];
 for(const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)){
  const body=m[1],link=(body.match(/<link[^>]*href="([^"]+)"/)||[])[1]||'';
  const tag=(link.match(/\/releases\/tag\/([^"/]+)/)||[])[1]||'';
  const updated=(body.match(/<updated>([^<]+)<\/updated>/)||[])[1]||'';
  if(!TAG_PATTERN.test(tag)||!Number.isFinite(Date.parse(updated)))continue;
  entries.push({tag,version:tag.replace(/^v/,''),updated,url:link});
 }
 return entries;
}
export function compareVersions(a,b){
 const parts=v=>String(v).replace(/^v/,'').split('.').map(n=>Number.isFinite(Number(n))?Number(n):0);
 const [x,y]=[parts(a),parts(b)];
 for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d)return d>0?1:-1;}
 return 0;
}
export const newestRelease=entries=>entries.reduce((best,e)=>!best||compareVersions(e.version,best.version)>0?e:best,null);
export const isNewerThan=(latest,current)=>compareVersions(latest,current)>0;
export const setupFileName=v=>`RiftBuddy-${v}-Setup.exe`;
export const checksumFileName=v=>`SHA256SUMS-${v}.txt`;
export function releaseDownloadUrl(tag,file){
 if(!TAG_PATTERN.test(tag)||typeof file!=='string'||/[\r\n]/.test(file)||file.split(/[\\/]/).some(p=>!p||p==='.'||p==='..'))throw Error('更新地址格式不正确');
 return `https://github.com/Legender134/rift-buddy/releases/download/${tag}/${file}`;
}
export function parseChecksumFile(text,fileName){
 if(typeof text!=='string'||text.length>65536)throw Error('校验文件格式不正确');
 for(const line of text.split('\n')){const m=line.trim().match(/^([0-9a-f]{64})\s{1,2}(\S+)$/);if(m&&m[2]===fileName)return m[1];}
 throw Error(`校验文件缺少${fileName}，无法确认安装包完整性`);
}
export function releasePageUrl(tag){
 if(!TAG_PATTERN.test(tag))throw Error('更新地址格式不正确');
 return `https://github.com/Legender134/rift-buddy/releases/tag/${tag}`;
}
// 发布说明链接白名单（与 catalog.mjs safeSourceURL 同等严格，外加本仓库 release 路径限定）。
export function isReleaseNotesUrl(value){
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&!u.username&&!u.password&&u.host==='github.com'&&String(value).length<=1000
   &&u.pathname.startsWith('/Legender134/rift-buddy/releases/tag/');
 }catch{return false;}
}
