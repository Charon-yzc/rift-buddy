import {recommend,replaceMember} from './core/recommend.mjs';
import {configureCatalog} from './core/catalog.mjs';
self.onmessage=({data})=>{
 try{if(data.catalog)configureCatalog(data.catalog);self.postMessage({results:data.replace?replaceMember(data.replace.result,data.replace.role,data):recommend(data)});}catch(error){self.postMessage({error:error.message});}
};
