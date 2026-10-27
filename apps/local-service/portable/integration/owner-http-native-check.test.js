// No listener, child, database, encoder or provider is invoked.
import test from 'node:test';
import assert from 'node:assert/strict';
import {main,runOwnerHttpNativeCheck,runOwnerModelNativeCheck,runOwnerProductNativeCheck} from './owner-http-native-check.js';
import {runOwnerRestoreNativeCheck} from './owner-restore-native-check.js';

test('private HTTP entry is inert and rejects target, callback and CLI selectors before native work',async()=>{
 assert.equal(await main(['--port','4185']),2);assert.equal(await main(['callback']),2);
 assert.equal(await main(['--with-model','extra']),2);assert.equal(await main(['--model']),2);
 await assert.rejects(runOwnerHttpNativeCheck({port:4185}),{code:'RESTORE_ONESHOT'});
 await assert.rejects(runOwnerHttpNativeCheck(()=>{}),{code:'RESTORE_ONESHOT'});
 await assert.rejects(runOwnerRestoreNativeCheck('http'),{code:'RESTORE_ONESHOT'});
 await assert.rejects(runOwnerModelNativeCheck({encoder:{}}),{code:'RESTORE_ONESHOT'});
 await assert.rejects(runOwnerModelNativeCheck(()=>{}),{code:'RESTORE_ONESHOT'});
 assert.equal(await main(['--with-product','extra']),2);
 await assert.rejects(runOwnerProductNativeCheck({browser:{}}),{code:'RESTORE_ONESHOT'});
});
