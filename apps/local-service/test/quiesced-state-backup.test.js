import test from 'node:test';
import assert from 'node:assert/strict';
import {captureQuiescedStateBackupForTest as capture} from '../src/ops/quiesced-state-backup.js';

function fixture({busy=false,otherClients=0,changed=false,changedArchive=false,badLocal=false,closeFailure=false,lateOpen=false}={}){
 const calls=[],hashes=Array.from({length:9},(_,i)=>String(i).repeat(64));let ticks=0,created=false,archiveReads=0,pair;
 const state={database:'murmingle_canonical',role:'murmingle_owner',address:'127.0.0.1',port:55432,server_start:'original-server',generation:'original-generation',revision:'8',schema_version:9,other_clients:otherClients};
 const pg={filename:'postgres-canonical-2026-10-28T22-00-00-000Z-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.murmingle-pgbackup',verified:true,cleanupVerified:true,migrations:[...hashes],version:{generation:state.generation,revision:8}};
 const owner={async read(){calls.push('state');return {...state,revision:changed&&created?'9':'8'};},async close(){calls.push('close');if(closeFailure)throw false;}};
 const ports={async verifyRelease(){calls.push('seal');},async hostQuiesced(){calls.push('host');if(busy)throw false;},async openOwner(){calls.push('open');if(lateOpen)ticks=330001;return owner;},
  async manifest(){return hashes.map(hash=>({hash}));},now:()=>ticks,
  async createPostgres(){calls.push('postgres-create');created=true;return pg;},async verifyPostgres(name){assert.equal(name,pg.filename);calls.push('postgres-verify');return {verified:true,version:{...pg.version}};},
  async hashArchive(){calls.push('archive-hash');return changedArchive&&archiveReads++>0?'b'.repeat(64):'a'.repeat(64);},async hashReceipt(){return 'c'.repeat(64);},async legacySeal(){return 'd'.repeat(64);},
  async persistPostgresReceipt(){calls.push('pg-receipt');return {name:'quiesced-postgres-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json',sha256:'c'.repeat(64)};},
  local(q){return {async capture(){calls.push('local-held');await q.assertQuiesced();pair=await q.captureFreshPostgresPair();assert.deepEqual(await q.readPostgresIdentity(),pair);calls.push('local-published');return {status:'verified',filename:'local-ciphertext',archiveSha256:'e'.repeat(64),pair,presentFiles:3,sourceBytes:500};},
   async verify(){calls.push('local-verify');return {authenticated:!badLocal,archiveSha256:'e'.repeat(64),pair};}};},
 };
 return {ports,calls,pg,state};
}

test('fresh PostgreSQL is captured inside the held local lease and both archives are verified before return',async()=>{
 const f=fixture(),r=await capture(f.ports);assert.equal(r.status,'verified');assert.equal(r.testComposition,true);assert.equal(r.observedQuiescencePassed,false);assert.equal(r.restoreImplemented,false);assert.equal(r.servicesRestarted,false);
 assert.equal(r.pair.generation,'original-generation');assert.equal(r.pair.revision,8);assert.equal(r.pair.schemaVersion,9);
 assert.ok(f.calls.indexOf('local-held')<f.calls.indexOf('postgres-create'));assert.ok(f.calls.indexOf('postgres-verify')<f.calls.indexOf('local-published'));
 assert.equal(f.calls.filter(v=>v==='postgres-create').length,1);assert.equal(f.calls.filter(v=>v==='close').length,1);assert.ok(f.calls.includes('local-verify'));
});
test('running original services or remaining database clients cannot start either backup',async()=>{
 for(const options of [{busy:true},{otherClients:1}]){const f=fixture(options);await assert.rejects(capture(f.ports));assert.equal(f.calls.includes('postgres-create'),false);assert.equal(f.calls.includes('local-held'),false);if(options.busy)assert.equal(f.calls.includes('open'),false);}
});
test('state, archive, local authentication and migration discrepancies never return an accepted pair',async()=>{
 for(const options of [{changed:true},{changedArchive:true},{badLocal:true}]){const f=fixture(options);await assert.rejects(capture(f.ports));assert.equal(f.calls.filter(v=>v==='close').length,1);assert.equal(f.calls.filter(v=>v==='postgres-create').length,1);}
 const f=fixture();f.pg.migrations[0]='f'.repeat(64);await assert.rejects(capture(f.ports));assert.equal(f.calls.includes('local-published'),false);
});
test('wrong role, database, schema or server cannot authorize capture',async()=>{
 for(const patch of [{role:'murmingle_app'},{database:'other'},{schema_version:17},{port:55433},{address:'0.0.0.0'}]){const f=fixture();Object.assign(f.state,patch);await assert.rejects(capture(f.ports));assert.equal(f.calls.includes('postgres-create'),false);assert.equal(f.calls.filter(v=>v==='close').length,1);}
});
test('late acquired owner is retired and earlier falsy errors survive cleanup failures',async()=>{
 const f=fixture({lateOpen:true});await assert.rejects(capture(f.ports));assert.equal(f.calls.filter(v=>v==='close').length,1);assert.equal(f.calls.includes('postgres-create'),false);
 const g=fixture({closeFailure:true});g.ports.hostQuiesced=async()=>{if(g.calls.includes('open'))throw undefined;};let caught='not-thrown';try{await capture(g.ports);}catch(error){caught=error;}assert.equal(caught,undefined);assert.equal(g.calls.filter(v=>v==='close').length,1);
});
test('dependency accessors, proxies and unexpected selectors cannot execute work',async()=>{
 const f=fixture();let hooks=0;const bad={...f.ports};Object.defineProperty(bad,'hostQuiesced',{enumerable:true,get(){hooks++;throw false;}});await assert.rejects(capture(bad));await assert.rejects(capture(new Proxy(f.ports,{ownKeys(){hooks++;throw false;}})));assert.equal(hooks,0);assert.equal(f.calls.length,0);
});
