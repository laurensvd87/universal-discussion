import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSpecificityPanel, LIMITS } from '../../../../../apps/local-service/experiments/topic-encoder/native-specificity-panel-v1/panel.js';

// Entirely invented metadata. No IO and no real panel validation in this suite.
const digest = s => createHash('sha256').update(s, 'utf8').digest('hex');
const keys = ['candidates', 'curation', 'trainCalReview', 'testReview', 'finalReview'];
const copy = x => JSON.parse(JSON.stringify(x));
const flags = Object.fromEntries(['labelsSealed', 'ownerApproved', 'nativeAvailabilityVerified', 'rightsVerified', 'modelOutputsSeen', 'productionValidated', 'assignmentAuthority'].map(k => [k, false]));
const paths = { games: ['games'], 'video-games': ['games', 'video-games'], gta: ['games', 'video-games', 'gta'], minecraft: ['games', 'video-games', 'minecraft'], nature: ['nature'], animals: ['nature', 'animals'], koalas: ['nature', 'animals', 'koalas'], dolphins: ['nature', 'animals', 'dolphins'], cooking: ['cooking'], recipes: ['cooking', 'recipes'], kapsalon: ['cooking', 'recipes', 'kapsalon'], pasta: ['cooking', 'recipes', 'pasta'] };
const leaves = ['gta', 'minecraft', 'koalas', 'dolphins', 'kapsalon', 'pasta'];
const internal = ['games', 'video-games', 'nature', 'animals', 'cooking', 'recipes'];
const challenge = [
  ['114', 'koalas', 'public-scientific-press-release', 'accept-declared-research-release-format'],
  ['138', 'video-games', 'publisher-game-product-page', 'accept-declared-game-product-format'],
  ['139', 'nature', 'institutional-educational-feature', 'accept-declared-institutional-feature-format'],
  ['144', 'dolphins', 'institutional-interactive-species-account', 'fact-panels-pod-sections-read-more-observed-native-interaction-unverified'],
  ['147', 'recipes', 'authored-recipe-with-recipe-card', 'accept-declared-recipe-card-format'],
  ['170', 'gta', 'game-guide-with-pagination-or-expansion', 'cached-expansion-evidence-only-current-native-format-unverified'],
];
const policy = { allOriginalRowsAndDenominatorsRetained: true, unverifiedOrDisputedProposedGoldNeverPassedToAssessor: true, assignedUnassessedFailsZeroWrongGate: true, unknownAssignmentsRemainInAllAcceptedDenominator: true, noAll72AccuracyClaim: true, conditionalFormatsNotPromotedToNativeFacts: true };
function fixture() {
  const rows = [], reserved = new Set(['054', '083', ...challenge.map(x => x[0])]);
  const perSplit = { training: 0, calibration: 0, test: 0 };
  let serial = 0;
  function add(split, role, node, forced, kind = 'complete', referenceAnnotation = null) {
    const n = perSplit[split]++; let suffix;
    do { suffix = String(++serial).padStart(3, '0'); } while (reserved.has(suffix));
    const id = `adr159-${split}-${forced || suffix}`;
    const family = `invented-${split}-family-${n % (split === 'test' ? 25 : 24)}`;
    const r = { id, split, role, nodeId: node, groupId: `group-${id}`, publisherFamily: family,
      publicUrl: `https://publisher${n % 7}.org/${id}`, articleTitle: 'Invented metadata title', language: n % 2 ? 'de' : 'en',
      gold: { kind, path: [...(paths[node] || [node])] }, rationale: 'Invented annotation only.', scopeExclusions: 'Scoped local forest only.',
      referenceAnnotation, goldScope: 'declared-16-roots-plus-12-node-detail-forest/v1',
      verification: { method: 'primary-page-open-and-main-content-read', verifiedOn: '2026-10-20' }, provenance: 'agent-authored-public-metadata' };
    r.publicSupportUrl = r.publicUrl; rows.push(r); return r;
  }
  for (const split of ['training', 'calibration', 'test']) {
    for (const node of leaves) for (let n = 0; n < (split === 'test' ? 6 : 4); n++) add(split, 'leaf', node, split === 'test' && node === 'minecraft' && n === 0 ? '083' : undefined, 'complete', split === 'training' ? { nodeId: node, kind: 'member' } : null);
    for (const node of internal) for (let n = 0; n < (split === 'test' ? 3 : 2); n++) add(split, 'parent-stop', node, split === 'test' && node === 'recipes' && n === 0 ? '054' : undefined, 'complete', split === 'training' ? { nodeId: node, kind: 'stop' } : null);
    if (split === 'training') {
      for (const excluded of ['games', 'nature', 'cooking']) for (let n = 0; n < 4; n++) {
        const r = add(split, 'scoped-confounder', excluded === 'nature' ? 'recipes' : excluded, undefined, excluded === 'nature' ? 'complete' : 'prefix', { nodeId: excluded, kind: 'outside' });
        if (excluded !== 'nature') r.gold.path = [excluded === 'games' ? 'technology' : 'health'];
      }
    } else {
      for (let n = 0; n < (split === 'test' ? 6 : 12); n++) add(split, 'known-other-root-confounder', 'science', undefined, 'prefix');
      if (split === 'test') {
        for (let n = 0; n < 6; n++) add(split, 'positive-prefix', 'nature', undefined, 'prefix');
        for (const [suffix, node, cls] of challenge) {
          const r = add(split, 'acquisition-challenge', node, suffix); r.challengeClass = cls;
          if (suffix === '170') { r.publicUrl = 'https://www.gamesradar.com/gta-5-beyond-stars-guide/'; r.publicSupportUrl = r.publicUrl + '2/';
            r.formatEvidence = { kind: 'publisher-map-expansion-prompt', observedOnPublicUrl: r.publicSupportUrl, redirectedToCanonical: true, retrievalFreshnessLimitation: 'Invented cached-only limitation.' }; }
        }
      }
    }
  }
  const candidates = { schema: 'hierarchy-native-detail-candidates/v1', status: 'proposed-complete-unsealed', proposed: true, scope: 'ADR159-metadata-curation-only', cases: rows, ...flags };
  const counts = count(rows);
  const curation = { schema: 'hierarchy-native-detail-curation/v1', status: 'proposed-complete-unsealed', selected: 168, ...flags,
    goldScope: { id: 'declared-16-roots-plus-12-node-detail-forest/v1', fullHouse63DeepestTruthClaim: false, unknownChildrenStopAtRepresentedParent: true }, semanticFamilyIndependenceDemonstrated: false,
    exclusionScope: { completeHistoricalExclusionCoverageClaim: false, old128And112FullMetadataIndependentlyRead: false, privateExclusionMetadataSentExternally: false },
    correlationLimits: ['Invented families are not entity independence.'], truthLimitations: ['Scoped truth only.'], countReport: counts };
  const trainCalReview = { schema: 'hierarchy-native-detail-independent-primary-review/v1', status: 'complete-train-cal-review-only-unsealed',
    sourceHashes: {}, postReviewBookkeepingTransition: {}, scope: { ...flags, ownerApprovedGold: false, rootAndLocalForestOnly: true, fullHouse63TruthClaim: false, absoluteOutsideGoldEstablished: false, caseCount: 96, training: 48, calibration: 48 },
    cases: rows.filter(r => r.split !== 'test').map(r => ({ caseId: r.id, split: r.split, publicUrl: r.publicUrl, referenceUrl: r.publicSupportUrl, language: r.language, groupId: r.groupId, publisherFamily: r.publisherFamily, reviewedGold: copy(r.gold), reviewedReferenceAnnotation: copy(r.referenceAnnotation), verdict: 'accept' })),
    summary: { accept: 96, dispute: 0, unavailable: 0, allFixedCasesRetained: true, labelsRemainProposed: true },
    crossReviewTestCases: rows.filter(r => ['adr159-test-054', 'adr159-test-083'].includes(r.id)).map(r => ({ caseId: r.id, publicUrl: r.publicUrl, verdict: 'review-unavailable', nativeAvailabilityConclusion: 'not-established', goldAcceptedByThisCrossReview: false, primaryOpensUsedFromFollowupAllowance: 1 })) };
  const testReview = { schema: trainCalReview.schema, status: 'initial-review-complete-two-primary-access-gaps-unsealed', candidateSha256: '', curationSha256: '', bookkeepingTransition: {}, labelsSealed: false, modelOutputsSeen: false, nativeCapturePerformed: false, assignmentAuthority: false,
    independentCrossReview: { unverifiedLabelsRemain: 2, automaticReplacement: false, rootRowsAndOperationsNotRewritten: true },
    cases: rows.filter(r => r.split === 'test').map(r => { const x = { id: r.id, judgment: ['adr159-test-054', 'adr159-test-083'].includes(r.id) ? 'review-access-unavailable' : 'accept-scoped-label' }; const fmt = challenge.find(c => r.id === `adr159-test-${c[0]}`); if (fmt) x.formatJudgment = fmt[3]; return x; }) };
  const finalReview = { schema: 'hierarchy-native-detail-final-label-review/v1', decision: 'ADR176', status: 'bounded-primary-review-complete-both-labels-still-unverified', sourceHashes: {},
    cases: ['054', '083'].map(s => ({ id: `adr159-test-${s}`, selectedUrl: rows.find(r => r.id === `adr159-test-${s}`).publicUrl, finalReportedUrl: null, sourceReference: 'invented-reference-' + s, retrievalStatus: s === '054' ? 'tool-inaccessible' : 'tool-fetch-timeout', disposition: 'unavailable-verification', goldStatus: 'unverified', proposedGoldAccepted: false })),
    summary: { selectedCohort: 168, training: 48, calibration: 48, test: 72, verifiedLabels: 166, unverifiedTestLabels: 2, newlyVerifiedLabels: 0, disputes: 0 },
    assessmentPolicy: { ...policy }, budget: { maximumOpens: 2, actualOpens: 2, searches: 0, followupOpens: 0, retries: 0, alternateUrls: 0, replacements: 0 },
    existingMetadataOrReviewsChanged: false, labelsSealed: false, nativeAvailabilityOrRightsEstablished: false, nativeCapturePerformed: false, modelOutputsSeen: false, assignmentAuthority: false, providerCalls: 0, independentOutcomeAudit: 'passed-recorded-outcomes-and-unchanged-metadata-no-refetch' };
  return { candidates, curation, trainCalReview, testReview, finalReview };
}
function count(rows) {
  const c = { selected: rows.length, bySplit: {}, byLanguage: {}, byRole: {}, bySplitRole: {}, leafCounts: {}, parentCounts: {}, leafDiversity: {}, publisherFamilies: new Set(rows.map(r => r.publisherFamily)).size,
    originalSplitTargets: { training: 48, calibration: 48, test: 72 }, roleQuotasMetStructurally: true, leafDiversityGoalMetStructurally: true, labelAcceptanceIndependentReview: false };
  const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
  for (const r of rows) {
    inc(c.bySplit, r.split); inc(c.byLanguage, r.language); inc(c.byRole, r.role); inc(c.bySplitRole[r.split] ||= {}, r.role);
    if (r.role === 'leaf') {
      inc(c.leafCounts[r.split] ||= {}, r.nodeId);
      const d = c.leafDiversity[r.nodeId] ||= { languages: [], origins: [], families: [] };
      for (const [k, v] of [['languages', r.language], ['origins', new URL(r.publicUrl).origin], ['families', r.publisherFamily]]) if (!d[k].includes(v)) d[k].push(v);
    }
    if (r.role === 'parent-stop') inc(c.parentCounts[r.split] ||= {}, r.nodeId);
  }
  return c;
}
function pack(d = fixture()) {
  const texts = { candidates: JSON.stringify(d.candidates), curation: JSON.stringify(d.curation) };
  const current = { candidates: digest(texts.candidates), curation: digest(texts.curation) };
  const original = { candidates: digest(texts.candidates.replace('"status":"proposed-complete-unsealed"', '"status":"partial-unsealed"')),
    curation: digest(texts.curation.replace('"status":"proposed-complete-unsealed"', '"status":"phase-2-active-partial-unsealed"').replace('"selected":168', '"selected":128')) };
  const cases = digest(JSON.stringify(d.candidates.cases)), counts = digest(JSON.stringify(d.curation.countReport));
  d.trainCalReview.sourceHashes = original;
  d.trainCalReview.postReviewBookkeepingTransition = { currentCandidateSha256: current.candidates, currentCurationSha256: current.curation, reviewedSourceHashesAboveRemainOriginal: true, bookkeepingFindingsResolvedWithoutLabelSeal: true,
    unchangedCasesJsonSha256: cases, unchangedCountReportJsonSha256: counts, changes: ['candidates.status: partial-unsealed -> proposed-complete-unsealed', 'curation.status: phase-2-active-partial-unsealed -> proposed-complete-unsealed', 'curation.selected: 128 -> 168'] };
  d.testReview.candidateSha256 = original.candidates; d.testReview.curationSha256 = original.curation;
  d.testReview.bookkeepingTransition = { candidateCurrentSha256: current.candidates, curationCurrentSha256: current.curation, exactReversalRecoversOriginalFileHashes: true, casesDigestUnchanged: cases, countReportDigestUnchanged: counts, onlyChangedFields: ['candidates.status', 'curation.status', 'curation.selected'] };
  texts.trainCalReview = JSON.stringify(d.trainCalReview); texts.testReview = JSON.stringify(d.testReview);
  d.finalReview.sourceHashes = Object.fromEntries(keys.slice(0, 4).map(k => [k, digest(texts[k])])); texts.finalReview = JSON.stringify(d.finalReview);
  return { texts, pins: Object.fromEntries(keys.map(k => [k, digest(texts[k])])) };
}

