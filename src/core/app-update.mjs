export const RELEASE_FEED_URL='https://github.com/Legender134/rift-buddy/releases.atom';
export const GITEE_REPOSITORY_URL='https://gitee.com/legender134/rift-buddy';
export const GITEE_RELEASE_FEED_URL=GITEE_REPOSITORY_URL.replace('gitee.com/','gitee.com/api/v5/repos/')+'/releases?per_page=10';
export const mirrorManifestName=v=>`RiftBuddy-${v}-Mirror.json`;
export const mirrorPartName=(v,index)=>`${setupFileName(v)}.part${String(index+1).padStart(2,'0')}`;
export const MIRROR_PART_BYTES=90*1024*1024;
export function giteeReleaseUrl(tag){
 if(!TAG_PATTERN.test(tag))throw Error('更新地址格式不正确');
 return `${GITEE_REPOSITORY_URL}/releases/${tag}`;
}
export function giteeDownloadUrl(tag,file){
 if(!TAG_PATTERN.test(tag)||!/^RiftBuddy-[\d.]+-(?:Setup\.exe(?:\.part\d{2})?|Mirror\.json)$/.test(file))throw Error('国内镜像附件名称不正确');
 return `${GITEE_REPOSITORY_URL}/releases/download/${tag}/${file}`;
}
export function parseGiteeReleases(text){
 const rows=JSON.parse(text);if(!Array.isArray(rows))throw Error('国内镜像目录格式不正确');
 return rows.filter(r=>r&&TAG_PATTERN.test(r.tag_name)&&Number.isFinite(Date.parse(r.created_at))).map(r=>{
  const version=r.tag_name.replace(/^v/,'');
  return {tag:r.tag_name,version,updated:r.created_at,url:giteeReleaseUrl(r.tag_name),source:'gitee',manualOnly:!Array.isArray(r.assets)||!r.assets.some(a=>a?.name===mirrorManifestName(version)&&a.browser_download_url===giteeDownloadUrl(r.tag_name,a.name))};
 });
}
export function parseMirrorManifest(text,release){
 const m=JSON.parse(text),version=release.version;
 if(!/^\d+\.\d+\.\d+$/.test(version)||![version,`v${version}`].includes(release.tag)||m?.schema!==1||m.version!==version||m.tag!==release.tag||m.file!==setupFileName(version)||!Number.isSafeInteger(m.bytes)||m.bytes<=0||m.bytes>512*1024*1024||!/^([0-9a-f]{64})$/.test(m.sha256)||!Array.isArray(m.parts)||!m.parts.length||m.parts.length>16)throw Error('国内镜像清单格式不正确');
 let total=0;
 const parts=m.parts.map((p,i)=>{
  if(p?.name!==mirrorPartName(version,i)||!Number.isSafeInteger(p.bytes)||p.bytes<=0||p.bytes>MIRROR_PART_BYTES||!/^([0-9a-f]{64})$/.test(p.sha256))throw Error('国内镜像分卷格式不正确');
  total+=p.bytes;return {name:p.name,bytes:p.bytes,sha256:p.sha256};
 });
 if(total!==m.bytes)throw Error('国内镜像分卷大小不一致');
 return {schema:1,version,tag:m.tag,file:m.file,bytes:m.bytes,sha256:m.sha256,parts};
}
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
// 默认下载镜像（2026-10-12 实测：约 850KB/s，为直连约 1.8 倍；第三方代理可用性
// 按天变化，失败时自动回落直连并明示，见服务层）。用户清空偏好则直连。
export const DEFAULT_UPDATE_MIRROR='https://gh-proxy.com';
export const UPDATE_MIRROR_PRESETS=['https://gh-proxy.com','https://gh.llkk.cc'];
export function normalizeMirrorBase(value){
 if(value===undefined||value===null||String(value).trim()==='')return '';
 const clean=String(value).trim().replace(/\/+$/,'');
 let u;try{u=new URL(clean);}catch{throw Error('下载镜像地址格式不正确，应为 https:// 开头的地址');}
 if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('下载镜像地址必须是没有账号信息与端口的 HTTPS 地址');
 if(u.search||u.hash)throw Error('下载镜像地址不能带查询参数与锚点');
 if(clean.length>200)throw Error('下载镜像地址过长');
 return clean;
}
export function mirrorAssetUrl(mirror,url){
 const base=normalizeMirrorBase(mirror);
 if(!base)return String(url);
 return `${base}/${String(url)}`;
}
export function isReleaseNotesUrl(value){
 try{
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||String(value).length>1000)return false;
  if(u.host==='gitee.com')return /^\/legender134\/rift-buddy\/releases(?:\/v?\d+\.\d+\.\d+)?\/?$/.test(u.pathname);
  return u.host==='github.com'&&/^\/Legender134\/rift-buddy\/releases(?:\/tag\/v?\d+\.\d+\.\d+)?\/?$/.test(u.pathname);
 }catch{return false;}
}
