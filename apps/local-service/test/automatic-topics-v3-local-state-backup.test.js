import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {createLocalStateBackupOperatorForTest} from '../src/ops/automatic-topics-v3-local-state-backup.js';
import {LOCAL_STATE_SLOTS} from '../src/ops/automatic-topics-v3-local-state-read-lease.js';

const paired={archiveSha256:'a'.repeat(64),receiptSha256:'b'.repeat(64),generation:'backup-generation',revision:12,schemaVersion:17,sealSha256:'c'.repeat(64),semanticRevision:'d'.repeat(64),fresh:true};

test('V3 archives capture both release manifests and reject the older archive envelope',async()=>{
 assert(LOCAL_STATE_SLOTS.includes('postgres-hierarchy-release-20261030-automatic-topics-manifest.json'));
 assert(LOCAL_STATE_SLOTS.includes('postgres-hierarchy-release-20261030-named-v3-manifest.json'));
 const f=fixture(),r=await f.operator.capture(),archive=f.archives.get(r.filename);
 assert.equal(archive.subarray(0,8).toString('ascii'),'MURLOC03');
 Buffer.from('MURLOC02').copy(archive,0);await assert.rejects(f.operator.verify(r.filename));
});
function fixture({schemaVersion=17,semanticRevision='d'.repeat(64),changedPair=false,changedFile=false,appeared=false,leaseCloseFailure=false,quiescenceFailure=false,verifyCorrupt=false,space=1e10}={}){
 const currentPair={...paired,schemaVersion,semanticRevision};
 const calls=[],archives=new Map(),files=new Map([['accounts.sqlite',Buffer.from('PRIVATE ACCOUNT DATA')],['account-key.protected',Buffer.from('PRIVATE KEY BLOB')],['topic-crawler.sqlite-wal',Buffer.alloc(140000,93)]]);let identities=0,ticks=0;
 const slots=LOCAL_STATE_SLOTS.map(id=>({id,leaf:id.startsWith('provider-')?null:id.split('/').at(-1),path:id,present:files.has(id),bytes:files.get(id)?.length??0}));
 function fdFor(get,set=()=>{}){let position=0,closed=false;return {async read(out,offset,n,at){assert.ok(n<=65536);calls.push('read');const b=get(),used=Math.min(n,Math.max(0,b.length-at));b.copy(out,offset,at,at+used);return {bytesRead:used};},async write(bytes,offset,n){const old=get(),out=Buffer.alloc(Math.max(old.length,position+n));old.copy(out);bytes.copy(out,position,offset,offset+n);position+=n;set(out);calls.push('ciphertext-write');return {bytesWritten:n};},async stat(){return {dev:1,ino:1,size:get().length,mtimeMs:1,ctimeMs:1};},async sync(){calls.push('sync');},async close(){assert.equal(closed,false);closed=true;calls.push('fd-close');}};}
 function held(name,archive=false){const map=archive?archives:files;assert.ok(map.has(name));return {fd:fdFor(()=>map.get(name)),path:name,initial:[1,1,map.get(name).length,1,1]};}
 const protection={async wrapKey(key){calls.push('wrap');return Buffer.from(key);},async unwrapKey(raw){calls.push('unwrap');return Buffer.from(raw);}};
 const lease={slots,async verify(){calls.push('lease-verify');if(appeared)throw Object.assign(new Error('PRIVATE new sidecar'),{code:'changed'});},async close(){calls.push('lease-close');if(leaseCloseFailure)throw false;}};
 const p={now:()=>1700000000000,monotonic:()=>ticks,protection:()=>protection,lease:()=>({async acquire(){calls.push('lease-acquire');return lease;}}),
  async prepare(){calls.push('prepare');},async freeBytes(){return space;},async open(name){calls.push('source-open');return held(name);},async unchanged(f){calls.push('unchanged');if(changedFile&&!archives.has(f.path))throw false;},sourcePath:s=>s.path,
  async create(name){calls.push('create');archives.set(name,Buffer.alloc(0));return fdFor(()=>archives.get(name),b=>archives.set(name,b));},async archive(name){calls.push('archive-open');if(verifyCorrupt&&name.endsWith('.partial')){const b=archives.get(name);b[b.length-1]^=1;}return held(name,true);},
  async publish(from,to){calls.push('publish');archives.set(to,archives.get(from));archives.delete(from);},async remove(name){calls.push('remove');archives.delete(name);}};
 const q={async assertQuiesced(){calls.push('quiescence');if(quiescenceFailure)throw false;},async captureFreshPostgresPair(){calls.push('capture-pg');return {...currentPair};},async readPostgresIdentity(){calls.push('identity-pg');identities++;return {...currentPair,revision:changedPair&&identities>1?13:12};}};
 return {operator:createLocalStateBackupOperatorForTest(q,p),calls,archives,p,q,files,slots,setTime:n=>{ticks=n;}};
}
test('closed allowlist streams encrypted paired bytes, authenticates then retires originals before publication',async()=>{
 const f=fixture(),result=await f.operator.capture();assert.equal(result.status,'verified');assert.equal(result.presentFiles,3);assert.equal(result.sourceBytes,[...f.files.values()].reduce((n,b)=>n+b.length,0));assert.deepEqual(result.pair,paired);assert.equal(result.testComposition,true);assert.equal(result.restoreImplemented,false);
 const names=[...f.archives.keys()];assert.deepEqual(names,[result.filename]);assert.equal(f.archives.get(result.filename).includes(Buffer.from('PRIVATE ACCOUNT DATA')),false);
 assert.equal(result.archiveSha256,createHash('sha256').update(f.archives.get(result.filename)).digest('hex'));
 assert.ok(f.calls.indexOf('capture-pg')>f.calls.indexOf('lease-acquire'));assert.ok(f.calls.indexOf('unwrap')<f.calls.indexOf('publish'));assert.ok(f.calls.indexOf('lease-close')<f.calls.indexOf('publish'));
 const check=await f.operator.verify(result.filename);assert.equal(check.authenticated,true);assert.deepEqual(check.pair,paired);assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
});

