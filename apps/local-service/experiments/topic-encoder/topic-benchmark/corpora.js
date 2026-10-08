import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { readCdecArchive } from '../next-eval/cdec-archive.js';

const LUNA_SHA = Object.freeze({
  train: '2f229a606e9eaad34eb35a6b908d3f3321ba825da8a1e68494f6710f0dd89d27',
  validation: '71bd27e34e48ccc239199559e0fe61c5de556860e9fde74d20f3fd27439cdd3e',
  test: '9cd55f9431bb916c6ba2d4d5d3bd23fe3f233950e266a91889b7d71c3c94a433',
  challenge: '3037887840d52e38c397eea20d0032d8c77343bb146a6ad65c69db890d804006',
});
const CDEC_SHA = '7d5b1790145fc0603913aa24b60ce1bd8104196191289363fb6e2eb73c8d346d';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export async function loadLuna() {
  const splits = {};
  const seen = new Set(), familySplit = new Map();
  for (const [split, sha] of Object.entries(LUNA_SHA)) {
    const bytes = await readFile(new URL(`../luna-corpus/${split}.jsonl`, import.meta.url));
    if (bytes.length > 512 * 1024 || digest(bytes) !== sha) throw new Error(`Frozen Luna ${split} mismatch`);
    const rows = bytes.toString('utf8').trim().split(/\r?\n/u).map(line => JSON.parse(line));
    for (const row of rows) {
      if (typeof row.id !== 'string' || !row.id || seen.has(row.id) ||
          typeof row.topicLabel !== 'string' || !row.topicLabel ||
          typeof row.family !== 'string' || !row.family ||
          typeof row.title !== 'string' || !row.title ||
          typeof row.body !== 'string' || !row.body ||
          typeof row.viewpoint !== 'string' || !row.viewpoint) throw new Error('Invalid Luna row');
      seen.add(row.id);
      if (familySplit.has(row.family) && familySplit.get(row.family) !== split)
        throw new Error('Luna family leaked across splits');
      familySplit.set(row.family, split);
    }
    splits[split] = rows;
  }
  if (splits.train.length !== 80 || splits.validation.length !== 20 ||
      splits.test.length !== 20 || splits.challenge.length !== 56)
    throw new Error('Unexpected frozen Luna inventory');
  return splits;
}

export async function loadCdecTestIfAvailable() {
  const url = new URL('../.work/cdec-wn-dataset.tar.gz', import.meta.url);
  if (!existsSync(url)) return null;
  const bytes = await readFile(url);
  if (bytes.length !== 573230 || digest(bytes) !== CDEC_SHA) throw new Error('CDEC archive mismatch');
  const files = readCdecArchive(bytes);
  const inventory = files.get('dataset_splits/test_subtopics.txt')?.toString('utf8').trim().split(/\r?\n/u);
  if (!inventory || inventory.length !== 15 ||
      inventory.some(line => !/^\d+(?: \d+){2,3}$/u.test(line))) throw new Error('Unexpected CDEC test inventory');
  const documents = [];
  for (let group = 0; group < inventory.length; group++) {
    for (const id of inventory[group].split(' ')) {
      const source = JSON.parse(files.get(`dataset_docs/${id}.json`)?.toString('utf8') ?? 'null');
      if (typeof source?.text !== 'string' || source.text.length < 100 || source.text.length > 100000)
        throw new Error('Invalid CDEC document');
      const title = source.text.split(/\r?\n/u, 1)[0].trim();
      if (!title || title.length > 200) throw new Error('Invalid CDEC title');
      documents.push({ id: `cdec-${id}`, family: 'CDEC-WN-disaster-storylines',
        topicLabel: `CDEC-WN-test-storyline-${group}`, viewpoint: null,
        title, body: source.text.slice(0, 4096),
        url: `https://en.wikinews.org/wiki/benchmark-${id}` });
    }
  }
  if (documents.length !== 48 || new Set(documents.map(row => row.id)).size !== 48)
    throw new Error('Unexpected CDEC test documents');
  return documents;
}
