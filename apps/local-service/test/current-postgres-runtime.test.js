import test from 'node:test'; import assert from 'node:assert/strict';
import {currentRuntimeRole} from '../src/ops/current-postgres-runtime.js';
test('normal API restarts retain its schema17 hotfix while crawler/worker/dashboard retain the original compatible release', () => {
  for (const operation of ['preflight','status','service']) assert.equal(currentRuntimeRole([operation]),'private-ai17');
  for (const operation of ['worker','crawler','dashboard']) assert.equal(currentRuntimeRole([operation]),'hierarchy17');
  for (const args of [[],null,['service','--port=1'],['prepare-runtime'],['seal-runtime'],['install-hierarchy'],
    ['upgrade-automatic-topics'],['set-hierarchy-policy'],['restore']]) assert.equal(currentRuntimeRole(args),null);
});
