import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProtectedAccountKey } from '../src/accounts/protected-account-key.js';

function fixture(t) {
  const dataDir=mkdtempSync(join(tmpdir(),'discussion-protected-key-fixture-'));
  t.after(()=>rmSync(dataDir,{recursive:true,force:true}));
  const calls=[];
  const crypt=async(operation,value)=>{
    calls.push(operation);
    if(operation==='protect') return Buffer.concat([Buffer.from('fixture-protected:'),Buffer.from(value).map(byte=>byte^0xa5)]);
    if(!value.subarray(0,18).equals(Buffer.from('fixture-protected:'))) throw new Error('fixture-corruption-private');
    return value.subarray(18).map(byte=>byte^0xa5);
  };
  return {dataDir,crypt,calls,filename:join(dataDir,'account-key.protected')};
}

test('Windows key creation persists only injected protected blob and restart unprotects same key',async t=>{
  const f=fixture(t); const key=await loadProtectedAccountKey({...f,platform:'win32'});
  assert.equal(key.length,32); assert.deepEqual(f.calls,['protect']);
  const bytes=readFileSync(f.filename); assert.ok(!bytes.includes(key));
  assert.deepEqual(await loadProtectedAccountKey({...f,platform:'win32'}),key);
  assert.deepEqual(f.calls,['protect','unprotect']);
});

test('simultaneous creation converges on the persisted protected key rather than replacing it',async t=>{
  const f=fixture(t);
  const [first,second]=await Promise.all([loadProtectedAccountKey({...f,platform:'win32'}),loadProtectedAccountKey({...f,platform:'win32'})]);
  assert.deepEqual(first,second); assert.deepEqual(await loadProtectedAccountKey({...f,platform:'win32'}),first);
  assert.equal(f.calls.filter(operation=>operation==='protect').length,2);
  assert.equal(f.calls.filter(operation=>operation==='unprotect').length,2);
});

test('corrupt existing blob refuses without key replacement or raw adapter error disclosure',async t=>{
  const f=fixture(t); writeFileSync(f.filename,Buffer.from('corrupt-fixture'));
  await assert.rejects(loadProtectedAccountKey({...f,platform:'win32'}),error=>error.message==='Protected local account key unavailable');
  assert.equal(readFileSync(f.filename).toString(),'corrupt-fixture'); assert.deepEqual(f.calls,['unprotect']);
});

test('empty/oversized stored blobs and invalid unprotected key lengths are refused',async t=>{
  const f=fixture(t);
  for(const value of [Buffer.alloc(0),Buffer.alloc(1025)]) {
    writeFileSync(f.filename,value);
    await assert.rejects(loadProtectedAccountKey({...f,platform:'win32'}),/Protected local account key unavailable/);
  }
  writeFileSync(f.filename,Buffer.from('bounded-cipher-fixture'));
  for(const value of [Buffer.alloc(31),Buffer.alloc(33),'not-bytes']) {
    await assert.rejects(loadProtectedAccountKey({dataDir:f.dataDir,platform:'win32',crypt:async()=>value}),/Protected local account key unavailable/);
  }
});

test('invalid protection output never creates a key file; no actual process or network is called',async t=>{
  const f=fixture(t); t.mock.method(globalThis,'fetch',()=>{throw new Error('network-denied');});
  for(const output of [Buffer.alloc(0),Buffer.alloc(1025),'not-bytes']) {
    await assert.rejects(loadProtectedAccountKey({dataDir:f.dataDir,platform:'win32',crypt:async()=>output}),/Protected local account key unavailable/);
    assert.throws(()=>readFileSync(f.filename),error=>error.code==='ENOENT');
  }
});

test('protection adapter failure is content-free and leaves no partial key',async t=>{
  const f=fixture(t);
  await assert.rejects(loadProtectedAccountKey({dataDir:f.dataDir,platform:'win32',crypt:async()=>{throw new Error('fixture-private-key-adapter-material');}}),
    error=>error.message==='Protected local account key unavailable');
  assert.throws(()=>readFileSync(f.filename),error=>error.code==='ENOENT');
});

test('race loser unprotect failure stays content-free while winner key remains intact',async t=>{
  const f=fixture(t);
  const crypt=async(operation,value)=>{
    if(operation==='unprotect') throw new Error('fixture-private-race-error');
    return f.crypt(operation,value);
  };
  const results=await Promise.allSettled([loadProtectedAccountKey({dataDir:f.dataDir,platform:'win32',crypt}),
    loadProtectedAccountKey({dataDir:f.dataDir,platform:'win32',crypt})]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  const rejected=results.find(result=>result.status==='rejected');
  assert.equal(rejected.reason.message,'Protected local account key unavailable');
  const winner=results.find(result=>result.status==='fulfilled').value;
  assert.deepEqual(await loadProtectedAccountKey({...f,platform:'win32'}),winner);
});
