import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCorpus, inspectCorpus, diagnoseSchema, safeDiagnostic } from './core.js';

const fictional = (pageid, lang, extra = {}) => ({ title: 'Fictional harbor council vote',
  pageid, categories: ['Local news'], lang, url: `https://${lang}.wikinews.org/wiki/Fictional_${pageid}`,
  text: ['Fictional council reviewed the harbor plan.', 'Residents asked for a second hearing.'],
  date: '2020-01-01', type: 'news', ...extra });
const encode = records => Buffer.from(records.map(record => JSON.stringify(record)).join('\n') + '\n');

test('counts cross-language pageid groups without exposing input fields', () => {
  const corpus = parseCorpus(encode([fictional(77, 'en'), fictional(77, 'fr'), fictional(88, 'nl')]));
  const report = inspectCorpus(corpus);
  assert.equal(report.articles, 3);
  assert.equal(report.events, 2);
  assert.deepEqual(report.eventSize.distribution, { 1: 1, 2: 1 });
  assert.deepEqual(report.languages, { en: 1, fr: 1, nl: 1 });
  assert.equal(report.modelLoaded, false);
  assert.equal(report.emptyTextArticles, 0);
  assert.doesNotMatch(JSON.stringify(report), /harbor|wikinews\.org|Local news|2020-01-01|77|88/iu);
});

test('accepts bounded string text and rejects malformed records with fixed diagnostic', () => {
  assert.equal(parseCorpus(encode([fictional('event_1', 'de', { text: 'A fictional report.' })])).articles, 1);
  for (const bad of [
    fictional(1, 'en', { text: [42] }),
    fictional(1, 'en', { pageid: { secret: 'private' } }),
    fictional(1, 'en', { url: 'http://example.org/unsafe' }),
    fictional(1, 'en', { url: 'https://en.wikinews.org.evil.test/unsafe' }),
    fictional(1, 'en', { url: 'https://user:secret@en.wikinews.org/unsafe' }),
    fictional(1, 'en', { categories: ['x'.repeat(201)] }),
  ]) {
    let error;
    try { parseCorpus(encode([bad])); } catch (caught) { error = caught; }
    assert.ok(error);
    const diagnostic = safeDiagnostic(error);
    assert.match(diagnostic.code, /^[A-Z_]+$/u);
    assert.doesNotMatch(JSON.stringify(diagnostic), /private|unsafe|example\.org|wikinews|x{8}/iu);
  }
});

test('counts empty text and accepts nullable date and old HTTP Wikinews URLs', () => {
  const corpus = parseCorpus(encode([
    fictional(1, 'en', { text: '', date: null, url: 'http://en.wikinews.org/wiki/Fictional_1' }),
    fictional(1, 'fr', { text: [], date: '' }),
    fictional(2, 'nl', { text: [' ', 'A fictional update.'] }),
  ]));
  const report = inspectCorpus(corpus);
  assert.equal(report.articles, 3);
  assert.equal(report.events, 2);
  assert.equal(report.emptyTextArticles, 2);
  assert.equal(report.emptyDateArticles, 2);
});

test('bounds total input and forbids blank JSONL records', () => {
  assert.throws(() => parseCorpus(Buffer.alloc(0)), { phase: 'input', code: 'INPUT_SIZE' });
  assert.throws(() => parseCorpus(Buffer.from(`${JSON.stringify(fictional(1, 'en'))}\n\n`)),
    { phase: 'parse', code: 'LINE_BOUND' });
  assert.throws(() => parseCorpus(encode([fictional(1, 'en', { text: 'x'.repeat(100001) })])),
    { phase: 'schema', code: 'TEXT_LENGTH' });
});

test('schema probe reports only bounded aggregate counts', () => {
  const report = diagnoseSchema(encode([
    fictional(1, 'en', { date: '', title: 'SECRET_TITLE' }),
    fictional(2, 'fr', { date: null, text: ['SECRET_TEXT'], categories: [] }),
    fictional(3, 'nl', { date: 42, url: 'SECRET_URL', pageid: { secret: true } }),
  ]));
  assert.equal(report.articles, 3);
  assert.equal(report.fields.date.types.string, 1);
  assert.equal(report.fields.date.types.null, 1);
  assert.equal(report.fields.date.types.number, 1);
  assert.equal(report.fields.date.empty, 2);
  assert.equal(report.fields.categories.empty, 1);
  assert.equal(report.fields.pageid.types.object, 1);
  assert.doesNotMatch(JSON.stringify(report), /SECRET|wikinews\.org|harbor|2020-01-01/iu);
  assert.throws(() => diagnoseSchema(Buffer.alloc(0)),
    { phase: 'input', code: 'INPUT_SIZE' });
});