import {createSpecificitySourceLedger,SOURCE_LEDGER_LIMITS} from './source-ledger.js';
import {SOURCE_CATALOG,SOURCE_PATHS} from './source-paths.js';
import {digest as identityHash,sha,freeze} from './manifest.js';
import {CONSTRUCTION_SOURCE_KEYS} from './producer-profile.js';
import {OLD_FIT_BYTE_CAPS} from './artifact-reuse.js';
import {inventedFixture as priorFixture} from './producer-profile.test.mjs';
import {compilePairedE5Input,describePairedE5Input} from '../../../../../apps/local-service/src/domain/hierarchical-e5-paired-input.js';
import {compileBuilderScopedRootRankCandidate,describeBuilderScopedRootRankCandidate} from '../../../../../apps/local-service/experiments/topic-encoder/builder-scoped-root-rank-candidate-v1/scorer.js';
import {MODEL_ID,EXTRACTOR_VERSION,E5_REVISION,TOKENIZER_VERSION,ORT_VERSION,MODEL_SHA256,TOKENIZER_SHA256} from '../../../browser/embedding/embedding-contract.js';
const ROOT='spikes/topic-resolution/harness/experimental/native-specificity-study-v14/';
const PACKAGE_PREFIX='node_modules/playwright-core/';
const INTEGRITY='sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ==';
const json=v=>Buffer.from(JSON.stringify(v));
// Adapt ONLY invented proof bytes. No fit, file or actual artifact is accessed.
function adaptedOldFit(encoderHash,sourceHashes){
 const prior=priorFixture().oldFit,read=k=>JSON.parse(prior[k].toString()),fm=read('freezeBytes');delete fm.freezeHash;
 fm.sourceHashes=sourceHashes;fm.protocolSha256=sourceHashes['protocol.json'];
 const freezeHash=identityHash(fm),freezeBytes=json({...fm,freezeHash}),definition={...read('inputDefinitionBytes'),encoderHash};
 const representationHash=describePairedE5Input(compilePairedE5Input(definition)).representationHash;
 const model=read('modelBytes');model.trainingVersion=freezeHash+'|0.75';model.representationHash=representationHash;
 model.parameterHash=identityHash({schema:model.schema,representation:model.representation,representationHash,heads:model.heads});
 const policy=read('policyBytes');delete policy.policyHash;policy.modelHash=identityHash(model);policy.representationHash=representationHash;policy.policyHash=identityHash(policy);
 const old=describeBuilderScopedRootRankCandidate(compileBuilderScopedRootRankCandidate({schema:'builder-scoped-root-rank-candidate/v1',inputDefinition:definition,
  rootModel:model,rootPolicy:policy,trainingInputConstructionHash:policy.inputConstructionHash,targetProfiles:fm.targetProfiles.map(({producerId,inputConstructionHash,extractorVersions})=>({producerId,inputConstructionHash,extractorVersions}))}));
 const selection={...read('selectionBytes'),freezeHash},selectionBytes=json(selection),modelBytes=json(model),policyBytes=json(policy),inputDefinitionBytes=json(definition);
 const receipt={...read('selectionReceiptBytes'),freezeHash,freezeFileSha256:sha(freezeBytes),protocolSha256:fm.protocolSha256,selectionSha256:sha(selectionBytes),
  selectedModelSha256:sha(modelBytes),modelJsonHash:identityHash(model),selectedPolicySha256:sha(policyBytes),policyHash:policy.policyHash,
  selectedInputDefinitionSha256:sha(inputDefinitionBytes),transferHash:old.transferHash,encoderHash,representationHash};
 const selectionReceiptBytes=json(receipt),supervisorBytes=json({...read('supervisorBytes'),freezeSha256:sha(freezeBytes),resultSha256:sha(selectionReceiptBytes),sourceHashes});
 return {freezeBytes,supervisorBytes,selectionReceiptBytes,selectionBytes,modelBytes,policyBytes,inputDefinitionBytes};
}
function ledgerFixture(){
 const metadata=pack(),panel=createSpecificityPanel(metadata.pins).validate(metadata.texts),entries=[],store=new Map(),sourceHashes={};
 function add(key,path,kind,b,maximumBytes){store.set(key,b);entries.push({key,path,kind,maximumBytes,sha256:kind==='code'?null:sha(b)});}
 for(const k of CONSTRUCTION_SOURCE_KEYS){const b=Buffer.from('invented-code:'+k);sourceHashes[k]=sha(b);add(k,k,'code',b,4194304);}
 const manifestNames=['model.onnx','tokenizer.json','tokenizer_config.json','config.json','special_tokens_map.json','tokenizers.mjs','ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'];
 const assets=manifestNames.map(filename=>({filename,bytes:filename==='model.onnx'?118308185:filename==='tokenizer.json'?17082730:32,sha256:filename==='model.onnx'?MODEL_SHA256:filename==='tokenizer.json'?TOKENIZER_SHA256:sha('invented-asset-pin:'+filename)}));
 const assetBytes=json({schema:'browser-e5-assets/v1',modelId:MODEL_ID,extractorVersion:EXTRACTOR_VERSION,revision:E5_REVISION,tokenizerVersion:TOKENIZER_VERSION,ortVersion:ORT_VERSION,assets});
 const embeddingContractSourceKey='spikes/topic-resolution/browser/embedding/embedding-contract.js',protocolSourceKey=ROOT+'protocol.json';
 const encoderHash=identityHash({modelSha256:MODEL_SHA256,embeddingContractSha256:sourceHashes[embeddingContractSourceKey],assetManifestSha256:sha(assetBytes)});
 const oldSourceAliases={'protocol.json':protocolSourceKey,'invented-source.js':CONSTRUCTION_SOURCE_KEYS[0]},oldSources=Object.fromEntries(Object.entries(oldSourceAliases).map(([k,v])=>[k,sourceHashes[v]]));
 const old=adaptedOldFit(encoderHash,oldSources),artifactMap={};
 for(const k of Object.keys(OLD_FIT_BYTE_CAPS)){artifactMap[k]='artifact-'+k;add(artifactMap[k],'invented-fit/'+k+'.json','artifact',old[k],OLD_FIT_BYTE_CAPS[k]);}
 const metadataMap={};for(const k of keys){metadataMap[k]='metadata-'+k;add(metadataMap[k],'invented-metadata/'+k+'.json','metadata',Buffer.from(metadata.texts[k]),262144);}
 add('assets','invented-assets/manifest.json','asset-manifest',assetBytes,16384);
 const packageRows=[{path:PACKAGE_PREFIX+'package.json',bytes:json({name:'playwright-core',version:'1.64.1'})},
  ...Array.from({length:114},(_,i)=>({path:PACKAGE_PREFIX+'invented-'+i+'.js',bytes:Buffer.from('// invented '+i)}))];
 const packageHashes=Object.fromEntries(packageRows.map(r=>[r.path,sha(r.bytes)]));
 const baselineBody={schema:'playwright-route-burst-dev-freeze/v1',sourceHashes:packageHashes};
 add('baseline','invented-package-baseline.json','package-baseline',json({...baselineBody,freezeHash:identityHash(baselineBody)}),65536);
 add('lock','invented-package-lock.json','lockfile',json({packages:{'node_modules/playwright-core':{integrity:INTEGRITY}}}),262144);
 const catalog=freeze({schema:'native-specificity-source-catalog/v1',entries,metadata:metadataMap,artifacts:artifactMap,assetManifestKey:'assets',
  package:{rootKey:'invented-maintained-client',prefix:PACKAGE_PREFIX,baselineKey:'baseline',lockfileKey:'lock',version:'1.64.1',integrity:INTEGRITY,files:115,bytes:packageRows.reduce((n,r)=>n+r.bytes.length,0)},
  producerSourceAliases:Object.fromEntries(CONSTRUCTION_SOURCE_KEYS.map(k=>[k,k])),oldSourceAliases,protocolSourceKey,embeddingContractSourceKey,bindings:{panelIdentity:panel.panelIdentity,encoderHash}});
 let reads=0,walks=0;const calls=[];
 const config={catalog,expectedCatalogHash:identityHash(catalog),expectedSourceHashes:sourceHashes,
  readEntry(s){reads++;calls.push(s);return store.get(s.key);},walkPackage(root){walks++;assert.equal(root,catalog.package.rootKey);return packageRows;},guard:()=>true};
 return {config,catalog,store,packageRows,sourceHashes,panel,calls,counts:()=>({reads,walks})};
}
const configured=(f,mutate)=>{const c=copy(f.catalog);mutate(c);freeze(c);return {...f.config,catalog:c,expectedCatalogHash:identityHash(c)};};

