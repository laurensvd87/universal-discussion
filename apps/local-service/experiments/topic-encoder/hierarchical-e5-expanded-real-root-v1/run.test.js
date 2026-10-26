import test from 'node:test';
import assert from 'node:assert/strict';
import {runCli} from './run.js';
test('runner default is inert without reading cohorts, creating phases or loading encoder',async()=>{
 assert.equal(await runCli([]),'inert');
});
test('unknown phase and unsupervised freeze refuse before any marker or dataset read',async()=>{
 await assert.rejects(()=>runCli(['--train-again']));
 await assert.rejects(()=>runCli(['--freeze','--test']));
 assert.equal(process.env.MURMINGLE_EXPANDED_ROOT_V1_SUPERVISED,undefined);
 await assert.rejects(()=>runCli(['--freeze']));
});
