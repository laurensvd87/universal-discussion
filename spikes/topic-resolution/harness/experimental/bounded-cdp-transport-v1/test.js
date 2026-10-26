import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoundedCdpTransport,DEFAULT_LIMITS,BoundedCdpError } from './transport.js';
const encode=s=>new TextEncoder().encode(s);
function fixture(options={}){
 let now=0,serial=0;const timers=new Map(),writes=[],events=[];
 const transport=createBoundedCdpTransport({
  write:(wire,callback)=>{writes.push({wire,callback});return options.write?.(wire,callback);},
  clock:()=>now,schedule:(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:now+ms});return id;},cancel:id=>timers.delete(id),
  onDiagnostic:event=>{events.push(event);return options.observe?.(event);},limits:{...DEFAULT_LIMITS,...options.limits}
 });
 return {transport,writes,events,timers,
  advance(ms){now+=ms;for(const [id,timer]of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}},
  response(index,result={}){const sent=JSON.parse(writes[index].wire.slice(0,-1));transport.receive(encode(JSON.stringify({id:sent.id,...(Object.hasOwn(sent,'sessionId')?{sessionId:sent.sessionId}:{}),result})+'\0'));},
  error(index,code){const sent=JSON.parse(writes[index].wire.slice(0,-1));transport.receive(encode(JSON.stringify({id:sent.id,...(Object.hasOwn(sent,'sessionId')?{sessionId:sent.sessionId}:{}),error:{code,message:'DO NOT RETAIN secret URL'}})+'\0'));}
 };
}
const rejects=(p,category)=>assert.rejects(p,e=>e instanceof BoundedCdpError&&e.category===category);

test('production bounds are exact and can only shrink; hostile schema is inert',()=>{
 assert.deepEqual(DEFAULT_LIMITS,{pending:128,messageBytes:4194304,diagnosticEvents:32,diagnosticBytes:16384,rpcMs:10000});
 assert.throws(()=>fixture({limits:{pending:129}}));assert.throws(()=>fixture({limits:{rpcMs:10001}}));
 let called=0;assert.throws(()=>createBoundedCdpTransport(new Proxy({},{ownKeys(){called++;throw 0},get(){called++;throw 0}})));assert.equal(called,0);
});

test('request/reply and split frames work with frozen sanitized counters, no wire retained in diagnostics',async()=>{
 const f=fixture();const p=f.transport.send('navigate',{url:'https://invented.invalid/secret'},'session-private');
 const id=JSON.parse(f.writes[0].wire.slice(0,-1)).id,bytes=encode(JSON.stringify({id,sessionId:'session-private',result:{frameId:'invented'}})+'\0');
 f.transport.receive(bytes.subarray(0,5));f.transport.receive(bytes.subarray(5));assert.deepEqual(await p,{frameId:'invented'});
 const d=f.transport.inspect();assert.equal(d.counters.completed,1);assert.equal(d.counters.reserved,0);assert.equal(f.timers.size,0);
 assert.equal(Object.isFrozen(d.diagnostics[0].counters),true);assert.equal(/secret|invented|session-private|requestId/.test(JSON.stringify(d)),false);
});

test('128 invented denials serialize with one in flight and no independent extra capacity',async()=>{
 const f=fixture(),ps=Array.from({length:128},(_,i)=>f.transport.deny('private-request-'+i));
 assert.equal(f.writes.length,1);assert.equal(f.transport.inspect().counters.queuedDenials,127);
 for(let i=0;i<128;i++){assert.equal(f.writes.length,i+1);f.response(i);}
 await Promise.all(ps);assert.equal(f.transport.inspect().counters.peakReserved,128);assert.equal(f.transport.inspect().counters.reserved,0);
 assert.ok(f.transport.inspect().diagnostics.length<=32);assert.ok(f.transport.inspect().diagnosticBytes<=16384);assert.ok(f.transport.inspect().counters.diagnosticDropped>0);
 assert.throws(()=>f.transport.send('block-request',{requestId:'bypass'}));
});

