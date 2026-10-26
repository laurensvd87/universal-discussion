import test from 'node:test';import assert from 'node:assert/strict';
import {BATCHES,ROOT_IDS,validateCandidateStructure,fixedBatch,deriveDocumentIdentity,inputEnvelope,buildInputPacket,validateInputPacket,projectScorerInputWitness,validatePriorBatch,sha,digest} from './manifest.js';
import {CONSTRUCTION_SOURCE_KEYS,buildBrowserProducerProfile} from './producer-profiles.js';
const H='a'.repeat(64),clone=x=>JSON.parse(JSON.stringify(x));
function profile(){return buildBrowserProducerProfile({runtimeSourceHashes:Object.fromEntries(CONSTRUCTION_SOURCE_KEYS.map(k=>[k,H])),packageSourceHashes:{'node_modules/playwright-core/index.mjs':H}}).producerProfile;}
function fixture(){
 const cases=BATCHES[0].map((id,i)=>({id,groupId:'invented-'+i,url:'https://invented.example/article-'+i,language:'en'})),p=profile();
 const rows=cases.slice(0,2).map((c,i)=>{
  const d=deriveDocumentIdentity({id:c.id,batch:1,freezeHash:H,frameId:'frame-'+i,loaderId:'loader-'+i});
  const response={status:200,frameId:'frame-'+i,loaderId:'loader-'+i,exactFinalUrl:true,observedRemoteAddressPublic:true,ordinaryTlsSecure:true,
   requestIdentityScope:'same-playwright-request-object/v1',networkRequestIdCorrelated:false,nofollow:false,tdmReservation:null,headersSha256:H};
  const dom={frameId:'frame-'+i,loaderId:'loader-'+i,navigationId:d.navigationId,exactDocumentUrl:true,canonicalUrlSha256:sha(c.url),canonicalEqualsExpected:true,domDirectivesChecked:true};
  const witness={schema:'playwright-owned-document/v1',finalUrlHash:sha(c.url),frameId:response.frameId,loaderId:response.loaderId,navigationId:d.navigationId,documentId:d.sourceIncarnation,
   response,dom,responseWitnessHash:digest(response),domWitnessHash:digest(dom),networkRequestIdCorrelated:false,nativeAttestation:false};
  return {id:c.id,groupId:c.groupId,url:c.url,sourceVersion:d.sourceVersion,sourceIncarnation:d.sourceIncarnation,title:'Invented paired title '+i,body:'Independent invented reader fixture body. '.repeat(8),
   extractorVersion:'main-text-prefix/v1',documentWitness:witness,originPolicyHash:H,pagePolicyHash:digest({schema:'browser-root-page-policy/v1',responseWitnessHash:witness.responseWitnessHash,domWitnessHash:witness.domWitnessHash})};
 });
 const header={phase:'browser-only',batch:1,freezeHash:H,freezeSha256:H,candidateSha256:H,labelSealSha256:H,artifactReuseReceiptSha256:H,producerProfile:p};
 const packet=buildInputPacket({...header,rows});
 const outcomes=cases.map(c=>{const r=packet.rows.find(r=>r.id===c.id);return r?{id:c.id,status:'collected',reason:null,capture:{titleCharacters:r.title.length,titleSha256:r.titleSha256,bodyCharacters:r.body.length,bodySha256:r.bodySha256,extractorVersion:r.extractorVersion},
  documentWitness:r.documentWitness,responseWitness:r.documentWitness.response,pagePolicyHash:r.pagePolicyHash,sourceInputHash:r.sourceInputHash}:{id:c.id,status:'unavailable',reason:'reader-unsupported'};});
 return {cases,p,rows,packet,context:{...header,cases,collectedIds:packet.rows.map(r=>r.id),outcomes}};
}
test('all32 sealed-order metadata and fixed8x4 scope validate without real page text',()=>{
 const candidate={schema:'hierarchy-current-producer-transfer-candidates/v1',caseCount:32,rootCount:16,cases:BATCHES.flat().map((id,i)=>({id,entityGroup:'new-invented-'+i,
  publicUrl:'https://invented.example/'+i,language:['en','de','fr','es','nl'][i%5],expectedRootId:ROOT_IDS[Math.floor(i/2)],supportedPathPrefix:[ROOT_IDS[Math.floor(i/2)]],maximumSpecificityKnown:false,labelScope:'positive-prefix-only',split:'current-producer-transfer-proposed'}))};
 const cases=validateCandidateStructure(candidate);assert.equal(cases.length,32);assert.equal(fixedBatch(cases,8)[3].id,'producer-transfer-032');
 candidate.cases[1].entityGroup=candidate.cases[0].entityGroup;assert.throws(()=>validateCandidateStructure(candidate));
});
test('full paired packet revalidates before reduced DTO; actual identities/digests are retained, no NetworkID invented',()=>{
 const f=fixture();assert.deepEqual(validateInputPacket(f.packet,f.context),f.packet);
 const projected=projectScorerInputWitness(f.packet.rows[0],f.p);assert.equal(projected.inputHash,f.packet.rows[0].sourceInputHash);
 assert.equal(projected.documentWitness.kind,'browser-document');assert.equal(projected.documentWitness.frameId,f.rows[0].documentWitness.frameId);
 assert.equal(Object.hasOwn(projected,'bodyVector'),false);assert.equal(f.packet.rows[0].documentWitness.networkRequestIdCorrelated,false);
});
test('response/DOM flags, deterministic incarnation, text/source/profile/policy/envelope tampering reject',()=>{
 const f=fixture();for(const alter of [r=>r.title+=' changed',r=>r.body+=' changed',r=>r.sourceVersion=H+'|browser-only|2',r=>r.sourceIncarnation=H,
  r=>r.documentWitness.response.ordinaryTlsSecure=false,r=>r.documentWitness.response.status=403,r=>r.documentWitness.dom.domDirectivesChecked=false,
  r=>r.documentWitness.loaderId='foreign-loader',r=>r.documentWitness.networkRequestIdCorrelated=true,r=>r.originPolicyHash='b'.repeat(64),r=>r.envelopeHash=H]){
  const p=clone(f.packet);alter(p.rows[0]);assert.throws(()=>validateInputPacket(p,f.context));assert.throws(()=>projectScorerInputWitness(p.rows[0],f.p));
 }
 const metadata=clone(f.context);metadata.outcomes[0].documentWitness.dom.canonicalEqualsExpected=false;assert.throws(()=>validateInputPacket(f.packet,metadata));
 const p=clone(f.packet);p.rows.reverse();assert.throws(()=>validateInputPacket(p,f.context));
});
test('unavailable rows remain denominator-only; no packet input may claim unavailable/wrong-batch/cross-group case',()=>{
 const f=fixture();const context={...f.context,collectedIds:[],outcomes:f.cases.map(c=>({id:c.id,status:'unavailable',reason:'reader-unsupported'}))};
 const {rows,...header}=f.packet;const {schema,...base}=header;const empty=buildInputPacket({...base,rows:[]});assert.equal(validateInputPacket(empty,context).rows.length,0);
 assert.throws(()=>validateInputPacket(f.packet,context));const p=clone(f.packet);p.rows[0].groupId='foreign';assert.throws(()=>validateInputPacket(p,f.context));
});
test('UTF16 bounds preserve multilingual strings without new UTF8 trimming or field caps',()=>{
 const f=fixture(),r={...f.rows[0],title:'ä'.repeat(200),body:'界'.repeat(4096)};const e=inputEnvelope(r,f.p);assert.equal(e.envelope.bodySha256,sha(r.body));
 assert.ok(Buffer.byteLength(r.body)>4096);assert.throws(()=>inputEnvelope({...r,title:r.title+'ä'},f.p));assert.throws(()=>inputEnvelope({...r,body:r.body+'界'},f.p));
});
test('source recipe is browser-only, immutable and cycle-free; every runtime/package pin changes construction',()=>{
 const input={runtimeSourceHashes:Object.fromEntries(CONSTRUCTION_SOURCE_KEYS.map(k=>[k,H])),packageSourceHashes:{'node_modules/playwright-core/index.mjs':H}},first=buildBrowserProducerProfile(input);
 assert.equal(first.producerProfile.producerId,'browser-current');assert.equal(Object.hasOwn(first,'targetProfiles'),false);assert.equal(Object.isFrozen(first.construction),true);
 for(const k of CONSTRUCTION_SOURCE_KEYS){const changed=clone(input);changed.runtimeSourceHashes[k]='b'.repeat(64);assert.notEqual(buildBrowserProducerProfile(changed).recipeHash,first.recipeHash);}
 assert.ok(CONSTRUCTION_SOURCE_KEYS.every(k=>!/freeze|receipt|artifact-reuse/u.test(k)));
 let calls=0;assert.throws(()=>buildBrowserProducerProfile({...input,packageSourceHashes:new Proxy({},{ownKeys(){calls++;throw 0}})}));assert.equal(calls,0);
});
test('prior batch needs exact source/freeze/packet hashes and normal zero-emergency owned cleanup',()=>{
 const f=fixture(),sourceHashes={fixture:H};const result={schema:'browser-root-transfer-result/v1',phase:'browser-only',batch:1,status:'complete',denominator:4,fullProducerDenominator:32,
  freezeHash:H,freezeSha256:H,packetSha256:H,sourceHashesRechecked:true,protocolCallbacksDrained:true,sourceHashes,cases:f.context.outcomes};
 const supervisor={schema:'browser-root-transfer-supervisor/v1',phase:'browser-only',batch:1,denominator:4,fullProducerDenominator:32,reason:null,childPid:123,exitCode:0,cleanupReason:null,emergencyOwnJobTermination:false,
  ownTreeCleanupConfirmed:true,sourceHashesRechecked:true,freezeSha256:H,resultSha256:H,packetSha256:H,sourceHashes,elapsedSeconds:179.5,
  sampledPeakTreeRssBytes:1048576,sampledPeakTreePrivateBytes:1048576,sampledPeakTreeProcesses:3,jobMemoryLimitBytes:1536*1048576,
  sampledPeakOwnedOutputBytes:4096,sampledPeakOwnedOutputEntries:5,ownedOutputByteLimit:512*1048576,ownedOutputEntryLimit:8192,
  noNativeAttestation:true,noModelCalls:true,productionValidated:false,purpose:'ADR148-browser-root-only-reobservation-not-independent-cohort'};
 const a={batch:1,freezeHash:H,freezeSha256:H,sourceHashes,result,supervisor,packetSha256:H,resultSha256:H};
 assert.equal(validatePriorBatch(a),true);for(const change of [{reason:'owned-child-failed'},{emergencyOwnJobTermination:true},{sourceHashesRechecked:false},{resultSha256:'b'.repeat(64)}])assert.throws(()=>validatePriorBatch({...a,supervisor:{...supervisor,...change}}));
 let calls=0;const hostile={...result};Object.defineProperty(hostile,'status',{enumerable:true,get(){calls++;throw 0}});assert.throws(()=>validatePriorBatch({...a,result:hostile}));assert.equal(calls,0);
 // Every actual supervisor evidence field is mandatory; an omitted metric is not a zero.
 for(const key of Object.keys(supervisor)){const missing={...supervisor};delete missing[key];assert.throws(()=>validatePriorBatch({...a,supervisor:missing}),key);}
 const caps={elapsedSeconds:180,sampledPeakTreeRssBytes:1536*1048576,sampledPeakTreePrivateBytes:1536*1048576,sampledPeakTreeProcesses:128,
  sampledPeakOwnedOutputBytes:512*1048576,sampledPeakOwnedOutputEntries:8192};
 for(const [key,cap] of Object.entries(caps))for(const invalid of [-1,Infinity,NaN,cap+1]){
  assert.throws(()=>validatePriorBatch({...a,supervisor:{...supervisor,[key]:invalid}}),key+':'+invalid);
 }
 for(const key of Object.keys(caps).filter(k=>k!=='elapsedSeconds'))assert.throws(()=>validatePriorBatch({...a,supervisor:{...supervisor,[key]:0.5}}),key);
 for(const change of [{jobMemoryLimitBytes:1536*1048576+1},{ownedOutputByteLimit:512*1048576+1},{ownedOutputEntryLimit:8193},
  {denominator:3},{fullProducerDenominator:31},{noNativeAttestation:false},{noModelCalls:false},{productionValidated:true},{purpose:'other'},
  {packetSha256:'b'.repeat(64)},{childPid:0},{childPid:1.5},{childPid:4294967296}])assert.throws(()=>validatePriorBatch({...a,supervisor:{...supervisor,...change}}));
 assert.equal(validatePriorBatch({...a,supervisor:{...supervisor,...caps}}),true);
});
