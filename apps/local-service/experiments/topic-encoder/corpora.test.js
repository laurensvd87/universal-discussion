import '../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { trainingCorpus, validateTrainingCorpus } from './data/train.js';
import { holdoutV2, validateHoldoutV2 } from './data/holdout-v2.js';
import { holdoutV3, validateHoldoutV3 } from './data/holdout-v3.js';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('only frozen synthetic corpora cross the model/evaluation boundary', () => {
  assert.deepEqual(validateTrainingCorpus(trainingCorpus), { documents: 240, topics: 60 });
  assert.equal(validateHoldoutV2(holdoutV2.documents).documents, 80);
  assert.equal(validateHoldoutV3(holdoutV3), true);
  assert.equal(digest(trainingCorpus), 'a64accfe78405af4508d0612aef565bd07373b1005f1688796f9fc7f5eb945d1');
  assert.equal(digest(holdoutV2), '90e6530f68cd3517c5a7d5a294f651d3d21017f59644de3b85eaea96cac6d96e');
  assert.equal(digest(holdoutV3), '382bcc715cebcbe37b80d86e79db5e09dcabc61c7526faf1e0abd6824af63d9a');
  assert.equal(trainingCorpus.documents.length, 240);
  assert.equal(holdoutV2.documents.length, 80);
  assert.equal(holdoutV3.documents.length, 104);
  assert.equal(new Set(trainingCorpus.documents.map(d => d.id)
    .concat(holdoutV2.documents.map(d => d.id), holdoutV3.documents.map(d => d.id))).size, 424);
  const trainingFamilies = new Set(trainingCorpus.documents.map(d => d.family));
  assert.ok(holdoutV2.documents.every(d => !trainingFamilies.has(d.family)));
  assert.ok(holdoutV3.documents.every(d => !trainingFamilies.has(d.familyId)));
});
