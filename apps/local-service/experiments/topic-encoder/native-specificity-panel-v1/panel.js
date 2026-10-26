import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { inspectPageUrl } from '../../../../../spikes/topic-resolution/browser/core/page-content-policy.js';

// Inert metadata-only ADR177 boundary. No IO, callback capabilities or runtime registration.
export const LIMITS = Object.freeze({ sourceBytes: 262144, aggregateBytes: 1048576,
  depth: 24, values: 100000, array: 1024, properties: 128, string: 16384,
  rows: 168, identifier: 160, url: 2048, outputBytes: 524288 });
const KEYS = ['candidates', 'curation', 'trainCalReview', 'testReview', 'finalReview'];
const ROOTS = ['games', 'nature', 'cooking', 'vehicles', 'science', 'technology', 'society',
  'history', 'culture', 'sports', 'geography', 'health', 'business', 'languages', 'ideas-beliefs', 'education'];
const PARENTS = { 'video-games': 'games', gta: 'video-games', minecraft: 'video-games',
  animals: 'nature', koalas: 'animals', dolphins: 'animals', recipes: 'cooking', kapsalon: 'recipes', pasta: 'recipes' };
const LEAVES = ['gta', 'minecraft', 'koalas', 'dolphins', 'kapsalon', 'pasta'];
const INTERNAL = ['games', 'video-games', 'nature', 'animals', 'cooking', 'recipes'];
const DETAIL_ROOTS = ['games', 'nature', 'cooking'];
const SPLITS = ['training', 'calibration', 'test'];
const SCOPE = 'declared-16-roots-plus-12-node-detail-forest/v1';
const MISSING = ['adr159-test-054', 'adr159-test-083'];
const CHALLENGES = {
  'adr159-test-114': ['koalas', 'public-scientific-press-release', 'accept-declared-research-release-format'],
  'adr159-test-138': ['video-games', 'publisher-game-product-page', 'accept-declared-game-product-format'],
  'adr159-test-139': ['nature', 'institutional-educational-feature', 'accept-declared-institutional-feature-format'],
  'adr159-test-144': ['dolphins', 'institutional-interactive-species-account', 'fact-panels-pod-sections-read-more-observed-native-interaction-unverified'],
  'adr159-test-147': ['recipes', 'authored-recipe-with-recipe-card', 'accept-declared-recipe-card-format'],
  'adr159-test-170': ['gta', 'game-guide-with-pagination-or-expansion', 'cached-expansion-evidence-only-current-native-format-unverified'],
};
const ALIAS = 'https://www.gamesradar.com/gta-5-beyond-stars-guide/2/';
const CANONICAL = 'https://www.gamesradar.com/gta-5-beyond-stars-guide/';
const POLICY = {
  allOriginalRowsAndDenominatorsRetained: true,
  unverifiedOrDisputedProposedGoldNeverPassedToAssessor: true,
  assignedUnassessedFailsZeroWrongGate: true,
  unknownAssignmentsRemainInAllAcceptedDenominator: true,
  noAll72AccuracyClaim: true,
  conditionalFormatsNotPromotedToNativeFacts: true,
};
const FALSE_FLAGS = ['labelsSealed', 'ownerApproved', 'nativeAvailabilityVerified', 'rightsVerified',
  'modelOutputsSeen', 'productionValidated', 'assignmentAuthority'];
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const need = (value, code = 'PANEL_CONTRACT') => { if (value !== true) fail(code); };
const hash = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const own = (o, k) => Object.hasOwn(o, k);
const equal = (a, b) => stable(a) === stable(b);
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v !== null && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
function freeze(v) {
  if (v && typeof v === 'object') { for (const x of Object.values(v)) freeze(x); Object.freeze(v); }
  return v;
}
function envelope(value) {
  need(value !== null && typeof value === 'object' && !types.isProxy(value), 'PANEL_ARGUMENT');
  need(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, 'PANEL_ARGUMENT');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  need(Reflect.ownKeys(descriptors).length === KEYS.length, 'PANEL_ARGUMENT');
  const copy = {};
  for (const k of KEYS) {
    const d = descriptors[k];
    need(d !== undefined && own(d, 'value') && d.enumerable === true && typeof d.value === 'string', 'PANEL_ARGUMENT');
    copy[k] = d.value;
  }
  return copy;
}
function unicode(s) {
  for (let i = 0; i < s.length; i++) {
    const n = s.charCodeAt(i);
    if (n >= 0xd800 && n <= 0xdbff) { const next = s.charCodeAt(++i); need(next >= 0xdc00 && next <= 0xdfff, 'PANEL_UTF16'); }
    else need(n < 0xdc00 || n > 0xdfff, 'PANEL_UTF16');
  }
}

