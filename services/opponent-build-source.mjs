import {parseBuildJSON,readPublicJSON,BUILD_POSITIONS} from './build-json.mjs';
import {decodeHydration,resolveReferences,itemRows,separateComponents} from './source-parser.mjs';
import {requireBuildSource,DEFAULT_BUILD_SOURCE,sameBuildSource} from '../src/core/build-source.mjs';
import {OPPONENT_SCOPE_EVIDENCE} from '../src/core/opponent-build-source.mjs';

const mismatch=()=>Object.assign(Error('来源未确认所选对手及完整筛选，已保留原参考'),{code:'OPPONENT_BUILD_SCOPE_MISMATCH'});
export function parseOpponentBuildJSON(raw,{champion,role,opponent,data,page,url,buildSource=DEFAULT_BUILD_SOURCE}){
 const source=requireBuildSource(buildSource),known=data.champions.find(c=>c.id===opponent?.id&&c.key===opponent.key);
 if(!known||opponent.id===champion.id||!BUILD_POSITIONS[role])throw mismatch();
 const expected={...source,patch:data.patch,target_champion:opponent.id.toLowerCase()},requested=new URL(url);
 if(requested.origin!=='https://op.gg'||requested.pathname!==`/lol/champions/${champion.id.toLowerCase()}/build/${BUILD_POSITIONS[role]}`||Object.entries(expected).some(([key,value])=>requested.searchParams.get(key)!==value))throw mismatch();
 const {nodes,refs}=decodeHydration(page);
 if(!nodes.some(n=>n.championId===champion.key&&n.position===BUILD_POSITIONS[role]&&n.patch===data.patch&&n.type==='ranked'&&sameBuildSource(n,source)))throw mismatch();
 const links=nodes.filter(n=>Array.isArray(n)&&n[0]==='$'&&n[3]?.href?.pathname===`/lol/champions/${champion.id.toLowerCase()}/items/${BUILD_POSITIONS[role]}`).map(n=>resolveReferences(n,refs)[3]?.href);
 if(links.length!==1||Object.entries(expected).some(([key,value])=>links[0]?.query?.[key]!==value))throw mismatch();
 const ref=parseBuildJSON(raw,{champion,role,data,url,buildSource:source});
 // The API does not echo its opponent. Bind it to the returned scoped page
 // using multiple complete item rows; a generic fallback must fail closed.
 const rows=itemRows(nodes,refs,'core_items_').map(row=>separateComponents(row,data)).filter(row=>row.items.length===3&&row.samples>0);
 if(new Set(rows.map(row=>row.items.join('-'))).size<2)throw mismatch();
 for(const row of rows){const match=ref.core.find(c=>c.items.join('-')===row.items.join('-'));if(!match||match.samples!==row.samples||row.winRate!==null&&(!Number.isFinite(match.winRate)||Math.abs(match.winRate-row.winRate)>.02))throw mismatch();}
 const {matchups,...scoped}=ref;
 return {...scoped,opponent:opponent.id,scope:'specific-opponent',scopeEvidence:OPPONENT_SCOPE_EVIDENCE,roleSamples:null};
}
async function readPage(url,fetcher){
 const response=await fetcher(url,{signal:AbortSignal.timeout(25000),redirect:'error'});
 if(!response.ok)throw Error('对手配置来源暂不可用');
 if(Number(response.headers.get('content-length'))>4_000_000)throw Error('对手配置来源响应过大');
 let size=0;const chunks=[];
 for await(const chunk of response.body){size+=chunk.length;if(size>4_000_000)throw Error('对手配置来源响应过大');chunks.push(chunk);}
 return Buffer.concat(chunks).toString('utf8');
}
export async function fetchOpponentBuild(champion,role,opponent,data,{fetcher=fetch,region=DEFAULT_BUILD_SOURCE.region,tier=DEFAULT_BUILD_SOURCE.tier}={}){
 const source=requireBuildSource({region,tier});
 if(!BUILD_POSITIONS[role]||!data.champions.some(c=>c.id===champion.id&&c.key===champion.key)||!data.champions.some(c=>c.id===opponent?.id&&c.key===opponent.key)||champion.id===opponent.id)throw mismatch();
 const query=new URLSearchParams({...source,patch:data.patch,type:'ranked',target_champion:opponent.id.toLowerCase()});
 const url=`https://op.gg/lol/champions/${champion.id.toLowerCase()}/build/${BUILD_POSITIONS[role]}?${query}`;
 const api=`https://lol-api-champion.op.gg/api/${source.region}/champions/ranked/${champion.key}/${BUILD_POSITIONS[role]}?${new URLSearchParams({tier:source.tier,version:data.patch,target_champion:opponent.id.toLowerCase()})}`;
 const raw=await readPublicJSON(api,{fetcher}),page=await readPage(url,fetcher);
 return parseOpponentBuildJSON(raw,{champion,role,opponent,data,page,url,buildSource:source});
}
