import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { MODEL_ID } from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';
import { ACCEPT_RATIONALE, makeEvidence } from './evidence.js';
import { freezeOwnerReview, loadFrozenOwnerReview, prepareOwnerReview, renderOwnerReview } from './owner-review.js';

const sha = value => createHash('sha256').update(value).digest('hex');
const work = fileURLToPath(new URL('../../../../spikes/topic-resolution/review/work/', import.meta.url));
function fixture(count = 6) {
  const entries = Array.from({ length: count }, (_, index) => {
    const url = `https://en.wikinews.org/wiki/Invented_${index}`;
    const evidence = makeEvidence({ sourceUrl: url, metadataOriginUrl: url,
      rightsEvidenceUrl: 'https://en.wikinews.org/wiki/Wikinews:Copyright',
      rightsEvidenceObservedAt: '2026-10-05T12:00:00Z', licenseId: 'CC-BY-4.0',
      rightsBasis: 'site-policy-and-page-notice', titleRights: 'permitted',
      publisherOriginality: 'publisher-original', attributionUrl: url,
      disposition: 'accepted', rationale: ACCEPT_RATIONALE });
    const record = { schema: 'r5-pilot-source/v1', url, title: `Invented title ${index}`,
      publicationValue: '2022-02-24', publicationPrecision: 'day', language: 'en',
      publisher: 'Invented publisher', accessedAt: '2026-10-05T12:00:00Z',
      rightsEvidenceUrl: evidence.record.rightsEvidenceUrl, evidence: evidence.record,
      evidenceSha256: evidence.sha256, extractorVersion: 'main-text-prefix/v1',
      modelId: MODEL_ID, inputSha256: sha('synthetic input'), vector: Array(384).fill(0) };
    return { filename: `${String(index).padStart(8, '0')}-0000-0000-0000-000000000000.json`,
      bytes: JSON.stringify(record) };
  });
  const digest = sha(JSON.stringify(entries.map(({ filename, bytes }) =>
    ({ id: filename.slice(0, -5), sha256: sha(bytes) }))));
  return { entries, inventory: { schema: 'r5-pilot-inventory/v1', count, sha256: digest,
    updatedAt: '2026-10-05T12:00:00Z' } };
}

test('owner pilot has deterministic opaque pairs and a metadata-only view', () => {
  const { entries, inventory } = fixture();
  const task = prepareOwnerReview(entries, inventory);
  assert.deepEqual(task, prepareOwnerReview([...entries].reverse(), inventory));
  assert.equal(task.sources.length, 6);
  assert.equal(task.pairs.length, 15);
  assert.equal(task.inventorySha256, inventory.sha256);
  assert.ok(task.sources.every(source => /^[a-f0-9]{64}$/u.test(source.sourceSha256)));
  const view = renderOwnerReview(task);
  assert.match(view, /review-item-001/u);
  assert.match(view, /Invented title 0/u);
  for (const secret of ['sourceSha256', 'inventorySha256', 'vector', 'modelId',
    'rightsEvidenceUrl', 'inputSha256', 'caseType', 'cosine']) assert.equal(view.includes(secret), false);
  assert.equal(view.match(/Label: /gu)?.length, 15);
  assert.match(view, /72-hour window is a review presumption, not proof/u);
});

test('30 pair cap and inventory binding reject changed or extra Source files', () => {
  const { entries, inventory } = fixture(9);
  assert.equal(prepareOwnerReview(entries, inventory).pairs.length, 30);
  assert.throws(() => prepareOwnerReview(entries.slice(1), inventory), /inventory/u);
  const changed = structuredClone(entries);
  changed[0].bytes = changed[0].bytes.replace('Invented title 0', 'Different title');
  assert.throws(() => prepareOwnerReview(changed, inventory), /digest mismatch/u);
});

test('invalid evidence and unexpected fields cannot enter owner view', () => {
  const { entries, inventory } = fixture();
  const changed = structuredClone(entries);
  const record = JSON.parse(changed[0].bytes);
  record.extra = 'article text';
  changed[0].bytes = JSON.stringify(record);
  const rebound = { ...inventory, sha256: sha(JSON.stringify(changed.map(({ filename, bytes }) =>
    ({ id: filename.slice(0, -5), sha256: sha(bytes) })))) };
  assert.throws(() => prepareOwnerReview(changed, rebound), /Invalid accepted/u);
  const bad = structuredClone(entries);
  const evidenceRecord = JSON.parse(bad[0].bytes);
  evidenceRecord.evidence.titleRights = 'unclear';
  bad[0].bytes = JSON.stringify(evidenceRecord);
  assert.throws(() => prepareOwnerReview(bad, inventory), /evidence|Acceptance/u);
});

test('frozen task is create-only and survives later capture without changing pair IDs', async () => {
  const base = await mkdtemp(path.join(work, 'r5-owner-test-'));
  try {
    await writeFile(path.join(base, '.gitignore'), '*\n!.gitignore\n', { flag: 'wx' });
    await assert.rejects(loadFrozenOwnerReview(base), /ENOENT/u);
    const first = fixture(6), task = prepareOwnerReview(first.entries, first.inventory);
    await freezeOwnerReview(task, base);
    await assert.rejects(freezeOwnerReview(task, base), /EEXIST/u);
    const later = fixture(7);
    assert.notDeepEqual(prepareOwnerReview(later.entries, later.inventory), task);
    assert.deepEqual(await loadFrozenOwnerReview(base), task);
    assert.equal(renderOwnerReview(await loadFrozenOwnerReview(base)), renderOwnerReview(task));
  } finally {
    if (path.resolve(path.dirname(base)) !== path.resolve(work) || !path.basename(base).startsWith('r5-owner-test-'))
      throw new Error('Synthetic cleanup target invalid');
    await rm(base, { recursive: true, force: true });
  }
});

test('tampered frozen task or digest is refused', async () => {
  const base = await mkdtemp(path.join(work, 'r5-owner-test-'));
  try {
    await writeFile(path.join(base, '.gitignore'), '*\n!.gitignore\n', { flag: 'wx' });
    const { entries, inventory } = fixture();
    await freezeOwnerReview(prepareOwnerReview(entries, inventory), base);
    const filename = path.join(base, 'r5-owner-review', 'task.json');
    const original = await readFile(filename, 'utf8');
    const altered = JSON.parse(original);
    altered.task.sources[0].title = 'Altered title';
    await writeFile(filename, JSON.stringify(altered));
    await assert.rejects(loadFrozenOwnerReview(base), /digest mismatch/u);
    await writeFile(filename, original);
    assert.equal((await loadFrozenOwnerReview(base)).sources.length, 6);
  } finally {
    if (path.resolve(path.dirname(base)) !== path.resolve(work) || !path.basename(base).startsWith('r5-owner-test-'))
      throw new Error('Synthetic cleanup target invalid');
    await rm(base, { recursive: true, force: true });
  }
});
