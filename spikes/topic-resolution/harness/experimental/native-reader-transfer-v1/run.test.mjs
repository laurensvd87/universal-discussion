import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {phaseFor,awaitNativeStartup,nativeDrainRequest,validateNativeDrainAck,awaitNativeBrowserDrain,publishNativeDrainRequest} from './run.mjs';
const H='a'.repeat(64),P='b'.repeat(64),sha=b=>createHash('sha256').update(b).digest('hex');
function stream(){const s=new EventEmitter();s.resume=()=>{};s.pause=()=>{};return s;}
test('default entry is inert and only two literal explicit phases exist',()=>{
 assert.equal(phaseFor([]),null);assert.equal(phaseFor(['--run-study']),'--run-study');assert.equal(phaseFor(['--prepare-reviewed-study']),'--prepare-reviewed-study');
 for(const a of [['--retry'],['--run-study','1'],['--prepare']])assert.throws(()=>phaseFor(a));
});
test('byte-exact owned-Job startup handshake precedes any client work and removes own listeners',async()=>{
 const input=stream();const p=awaitNativeStartup({input,supervised:'1'});input.emit('data',Buffer.from('NATIVE_ROOT_'));input.emit('data',Buffer.from('STUDY_JOB_ASSIGNED_V1\n'));
 assert.equal(await p,true);assert.equal(input.listenerCount('data'),0);assert.equal(input.listenerCount('end'),0);
 for(const bytes of [Buffer.from('wrong\n'),Buffer.from('NATIVE_ROOT_STUDY_JOB_ASSIGNED_V1\nextra'),Buffer.from([0xce])]){
  const s=stream(),q=awaitNativeStartup({input:s,supervised:'1'});s.emit('data',bytes);await assert.rejects(q);assert.equal(s.listenerCount('data'),0);
 }
 await assert.rejects(awaitNativeStartup({input:stream(),supervised:'0'}));
});
test('missing/expired startup cannot silently authorize client or model work',async()=>{
 const input=stream();let expire;const p=awaitNativeStartup({input,supervised:'1',schedule:fn=>{expire=fn;return 1;},cancel:()=>{}});expire();await assert.rejects(p);
 const s=stream(),q=awaitNativeStartup({input:s,supervised:'1'});s.emit('end');await assert.rejects(q);
});
function request(){return nativeDrainRequest({captureHash:H,accounted:32,available:29,producerProfileHash:P},{freezeSha256:H,profile:{producerProfile:{producerProfileHash:P}}});}
test('drain identity binds all32 capture and exact producer; forged root proof cannot reuse it',()=>{
 const r=request();assert.equal(r.accounted,32);assert.equal(r.available,29);assert.ok(Object.isFrozen(r));
 const ack={schema:'native-root-browser-drain-ack/v1',requestSha256:H,originalNodePid:123,browserDescendantsAbsent:true,freezeSha256:P};
 assert.deepEqual(validateNativeDrainAck(ack,{requestSha256:H,originalNodePid:123,freezeSha256:P}),ack);
 for(const change of [{originalNodePid:124},{browserDescendantsAbsent:false},{freezeSha256:H},{requestSha256:P},{extra:true}])
  assert.throws(()=>validateNativeDrainAck({...ack,...change},{requestSha256:H,originalNodePid:123,freezeSha256:P}));
 assert.throws(()=>nativeDrainRequest({captureHash:H,accounted:31,available:29,producerProfileHash:P},{freezeSha256:H,profile:{producerProfile:{producerProfileHash:P}}}));
});
test('actual ack polling never treats timeout or missing file as browser drain; returns both exact byte hashes',async()=>{
 let now=0,written=null,reads=0;const r=request();
 const result=await awaitNativeBrowserDrain({request:r,guard:()=>{},originalNodePid:77,clock:()=>now,pause:async ms=>{now+=ms;},
  writeRequest:async b=>{assert.equal(written,null);written=Buffer.from(b);},readAck:async()=>{
   if(++reads===1)throw Object.assign(new Error('invented absent'),{code:'ENOENT'});
   return Buffer.from(JSON.stringify({schema:'native-root-browser-drain-ack/v1',requestSha256:sha(written),originalNodePid:77,browserDescendantsAbsent:true,freezeSha256:H}));
  }});
 assert.equal(result.requestSha256,sha(written));assert.equal(reads,2);assert.equal(now,25);assert.equal(result.ack.originalNodePid,77);
 now=0;await assert.rejects(awaitNativeBrowserDrain({request:r,guard:()=>{},clock:()=>now,pause:async ms=>{now+=ms;},writeRequest:async()=>{},
  readAck:async()=>{throw Object.assign(new Error('invented absent'),{code:'ENOENT'});}}));assert.equal(now,30000);
});
test('source wires actual fixed client/native reader/E5 only after handshake and separate drain ACK, never old packets',async()=>{
 const src=await readFile(new URL('./run.mjs',import.meta.url),'utf8');assert.ok(src.indexOf('await awaitNativeStartup()')<src.indexOf("await import(pathToFileURL"));
 assert.ok(src.indexOf('assert.ok(drain?.ack.browserDescendantsAbsent)')<src.indexOf('await import(\'../../../../../apps/local-service/src/crawler/packaged-e5.js\')'));
 assert.ok(src.includes('hashContents:false'));assert.ok(src.includes("stage.recheck()"));assert.ok(src.includes("{flag:'wx'}"));
 assert.ok(!src.includes('input.packet'));assert.ok(!src.includes('vector.packet'));assert.ok(!src.includes('fetch('));assert.ok(!src.includes('createPrivate'));
});

test('published drain request is complete before atomic exclusive link; incomplete/failed writes never publish',async()=>{
 let complete,linked=false;const pending=new Promise(yes=>{complete=yes;});
 const p=publishNativeDrainRequest(Buffer.from('invented metadata'),{writePending:async()=>pending,publish:async()=>{linked=true;}});
 await Promise.resolve();assert.equal(linked,false);complete();await p;assert.equal(linked,true);
 linked=false;await assert.rejects(publishNativeDrainRequest(Buffer.from('invented metadata'),{writePending:async()=>{throw Error('invented failed write');},publish:async()=>{linked=true;}}));
 assert.equal(linked,false);await assert.rejects(publishNativeDrainRequest(Buffer.alloc(4097),{writePending:async()=>{},publish:async()=>{linked=true;}}));assert.equal(linked,false);
 let publications=0;await assert.rejects(publishNativeDrainRequest(Buffer.from('invented metadata'),{writePending:async()=>{},publish:async()=>{publications++;throw Object.assign(Error('invented exists'),{code:'EEXIST'});}}));assert.equal(publications,1);
});