test('invented complete inspect delegates panel/proof/compilers, returns immutable metadata and pins only',async()=>{
 const f=ledgerFixture(),ledger=createSpecificitySourceLedger(f.config);assert.deepEqual(f.counts(),{reads:0,walks:0});
 const context=await ledger.inspect();assert.equal(context.panel.cases.length,168);assert.equal(context.manifest.batches.length,42);
 assert.equal(context.package.files,115);assert.equal(context.package.bytes,f.catalog.package.bytes);assert.equal(context.codeFiles,29);
 assert.equal(Object.keys(context.sourceHashes).length,144);assert.equal(context.encoderHash,f.catalog.bindings.encoderHash);assert.equal(context.assetPins.length,9);
 assert.equal(context.actualAssetBytesAuthenticated,false);assert.ok(Object.isFrozen(context.rootCandidate.rootModel.heads));
 const noBuffers=v=>{assert.equal(Buffer.isBuffer(v),false);if(v&&typeof v==='object')for(const x of Object.values(v))noBuffers(x);};noBuffers(context);assert.equal(context.rootReuse.target.groups,168);
 assert.equal(await ledger.recheck(context),true);assert.deepEqual(f.counts(),{reads:f.catalog.entries.length*2,walks:2});
 assert.ok(f.calls.every(s=>Object.isFrozen(s)&&Object.keys(s).length===5));assert.equal(ledger.snapshot().pendingOriginals,0);
 await assert.rejects(ledger.inspect());assert.equal(ledger.snapshot().failed,true);
});

