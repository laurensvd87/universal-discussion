import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const directory = dirname(fileURLToPath(import.meta.url));
const challengeBytes = readFileSync(join(directory, 'challenge.jsonl'));
const mappingBytes = readFileSync(join(directory, 'challenge-broad-families.json'));
const frozenChallengeSha256 = '3037887840D52E38C397EEA20D0032D8C77343BB146A6AD65C69DB890D804006';
const frozenMappingSha256 = '0219FC75502C53F91B35A2D7490362B39549C05C3DF4229420C9103F404DEAEE';
const documents = challengeBytes.toString('utf8').trimEnd().split(/\r?\n/).map((line) => JSON.parse(line));
const manifest = JSON.parse(mappingBytes.toString('utf8'));

test('independent challenge is frozen and has paired hard negatives plus singleton no-match cases', (t) => {
  assert.equal(createHash('sha256').update(challengeBytes).digest('hex').toUpperCase(), frozenChallengeSha256);
  assert.equal(createHash('sha256').update(mappingBytes).digest('hex').toUpperCase(), frozenMappingSha256);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(documents.length, 56);

  const groups = new Map();
  const ids = new Set();
  for (const row of documents) {
    for (const field of ['id', 'family', 'topicLabel', 'viewpoint', 'title', 'body']) {
      assert.equal(typeof row[field], 'string', `${row.id}: ${field} must be text`);
      assert.ok(row[field].length > 0, `${row.id}: ${field} must not be empty`);
    }
    assert.ok(row.body.length >= 300 && row.body.length <= 900, `${row.id}: body length ${row.body.length}`);
    assert.ok(!ids.has(row.id), `duplicate id ${row.id}`);
    ids.add(row.id);
    if (!groups.has(row.family)) groups.set(row.family, new Map());
    const topics = groups.get(row.family);
    if (!topics.has(row.topicLabel)) topics.set(row.topicLabel, []);
    topics.get(row.topicLabel).push(row);
  }

  const manifestFamilies = new Set();
  let hardNegativeClasses = 0;
  let singletonCount = 0;
  for (const group of manifest.groups) {
    assert.ok(!manifestFamilies.has(group.family), `duplicate manifest family ${group.family}`);
    manifestFamilies.add(group.family);
    const topics = groups.get(group.family);
    assert.ok(topics, `manifest family absent from challenge: ${group.family}`);
    assert.deepEqual([...topics.keys()].sort(), [...group.topicLabels].sort(), `${group.family} topic labels`);

    if (group.kind === 'paired-entity') {
      assert.equal(group.topicLabels.length, 2, `${group.family} must contain two exact developments`);
      for (const topicLabel of group.topicLabels) {
        const rows = topics.get(topicLabel);
        assert.equal(rows.length, 3, `${group.family}/${topicLabel} document count`);
        assert.ok(new Set(rows.map((row) => row.viewpoint)).size >= 2, `${group.family}/${topicLabel} needs varied viewpoints`);
      }
      hardNegativeClasses += 1;
    } else {
      assert.equal(group.kind, 'singleton-no-match', `unknown kind ${group.kind}`);
      assert.equal(group.topicLabels.length, 1, `${group.family} must be a singleton development`);
      const rows = topics.get(group.topicLabels[0]);
      assert.equal(rows.length, 1, `${group.family} no-match count`);
      singletonCount += 1;
    }
  }

  assert.deepEqual([...groups.keys()].sort(), [...manifestFamilies].sort());
  assert.ok(hardNegativeClasses >= 8);
  assert.equal(hardNegativeClasses, 8);
  assert.equal(singletonCount, 8);
  t.diagnostic(`Challenge: ${documents.length} articles; ${hardNegativeClasses} same-entity/different-topic hard-negative classes; ${singletonCount} no-match singleton developments.`);
});
