// Offline owner-local title-signal diagnostic. No text, URL, vector or account is printed or saved.
import { DatabaseSync } from 'node:sqlite';
import { lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertValidPersistedState } from '../../../src/domain/persisted-state.js';
import { MAX_DOCUMENT_BYTES } from '../../../src/domain/repository-contract.js';
import { loadDiagonalAdapter, applyDiagonalAdapter } from '../../../src/domain/diagonal-adapter.js';
import { planAlternateTopics } from '../../../src/domain/alternate-topic-planner.js';
import { embedDocuments } from '../e5-infer.js';

const DB = fileURLToPath(new URL('../../../data/demo.sqlite', import.meta.url));
const ADAPTER = fileURLToPath(new URL('../../../data/diagonal-adapter-v1.json', import.meta.url));
const TRANSLATION_PATHS = ['/162864212.html', '/162449955.html'];
const MODEL = 'e5-small-q8-browser-main-prefix-v1';
const EXTRACTORS = new Set(['main-text-prefix/v1', 'article-container-prefix/v1']);
const LEARNED = 'owner-local-page-embedding/v1';
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const buckets = {
  spending: /\b(spending|expenditure|miljard|uitgaven|budget|financier|pompen)\b/iu,
  troops: /\b(troop|soldat\w*|strijdmacht|militairen|leger|army|soldier\w*)\b/iu,
  fountain: /\b(fountain|fontein|fontaine|brunnen)\b/iu,
  water: /water|wasser|aquatic|inlet|inlaat|einlauf/iu,
};

async function readState() {
  const info = await lstat(DB);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Invalid fixed database');
  const database = new DatabaseSync(DB, { readOnly: true });
  try {
    database.exec('PRAGMA query_only = ON');
    const rows = database.prepare('SELECT schema, generation, revision, document FROM demo_state WHERE singleton = 1').all();
    if (rows.length !== 1 || rows[0].schema !== 'demo-state/v2' ||
        typeof rows[0].document !== 'string' ||
        Buffer.byteLength(rows[0].document, 'utf8') > MAX_DOCUMENT_BYTES) throw new Error('Invalid snapshot');
    const state = JSON.parse(rows[0].document);
    if (state.schema !== rows[0].schema || state.generation !== rows[0].generation ||
        state.revision !== rows[0].revision) throw new Error('Inconsistent snapshot');
    assertValidPersistedState(state);
    return state;
  } finally { database.close(); }
}

function pairStats(rows, predicate) {
  const picked = rows.filter(row => predicate(row.a, row.b));
  const range = key => picked.length ? {
    minimum: +Math.min(...picked.map(row => row[key])).toFixed(4),
    maximum: +Math.max(...picked.map(row => row[key])).toFixed(4),
  } : null;
  return { pairs: picked.length, rawGrouped: picked.filter(row => row.rawGrouped).length,
    adapterGrouped: picked.filter(row => row.adapterGrouped).length,
    rawBodyCosine: range('rawBody'), adaptedBodyCosine: range('adaptedBody'),
    titleCosine: range('title'),
    groupedTitleCosine: picked.filter(row => row.adapterGrouped).length ?
      +Math.min(...picked.filter(row => row.adapterGrouped).map(row => row.title)).toFixed(4) : null };
}

async function main() {
  if (process.argv.length !== 2) throw new Error('No command-line options');
  const started = performance.now();
  const [state, adapter] = await Promise.all([readState(), loadDiagonalAdapter(ADAPTER)]);
  const links = new Map(state.sourceLinks.map(link => [link.sourceId, link]));
  const sources = state.sources.filter(source => source.provenance === LEARNED &&
    links.get(source.id)?.method === 'learned-provisional' &&
    source.embedding?.modelId === MODEL && EXTRACTORS.has(source.extractorVersion))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (sources.length < 2 || sources.length > 256) throw new Error('Catalog outside experiment bound');
  const [raw, adapted] = [null, adapter].map(value =>
    planAlternateTopics({ sources: state.sources, sourceLinks: state.sourceLinks, adapter: value }));
  const labels = plan => new Map(plan.partitions.flatMap((part, i) => part.sourceIds.map(id => [id, i])));
  const [rawGroups, adapterGroups] = [labels(raw), labels(adapted)];
  const titleDocs = sources.map(source => ({ id: source.id, title: source.title, body: source.title }));
  const inference = await embedDocuments(titleDocs, 'body');
  const transformed = new Map(sources.map(source =>
    [source.id, applyDiagonalAdapter(source.embedding.values, adapter)]));
  const rows = [];
  for (let i = 0; i < sources.length; i++) for (let j = i + 1; j < sources.length; j++) {
    const a = sources[i], b = sources[j];
    rows.push({ a, b,
      rawBody: dot(a.embedding.values, b.embedding.values),
      adaptedBody: dot(transformed.get(a.id), transformed.get(b.id)),
      title: dot(inference.vectors.get(a.id), inference.vectors.get(b.id)),
      rawGrouped: rawGroups.get(a.id) === rawGroups.get(b.id),
      adapterGrouped: adapterGroups.get(a.id) === adapterGroups.get(b.id) });
  }
  const translation = rows.find(row => TRANSLATION_PATHS.some(path => row.a.url.endsWith(path)) &&
    TRANSLATION_PATHS.some(path => row.b.url.endsWith(path)) && row.a.url !== row.b.url);
  const candidate = rows.filter(row => row.adapterGrouped && row.adaptedBody >= 0.94);
  const thresholds = [0.75, 0.80, 0.85, 0.90].map(minimumTitleCosine => ({
    minimumTitleCosine,
    groupedPairsBelow: candidate.filter(row => row.title < minimumTitleCosine).length,
    translationKept: Boolean(translation && translation.title >= minimumTitleCosine),
  }));
  const uses = (source, label) => buckets[label].test(source.title);
  const output = {
    scope: 'exploratory owner-local catalog; no independent quality claim',
    pages: sources.length, pairs: rows.length,
    inferenceMs: Math.round(inference.elapsedMs), totalMs: Math.round(performance.now() - started),
    translation: translation ? { rawBody: +translation.rawBody.toFixed(4),
      adaptedBody: +translation.adaptedBody.toFixed(4), title: +translation.title.toFixed(4),
      rawGrouped: translation.rawGrouped, adapterGrouped: translation.adapterGrouped } : null,
    spendingVsTroops: pairStats(rows, (a, b) =>
      uses(a, 'spending') && uses(b, 'troops') || uses(b, 'spending') && uses(a, 'troops')),
    fountainCategoryVsWaterInlet: pairStats(rows, (a, b) =>
      uses(a, 'fountain') && /brunnen.*brunnen/iu.test(a.title) &&
        uses(b, 'fountain') && /wassereinlauf/iu.test(b.title) ||
      uses(b, 'fountain') && /brunnen.*brunnen/iu.test(b.title) &&
        uses(a, 'fountain') && /wassereinlauf/iu.test(a.title)),
    titleThresholds: thresholds,
  };
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

main().catch(() => { process.stderr.write('Title shadow failed: invalid-or-unavailable\n'); process.exitCode = 1; });