test('catalog/pin/path/type/alias validation precedes every callback and refuses descriptor hooks',()=>{
 const f=ledgerFixture();let hooks=0;const p=new Proxy({}, {getPrototypeOf(){hooks++;throw Error();}});
 for(const config of [{...f.config,catalog:p},{...f.config,expectedCatalogHash:'0'.repeat(64)},
  configured(f,c=>{c.entries[0].path='../escape.js';}),configured(f,c=>{c.entries[0].kind=['code'];}),
  configured(f,c=>{c.entries[0].sha256='0'.repeat(64);}),configured(f,c=>{c.producerSourceAliases.extra=c.entries[0].key;}),
  configured(f,c=>{c.oldSourceAliases['invented-source.js']='missing';}),configured(f,c=>{c.package.files=114;}),
  configured(f,c=>{c.entries.push({...c.entries[0]});}),{...f.config,catalog:copy(f.catalog)}])assert.throws(()=>createSpecificitySourceLedger(config));
 const getter={...f.config};Object.defineProperty(getter,'catalog',{get(){hooks++;throw Error();}});assert.throws(()=>createSpecificitySourceLedger(getter));
 assert.equal(hooks,0);assert.deepEqual(f.counts(),{reads:0,walks:0});
});

test('all five metadata pins and seven artifacts authenticate before ANY JSON parsing',async()=>{
 for(const entryKey of ['metadata-finalReview','artifact-inputDefinitionBytes']){
  const f=ledgerFixture();f.store.set(entryKey,Buffer.from('{ malformed invented'));
  const original=JSON.parse;let parses=0;JSON.parse=()=>{parses++;throw Error('parser must not execute');};
  try{const ledger=createSpecificitySourceLedger(f.config);await assert.rejects(ledger.inspect());assert.equal(parses,0);assert.equal(ledger.snapshot().failed,true);}finally{JSON.parse=original;}
 }
});

