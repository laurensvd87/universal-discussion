import assert from 'node:assert/strict';
import test from 'node:test';
import { MODEL_ID } from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';
import { ACCEPT_RATIONALE } from './evidence.js';
import { parseArguments, runOneUrl } from './one-url.js';
import { savePilotRecord } from './save-record.js';

const url = 'https://en.wikinews.org/wiki/Synthetic_article';
const args = ['--url', url, '--published', '2024-01-03', '--publication-precision', 'day', '--publisher', 'Wikinews',
  '--rights-url', 'https://en.wikinews.org/wiki/Wikinews:Copyright', '--metadata-origin', url,
  '--evidence-at', new Date().toISOString(), '--license-id', 'CC-BY-4.0',
  '--rights-basis', 'site-policy-and-page-notice', '--title-rights', 'permitted',
  '--originality', 'publisher-original', '--attribution-url', url,
  '--disposition', 'accepted', '--rationale', ACCEPT_RATIONALE, '--english-reviewed'];

test('manual one-page rights and provenance arguments are required', () => {
  assert.equal(parseArguments(args)['--url'], url);
  assert.throws(() => parseArguments(args.slice(0, -1)));
  assert.throws(() => parseArguments(args.filter(item => item !== '--english-reviewed')));
  assert.throws(() => parseArguments([...args, '--url', url]));
  assert.throws(() => parseArguments([...args, '--unexpected']));
});

test('command passes only validated metadata and vector to output adapter', async () => {
  let record;
  const browser = async ({ url: requested }) => {
    assert.equal(requested, url);
    return { finalUrl: url, captured: { contractVersion: 'page-content/1', status: 'collected', url,
      title: 'Synthetic article', text: 'Invented article body for the local fixture.',
      extractorVersion: 'main-text-prefix/v1' },
    embedding: { modelId: MODEL_ID, values: [1, ...Array(383).fill(0)] } };
  };
  const result = await runOneUrl(args, { browser, save: async value => { record = value; }, check: async () => true });
  assert.deepEqual(result, { status: 'saved' });
  assert.equal(record.url, url);
  assert.equal(record.vector.length, 384);
  assert.match(record.evidenceSha256, /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(record).includes('Invented article body'), false);
});

test('rejected evidence records a rationale without opening Chrome', async () => {
  let record;
  const rejected = [...args];
  rejected[rejected.indexOf('--disposition') + 1] = 'rejected';
  rejected[rejected.indexOf('--rationale') + 1] = 'unclear-license';
  rejected[rejected.indexOf('--title-rights') + 1] = 'unclear';
  const result = await runOneUrl(rejected, { browser: async () => { throw new Error('browser called'); },
    save: async value => { record = value; }, check: async () => true });
  assert.deepEqual(result, { status: 'recorded' });
  assert.equal(record.schema, 'r5-pilot-rejection/v1');
  assert.equal(record.evidence.rationale, 'unclear-license');
});

test('output guard rejects extra fields before filesystem access', async () => {
  await assert.rejects(savePilotRecord({ schema: 'r5-pilot-source/v1', text: 'should never persist' }));
});
