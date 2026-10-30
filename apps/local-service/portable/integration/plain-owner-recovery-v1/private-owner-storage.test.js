import test from 'node:test';
import assert from 'node:assert/strict';
import {PRIVATE_RUN_ROOT,createPrivateOwnerStorageVerifier,isPrivateRunDirectory} from './private-owner-storage.js';
const run=PRIVATE_RUN_ROOT+'\\run-'+'a'.repeat(48);
test('private storage uses only exact fixed roots and read-only bounded ACL verification',async()=>{
 let calls=0;const verify=createPrivateOwnerStorageVerifier({now:()=>1,utility:async(exe,args,settings)=>{calls++;assert.equal(exe,'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');assert.equal(settings.deadline,100);assert.equal(settings.input,JSON.stringify({runDirectory:run,clusterReady:false}));assert.equal(settings.collect,true);
 const script=Buffer.from(args.at(-1),'base64').toString('utf16le');assert.match(script,/Get-Acl/u);assert.match(script,/GetAccessRules\(\$true,\$true/u);assert.match(script,/S-1-5-18/u);assert.match(script,/ReparsePoint/u);assert.match(script,/\$rules.Count -ne 2/u);assert.doesNotMatch(script,/Set-Acl|CreateDirectory|SetAccessRule|icacls|Remove-Item/u);return 'private-owner-storage-ok';}});
 assert.equal(await verify(run,100),true);assert.equal(calls,1);
});
test('foreign paths, purpose substitution and expired clocks never invoke the utility',async()=>{
 let calls=0;const verify=createPrivateOwnerStorageVerifier({now:()=>100,utility:async()=>{calls++;}});
 for(const value of [run.toLowerCase(),run+'\\x',run.replace('run-','run-A'),run.replace('C:','D:'),run+'\\..\\cluster',null]){assert.equal(isPrivateRunDirectory(value),false);await assert.rejects(verify(value,200),{code:'PRIVATE_STORAGE'});}
 await assert.rejects(verify(run,100),{code:'PRIVATE_STORAGE'});assert.equal(calls,0);
});
test('ACL refusal and late original ACL response cannot establish privacy',async()=>{
 let time=1;const wrong=createPrivateOwnerStorageVerifier({now:()=>time,utility:async()=> 'other'});await assert.rejects(wrong(run,100),{code:'PRIVATE_STORAGE'});
 const late=createPrivateOwnerStorageVerifier({now:()=>time,utility:async()=>{time=101;return 'private-owner-storage-ok';}});await assert.rejects(late(run,100),{code:'PRIVATE_STORAGE'});
});
test('cluster ACLs are verified only at the explicit post-prepare phase',async()=>{
 let calls=0;const verify=createPrivateOwnerStorageVerifier({now:()=>1,utility:async(exe,args,settings)=>{calls++;assert.deepEqual(JSON.parse(settings.input),{runDirectory:run,clusterReady:true});const script=Buffer.from(args.at(-1),'base64').toString('utf16le');assert.match(script,/if\(\$request.clusterReady -eq \$true\)/u);assert.match(script,/Get-ChildItem -LiteralPath \$cluster -Directory/u);return 'private-owner-storage-ok';}});
 assert.equal(await verify(run,100,true),true);assert.equal(calls,1);await assert.rejects(verify(run,100,'true'),{code:'PRIVATE_STORAGE'});assert.equal(calls,1);
});
