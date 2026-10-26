// ADR148 pure browser-only fixed-artifact reuse. No IO, writer, default action, E5 or scoring.
// Hashes bind caller-supplied bytes/identities, not filesystem/native authority.
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {validateRootFitEvidence,validateFreeze} from '../../../../apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-evaluation-v1/contracts.js';
import {ROOT_IDS,record,dense,hash,freeze,digest,sha,validateProducerProfile} from '../current-producer-final-v1/manifest.js';

export const ARTIFACT_REUSE_DEPENDENCY_PINS=Object.freeze({
 'apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-evaluation-v1/contracts.js':'654e898039a900cf017e71b59419d9681e9677ef3f2f6d5bdb7f35b67370a13d',
 'spikes/topic-resolution/harness/current-producer-final-v1/manifest.js':'e5d232f2f78402b9db4b4fecac34976bb36c50aa7fd1e698eecba84a82229da3',
 'apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.js':'b1f5c687652824d7fc73868a4fd6d87cae8ef27ea47f5c344ecadeff0bdff3b4',
 'spikes/topic-resolution/browser/embedding/embedding-contract.js':'6b26cc2766acdbcba39259d1459e703995c3b5ae5a6fd4a4c78b7a968d0b3920',
 'apps/local-service/experiments/topic-encoder/builder-scoped-root-rank-candidate-v1/scorer.js':'5037cfec2cce670a9238556567a7d9d39db0ce0357f5bc00fb27d16cbd1489f6',
 'apps/local-service/src/domain/hierarchical-e5-paired-input.js':'3047bc3c5062307e2127ec2f95175377a8fa1a3c6318ed3a3a1e158dc9344c14',
 'apps/local-service/src/domain/hierarchical-e5-paired-linear-heads.js':'7dfc2cadf57aacf6e0b63d719830a7118086a9ffec8eabde6cc6281d1891d5bf',
 'apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js':'751e11093fb90a2e97f45d0c74d959cfe297ce8dd963c0a28e0152af52a72c8e',
 'apps/local-service/experiments/topic-encoder/hierarchical-e5-paired-v1/taxonomy.js':'fb02fe8c556d1e5e356510e15d9110f5e069b02ecd5ecca427dfa7b22110f2dc',
});
const SELECT_FIELDS=['schema','phase','finalTestEvaluated','freezeHash','freezeFileSha256','protocolSha256','selectionSha256','selectedIndex',
 'bodyWeight','titleWeight','lambda','trainingInputConstructionHash','eligibleCohortHash','eligibilityReceiptSha256','calibrationGoldSha256',
 'selectedModelSha256','modelJsonHash','selectedPolicySha256','policyHash','selectedInputDefinitionSha256','transferHash','targetProfiles',
 'sourceBindingsHash','candidateSha256','labelSealSha256','encoderHash','representationHash','inputView','productionValidated','assignmentAuthority'];
