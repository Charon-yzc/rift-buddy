import {recommend,replaceMember} from './core/recommend.mjs';
import {configureCatalog,BUNDLED_CATALOG} from './core/catalog.mjs';
import {orderRecommendationPage} from './core/recommendation-policy.mjs';
self.onmessage=({data})=>{
 const {requestId,input,initialize}=data;
 try{if(initialize)configureCatalog(input.catalog||BUNDLED_CATALOG);const options={...input,minimumFitScore:60,stylePolicy:true};self.postMessage({requestId,results:orderRecommendationPage(input.replace?replaceMember(input.replace.result,input.replace.role,options):recommend(options))});}catch(error){self.postMessage({requestId,error:error.message});}
};