// This parser is deliberately after authentication. It rejects decoded duplicate
// keys (including escaped spellings), and records top-level value token spans
// for byte-preserving bookkeeping reversal, never searching nested prose.
function parse(text, shared) {
  let i = 0;
  const spans = Object.create(null);
  const ws = () => { while (i < text.length && /[\x20\x09\x0a\x0d]/u.test(text[i])) i++; };
  function string() {
    const start = i++; let units = 0;
    while (i < text.length) {
      const c = text[i++];
      if (c === '"') {
        let value;
        try { value = JSON.parse(text.slice(start, i)); } catch { fail('PANEL_JSON'); }
        unicode(value); return value;
      }
      if (c === '\\') {
        const escape = text[i++]; need(typeof escape === 'string' && '"\\/bfnrtu'.includes(escape), 'PANEL_JSON');
        if (escape === 'u') { need(/^[0-9a-fA-F]{4}$/u.test(text.slice(i, i + 4)), 'PANEL_JSON'); i += 4; }
      }
      else need(c.charCodeAt(0) >= 32, 'PANEL_JSON');
      need(++units <= LIMITS.string, 'PANEL_STRUCTURE');
    }
    fail('PANEL_JSON');
  }
  function value(depth) {
    need(depth <= LIMITS.depth && ++shared.values <= LIMITS.values, 'PANEL_STRUCTURE');
    ws(); const c = text[i];
    if (c === '"') return string();
    if (c === '{') {
      i++; ws(); const o = Object.create(null); let count = 0;
      if (text[i] === '}') { i++; return o; }
      for (;;) {
        need(text[i] === '"', 'PANEL_JSON'); const k = string();
        need(!own(o, k), 'PANEL_DUPLICATE_KEY'); need(++count <= LIMITS.properties, 'PANEL_STRUCTURE');
        ws(); need(text[i++] === ':', 'PANEL_JSON'); ws(); const start = i;
        o[k] = value(depth + 1); if (depth === 0) spans[k] = [start, i];
        ws(); const end = text[i++]; if (end === '}') return o;
        need(end === ',', 'PANEL_JSON'); ws();
      }
    }
    if (c === '[') {
      i++; ws(); const a = []; if (text[i] === ']') { i++; return a; }
      for (;;) { need(a.length < LIMITS.array, 'PANEL_STRUCTURE'); a.push(value(depth + 1)); ws();
        const end = text[i++]; if (end === ']') return a; need(end === ',', 'PANEL_JSON'); ws(); }
    }
    for (const [literal, v] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(literal, i)) { i += literal.length; return v; }
    }
    const m = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(text.slice(i));
    need(m !== null, 'PANEL_JSON'); i += m[0].length; const n = Number(m[0]);
    need(Number.isFinite(n), 'PANEL_NUMBER'); return n;
  }
  const data = value(0); ws(); need(i === text.length, 'PANEL_JSON');
  return { data, spans };
}
function object(o) { need(o !== null && typeof o === 'object' && !Array.isArray(o)); }
function fields(o, required, optional = []) {
  object(o); const allowed = new Set([...required, ...optional]);
  need(required.every(k => own(o, k)) && Object.keys(o).every(k => allowed.has(k)));
}
function id(s) { need(typeof s === 'string' && s.length > 0 && s.length <= LIMITS.identifier && !/[\u0000-\u001f\u007f]/u.test(s)); }
function url(s) {
  need(typeof s === 'string' && s.length <= LIMITS.url);
  const policy = inspectPageUrl(s); need(policy.supported === true && policy.url === s);
  const parsed = new URL(s);
  need(parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '' && parsed.hash === '');
  return parsed.origin;
}
function falseFlags(o, flags = FALSE_FLAGS) { object(o); for (const k of flags) need(o[k] === false); }
function mapRows(rows, key, n) {
  need(Array.isArray(rows) && rows.length === n); const m = new Map();
  for (const row of rows) { object(row); id(row[key]); need(!m.has(row[key])); m.set(row[key], row); } return m;
}
function gold(g) {
  fields(g, ['kind', 'path']); need(g.kind === 'complete' || g.kind === 'prefix');
  need(Array.isArray(g.path) && g.path.length > 0 && g.path.length <= 8);
  for (const node of g.path) {
    id(node);
    need(ROOTS.includes(node) || own(PARENTS, node));
  }
  need(ROOTS.includes(g.path[0]));
  for (let i = 1; i < g.path.length; i++) need(PARENTS[g.path[i]] === g.path[i - 1]);
  return { kind: g.kind, path: [...g.path] };
}
function reference(row, g) {
  if (row.split !== 'training') { need(row.referenceAnnotation === null); return null; }
  const r = row.referenceAnnotation; fields(r, ['nodeId', 'kind']);
  if (row.role === 'leaf') need(r.kind === 'member' && r.nodeId === row.nodeId && g.path.includes(r.nodeId));
  else if (row.role === 'parent-stop') need(r.kind === 'stop' && r.nodeId === row.nodeId && g.kind === 'complete' && INTERNAL.includes(r.nodeId));
  else need(row.role === 'scoped-confounder' && r.kind === 'outside' && DETAIL_ROOTS.includes(r.nodeId) && g.path[0] !== r.nodeId &&
    (row.nodeId === g.path.at(-1) || row.nodeId === r.nodeId));
  return { nodeId: r.nodeId, kind: r.kind };
}
const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
function cohort(c) {
  fields(c, ['schema', 'status', 'proposed', 'scope', 'cases', ...FALSE_FLAGS]);
  need(c.schema === 'hierarchy-native-detail-candidates/v1' && c.status === 'proposed-complete-unsealed' && c.proposed === true && c.scope === 'ADR159-metadata-curation-only');
  falseFlags(c); need(Array.isArray(c.cases) && c.cases.length === 168);
  const seen = { id: new Set(), groupId: new Set(), publicUrl: new Set() }, families = new Map();
  const counts = { selected: 168, bySplit: {}, byLanguage: {}, byRole: {}, bySplitRole: {}, leafCounts: {}, parentCounts: {}, goldKinds: {}, referenceKinds: {}, outsideRoots: {}, leafDiversity: {} };
  const rows = [];
  for (const r of c.cases) {
    fields(r, ['id', 'split', 'role', 'nodeId', 'groupId', 'publisherFamily', 'publicUrl', 'articleTitle', 'language', 'gold', 'rationale', 'scopeExclusions', 'referenceAnnotation', 'goldScope', 'publicSupportUrl', 'verification', 'provenance'], ['challengeClass', 'formatEvidence']);
    for (const k of ['id', 'nodeId', 'groupId', 'publisherFamily']) id(r[k]);
    for (const k of ['articleTitle', 'rationale', 'scopeExclusions']) need(typeof r[k] === 'string' && r[k].length > 0);
    need(SPLITS.includes(r.split) && new RegExp(`^adr159-${r.split}-[0-9]{3}$`, 'u').test(r.id));
    need(ROOTS.includes(r.nodeId) || own(PARENTS, r.nodeId));
    for (const k of Object.keys(seen)) { need(!seen[k].has(r[k])); seen[k].add(r[k]); }
    need(!families.has(r.publisherFamily) || families.get(r.publisherFamily) === r.split); families.set(r.publisherFamily, r.split);
    const origin = url(r.publicUrl); url(r.publicSupportUrl);
    need(r.publicSupportUrl === r.publicUrl || (r.id === 'adr159-test-170' && r.publicUrl === CANONICAL && r.publicSupportUrl === ALIAS));
    need(['en', 'de', 'nl', 'fr', 'es'].includes(r.language) && r.goldScope === SCOPE);
    fields(r.verification, ['method', 'verifiedOn']); need(r.verification.method === 'primary-page-open-and-main-content-read' && r.verification.verifiedOn === '2026-10-20' && r.provenance === 'agent-authored-public-metadata');
    const g = gold(r.gold), endpoint = g.path.at(-1);
    if (r.role !== 'scoped-confounder') need(r.nodeId === endpoint);
    if (r.role === 'leaf') need(LEAVES.includes(endpoint) && g.kind === 'complete');
    else if (r.role === 'parent-stop') need(INTERNAL.includes(endpoint) && g.kind === 'complete');
    else if (r.role === 'positive-prefix') need(r.split === 'test' && g.kind === 'prefix');
    else if (r.role === 'known-other-root-confounder') need(r.split !== 'training' && g.kind === 'prefix' && !DETAIL_ROOTS.includes(g.path[0]));
    else if (r.role === 'scoped-confounder') need(r.split === 'training');
    else need(r.role === 'acquisition-challenge' && r.split === 'test' && g.kind === 'complete');
    const ref = reference(r, g);
    inc(counts.bySplit, r.split); inc(counts.byLanguage, r.language); inc(counts.byRole, r.role); inc(counts.goldKinds, g.kind);
    inc(counts.bySplitRole[r.split] ||= {}, r.role);
    if (r.role === 'leaf') {
      inc(counts.leafCounts[r.split] ||= {}, endpoint);
      const d = counts.leafDiversity[endpoint] ||= { languages: [], origins: [], families: [] };
      for (const [key, val] of [['languages', r.language], ['origins', origin], ['families', r.publisherFamily]]) if (!d[key].includes(val)) d[key].push(val);
    }
    if (r.role === 'parent-stop') inc(counts.parentCounts[r.split] ||= {}, endpoint);
    if (ref) { inc(counts.referenceKinds, ref.kind); if (ref.kind === 'outside') inc(counts.outsideRoots, ref.nodeId); }
    const challenge = CHALLENGES[r.id];
    if (r.role === 'acquisition-challenge') {
      need(challenge !== undefined && r.nodeId === challenge[0] && r.challengeClass === challenge[1]);
      if (r.id === 'adr159-test-170') {
        need(r.publicUrl === CANONICAL && r.publicSupportUrl === ALIAS);
        fields(r.formatEvidence, ['kind', 'observedOnPublicUrl', 'redirectedToCanonical', 'retrievalFreshnessLimitation']);
        need(r.formatEvidence.kind === 'publisher-map-expansion-prompt' && r.formatEvidence.observedOnPublicUrl === ALIAS && r.formatEvidence.redirectedToCanonical === true && typeof r.formatEvidence.retrievalFreshnessLimitation === 'string' && r.formatEvidence.retrievalFreshnessLimitation.length > 0);
      } else need(!own(r, 'formatEvidence'));
    } else need(challenge === undefined && !own(r, 'challengeClass') && !own(r, 'formatEvidence'));
    rows.push({ id: r.id, groupId: r.groupId, split: r.split, role: r.role, nodeId: r.nodeId,
      publicUrl: r.publicUrl, publicSupportUrl: r.publicSupportUrl, language: r.language,
      publisherFamily: r.publisherFamily, proposedGold: g, referenceAnnotation: ref,
      challengeClass: challenge ? challenge[1] : null });
  }
  need(families.size === 73); counts.publisherFamilies = families.size;
  const quotas = { training: { leaf: 24, 'parent-stop': 12, 'scoped-confounder': 12 }, calibration: { leaf: 24, 'parent-stop': 12, 'known-other-root-confounder': 12 }, test: { leaf: 36, 'parent-stop': 18, 'positive-prefix': 6, 'known-other-root-confounder': 6, 'acquisition-challenge': 6 } };
  need(equal(counts.bySplit, { training: 48, calibration: 48, test: 72 }) && equal(counts.bySplitRole, quotas));
  for (const split of SPLITS) {
    need(equal(counts.leafCounts[split], Object.fromEntries(LEAVES.map(k => [k, split === 'test' ? 6 : 4]))));
    need(equal(counts.parentCounts[split], Object.fromEntries(INTERNAL.map(k => [k, split === 'test' ? 3 : 2]))));
  }
  need(equal(counts.goldKinds, { complete: 136, prefix: 32 }) && equal(counts.referenceKinds, { member: 24, stop: 12, outside: 12 }));
  need(equal(counts.outsideRoots, { games: 4, nature: 4, cooking: 4 }));
  for (const d of Object.values(counts.leafDiversity)) need(d.languages.length >= 2 && d.origins.length >= 3);
  return { rows, counts };
}

