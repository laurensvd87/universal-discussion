import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const directory = dirname(fileURLToPath(import.meta.url));
const splits = ['train', 'validation', 'test'];
const documentsBySplit = new Map(splits.map((split) => {
  const rows = readFileSync(join(directory, `${split}.jsonl`), 'utf8')
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  return [split, rows];
}));
const mapping = JSON.parse(readFileSync(join(directory, 'broad-families.json'), 'utf8'));
const mappingBytes = readFileSync(join(directory, 'broad-families.json'));
const frozenMappingSha256 = '155CFB0F16EC5F0DE08AB576345F03D5C7E8882B59D70B81C24C0BCAF56DB036';

test('broad-family map covers each topic family once and preserves split isolation', (t) => {
  assert.equal(createHash('sha256').update(mappingBytes).digest('hex').toUpperCase(), frozenMappingSha256);
  assert.equal(mapping.schemaVersion, 1);
  assert.ok(Array.isArray(mapping.groups));

  const originalFamiliesBySplit = new Map();
  const topicByFamily = new Map();
  for (const [split, rows] of documentsBySplit) {
    const families = new Set();
    for (const row of rows) {
      families.add(row.family);
      const priorTopic = topicByFamily.get(row.family);
      if (priorTopic !== undefined) assert.equal(row.topicLabel, priorTopic, row.family);
      topicByFamily.set(row.family, row.topicLabel);
    }
    originalFamiliesBySplit.set(split, families);
  }

  const mappedFamilies = new Set();
  const broadFamilySplits = new Map();
  const pairsBySplit = Object.fromEntries(splits.map((split) => [split, 0]));
  for (const group of mapping.groups) {
    assert.ok(splits.includes(group.split), `unknown split: ${group.split}`);
    assert.equal(typeof group.broadFamily, 'string');
    assert.ok(group.broadFamily.length > 0);
    assert.ok(Array.isArray(group.topicFamilies) && group.topicFamilies.length > 0);
    const priorSplit = broadFamilySplits.get(group.broadFamily);
    if (priorSplit !== undefined) assert.equal(group.split, priorSplit, group.broadFamily);
    broadFamilySplits.set(group.broadFamily, group.split);

    const topicLabels = new Set();
    for (const family of group.topicFamilies) {
      assert.ok(!mappedFamilies.has(family), `duplicate mapping: ${family}`);
      mappedFamilies.add(family);
      assert.ok(originalFamiliesBySplit.get(group.split).has(family), `${family} absent from ${group.split}`);
      topicLabels.add(topicByFamily.get(family));
    }
    if (group.topicFamilies.length > 1) {
      assert.equal(topicLabels.size, group.topicFamilies.length, `hard negatives need distinct topic labels: ${group.broadFamily}`);
      pairsBySplit[group.split] += group.topicFamilies.length * (group.topicFamilies.length - 1) / 2;
    }
  }

  assert.deepEqual([...mappedFamilies].sort(), [...topicByFamily.keys()].sort());
  assert.deepEqual(pairsBySplit, { train: 7, validation: 2, test: 2 });
  t.diagnostic(`Same-broad-family, distinct-topic hard-negative pairs: ${JSON.stringify(pairsBySplit)}`);
});