test('mixed pending work and denial queue share the same cap, overflow fails all without sending extra deny',async()=>{
 const f=fixture({limits:{pending:3}}),ps=[f.transport.send('get-version'),f.transport.deny('one'),f.transport.deny('two')];
 assert.equal(f.writes.length,2);const overflow=f.transport.deny('three');
 await Promise.all([...ps,overflow].map(p=>rejects(p,'pending-cap')));assert.equal(f.writes.length,2);assert.equal(f.timers.size,0);
});

test('denial command rejection is fatal, never ignored or continued with next queued denial',async()=>{
 const f=fixture(),p=f.transport.deny('first'),q=f.transport.deny('second');f.error(0,-32602);
 await rejects(p,'cdp-command-rejected');await rejects(q,'cdp-command-rejected');assert.equal(f.writes.length,1);
 const d=f.transport.inspect().diagnostics.at(-1);assert.equal(d.code,-32602);assert.equal(d.method,'Fetch.failRequest');
 assert.equal(JSON.stringify(d).includes('secret'),false);
});

test('sync throw, write callback error, and rejected write promise have distinct fixed write-failed projection',async()=>{
 for(const write of [()=>{throw Error('private');},(_,callback)=>callback(Error('private')),()=>Promise.reject(Error('private'))]){
  const f=fixture({write}),p=f.transport.send('get-version');await rejects(p,'write-failed');
  assert.equal(JSON.stringify(f.transport.inspect()).includes('private'),false);assert.equal(f.timers.size,0);
 }
});

test('pipe end, child exit and resource abort reject all pending/queued work and prevent new writes',async()=>{
 for(const [method,category]of [['pipeEnded','pipe-ended'],['childExited','child-exited'],['abort','resource-abort']]){
  const f=fixture(),p=f.transport.deny('one'),q=f.transport.deny('two');f.transport[method]();
  await rejects(p,category);await rejects(q,category);await rejects(f.transport.send('get-version'),category);
  assert.equal(f.writes.length,1);assert.equal(f.timers.size,0);assert.equal(f.transport.inspect().counters.reserved,0);
 }
});

test('RPC deadline includes denial queue wait and late replies cannot rescue a failed transport',async()=>{
 const f=fixture({limits:{rpcMs:10}}),p=f.transport.deny('one'),q=f.transport.deny('two');f.advance(10);
 f.response(0);await rejects(p,'rpc-deadline');await rejects(q,'rpc-deadline');assert.equal(f.writes.length,1);assert.equal(f.timers.size,0);
});

test('invalid frame, UTF8, code and message size are distinguishable and never retain error messages',async()=>{
 for(const [bytes,category]of [[encode('not-json\0'),'invalid-frame'],[new Uint8Array([255,0]),'invalid-frame'],[encode('{"id":1,"error":{"code":"private"}}\0'),'invalid-code'],[new Uint8Array(1025),'message-cap']]){
  const f=fixture({limits:{messageBytes:1024}}),p=f.transport.send('get-version');f.transport.receive(bytes);await rejects(p,category);
  assert.equal(JSON.stringify(f.transport.inspect()).includes('private'),false);
 }
 const f=fixture({limits:{messageBytes:128}});await rejects(f.transport.send('navigate',{url:'x'.repeat(200)}),'message-cap');assert.equal(f.writes.length,0);
});

test('diagnostic observer throws and rejected promises cannot interfere or create unhandled rejections',async()=>{
 for(const observe of [()=>{throw Error('observer secret');},()=>Promise.reject(Error('observer secret'))]){
  const f=fixture({observe}),p=f.transport.send('get-version');f.response(0);await p;assert.equal(f.transport.inspect().ended,null);
 }
 const f=fixture({limits:{diagnosticBytes:2}}),p=f.transport.send('get-version');f.response(0);await p;
 assert.equal(f.events.length,0);assert.ok(f.transport.inspect().counters.diagnosticDropped>0);
});

