import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { makeEvidence, ACCEPT_RATIONALE } from './evidence.js';
import { MODEL_ID } from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';
import { captureOne } from './capture.js';
import { checkPilotCapacity, savePilotRecord } from './save-record.js';

const work = fileURLToPath(new URL('../../../../spikes/topic-resolution/review/work/', import.meta.url));
function rejection(index) {
  const url = `https://en.wikinews.org/wiki/Synthetic_rejected_${index}`;
  const evidence = makeEvidence({ sourceUrl: url, metadataOriginUrl: url,
    rightsEvidenceUrl: 'https://en.wikinews.org/wiki/Wikinews:Copyright',
    rightsEvidenceObservedAt: new Date().toISOString(), licenseId: 'unknown',
    rightsBasis: 'site-policy-and-page-notice', titleRights: 'unclear',
    publisherOriginality: 'unclear', attributionUrl: url,
    disposition: 'rejected', rationale: 'unclear-license' });
  return { schema: 'r5-pilot-rejection/v1', url, evidence: evidence.record,
    evidenceSha256: evidence.sha256, accessedAt: new Date().toISOString() };
}

test('ignored inventory hashes records, rejects duplicate URLs and stops at 24', async () => {
  const base = await mkdtemp(path.join(work, 'r5-store-test-'));
  try {
    await writeFile(path.join(base, '.gitignore'), '*\n!.gitignore\n', { flag: 'wx' });
    const first = rejection(0);
    await savePilotRecord(first, base);
    await assert.rejects(savePilotRecord(first, base), /duplicate/i);
    await assert.rejects(checkPilotCapacity(first.url, base), /duplicate/i);
    for (let index = 1; index < 24; index++) await savePilotRecord(rejection(index), base);
    await assert.rejects(savePilotRecord(rejection(24), base), /capacity/i);
    const inventory = JSON.parse(await readFile(path.join(base, 'r5-pilot', 'inventory.json'), 'utf8'));
    assert.equal(inventory.count, 24);
    assert.match(inventory.sha256, /^[a-f0-9]{64}$/u);
  } finally {
    if (path.resolve(path.dirname(base)) !== path.resolve(work) || !path.basename(base).startsWith('r5-store-test-'))
      throw new Error('Synthetic cleanup target invalid');
    await rm(base, { recursive: true, force: true });
  }
});

test('accepted record saves with exact evidence digest and no article text', async () => {
  const base = await mkdtemp(path.join(work, 'r5-store-test-'));
  const url = 'https://en.wikinews.org/wiki/Synthetic_accepted';
  try {
    await writeFile(path.join(base, '.gitignore'), '*\n!.gitignore\n', { flag: 'wx' });
    const evidence = makeEvidence({ sourceUrl: url, metadataOriginUrl: url,
      rightsEvidenceUrl: 'https://en.wikinews.org/wiki/Wikinews:Copyright',
      rightsEvidenceObservedAt: new Date().toISOString(), licenseId: 'CC-BY-4.0',
      rightsBasis: 'site-policy-and-page-notice', titleRights: 'permitted',
      publisherOriginality: 'publisher-original', attributionUrl: url,
      disposition: 'accepted', rationale: ACCEPT_RATIONALE });
    const record = await captureOne({ requestedUrl: url, finalUrl: url,
      publicationValue: '2022-02-24', publicationPrecision: 'day', publisher: 'Wikinews',
      rightsEvidenceUrl: evidence.record.rightsEvidenceUrl, evidence,
      accessedAt: new Date().toISOString(), reader: async () => ({ contractVersion: 'page-content/1',
        status: 'collected', url, title: 'Invented article', text: 'Unique synthetic article prose.',
        extractorVersion: 'main-text-prefix/v1' }),
      embed: async () => ({ modelId: MODEL_ID, values: [1, ...Array(383).fill(0)] }) });
    await savePilotRecord(record, base);
    const directory = path.join(base, 'r5-pilot');
    const inventory = JSON.parse(await readFile(path.join(directory, 'inventory.json'), 'utf8'));
    assert.equal(inventory.count, 1);
    const saved = (await readdir(directory)).find(name => name !== 'inventory.json');
    const bytes = await readFile(path.join(directory, saved), 'utf8');
    assert.equal(bytes.includes('Unique synthetic article prose'), false);
    assert.equal(JSON.parse(bytes).evidenceSha256, evidence.sha256);
  } finally {
    if (path.resolve(path.dirname(base)) !== path.resolve(work) || !path.basename(base).startsWith('r5-store-test-'))
      throw new Error('Synthetic cleanup target invalid');
    await rm(base, { recursive: true, force: true });
  }
});
