// Pure file-identity recipe, not producer authentication or a freshness grant.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { types } from 'node:util';

const BASE = 'spikes/topic-resolution/harness/current-producer-final-v2/';
const COMMON = Object.freeze([
  BASE + 'run.mjs', BASE + 'policy.js', BASE + 'manifest.js', BASE + 'supervise.py', BASE + 'protocol.json',
  'spikes/topic-resolution/browser/core/page-content-policy.js',
  'apps/local-service/src/crawler/public-fetch.js',
  'apps/local-service/src/crawler/robots.js',
  'apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js',
  'spikes/topic-resolution/harness/current-producer-final-v2/producer-profiles.js',
]);
export const TARGET_PRODUCER_SOURCE_KEYS = Object.freeze([
  ...COMMON,
  'apps/local-service/src/crawler/static-capture.js',
  'spikes/topic-resolution/browser/chromium/page-content-reader.js',
]);
const HEX = /^[a-f0-9]{64}$/u;
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function checkedHashes(value) {
  assert.ok(value && typeof value === 'object' && !types.isProxy(value) &&
    Object.getPrototypeOf(value) === Object.prototype);
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...TARGET_PRODUCER_SOURCE_KEYS].sort());
  const copy = {};
  for (const name of TARGET_PRODUCER_SOURCE_KEYS) {
    const d = Object.getOwnPropertyDescriptor(value, name);
    assert.ok(d?.enumerable && Object.hasOwn(d, 'value'));
    assert.equal(typeof d.value, 'string'); assert.match(d.value, HEX);
    copy[name] = d.value;
  }
  return copy;
}

/** Caller must hash/parse the same bounded buffers and recheck them at delivery.
 * No source paths, freeze paths, model artifacts or browser state are read here.
 * Selection receipt and collector freeze intentionally do not enter this recipe:
 * each binds these computed profiles separately, without a circular byte hash.
 */
export function buildTargetProducerProfiles(input) {
  const hashes = checkedHashes(input);
  const make = (producerId, extractorVersions, extraSource, observation) => {
    const construction = {
      schema: 'current-producer-target-construction/v2', producerId,
      sourceHashes: Object.fromEntries([...COMMON, extraSource].map(name => [name, hashes[name]])),
      extractorVersions,
      preprocessing: 'none-no-metadata-pruning-no-prose-lead-no-title-only-rescue',
      pagePolicy: 'own-origin-robots-tdm-and-own-page-headers-dom-before-input-retention/v1',
      observation,
      scope: 'file-identity-recipe-not-runtime-attestation-freshness-rights-or-canonical-authority',
    };
    const body = {
      schema: 'root-rank-target-producer-profile/v1', producerId,
      inputConstructionHash: sha(construction), extractorVersions,
    };
    return { construction, profile: { ...body, producerProfileHash: sha(body) } };
  };
  const staticProducer = make('current-static', ['crawler-static-html-prefix/v1'],
    'apps/local-service/src/crawler/static-capture.js', { kind: 'single-bounded-static-response' });
  const browserProducer = make('browser-current', ['article-container-prefix/v1', 'main-text-prefix/v1'],
    'spikes/topic-resolution/browser/chromium/page-content-reader.js', {
      kind: 'single-main-document-snapshot', afterMatchingDclMs: 2000,
      absoluteArticleLeaseMs: 20000, latestMatchingDclMs: 18000,
      responseFrameLoaderAndDomChecks: true, nativeExtensionAttestation: false,
      producerScope: 'restricted-single-document-dom-reader/v1',
      externalResources: 'blocked-all-non-Document-requests-no-cross-document-navigation',
      inlineScriptsMayExecute: true, ordinaryDynamicBrowserProducerValidated: false,
    });
  return freeze({
    schema: 'current-producer-target-profile-set/v2',
    targetProfiles: [staticProducer.profile, browserProducer.profile],
    constructions: [staticProducer.construction, browserProducer.construction],
    recipeHash: sha([staticProducer.construction, browserProducer.construction]),
    productionValidated: false, assignmentAuthority: false,
  });
}
