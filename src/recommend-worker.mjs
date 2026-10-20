import {recommend,replaceMember} from './core/recommend.mjs';
import {configureCatalog,BUNDLED_CATALOG} from './core/catalog.mjs';
self.onmessage=({data})=>{
 const {requestId,input,initialize}=data;
 try{if(initialize)configureCatalog(input.catalog||BUNDLED_CATALOG);self.postMessage({requestId,results:input.replace?replaceMember(input.replace.result,input.replace.role,input):recommend(input)});}catch(error){self.postMessage({requestId,error:error.message});}
};