test('params reject accessors/proxies/cycles without callbacks; external failure payloads are not traversed',async()=>{
 const f=fixture();let calls=0;const params={};Object.defineProperty(params,'url',{enumerable:true,get(){calls++;throw 0}});
 assert.throws(()=>f.transport.send('navigate',params));assert.throws(()=>f.transport.send('navigate',new Proxy({},{get(){calls++;throw 0}})));
 const cyclic={};cyclic.self=cyclic;assert.throws(()=>f.transport.send('snapshot',cyclic));assert.equal(calls,0);
 const p=f.transport.send('get-version');f.writes[0].callback(new Proxy({},{get(){calls++;throw 0}}));await rejects(p,'write-failed');assert.equal(calls,0);
});

test('copy budgets reject cumulative nodes, escaped keys/strings and UTF8 before unbounded serialization',async()=>{
 const leaf=Array(64).fill(null),middle=Array(64).fill(leaf),tree={nested:Array(64).fill(middle)};
 for(const params of [{payload:'x'.repeat(DEFAULT_LIMITS.messageBytes+1)},tree,
  {payload:Array(4096).fill('x'.repeat(1024))}]){
  const f=fixture();await rejects(f.transport.send('snapshot',params),'message-cap');assert.equal(f.writes.length,0);assert.equal(f.timers.size,0);
 }
 for(const params of [{['k'.repeat(513)]:0},{payload:'😀'.repeat(200)},{payload:'\u0001'.repeat(100)}]){
  const f=fixture({limits:{messageBytes:512}});await rejects(f.transport.send('snapshot',params),'message-cap');assert.equal(f.writes.length,0);
 }
});

test('reply correlation requires exact session or true absence for both results and CDP errors',async()=>{
 for(const expected of [null,'private-session-A'])for(const reply of [undefined,null,'private-session-B'])for(const error of [false,true]){
  if(expected===null&&reply===undefined)continue;
  const f=fixture(),p=f.transport.send('get-version',{},expected),sent=JSON.parse(f.writes[0].wire.slice(0,-1));
  f.transport.receive(encode(JSON.stringify({id:sent.id,...(reply===undefined?{}:{sessionId:reply}),
   ...(error?{error:{code:-32602,message:'private-server-message'}}:{result:{}})})+'\0'));
  await rejects(p,'invalid-frame');assert.equal(/private-session|private-server-message/.test(JSON.stringify(f.transport.inspect())),false);
 }
 const good=fixture(),p=good.transport.send('get-version',{},'private-session-A');good.response(0);await p;
 const rejected=fixture(),q=rejected.transport.send('get-version',{},'private-session-A');rejected.error(0,-32602);await rejects(q,'cdp-command-rejected');
});

test('receive uses genuine typed-array intrinsic bounds and indices, ignoring hostile own extensions without callbacks',async()=>{
 let calls=0;
 for(const buffer of [false,true]){
  const f=fixture(),p=f.transport.send('get-version'),raw=encode('{"id":1,"result":{}}\0');
  const bytes=buffer?Buffer.from(raw):raw;
  Object.defineProperty(bytes,'byteLength',{get(){calls++;throw 0;}});
  Object.defineProperty(bytes,'length',{get(){calls++;throw 0;}});
  Object.defineProperty(bytes,Symbol.iterator,{get(){calls++;throw 0;}});
  f.transport.receive(bytes);await p;assert.equal(calls,0);assert.equal(f.transport.inspect().counters.completed,1);
 }
 class ExtendedBytes extends Uint8Array {get byteLength(){calls++;throw 0;}[Symbol.iterator](){calls++;throw 0;}}
 for(const chunk of [new ExtendedBytes([0]),new Proxy(new Uint8Array([0]),{get(){calls++;throw 0;},getPrototypeOf(){calls++;throw 0;}})]){
  const f=fixture(),p=f.transport.send('get-version');f.transport.receive(chunk);await rejects(p,'invalid-frame');assert.equal(calls,0);
 }
});

test('late write failure after its reply stays fatal for another pending command',async()=>{
 const f=fixture(),done=f.transport.send('get-version'),pending=f.transport.send('get-version');
 f.response(0);await done;f.writes[0].callback(Error('private late IO failure'));
 await rejects(pending,'write-failed');assert.equal(f.transport.inspect().ended,'write-failed');
 assert.equal(JSON.stringify(f.transport.inspect()).includes('private late'),false);assert.equal(f.timers.size,0);
});