const NEXT_FIELDS=['browserProfile','profileRecipeHash','protocolSha256','candidateSha256','labelSealSha256'];
const OLD_PROOF_FIELDS=['freezeBytes','supervisorBytes','selectionReceiptBytes','sourceHashes'];
const OLD_FIT_FIELDS=[...OLD_PROOF_FIELDS,'selectionBytes','modelBytes','policyBytes','inputDefinitionBytes'];
const MAX_BYTES={freezeBytes:65536,supervisorBytes:65536,selectionReceiptBytes:65536,selectionBytes:262144,modelBytes:262144,policyBytes:65536,inputDefinitionBytes:16384};
const lengthGetter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'length').get;
function privateBytes(value,maximum){
 assert.ok(value&&typeof value==='object'&&!types.isProxy(value)&&Buffer.isBuffer(value)&&Object.getPrototypeOf(value)===Buffer.prototype);
 const n=Reflect.apply(lengthGetter,value,[]);assert.ok(n>0&&n<=maximum);
 assert.equal(Reflect.ownKeys(value).length,n,'Extended byte buffer');return Buffer.from(value);
}
function copyData(value,budget={left:16384,strings:131072},depth=0){
 assert.ok(--budget.left>=0&&depth<=10,'Reuse data capacity');
 if(value===null||typeof value!=='object'){
  assert.ok(value===null||['string','number','boolean'].includes(typeof value));
  if(typeof value==='string'){assert.ok(value.length<=8192&&value.isWellFormed());budget.strings-=value.length;assert.ok(budget.strings>=0);}
  if(typeof value==='number')assert.ok(Number.isFinite(value));return value;
 }
 assert.ok(!types.isProxy(value),'Proxy data');
 if(Array.isArray(value))return dense(value,128).map(x=>copyData(x,budget,depth+1));
 assert.equal(Object.getPrototypeOf(value),Object.prototype);
 const out={};for(const key of Reflect.ownKeys(value)){
  assert.equal(typeof key,'string');const d=Object.getOwnPropertyDescriptor(value,key);assert.ok(d?.enumerable&&Object.hasOwn(d,'value'),'Accessor data');
  budget.strings-=key.length;assert.ok(budget.strings>=0);
  Object.defineProperty(out,key,{value:copyData(d.value,budget,depth+1),enumerable:true,writable:true,configurable:true});
 }return out;
}
function sourceMap(value){
 const m=copyData(value),keys=Object.keys(m);assert.ok(keys.length>0&&keys.length<=128);
 for(const key of keys){assert.ok(key.length>0&&key.length<=512&&!/[\u0000-\u001f\u007f]/u.test(key));hash(m[key]);}
 return m;
}
function copyOld(input,full){
 const a=record(input,full?OLD_FIT_FIELDS:OLD_PROOF_FIELDS),out={};
 for(const key of Object.keys(a))out[key]=key==='sourceHashes'?sourceMap(a[key]):privateBytes(a[key],MAX_BYTES[key]);
 return out;
}
function json(bytes){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
function oldMetadata(old){
 const f=validateFreeze(json(old.freezeBytes),'current-producer-root-fit-freeze/v1',old.sourceHashes);
 const s=record(json(old.selectionReceiptBytes),SELECT_FIELDS),supervisor=json(old.supervisorBytes);
 assert.equal(s.schema,'current-producer-root-selection/v1');assert.equal(s.phase,'selected-before-final-transfer');
 for(const [key,value]of Object.entries({finalTestEvaluated:false,productionValidated:false,assignmentAuthority:false,inputView:'current-static',lambda:.1,
  freezeHash:f.freezeHash,freezeFileSha256:sha(old.freezeBytes),protocolSha256:f.protocolSha256}))assert.equal(s[key],value);
 assert.ok(Number.isInteger(s.selectedIndex)&&s.selectedIndex>=0&&s.selectedIndex<3);
 assert.equal(s.selectedIndex,1);assert.equal(s.bodyWeight,.75);assert.equal(s.titleWeight,.25);
 for(const key of SELECT_FIELDS.filter(k=>/Hash$|Sha256$/u.test(k)))hash(s[key]);
 const profiles=dense(s.targetProfiles,2).map(validateProducerProfile);assert.deepEqual(profiles.map(p=>p.producerId),['current-static','browser-current']);
 if(Object.hasOwn(f,'targetProfiles'))assert.deepEqual(f.targetProfiles,profiles);
 hash(f.profileRecipeHash);assert.equal(f.sourceHashes['protocol.json'],f.protocolSha256);
 for(const [key,value]of Object.entries({schema:'current-producer-root-fit-supervisor/v1',phase:'fit-current',reason:null,exitCode:0,cleanupReason:null,
  ownTreeCleanupConfirmed:true,sourceHashesRechecked:true,freezeSha256:sha(old.freezeBytes),resultSha256:sha(old.selectionReceiptBytes),
  jobMemoryLimitBytes:1536*1048576}))assert.equal(supervisor[key],value);
 assert.deepEqual(supervisor.sourceHashes,old.sourceHashes);
 assert.ok(Number.isFinite(supervisor.elapsedSeconds)&&supervisor.elapsedSeconds>=0&&supervisor.elapsedSeconds<=180);
 for(const key of ['sampledPeakTreeRssBytes','sampledPeakTreePrivateBytes'])assert.ok(Number.isSafeInteger(supervisor[key])&&supervisor[key]>=0&&supervisor[key]<=1536*1048576);
 return {f,selection:{...s,targetProfiles:profiles}};
}
function nextIdentity(input,old){
 const a=record(copyData(input),NEXT_FIELDS);
 for(const key of NEXT_FIELDS.filter(k=>k!=='browserProfile'))hash(a[key]);
 const browser=validateProducerProfile(a.browserProfile);assert.equal(browser.producerId,'browser-current');
 assert.equal(a.candidateSha256,old.selection.candidateSha256,'Candidate cohort cannot change');
 assert.equal(a.labelSealSha256,old.selection.labelSealSha256,'Labels cannot change');
 assert.notEqual(a.profileRecipeHash,old.f.profileRecipeHash,'New browser recipe required');
 assert.notEqual(browser.inputConstructionHash,old.selection.trainingInputConstructionHash,'Target cannot relabel training builder');
 for(const p of old.selection.targetProfiles)assert.notEqual(browser.inputConstructionHash,p.inputConstructionHash,'New browser construction required');
 return {...a,targetProfiles:[old.selection.targetProfiles[0],browser]};
}
function transferIdentity(selection,profiles){
 const identity={schema:'builder-scoped-root-rank-candidate/v1',modelJsonHash:selection.modelJsonHash,
  modelJsonHashConvention:'sha256-JSON.stringify-artifact-property-order-not-JCS-or-file-bytes/v1',
  policyHash:selection.policyHash,originalPolicySchema:'pooled-root-rank-development-policy/v1',trainingInputConstructionHash:selection.trainingInputConstructionHash,
  representation:'paired-raw-e5-body-title-v1',representationHash:selection.representationHash,encoderHash:selection.encoderHash,
  bodyWeight:selection.bodyWeight,titleWeight:selection.titleWeight,nodeIds:[...ROOT_IDS].sort(),
  targetProfiles:[...profiles].sort((a,b)=>a.producerId<b.producerId?-1:a.producerId>b.producerId?1:0),
  experimental:true,developmentOnly:true,perClassPrecisionGuaranteed:false,transferValidationStatus:'unvalidated',productionValidated:false,assignmentAuthority:false,
  inputIdentityClaims:'caller-declared-not-attested'};
 return {...identity,transferHash:digest(identity)};
}
function expectedReceipt(oldBytes,metadata,next){
 const s=metadata.selection,oldTransfer=transferIdentity(s,s.targetProfiles);assert.equal(oldTransfer.transferHash,s.transferHash,'Old transfer metadata mismatch');
 const transfer=transferIdentity(s,next.targetProfiles);assert.notEqual(transfer.transferHash,s.transferHash);
 const body={schema:'browser-root-artifact-reuse/v1',phase:'fixed-artifacts-bound-before-browser-reobservation',
  oldFitFreezeHash:s.freezeHash,oldFitFreezeSha256:sha(oldBytes.freezeBytes),oldFitSupervisorSha256:sha(oldBytes.supervisorBytes),
  oldSelectionReceiptSha256:sha(oldBytes.selectionReceiptBytes),oldSelectionReportSha256:s.selectionSha256,oldSourceHashesHash:digest(oldBytes.sourceHashes),
  selectedModelSha256:s.selectedModelSha256,modelJsonHash:s.modelJsonHash,modelJsonHashConvention:transfer.modelJsonHashConvention,
  selectedPolicySha256:s.selectedPolicySha256,policyHash:s.policyHash,selectedInputDefinitionSha256:s.selectedInputDefinitionSha256,
  originalTransferHash:s.transferHash,trainingInputConstructionHash:s.trainingInputConstructionHash,eligibleCohortHash:s.eligibleCohortHash,
  calibrationGoldSha256:s.calibrationGoldSha256,encoderHash:s.encoderHash,representation:transfer.representation,representationHash:s.representationHash,
  bodyWeight:s.bodyWeight,titleWeight:s.titleWeight,lambda:s.lambda,candidateSha256:next.candidateSha256,labelSealSha256:next.labelSealSha256,
  protocolSha256:next.protocolSha256,profileRecipeHash:next.profileRecipeHash,targetProfiles:next.targetProfiles,transferIdentity:transfer,transferHash:transfer.transferHash,
  dependencySourceHashes:{...ARTIFACT_REUSE_DEPENDENCY_PINS},
  reobservation:{scope:'same-predetermined-32-URLs-groups-labels-and-order',predecessor:'closed-ADR143-and-ADR145-before-final-E5',
   freshCompleteAttempt:true,oldPacketBodyVectorSplice:false,untouchedIndependentCohort:false,statisticalIndependenceClaim:false},
  evaluatedProducers:['browser-current'],unexercisedProducers:['current-static'],
  originalStaticProfileUnchanged:true,networkRequestIdCorrelated:false,
  producerScopes:{'current-static':'original-profile-unexercised-compile-dependency/v1','browser-current':'restricted-single-document-dom-reader/v1'},
  noRefit:true,noRetune:true,noClassificationInReceiptCreation:true,noE5InReceiptCreation:true,experimental:true,developmentOnly:true,
  ordinaryDynamicBrowserProducerValidated:false,productionValidated:false,assignmentAuthority:false,
  identityScope:'caller-supplied-byte-and-metadata-links-not-filesystem-native-freshness-or-coefficient-attestation'};
 return {...body,receiptHash:digest(body)};
}
/** Collector path: metadata only. Caller MUST pin reviewed receipt FILE bytes
 * and actual old proof/source bytes in its own fixed allowlist/source freeze.
 * This does not load coefficients, compile a model, or authenticate ML math.
 */
export function validateBrowserArtifactReuseReceipt(input){
 const a=record(input,['receipt','oldProof','next']),old=copyOld(a.oldProof,false),metadata=oldMetadata(old),next=nextIdentity(a.next,metadata);
 const receipt=copyData(a.receipt);assert.ok(Buffer.byteLength(JSON.stringify(receipt))<=65536);
 const expected=expectedReceipt(old,metadata,next);assert.deepEqual(receipt,expected);return freeze(expected);
}
/** Creator only: privately copies supplied bytes, verifies the successful old
 * fit/artifacts and compiles unchanged coefficients twice (old/new profiles).
 * No fit, dot product, classification, asset load, source IO or writer occurs.
 */
export async function createBrowserArtifactReuseReceipt(input){
 const a=record(input,['oldFit','next','dependencySourceHashes']),old=copyOld(a.oldFit,true);
 assert.deepEqual(sourceMap(a.dependencySourceHashes),ARTIFACT_REUSE_DEPENDENCY_PINS);
 const metadata=oldMetadata(old),next=nextIdentity(a.next,metadata),proof=validateRootFitEvidence(old);
 const {compileBuilderScopedRootRankCandidate,describeBuilderScopedRootRankCandidate}=await import('../../../../apps/local-service/experiments/topic-encoder/builder-scoped-root-rank-candidate-v1/scorer.js');
 const compile=profiles=>compileBuilderScopedRootRankCandidate({schema:'builder-scoped-root-rank-candidate/v1',inputDefinition:proof.inputDefinition,
  rootModel:proof.model,rootPolicy:proof.policy,trainingInputConstructionHash:metadata.selection.trainingInputConstructionHash,
  targetProfiles:profiles.map(({producerId,inputConstructionHash,extractorVersions})=>({producerId,inputConstructionHash,extractorVersions}))});
 const original=describeBuilderScopedRootRankCandidate(compile(metadata.selection.targetProfiles));
 assert.equal(original.transferHash,metadata.selection.transferHash);
 const identity=describeBuilderScopedRootRankCandidate(compile(next.targetProfiles));
 assert.deepEqual(identity,transferIdentity(metadata.selection,next.targetProfiles));
 return freeze(expectedReceipt(old,metadata,next));
}