test('package complete layout/bytes/hashes/version/integrity fail closed with no JSON-selected reads',async()=>{
 for(const change of [f=>{f.packageRows.pop();},f=>{f.packageRows[1].path='../escape';},f=>{f.packageRows[1].path=f.packageRows[0].path;},
  f=>{f.packageRows[1].bytes=Buffer.from('different bytes');},f=>{f.packageRows[1].path=PACKAGE_PREFIX+'extra.js';}]){
  const f=ledgerFixture();change(f);const ledger=createSpecificitySourceLedger(f.config);await assert.rejects(ledger.inspect());assert.equal(ledger.snapshot().failed,true);
  assert.ok(f.calls.every(s=>f.catalog.entries.some(e=>e.path===s.path)));
 }
 const f=ledgerFixture(),conf=configured(f,c=>{c.package.bytes++;});await assert.rejects(createSpecificitySourceLedger(conf).inspect());
});

test('same-instance context only; end recheck rereads every kind and detects mutation',async()=>{
 for(const mutate of [f=>{f.store.set(CONSTRUCTION_SOURCE_KEYS[0],Buffer.from('changed'));},f=>{f.store.set('metadata-finalReview',Buffer.from('changed'));},
  f=>{f.store.set('artifact-modelBytes',Buffer.from('changed'));},f=>{f.store.set('assets',Buffer.from('changed'));},f=>{f.store.set('baseline',Buffer.from('changed'));},
  f=>{f.store.set('lock',Buffer.from('changed'));},f=>{f.packageRows[1].bytes=Buffer.from('changed');}]){
  const f=ledgerFixture(),ledger=createSpecificitySourceLedger(f.config),context=await ledger.inspect();mutate(f);await assert.rejects(ledger.recheck(context));assert.equal(ledger.snapshot().failed,true);await assert.rejects(ledger.recheck(context));
 }
 const f=ledgerFixture(),ledger=createSpecificitySourceLedger(f.config),context=await ledger.inspect(),before=f.counts();await assert.rejects(ledger.recheck(copy(context)));assert.deepEqual(f.counts(),before);
});

