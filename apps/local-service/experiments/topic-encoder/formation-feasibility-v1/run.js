import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { development, singletons } from './development.js';
import { embedDocuments } from '../e5-infer.js';
import { readInstalledOwnerTopicConfiguration } from '../../../src/application/owner-topic-configuration.js';
import { createRidgeTopicTransform, RIDGE_PARAMETER_SHA256 } from '../../../src/domain/ridge-topic-adapter.js';

const here = new URL('./', import.meta.url), hash = value => createHash('sha256').update(value).digest('hex');
const mode = process.argv[2];
if (!['--freeze', '--embed'].includes(mode) || process.argv.length !== 3) throw Error('Use --freeze or --embed');
const protocol = JSON.parse(await readFile(new URL('protocol.json', here), 'utf8'));
// Read the independent author's exact original UTF-8 bytes directly; no
// PowerShell text decoding or duplicated corpus file enters the experiment.
const holdoutName = '../../../../../spikes/topic-resolution/formation-feasibility-v1/heldout.json';
const holdoutBytes = await readFile(new URL(holdoutName, here));
if (holdoutBytes.length > 131072) throw Error('Heldout file exceeds bound');
const holdout = JSON.parse(holdoutBytes);
if (!Array.isArray(holdout) || holdout.length !== 36) throw Error('Expected 36 independently authored holdout records');
const rows = [...development, ...holdout, ...singletons];
if (rows.length > protocol.maxTexts || new Set(rows.map(row => row.id)).size !== rows.length) throw Error('Invalid corpus count');
for (const row of rows) {
  if (Object.keys(row).sort().join(',') !== 'body,family,id,lang,split,title,topic' ||
      Object.values(row).some(value => typeof value !== 'string' || !value.trim()) ||
      row.title.length > 200 || row.body.length > 1600) throw Error('Invalid synthetic row');
}
const sourceNames = ['protocol.json','development.js',holdoutName,'requirements.txt','run.js','measure.py','supervise.py',
  '../e5-infer.js','../../../src/domain/ridge-topic-adapter.js',
  '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js'];
const sourceHashes = {};
for (const name of sourceNames) {
  const filename = new URL(name, here), info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 1048576) throw Error('Invalid source');
  sourceHashes[name] = hash(await readFile(filename));
}
const descriptor = { schema:protocol.schema, sources:sourceHashes, corpusSha256:hash(JSON.stringify(rows)),
  rowCount:rows.length, development:development.length, independentHoldout:holdout.length, singletons:singletons.length };
const freezeHash = hash(JSON.stringify(descriptor));
if (mode === '--freeze') {
  await writeFile(new URL('freeze.json',here), JSON.stringify({ ...descriptor, freezeHash },null,2)+'\n', { flag:'wx' });
  process.stdout.write(JSON.stringify({ stage:'frozen',freezeHash,...descriptor })+'\n');
} else {
  const frozen = JSON.parse(await readFile(new URL('freeze.json',here),'utf8'));
  if (frozen.freezeHash !== freezeHash) throw Error('Preregistration differs; no inference permitted');
  const { alternateRidgeAdapter: adapter } = readInstalledOwnerTopicConfiguration();
  if (!adapter || adapter.parameterSha256 !== protocol.ridgeParameterSha256 || adapter.parameterSha256 !== RIDGE_PARAMETER_SHA256)
    throw Error('Pinned Ridge artifact unavailable');
  const transform = createRidgeTopicTransform(adapter);
  const started = performance.now();
  let maxRss = process.memoryUsage().rss;
  const timer = setInterval(() => {
    const rss = process.memoryUsage().rss;
    maxRss = Math.max(maxRss,rss);
    if (rss > protocol.budget.maxProcessRssMiB*1048576 || os.freemem() < protocol.budget.minSystemAvailableMiB*1048576 ||
        performance.now()-started > protocol.budget.maxWallSeconds*1000) {
      process.stderr.write('Research resource budget exceeded\n'); process.exit(3);
    }
  },100);
  const vectors = {}, timing = {};
  try {
    for (const input of protocol.inputs) {
      const documents = rows.map(row => ({...row,body:input==='body-prefix-4096' ? row.body : `${row.title}\n${row.body.normalize('NFKC').replace(/\s+/gu,' ').slice(0,384)}`}));
      process.stdout.write(JSON.stringify({stage:'embedding-start',input,count:rows.length})+'\n');
      const result = await embedDocuments(documents,'body');
      timing[input] = { elapsedMs:result.elapsedMs,assets:result.assets };
      vectors[input] = { 'raw-e5':rows.map(row => Array.from(result.vectors.get(row.id))),
        'pinned-ridge1':rows.map(row => Array.from(transform(result.vectors.get(row.id)))) };
      process.stdout.write(JSON.stringify({stage:'embedding-complete',input,elapsedMs:result.elapsedMs,rss:process.memoryUsage().rss})+'\n');
      globalThis.gc?.();
    }
    maxRss = Math.max(maxRss,process.memoryUsage().rss);
    await mkdir(new URL('output/',here),{recursive:true});
    await writeFile(new URL('output/vectors.json',here),JSON.stringify({schema:protocol.schema,freezeHash,
      rows:rows.map(({title,body,...row})=>row),vectors,timing,
      embeddingResources:{wallMs:performance.now()-started,maxRssBytes:maxRss,resourceUsage:process.resourceUsage()},
      ridgeParameterSha256:adapter.parameterSha256}),{flag:'wx'});
    process.stdout.write(JSON.stringify({stage:'vectors-ready',freezeHash,maxRssBytes:maxRss})+'\n');
  } finally { clearInterval(timer); }
}
