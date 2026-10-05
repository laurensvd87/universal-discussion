import assert from 'node:assert/strict';
import test from 'node:test';
import { collectPageContent } from '../../../../spikes/topic-resolution/browser/chromium/page-content-reader.js';
import { MODEL_ID } from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';
import { captureOne, pilotUrl, validatePilotMetadata } from './capture.js';
import { makeEvidence, ACCEPT_RATIONALE } from './evidence.js';

const URL = 'https://en.wikinews.org/wiki/Synthetic_public_article';
const metadata = { requestedUrl: URL, finalUrl: URL, publicationValue: '2024-02-12', publicationPrecision: 'day',
  publisher: 'Wikinews', rightsEvidenceUrl: 'https://en.wikinews.org/wiki/Wikinews:Copyright',
  accessedAt: '2026-10-05T12:00:00Z', evidence: makeEvidence({ sourceUrl: URL,
    metadataOriginUrl: URL, rightsEvidenceUrl: 'https://en.wikinews.org/wiki/Wikinews:Copyright',
    rightsEvidenceObservedAt: new Date().toISOString(), licenseId: 'CC-BY-4.0',
    rightsBasis: 'site-policy-and-page-notice', titleRights: 'permitted',
    publisherOriginality: 'publisher-original', attributionUrl: URL,
    disposition: 'accepted', rationale: ACCEPT_RATIONALE }) };
function node(tagName, children = []) {
  const element = { nodeType: 1, tagName, hidden: false, inert: false, isContentEditable: false,
    getAttribute: () => null, firstChild: children[0] ?? null,
    firstElementChild: children.find(child => child.nodeType === 1) ?? null };
  children.forEach((child, index) => { child.nextSibling = children[index + 1] ?? null; });
  return element;
}
function text(value) { return { nodeType: 3, length: value.length, substringData: (start, length) => value.slice(start, start + length) }; }
function readerFixture() {
  const head = node('HEAD', [node('TITLE', [text('Synthetic public article')])]);
  const html = node('HTML', [head, node('BODY', [node('MAIN', [node('P', [text('Public invented article passage.')])])])]);
  const originals = new Map();
  for (const [key, value] of Object.entries({ location: { href: URL }, top: globalThis,
    document: { head, documentElement: html }, getComputedStyle: () => ({ display: 'block', visibility: 'visible', contentVisibility: 'visible', fontSize: '16px', opacity: '1' }) })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  try { return collectPageContent(URL); }
  finally { for (const [key, original] of originals) {
    if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key];
  } }
}
const embed = async () => ({ modelId: MODEL_ID, values: [1, ...Array(383).fill(0)] });

test('exact HTTPS host allowlist and URL shape', () => {
  assert.equal(pilotUrl(URL), URL);
  for (const url of ['http://en.wikinews.org/wiki/a', 'https://en.wikinews.org.evil.example/wiki/a',
    'https://globalvoices.org/', 'https://www.voanews.com/a/story?token=abc',
    'https://user@globalvoices.org/a', 'https://globalvoices.org:444/a']) {
    assert.throws(() => pilotUrl(url));
  }
});

test('day precision preserves a source date and instant precision requires a real UTC time', () => {
  const base = { requestedUrl: URL, publisher: 'Wikinews',
    rightsEvidenceUrl: 'https://en.wikinews.org/wiki/Wikinews:Copyright' };
  assert.equal(validatePilotMetadata({ ...base, publicationValue: '2022-02-24', publicationPrecision: 'day' }), URL);
  assert.equal(validatePilotMetadata({ ...base, publicationValue: '2022-02-24T13:14:15Z', publicationPrecision: 'instant' }), URL);
  assert.throws(() => validatePilotMetadata({ ...base, publicationValue: '2022-02-24', publicationPrecision: 'instant' }));
  assert.throws(() => validatePilotMetadata({ ...base, publicationValue: '2024-02-31', publicationPrecision: 'day' }));
});

test('production reader fixture yields only permitted record fields and digest', async () => {
  const captured = readerFixture();
  assert.equal(captured.status, 'collected');
  const record = await captureOne({ ...metadata, reader: async () => captured, embed });
  assert.equal(record.vector.length, 384);
  assert.equal(record.extractorVersion, 'main-text-prefix/v1');
  assert.match(record.inputSha256, /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(record).includes('invented article passage'), false);
  assert.equal(record.publicationValue, '2024-02-12');
  assert.equal(record.publicationPrecision, 'day');
  assert.deepEqual(Object.keys(record).sort(), ['accessedAt', 'extractorVersion', 'inputSha256', 'language',
    'modelId', 'publicationValue', 'publicationPrecision', 'publisher', 'evidence', 'evidenceSha256', 'rightsEvidenceUrl', 'schema', 'title', 'url', 'vector'].sort());
});

test('redirects, invalid provenance and wrong model abstain before record creation', async () => {
  const captured = readerFixture();
  await assert.rejects(captureOne({ ...metadata, finalUrl: 'https://en.wikinews.org/wiki/other',
    reader: async () => captured, embed }));
  await assert.rejects(captureOne({ ...metadata, publicationValue: '2019-01-01',
    reader: async () => captured, embed }));
  await assert.rejects(captureOne({ ...metadata, publisher: 'Global Voices', reader: async () => captured, embed }));
  await assert.rejects(captureOne({ ...metadata, reader: async () => captured,
    embed: async () => ({ modelId: 'wrong', values: Array(384).fill(0) }) }));
});