function reverse(text, parsed, edits) {
  const changes = [];
  for (const [key, current, old] of edits) {
    need(own(parsed.spans, key), 'PANEL_TRANSITION'); const [a, b] = parsed.spans[key];
    need(text.slice(a, b) === JSON.stringify(current), 'PANEL_TRANSITION'); changes.push([a, b, JSON.stringify(old)]);
  }
  for (const [a, b, old] of changes.sort((a, b) => b[0] - a[0])) text = text.slice(0, a) + old + text.slice(b);
  return hash(text);
}
function bindings(texts, parsed, pins) {
  const { candidates: c, curation: u, trainCalReview: r, testReview: t, finalReview: f } = Object.fromEntries(KEYS.map(k => [k, parsed[k].data]));
  const original = { candidates: reverse(texts.candidates, parsed.candidates, [['status', 'proposed-complete-unsealed', 'partial-unsealed']]),
    curation: reverse(texts.curation, parsed.curation, [['status', 'proposed-complete-unsealed', 'phase-2-active-partial-unsealed'], ['selected', 168, 128]]) };
  need(equal(r.sourceHashes, original) && t.candidateSha256 === original.candidates && t.curationSha256 === original.curation, 'PANEL_TRANSITION');
  const casesDigest = hash(JSON.stringify(c.cases)), countDigest = hash(JSON.stringify(u.countReport));
  const a = r.postReviewBookkeepingTransition, b = t.bookkeepingTransition; object(a); object(b);
  need(a.currentCandidateSha256 === pins.candidates && a.currentCurationSha256 === pins.curation && b.candidateCurrentSha256 === pins.candidates && b.curationCurrentSha256 === pins.curation, 'PANEL_TRANSITION');
  need(a.unchangedCasesJsonSha256 === casesDigest && b.casesDigestUnchanged === casesDigest && a.unchangedCountReportJsonSha256 === countDigest && b.countReportDigestUnchanged === countDigest, 'PANEL_TRANSITION');
  need(equal(a.changes, ['candidates.status: partial-unsealed -> proposed-complete-unsealed', 'curation.status: phase-2-active-partial-unsealed -> proposed-complete-unsealed', 'curation.selected: 128 -> 168']) && equal(b.onlyChangedFields, ['candidates.status', 'curation.status', 'curation.selected']), 'PANEL_TRANSITION');
  need(a.reviewedSourceHashesAboveRemainOriginal === true && a.bookkeepingFindingsResolvedWithoutLabelSeal === true && b.exactReversalRecoversOriginalFileHashes === true, 'PANEL_TRANSITION');
  need(equal(f.sourceHashes, Object.fromEntries(KEYS.slice(0, 4).map(k => [k, pins[k]]))), 'PANEL_REVIEW');
  return { originalReviewed: original, casesJson: casesDigest, countReportJson: countDigest };
}
function reviews(data, result) {
  const { curation: u, trainCalReview: r, testReview: t, finalReview: f } = data;
  fields(u, ['schema', 'status', 'selected', ...FALSE_FLAGS, 'goldScope', 'semanticFamilyIndependenceDemonstrated', 'exclusionScope', 'correlationLimits', 'truthLimitations', 'countReport'], ['date', 'authorization', 'phase2', 'prospectiveFamilyPolicy', 'publisherSplitPolicy', 'budget', 'dispositions', 'openOperationsRemainingUnused', 'completionLimit', 'remainingPoolLimits', 'cumulativeBudget', 'phase1CompletionLimit']);
  fields(r, ['schema', 'status', 'sourceHashes', 'postReviewBookkeepingTransition', 'scope', 'summary', 'cases', 'crossReviewTestCases'], ['date', 'reviewer', 'authorization', 'budget', 'method', 'structuralAudit', 'findings', 'limitations']);
  fields(t, ['schema', 'status', 'candidateSha256', 'curationSha256', 'bookkeepingTransition', 'cases', 'independentCrossReview', 'labelsSealed', 'modelOutputsSeen', 'nativeCapturePerformed', 'assignmentAuthority'], ['date', 'reviewer', 'scope', 'budget', 'structuralAudit', 'limitations']);
  fields(f, ['schema', 'decision', 'status', 'sourceHashes', 'cases', 'summary', 'assessmentPolicy', 'budget', 'existingMetadataOrReviewsChanged', 'labelsSealed', 'nativeAvailabilityOrRightsEstablished', 'nativeCapturePerformed', 'modelOutputsSeen', 'providerCalls', 'assignmentAuthority', 'independentOutcomeAudit'], ['date', 'reviewer']);
  need(u.schema === 'hierarchy-native-detail-curation/v1' && u.status === 'proposed-complete-unsealed' && u.selected === 168); falseFlags(u);
  fields(u.goldScope, ['id', 'fullHouse63DeepestTruthClaim', 'unknownChildrenStopAtRepresentedParent']);
  need(u.goldScope.id === SCOPE && u.goldScope.fullHouse63DeepestTruthClaim === false && u.goldScope.unknownChildrenStopAtRepresentedParent === true);
  need(u.semanticFamilyIndependenceDemonstrated === false && u.exclusionScope.completeHistoricalExclusionCoverageClaim === false && u.exclusionScope.old128And112FullMetadataIndependentlyRead === false && u.exclusionScope.privateExclusionMetadataSentExternally === false);
  need(Array.isArray(u.correlationLimits) && u.correlationLimits.length > 0 && Array.isArray(u.truthLimitations) && u.truthLimitations.length > 0);
  for (const k of ['selected', 'bySplit', 'byLanguage', 'byRole', 'bySplitRole', 'leafCounts', 'parentCounts', 'leafDiversity', 'publisherFamilies']) need(equal(u.countReport[k], result.counts[k]));
  need(equal(u.countReport.originalSplitTargets, { training: 48, calibration: 48, test: 72 }) && u.countReport.roleQuotasMetStructurally === true && u.countReport.leafDiversityGoalMetStructurally === true && u.countReport.labelAcceptanceIndependentReview === false);
  need(r.schema === 'hierarchy-native-detail-independent-primary-review/v1' && r.status === 'complete-train-cal-review-only-unsealed');
  falseFlags(r.scope, ['modelOutputsSeen', 'labelsSealed', 'ownerApprovedGold', 'nativeAvailabilityVerified', 'rightsVerified', 'productionValidated', 'assignmentAuthority']);
  need(r.scope.rootAndLocalForestOnly === true && r.scope.fullHouse63TruthClaim === false && r.scope.absoluteOutsideGoldEstablished === false && r.scope.caseCount === 96 && r.scope.training === 48 && r.scope.calibration === 48);
  need(t.schema === r.schema && t.status === 'initial-review-complete-two-primary-access-gaps-unsealed'); falseFlags(t, ['labelsSealed', 'modelOutputsSeen', 'nativeCapturePerformed', 'assignmentAuthority']);
  need(f.schema === 'hierarchy-native-detail-final-label-review/v1' && f.decision === 'ADR176' && f.status === 'bounded-primary-review-complete-both-labels-still-unverified');
  falseFlags(f, ['existingMetadataOrReviewsChanged', 'labelsSealed', 'nativeAvailabilityOrRightsEstablished', 'nativeCapturePerformed', 'modelOutputsSeen', 'assignmentAuthority']);
  need(f.providerCalls === 0 && f.independentOutcomeAudit === 'passed-recorded-outcomes-and-unchanged-metadata-no-refetch' && equal(f.assessmentPolicy, POLICY));
  need(equal(f.budget, { maximumOpens: 2, actualOpens: 2, searches: 0, followupOpens: 0, retries: 0, alternateUrls: 0, replacements: 0 }));
  const tc = mapRows(r.cases, 'caseId', 96), test = mapRows(t.cases, 'id', 72), final = mapRows(f.cases, 'id', 2), cross = mapRows(r.crossReviewTestCases, 'caseId', 2);
  need(MISSING.every(k => final.has(k) && cross.has(k)));
  const labelCounts = { verified: 0, unverified: 0, disputed: 0 };
  const trainCalCounts = { accept: 0, dispute: 0, unavailable: 0 };
  for (const row of result.rows) {
    let status, judgment;
    if (row.split !== 'test') {
      const review = tc.get(row.id); need(review !== undefined); tc.delete(row.id);
      fields(review, ['caseId', 'split', 'publicUrl', 'referenceUrl', 'language', 'verdict', 'reviewedGold', 'reviewedReferenceAnnotation', 'groupId', 'publisherFamily'], ['rationale', 'primaryInitialOpens', 'followupOpens', 'sourceProvenance']);
      for (const k of ['split', 'publicUrl', 'language', 'groupId', 'publisherFamily']) need(review[k] === row[k], 'PANEL_REVIEW');
      need(review.referenceUrl === row.publicSupportUrl && equal(review.reviewedGold, row.proposedGold) && equal(review.reviewedReferenceAnnotation, row.referenceAnnotation), 'PANEL_REVIEW');
      need(['accept', 'dispute', 'review-unavailable'].includes(review.verdict));
      status = review.verdict === 'accept' ? 'verified' : review.verdict === 'dispute' ? 'disputed' : 'unverified'; judgment = review.verdict;
      trainCalCounts[review.verdict === 'review-unavailable' ? 'unavailable' : review.verdict]++;
    } else {
      const review = test.get(row.id); need(review !== undefined); test.delete(row.id);
      fields(review, ['id', 'judgment'], ['initialPrimaryOpen', 'followupOperations', 'rationale', 'formatJudgment']);
      need(['accept-scoped-label', 'dispute-scoped-label', 'review-access-unavailable'].includes(review.judgment));
      status = review.judgment === 'accept-scoped-label' ? 'verified' : review.judgment === 'dispute-scoped-label' ? 'disputed' : 'unverified'; judgment = review.judgment;
      const challenge = CHALLENGES[row.id];
      if (challenge) need(review.formatJudgment === challenge[2], 'PANEL_FORMAT');
      else need(!own(review, 'formatJudgment'));
      if (MISSING.includes(row.id)) {
        const last = final.get(row.id), other = cross.get(row.id);
        need(status === 'unverified' && last.selectedUrl === row.publicUrl && last.finalReportedUrl === null && last.disposition === 'unavailable-verification' && last.goldStatus === 'unverified' && last.proposedGoldAccepted === false);
        need(last.retrievalStatus === (row.id === MISSING[0] ? 'tool-inaccessible' : 'tool-fetch-timeout') && typeof last.sourceReference === 'string' && last.sourceReference.length > 0);
        need(other.publicUrl === row.publicUrl && other.verdict === 'review-unavailable' && other.nativeAvailabilityConclusion === 'not-established' && other.goldAcceptedByThisCrossReview === false && other.primaryOpensUsedFromFollowupAllowance === 1);
      } else need(status !== 'unverified');
    }
    labelCounts[status]++;
    row.labelStatus = status; row.assessmentGold = status === 'verified' ? { kind: row.proposedGold.kind, path: [...row.proposedGold.path] } : null;
    row.labelReview = { source: row.split === 'test' ? 'testReview' : 'trainCalReview', judgment, finalReview: MISSING.includes(row.id) ? 'unavailable-verification' : null };
    row.formatState = !row.challengeClass ? 'not-a-challenge' : row.id === 'adr159-test-144' ? 'fact-panels-read-more-native-interaction-unverified' : row.id === 'adr159-test-170' ? 'cached-expansion-only-current-format-unverified' : 'declared-format-native-unobserved';
    row.formatJudgment = row.challengeClass ? CHALLENGES[row.id][2] : null;
    row.formatEvidence = row.id === 'adr159-test-170' ? { kind: 'publisher-map-expansion-prompt', observedOnPublicUrl: ALIAS, redirectedToCanonical: true, evidenceFreshness: 'cached-only-current-unverified' } : null;
    row.rights = 'not-observed'; row.nativeAvailability = 'not-observed';
    if (row.referenceAnnotation) row.referenceProvenance = { source: 'trainCalReview', caseId: row.id, labelStatus: status, usableAsVerifiedReference: status === 'verified' };
  }
  need(tc.size === 0 && test.size === 0);
  for (const [k, n] of Object.entries(trainCalCounts)) need(r.summary[k] === n);
  need(r.summary.allFixedCasesRetained === true && r.summary.labelsRemainProposed === true);
  need(f.summary.selectedCohort === 168 && f.summary.training === 48 && f.summary.calibration === 48 && f.summary.test === 72 && f.summary.verifiedLabels === labelCounts.verified && f.summary.unverifiedTestLabels === 2 && f.summary.newlyVerifiedLabels === 0 && f.summary.disputes === labelCounts.disputed);
  need(t.independentCrossReview.unverifiedLabelsRemain === 2 && t.independentCrossReview.automaticReplacement === false && t.independentCrossReview.rootRowsAndOperationsNotRewritten === true);
  result.counts.labelStatus = labelCounts;
}

