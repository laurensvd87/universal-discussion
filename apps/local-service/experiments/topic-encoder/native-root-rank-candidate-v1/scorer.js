// Unregistered ADR150 native ROOT-ONLY transfer candidate. No fitting, IO or runtime hooks.
// Caller input/document/source IDs are claims, NOT canonical freshness, native
// document, rights or write attestations. Vector hashes bind actual validated
// binary64 input bits; they do not attest which producer created those vectors.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {inspectPageUrl,inspectPageNavigationUrl} from '../../../../../spikes/topic-resolution/browser/core/page-content-policy.js';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../../../src/domain/hierarchical-e5-paired-input.js';
import {compileHierarchyLinearHeads,scoreHierarchyLinearHeads} from '../../../src/domain/hierarchical-e5-paired-linear-heads.js';
import {compilePooledRootRankPolicy,rankRootScores} from '../hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js';

export const NATIVE_ROOT_RANK_LIMITS=Object.freeze({dimensions:384,maxRoots:16,maxTargetProfiles:1,maxExtractorVersions:2,
 maxStringUnits:160,maxCompileCopyItems:16384,maxHeadScalarProducts:6144,maxRankComparisonWork:64});
export class NativeRootRankError extends TypeError{
 constructor(code,message){super(message);this.name='NativeRootRankError';this.code=code;}
}
const bad=message=>{throw new NativeRootRankError('invalid-input',message);};
const capacity=message=>{throw new NativeRootRankError('capacity',message);};
const HEX=/^[a-f0-9]{64}$/u,handles=new WeakMap(),lex=(a,b)=>a<b?-1:a>b?1:0;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const MODEL_FIELDS=['schema','representation','representationHash','trainingVersion','trainingHash','taxonomyHash','settingsHash','parameterHash',
 'lambda','dimensions','trainingIdHashes','trainingGroupHashes','provenanceHash','experimental','productionValidated','assignmentAuthority','nodes','heads','trainingWork'];
const POLICY_FIELDS=['schema','modelHash','representationHash','inputConstructionHash','nodeIds','calibrationHash','minimumAcceptedGroups','enabled',
 'minWinnerScore','minWinnerGap','acceptedGroups','correctGroups','work','developmentOnly','perClassPrecisionGuaranteed','productionValidated','assignmentAuthority','policyHash'];
const METADATA_FIELDS=['sourceId','sourceVersion','producerId','producerProfileHash','inputConstructionHash','extractorVersion',
 'fieldBindings','nativeWitness','rightsEvidenceHash'];
