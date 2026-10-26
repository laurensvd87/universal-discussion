import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CONSTRUCTION_SOURCE_KEYS,buildNativeProducerProfile,validateNativeProducerProfile} from './producer-profile.js';
const sha=v=>createHash('sha256').update(v).digest('hex'),digest=v=>sha(JSON.stringify(v));
const source=()=>Object.fromEntries(CONSTRUCTION_SOURCE_KEYS.map(k=>[k,sha('invented-code-'+k)]));
test('one explicit native construction binds fixed implementation/field contracts, never original training profiles',()=>{
 const hashes=source(),p=buildNativeProducerProfile(hashes);
 assert.equal(CONSTRUCTION_SOURCE_KEYS.length,23);assert.equal(new Set(CONSTRUCTION_SOURCE_KEYS).size,23);
 assert.ok(CONSTRUCTION_SOURCE_KEYS.some(k=>k.endsWith('/browser-capture.mjs')));
 assert.ok(CONSTRUCTION_SOURCE_KEYS.some(k=>k.endsWith('/network-policy.js')));
 assert.ok(CONSTRUCTION_SOURCE_KEYS.some(k=>k.endsWith('/native-rights.js')));
 assert.ok(CONSTRUCTION_SOURCE_KEYS.some(k=>k.endsWith('/run.mjs')));
 for(const name of ['dns-resolver.js','study-runner.js','source-ledger.js','source-paths.js','coordinator.mjs'])
  assert.ok(CONSTRUCTION_SOURCE_KEYS.some(k=>k.endsWith('/'+name)));
 assert.ok(CONSTRUCTION_SOURCE_KEYS.every(k=>!k.includes('freeze.json')&&!k.includes('receipt.json')));
 assert.equal(p.schema,'native-root-target-profile-set/v1');assert.equal(p.producerProfile.producerId,'native-browser-current');
 assert.equal(p.construction.effectiveTitleRule,'trim-or-hostname/v1');assert.equal(p.construction.actualForegroundObservations,undefined);
 assert.equal(p.construction.observation.actualForegroundObservations,3);assert.equal(p.construction.observation.mainFrameOnly,true);
 assert.equal(p.construction.inputRetention,'transient-RAM-only');assert.equal(p.construction.unrestrictedBrowserParity,false);
 assert.equal(p.producerProfile.inputConstructionHash,digest(p.construction));assert.equal(p.recipeHash,digest(p.construction));
 assert.deepEqual(validateNativeProducerProfile(p.producerProfile),p.producerProfile);
 assert.equal(p.producerProfile.effectiveTitleRule,'trim-or-hostname/v1');assert.equal(p.construction.productionValidated,false);
 hashes[CONSTRUCTION_SOURCE_KEYS[0]]=sha('changed');assert.notDeepEqual(hashes,p.construction.sourceHashes);
 assert.ok(Object.isFrozen(p.construction.sourceHashes));assert.ok(Object.isFrozen(p.producerProfile.extractorVersions));
});
test('declaration order canonicalizes; every source change affects the exact native representation recipe',()=>{
 const a=source(),p=buildNativeProducerProfile(a),reversed=Object.fromEntries(Object.entries(a).reverse());
 assert.deepEqual(buildNativeProducerProfile(reversed),p);
 for(const key of CONSTRUCTION_SOURCE_KEYS){const changed={...a,[key]:sha('different-code')};
  assert.notEqual(buildNativeProducerProfile(changed).recipeHash,p.recipeHash);}
});
test('literal complete source set refuses extras, missing/bad hashes and caller accessors/proxies without execution',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('must not run');};
 for(const make of [
 ()=>({...source(),extra:sha('x')}),()=>{const a=source();delete a[CONSTRUCTION_SOURCE_KEYS[0]];return a;},
 ()=>({...source(),[CONSTRUCTION_SOURCE_KEYS[0]]:'not-sha'}),()=>Object.assign(Object.create(null),source()),
 ()=>new Proxy(source(),{getPrototypeOf:trap,ownKeys:trap}),
 ()=>{const a=source();Object.defineProperty(a,CONSTRUCTION_SOURCE_KEYS[0],{enumerable:true,get:trap});return a;}
 ])assert.throws(()=>buildNativeProducerProfile(make()));assert.equal(calls,0);
});
test('profile validation rejects wrong namespace/title/producer/hash/extractor/schema and extensions',()=>{
 const p=buildNativeProducerProfile(source()).producerProfile;
 for(const mutate of [v=>v.schema='root-rank-target-producer-profile/v1',v=>v.producerId='browser-current',v=>v.effectiveTitleRule='other',
 v=>v.inputConstructionHash=sha('different'),v=>v.extractorVersions.reverse(),v=>v.extractorVersions.pop(),v=>v.extra=true]){
  const v=structuredClone(p);mutate(v);assert.throws(()=>validateNativeProducerProfile(v));
 }
});
