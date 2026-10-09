import test from 'node:test';
import assert from 'node:assert/strict';
import { runRamPilot, MAX_PAIRS } from './core.js';

const NOW = Date.parse('2026-10-09T12:00:00.000Z');
const iso = value => new Date(value).toISOString();
function fixture() {
  const item = (id, host) => ({
    id, url: `https://${host}/fictional-${id}`, publisher: 'Fictional publisher', language: 'en',
    publishedAt: iso(NOW - 2 * 86_400_000), rights: {
      noticeUrl: `https://${host}/rights`, license: 'Fictional research permission',
      pageOwner: 'Fictional owner', attribution: 'Fictional credit', reviewer: 'Fictional reviewer',
      reviewedAt: iso(NOW - 60_000), localResearchAllowed: true, collectionAllowed: true,
      thirdPartyMaterialExcluded: true
    }
  });
  const pair = (left, right, label = 'same') => ({
    left, right, label, evidence: 'Fictional event review', reviewer: 'Fictional reviewer',
    reviewedAt: iso(NOW - 30_000)
  });
  const review = { version: 1, createdAt: iso(NOW - 86_400_000),
    items: [item('a', 'globalvoices.org'), item('b', 'en.wikinews.org')], pairs: [pair('a', 'b')] };
  const vector = () => new Float32Array(384).fill(0.25);
  const methods = [
    { id: 'e5', embed: async () => vector(), sameTopic: () => false },
    { id: 'candidate', embed: async () => vector(), sameTopic: () => true }
  ];
  const pageText = 'Entirely invented public article prose for a RAM-only test. '.repeat(3);
  const response = url => ({ status: 200, url, redirected: false,
    headers: new Headers({ 'content-type': 'text/plain; charset=utf-8' }),
    body: new Response(pageText).body });
  const fetchPage = async (url, options) => {
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal);
    return response(url);
  };
  const run = (changes = {}) => runRamPilot({ review, methods, fetchPage, now: () => NOW, ...changes });
  return { item, pair, review, methods, response, fetchPage, pageText, run };
}

test('returns aggregate pair comparison and no item metadata', async () => {
  const f = fixture();
  const report = await f.run();
  assert.equal(report.methods[0].falseNegative, 1);
  assert.equal(report.methods[1].truePositive, 1);
  assert.deepEqual(report.labels, { same: 1, different: 0, uncertain: 0 });
  assert.doesNotMatch(JSON.stringify(report), /fictional|globalvoices\.org|wikinews\.org|https|owner|article/i);
});

test('rejects rights gaps, bad domains, missing labels and expiry before fetch', async () => {
  const f = fixture();
  let called = 0;
  const fetchPage = async () => { called++; throw new Error('should not fetch'); };
  f.review.items[0].rights.collectionAllowed = false;
  await assert.rejects(f.run({ fetchPage }), /RIGHTS_NOT_CLEARED/);
  f.review.items[0].rights.collectionAllowed = true;
  f.review.items[0].url = 'https://private.example/fictional-a';
  await assert.rejects(f.run({ fetchPage }), /SOURCE_OUT_OF_SCOPE/);
  f.review.items[0].url = 'https://globalvoices.org/fictional-a';
  delete f.review.pairs[0].label;
  await assert.rejects(f.run({ fetchPage }), /INVALID_SCHEMA/);
  f.review.pairs[0].label = 'same';
  await assert.rejects(f.run({ fetchPage, now: () => Date.parse(f.review.createdAt) + 30 * 86_400_000 }), /RETENTION_EXPIRED/);
  assert.equal(called, 0);
});

test('rejects redirect, oversized body and unexpected content type', async () => {
  const f = fixture();
  await assert.rejects(f.run({ fetchPage: async url => f.response(url + '/elsewhere') }), /PAGE_REDIRECTED/);
  await assert.rejects(f.run({ fetchPage: async url => ({ ...f.response(url),
    headers: new Headers({ 'content-type': 'text/html', 'content-length': '100001' }) }) }), /PAGE_TOO_LARGE/);
  await assert.rejects(f.run({ fetchPage: async url => ({ ...f.response(url),
    headers: new Headers({ 'content-type': 'application/json' }) }) }), /PAGE_CONTENT_TYPE/);
  await assert.rejects(f.run({ fetchPage: async url => ({ ...f.response(url),
    body: new Response('X'.repeat(100_001)).body }) }), /PAGE_TOO_LARGE/);
});

test('HTML cannot reach embedder without trusted article extraction', async () => {
  const f = fixture();
  const htmlPage = async url => ({ ...f.response(url),
    headers: new Headers({ 'content-type': 'text/html' }) });
  await assert.rejects(f.run({ fetchPage: htmlPage }), /PAGE_EXTRACTOR_REQUIRED/);
  let seen;
  f.methods[0].embed = async text => { seen = text; return new Float32Array(384); };
  await f.run({ fetchPage: htmlPage, extractArticle: async () => 'Reviewed article extract. '.repeat(4) });
  assert.match(seen, /^Reviewed article extract/);
  await assert.rejects(f.run({ fetchPage: htmlPage, extractArticle: async () => '<html>bad</html>' }),
    /PAGE_EXTRACT_INVALID/);
});

