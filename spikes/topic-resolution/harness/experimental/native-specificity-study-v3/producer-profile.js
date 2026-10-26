// ADR179 supplied-source recipe only. Never opens paths or initializes a model.
import {record,hash,freeze,digest,dataCopy,requireTrue} from './manifest.js';
import {MODEL_ID} from '../../../browser/embedding/embedding-contract.js';
const ROOT='spikes/topic-resolution/harness/experimental/native-specificity-study-v3/';
export const CONSTRUCTION_SOURCE_KEYS=Object.freeze([
 ...['native-adapter.js','worker.js','manifest.json','network-policy.js','dns-resolver.js','origin-policy.js','article-owner.mjs','browser-capture.mjs',
  'manifest.js','cohort.js','producer-profile.js','reference-builder.js','artifact-reuse.js','protocol.json','run.mjs','stage.js'].map(k=>ROOT+k),
 'spikes/topic-resolution/harness/experimental/native-specificity-public-journey-v1/journey.mjs',
 'spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/native-rights.js',
 'spikes/topic-resolution/harness/experimental/playwright-route-coordinator-v1/coordinator.mjs',
 'spikes/topic-resolution/harness/experimental/exact-browser-infrastructure-v1/compatibility-variant.mjs',
 'spikes/topic-resolution/browser/chromium/page-content-reader.js','spikes/topic-resolution/browser/core/page-content-policy.js',
 'spikes/topic-resolution/browser/embedding/embedding-contract.js','apps/local-service/src/crawler/packaged-e5.js',
 'apps/local-service/src/crawler/public-fetch.js','apps/local-service/src/crawler/robots.js',
 'apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js',
 'apps/local-service/experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js','apps/local-service/src/domain/hierarchical-e5-paired-input.js']);
export const ROOT_IDS=Object.freeze(['games','nature','cooking','vehicles','science','technology','society','history','culture','sports','geography','health','business','languages','ideas-beliefs','education']);
const EXTRACTORS=Object.freeze(['article-container-prefix/v1','main-text-prefix/v1']);
export function buildSpecificityProducerProfile(input){
 const a=record(input,['panelIdentity','manifestHash','encoderHash','sourceHashes']);
 for(const k of ['panelIdentity','manifestHash','encoderHash'])hash(a[k]);
 const sourceHashes=record(a.sourceHashes,CONSTRUCTION_SOURCE_KEYS);Object.values(sourceHashes).forEach(hash);
 const construction={schema:'native-specificity-native-construction/v1',panelIdentity:a.panelIdentity,manifestHash:a.manifestHash,sourceHashes,
  encoder:{modelId:MODEL_ID,encoderHash:a.encoderHash,dimensions:384,fieldPrefix:'query: ',maximumTokens:512,specialTokenPositions:2},
  fields:{extractorVersions:[...EXTRACTORS],rawTitleLimitUtf16:200,effectiveTitleLimitUtf16:200,bodyLimitUtf16:4096,effectiveTitleRule:'trim-or-hostname/v1'},
  observation:{totalGroups:168,trainCalGroups:96,testGroups:72,batchCases:4,trainCalBatches:24,testBatches:18,independentProfiles:42,
   maximumRegistryIdentitiesPerBatch:32,nativeOrdinal:'genuine-batch-local-1-through-4',nativeWitnessSchema:'chrome-scripting-native-reader/v1',
   foregroundObservations:3,mainFrameOnly:true,privateStudyRevisionAndEpoch:true,readThenExactNativeDocumentAttestation:true},
  capture:{unchangedProductionReaderAndUrlPolicy:true,joinedPublicJourneyRequired:true,sameNativeDocumentMainResponseAndDomRightsRequired:true,
   networkScope:'primary-panel-origins-plus-five-fixed-CDNs',nativeMeaning:'document-and-URL-continuity-not-unchanged-DOM-or-canonical-authority'},
  encoderAdmission:{allCohortAccountedBeforeEncoder:true,eachBatchActualGuardianDrain:true,separateFinalCohortActualGuardianDrain:true},
  rawRetention:'transient-RAM-not-secure-erasure',unrestrictedBrowserParity:false,productionValidated:false,assignmentAuthority:false};
 const recipeHash=digest(construction),body={schema:'native-root-target-producer-profile/v1',producerId:'native-browser-current',inputConstructionHash:recipeHash,
  extractorVersions:[...EXTRACTORS],effectiveTitleRule:'trim-or-hostname/v1'};
 return freeze({schema:'native-specificity-producer-profile-set/v1',producerProfile:{...body,producerProfileHash:digest(body)},construction,recipeHash});
}
export function validateSpecificityProducerProfile(input){
 const a=record(input,['profileSet','expectedRecipeHash','expectedPanelIdentity','expectedManifestHash']);
 for(const k of ['expectedRecipeHash','expectedPanelIdentity','expectedManifestHash'])hash(a[k]);
 const p=dataCopy(a.profileSet),top=record(p,['schema','producerProfile','construction','recipeHash']);
 requireTrue(top.schema==='native-specificity-producer-profile-set/v1'&&top.recipeHash===a.expectedRecipeHash,'profile');
 const c=p.construction;requireTrue(c!==null&&typeof c==='object');
 const expected=buildSpecificityProducerProfile({panelIdentity:a.expectedPanelIdentity,manifestHash:a.expectedManifestHash,encoderHash:c.encoder?.encoderHash,sourceHashes:c.sourceHashes});
 requireTrue(digest(expected)===digest(p)&&expected.recipeHash===a.expectedRecipeHash,'profile');return expected;
}