test('V2 authenticates17 and18 pairs and refuses legacy schemas, missing semantic identity and V1 wire',async()=>{
 for(const schemaVersion of [17,18]){
  const f=fixture({schemaVersion}),result=await f.operator.capture();assert.equal(result.pair.schemaVersion,schemaVersion);
  const raw=f.archives.get(result.filename);assert.equal(raw.subarray(0,8).toString(),'MURLOC03');assert.equal((await f.operator.verify(result.filename)).authenticated,true);
  raw.write('MURLOC01',0);await assert.rejects(f.operator.verify(result.filename));
 }
 for(const options of [{schemaVersion:9},{schemaVersion:16},{schemaVersion:19},{semanticRevision:null}]){
  const f=fixture(options);await assert.rejects(f.operator.capture());assert.equal(f.calls.includes('publish'),false);assert(f.calls.includes('lease-close'));
 }
 const low=fixture({space:2*1073741824});await assert.rejects(low.operator.capture(),{code:'local-state-space'});assert.equal(low.calls.includes('publish'),false);
});
test('full GCM authentication, header and pair tampering refuse verification',async()=>{
 for(const mode of ['tag','header','truncate']){const f=fixture(),result=await f.operator.capture(),raw=f.archives.get(result.filename);if(mode==='tag')raw[raw.length-1]^=1;if(mode==='header')raw[30]^=1;if(mode==='truncate')f.archives.set(result.filename,raw.subarray(0,raw.length-1));await assert.rejects(f.operator.verify(result.filename));}
 const f=fixture({verifyCorrupt:true});await assert.rejects(f.operator.capture());assert.equal(f.calls.includes('publish'),false);
});
test('quiescence, source change, newly appeared sidecar and PG pair change refuse publication without retry',async()=>{
 for(const options of [{quiescenceFailure:true},{changedFile:true},{appeared:true},{changedPair:true},{space:1}]){const f=fixture(options);await assert.rejects(f.operator.capture());assert.equal(f.calls.includes('publish'),false);assert.ok(f.calls.filter(c=>c==='capture-pg').length<=1);if(!options.quiescenceFailure)assert.ok(f.calls.includes('lease-close'));}
});
test('source slots, path-like IDs and file/aggregate limits cannot be smuggled into encrypted manifest',async()=>{
 for(const change of [s=>{s[0].id='../secret';},s=>{s[0].bytes=2147483649;},s=>{s[0].present=false;s[0].bytes=1;},s=>{s.pop();}]){const f=fixture();change(f.slots);await assert.rejects(f.operator.capture());assert.equal(f.calls.includes('publish'),false);}
});
test('lease retirement failure preserves earlier falsy error and poisons further attempts',async()=>{
 const f=fixture({changedFile:true,leaseCloseFailure:true});let caught;try{await f.operator.capture();}catch(error){caught=error;}assert.equal(caught,false);assert.equal(f.calls.filter(c=>c==='lease-close').length,1);assert.equal(f.calls.includes('publish'),false);await assert.rejects(f.operator.capture(),e=>e.code==='local-state-busy');
});
test('original lease acquisition is observed after deadline and then retired, never accepted as cancelled',async()=>{
 const f=fixture();let release,entered;const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;}),lease=f.p.lease;
 f.p.lease=()=>({async acquire(){entered();await gate;return lease().acquire();}});f.operator=createLocalStateBackupOperatorForTest(f.q,f.p);let settled=false;const work=f.operator.capture().finally(()=>{settled=true;});await started;f.setTime(330001);await Promise.resolve();assert.equal(settled,false);release();await assert.rejects(work,e=>e.code==='local-state-deadline');assert.equal(f.calls.includes('lease-close'),true);assert.equal(f.calls.includes('publish'),false);
});
test('no arbitrary archive paths, nonfresh PG pair or boolean quiescence are accepted',async()=>{
 const f=fixture();for(const name of ['../x','C:\\secret','local-state-x.murmingle-localbackup'])await assert.rejects(f.operator.verify(name));assert.throws(()=>createLocalStateBackupOperatorForTest(true,f.p));f.q.captureFreshPostgresPair=async()=>({...paired,fresh:false});f.operator=createLocalStateBackupOperatorForTest(f.q,f.p);await assert.rejects(f.operator.capture());assert.equal(f.calls.includes('publish'),false);
});
test('authenticated but malformed manifest IDs/paths/hashes and trailing content are refused',async()=>{
 for(const mode of ['duplicate','path','hash','trailing']){
  const f=fixture(),result=await f.operator.capture(),raw=f.archives.get(result.filename),n=raw.readUInt32BE(8),aad=raw.subarray(12,12+n),header=JSON.parse(aad),key=Buffer.from(header.keyWrap.data,'base64'),iv=Buffer.from(header.iv,'base64');
  const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(aad);decipher.setAuthTag(raw.subarray(raw.length-16));const payload=Buffer.concat([decipher.update(raw.subarray(12+n,raw.length-16)),decipher.final()]),m=payload.readUInt32BE(0),manifest=JSON.parse(payload.subarray(4,4+m));
  if(mode==='duplicate')manifest.slots[1].id=manifest.slots[0].id;if(mode==='path')manifest.slots[0].leaf='../escape';if(mode==='hash')manifest.slots.find(s=>s.present).sha256='f'.repeat(64);
  const encoded=Buffer.from(JSON.stringify(manifest)),length=Buffer.alloc(4);length.writeUInt32BE(encoded.length);const changed=Buffer.concat([length,encoded,payload.subarray(4+m),...(mode==='trailing'?[Buffer.from('trailing')]:[])]);header.payloadBytes=changed.length;
  const newAad=Buffer.from(JSON.stringify(header)),prefix=Buffer.alloc(12);raw.copy(prefix,0,0,8);prefix.writeUInt32BE(newAad.length,8);const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(newAad);f.archives.set(result.filename,Buffer.concat([prefix,newAad,cipher.update(changed),cipher.final(),cipher.getAuthTag()]));key.fill(0);payload.fill(0);changed.fill(0);
  await assert.rejects(f.operator.verify(result.filename));
 }
});
test('wrong-user key unwrap failure exposes no plaintext and prevents publication',async()=>{
 const f=fixture(),original=f.p.protection;f.p.protection=()=>({...original(),async unwrapKey(){throw new Error('PRIVATE wrong Windows user');}});f.operator=createLocalStateBackupOperatorForTest(f.q,f.p);await assert.rejects(f.operator.capture());assert.equal(f.calls.includes('publish'),false);assert.ok(f.calls.includes('lease-close'));
});
