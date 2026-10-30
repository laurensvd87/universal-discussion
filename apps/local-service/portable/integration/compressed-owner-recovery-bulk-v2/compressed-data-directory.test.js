import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';
import {createCompressedDataDirectory} from './compressed-data-directory.js';import {PRIVATE_RUN_ROOT} from './private-owner-storage.js';
const fixed=path.win32.join(PRIVATE_RUN_ROOT,'run-'+'a'.repeat(48),'cluster','nhpg-ABC123','pgdata');
test('only new exact C pgdata scope is sent to the fixed bounded utility',async()=>{
 const calls=[],prepare=createCompressedDataDirectory({now:()=>1,utility:async(...args)=>{calls.push(args);return 'compressed-owned-pgdata-ok';}});
 for(const name of ['D:\\live\\pgdata',PRIVATE_RUN_ROOT,fixed+'\\other',fixed.replace('run-','run-..'),fixed.replace('pgdata','pgdata\\..\\pgdata')])await assert.rejects(prepare(name,100),{code:'COMPRESSED_STORAGE'});
 assert.equal(calls.length,0);assert.equal(await prepare(fixed,100),true);assert.equal(calls.length,1);
 const [exe,args,options]=calls[0];assert.equal(exe,'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');assert.equal(options.deadline,100);assert.deepEqual(JSON.parse(options.input),{dataDirectory:fixed});
 const script=Buffer.from(args.at(-1),'base64').toString('utf16le');assert.match(script,/Get-ChildItem/);assert.match(script,/0x9C040/);assert.match(script,/GetAccessRules/);
});
test('failed or late physical preparation never becomes a successful initdb prerequisite',async()=>{
 let time=0;const rejected=createCompressedDataDirectory({now:()=>time,utility:async()=>''});await assert.rejects(rejected(fixed,10),{code:'COMPRESSED_STORAGE'});
 const late=createCompressedDataDirectory({now:()=>time,utility:async()=>{time=11;return 'compressed-owned-pgdata-ok';}});await assert.rejects(late(fixed,10),{code:'COMPRESSED_STORAGE'});
 let called=false;const expired=createCompressedDataDirectory({now:()=>11,utility:async()=>{called=true;}});await assert.rejects(expired(fixed,10));assert.equal(called,false);
});
