import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import builds from '../data/hex-builds.json' with {type:'json'};

import {hexRecommendations,hexEquipmentImpact,resolveHexAugmentInput} from '../src/core/hex-recommendations.mjs';
import {hexManualAugments} from '../src/core/hex-acquisition.mjs';
const data={...game,hexBuilds:builds.entries};
test('current source shortlists never renew old hero affinities, equipment links or invented scores',()=>{
 const before=JSON.stringify(data);
 for(const hero of data.champions){const result=hexRecommendations({data,hero:hero.id,options:[1004,1058,1048],owned:[1205]});assert.deepEqual(result.rows,[]);assert.equal(result.bestChoice,null);assert.deepEqual(hexEquipmentImpact({data,hero:hero.id,owned:[1004,1205]}),[]);}
 assert.equal(JSON.stringify(data),before);
});
test('manual offer entry resolves exact current IDs and names without guessing unknown choices',()=>{
 const a=hexManualAugments(data)[0],rows=hexManualAugments(data);
 assert.equal(resolveHexAugmentInput(a.name+' · #'+a.id,rows),a.id);
 assert.equal(resolveHexAugmentInput(a.name,rows),a.id);
 assert.throws(()=>resolveHexAugmentInput('unknown-'+a.name,rows),/从列表选择/);
});
