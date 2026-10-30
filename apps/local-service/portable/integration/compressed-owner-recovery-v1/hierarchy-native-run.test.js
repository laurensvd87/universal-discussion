import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createOwnedRunReader,createPrivateOwnedRunReader} from './hierarchy-native-run.js';
import {PRIVATE_RUN_ROOT} from './private-owner-storage.js';
import {createFileOps,createOwnedScopedPostgres,verifyScopedOwnership,FIXED} from './hierarchy-native-cluster.js';

const ROOT='D:\\GITProjekts\\universal-discussion-bootstrap\\apps\\local-service\\portable\\data\\hierarchy-native-runs';
const nonce='a'.repeat(48),runDirectory=ROOT+'\\run-'+nonce,temp=runDirectory+'\\output\\temp';
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])))+'\n';
test('all cluster dependency seams require the exact canonical fixed run parent shape',()=>{
 const valid=runDirectory+'\\cluster';
 const functions=Object.fromEntries(['now','setTimeout','clearTimeout','randomBytes','resources','binaries','prepare','noReparse','offlineAbsent','utility','freePort','spawnServer','ownership','createClient','persist'].map(name=>[name,()=>{throw new Error('must not execute');}]));
 for(const ownedParent of ['D:\\foreign',valid.replace('D:','C:'),valid.replace('D:','\\\\server\\share'),valid.replace(nonce,'A'.repeat(48)),valid.replace(nonce,'a'.repeat(47)),valid.replace(nonce,'a'.repeat(49)),valid+'\\x',valid+'\\..\\cluster',valid.toLowerCase(),valid.replace('\\cluster','\\output')]){
  assert.throws(()=>createFileOps({ownedParent}),{code:'OWNED_PARENT'});
  assert.throws(()=>createOwnedScopedPostgres({...functions,ownedParent}),{code:'OWNED_DEPENDENCIES'});
  assert.throws(()=>verifyScopedOwnership({ownedParent,runDirectory:ownedParent+'\\nhpg-Fake',dataDirectory:ownedParent+'\\nhpg-Fake\\pgdata'}),{code:'OWNERSHIP_PATH'});
 }
 assert.equal(typeof createOwnedScopedPostgres({...functions,ownedParent:valid}),'function');
 assert.equal(typeof createFileOps({ownedParent:valid,now:()=>0}).prepare,'function');
 const cluster=valid+'\\nhpg-Fake',dataDirectory=cluster+'\\pgdata',marker={schema:FIXED.marker,nonce,runDirectory:cluster};
 assert.equal(verifyScopedOwnership({ownedParent:valid,runDirectory:cluster,dataDirectory,marker,pid:123,markerText:JSON.stringify(marker),pidText:`123\n${dataDirectory}\n1700000000\n55433\n`}),1700000000);
});
function fixture(privateMode=false){
 const root=privateMode?PRIVATE_RUN_ROOT:ROOT,runDirectory=root+'\\run-'+nonce,temp=runDirectory+'\\output\\temp';
 const entries=new Map(),events=[];let serial=1,writeFailure=false,linkFailure=false;
 function entry(bytes=null){return {ino:serial++,dev:1,mtimeMs:1,ctimeMs:1,bytes:bytes===null?null:Buffer.from(bytes),symbolic:false};}
 function stats(e){return {ino:e.ino,dev:e.dev,size:e.bytes?.length??0,mtimeMs:e.mtimeMs,ctimeMs:e.ctimeMs,isFile:()=>e.bytes!==null,isDirectory:()=>e.bytes===null,isSymbolicLink:()=>e.symbolic};}
 function addDirs(name){while(!entries.has(name)){entries.set(name,entry());const next=path.win32.dirname(name);if(next===name)break;name=next;}}
 addDirs(temp);
 const catalog=Buffer.from('{"invented":true}\n'),marker={schema:privateMode?'private-hierarchy-native-owned-run':'hierarchy-native-owned-run',nonce,runDirectory,catalogSha256:sha(catalog)};
 const mark=entry(canonical(marker));entries.set(runDirectory+'\\run.json',mark);entries.set(runDirectory+'\\run.pending',mark);
 entries.set(runDirectory+'\\reviewed-sources.json',entry(catalog));
 const missing=()=>Object.assign(new Error('missing'),{code:'ENOENT'});
 const fs={
  async lstat(name){events.push(['lstat',name]);const e=entries.get(name);if(!e)throw missing();return stats(e);},
  async realpath(name){if(!entries.has(name))throw missing();return name;},
  async open(name,mode){events.push(['open',name,mode]);let e=entries.get(name);
   if(mode==='wx'){if(e)throw Object.assign(new Error('exists'),{code:'EEXIST'});e=entry('');entries.set(name,e);}
   else if(!e)throw missing();
   let offset=0;return {async stat(){return stats(e);},async close(){events.push(['close',name]);},
    async read(buffer,start,length){const n=Math.min(length,e.bytes.length-offset);e.bytes.copy(buffer,start,offset,offset+n);offset+=n;return {bytesRead:n};},
    async writeFile(bytes){if(writeFailure)throw new Error('invented write failure');e.bytes=Buffer.from(bytes);e.mtimeMs++;}};
  },
  async link(from,to){events.push(['link',from,to]);if(linkFailure)throw new Error('invented link failure');if(entries.has(to))throw Object.assign(new Error('exists'),{code:'EEXIST'});entries.set(to,entries.get(from));},
 };
 return {entries,events,fs,marker,temp,runDirectory,reader:()=>privateMode?createPrivateOwnedRunReader({fs,temp,pid:123}):createOwnedRunReader({fs,temp,pid:123}),
  setWriteFailure(){writeFailure=true;},setLinkFailure(){linkFailure=true;},
  rewriteMarker(value){const e=entries.get(runDirectory+'\\run.json');e.bytes=Buffer.from(canonical(value));},
 };
}
test('private binding has a disjoint fixed root/purpose and permanent private child claim',async()=>{
 const f=fixture(true),binding=await f.reader()();assert.equal(binding.runDirectory,f.runDirectory);assert.ok(binding.clusterParent.startsWith(PRIVATE_RUN_ROOT));
 const claim=JSON.parse(f.entries.get(f.runDirectory+'\\child.claim').bytes);assert.equal(claim.schema,'private-hierarchy-native-child-claim');
 const g=fixture(true);await assert.rejects(createOwnedRunReader({fs:g.fs,temp:g.temp,pid:123})(),{code:'OWNED_RUN_BINDING'});assert.equal(g.events.length,0);
 const h=fixture();await assert.rejects(createPrivateOwnedRunReader({fs:h.fs,temp:h.temp,pid:123})(),{code:'OWNED_RUN_BINDING'});assert.equal(h.events.length,0);
 const i=fixture(true);i.rewriteMarker({...i.marker,schema:'hierarchy-native-owned-run'});await assert.rejects(i.reader()(),{code:'OWNED_RUN_BINDING'});
});

