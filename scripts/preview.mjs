import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {defaultState} from '../services/storage.mjs';
import {loadBuilds,loadHexBuilds} from '../services/build-cache.mjs';
const root=path.resolve('.');
const manifest=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  if(url.pathname==='/api/bootstrap'){
   const data=JSON.parse(await fs.readFile(path.join(root,'data/game.json'),'utf8'));
   data.builds=await loadBuilds([path.join(root,'data')],data);
   try{data.spellbook=JSON.parse(await fs.readFile(path.join(root,'data/spells.json'),'utf8')).champions||{};}catch{data.spellbook={};}
   data.hexBuilds=await loadHexBuilds([path.join(root,'data')],data);
   res.writeHead(200,{'Content-Type':types['.json'],'Cache-Control':'no-store'});res.end(JSON.stringify({data,state:defaultState(),desktop:false,version:manifest.version+'-preview'}));return;
  }
  const resource=url.pathname==='/'?'/src/index.html':decodeURIComponent(url.pathname);
  const allowed=['/src/','/data/images/','/assets/'];
  if(!allowed.some(p=>resource.startsWith(p))){res.writeHead(404);res.end('Not found');return;}
  const filename=path.resolve(root,'.'+resource);
  if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const bytes=await fs.readFile(filename);res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('Preview ready at http://127.0.0.1:4173/src/index.html'));
