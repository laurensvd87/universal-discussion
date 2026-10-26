import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat} from 'node:fs/promises';
import {describeExperiment,runCli} from './run.js';

test('read-only phase preflight verifies real pinned C receipt schema and fresh source/corpus bindings',async()=>{
  const d=await describeExperiment(),{freezeHash,...body}=d;
  assert.equal(freezeHash,createHash('sha256').update(JSON.stringify(body)).digest('hex'));
  assert.equal(d.rows,347);assert.equal(d.protocol.expectedSplits.calibration,205);assert.equal(d.protocol.expectedSplits.test,142);
  assert.equal(d.baselineFreezeHash,'7bf0ee5450ed3cf9768f08c678589767fa7277542a88aa8652f7bd6324ab91fb');
  for(const name of ['run.js','run.test.js','assessment.js','assessment.test.js','corpus.js','corpus-calibration.js','corpus-test.js','protocol.json'])
    assert.match(d.sourceHashes[name],/^[a-f0-9]{64}$/u);
  assert.equal(d.sourceHashes['../hierarchical-e5-broad-heads-v1/output/model.json'],d.protocol.baseline.modelSha256);
  assert.equal(d.sourceHashes['../hierarchical-e5-broad-heads-v1/output/policy.json'],d.protocol.baseline.policySha256);
});

test('inert or unsupported CLI never creates experiment phase evidence',async()=>{
  assert.equal(await runCli([]),'inert');await assert.rejects(()=>runCli(['--unknown']));
  // Test is a pre-freeze development check; it never requests an actual phase.
  const before=await lstat(new URL('output/freeze.started.json',import.meta.url)).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
  await assert.rejects(()=>runCli(['--freeze','--test']));
  const after=await lstat(new URL('output/freeze.started.json',import.meta.url)).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
  assert.equal(after?.mtimeMs,before?.mtimeMs);
});