const INPUT_FIELDS=[...METADATA_FIELDS,'sourceInputHash','bodyVector','titleVector'];
function record(v,keys){
 if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype)bad('Expected plain data record');
 if(Reflect.ownKeys(v).length!==keys.length)bad('Unexpected record fields');
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(v,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad('Expected enumerable data fields');out[key]=d.value;}return out;
}
function list(v,max){
 if(!v||typeof v!=='object'||types.isProxy(v)||!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype)bad('Expected plain dense array');
 const n=Object.getOwnPropertyDescriptor(v,'length').value;if(n>max)capacity('Array capacity exceeded');
 if(Reflect.ownKeys(v).length!==n+1)bad('Sparse or extended array');
 return Array.from({length:n},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))bad('Expected array data fields');return d.value;});
}
function id(v){
 if(typeof v!=='string'||!v.length||v.trim()!==v||!v.isWellFormed()||/[\u0000-\u001f\u007f]/u.test(v))bad('Invalid identifier');
 if(v.length>160)capacity('Identifier capacity exceeded');return v;
}
function sha(v){if(typeof v!=='string'||!HEX.test(v))bad('Expected lowercase SHA-256');return v;}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
function copyValidated(v,budget={left:16384},depth=0){
 if(--budget.left<0||depth>8)capacity('Compile copy capacity exceeded');
 if(v===null||typeof v!=='object'){if(!['string','number','boolean'].includes(typeof v)&&v!==null)bad('Non-data artifact');return v;}
 if(types.isProxy(v))bad('Proxy artifact');
 if(Array.isArray(v))return list(v,384).map(x=>copyValidated(x,budget,depth+1));
 if(Object.getPrototypeOf(v)!==Object.prototype)bad('Non-plain artifact');
 const out={};for(const key of Reflect.ownKeys(v)){
  if(typeof key!=='string')bad('Symbol artifact key');
  const d=Object.getOwnPropertyDescriptor(v,key);if(!d.enumerable||!Object.hasOwn(d,'value'))bad('Accessor artifact');
  out[key]=copyValidated(d.value,budget,depth+1);
 }return out;
}
function vector(v){
 const out=list(v,384);if(out.length!==384)bad('Expected 384 coordinates');let norm=0;
 for(const n of out){if(typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1)bad('Invalid finite unit coordinate');norm+=n*n;}
 if(Math.abs(norm-1)>1e-5)bad('Expected unit vector without implicit renormalization');return out;
}
function vectorHash(v){
 const buffer=new ArrayBuffer(384*8),view=new DataView(buffer);
 for(let i=0;i<384;i++)view.setFloat64(i*8,v[i],true);
 return createHash('sha256').update('builder-root-input-vector/binary64-le/384/v1\0').update(new Uint8Array(buffer)).digest('hex');
}
function profile(input){
 const p=record(input,['producerId','inputConstructionHash','extractorVersions','effectiveTitleRule']);
 if(p.producerId!=='native-browser-current'||p.effectiveTitleRule!=='trim-or-hostname/v1')bad('Undeclared native producer/title rule');
 sha(p.inputConstructionHash);
 const versions=list(p.extractorVersions,2).map(id).sort(lex),expected=['article-container-prefix/v1','main-text-prefix/v1'];
 if(versions.length!==2||versions.some((v,i)=>v!==expected[i]))bad('Native extractor contract mismatch');
 const body={schema:'native-root-target-producer-profile/v1',producerId:p.producerId,inputConstructionHash:p.inputConstructionHash,
  extractorVersions:versions,effectiveTitleRule:p.effectiveTitleRule};
 return freeze({...body,producerProfileHash:digest(body)});
}
function integer(v,max=Number.MAX_SAFE_INTEGER){
 if(!Number.isSafeInteger(v)||v<0||v>max||Object.is(v,-0))bad('Invalid nonnegative integer identity');return v;
}
function nativeDocument(input){
 const d=record(input,['schema','studyId','studyRevision','caseId','ordinal','observationNonce','eventEpoch','tabId','windowId','frameId','documentId',
  'sourceUrl','documentUrl','foregroundChecks','read','attestation','effectiveTitleRule','nativeDocumentContinuityOnly','canonicalAuthority']);
 if(d.schema!=='chrome-scripting-native-reader/v1'||d.effectiveTitleRule!=='trim-or-hostname/v1'||
  d.nativeDocumentContinuityOnly!==true||d.canonicalAuthority!==false)bad('Unknown native witness contract');
 for(const key of ['studyId','studyRevision','caseId','observationNonce'])id(d[key]);
 if(!/^[A-Za-z0-9._:-]{1,160}$/u.test(d.studyRevision))bad('Invalid study revision');
 integer(d.ordinal,32);if(d.ordinal<1)bad('Invalid case ordinal');
 integer(d.eventEpoch);integer(d.tabId,2147483647);integer(d.windowId,2147483647);
 if(d.frameId!==0||Object.is(d.frameId,-0)||typeof d.documentId!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/u.test(d.documentId))bad('Invalid native main document');
 for(const key of ['sourceUrl','documentUrl']){
  const value=d[key];if(typeof value!=='string'||!value.isWellFormed()||value.length>2048)bad('Invalid bounded URL identity');
 }
 // Reuse only the reader's pure syntactic URL policy. No DNS, consent or rights proof.
 const source=inspectPageUrl(d.sourceUrl),navigation=inspectPageNavigationUrl(d.documentUrl);
 if(!source.supported||source.url!==d.sourceUrl||!navigation.supported||navigation.documentUrl!==d.documentUrl||
  navigation.url!==d.sourceUrl)bad('Native Source/document URL mismatch');
 d.foregroundChecks=list(d.foregroundChecks,3).map(value=>{
  const f=record(value,['windowId','tabId','focused','windowType','incognito','active','tabStatus','sourceUrl','documentUrl','permissionGranted']);
  integer(f.windowId,2147483647);integer(f.tabId,2147483647);
  if(f.windowId!==d.windowId||f.tabId!==d.tabId||f.focused!==true||f.windowType!=='normal'||f.incognito!==false||
   f.active!==true||f.tabStatus!=='complete'||f.sourceUrl!==d.sourceUrl||f.documentUrl!==d.documentUrl||f.permissionGranted!==true)
   bad('Native foreground continuity mismatch');
  return f;
 });
 if(d.foregroundChecks.length!==3)bad('Three foreground observations required');
 d.read=record(d.read,['contractVersion','status','documentId']);
 if(d.read.contractVersion!=='page-content/1'||d.read.status!=='collected'||d.read.documentId!==d.documentId)bad('Read document mismatch');
 d.attestation=record(d.attestation,['contractVersion','status','url']);
 if(d.attestation.contractVersion!=='page-content-attestation/1'||d.attestation.status!=='attested'||d.attestation.url!==d.sourceUrl)
  bad('Native attestation mismatch');
 return freeze(d);
}
function fields(input){
 const b=record(input,['bodySha256','bodyCharacters','rawTitleSha256','rawTitleCharacters','effectiveTitleSha256','effectiveTitleCharacters']);
 for(const k of ['bodySha256','rawTitleSha256','effectiveTitleSha256'])sha(b[k]);
 integer(b.bodyCharacters,4096);integer(b.rawTitleCharacters,200);integer(b.effectiveTitleCharacters,200);
 if(!b.bodyCharacters||!b.effectiveTitleCharacters)bad('Body and effective title must be available');
 return freeze(b);
}
/** modelJsonHash uses the frozen policy's program JSON.stringify serialization,
 * preserving declared artifact property order. It is NOT JCS, file-byte SHA,
 * coefficient-bit attestation or proof of actual training/calibration quality. */
