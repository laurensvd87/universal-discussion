// Offline corpus validation. Never serialize documents or gold keys.
import { createHash } from 'node:crypto';

const LIMITS = Object.freeze({ bytes: 64 * 1024 * 1024, lineBytes: 256 * 1024,
  articles: 20000, text: 100000, paragraphs: 256, paragraph: 20000 });
const hash = value => createHash('sha256').update(value).digest('hex');
const FIELDS = Object.freeze(['pageid', 'title', 'categories', 'lang', 'url', 'text', 'date', 'type']);

export class CorpusError extends Error {
  constructor(phase, code) {
    super(code);
    this.phase = phase;
    this.code = code;
  }
}
const fail = (phase, code) => { throw new CorpusError(phase, code); };
export const safeDiagnostic = error => error instanceof CorpusError
  ? { phase: error.phase, code: error.code }
  : { phase: 'internal', code: 'UNCLASSIFIED_FAILURE' };

function boundedString(value, max, code, { nonempty = true } = {}) {
  if (typeof value !== 'string') fail('schema', `${code}_TYPE`);
  if (value.length > max || (nonempty && !value.trim())) fail('schema', `${code}_LENGTH`);
  return value;
}

function textValue(value) {
  if (typeof value === 'string') return !boundedString(value, LIMITS.text, 'TEXT', { nonempty: false }).trim();
  if (!Array.isArray(value) || value.length > LIMITS.paragraphs)
    fail('schema', 'TEXT_PARAGRAPHS');
  let length = 0;
  let nonempty = false;
  for (const paragraph of value) {
    boundedString(paragraph, LIMITS.paragraph, 'TEXT_PARAGRAPH', { nonempty: false });
    length += paragraph.length;
    if (paragraph.trim()) nonempty = true;
    if (length > LIMITS.text) fail('schema', 'TEXT_LENGTH');
  }
  return !nonempty;
}

function eventKey(value) {
  if (Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/u.test(value)) return value;
  fail('schema', 'PAGEID_FORMAT');
}

function corpusLines(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > LIMITS.bytes)
    fail('input', 'INPUT_SIZE');
  const source = bytes.toString('utf8');
  if (source.includes('\ufffd')) fail('parse', 'UTF8_INVALID');
  const lines = source.split(/\r?\n/u);
  if (lines.at(-1) === '') lines.pop();
  if (!lines.length || lines.length > LIMITS.articles) fail('parse', 'LINE_COUNT');
  return lines;
}

function articleFromLine(line) {
  if (!line.trim() || Buffer.byteLength(line, 'utf8') > LIMITS.lineBytes)
    fail('parse', 'LINE_BOUND');
  let article;
  try { article = JSON.parse(line); } catch { fail('parse', 'JSONL_SYNTAX'); }
  if (!article || typeof article !== 'object' || Array.isArray(article))
    fail('schema', 'ARTICLE_OBJECT');
  return article;
}

const valueType = value => value === undefined ? 'missing' : value === null ? 'null'
  : Array.isArray(value) ? 'array' : typeof value;

// Aggregate-only schema probe: field values and per-row details never enter the report.
export function diagnoseSchema(bytes) {
  const lines = corpusLines(bytes);
  const fields = Object.fromEntries(FIELDS.map(field => [field, {
    types: { missing: 0, null: 0, string: 0, number: 0, array: 0,
      object: 0, boolean: 0 }, empty: 0, overlimit: 0,
  }]));
  const max = { title: 1000, lang: 32, url: 2048, date: 100, type: 100 };
  for (const line of lines) {
    const article = articleFromLine(line);
    for (const field of FIELDS) {
      const value = article[field];
      const stats = fields[field];
      const type = valueType(value);
      stats.types[type]++;
      if (type === 'missing' || type === 'null' ||
          (type === 'string' && !value.trim()) || (type === 'array' && value.length === 0))
        stats.empty++;
      if (type === 'string' && value.length > (max[field] ??
          (field === 'pageid' ? 100 : LIMITS.text))) stats.overlimit++;
      if (type === 'array') {
        if (value.length > (field === 'categories' ? 64 : LIMITS.paragraphs))
          stats.overlimit++;
        if (field === 'text' || field === 'categories') {
          const memberLimit = field === 'text' ? LIMITS.paragraph : 200;
          if (value.some(member => typeof member !== 'string' || member.length > memberLimit) ||
              (field === 'text' && value.reduce((sum, member) =>
                sum + (typeof member === 'string' ? member.length : 0), 0) > LIMITS.text))
            stats.overlimit++;
        }
      }
    }
  }
  return { mode: 'diagnose-schema', inputSha256: hash(bytes), articles: lines.length,
    fields, modelLoaded: false };
}

export function parseCorpus(bytes) {
  const lines = corpusLines(bytes);
  const events = new Map(), languages = new Map();
  let emptyTextArticles = 0, emptyDateArticles = 0;
  for (const line of lines) {
    const article = articleFromLine(line);
    const key = eventKey(article.pageid);
    boundedString(article.title, 1000, 'TITLE');
    const lang = boundedString(article.lang, 32, 'LANG').toLowerCase();
    if (!/^[a-z]{2,8}(?:-[a-z]{2,8})?$/u.test(lang)) fail('schema', 'LANG_FORMAT');
    const url = boundedString(article.url, 2048, 'URL');
    let parsed;
    try { parsed = new URL(url); } catch { fail('schema', 'URL_FORMAT'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
        !parsed.hostname.toLowerCase().endsWith('.wikinews.org'))
      fail('schema', 'URL_FORMAT');
    if (article.date === null) emptyDateArticles++;
    else if (!boundedString(article.date, 100, 'DATE', { nonempty: false }).trim())
      emptyDateArticles++;
    boundedString(article.type, 100, 'TYPE');
    if (!Array.isArray(article.categories) || article.categories.length > 64)
      fail('schema', 'CATEGORIES_ARRAY');
    for (const category of article.categories) boundedString(category, 200, 'CATEGORY');
    if (textValue(article.text)) emptyTextArticles++;
    events.set(key, (events.get(key) ?? 0) + 1);
    languages.set(lang, (languages.get(lang) ?? 0) + 1);
  }
  return { inputSha256: hash(bytes), articles: lines.length,
    emptyTextArticles, emptyDateArticles, events, languages };
}

export function inspectCorpus(corpus) {
  const eventSizes = [...corpus.events.values()];
  const distribution = new Map();
  for (const size of eventSizes) distribution.set(size, (distribution.get(size) ?? 0) + 1);
  return { mode: 'inspect', inputSha256: corpus.inputSha256,
    articles: corpus.articles, events: corpus.events.size,
    emptyTextArticles: corpus.emptyTextArticles, emptyDateArticles: corpus.emptyDateArticles,
    eventSize: { min: Math.min(...eventSizes), max: Math.max(...eventSizes),
      distribution: Object.fromEntries([...distribution].sort((a, b) => a[0] - b[0])) },
    languages: Object.fromEntries([...corpus.languages].sort(([a], [b]) => a.localeCompare(b))),
    modelLoaded: false };
}
