import assert from 'node:assert/strict';
import test from 'node:test';
import { titleForCurrentMembers } from './keyphrase-title.js';

const page = (host, path, title) => ({ url: `https://${host}/${path}`, title });
const vector = (a, b) => {
  const norm = Math.hypot(a, b);
  return { modelId: 'e5-small-q8-browser-main-prefix-v1',
    values: [a / norm, b / norm, ...Array(382).fill(0)] };
};

test('recurring English event wording yields a verbatim cluster phrase', () => {
  const sources = [
    page('alpha.example', 'a', 'Berlin flood warnings prompt school closures'),
    page('beta.example', 'b', 'Berlin flood warnings remain in force as river rises'),
    page('gamma.example', 'c', 'Officials extend Berlin flood warnings overnight'),
  ];
  const result = titleForCurrentMembers(sources);
  assert.deepEqual(result, { title: 'Berlin flood warnings', method: 'supported-keyphrase', support: 3 });
  assert.equal(sources.some(source => source.title.includes(result.title)), true);
});

test('German, Dutch, and Cyrillic phrases work when same-script wording recurs', () => {
  const cases = [
    ['Berlin: Neue Warnungen vor starkem Hochwasser', 'Warnungen vor starkem Hochwasser bleiben bestehen', 'Hochwasser'],
    ['Amsterdam krijgt nieuwe waarschuwing voor zware storm', 'Nieuwe waarschuwing voor zware storm in Amsterdam', 'waarschuwing voor zware storm'],
    ['Киевские школы закрыты после сильного снегопада', 'Киевские школы закрыты из-за сильного снегопада', 'Киевские школы закрыты'],
  ];
  for (const [a, b, expected] of cases) {
    const result = titleForCurrentMembers([page('one.example', 'a', a), page('two.example', 'b', b)]);
    assert.equal(result.method, 'supported-keyphrase');
    assert.ok(result.title.includes(expected), `${result.title} lacks ${expected}`);
  }
});

test('Japanese headlines remain real headlines if segmenter cannot establish safe consensus', () => {
  const sources = [
    page('one.example', 'a', '東京都で大雨警報、学校が休校'),
    page('two.example', 'b', '東京都で大雨警報が続く'),
  ];
  const result = titleForCurrentMembers(sources);
  assert.ok(sources.some(source => source.title === result.title || source.title.includes(result.title)));
});

test('different events involving the same person fall back to a real headline', () => {
  const sources = [
    page('alpha.example', 'vote', 'Anna Keller wins Berlin election'),
    page('beta.example', 'film', 'Anna Keller directs new film'),
    page('gamma.example', 'book', 'Anna Keller publishes memoir'),
  ];
  const result = titleForCurrentMembers(sources);
  assert.equal(result.method, 'representative');
  assert.ok(sources.some(source => source.title === result.title));
});

test('shared person/product wording across distinct events is not a supported event phrase', () => {
  const sources = [
    page('alpha.example', 'review', 'Astra Phone X20 battery review published'),
    page('beta.example', 'repair', 'Astra Phone X20 battery repair guide updated'),
    page('gamma.example', 'price', 'Astra Phone X20 battery price falls'),
  ];
  const result = titleForCurrentMembers(sources);
  assert.equal(result.method, 'representative');
  assert.ok(sources.some(source => source.title === result.title));
});

test('source order and duplicate flooding do not change title or support', () => {
  const base = [
    page('alpha.example', 'a', 'Berlin flood warnings prompt school closures'),
    page('beta.example', 'b', 'Berlin flood warnings remain in force'),
  ];
  const expected = titleForCurrentMembers(base);
  const flooded = [base[1], ...Array.from({ length: 20 }, (_, i) => page('alpha.example', `a?utm_source=copy${i}`,
    'Berlin flood warnings prompt school closures')), base[0]];
  assert.deepEqual(titleForCurrentMembers(flooded), expected);
  assert.deepEqual(titleForCurrentMembers([...base].reverse()), expected);
});