export function compileNativeRootRankCandidate(input){
 if(arguments.length!==1)bad('Expected one compile record');
 const a=record(input,['schema','inputDefinition','rootModel','rootPolicy','trainingInputConstructionHash','targetProfile']);
 if(a.schema!=='native-root-rank-candidate/v1')bad('Unknown candidate schema');sha(a.trainingInputConstructionHash);
 const model=record(a.rootModel,MODEL_FIELDS),nodeRecords=list(model.nodes,16).map(n=>record(n,['id','parentId']));
 if(nodeRecords.length<2)bad('At least two approved roots are required');
 for(const n of nodeRecords){id(n.id);if(n.parentId!==null)bad('Root-only taxonomy required');}
 const nodeIds=nodeRecords.map(n=>n.id).sort(lex);
 if(new Set(nodeIds).size!==nodeIds.length)bad('Duplicate root');
 const headRecords=list(model.heads,16);
 const compiledModel=compileHierarchyLinearHeads(a.rootModel);
 for(const h of headRecords)if(Object.getOwnPropertyDescriptor(h,'enabled').value!==true)bad('Every root head requires independent training support');
 const modelCopy=copyValidated(a.rootModel),modelJsonHash=digest(modelCopy);
 const policyRecord=record(a.rootPolicy,POLICY_FIELDS);
 compilePooledRootRankPolicy(a.rootPolicy); // Frozen validation retains development-only semantics.
 const policy=copyValidated(a.rootPolicy),policyIds=[...policy.nodeIds].sort(lex);
 if(policyRecord.modelHash!==modelJsonHash||policyRecord.inputConstructionHash!==a.trainingInputConstructionHash||
  policyIds.length!==nodeIds.length||policyIds.some((id,i)=>id!==nodeIds[i]))bad('Model/policy/training owner mismatch');
 const adapter=compilePairedE5Input(a.inputDefinition),paired=describePairedE5Input(adapter);
 if(model.representation!==paired.representation||model.representationHash!==paired.representationHash||
  policy.representationHash!==paired.representationHash)bad('Paired representation mismatch');
 const target=profile(a.targetProfile),profiles=[target];
 if(target.inputConstructionHash===a.trainingInputConstructionHash)bad('Target must not relabel the training builder');
 const body={schema:a.schema,modelJsonHash,modelJsonHashConvention:'sha256-JSON.stringify-artifact-property-order-not-JCS-or-file-bytes/v1',
  policyHash:policy.policyHash,originalPolicySchema:policy.schema,trainingInputConstructionHash:a.trainingInputConstructionHash,
  representation:paired.representation,representationHash:paired.representationHash,encoderHash:paired.definition.encoderHash,
  bodyWeight:paired.definition.bodyWeight,titleWeight:paired.definition.titleWeight,nodeIds,targetProfiles:profiles,
  experimental:true,developmentOnly:true,perClassPrecisionGuaranteed:false,transferValidationStatus:'unvalidated',
  productionValidated:false,assignmentAuthority:false,inputIdentityClaims:'caller-declared-not-attested'};
 const identity=freeze({...body,transferHash:digest(body)}),handle=Object.freeze({});
 handles.set(handle,{compiledModel,adapter,policy:freeze(policy),profiles:new Map(profiles.map(p=>[p.producerId,p])),identity});
 return handle;
}
export function describeNativeRootRankCandidate(handle){
 if(arguments.length!==1||!handles.has(handle))bad('Expected private compiled candidate');return handles.get(handle).identity;
}
/** Pure pre-encoding identity preparation; it does not inspect the evidence
 * represented by rightsEvidenceHash or authenticate an actual native read. */