test('owned run validates raw pins, closes canonical permanent claim and caches only its completed binding',async()=>{
 const f=fixture(),read=f.reader(),binding=await read();
 assert.deepEqual(binding,{runDirectory,clusterParent:runDirectory+'\\cluster',nonce,catalogSha256:f.marker.catalogSha256,markerSha256:sha(Buffer.from(canonical(f.marker)))});
 assert.ok(Object.isFrozen(binding));assert.equal(await read(),binding);
 const final=f.entries.get(runDirectory+'\\child.claim');assert.equal(final,f.entries.get(runDirectory+'\\child.pending'));
 assert.equal(final.bytes.toString(),canonical({catalogSha256:f.marker.catalogSha256,markerSha256:binding.markerSha256,nonce,pid:123,schema:'hierarchy-native-child-claim'}));
 const close=f.events.findIndex(e=>e[0]==='close'&&e[1].endsWith('child.pending')),link=f.events.findIndex(e=>e[0]==='link');assert.ok(close>=0&&link>close);
 await assert.rejects(f.reader()(),{code:'EEXIST'});
});

test('a failed permanent claim is never refunded or retried by the same or another reader',async()=>{
 for(const mode of ['setWriteFailure','setLinkFailure']){
  const f=fixture();f[mode]();const read=f.reader(),promise=read();await assert.rejects(promise);
  assert.equal(read(),promise);await assert.rejects(read());
  assert.ok(f.entries.has(runDirectory+'\\child.pending'));assert.equal(f.entries.has(runDirectory+'\\child.claim'),false);
  await assert.rejects(f.reader()(),{code:'EEXIST'});
 }
});

test('only the exact fixed TEMP shape can select an owned run',async()=>{
 for(const candidate of [undefined,temp.toLowerCase(),temp+'\\x',temp.replace(nonce,'A'.repeat(48)),temp.replace('output\\temp','output\\..\\output\\temp'),temp.replace(ROOT,ROOT+'-other')]){
  const f=fixture(),read=createOwnedRunReader({fs:f.fs,temp:candidate,pid:123});await assert.rejects(read(),{code:'OWNED_RUN_BINDING'});assert.equal(f.events.length,0);
 }
 const f=fixture();await assert.rejects(f.reader()({}),{code:'OWNED_RUN_BINDING'});assert.equal(f.events.length,0);
});