test('guard is synchronous, checked after settlement and sticky before further dispatch',async()=>{
 const f=ledgerFixture();let valid=true,calls=0;const ledger=createSpecificitySourceLedger({...f.config,guard(){calls++;return valid;},readEntry(s){valid=false;return f.store.get(s.key);}});
 await assert.rejects(ledger.inspect());assert.equal(calls,3);assert.equal(f.counts().walks,0);assert.equal(ledger.snapshot().failed,true);
 const g=ledgerFixture(),asyncGuard=createSpecificitySourceLedger({...g.config,guard:()=>Promise.reject(Error('invented'))});await assert.rejects(asyncGuard.inspect());
 await Promise.resolve();assert.deepEqual(g.counts(),{reads:0,walks:0});assert.equal(asyncGuard.snapshot().pendingOriginals,0);
});

test('original pending read remains charged through reentry failure and actual late rejection',async()=>{
 const f=ledgerFixture();let reject;const original=new Promise((_,no)=>{reject=no;});const ledger=createSpecificitySourceLedger({...f.config,readEntry:()=>original});
 const running=ledger.inspect();assert.equal(ledger.snapshot().pendingOriginals,1);await assert.rejects(ledger.inspect());assert.equal(ledger.snapshot().pendingOriginals,1);
 reject(Error('invented late rejection'));await assert.rejects(running);assert.equal(ledger.snapshot().pendingOriginals,0);assert.equal(ledger.snapshot().failed,true);assert.equal(f.counts().walks,0);
});

test('unsafe promise/proxy/subclass own hooks are never invoked or counted physically settled',async()=>{
 for(const form of ['constructor','then','subclass','proxy']){
  const f=ledgerFixture();let hooks=0;const base=Promise.resolve(f.store.get(CONSTRUCTION_SOURCE_KEYS[0]));let promise=base;
  if(form==='constructor'||form==='then')Object.defineProperty(promise,form,{get(){hooks++;throw Error();}});
  if(form==='subclass')promise=new (class extends Promise {})(resolve=>resolve(undefined));
  if(form==='proxy')promise=new Proxy(base,{get(){hooks++;throw Error();},getPrototypeOf(){hooks++;throw Error();}});
  const ledger=createSpecificitySourceLedger({...f.config,readEntry:()=>promise});await assert.rejects(ledger.inspect());assert.equal(hooks,0);assert.equal(ledger.snapshot().unsafeOperationRefused,true);
 }
});

test('caps and malformed byte descriptors are checked without copying or coercion',async()=>{
 const f=ledgerFixture();let hooks=0;const raw=Buffer.from('x');Object.defineProperty(raw,'surprise',{get(){hooks++;throw Error();}});
 for(const value of [raw,'text',new Uint8Array([1]),Buffer.alloc(SOURCE_LEDGER_LIMITS.codeFileBytes+1)]){
  const ledger=createSpecificitySourceLedger({...f.config,readEntry:()=>value});await assert.rejects(ledger.inspect());assert.equal(ledger.snapshot().failed,true);
 }assert.equal(hooks,0);
 for(const mutate of [c=>{c.entries[0].maximumBytes=Infinity;},c=>{c.package.bytes=16777217;},c=>{c.entries[0].maximumBytes=4194305;}])assert.throws(()=>createSpecificitySourceLedger(configured(f,mutate)));
});

test('production-shaped null asset FILE pin authenticates composite encoder before parsing; CODE lock is rechecked',async()=>{
 const f=ledgerFixture(),config=configured(f,c=>{
  c.entries.find(e=>e.key==='assets').sha256=null;
  const lock=c.entries.find(e=>e.key==='lock');lock.kind='code';lock.sha256=null;lock.maximumBytes=4194304;
 });config.expectedSourceHashes={...f.sourceHashes,lock:sha(f.store.get('lock'))};
 const ledger=createSpecificitySourceLedger(config),context=await ledger.inspect();assert.equal(context.codeFiles,30);assert.equal(Object.keys(context.sourceHashes).length,145);
 assert.equal(context.encoderHash,f.catalog.bindings.encoderHash);assert.equal(await ledger.recheck(context),true);
 f.store.set('assets',Buffer.from('{ malformed asset manifest'));
 const original=JSON.parse;let parses=0;JSON.parse=()=>{parses++;throw Error();};
 try{await assert.rejects(ledger.recheck(context));assert.equal(parses,0);}finally{JSON.parse=original;}
});

test('aggregate CODE/metadata/package caps refuse before another parse/publication',async()=>{
 for(const kind of ['code','metadata','package']){
  const f=ledgerFixture(),c=copy(f.catalog),expected={...f.sourceHashes};let walks=0;
  if(kind==='code'){
   const block=Buffer.alloc(4194304,65);
   for(const s of c.entries.filter(e=>e.kind==='code').slice(0,9)){f.store.set(s.key,block);expected[s.key]=sha(block);}
  }else if(kind==='metadata'){
   const block=Buffer.alloc(262144,65);for(const s of c.entries.filter(e=>e.kind==='metadata')){f.store.set(s.key,block);s.sha256=sha(block);}
  }else{
   const block=Buffer.alloc(4194304,65);for(let i=0;i<4;i++)f.packageRows[i].bytes=block;c.package.bytes=16777216;
  }
  freeze(c);const ledger=createSpecificitySourceLedger({...f.config,catalog:c,expectedCatalogHash:identityHash(c),expectedSourceHashes:expected,walkPackage(){walks++;return f.packageRows;}});
  const original=JSON.parse;let parses=0;JSON.parse=()=>{parses++;throw Error();};
  try{await assert.rejects(ledger.inspect());assert.equal(parses,0);assert.equal(ledger.snapshot().failed,true);}finally{JSON.parse=original;}
  assert.equal(walks,kind==='package'?1:0);
 }
});