test('enforces 250-pair cap and rejects duplicate reversed pair', async () => {
  const f = fixture();
  f.review.pairs.push(f.pair('b', 'a'));
  await assert.rejects(f.run(), /DUPLICATE_PAIR/);
  f.review.pairs = [];
  for (let n = 0; n < 23; n++) f.review.items.push(f.item(`extra_${n}`, 'globalvoices.org'));
  for (let a = 0; a < f.review.items.length; a++)
    for (let b = a + 1; b < f.review.items.length; b++)
      f.review.pairs.push(f.pair(f.review.items[a].id, f.review.items[b].id));
  f.review.pairs = f.review.pairs.slice(0, MAX_PAIRS + 1);
  await assert.rejects(f.run(), /INVALID_SIZE/);
});

test('clears previously created vectors after callback failure and has no secret-bearing error', async () => {
  const f = fixture();
  const created = [];
  f.methods[0].embed = async () => { const vector = new Float32Array(384).fill(7); created.push(vector); return vector; };
  f.methods[1].embed = async () => { throw new Error(`secret ${f.pageText} https://globalvoices.org/private`); };
  await assert.rejects(f.run(), error => {
    assert.equal(error.message, 'EMBED_FAILED');
    return true;
  });
  assert.equal(created[0].every(value => value === 0), true);
});

test('untrusted transport and comparator errors do not expose their messages', async () => {
  const f = fixture();
  await assert.rejects(f.run({ fetchPage: async () => { throw new Error('https://secret.example/private'); } }),
    error => error.message === 'PAGE_FETCH_FAILED');
  await assert.rejects(f.run({ fetchPage: async () => {
    const error = new Error('PAGE_TIMEOUT', { cause: 'https://secret.example/private' });
    error.pageText = 'private article';
    throw error;
  } }), error => {
    assert.equal(error.message, 'PAGE_TIMEOUT');
    assert.equal(error.cause, undefined);
    assert.equal(error.pageText, undefined);
    return true;
  });
  f.methods[1].sameTopic = () => { throw new Error('private vector content'); };
  await assert.rejects(f.run(), error => error.message === 'COMPARE_FAILED');
});

test('snapshots reviewed URLs and pair labels before first asynchronous fetch', async () => {
  const f = fixture();
  const originalUrls = f.review.items.map(item => item.url);
  const seen = [];
  const report = await f.run({ fetchPage: async url => {
    seen.push(url);
    if (seen.length === 1) {
      f.review.items[1].url = 'https://private.example/secret';
      f.review.pairs[0].label = 'different';
      f.review.pairs[0].left = 'missing';
    }
    return f.response(url);
  } });
  assert.deepEqual(seen, originalUrls);
  assert.equal(report.labels.same, 1);
  assert.equal(report.methods[1].truePositive, 1);
});

test('rejects future pair review and equivalent URL variants', async () => {
  const f = fixture();
  f.review.pairs[0].reviewedAt = iso(NOW + 1);
  await assert.rejects(f.run(), /INVALID_PAIR_REVIEW/);
  f.review.pairs[0].reviewedAt = iso(NOW - 30_000);
  f.review.items[1].url = 'https://GLOBALVOICES.ORG/fictional-a/';
  await assert.rejects(f.run(), /DUPLICATE_ITEM/);
});

test('rejects HTML-like and chrome-like extracted prose at the common bound', async () => {
  const f = fixture();
  const htmlPage = async url => ({ ...f.response(url), headers: new Headers({ 'content-type': 'text/html' }) });
  await assert.rejects(f.run({ fetchPage: htmlPage,
    extractArticle: async () => `<article>${'Fictional article prose '.repeat(4)}</article>` }), /PAGE_EXTRACT_INVALID/);
  await assert.rejects(f.run({ fetchPage: htmlPage,
    extractArticle: async () => `Fictional article prose repeated for review.\nCookie settings\n${'More prose. '.repeat(5)}` }),
  /PAGE_EXTRACT_INVALID/);
  await assert.rejects(f.run({ fetchPage: async url => ({ ...f.response(url),
    body: new Response('Fictional text. '.repeat(500)).body }) }), /PAGE_EXTRACT_INVALID/);
});

test('copies reused embedder vectors and shields cached vectors from comparators', async () => {
  const f = fixture();
  const shared = new Float32Array(384);
  let call = 0;
  f.methods[0].embed = () => { shared.fill(++call); return shared; };
  f.methods[0].sameTopic = (left, right) => {
    assert.equal(left[0], 1);
    assert.equal(right[0], 2);
    left.fill(99);
    return false;
  };
  await f.run();
  assert.equal(shared.every(value => value === 0), true);
});
