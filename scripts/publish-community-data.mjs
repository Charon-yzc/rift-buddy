import fs from 'node:fs/promises';
import {publishCommunityData} from '../services/community-data-publish.mjs';
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
try{
 if(!args.includes('--public-root')||!args.includes('--key'))throw Error('需要 --public-root 和非公开 --key；必须在既有 collect.lock 下执行');
 const game=JSON.parse(await fs.readFile('data/game.json')),catalog=JSON.parse(await fs.readFile('src/core/catalog-data.json')),hexRoutes=JSON.parse(await fs.readFile('src/core/hex-community-routes.json'));
 const manifest=await publishCommunityData({publicRoot:option('--public-root'),keyFile:option('--key'),game,catalog,hexRoutes,minimumApp:args.includes('--minimum-app')?option('--minimum-app'):undefined});
 console.log(JSON.stringify({published:true,...manifest}));
}catch(e){console.error(e.message);process.exitCode=1;}