test('mixed languages without shared words fall back; no translation is invented', () => {
  const sources = [
    page('alpha.example', 'a', 'Berlin flood warnings prompt school closures'),
    page('beta.example', 'b', 'Warnungen vor Hochwasser in Berlin bleiben bestehen'),
    page('gamma.example', 'c', 'Overstromingswaarschuwingen in Berlijn blijven van kracht'),
  ];
  const result = titleForCurrentMembers(sources);
  assert.equal(result.method, 'representative');
  assert.ok(sources.some(source => source.title === result.title));
});

test('existing valid per-page vectors rank a translated headline cluster; malformed vectors use lexical fallback', () => {
  const sources = [
    { ...page('alpha.example', 'a', 'Berlin flood warnings prompt school closures'), embedding: vector(1, 0) },
    { ...page('beta.example', 'b', 'Warnungen vor Hochwasser in Berlin bleiben bestehen'), embedding: vector(.8, .6) },
    { ...page('gamma.example', 'c', 'Overstromingswaarschuwingen in Berlijn blijven van kracht'), embedding: vector(.6, .8) },
  ];
  assert.deepEqual(titleForCurrentMembers(sources),
    { title: sources[1].title, method: 'representative-vector', support: 1 });
  assert.deepEqual(titleForCurrentMembers([...sources].reverse()), titleForCurrentMembers(sources));
  const malformed = sources.map((source, index) => index === 2 ? { ...source, embedding: { ...source.embedding, values: [1] } } : source);
  const lexical = titleForCurrentMembers(malformed);
  assert.equal(lexical.method, 'representative');
  assert.ok(sources.some(source => source.title === lexical.title));
});

test('negation, dates, and model-number conflicts do not yield a misleading shared claim', () => {
  const cases = [
    [page('one.example', 'a', 'No Berlin flood warnings today'),
      page('two.example', 'b', 'Berlin flood warnings issued today')],
    [page('one.example', 'a', 'October 7 storm forecast for Berlin'),
      page('two.example', 'b', 'October 8 storm forecast for Berlin')],
    [page('one.example', 'a', 'Phone X20 battery recall announced'),
      page('two.example', 'b', 'Phone X30 battery recall announced')],
  ];
  for (const sources of cases) {
    const result = titleForCurrentMembers(sources);
    assert.equal(result.method, 'representative');
    assert.ok(sources.some(source => source.title === result.title));
  }
});

test('current membership, title refresh, orphans, and unsafe display characters', () => {
  const old = page('alpha.example', 'a', 'Old unrelated headline');
  const fresh = page('beta.example', 'b', 'New accurate headline');
  assert.equal(titleForCurrentMembers([old, fresh]).method, 'representative');
  assert.equal(titleForCurrentMembers([fresh]).title, fresh.title);
  assert.deepEqual(titleForCurrentMembers([], 'Saved\u202e title\n'),
    { title: 'Saved title', method: 'saved-orphan', support: 0 });
  assert.equal(titleForCurrentMembers([{ ...fresh, title: 'Safe\u202e title\n' }]).title, 'Safe title');
  assert.equal(titleForCurrentMembers([page('persian.example', 'a', 'کتاب می\u200cرود')]).title, 'کتاب می\u200cرود');
  assert.equal(titleForCurrentMembers([page('indic.example', 'a', 'क्\u200dषेत्र')]).title, 'क्\u200dषेत्र');
});

test('work is capped before title scoring', () => {
  const sources = Array.from({ length: 201 }, (_, i) => page('example.com', `${i}`, `Source ${i}`));
  assert.throws(() => titleForCurrentMembers(sources), RangeError);
});

test('blank headlines are ignored and common English clickbait loses a no-overlap tie', () => {
  const sources = [
    page('one.example', 'a', ''),
    page('two.example', 'b', "You won't believe what happened next in Berlin"),
    page('three.example', 'c', 'School closures follow river flooding'),
  ];
  assert.deepEqual(titleForCurrentMembers(sources),
    { title: 'School closures follow river flooding', method: 'representative', support: 1 });
});