test('marker exact keys, primitives, canonical serialization and snapshot pins are mandatory',async()=>{
 const changes=[v=>({...v,extra:false}),v=>({...v,nonce:'b'.repeat(48)}),v=>({...v,runDirectory:runDirectory+'\\x'}),v=>({...v,catalogSha256:'0'.repeat(64)}),v=>({...v,schema:false})];
 for(const change of changes){const f=fixture();f.rewriteMarker(change(f.marker));await assert.rejects(f.reader()(),{code:'OWNED_RUN_BINDING'});assert.equal(f.entries.has(runDirectory+'\\child.pending'),false);}
 for(const change of [e=>{e.bytes=Buffer.from(JSON.stringify(JSON.parse(e.bytes)));},e=>{e.bytes=Buffer.alloc(1025,32);}]){
  const f=fixture();change(f.entries.get(runDirectory+'\\run.json'));await assert.rejects(f.reader()(),{code:'OWNED_RUN_BINDING'});
 }
 const f=fixture();f.entries.get(runDirectory+'\\reviewed-sources.json').bytes=Buffer.alloc(1048577,32);await assert.rejects(f.reader()(),{code:'OWNED_RUN_BINDING'});
});

test('hardlink, ancestor and open-handle identities must remain stable',async()=>{
 const f=fixture();const original=f.entries.get(runDirectory+'\\run.pending');f.entries.set(runDirectory+'\\run.pending',{...original,ino:999});await assert.rejects(f.reader()(),{code:'OWNED_RUN_BINDING'});
 const g=fixture();g.entries.get(ROOT).symbolic=true;await assert.rejects(g.reader()(),{code:'OWNED_RUN_BINDING'});
 const h=fixture(),open=h.fs.open;h.fs.open=async(name,mode)=>{const handle=await open(name,mode);if(name.endsWith('run.json'))return {...handle,async stat(){return {...await handle.stat(),ino:999};}};return handle;};
 await assert.rejects(h.reader()(),{code:'OWNED_RUN_BINDING'});
 const i=fixture(),realpath=i.fs.realpath;i.fs.realpath=async name=>name===ROOT?ROOT+'-replacement':realpath(name);await assert.rejects(i.reader()(),{code:'OWNED_RUN_BINDING'});
});

test('postclaim source or ancestor replacement refuses the binding and keeps its permanent attempt',async()=>{
 for(const change of [f=>{f.entries.get(runDirectory+'\\reviewed-sources.json').bytes=Buffer.from('tampered');},f=>{f.entries.get(runDirectory).ino=999;}]){
  const f=fixture(),link=f.fs.link;f.fs.link=async(...args)=>{await link(...args);change(f);};
  const read=f.reader(),promise=read();await assert.rejects(promise,{code:'OWNED_RUN_BINDING'});assert.equal(read(),promise);
  assert.ok(f.entries.has(runDirectory+'\\child.pending'));assert.ok(f.entries.has(runDirectory+'\\child.claim'));
 }
});

test('a validation failure remains rejected after invented source repair within the same reader',async()=>{
 const f=fixture(),original=f.entries.get(runDirectory+'\\reviewed-sources.json').bytes;
 f.entries.get(runDirectory+'\\reviewed-sources.json').bytes=Buffer.from('wrong');
 const read=f.reader(),promise=read();await assert.rejects(promise,{code:'OWNED_RUN_BINDING'});
 f.entries.get(runDirectory+'\\reviewed-sources.json').bytes=original;
 assert.equal(read(),promise);await assert.rejects(read(),{code:'OWNED_RUN_BINDING'});
 assert.equal(f.entries.has(runDirectory+'\\child.pending'),false);
});

test('file preparation refuses an existing exact cluster parent before creating a cluster',async()=>{
 const f=fixture();let attempts=0;
 const fs={...f.fs,async mkdir(name){assert.equal(name,runDirectory+'\\cluster');throw Object.assign(new Error('exists'),{code:'EEXIST'});},async mkdtemp(){attempts++;throw new Error('must not create');}};
 const ops=createFileOps({fs,utility:async()=> 'checked',now:()=>0,ownedParent:runDirectory+'\\cluster'});
 await assert.rejects(ops.prepare(nonce,1000),{code:'EEXIST'});assert.equal(attempts,0);
});
