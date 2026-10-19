import {loadSnapshot} from './data.mjs';
import {createDataGenerationCache} from './data-generation-cache.mjs';
import {generationBaseIdentity,pureGameSnapshot} from './data-generation.mjs';
import {readManualBase} from './game-data-prepare.mjs';

// The privileged helper uses the same accepted/manual base as the UI, never a
// downloaded pending generation. A requested content identity also prevents a
// stale helper from silently validating a different generation for a write.
export function createAcceptedGameReader({root,fallbackRoot,keys,clock}={}){
 let cached=null,identity=null;
 return async function read(expected=null){
  if(expected!==null&&(typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected)))throw Error('基础资料身份无效');
  if(expected&&expected===identity&&cached)return cached;
  let data=pureGameSnapshot(await loadSnapshot(root,fallbackRoot));
  await createDataGenerationCache({root,getData:()=>data,prepare:async bundle=>pureGameSnapshot(bundle.game),replace:next=>{data=next;},manualBase:await readManualBase(root),...(keys?{keys}:{}),...(clock?{clock}:{})});
  const found=generationBaseIdentity(data);if(expected&&expected!==found)throw Error('基础资料已变化，请重新选择后再配置');
  cached=data;identity=found;return data;
 };
}
