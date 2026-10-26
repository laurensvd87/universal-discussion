import test from 'node:test';
import assert from 'node:assert/strict';
import { NODES, TAXONOMY } from './taxonomy.js';

const EXPECTED_ROOTS = ['games', 'nature', 'cooking', 'vehicles', 'science', 'technology', 'society', 'history',
  'culture', 'sports', 'geography', 'health', 'business', 'languages', 'ideas-beliefs', 'education'];
const map = new Map(NODES.map(node => [node.id, node]));
function path(id) {
  const result = [], seen = new Set();
  for (let node = map.get(id); node; node = map.get(node.parentId)) {
    assert.ok(!seen.has(node.id), 'Cycle'); seen.add(node.id); result.unshift(node.id);
    assert.ok(node.parentId === null || map.has(node.parentId), 'Missing parent');
  }
  return result;
}

test('candidate forest is explicit, bounded, acyclic and contains only stable unique IDs', () => {
  assert.equal(NODES.length, 63); assert.ok(NODES.length <= 96); assert.equal(map.size, NODES.length);
  assert.deepEqual(NODES.filter(node => node.parentId === null).map(node => node.id), EXPECTED_ROOTS);
  for (const node of NODES) {
    assert.match(node.id, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);
    assert.ok(node.id.length <= 80);
    assert.ok(path(node.id).length <= 5);
    assert.ok(Object.isFrozen(node));
    if (node.parentId !== null) assert.ok(map.has(node.parentId));
  }
  const expectedParents = [...EXPECTED_ROOTS, 'video-games', 'animals', 'recipes', 'maintenance', 'computing'];
  assert.deepEqual([...new Set(NODES.map(node => node.parentId).filter(id => id !== null))].sort(), expectedParents.sort());
  for (const parentId of expectedParents) {
    assert.ok(NODES.some(node => node.parentId === parentId));
  }
  assert.ok(Object.isFrozen(NODES)); assert.ok(Object.isFrozen(TAXONOMY));
});

test('requested broad-to-specific paths remain exact, including recipes and maintenance', () => {
  for (const expected of [
    ['games', 'video-games', 'gta'], ['games', 'video-games', 'minecraft'], ['games', 'board-games'],
    ['nature', 'animals', 'koalas'], ['nature', 'animals', 'dolphins'], ['nature', 'plants'], ['nature', 'ecology'],
    ['cooking', 'recipes', 'kapsalon'], ['cooking', 'recipes', 'pasta'], ['vehicles', 'maintenance', 'tyre-pressure'],
    ['technology', 'computing', 'software'], ['technology', 'computing', 'networks'], ['technology', 'computing', 'ai'],
    ['science', 'mathematics'], ['science', 'physics'], ['science', 'chemistry'], ['science', 'astronomy'],
    ['society', 'politics'], ['society', 'law'], ['society', 'institutions'], ['history', 'military-history'],
    ['culture', 'literature'], ['culture', 'music'], ['culture', 'film'], ['culture', 'visual-arts'],
    ['sports', 'football'], ['sports', 'basketball'], ['sports', 'cycling'], ['sports', 'winter-sports'],
    ['geography', 'places'], ['health', 'medicine'], ['health', 'psychology'], ['business', 'economics'],
    ['business', 'commerce'], ['business', 'careers'], ['languages', 'linguistics'], ['languages', 'natural-languages'],
    ['ideas-beliefs', 'religion'], ['ideas-beliefs', 'philosophy'], ['education', 'schools'], ['education', 'higher-education'],
  ]) assert.deepEqual(path(expected.at(-1)), expected);
});

test('each node has bounded English metadata and two separately worded topic descriptors', () => {
  const allDescriptions = new Set();
  for (const node of NODES) {
    assert.deepEqual(Object.keys(node).sort(), ['id', 'parentId', 'label', 'scope', 'positiveDescriptions'].sort());
    assert.ok(typeof node.label === 'string' && node.label.length >= 2 && node.label.length <= 80);
    assert.ok(typeof node.scope === 'string' && node.scope.length >= 40 && node.scope.length <= 640);
    assert.equal(node.positiveDescriptions.length, 2);
    assert.ok(Object.isFrozen(node.positiveDescriptions));
    assert.notEqual(node.positiveDescriptions[0], node.positiveDescriptions[1]);
    for (const description of node.positiveDescriptions) {
      assert.equal(typeof description, 'string');
      assert.ok(description.length >= 40 && description.length <= 512);
      assert.equal(description, description.trim());
      assert.ok(!allDescriptions.has(description)); allDescriptions.add(description);
      assert.ok(!/[\u0000-\u001f\u007f]/u.test(description));
    }
  }
  assert.equal(allDescriptions.size, 126);
  assert.ok(Buffer.byteLength(JSON.stringify(TAXONOMY)) <= 64 * 1024);
});

test('candidate policy states root boundaries and does not turn descriptors into evidence or activation', () => {
  assert.equal(TAXONOMY.status, 'offline-candidate');
  assert.equal(TAXONOMY.ownerApproved, false); assert.equal(TAXONOMY.productionValidated, false);
  assert.equal(TAXONOMY.descriptionLanguage, 'en');
  assert.match(TAXONOMY.intendedUse, /not-page-gold-or-training-evidence/u);
  assert.match(TAXONOMY.decisionPolicy, /Biographies/u);
  assert.match(TAXONOMY.decisionPolicy, /unresolved/u);
  assert.match(map.get('nature').scope, /living world/u);
  assert.match(map.get('science').scope, /nonliving/u);
  assert.match(map.get('careers').scope, /biography/u);
  assert.match(map.get('gta').scope, /Greater Toronto Area/u);
  assert.match(map.get('tyre-pressure').scope, /advertisements/u);
});
