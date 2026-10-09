import test from 'node:test';import assert from 'node:assert/strict';
import {isFreshBuildReference,BUILD_PARSER_VERSION} from '../src/core/builds.mjs';
import {BUILD_PARSER_VERSION as parserRevision} from '../services/build-json.mjs';
const now=Date.parse('2026-10-07T21:00:00Z'),fresh={patch:'16.20',parserVersion:parserRevision,fetchedAt:new Date(now-1000).toISOString()};
test('automatic source checks use the same parser revision as freshly collected snapshots',()=>{
 assert.equal(BUILD_PARSER_VERSION,parserRevision);assert.equal(isFreshBuildReference(fresh,'16.20','rift',now),true);
 for(const parserVersion of [undefined,5,6,parserRevision+1])assert.equal(isFreshBuildReference({...fresh,parserVersion},'16.20','rift',now),false);
 assert.equal(isFreshBuildReference({...fresh,parserVersion:undefined},'16.20','hex',now),true);
});
test('outdated patches and expired or invalid timestamps trigger another check without discarding the snapshot',()=>{
 const original=structuredClone(fresh);for(const fetchedAt of [undefined,'invalid',new Date(now+1).toISOString(),new Date(now-86400000).toISOString()])assert.equal(isFreshBuildReference({...fresh,fetchedAt},'16.20','rift',now),false);
 assert.equal(isFreshBuildReference({...fresh,fetchedAt:new Date(now-86399999).toISOString()},'16.20','rift',now),true);
 assert.equal(isFreshBuildReference({...fresh,patch:'16.19'},'16.20','hex',now),false);assert.equal(isFreshBuildReference(null,'16.20','rift',now),false);assert.equal(isFreshBuildReference(fresh,'16.20','aram',now),false);assert.deepEqual(fresh,original);
});
