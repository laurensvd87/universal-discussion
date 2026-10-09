import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHoldout, triangleOnly } from './core.js';

function fictionalRows() {
  const rows = [];
  for (let family = 0; family < 4; family++) for (let event = 0; event < 2; event++) {
    const eventId = `fictional-event-${family}-${event}`;
    for (const lang of ['en', 'de', 'nl', 'fr', 'es'])
      for (const viewpoint of ['supportive', 'questioning'])
        rows.push({ id: `${eventId}-${lang}-${viewpoint}`, event_id: eventId,
          family_id: `fictional-family-${family}`, lang, viewpoint,
          title: `Fictional ${eventId} ${lang}`,
          text: `Fictional account of ${eventId} from ${viewpoint} ${lang}` });
  }
  return rows;
}

test('fictional 80-record schema yields exact pair denominators and a full recovery', () => {
  const docs = validateHoldout(fictionalRows());
  const vectors = new Map(docs.map(doc => [doc.id, doc.eventKey]));
  const result = triangleOnly(docs, vectors, (a, b) => a === b ? 0.99 : 0.1, 0.95);
  assert.deepEqual(result.denominators, { articles: 80, events: 8, families: 4,
    truePairs: 360, falsePairs: 2800, hardFalsePairs: 400,
    crossLanguageTruePairs: 320 });
  assert.deepEqual(result.edgeMetrics, { trueEdges: 360, falseEdges: 0,
    hardFalseEdges: 0, crossLanguageTrueEdges: 320 });
  assert.equal(result.components.completeEvents, 8);
  assert.equal(result.researchScreen.met, true);
});

test('one isolated false bridge is pruned by triangle support', () => {
  const docs = validateHoldout(fictionalRows());
  const vectors = new Map(docs.map((doc, i) => [doc.id, i]));
  const score = (a, b) => docs[a].eventKey === docs[b].eventKey ||
    (Math.min(a, b) === 0 && Math.max(a, b) === 10) ? 0.99 : 0.1;
  const result = triangleOnly(docs, vectors, score, 0.95);
  assert.equal(result.edgeMetrics.falseEdges, 0);
  assert.equal(result.components.mixedGroups, 0);
  assert.equal(result.components.groupedFalsePairs, 0);
});

test('schema rejects missing stance counterpart without exposing row data', () => {
  const rows = fictionalRows();
  rows[1].viewpoint = rows[0].viewpoint;
  assert.throws(() => validateHoldout(rows), /HOLDOUT_STANCE/);
});

test('holdout gold labels affect evaluation, not candidate graph decisions', () => {
  const docs = validateHoldout(fictionalRows());
  const vectors = new Map(docs.map((doc, i) => [doc.id, Math.floor(i / 10)]));
  const score = (a, b) => a === b ? 0.99 : 0.1;
  const original = triangleOnly(docs, vectors, score, 0.95);
  const changed = triangleOnly(docs.map((doc, i) => ({ ...doc, eventKey: `other-${i}` })),
    vectors, score, 0.95);
  assert.equal(original.components.groups, changed.components.groups);
  assert.equal(original.edgeMetrics.trueEdges, 360);
  assert.equal(changed.edgeMetrics.trueEdges, 0);
});