export function prepareNativeRootInput(handle,input){
 if(arguments.length!==2||!handles.has(handle))bad('Expected private compiled candidate');
 const state=handles.get(handle),a=record(input,METADATA_FIELDS),profile=state.profiles.get(a.producerId);
 for(const key of ['sourceId','sourceVersion','producerId','extractorVersion'])id(a[key]);
 for(const key of ['producerProfileHash','inputConstructionHash','rightsEvidenceHash'])sha(a[key]);
 if(!profile||a.producerProfileHash!==profile.producerProfileHash||a.inputConstructionHash!==profile.inputConstructionHash||
  !profile.extractorVersions.includes(a.extractorVersion))bad('Native profile/extractor mismatch');
 const doc=nativeDocument(a.nativeWitness),fieldBindings=fields(a.fieldBindings),nativeWitnessHash=digest(doc);
 if(a.sourceId!==doc.caseId||a.sourceVersion!==doc.observationNonce)bad('Case/observation identity mismatch');
 const inputIdentity={schema:'native-root-paired-input/v1',sourceId:a.sourceId,sourceVersion:a.sourceVersion,producerId:a.producerId,
  producerProfileHash:a.producerProfileHash,inputConstructionHash:a.inputConstructionHash,extractorVersion:a.extractorVersion,
  fieldBindings,nativeWitnessHash,rightsEvidenceHash:a.rightsEvidenceHash};
 return freeze({...a,fieldBindings,nativeWitness:doc,sourceInputHash:digest(inputIdentity)});
}
export function classifyNativeRootRankCandidate(handle,input){
 if(arguments.length!==2||!handles.has(handle))bad('Expected private compiled candidate');
 const state=handles.get(handle),a=record(input,INPUT_FIELDS);
 const metadata=Object.fromEntries(METADATA_FIELDS.map(key=>[key,a[key]]));
 const prepared=prepareNativeRootInput(handle,metadata);
 sha(a.sourceInputHash);if(prepared.sourceInputHash!==a.sourceInputHash)bad('Native input identity hash mismatch');
 const doc=prepared.nativeWitness,fieldBindings=prepared.fieldBindings,nativeWitnessHash=digest(doc);
 const body=vector(a.bodyVector),title=vector(a.titleVector);
 const witness=freeze({sourceId:a.sourceId,sourceVersion:a.sourceVersion,producerId:a.producerId,
  producerProfileHash:a.producerProfileHash,inputConstructionHash:a.inputConstructionHash,extractorVersion:a.extractorVersion,
  sourceInputHash:a.sourceInputHash,fieldBindings,nativeWitnessHash,rightsEvidenceHash:prepared.rightsEvidenceHash,
  nativeDocumentIdentity:{studyId:doc.studyId,studyRevision:doc.studyRevision,ordinal:doc.ordinal,eventEpoch:doc.eventEpoch,
   tabId:doc.tabId,windowId:doc.windowId,frameId:doc.frameId,documentId:doc.documentId,
   sourceUrlHash:createHash('sha256').update(doc.sourceUrl).digest('hex'),documentUrlHash:createHash('sha256').update(doc.documentUrl).digest('hex')}});
 const vectorBindings=freeze({encoding:'ieee754-binary64-little-endian/384/v1',bodyVectorHash:vectorHash(body),titleVectorHash:vectorHash(title)});
 const semanticWitnessHash=digest({schema:'native-root-rank-semantic-witness/v1',transferHash:state.identity.transferHash,witness,vectorBindings});
 const fused=applyPairedE5Input(state.adapter,{sourceId:a.sourceId,sourceVersion:a.sourceVersion,bodyVector:body,titleVector:title});
 let supportedPath=[],reason='zero-fused-norm',headDotProducts=0,headScalarProducts=0,rankComparisonWork=0;
 if(fused.status==='available'){
  const scored=scoreHierarchyLinearHeads(state.compiledModel,{sourceId:a.sourceId,sourceVersion:a.sourceVersion,
   representation:fused.representation,representationHash:fused.representationHash,vector:fused.vector});
  headDotProducts=scored.work.dotProducts;headScalarProducts=scored.work.scalarProducts;
  const ranked=rankRootScores({nodeIds:state.identity.nodeIds,scores:scored.scores.map(({nodeId,score})=>({nodeId,score}))});
  rankComparisonWork=ranked.comparisonWork;
  // Exactly the frozen pooled classifier's numeric predicates. No native
  // Source witness is ever relabelled with policy.inputConstructionHash.
  const accepted=state.policy.enabled&&!ranked.tied&&ranked.winnerScore>=state.policy.minWinnerScore&&ranked.winnerGap>=state.policy.minWinnerGap;
  if(accepted)supportedPath=[ranked.winnerId];
  reason=ranked.tied?'rank-tie':!state.policy.enabled?'disabled':accepted?'accepted':'below-pooled-cut';
 }
 if(headScalarProducts>6144||rankComparisonWork>64)capacity('Runtime work exceeded root bound');
 return freeze({schema:'native-root-rank-transfer-decision/v1',status:supportedPath.length?'candidate':'unresolved',reason,supportedPath,
  witness,vectorBindings,semanticWitnessHash,identity:state.identity,
  // Scoped numeric counters + adapter-fusion bound only, not all wrapper
  // validation/copy/hash/native-hypot/serialization CPU or embedding latency.
  work:{headDotProducts,headScalarProducts,rankComparisonWork,fusionCoordinateVisitUpperBound:384*8},
  experimental:true,developmentOnly:true,transferValidationStatus:'unvalidated',productionValidated:false,assignmentAuthority:false});
}
