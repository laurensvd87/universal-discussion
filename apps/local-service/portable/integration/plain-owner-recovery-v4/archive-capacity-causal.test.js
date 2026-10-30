// Pure causal admission check, no archive read, credentials, child, native API
// or SQL. The real fixed17 archive is larger than the old generic1GiB contract.
import test from 'node:test';import assert from 'node:assert/strict';
import {createRestoreArchivePump} from '../hierarchy-native-cluster.js';
import {AUTOMATIC18_OWNER_INPUTS} from '../automatic-topics-owner-native-check.js';
test('old generic pump rejects the actual fixed17-to18 dump metadata before any child or stream read',async()=>{
 let launched=0,read=0;
 const restore=createRestoreArchivePump({spawn(){launched++;throw Error('Unexpected child');},now:()=>0,setTimeout:()=>1,clearTimeout(){},environment:()=>({})});
 const dump={async *[Symbol.asyncIterator](){read++;yield Buffer.from('PGDMP');}};
 assert.ok(AUTOMATIC18_OWNER_INPUTS.dumpBytes>1073741824);
 await assert.rejects(restore({password:'synthetic-owned-role-only',dump,dumpBytes:AUTOMATIC18_OWNER_INPUTS.dumpBytes,
  dumpSha256:AUTOMATIC18_OWNER_INPUTS.dumpSha256,deadline:1000}),error=>error?.code==='OWNED_RESTORE_REQUEST');
 assert.equal(launched,0);assert.equal(read,0);
});