test('authenticated but inconsistent baseline/version/lock/panel/encoder bindings cannot mint context',async()=>{
 for(const kind of ['baseline','version','integrity','panel','encoder']){
  const f=ledgerFixture(),c=copy(f.catalog);
  const replace=(k,v)=>{const b=json(v);f.store.set(k,b);c.entries.find(e=>e.key===k).sha256=sha(b);};
  if(kind==='baseline'){
   const base=JSON.parse(f.store.get('baseline'));delete base.freezeHash;base.sourceHashes[PACKAGE_PREFIX+'foreign.js']=sha('foreign');replace('baseline',{...base,freezeHash:identityHash(base)});
  }else if(kind==='version'){
   const row=f.packageRows[0];row.bytes=json({name:'playwright-core',version:'1.64.0'});c.package.bytes=f.packageRows.reduce((n,r)=>n+r.bytes.length,0);
   const base={schema:'playwright-route-burst-dev-freeze/v1',sourceHashes:Object.fromEntries(f.packageRows.map(r=>[r.path,sha(r.bytes)]))};replace('baseline',{...base,freezeHash:identityHash(base)});
  }else if(kind==='integrity')replace('lock',{packages:{'node_modules/playwright-core':{integrity:'wrong'}}});
  else c.bindings[kind==='panel'?'panelIdentity':'encoderHash']='0'.repeat(64);
  freeze(c);const ledger=createSpecificitySourceLedger({...f.config,catalog:c,expectedCatalogHash:identityHash(c)});await assert.rejects(ledger.inspect());assert.equal(ledger.snapshot().failed,true);
 }
});

test('pending package walk cannot be marked settled by a duplicate recheck or late fulfillment',async()=>{
 const f=ledgerFixture();let resolve;const physical=new Promise(yes=>{resolve=yes;});
 const ledger=createSpecificitySourceLedger({...f.config,walkPackage:()=>physical}),running=ledger.inspect();
 for(let i=0;i<f.catalog.entries.length*3+10&&ledger.snapshot().pendingOriginals===0;i++)await Promise.resolve();
 assert.equal(ledger.snapshot().pendingOriginals,1);await assert.rejects(ledger.recheck({}));assert.equal(ledger.snapshot().pendingOriginals,1);
 resolve(f.packageRows);await assert.rejects(running);assert.equal(ledger.snapshot().pendingOriginals,0);assert.equal(ledger.snapshot().failed,true);
});

test('Root literal catalog is structurally accepted without reading any actual path',()=>{
 let calls=0;const ledger=createSpecificitySourceLedger({catalog:SOURCE_CATALOG,expectedCatalogHash:identityHash(SOURCE_CATALOG),
  expectedSourceHashes:Object.fromEntries(SOURCE_CATALOG.entries.filter(e=>e.kind==='code').map(e=>[e.key,sha('invented-pin:'+e.key)])),
  readEntry(){calls++;throw Error('must not read');},walkPackage(){calls++;throw Error('must not walk');},guard(){calls++;throw Error('must not guard before inspect');}});
 assert.equal(calls,0);assert.equal(ledger.snapshot().state,'ready');
});

