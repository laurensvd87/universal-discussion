// Read-only external-data check. CDEC-WN is a CC BY 4.0 Wikinews research
// corpus; no article text, URL, vector, or individual label is printed/saved.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { embedDocuments } from '../e5-infer.js';
import { encodePage } from '../next-model/model.js';
import { encodeLearnedPage } from '../next-model/learned.js';
import { encodeRealPage } from '../real-model/model.js';
import { evaluateVectors } from './metrics.js';
import { readCdecArchive } from './cdec-archive.js';

const ARCHIVE_SHA256 = '7d5b1790145fc0603913aa24b60ce1bd8104196191289363fb6e2eb73c8d346d';
const MODEL_SHA256 = 'f5f046c6f447dc2d3ebd680bd9131fa421d03a5338698ca4a0e43dbfb3857b5d';
const REAL_MODEL_SHA256 = 'b0b803608a21d810c9342fcf2c52893772361fb139d12679420dc4ef9c24b9e7';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function loadSplit(files, name, expectedGroups, offset) {
  const inventory = files.get(`dataset_splits/${name}_subtopics.txt`);
  if (!inventory) throw new Error('Missing research split');
  const rows = inventory.toString('utf8')
    .trim().split(/\r?\n/u);
  if (rows.length !== expectedGroups || rows.some(row => !/^\d+(?: \d+){2,3}$/u.test(row)))
    throw new Error('Unexpected research split');
  const groups = rows.map(row => row.split(' '));
  const ids = groups.flat();
  if (new Set(ids).size !== ids.length)
    throw new Error('Unexpected research document inventory');
  const documents = [];
  for (let group = 0; group < groups.length; group++) for (const id of groups[group]) {
    const bytes = files.get(`dataset_docs/${id}.json`);
    if (!bytes) throw new Error('Missing research document');
    const raw = bytes.toString('utf8');
    if (raw.length > 100000) throw new Error('Oversize research document');
    const source = JSON.parse(raw);
    if (typeof source.text !== 'string' || source.text.length < 100 || source.text.length > 100000)
      throw new Error('Invalid research document');
    const firstLine = source.text.split(/\r?\n/u, 1)[0].trim();
    if (!firstLine || firstLine.length > 200) throw new Error('Invalid research title');
    documents.push({ id, family:'CDEC-WN-disaster-storylines',
      topicLabel:`CDEC-WN-subtopic-${offset + group}`, viewpoint:'not-labeled',
      title:firstLine, body:source.text.slice(0,4096) });
  }
  return documents;
}

async function main() {
  if (process.argv.length !== 2) throw new Error('No arguments accepted');
  const archive = await readFile(new URL('../.work/cdec-wn-dataset.tar.gz', import.meta.url));
  if (archive.length !== 573230 || digest(archive) !== ARCHIVE_SHA256)
    throw new Error('Research archive integrity mismatch');
  const files = readCdecArchive(archive);
  const artifactText = await readFile(new URL('../next-model/model.generated.json', import.meta.url), 'utf8');
  if (digest(artifactText) !== MODEL_SHA256) throw new Error('Frozen model mismatch');
  const artifact = JSON.parse(artifactText);
  const realModelText = await readFile(new URL('../real-model/model.generated.json', import.meta.url), 'utf8');
  if (digest(realModelText) !== REAL_MODEL_SHA256) throw new Error('Frozen real-language model mismatch');
  const realModel = JSON.parse(realModelText);
  const test = await loadSplit(files,'test',15,0);
  const train = await loadSplit(files,'train',40,15);
  const docs = [...test,...train];
  if (test.length !== 48 || docs.length !== 176 ||
      new Set(docs.map(d => d.id)).size !== docs.length)
    throw new Error('Research inventory mismatch');
  const { vectors: body, assets } = await embedDocuments(docs, 'body');
  const { vectors: titleLead } = await embedDocuments(docs, 'title-lead');
  if (assets.modelSha256 !== artifact.baseModelSha256) throw new Error('Base model mismatch');
  if (assets.modelSha256 !== realModel.baseModelSha256) throw new Error('Real-language base model mismatch');
  const methods = {
    'raw-e5-body': body,
    'raw-e5-title-lead': titleLead,
    'frozen-heuristic': new Map(docs.map(d => [d.id, encodePage(d, body.get(d.id), artifact.features)])),
    'frozen-learned': new Map(docs.map(d => [d.id, encodeLearnedPage(d, body.get(d.id), artifact)])),
    'frozen-real-dual-view': new Map(docs.map(d => [d.id,
      encodeRealPage(d, body.get(d.id), titleLead.get(d.id), realModel)])),
  };
  const results = {};
  for (const [name, vectors] of Object.entries(methods)) {
    results[name] = {};
    for (const [scope, pages] of [['test-only',test],['full-gallery',docs]]) {
      const { documents, dimensions, positives, hardNegatives, matchedQueries,
        top1, top3, hardPairAuc } = evaluateVectors(pages, vectors);
      results[name][scope] = { documents, dimensions, sameStorylinePairs:positives,
        otherStorylinePairs:hardNegatives, matchedQueries, top1, top3,
        allOtherStorylinePairAuc:hardPairAuc };
    }
  }
  process.stdout.write(`${JSON.stringify({ dataset:'CDEC-WN CC BY 4.0',
    source:'https://github.com/adithya7/cdec-wikinews', archiveSha256:ARCHIVE_SHA256,
    testSubtopics:15, fullSubtopics:55, realModelSha256:REAL_MODEL_SHA256, results }, null, 2)}\n`);
}

main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode=1; });
