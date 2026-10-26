import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpecificityArtifactReuse,OLD_FIT_BYTE_CAPS,OLD_FIT_TOTAL_BYTES} from './artifact-reuse.js';
import {buildSpecificityProducerProfile} from './producer-profile.js';
import {inventedFixture,reuseInput,H,bytes} from './producer-profile.test.mjs';
import {sha} from './manifest.js';
const factory=f=>createSpecificityArtifactReuse({expectedOldFileHashes:f.expectedOldFileHashes,expectedOldSourceHashes:f.expectedOldSourceHashes});

test('new168 receipt preserves original fit byte/program provenance and unchanged16-root policy',()=>{
 const f=inventedFixture(),before=Buffer.from(f.oldFit.modelBytes),out=factory(f).bind(reuseInput(f));
 assert.equal(out.receipt.schema,'native-specificity-root-artifact-reuse/v1');assert.equal(out.receipt.target.groups,168);assert.equal(out.receipt.target.trainCalGroups,96);assert.equal(out.receipt.target.testGroups,72);
 assert.equal(out.receipt.original.originalCandidateSha256,'3'.repeat(64));assert.equal(out.receipt.original.originalLabelSealSha256,'4'.repeat(64));
 assert.equal(out.receipt.original.fileHashes.modelBytes,sha(before));assert.notEqual(out.receipt.original.modelJsonHash,sha(before));
 assert.notEqual(out.receipt.target.transferIdentity.transferHash,out.receipt.original.transferHash);assert.equal(out.receipt.originalCohortReobservedClaim,false);
 assert.equal(out.rootCandidate.inputDefinition.bodyWeight,.75);assert.equal(out.rootCandidate.inputDefinition.titleWeight,.25);assert.equal(out.rootCandidate.rootModel.lambda,.1);
 assert.deepEqual(out.rootCandidate.rootPolicy,JSON.parse(f.oldFit.policyBytes));assert.equal(out.rootCandidate.rootModel.heads.length,16);
 assert.equal(out.receipt.actualNativeCompatibilityEstablished,false);assert.equal(out.receipt.assignmentAuthority,false);assert.ok(Object.isFrozen(out.rootCandidate.rootModel.heads[0].weights));assert.deepEqual(f.oldFit.modelBytes,before);
 assert.equal(JSON.stringify(out.receipt).includes('"weights"'),false);
});
test('all7 FILE pins and exact independentSOURCE pins precede every JSON parser',()=>{
 const f=inventedFixture();f.oldFit.freezeBytes=Buffer.from('{invalid');f.expectedOldFileHashes.freezeBytes=sha(f.oldFit.freezeBytes);f.expectedOldFileHashes.inputDefinitionBytes='0'.repeat(64);
 const reuse=factory(f),parse=JSON.parse;let calls=0;
 try{JSON.parse=()=>{calls++;throw Error('parser hook');};assert.throws(()=>reuse.bind(reuseInput(f)),{code:'old-file-auth'});assert.equal(calls,0);}finally{JSON.parse=parse;}
 const g=inventedFixture(),reuse2=factory(g);g.oldFit.sourceHashes={...g.oldFit.sourceHashes,'invented-source.js':H};
 try{JSON.parse=()=>{calls++;throw Error();};assert.throws(()=>reuse2.bind(reuseInput(g)),{code:'old-source-auth'});assert.equal(calls,0);}finally{JSON.parse=parse;}
});
test('exact7byte schemas and802816 aggregate maximum reject every cap+1 before parsing',()=>{
 assert.equal(Object.values(OLD_FIT_BYTE_CAPS).reduce((n,x)=>n+x,0),802816);assert.equal(OLD_FIT_TOTAL_BYTES,802816);
 for(const [key,max]of Object.entries(OLD_FIT_BYTE_CAPS)){const f=inventedFixture();f.oldFit[key]=Buffer.alloc(max+1);assert.throws(()=>factory(f).bind(reuseInput(f)),{code:'byte-capacity'});}
 const f=inventedFixture();f.oldFit.extra=Buffer.from('{}');assert.throws(()=>factory(f).bind(reuseInput(f)));
 const g=inventedFixture();delete g.oldFit.policyBytes;assert.throws(()=>factory(g).bind(reuseInput(g)));
});
test('byte buffers/profile/source maps are private descriptor-safe copies, no caller getters',()=>{
 let calls=0;const f=inventedFixture();Object.defineProperty(f.oldFit.modelBytes,'hidden',{get(){calls++;throw Error();}});assert.throws(()=>factory(f).bind(reuseInput(f)));
 const g=inventedFixture();g.oldFit.modelBytes=new Proxy(g.oldFit.modelBytes,{get(){calls++;throw Error();}});assert.throws(()=>factory(g).bind(reuseInput(g)));
 const h=inventedFixture();Object.defineProperty(h.oldFit,'policyBytes',{enumerable:true,get(){calls++;throw Error();}});assert.throws(()=>factory(h).bind(reuseInput(h)));
 const j=inventedFixture();Object.defineProperty(j.expectedOldSourceHashes,'protocol.json',{enumerable:true,get(){calls++;throw Error();}});assert.throws(()=>factory(j));assert.equal(calls,0);
});
test('new target encoder mismatch, forged old fit, modified coefficient bytes and old same32 receipt reject',()=>{
 const f=inventedFixture();f.profileSet=buildSpecificityProducerProfile({panelIdentity:f.manifest.panelIdentity,manifestHash:f.manifest.manifestHash,encoderHash:'f'.repeat(64),sourceHashes:f.profileSet.construction.sourceHashes});assert.throws(()=>factory(f).bind(reuseInput(f)),{code:'encoder'});
 const g=inventedFixture();g.oldFit.modelBytes=Buffer.concat([g.oldFit.modelBytes,Buffer.from(' ')]);assert.throws(()=>factory(g).bind(reuseInput(g)),{code:'old-file-auth'});
 const h=inventedFixture(),supervisor=JSON.parse(h.oldFit.supervisorBytes);supervisor.exitCode=1;h.oldFit.supervisorBytes=bytes(supervisor);h.expectedOldFileHashes.supervisorBytes=sha(h.oldFit.supervisorBytes);assert.throws(()=>factory(h).bind(reuseInput(h)));
 const j=inventedFixture();assert.throws(()=>factory(j).bind({...reuseInput(j),receipt:{schema:'native-root-artifact-reuse/v1'}}));
});
