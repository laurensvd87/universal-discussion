import test from 'node:test';
import assert from 'node:assert/strict';
import { PINS, sha256, parsePinnedBytes, validateChunk,
  combinePartitions, partitionTrain } from './adapter.js';

function fictionalChunk(chunk) {
  const prefix = chunk === 'A' || chunk === 'B' ? chunk : `C${chunk[1]}`;
  const families = chunk === 'A' || chunk === 'B' ? 6 : 2;
  const languages = ['en', 'nl', 'de', 'fr', 'es', 'en'];
  const rows = [];
  for (let family = 1; family <= families; family++) for (let event = 1; event <= 3; event++)
    for (let report = 1; report <= 6; report++) {
      const familyKey = `${prefix}${String(family).padStart(2, '0')}`;
      rows.push({ id: `fictional-${familyKey}-${event}-${report}`, family: familyKey,
        eventKey: `${familyKey}-E${event}`, lang: languages[report - 1],
        viewpoint: `fictional-role-${report}`,
        title: `Fictional title for ${familyKey} event ${event} report ${report}`,
        body: 'Entirely fictional test body. '.repeat(10) });
    }
  return rows;
}

test('final A/B/C1/C2/C3 digests are pinned but fictional bytes cannot parse', () => {
  assert.equal(Object.keys(PINS).sort().join(','), 'A,B,C1,C2,C3');
  assert.equal(PINS.A.length, 64);
  assert.equal(sha256(Buffer.from('fictional')).length, 64);
  assert.throws(() => parsePinnedBytes(Buffer.from('{malformed}\n'), 'A'), /INPUT_DIGEST/u);
});

test('fictional chunks validate exact 6-report event structure and bounded lead', () => {
  for (const chunk of ['A', 'B', 'C1', 'C2', 'C3']) {
    const documents = validateChunk(fictionalChunk(chunk), chunk);
    assert.equal(documents.length, chunk === 'A' || chunk === 'B' ? 108 : 36);
    assert.equal(documents[0].lead, fictionalChunk(chunk)[0].body.slice(0, 384));
    assert.equal(new Set(documents.map(doc => doc.eventKey)).size,
      chunk === 'A' || chunk === 'B' ? 18 : 6);
  }
  const invalid = fictionalChunk('C1');
  invalid[0] = { ...invalid[0], lang: 'xx' };
  assert.throws(() => validateChunk(invalid, 'C1'), /ROW_SCHEMA/u);
});

test('fictional whole-family split keeps 9 fit and 3 calibration families', () => {
  const a = validateChunk(fictionalChunk('A'), 'A');
  const b = validateChunk(fictionalChunk('B'), 'B');
  const c1 = validateChunk(fictionalChunk('C1'), 'C1');
  const c2 = validateChunk(fictionalChunk('C2'), 'C2');
  const c3 = validateChunk(fictionalChunk('C3'), 'C3');
  const { train, development } = combinePartitions(a, b, c1, c2, c3);
  assert.equal(train.length, 216);
  assert.equal(development.length, 108);
  const { fit, calibration } = partitionTrain(train);
  assert.equal(fit.length, 162);
  assert.equal(calibration.length, 54);
  assert.equal(new Set(fit.map(doc => doc.categories[0])).size, 9);
  assert.equal(new Set(calibration.map(doc => doc.categories[0])).size, 3);
  assert.equal(new Set(fit.map(doc => doc.eventKey)).size, 27);
  assert.equal(new Set(calibration.map(doc => doc.eventKey)).size, 9);
  assert.ok(fit.every(doc => !calibration.some(other =>
    doc.categories[0] === other.categories[0])));
});

test('cross-split event or ID overlap fails closed', () => {
  const a = validateChunk(fictionalChunk('A'), 'A');
  const b = validateChunk(fictionalChunk('B'), 'B');
  const c1 = validateChunk(fictionalChunk('C1'), 'C1');
  const c2 = validateChunk(fictionalChunk('C2'), 'C2');
  const c3 = validateChunk(fictionalChunk('C3'), 'C3');
  c1[0] = { ...c1[0], id: a[0].id };
  assert.throws(() => combinePartitions(a, b, c1, c2, c3), /SPLIT_LEAKAGE/u);
});
