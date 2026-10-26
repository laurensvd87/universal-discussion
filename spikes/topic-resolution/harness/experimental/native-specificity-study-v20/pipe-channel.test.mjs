// FAKE streams only. The one source read below is static inspection of this module.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createOwnedSpecificityPipeChannel,PIPE_HANDSHAKE,PIPE_LIMITS} from './pipe-channel.mjs';

const REQUEST=Buffer.from('{"schema":"native-specificity-fs-request/v1"}\n');
const RESPONSE=Buffer.from('{"schema":"native-specificity-fs-proof/v1"}\n');
class FakeInput extends EventEmitter{}
class FakeOutput extends EventEmitter{
 constructor(){super();this.callbacks=[];this.frames=[];this.backpressure=false;this.hook=null;}
 write(frame,callback){this.frames.push(frame);this.callbacks.push(callback);this.hook?.(frame,callback);return this.backpressure;}
}
function fixture(){const input=new FakeInput(),output=new FakeOutput();let time=0,guards=0;
 const config={input,output,guard(){guards++;return true;},clock:()=>time,deadline:10000};
 return {input,output,config,setTime:n=>{time=n;},guards:()=>guards,make:()=>createOwnedSpecificityPipeChannel(config)};}
async function ready(f){const c=f.make();assert.equal(c.start(),true);const waiting=c.waitHandshake();f.input.emit('data',Buffer.from(PIPE_HANDSHAKE));assert.equal(await waiting,true);return c;}
async function complete(f,c,request=REQUEST,response=RESPONSE){const waiting=c.write(request);f.output.callbacks.at(-1)();assert.equal(await waiting,true);const reading=c.readChunk();f.input.emit('data',response);assert.deepEqual(await reading,response);}
function sizedFrame(n){return Buffer.from('{"x":"'+'a'.repeat(n-9)+'"}\n');}

