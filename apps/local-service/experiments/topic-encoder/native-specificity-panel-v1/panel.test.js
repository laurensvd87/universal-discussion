import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSpecificityPanel, LIMITS } from './panel.js';

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
function validate(d) { const { texts, pins } = pack(d); return createSpecificityPanel(pins).validate(texts); }
function rejectsMutation(fn, code) { const d = fixture(); fn(d); assert.throws(() => validate(d), code ? { code } : undefined); }
function badText(text, code) { const p = pack(); p.texts.candidates = text; p.pins.candidates = digest(text); assert.throws(() => createSpecificityPanel(p.pins).validate(p.texts), { code }); }

test('full invented168 panel derives detached identities, taxonomy, nullgold and no authority', () => {
  const d = fixture(), p = validate(d);
  assert.equal(p.cases.length, 168); assert.equal(p.counts.publisherFamilies, 73); assert.equal(p.taxonomy.unionNodeCount, 25);
  assert.deepEqual(p.counts.labelStatus, { verified: 166, unverified: 2, disputed: 0 });
  assert.equal(p.cases.filter(r => r.referenceAnnotation).length, 48);
  for (const id of ['adr159-test-054', 'adr159-test-083']) { const row = p.cases.find(r => r.id === id); assert.equal(row.assessmentGold, null); assert.equal(row.labelStatus, 'unverified'); assert.ok(row.proposedGold); }
  for (const flag of ['fullyReviewedGoldReady', 'nativeReady', 'modelReady', 'productionValidated', 'assignmentAuthority']) assert.equal(p[flag], false);
  assert.deepEqual(p.assessmentPolicy, policy); assert.equal(p.cases[0].rationale, undefined); assert.equal(p.cases[0].articleTitle, undefined);
  d.candidates.cases[0].gold.path[0] = 'science'; assert.equal(p.cases[0].proposedGold.path[0], 'games');
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.cases[0].proposedGold.path)); assert.throws(() => { p.cases[0].proposedGold.path.push('x'); });
});
test('all hashes precede any JSON parsing', () => {
  const p = pack(); p.texts.candidates = '{invalid'; p.pins.candidates = digest(p.texts.candidates); p.pins.finalReview = '0'.repeat(64);
  assert.throws(() => createSpecificityPanel(p.pins).validate(p.texts), { code: 'PANEL_AUTH' });
  p.pins.finalReview = digest(p.texts.finalReview); assert.throws(() => createSpecificityPanel(p.pins).validate(p.texts), { code: 'PANEL_JSON' });
});
test('wrong last pin never invokes a JSON.parse hook; constructor/proto JSON cannot pollute', () => {
  const p = pack(); p.pins.finalReview = '0'.repeat(64); const original = JSON.parse; let calls = 0;
  try { JSON.parse = () => { calls++; throw new Error('parser hook'); };
    assert.throws(() => createSpecificityPanel(p.pins).validate(p.texts), { code: 'PANEL_AUTH' });
    assert.equal(calls, 0);
  } finally { JSON.parse = original; }
  for (const text of ['{"__proto__":{"polluted":true}}', '{"constructor":{"prototype":{"polluted":true}}}', '{"constructor":1,"\\u0063onstructor":2}']) {
    badText(text, text.includes('\\u0063') ? 'PANEL_DUPLICATE_KEY' : 'PANEL_CONTRACT');
    assert.equal(Object.prototype.polluted, undefined); assert.equal({}.polluted, undefined);
  }
});
test('pin and input descriptors reject proxies/accessors/extensions without running traps', () => {
  const p = pack(); let calls = 0;
  const proxy = new Proxy(p.pins, { ownKeys() { calls++; throw Error('trap'); }, getPrototypeOf() { calls++; throw Error('trap'); } });
  assert.throws(() => createSpecificityPanel(proxy), { code: 'PANEL_ARGUMENT' });
  const get = { ...p.pins }; Object.defineProperty(get, 'candidates', { enumerable: true, get() { calls++; throw Error('getter'); } });
  assert.throws(() => createSpecificityPanel(get), { code: 'PANEL_ARGUMENT' });
  const panel = createSpecificityPanel(p.pins);
  assert.throws(() => panel.validate(new Proxy(p.texts, {})), { code: 'PANEL_ARGUMENT' });
  assert.throws(() => panel.validate({ ...p.texts, extra: '' }), { code: 'PANEL_ARGUMENT' });
  assert.throws(() => panel.validate(Object.assign(Object.create({}), p.texts)), { code: 'PANEL_ARGUMENT' });
  const symbol = { ...p.texts, [Symbol('extra')]: 'x' }; assert.throws(() => panel.validate(symbol), { code: 'PANEL_ARGUMENT' });
  assert.equal(calls, 0);
});
test('pins are exact lowercase SHA256 and copied at factory construction', () => {
  const p = pack(); for (const value of ['', 'A'.repeat(64), 'a'.repeat(65), 1, null]) assert.throws(() => createSpecificityPanel({ ...p.pins, candidates: value }));
  const panel = createSpecificityPanel(p.pins); p.pins.candidates = '0'.repeat(64); assert.equal(panel.validate(p.texts).cases.length, 168);
});
test('byte caps apply before auth, with UTF8 rather than UTF16 accounting', () => {
  const p = pack(); p.texts.candidates = 'é'.repeat(131073); assert.throws(() => createSpecificityPanel(p.pins).validate(p.texts), { code: 'PANEL_BYTES' });
  p.texts = Object.fromEntries(keys.map(k => [k, ' '.repeat(209716)])); assert.throws(() => createSpecificityPanel(p.pins).validate(p.texts), { code: 'PANEL_BYTES' });
  p.texts = Object.fromEntries(keys.map(k => [k, ' '.repeat(209715)])); assert.throws(() => createSpecificityPanel(p.pins).validate(p.texts), { code: 'PANEL_AUTH' });
});
test('duplicate decoded keys, JSON grammar, finite numbers and UTF16 fail closed', () => {
  for (const text of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"__proto__":1,"__proto__":2}']) badText(text, 'PANEL_DUPLICATE_KEY');
  for (const text of ['{"a":1,}', '[1,]', '01', 'true false', '"\\x00"', '\ufeff{}', '{"a":"\n"}']) badText(text, 'PANEL_JSON');
  badText('1e999', 'PANEL_NUMBER'); badText('"\\ud800"', 'PANEL_UTF16'); badText('"\\udc00"', 'PANEL_UTF16');
  const p = pack(); p.texts.candidates = '\ud800'; assert.throws(() => createSpecificityPanel(p.pins).validate(p.texts), { code: 'PANEL_UTF16' });
});
test('structural boundary+1 tests for strings, arrays, objects, depth and aggregate values', () => {
  badText(JSON.stringify('a'.repeat(16385)), 'PANEL_STRUCTURE');
  badText(JSON.stringify(Array(1025).fill(0)), 'PANEL_STRUCTURE');
  badText(JSON.stringify(Object.fromEntries(Array.from({ length: 129 }, (_, n) => ['k' + n, 0]))), 'PANEL_STRUCTURE');
  badText('['.repeat(25) + '0' + ']'.repeat(25), 'PANEL_STRUCTURE');
  const p = pack(); const block = Array.from({ length: 100 }, () => Array(1000).fill(0)); p.texts.candidates = JSON.stringify(block); p.pins.candidates = digest(p.texts.candidates);
  assert.throws(() => createSpecificityPanel(p.pins).validate(p.texts), { code: 'PANEL_STRUCTURE' });
  assert.equal(LIMITS.depth, 24); assert.equal(LIMITS.values, 100000);
});
test('exact parser bounds are admitted structurally, not accidentally tightened', () => {
  for (const text of [JSON.stringify('a'.repeat(16384)), JSON.stringify(Array(1024).fill(0)), JSON.stringify(Object.fromEntries(Array.from({ length: 128 }, (_, n) => ['k' + n, 0]))), '['.repeat(24) + '0' + ']'.repeat(24)]) badText(text, 'PANEL_CONTRACT');
  // 99996 candidate values + one root value in each of the four other texts.
  const p = pack(); p.texts = Object.fromEntries(keys.map(k => [k, '{}']));
  p.texts.candidates = JSON.stringify([...Array.from({ length: 99 }, () => Array(1000).fill(0)), ...Array(896).fill(0)]);
  p.pins = Object.fromEntries(keys.map(k => [k, digest(p.texts[k])]));
  assert.throws(() => createSpecificityPanel(p.pins).validate(p.texts), { code: 'PANEL_CONTRACT' });
  p.texts.finalReview = '[0]'; p.pins.finalReview = digest('[0]');
  assert.throws(() => createSpecificityPanel(p.pins).validate(p.texts), { code: 'PANEL_STRUCTURE' });
});
test('schema, flags, scope and relevant row extensions reject', () => {
  for (const mutate of [d => { d.candidates.schema = 'other'; }, d => { d.candidates.modelOutputsSeen = true; }, d => { d.curation.rightsVerified = true; }, d => { d.finalReview.nativeCapturePerformed = true; }, d => { d.candidates.cases[0].unexpected = 1; }, d => { d.candidates.cases[0].goldScope = 'full63'; }]) rejectsMutation(mutate);
});
test('all review schemas reject extensions and contradictory summary counts', () => {
  for (const key of ['curation', 'trainCalReview', 'testReview', 'finalReview']) rejectsMutation(d => { d[key].unexpected = true; });
  rejectsMutation(d => { d.trainCalReview.summary.accept = 95; });
  rejectsMutation(d => { d.finalReview.summary.verifiedLabels = 168; });
  rejectsMutation(d => { d.testReview.independentCrossReview.automaticReplacement = true; });
  rejectsMutation(d => { d.trainCalReview.cases[0].unexpected = true; });
  rejectsMutation(d => { d.testReview.cases[0].unexpected = true; });
});
test('curation goldScope requires the exact scoped-truth object, with no primitive fallback', () => {
  for (const value of ['declared-16-roots-plus-12-node-detail-forest/v1', null, [], 1]) rejectsMutation(d => { d.curation.goldScope = value; }, 'PANEL_CONTRACT');
  rejectsMutation(d => { d.curation.goldScope.id = 'full63'; }, 'PANEL_CONTRACT');
  rejectsMutation(d => { d.curation.goldScope.fullHouse63DeepestTruthClaim = true; }, 'PANEL_CONTRACT');
  rejectsMutation(d => { d.curation.goldScope.unknownChildrenStopAtRepresentedParent = false; }, 'PANEL_CONTRACT');
  rejectsMutation(d => { delete d.curation.goldScope.unknownChildrenStopAtRepresentedParent; }, 'PANEL_CONTRACT');
  rejectsMutation(d => { d.curation.goldScope.extra = false; }, 'PANEL_CONTRACT');
});
test('all identities are unique and bounded', () => {
  for (const key of ['id', 'groupId', 'publicUrl']) rejectsMutation(d => { d.candidates.cases[1][key] = d.candidates.cases[0][key]; });
  rejectsMutation(d => { d.candidates.cases.push(copy(d.candidates.cases[0])); });
  rejectsMutation(d => { d.candidates.cases[0].groupId = 'x'.repeat(161); });
  rejectsMutation(d => { d.candidates.cases[0].publicUrl = 'https://publisher.org/' + 'x'.repeat(2049); });
});
test('split/family counts and family cross-split isolation are recomputed', () => {
  rejectsMutation(d => { d.candidates.cases[0].split = 'test'; });
  rejectsMutation(d => { d.candidates.cases[0].publisherFamily = 'newfamily'; });
  rejectsMutation(d => { d.candidates.cases.find(r => r.split === 'calibration').publisherFamily = d.candidates.cases[0].publisherFamily; });
  rejectsMutation(d => { d.curation.countReport.publisherFamilies = 72; });
});
test('all per-split leaf and parent quotas plus role quotas are enforced', () => {
  for (const split of ['training', 'calibration', 'test']) for (const role of ['leaf', 'parent-stop']) rejectsMutation(d => {
    const row = d.candidates.cases.find(r => r.split === split && r.role === role); const endpoint = role === 'leaf' ? 'pasta' : 'recipes'; row.nodeId = endpoint; row.gold.path = [...paths[endpoint]];
    if (row.referenceAnnotation) row.referenceAnnotation.nodeId = endpoint;
  });
  rejectsMutation(d => { d.candidates.cases.find(r => r.role === 'positive-prefix').role = 'known-other-root-confounder'; });
});
test('leaf language and origin diversity are recomputed, not attested', () => {
  rejectsMutation(d => { for (const row of d.candidates.cases.filter(r => r.role === 'leaf' && r.nodeId === 'gta')) row.language = 'en'; });
  rejectsMutation(d => { for (const row of d.candidates.cases.filter(r => r.role === 'leaf' && r.nodeId === 'gta')) row.publicSupportUrl = row.publicUrl = `https://single-publisher.org/${row.id}`; });
});
test('topology excludes unknown/misparented/duplicate nodes and outside-all labels', () => {
  for (const g of [{ kind: 'outside', path: [] }, { kind: 'complete', path: ['games', 'animals', 'koalas'] }, { kind: 'complete', path: ['games', 'games'] }, { kind: 'prefix', path: ['unknown'] }, { kind: 'complete', path: Array(9).fill('games') }]) rejectsMutation(d => { d.candidates.cases[0].gold = g; });
});
test('consistent scoped-prefix review cannot admit non-string path nodes by property coercion', () => {
  for (const malformed of [['video-games'], { node: 'video-games' }, null]) rejectsMutation(d => {
    const row = d.candidates.cases.find(r => r.role === 'scoped-confounder' && r.referenceAnnotation.nodeId === 'cooking');
    row.gold = { kind: 'prefix', path: ['games', malformed] };
    d.trainCalReview.cases.find(r => r.caseId === row.id).reviewedGold = copy(row.gold);
  }, 'PANEL_CONTRACT');
});
test('STOP is direct complete support, prefixes cannot manufacture child negatives', () => {
  rejectsMutation(d => { d.candidates.cases.find(r => r.role === 'parent-stop').gold.kind = 'prefix'; });
  rejectsMutation(d => { d.candidates.cases.find(r => r.role === 'leaf').gold.kind = 'prefix'; });
  rejectsMutation(d => { d.candidates.cases.find(r => r.role === 'positive-prefix').gold.kind = 'complete'; });
});
test('TRAIN reference MEMBER/STOP/OUTSIDE semantics and negative root scopes', () => {
  for (const role of ['leaf', 'parent-stop', 'scoped-confounder']) rejectsMutation(d => { d.candidates.cases.find(r => r.role === role).referenceAnnotation.kind = 'outside-all'; });
  rejectsMutation(d => { const row = d.candidates.cases.find(r => r.role === 'scoped-confounder'); row.gold.path = [row.referenceAnnotation.nodeId]; });
  rejectsMutation(d => { d.candidates.cases.find(r => r.role === 'scoped-confounder').referenceAnnotation.nodeId = 'science'; });
  rejectsMutation(d => { d.candidates.cases.find(r => r.split === 'calibration').referenceAnnotation = { kind: 'member', nodeId: 'gta' }; });
  const p = validate(fixture()), row = p.cases.find(r => r.role === 'scoped-confounder' && r.nodeId === 'games');
  assert.deepEqual(row.proposedGold.path, ['technology']); assert.equal(row.referenceAnnotation.nodeId, 'games'); assert.equal(row.referenceProvenance.usableAsVerifiedReference, true);
});
test('scoped-confounder identity permits exactly positive endpoint or excluded root, not a third node', () => {
  const excluded = fixture();
  const row = excluded.candidates.cases.find(r => r.role === 'scoped-confounder' && r.referenceAnnotation.nodeId === 'games');
  assert.equal(row.nodeId, 'games'); assert.deepEqual(row.gold.path, ['technology']);
  const a = validate(excluded).cases.find(r => r.id === row.id);
  assert.equal(a.nodeId, 'games'); assert.equal(a.referenceProvenance.usableAsVerifiedReference, true);
  const endpoint = fixture(), positive = endpoint.candidates.cases.find(r => r.id === row.id);
  positive.nodeId = 'technology';
  const b = validate(endpoint).cases.find(r => r.id === row.id);
  assert.equal(b.nodeId, 'technology'); assert.equal(b.referenceProvenance.usableAsVerifiedReference, true);
  rejectsMutation(d => { d.candidates.cases.find(r => r.id === row.id).nodeId = 'dolphins'; }, 'PANEL_CONTRACT');
});
test('URL policy excludes credentials/private hosts and preserves only documented support alias', () => {
  for (const value of ['https://user:pass@publisher.org/a', 'https://publisher.org/account/a', 'https://localhost/a', 'https://publisher.org/?token=secret', 'http://127.0.0.1:4173/background-fixture/a', 'https://publisher.org/a#fragment', 'https://PUBLISHER.org/a', 'https://publisher.org:443/a']) rejectsMutation(d => { d.candidates.cases[0].publicUrl = value; });
  rejectsMutation(d => { d.candidates.cases[0].publicSupportUrl += '#fragment'; });
  rejectsMutation(d => { d.candidates.cases[0].publicSupportUrl += '/alias'; });
  rejectsMutation(d => { d.candidates.cases.find(r => r.id === 'adr159-test-170').publicSupportUrl = 'https://www.gamesradar.com/gta-5-beyond-stars-guide/3/'; });
});
test('six fixed challenges bind individual format judgments and cached alias evidence', () => {
  const p = validate(fixture()); assert.equal(p.cases.filter(r => r.challengeClass).length, 6);
  assert.equal(p.cases.find(r => r.id === 'adr159-test-144').formatState, 'fact-panels-read-more-native-interaction-unverified');
  assert.equal(p.cases.find(r => r.id === 'adr159-test-170').formatState, 'cached-expansion-only-current-format-unverified');
  assert.equal(p.cases.filter(r => r.formatState === 'declared-format-native-unobserved').length, 4);
  rejectsMutation(d => { d.candidates.cases.find(r => r.challengeClass).challengeClass = 'dynamic-proven'; });
  rejectsMutation(d => { d.testReview.cases.find(r => r.formatJudgment).formatJudgment = 'native-proven'; });
  rejectsMutation(d => { d.candidates.cases.find(r => r.formatEvidence).formatEvidence.redirectedToCanonical = false; });
});
test('TRAIN/CAL review joins reject every identity/gold/reference disagreement', () => {
  for (const k of ['split', 'publicUrl', 'referenceUrl', 'language', 'groupId', 'publisherFamily']) rejectsMutation(d => { d.trainCalReview.cases[0][k] = 'different'; });
  rejectsMutation(d => { d.trainCalReview.cases[0].reviewedGold = { kind: 'prefix', path: ['games'] }; });
  rejectsMutation(d => { d.trainCalReview.cases[0].reviewedReferenceAnnotation.nodeId = 'minecraft'; });
  rejectsMutation(d => { d.trainCalReview.cases[0].caseId = 'foreign'; });
  rejectsMutation(d => { d.trainCalReview.cases[1].caseId = d.trainCalReview.cases[0].caseId; });
  rejectsMutation(d => { d.trainCalReview.cases.pop(); });
});
test('TEST and final reviews reject missing/foreign/duplicate/contradictory dispositions', () => {
  rejectsMutation(d => { d.testReview.cases.pop(); });
  rejectsMutation(d => { d.testReview.cases[1].id = d.testReview.cases[0].id; });
  rejectsMutation(d => { d.testReview.cases[0].id = 'foreign'; });
  rejectsMutation(d => { d.testReview.cases.find(r => r.id === 'adr159-test-054').judgment = 'accept-scoped-label'; });
  rejectsMutation(d => { d.finalReview.cases[0].selectedUrl += '/different'; });
  rejectsMutation(d => { d.finalReview.cases[0].proposedGoldAccepted = true; });
  rejectsMutation(d => { d.finalReview.cases[0].finalReportedUrl = 'https://publisher.org/final'; });
  rejectsMutation(d => { d.trainCalReview.crossReviewTestCases[0].goldAcceptedByThisCrossReview = true; });
  rejectsMutation(d => { d.finalReview.assessmentPolicy.assignedUnassessedFailsZeroWrongGate = false; });
});
test('noncontradictory disputes retain proposedGold but never gold/reference authority', () => {
  const d = fixture(); d.trainCalReview.cases[0].verdict = 'dispute'; d.testReview.cases.find(r => r.judgment === 'accept-scoped-label' && !r.formatJudgment).judgment = 'dispute-scoped-label';
  d.trainCalReview.summary.accept = 95; d.trainCalReview.summary.dispute = 1; d.finalReview.summary.verifiedLabels = 164; d.finalReview.summary.disputes = 2;
  const p = validate(d); assert.deepEqual(p.counts.labelStatus, { verified: 164, unverified: 2, disputed: 2 });
  assert.equal(p.cases[0].assessmentGold, null); assert.equal(p.cases[0].referenceProvenance.usableAsVerifiedReference, false);
});
test('bookkeeping reversals bind actual strings and digests, not boolean assertions', () => {
  for (const key of ['candidates', 'curation']) { const p = pack(); const r = JSON.parse(p.texts.trainCalReview); r.sourceHashes[key] = '0'.repeat(64); p.texts.trainCalReview = JSON.stringify(r); p.pins.trainCalReview = digest(p.texts.trainCalReview); assert.throws(() => createSpecificityPanel(p.pins).validate(p.texts), { code: 'PANEL_TRANSITION' }); }
  const p = pack(); p.texts.candidates = p.texts.candidates.replace('"proposed-complete-unsealed"', '"proposed-complete-\\u0075nsealed"'); p.pins.candidates = digest(p.texts.candidates);
  assert.throws(() => createSpecificityPanel(p.pins).validate(p.texts), { code: 'PANEL_TRANSITION' });
  for (const key of ['unchangedCasesJsonSha256', 'unchangedCountReportJsonSha256']) { const q = pack(); const r = JSON.parse(q.texts.trainCalReview); r.postReviewBookkeepingTransition[key] = '0'.repeat(64); q.texts.trainCalReview = JSON.stringify(r); q.pins.trainCalReview = digest(q.texts.trainCalReview); assert.throws(() => createSpecificityPanel(q.pins).validate(q.texts), { code: 'PANEL_TRANSITION' }); }
});
test('deterministic identity binds case ordering and all source bytes, with no mutable aliases', () => {
  const d = fixture(), a = validate(d), b = validate(fixture()); assert.equal(a.panelIdentity, b.panelIdentity);
  const e = fixture(); e.candidates.cases.reverse(); e.curation.countReport = count(e.candidates.cases); const ordered = validate(e); assert.notEqual(a.panelIdentity, ordered.panelIdentity);
  const f = fixture(); f.candidates.cases[0].rationale = 'Different invented annotation not echoed.'; const changed = validate(f); assert.notEqual(a.panelIdentity, changed.panelIdentity); assert.deepEqual(a.cases, changed.cases);
  assert.ok(Buffer.byteLength(JSON.stringify(a)) <= LIMITS.outputBytes);
});
