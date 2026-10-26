// Pure native builder recipe. Supplied source hashes are identity claims, not IO,
// native capture authentication, rights approval or filesystem attestation.
import assert from 'node:assert/strict';
import {record,dense,hash,freeze,digest} from '../../current-producer-final-v1/manifest.js';
const ROOT='spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/';
export const CONSTRUCTION_SOURCE_KEYS=Object.freeze([
 ROOT+'native-adapter.js',ROOT+'native-adapter.test.mjs',ROOT+'worker.js',ROOT+'manifest.json',ROOT+'README.md',
 ROOT+'phase-ledger.js',ROOT+'producer-profile.js',ROOT+'artifact-reuse.js',ROOT+'protocol.json',
 ROOT+'browser-capture.mjs',ROOT+'network-policy.js',ROOT+'run.mjs',ROOT+'native-rights.js',
 ROOT+'dns-resolver.js',ROOT+'study-runner.js',ROOT+'source-ledger.js',ROOT+'source-paths.js',
 'spikes/topic-resolution/harness/experimental/playwright-route-coordinator-v1/coordinator.mjs',
 'apps/local-service/experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js',
 'spikes/topic-resolution/browser/chromium/page-content-reader.js',
 'spikes/topic-resolution/browser/core/page-content-policy.js',
 'spikes/topic-resolution/browser/embedding/embedding-contract.js',
 'apps/local-service/src/crawler/packaged-e5.js',
]);
const VERSIONS=Object.freeze(['article-container-prefix/v1','main-text-prefix/v1']);
export function validateNativeProducerProfile(value){
 const p=record(value,['schema','producerId','inputConstructionHash','extractorVersions','effectiveTitleRule','producerProfileHash']);
 assert.equal(p.schema,'native-root-target-producer-profile/v1');assert.equal(p.producerId,'native-browser-current');
 hash(p.inputConstructionHash);hash(p.producerProfileHash);
 assert.deepEqual(dense(p.extractorVersions,2),VERSIONS);assert.equal(p.effectiveTitleRule,'trim-or-hostname/v1');
 const body={schema:p.schema,producerId:p.producerId,inputConstructionHash:p.inputConstructionHash,
  extractorVersions:[...VERSIONS],effectiveTitleRule:p.effectiveTitleRule};
 assert.equal(digest(body),p.producerProfileHash);return freeze({...body,producerProfileHash:p.producerProfileHash});
}
export function buildNativeProducerProfile(value){
 // Exact literal key set, explicit reconstruction order. Never follow these
 // strings as paths; a separate fixed-source ledger must inspect actual bytes.
 const sourceHashes=record(value,CONSTRUCTION_SOURCE_KEYS);
 for(const h of Object.values(sourceHashes))hash(h);
 const construction=freeze({schema:'native-root-target-construction/v1',producerId:'native-browser-current',
  sourceHashes,extractorVersions:[...VERSIONS],rawTitleLimitUtf16:200,effectiveTitleLimitUtf16:200,bodyLimitUtf16:4096,
  effectiveTitleRule:'trim-or-hostname/v1',witnessSchema:'chrome-scripting-native-reader/v1',
  observation:{orderedCaseCount:32,mainFrameOnly:true,readThenExactNativeDocumentAttestation:true,
   actualForegroundObservations:3,privateStudyRevisionAndEventEpoch:true,
   nativeAttestationMeaning:'document-and-URL-continuity-not-unchanged-DOM-or-canonical-authority'},
  rights:{sameNativeDocumentMainResponseAndDomRequired:true,individualResourceProcessingRightsProven:false},
  inputRetention:'transient-RAM-only',encoderPhase:'after-all32-accounted-and-browser-drained',
  preprocessing:'exact-native-reader-body-and-trim-or-hostname-effective-title-no-prune-lead-or-rescue',
  scope:'owned-native-reader-resource-restricted-current-input/v1',
  unrestrictedBrowserParity:false,productionValidated:false,assignmentAuthority:false});
 const body={schema:'native-root-target-producer-profile/v1',producerId:'native-browser-current',
  inputConstructionHash:digest(construction),extractorVersions:[...VERSIONS],effectiveTitleRule:'trim-or-hostname/v1'};
 return freeze({schema:'native-root-target-profile-set/v1',producerProfile:{...body,producerProfileHash:digest(body)},
  construction,recipeHash:digest(construction)});
}