export function createSpecificityPanel(expectedPins) {
  const expected = envelope(expectedPins);
  for (const k of KEYS) need(expected[k].length === 64 && /^[0-9a-f]{64}$/u.test(expected[k]), 'PANEL_PIN');
  return Object.freeze({ validate(input) {
    const texts = envelope(input); let bytes = 0;
    for (const k of KEYS) { need(texts[k].length <= LIMITS.sourceBytes, 'PANEL_BYTES'); unicode(texts[k]); const n = Buffer.byteLength(texts[k], 'utf8'); need(n <= LIMITS.sourceBytes, 'PANEL_BYTES'); bytes += n; }
    need(bytes <= LIMITS.aggregateBytes, 'PANEL_BYTES');
    const actual = Object.fromEntries(KEYS.map(k => [k, hash(texts[k])]));
    // No parse, including malformed earlier sources, until ALL five hashes exist
    // and match the independently supplied expected pins.
    need(KEYS.every(k => actual[k] === expected[k]), 'PANEL_AUTH');
    const shared = { values: 0 }, parsed = Object.fromEntries(KEYS.map(k => [k, parse(texts[k], shared)]));
    const data = Object.fromEntries(KEYS.map(k => [k, parsed[k].data]));
    const result = cohort(data.candidates); const subsections = bindings(texts, parsed, actual); reviews(data, result);
    const projection = { schema: 'hierarchy-native-specificity-panel/v1', cases: result.rows, counts: result.counts,
      sourceDigests: { expected: { ...expected }, actual, ...subsections },
      taxonomy: { roots: [...ROOTS], parents: { ...PARENTS }, unionNodeCount: 25, goldScope: SCOPE },
      assessmentPolicy: { ...POLICY }, limitations: { historicalExclusionCoverage: 'incomplete', familyAndEntityIndependence: 'not-established', nativeFormats: 'conditional-unobserved', outsideAllRootsClaim: false },
      fullyReviewedGoldReady: false, nativeReady: false, modelReady: false, productionValidated: false, assignmentAuthority: false };
    projection.panelIdentity = hash(JSON.stringify(projection));
    need(Buffer.byteLength(JSON.stringify(projection), 'utf8') <= LIMITS.outputBytes, 'PANEL_OUTPUT');
    return freeze(projection);
  } });
}
