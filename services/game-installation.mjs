import path from 'node:path';

export const samePath=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();

export async function localDirectory(filename,io){
 const absolute=path.resolve(filename),root=path.parse(absolute).root;
 let current=root;
 for(const part of absolute.slice(root.length).split(path.sep).filter(Boolean)){
  current=path.join(current,part);const stat=await io.lstat(current);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('游戏目录包含重定向或异常文件');
 }
 if(!samePath(await io.realpath(absolute),absolute))throw Error('游戏目录包含重定向');
 return absolute;
}

async function marker(root,name,io){
 try{const stat=await io.lstat(path.join(root,name));return stat.isFile()&&!stat.isSymbolicLink();}catch{return false;}
}

export async function installedGameDirectory(installDir,io){
 if(typeof installDir!=='string'||installDir.length>500||!path.isAbsolute(installDir)||/[\r\n\0]/.test(installDir)||/^(?:\\\\|\/\/)/.test(installDir)||path.resolve(installDir)===path.parse(path.resolve(installDir)).root)throw Error('客户端未提供可确认的本地游戏目录');
 const installed=await localDirectory(installDir,io),name=path.basename(installed).toLowerCase();
 if(name==='leagueclient'&&await marker(installed,'LeagueClient.exe',io)){
  const game=await localDirectory(path.join(installed,'..','Game'),io);
  if(!await marker(game,'League of Legends.exe',io))throw Error('未能确认国服游戏目录');
  return game;
 }
 if(await marker(installed,'LeagueClient.exe',io)||name==='game'&&await marker(installed,'League of Legends.exe',io))return installed;
 const client=await localDirectory(path.join(installed,'LeagueClient'),io),game=await localDirectory(path.join(installed,'Game'),io);
 if(!await marker(client,'LeagueClient.exe',io)||!await marker(game,'League of Legends.exe',io))throw Error('未能确认游戏目录');
 return game;
}