test('ADR200 catalog adds exact diagnostic closure and replaces the successor document without input-pin drift',()=>{
 const oldPrefix='spikes/topic-resolution/harness/experimental/native-specificity-study-v1/',newPrefix='spikes/topic-resolution/harness/experimental/native-specificity-study-v14/';
 const decision='decisions/ADR-200-exact-infrastructure-witness-study.md';
 assert.equal(SOURCE_PATHS.length,128);assert.equal(SOURCE_PATHS.filter(k=>k.startsWith(newPrefix)).length,60);
 assert.deepEqual(SOURCE_PATHS,[...SOURCE_PATHS].sort());assert.equal(SOURCE_PATHS.filter(k=>k.startsWith(oldPrefix)).length,0);
 assert.equal(SOURCE_PATHS.filter(k=>!k.startsWith(newPrefix)&&k!==decision).length,67);
 assert.equal(SOURCE_PATHS.filter(k=>k.startsWith('spikes/topic-resolution/harness/experimental/native-specificity-study-v2/')).length,0);
 assert.equal(SOURCE_PATHS.filter(k=>k.startsWith('spikes/topic-resolution/harness/experimental/native-specificity-study-v3/')).length,0);
 assert.equal(SOURCE_PATHS.filter(k=>k.startsWith('spikes/topic-resolution/harness/experimental/native-specificity-study-v4/')).length,0);
 assert.equal(new Set(SOURCE_PATHS).size,128);assert.equal(SOURCE_CATALOG.entries.length,142);
 assert.deepEqual(SOURCE_CATALOG.entries.filter(e=>e.kind==='code').map(e=>e.key),SOURCE_PATHS);
 // Immutable v1 literal non-CODE entries SOURCE digest, not artifact-byte reads.
 assert.equal(identityHash(SOURCE_CATALOG.entries.filter(e=>e.kind!=='code')),'55014b7c9cc8287b159f022835f0f4ae5c99b3bf1ea811e96bc6922629f8a1e5');
 assert.equal(SOURCE_CATALOG.bindings.panelIdentity,'ba797b2e90fa58a1ac14af943db66435bef5aba10ba893af00e19e377c48e608');
 assert.equal(SOURCE_CATALOG.bindings.encoderHash,'76332323c22d9523de1c54e45bbec0ea762b9c259b10775f5ccb4cbad13a9cd3');
 assert.ok(SOURCE_PATHS.includes('decisions/ADR-179-native-specificity-study.md'));
 assert.ok(SOURCE_PATHS.includes('decisions/ADR-180-native-specificity-failure-recovery.md'));
 assert.ok(SOURCE_PATHS.includes('decisions/ADR-181-native-specificity-resource-diagnostics.md'));
 assert.ok(SOURCE_PATHS.includes('decisions/ADR-184-complete-owned-job-enumeration.md'));
 assert.equal(SOURCE_PATHS.length+SOURCE_CATALOG.package.files,243);assert.ok(SOURCE_PATHS.length+SOURCE_CATALOG.package.files<256);
 assert.equal(SOURCE_PATHS.filter(k=>/\.test\.(?:mjs|js)$|\/test\.mjs$/u.test(k)).length,25);
 assert.equal(SOURCE_CATALOG.entries.length+6,148); // Explicit ADR200 static IO cardinality, not runtime-resource expansion.
 assert.equal(SOURCE_PATHS.includes('decisions/ADR-185-native-navigation-failure-witness.md'),false);
 assert.equal(SOURCE_PATHS.includes('decisions/ADR-187-response-transport-and-admission.md'),false);
 assert.equal(SOURCE_PATHS.includes('decisions/ADR-188-typed-navigation-event-adapter.md'),false);
 assert.equal(SOURCE_PATHS.includes('decisions/ADR-189-fresh-preparation-after-resource-refusal.md'),false);
 assert.equal(SOURCE_PATHS.includes('decisions/ADR-192-owned-blocked-errors-and-child-lifecycle.md'),false);
 assert.ok(SOURCE_PATHS.includes('decisions/ADR-186-pre-fresh-loader-blank-lifecycle.md'));
 assert.equal(SOURCE_PATHS.includes('decisions/ADR-193-active-denial-during-article-retirement.md'),false);
 assert.equal(SOURCE_PATHS.includes('decisions/ADR-194-terminal-lifecycle-after-read-revocation.md'),false);
 assert.ok(SOURCE_PATHS.includes(decision));
 assert.equal(SOURCE_PATHS.includes('decisions/ADR-195-bounded-descendant-retirement-events.md'),false);
 assert.ok(SOURCE_PATHS.includes('decisions/ADR-197-finite-infrastructure-identity-witness.md'));
 const diagnostic='spikes/topic-resolution/harness/experimental/infrastructure-identity-witness-v1/';
 for(const name of ['policy.mjs','policy.test.mjs','README.md'])assert.ok(SOURCE_PATHS.includes(diagnostic+name));
 const oldPolicy='spikes/topic-resolution/harness/experimental/exact-browser-infrastructure-v1/compatibility-variant.mjs';
 assert.ok(SOURCE_PATHS.includes(oldPolicy));assert.equal(Object.hasOwn(SOURCE_CATALOG.producerSourceAliases,oldPolicy),false);
 assert.equal(SOURCE_CATALOG.producerSourceAliases[diagnostic+'policy.mjs'],diagnostic+'policy.mjs');
 assert.equal(Object.keys(SOURCE_CATALOG.producerSourceAliases).length,29);
 assert.deepEqual(Object.keys(SOURCE_CATALOG.producerSourceAliases),CONSTRUCTION_SOURCE_KEYS);
 for(const name of ['README.md','journey.mjs','test.mjs'])assert.ok(SOURCE_PATHS.includes('spikes/topic-resolution/harness/experimental/native-specificity-public-journey-v2/'+name));
 assert.equal(SOURCE_PATHS.some(k=>k.includes('native-specificity-public-journey-v1/')),false);
});

test('Buffer intrinsic copy ignores property hooks and async wrappers do not assimilate returned thenables',async()=>{
 const f=ledgerFixture();let hooks=0;const first=CONSTRUCTION_SOURCE_KEYS[0],b=Buffer.from(f.store.get(first));
 for(const k of ['then','valueOf','constructor'])Object.defineProperty(b,k,{get(){hooks++;throw Error('must not run');}});
 const ledger=createSpecificitySourceLedger({...f.config,readEntry:s=>s.key===first?b:f.store.get(s.key)});assert.equal((await ledger.inspect()).codeFiles,29);assert.equal(hooks,0);
 const g=ledgerFixture();Object.defineProperty(g.packageRows,'then',{get(){hooks++;throw Error('must not assimilate');}});
 const rejected=createSpecificitySourceLedger(g.config);await assert.rejects(rejected.inspect());assert.equal(hooks,0);assert.equal(rejected.snapshot().failed,true);
});

test('original absolute guard cannot expire during final material construction and still publish',async()=>{
 const pilot=ledgerFixture();let observations=0;await createSpecificitySourceLedger({...pilot.config,guard(){observations++;return true;}}).inspect();
 const f=ledgerFixture();let clock=0;const absoluteDeadline=observations;
 const ledger=createSpecificitySourceLedger({...f.config,guard(){clock++;return clock<absoluteDeadline;}});
 await assert.rejects(ledger.inspect());assert.equal(clock,absoluteDeadline);assert.equal(ledger.snapshot().failed,true);assert.equal(ledger.snapshot().pendingOriginals,0);
 assert.deepEqual(f.counts(),{reads:f.catalog.entries.length,walks:1});await assert.rejects(ledger.inspect());
});

