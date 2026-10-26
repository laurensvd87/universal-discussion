// Pure supplied-byte authentication/compilation. No loading, fitting or scoring.
import {types} from 'node:util';
import {record,hash,freeze,digest,dataCopy,sha,requireTrue} from './manifest.js';
import {validateSpecificityProducerProfile,ROOT_IDS} from './producer-profile.js';
import {validateRootFitEvidence} from '../../../../../apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-evaluation-v1/contracts.js';
import {compileBuilderScopedRootRankCandidate,describeBuilderScopedRootRankCandidate} from '../../../../../apps/local-service/experiments/topic-encoder/builder-scoped-root-rank-candidate-v1/scorer.js';
import {compileNativeRootRankCandidate,describeNativeRootRankCandidate} from '../../../../../apps/local-service/experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js';
export const OLD_FIT_BYTE_CAPS=Object.freeze({freezeBytes:65536,supervisorBytes:65536,selectionReceiptBytes:65536,
 selectionBytes:262144,modelBytes:262144,policyBytes:65536,inputDefinitionBytes:16384});
export const OLD_FIT_TOTAL_BYTES=802816;
const BYTE_KEYS=Object.keys(OLD_FIT_BYTE_CAPS),lengthGetter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'length').get;
function sources(value){
 const m=dataCopy(value,{values:1024,units:65536,depth:2,array:0,properties:128,string:512});
 requireTrue(m!==null&&typeof m==='object'&&!Array.isArray(m));const keys=Object.keys(m);requireTrue(keys.length>0&&keys.length<=128);
 for(const k of keys){requireTrue(k.length>0&&k.length<=160&&!/[\u0000-\u001f\u007f]/u.test(k));hash(m[k]);}return m;
}
function bytes(value,maximum){
 requireTrue(value!==null&&typeof value==='object'&&!types.isProxy(value)&&Buffer.isBuffer(value)&&Object.getPrototypeOf(value)===Buffer.prototype);
 const n=Reflect.apply(lengthGetter,value,[]);requireTrue(n>0&&n<=maximum,'byte-capacity');
 requireTrue(Reflect.ownKeys(value).length===n);return Buffer.from(value);
}
/** Expected FILE/SOURCE pins are independent owner configuration. This verifies
 * supplied bytes, NOT files on disk, actual fit execution or native authority. */
export function createSpecificityArtifactReuse(config){
 const c=record(config,['expectedOldFileHashes','expectedOldSourceHashes']),expected=record(c.expectedOldFileHashes,BYTE_KEYS);Object.values(expected).forEach(hash);
 const expectedSources=sources(c.expectedOldSourceHashes);
 return Object.freeze({bind(input){
  const a=record(input,['oldFit','profileSet','expectedRecipeHash','panelIdentity','manifestHash','protocolHash']);
  for(const k of ['expectedRecipeHash','panelIdentity','manifestHash','protocolHash'])hash(a[k]);
  const raw=record(a.oldFit,[...BYTE_KEYS,'sourceHashes']),actualSources=sources(raw.sourceHashes);
  requireTrue(digest(actualSources)===digest(expectedSources),'old-source-auth');
  const old={sourceHashes:actualSources};let total=0;
  for(const k of BYTE_KEYS){old[k]=bytes(raw[k],OLD_FIT_BYTE_CAPS[k]);total+=old[k].length;}
  requireTrue(total<=OLD_FIT_TOTAL_BYTES,'byte-capacity');
  const actual=Object.fromEntries(BYTE_KEYS.map(k=>[k,sha(old[k])]));
  requireTrue(BYTE_KEYS.every(k=>actual[k]===expected[k]),'old-file-auth');
  // All seven FILE pins and the independent SOURCE map matched before any
  // parser or old proof compiler can run. Profile recipe contains no old bytes.
  const p=validateSpecificityProducerProfile({profileSet:a.profileSet,expectedRecipeHash:a.expectedRecipeHash,expectedPanelIdentity:a.panelIdentity,expectedManifestHash:a.manifestHash});
  const proof=validateRootFitEvidence(old),s=proof.selection;
  requireTrue(s.selectedIndex===1&&s.bodyWeight===.75&&s.titleWeight===.25&&s.lambda===.1&&proof.model.lambda===.1);
  requireTrue(proof.inputDefinition.bodyWeight===.75&&proof.inputDefinition.titleWeight===.25&&proof.inputDefinition.encoderHash===p.construction.encoder.encoderHash,'encoder');
  requireTrue(s.encoderHash===p.construction.encoder.encoderHash,'encoder');
  const roots=proof.model.nodes.map(n=>n.id).sort();requireTrue(digest(roots)===digest([...ROOT_IDS].sort()));
  requireTrue(p.recipeHash!==s.trainingInputConstructionHash&&s.targetProfiles.every(x=>x.inputConstructionHash!==p.recipeHash),'profile');
  const original=describeBuilderScopedRootRankCandidate(compileBuilderScopedRootRankCandidate({schema:'builder-scoped-root-rank-candidate/v1',inputDefinition:proof.inputDefinition,
   rootModel:proof.model,rootPolicy:proof.policy,trainingInputConstructionHash:s.trainingInputConstructionHash,
   targetProfiles:s.targetProfiles.map(({producerId,inputConstructionHash,extractorVersions})=>({producerId,inputConstructionHash,extractorVersions}))}));
  requireTrue(original.transferHash===s.transferHash,'original-transfer');
  const {producerId,inputConstructionHash,extractorVersions,effectiveTitleRule}=p.producerProfile;
  const rootCandidate={schema:'native-root-rank-candidate/v1',inputDefinition:proof.inputDefinition,rootModel:proof.model,rootPolicy:proof.policy,
   trainingInputConstructionHash:s.trainingInputConstructionHash,targetProfile:{producerId,inputConstructionHash,extractorVersions:[...extractorVersions],effectiveTitleRule}};
  const target=describeNativeRootRankCandidate(compileNativeRootRankCandidate(rootCandidate));requireTrue(target.transferHash!==original.transferHash);
  const body={schema:'native-specificity-root-artifact-reuse/v1',original:{fileHashes:actual,sourceHashesHash:digest(actualSources),fitFreezeHash:s.freezeHash,
   originalCandidateSha256:s.candidateSha256,originalLabelSealSha256:s.labelSealSha256,originalTargetProfiles:s.targetProfiles,trainingInputConstructionHash:s.trainingInputConstructionHash,
   eligibleCohortHash:s.eligibleCohortHash,calibrationGoldSha256:s.calibrationGoldSha256,modelJsonHash:s.modelJsonHash,policyHash:s.policyHash,transferHash:s.transferHash},
   target:{panelIdentity:a.panelIdentity,manifestHash:a.manifestHash,protocolHash:a.protocolHash,groups:168,trainCalGroups:96,testGroups:72,profileRecipeHash:p.recipeHash,
    producerProfile:p.producerProfile,transferIdentity:target},bodyWeight:.75,titleWeight:.25,lambda:.1,
   identityScope:'supplied-byte-and-program-links-not-filesystem-training-or-native-attestation',noFitOrScoringPerformedByThisContract:true,
   originalCohortReobservedClaim:false,statisticalIndependenceClaim:false,actualNativeCompatibilityEstablished:false,productionValidated:false,assignmentAuthority:false};
  const receipt={...body,receiptHash:digest(body)};requireTrue(Buffer.byteLength(JSON.stringify({receipt,rootCandidate}))<=1048576,'capacity');
  return freeze({receipt,rootCandidate});
 }});
}
