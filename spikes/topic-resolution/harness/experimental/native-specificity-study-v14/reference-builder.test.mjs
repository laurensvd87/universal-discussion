import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSpecificityTrainReferences,LOCAL_NODES} from './reference-builder.js';
import {inventedFixture,builderInput,vectorHash,H} from './producer-profile.test.mjs';
import {createTrainReferenceCodec} from './reference-codec.js';
import {digest} from './manifest.js';
import {buildSpecificityProducerProfile} from './producer-profile.js';
const build=f=>buildSpecificityTrainReferences(builderInput(f));
function unavailable(f,i){const r=f.trainingRows[i];f.trainingRows[i]={id:r.id,groupId:r.groupId,status:'unavailable',reason:'article-unavailable',inputIdentity:H};}

test('all48 TRAIN annotations retained exactly, <=48TOTAL fused examples and honest disabled12node seed',()=>{
 const f=inventedFixture(),out=build(f);assert.equal(out.status,'references-ready');assert.equal(out.referenceCount,48);assert.equal(out.availability.length,48);assert.equal(out.trainingCaseIds.length,48);assert.equal(out.trainingGroupIds.length,48);
 const counts={member:0,stop:0,outside:0};for(const r of out.trainingCases)counts[r.referenceAnnotation.kind]++;assert.deepEqual(counts,{member:24,stop:12,outside:12});
 assert.deepEqual(out.trainingCases,f.manifest.cases.filter(c=>c.split==='training').map(c=>({id:c.id,groupId:c.groupId,referenceAnnotation:c.referenceAnnotation})));
 assert.equal(out.detailTemplate.artifact.nodes.length,12);assert.equal(Object.keys(LOCAL_NODES).length,12);assert.ok(out.detailTemplate.artifact.nodePolicies.every(p=>p.enabled===false));
 assert.equal(out.detailTemplate.artifact.calibrationStatus,'experimental');assert.match(out.detailTemplate.artifact.calibrationVersion,/^adr179-unfitted-/u);
 assert.equal(out.detailTemplate.artifact.inputConstructionHash,out.constructionHash);assert.notEqual(out.constructionHash,f.profileSet.recipeHash);assert.equal(out.construction.nativeSourceBuilderClaim,false);
 for(const e of out.detailTemplate.artifact.examples){const c=out.trainingCases.find(c=>c.id===e.id);assert.equal(e.kind,c.referenceAnnotation.kind);assert.equal(e.nodeId,c.referenceAnnotation.nodeId);}
 assert.equal(JSON.stringify(out).includes('"bodyVector"'),false);assert.equal(JSON.stringify(out).includes('"titleVector"'),false);assert.equal(out.assignmentAuthority,false);
 assert.ok(Buffer.byteLength(JSON.stringify(out))<=1048576);assert.ok(Object.isFrozen(out.detailTemplate.artifact.examples[0].vector));
});
test('subset availability changes only usable refs/groups, never48row denominator or originalMEMBER labels',()=>{
 const f=inventedFixture();for(let i=0;i<48;i+=2)unavailable(f,i);const out=build(f);
 assert.equal(out.availability.length,48);assert.equal(out.referenceCount,24);assert.equal(out.trainingGroupIds.length,24);
 assert.deepEqual(out.trainingGroupIds,f.trainingRows.filter(r=>r.status==='available').map(r=>r.groupId));
 assert.equal(out.detailTemplate.artifact.examples.find(e=>e.id===f.trainingRows[1].id).kind,'member');assert.equal(out.trainingCases[0].referenceAnnotation.kind,'member');
 assert.equal(out.availability.filter(r=>r.status==='unavailable').length,24);
});
test('zero available references returns explicit stop/nulltemplate without compiling empty artifact',()=>{
 const f=inventedFixture();for(let i=0;i<48;i++)unavailable(f,i);const out=build(f);
 assert.equal(out.status,'no-reference-set');assert.equal(out.detailTemplate,null);assert.equal(out.templateArtifactHash,null);assert.equal(out.calibrationAllowed,false);assert.equal(out.referenceCount,0);assert.equal(out.trainingGroupIds.length,0);assert.equal(out.trainingCaseIds.length,48);assert.equal(out.availability.length,48);
});
test('root-owned exactbit codec accepts builder annotation/construction namespace, including signedzero',()=>{
 const f=inventedFixture(),out=build(f),codec=createTrainReferenceCodec({expectedManifestHash:f.manifest.manifestHash,expectedInputConstructionHash:out.constructionHash,trainingCases:out.trainingCases});
 const p=codec.encode(out.detailTemplate.artifact),round=codec.decode(p.text,p.packetHash);assert.equal(round.examples,48);assert.equal(round.artifactHash,out.templateArtifactHash);
 assert.ok(Object.is(out.detailTemplate.artifact.examples[0].vector[383],-0));assert.ok(Object.is(round.artifact.examples[0].vector[383],-0));
 const altered=structuredClone(out.trainingCases);altered[0].referenceAnnotation.kind='stop';assert.throws(()=>createTrainReferenceCodec({expectedManifestHash:f.manifest.manifestHash,expectedInputConstructionHash:out.constructionHash,trainingCases:altered}));
});
test('all48rows, native metadata and scalar vectors capped before fusion; no lossy bit rebinding',()=>{
 for(const change of [f=>f.trainingRows.pop(),f=>f.trainingRows.push(f.trainingRows[0]),f=>{f.trainingRows[0].nativeInput.bodyVector.pop();},f=>{f.trainingRows[0].nativeInput.bodyVector[0]=NaN;},f=>{f.trainingRows[0].nativeInput.titleVector[0]=2;},f=>{f.trainingRows[0].vectorBindings.bodyVectorHash=H;},f=>{f.trainingRows[0].nativeInput.bodyVector[383]=0;}]){const f=inventedFixture();change(f);assert.throws(()=>build(f));}
 const f=inventedFixture();f.trainingRows[0].nativeInput.extra='x'.repeat(16385);assert.throws(()=>build(f),{code:'capacity'});
});
test('Source-input, rights/witness, exactcase/group/batch/localordinal identities cannot be substituted',()=>{
 for(const change of [f=>{f.trainingRows[0].groupId='other';},f=>{f.trainingRows.reverse();},f=>{f.trainingRows[0].id=f.manifest.cases.find(c=>c.split==='calibration').id;},
  f=>{f.trainingRows[0].nativeInput.sourceInputHash=H;},f=>{f.trainingRows[0].nativeInput.sourceVersion='not-the-observation-nonce';},f=>{f.trainingRows[0].nativeInput.rightsEvidenceHash='f'.repeat(64);},
  f=>{f.trainingRows[0].nativeInput.nativeWitness.ordinal=33;},f=>{f.trainingRows[0].nativeInput.nativeWitness.sourceUrl+='other';},f=>{f.trainingRows[4].nativeInput.nativeWitness.studyId=f.trainingRows[0].nativeInput.nativeWitness.studyId;}]){const f=inventedFixture();change(f);assert.throws(()=>build(f));}
});
test('foreign profile/manifest pins, negative misannotation and getter/proxy reject without invocation',()=>{
 const f=inventedFixture();assert.throws(()=>buildSpecificityTrainReferences({...builderInput(f),expectedManifestHash:H}));
 const g=inventedFixture();g.trainingRows[0].nativeInput.producerProfileHash=H;assert.throws(()=>build(g));
 let calls=0;const h=inventedFixture();Object.defineProperty(h.trainingRows[0].nativeInput.bodyVector,'0',{enumerable:true,get(){calls++;throw Error();}});assert.throws(()=>build(h));
 const j=inventedFixture();j.trainingRows=new Proxy(j.trainingRows,{get(){calls++;throw Error();}});assert.throws(()=>build(j));assert.equal(calls,0);
});
test('offlineconstruction binds actualfield/native/rawpair/fusedbits and availability, not futureCALselection',()=>{
 const a=inventedFixture(),first=build(a),b=inventedFixture();unavailable(b,0);const second=build(b);assert.notEqual(first.constructionHash,second.constructionHash);
 assert.equal(first.construction.calibrationSelected,false);assert.equal(JSON.stringify(first.construction).includes('selectedArtifact'),false);
 const c=inventedFixture();c.trainingRows[0].nativeInput.bodyVector[383]=0;c.trainingRows[0].vectorBindings.bodyVectorHash=vectorHash(c.trainingRows[0].nativeInput.bodyVector);
 const third=build(c);assert.notEqual(first.constructionHash,third.constructionHash);assert.notEqual(first.availability[0].bodyVectorHash,third.availability[0].bodyVectorHash);
 assert.equal(digest(first.trainingCases),digest(third.trainingCases));
});
test('aggregate value/string/depth and per-row native-metadata caps reject before fusion',()=>{
 const f=inventedFixture();f.trainingRows[0].nativeInput.nativeWitness.extra=Array.from({length:200},()=>Array(1000).fill(0));assert.throws(()=>build(f),{code:'capacity'});
 const g=inventedFixture();g.trainingRows[0].nativeInput.nativeWitness.extra=Array(65).fill('x'.repeat(16384));assert.throws(()=>build(g),{code:'capacity'});
 const h=inventedFixture();let nested={};for(let i=0;i<25;i++)nested={x:nested};h.trainingRows[0].nativeInput.nativeWitness.extra=nested;assert.throws(()=>build(h),{code:'capacity'});
 const j=inventedFixture();j.trainingRows[0].nativeInput.nativeWitness.extra='x'.repeat(15000);assert.throws(()=>build(j),{code:'capacity'});
});
test('annotation counts alone cannot rewrite MEMBER to STOP or scope OUTSIDE against its positive root',()=>{
 for(const change of [m=>{m.cases[0].referenceAnnotation.kind='stop';m.cases[24].referenceAnnotation.kind='member';},m=>{m.cases[36].proposedGold={kind:'prefix',path:['games']};m.cases[36].assessmentGold={kind:'prefix',path:['games']};},m=>{m.cases[36].proposedGold.kind='outside';m.cases[36].assessmentGold.kind='outside';}]){
  const f=inventedFixture(),m=structuredClone(f.manifest);change(m);const {manifestHash,...body}=m;m.manifestHash=digest(body);f.manifest=m;
  f.profileSet=buildSpecificityProducerProfile({panelIdentity:m.panelIdentity,manifestHash:m.manifestHash,encoderHash:H,sourceHashes:f.profileSet.construction.sourceHashes});
  assert.throws(()=>build(f),{code:'contract'});
 }
});