test('module closure is builtin-only/default-inert and factory registers zero fake callbacks',async()=>{
 const source=readFileSync(new URL('./pipe-channel.mjs',import.meta.url),'utf8');
 assert.deepEqual([...source.matchAll(/\bimport\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/gu)].map(m=>m[1]),['node:util']);
 assert.equal(/\b(?:process\s*\.|import\s*\(|require\s*\(|setTimeout\s*\(|setInterval\s*\()/u.test(source),false);
 const f=fixture(),c=f.make();assert.equal(f.guards(),0);assert.equal(f.input.eventNames().length,0);assert.equal(f.output.eventNames().length,0);assert.equal(f.output.frames.length,0);assert.equal(c.snapshot().started,false);
 const imported=await import('./pipe-channel.mjs?inert-invented-test');assert.equal(typeof imported.createOwnedSpecificityPipeChannel,'function');assert.equal(f.input.eventNames().length,0);
});

test('constructor refuses proxy/accessor/method hooks and captures no default clock or streams',()=>{
 const f=fixture();let hooks=0;const proxy=new Proxy({}, {getPrototypeOf(){hooks++;throw Error();},get(){hooks++;throw Error();}});
 for(const patch of [{input:proxy},{input:null},{output:f.input},{clock:null},{deadline:NaN},{deadline:Infinity},{deadline:-1}])assert.throws(()=>createOwnedSpecificityPipeChannel({...f.config,...patch}));
 const getter={};Object.defineProperty(getter,'on',{get(){hooks++;throw Error();}});assert.throws(()=>createOwnedSpecificityPipeChannel({...f.config,input:getter}));
 const bad={...f.config};Object.defineProperty(bad,'clock',{get(){hooks++;throw Error();}});assert.throws(()=>createOwnedSpecificityPipeChannel(bad));assert.equal(hooks,0);assert.equal(f.input.eventNames().length,0);
});

test('actual first exact magic is incremental and start installs only owned continuous listeners',async()=>{
 const f=fixture(),c=f.make();c.start();assert.equal(f.input.listenerCount('data'),1);assert.equal(f.input.listenerCount('error'),1);assert.equal(f.output.listenerCount('error'),1);
 assert.equal(c.snapshot().ownedListeners,6);const p=c.waitHandshake();for(const ch of Buffer.from(PIPE_HANDSHAKE))f.input.emit('data',Buffer.from([ch]));assert.equal(await p,true);
 assert.equal(c.snapshot().handshakeBytes,Buffer.byteLength(PIPE_HANDSHAKE));assert.equal(c.snapshot().combinedWireBytes,Buffer.byteLength(PIPE_HANDSHAKE));assert.equal(c.assertHealthy(),true);assert.throws(()=>c.start());assert.equal(f.input.listenerCount('data'),1);
});

test('wrong/extra/duplicate handshake and EOF truncation cannot grant assignment authority',async()=>{
 for(const data of [Buffer.from('\n'),Buffer.from('native_SPECIFICITY_OWN_JOB_ASSIGNED_V1\n'),Buffer.from(PIPE_HANDSHAKE+'x'),Buffer.from(PIPE_HANDSHAKE+PIPE_HANDSHAKE)]){
  const f=fixture(),c=f.make();c.start();const p=c.waitHandshake();f.input.emit('data',data);await assert.rejects(p);assert.equal(c.snapshot().failed,true);assert.equal(f.output.frames.length,0);
 }
 const f=fixture(),c=f.make();c.start();const p=c.waitHandshake();f.input.emit('data',Buffer.from('NATIVE_'));f.input.emit('end');await assert.rejects(p);assert.equal(c.snapshot().firstFailure,'truncated');assert.equal(c.snapshot().inputEnded,true);assert.equal(c.snapshot().pipeClosureProved,false);
});

test('backpressure boolean never settles a write; ACK may queue before its original callback',async()=>{
 const f=fixture(),c=await ready(f);let settled=false;const writing=c.write(REQUEST);writing.then(()=>{settled=true;},()=>{});await Promise.resolve();assert.equal(settled,false);assert.equal(c.snapshot().physicalWritePending,true);
 f.input.emit('data',RESPONSE);assert.equal(c.snapshot().queuedFrames,1);assert.equal(c.snapshot().physicalWritePending,true);assert.equal(c.snapshot().exchangeReserved,true);
 f.output.callbacks[0]();assert.equal(await writing,true);assert.equal(c.snapshot().physicalWritePending,false);assert.equal(c.snapshot().exchangeReserved,true);
 assert.deepEqual(await c.readChunk(),RESPONSE);assert.equal(c.snapshot().exchangeReserved,false);assert.equal(c.snapshot().physicalExchangePending,false);
 assert.equal(c.snapshot().combinedWireBytes,Buffer.byteLength(PIPE_HANDSHAKE)+REQUEST.length+RESPONSE.length);
});

test('source buffers are copied without constructor/subarray/then/coercion hooks',async()=>{
 const f=fixture(),c=await ready(f);let hooks=0;const request=Buffer.from(REQUEST);
 for(const key of ['constructor','subarray','then','valueOf'])Object.defineProperty(request,key,{get(){hooks++;throw Error();}});
 const writing=c.write(request);request.fill(88);assert.deepEqual(f.output.frames[0],REQUEST);f.output.callbacks[0]();await writing;
 const response=Buffer.from(RESPONSE);Object.defineProperty(response,'subarray',{get(){hooks++;throw Error();}});const reading=c.readChunk();f.input.emit('data',response);response.fill(88);assert.deepEqual(await reading,RESPONSE);assert.equal(hooks,0);
});

test('one logical response only: duplicate/idle/partial-extra bytes fail despite queue space',async()=>{
 for(const suffix of [RESPONSE,Buffer.from('{'),Buffer.from('\n')]){
  const f=fixture(),c=await ready(f),writing=c.write(REQUEST);const reading=c.readChunk();f.input.emit('data',Buffer.concat([RESPONSE,suffix]));await assert.rejects(reading);await assert.rejects(writing);
  assert.equal(c.snapshot().failed,true);assert.equal(c.snapshot().physicalWritePending,true);assert.ok(c.snapshot().maximumQueuedFrames<=1);f.output.callbacks[0]();assert.equal(c.snapshot().physicalWritePending,false);
 }
 const f=fixture(),c=await ready(f);f.input.emit('data',Buffer.from('{'));assert.equal(c.snapshot().failed,true);assert.equal(c.snapshot().partialFrameBytes,0);
});

test('16KiB frame cap holds incrementally before append or parse and exact boundary succeeds',async()=>{
 const f=fixture(),c=await ready(f);const frame=sizedFrame(PIPE_LIMITS.frameBytes);await complete(f,c,frame,frame);assert.equal(c.snapshot().maximumFrameBytes,16384);
 const g=fixture(),other=await ready(g),writing=other.write(REQUEST);g.output.callbacks[0]();await writing;const reading=other.readChunk();
 const oversized=sizedFrame(16385);g.input.emit('data',oversized.subarray(0,16384));assert.equal(other.snapshot().partialFrameBytes,16384);g.input.emit('data',oversized.subarray(16384));await assert.rejects(reading);
 assert.equal(other.snapshot().maximumFrameBytes,16384);assert.equal(other.snapshot().failed,true);
 const h=fixture(),third=await ready(h);assert.throws(()=>third.write(sizedFrame(16385)));assert.equal(h.output.frames.length,0);
});

test('raw chunk queue budget refuses oversized input before accumulation; JSON/proof parsing remains FsWire-owned',async()=>{
 const f=fixture(),c=await ready(f);const writing=c.write(REQUEST);f.output.callbacks[0]();await writing;const reading=c.readChunk();f.input.emit('data',Buffer.alloc(131073,65));await assert.rejects(reading);assert.equal(c.snapshot().partialFrameBytes,0);assert.equal(c.snapshot().queuedBytes,0);
 const g=fixture(),other=await ready(g);const original=JSON.parse;let parses=0;JSON.parse=()=>{parses++;throw Error();};try{await complete(g,other);assert.equal(parses,0);}finally{JSON.parse=original;}
});

test('combined64MiB budget includes handshake and both directions without retaining frame history',async()=>{
 const f=fixture(),c=await ready(f),frame=sizedFrame(16384);let rounds=0;
 while(c.snapshot().combinedWireBytes+frame.length*2<=PIPE_LIMITS.wireBytes){await complete(f,c,frame,frame);rounds++;f.output.frames.length=0;f.output.callbacks.length=0;}
 assert.ok(rounds>1000);const before=c.snapshot().combinedWireBytes;
 const writing=c.write(frame);f.output.callbacks[0]();await writing;const reading=c.readChunk();f.input.emit('data',frame);await assert.rejects(reading);
 assert.equal(c.snapshot().failed,true);assert.equal(c.snapshot().combinedWireBytes,before+frame.length);assert.ok(c.snapshot().combinedWireBytes<=PIPE_LIMITS.wireBytes);assert.equal(c.snapshot().rawFramesRetained,false);
});

test('reentrant/second dispatch cannot free original write capacity or logical response reservation',async()=>{
 const f=fixture(),c=await ready(f),writing=c.write(REQUEST);assert.throws(()=>c.write(REQUEST));await assert.rejects(writing);assert.equal(c.snapshot().physicalWritePending,true);assert.equal(c.snapshot().exchangeReserved,true);
 f.output.callbacks[0]();assert.equal(c.snapshot().physicalWritePending,false);assert.equal(c.snapshot().failed,true);assert.throws(()=>c.write(REQUEST));assert.equal(f.output.frames.length,1);
});

test('duplicate old callback is fatal and cannot settle a newer original physical write',async()=>{
 const f=fixture(),c=await ready(f);await complete(f,c);const old=f.output.callbacks[0],second=c.write(REQUEST);assert.equal(c.snapshot().physicalWritePending,true);
 old();await assert.rejects(second);assert.equal(c.snapshot().physicalWritePending,true);assert.equal(c.snapshot().writeCallbacks,1);
 f.output.callbacks[1]();assert.equal(c.snapshot().physicalWritePending,false);assert.equal(c.snapshot().writeCallbacks,2);assert.equal(c.snapshot().failed,true);
});

test('stream failures/EOF/close reject waiters but never claim physical pipe closure or callback settlement',async()=>{
 for(const [side,event]of [['input','error'],['input','end'],['input','close'],['output','error'],['output','close']]){
  const f=fixture(),c=await ready(f),writing=c.write(REQUEST),reading=c.readChunk();f[side].emit(event,Error('invented'));
  await assert.rejects(writing);await assert.rejects(reading);assert.equal(c.snapshot().physicalWritePending,true);assert.equal(c.snapshot().readWaiterPending,false);assert.equal(c.snapshot().pipeClosureProved,false);
  f.output.callbacks[0]();assert.equal(c.snapshot().physicalWritePending,false);assert.equal(c.snapshot().failed,true);
 }
});

test('guard/time/state fences reject caught reentry and clock advancement before dispatch or delivery',async()=>{
 for(const action of ['dispatch','delivery']){
  const f=fixture();let crossing=false;f.config.guard=()=>{if(crossing)f.setTime(10000);return true;};const c=await ready(f);
  if(action==='dispatch'){crossing=true;assert.throws(()=>c.write(REQUEST));assert.equal(f.output.frames.length,0);}
  else{const writing=c.write(REQUEST);f.output.callbacks[0]();await writing;const reading=c.readChunk();crossing=true;f.input.emit('data',RESPONSE);await assert.rejects(reading);assert.equal(c.snapshot().readFrames,0);}
  assert.equal(c.snapshot().failed,true);
 }
 const f=fixture();let channel,attack=false;f.config.guard=()=>{if(attack){try{channel.assertHealthy();}catch{}}return true;};channel=await ready(f);attack=true;
 assert.throws(()=>channel.write(REQUEST));assert.equal(f.output.frames.length,0);assert.equal(channel.snapshot().failed,true);
});

test('clock-caught reentry cannot invoke the next guard or any stream dispatch',async()=>{
 const f=fixture();let c,attack=false;f.config.clock=()=>{if(attack){try{c.assertHealthy();}catch{}}return 0;};c=await ready(f);
 const guards=f.guards(),listeners=f.input.listenerCount('data');attack=true;
 assert.throws(()=>c.write(REQUEST));assert.equal(f.guards(),guards);assert.equal(f.output.frames.length,0);
 assert.equal(f.input.listenerCount('data'),listeners);assert.equal(c.snapshot().failed,true);
 const g=fixture();let other;g.config.clock=()=>{try{other.assertHealthy();}catch{}return 0;};other=g.make();
 assert.throws(()=>other.start());assert.equal(g.guards(),0);assert.equal(g.input.eventNames().length,0);assert.equal(g.output.eventNames().length,0);
});

test('NaN/decreasing clocks and async unsafe guard promises invoke no constructor hooks',async()=>{
 for(const value of [NaN,Infinity,-1]){const f=fixture();f.config.clock=()=>value;const c=f.make();assert.throws(()=>c.start());assert.equal(f.input.eventNames().length,0);}
 const f=fixture(),c=await ready(f);f.setTime(5);c.assertHealthy();f.setTime(4);assert.throws(()=>c.assertHealthy());
 const g=fixture();let release;const original=new Promise(resolve=>{release=resolve;});g.config.guard=()=>original;const other=g.make();assert.throws(()=>other.start());assert.equal(other.snapshot().pendingOriginals,1);release(true);await Promise.resolve();assert.equal(other.snapshot().pendingOriginals,0);
 const h=fixture();let hooks=0;const unsafe=Promise.resolve(true);Object.defineProperty(unsafe,'constructor',{get(){hooks++;throw Error();}});h.config.guard=()=>unsafe;const third=h.make();assert.throws(()=>third.start());assert.equal(hooks,0);assert.equal(third.snapshot().unsafeOperationRefused,true);
});

test('finish requires healthy idle and retains monitoring/listeners without pausing/unref/end authority',async()=>{
 const f=fixture(),c=await ready(f);await complete(f,c);const result=c.finish();assert.deepEqual(result,{finished:true,listenersRetained:true,physicalPipeClosureProved:false});assert.equal(c.assertHealthy(),true);
 assert.equal(c.snapshot().inputMonitoring,true);assert.equal(f.input.listenerCount('data'),1);f.input.emit('data',Buffer.from('extra'));assert.equal(c.snapshot().failed,true);assert.throws(()=>c.assertHealthy());
 const g=fixture(),other=await ready(g),writing=other.write(REQUEST);assert.throws(()=>other.finish());await assert.rejects(writing);assert.equal(other.snapshot().physicalWritePending,true);g.output.callbacks[0]();assert.equal(other.snapshot().physicalWritePending,false);
});

test('post-reservation and post-frame guards cannot be bypassed by caught or advancing callbacks',async()=>{
 for(const stage of ['reserved','queued']){
  const f=fixture();let channel,armed=false;f.config.guard=()=>{
   const s=channel?.snapshot();if(armed&&(stage==='reserved'?s?.exchangeReserved&&!s.physicalWritePending:s?.queuedFrames===1))f.setTime(10000);return true;
  };channel=await ready(f);
  if(stage==='reserved'){armed=true;const before=channel.snapshot().combinedWireBytes;assert.throws(()=>channel.write(REQUEST));assert.equal(f.output.frames.length,0);assert.equal(channel.snapshot().physicalWritePending,false);assert.equal(channel.snapshot().combinedWireBytes,before);}
  else{const writing=channel.write(REQUEST);f.output.callbacks[0]();await writing;const reading=channel.readChunk();armed=true;f.input.emit('data',RESPONSE);await assert.rejects(reading);assert.equal(channel.snapshot().readFrames,0);assert.equal(channel.snapshot().queuedBytes,0);}
  assert.equal(channel.snapshot().failed,true);
 }
 const f=fixture(),c=await ready(f);f.output.hook=()=>{try{c.write(REQUEST);}catch{}};assert.throws(()=>c.write(REQUEST));assert.equal(f.output.frames.length,1);assert.equal(c.snapshot().physicalWritePending,true);
 f.output.callbacks[0]();assert.equal(c.snapshot().physicalWritePending,false);assert.equal(c.snapshot().failed,true);
});

test('subclass/proxy/own-then async capabilities are refused without hooks or false original settlement',()=>{
 for(const kind of ['subclass','proxy','then']){
  const f=fixture();let hooks=0,raw=Promise.resolve(true);
  if(kind==='subclass')raw=new (class extends Promise{})(resolve=>resolve(true));
  if(kind==='proxy')raw=new Proxy(raw,{get(){hooks++;throw Error();},getPrototypeOf(){hooks++;throw Error();}});
  if(kind==='then')Object.defineProperty(raw,'then',{get(){hooks++;throw Error();}});
  f.config.guard=()=>raw;const c=f.make();assert.throws(()=>c.start());assert.equal(hooks,0);assert.equal(c.snapshot().unsafeOperationRefused,true);assert.equal(c.snapshot().pendingOriginals,0);assert.equal(f.input.eventNames().length,0);
 }
});

test('synchronous writer throw/error callback never fabricates physical callback completion',async()=>{
 const f=fixture(),c=await ready(f);f.output.hook=()=>{throw Error('invented dispatch throw');};assert.throws(()=>c.write(REQUEST));assert.equal(c.snapshot().physicalWritePending,true);assert.equal(c.snapshot().writeCallbacks,0);
 f.output.callbacks[0](Error('invented late callback'));assert.equal(c.snapshot().physicalWritePending,false);assert.equal(c.snapshot().writeCallbacks,1);assert.equal(c.snapshot().failed,true);
 const g=fixture(),other=await ready(g),writing=other.write(REQUEST);g.output.callbacks[0](false);await assert.rejects(writing);assert.equal(other.snapshot().failed,true);assert.equal(other.snapshot().physicalWritePending,false);
});
