import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveNativeStudyDns} from './dns-resolver.js';
import {NATIVE_DNS_HOSTS,describeNativeDnsPins} from './network-policy.js';

const missing=code=>Object.assign(new Error('invented DNS failure'),{code});
function timers(){let now=0,next=0;const pending=new Map();return {clock:()=>now,schedule:(fn,ms)=>{const id=++next;pending.set(id,{fn,due:now+ms});return id;},
 cancel:id=>pending.delete(id),advance(ms){now+=ms;for(const [id,t]of [...pending])if(t.due<=now){pending.delete(id);t.fn();}},size:()=>pending.size};}
function successful(){let instances=0,queries=0;return {createResolver:()=>{instances++;return {
 resolve4:async host=>{queries++;assert.ok(NATIVE_DNS_HOSTS.includes(host));return ['8.8.8.8'];},
 resolve6:async()=>{queries++;throw missing('ENODATA');},cancel(){throw Error('successful resolver need not cancel');}};},counts:()=>({instances,queries})};}

test('default import is inert; explicit injected resolvers settle34 hosts with at most4 hosts/8 physical queries',async()=>{
 const f=successful(),t=timers(),result=await resolveNativeStudyDns({...f,...t});
 assert.equal(result.summary.attemptedHosts,34);assert.equal(result.summary.pinnedHosts,34);assert.equal(result.summary.peakConcurrentHosts,4);
 assert.equal(result.summary.peakPhysicalQueries,8);assert.equal(result.summary.physicalQueries,0);assert.equal(result.summary.ownedResolversCancelled,0);
 assert.deepEqual(f.counts(),{instances:34,queries:68});assert.equal(t.size(),0);
 assert.equal(JSON.stringify(result.summary).includes('8.8.8.8'),false);assert.equal(describeNativeDnsPins(result.dnsPins).pinned,34);
});
test('global30s deadline cancels only4 owned resolvers, observes8 query settlements, and leaves unattempted hosts unavailable',async()=>{
 const t=timers(),states=[];let done=false;
 const promise=resolveNativeStudyDns({...t,createResolver:()=>{const s={reject:[],cancelled:0};states.push(s);return {
  resolve4:()=>new Promise((_,no)=>s.reject.push(no)),resolve6:()=>new Promise((_,no)=>s.reject.push(no)),
  cancel(){s.cancelled++;for(const reject of s.reject)reject(missing('ECANCELLED'));}};}}).then(r=>{done=true;return r;});
 assert.equal(states.length,4);assert.equal(done,false);t.advance(30000);const {summary}=await promise;
 assert.equal(summary.attemptedHosts,4);assert.equal(summary.unattemptedHosts,30);assert.equal(summary.unavailableHosts,34);assert.equal(summary.setupExpired,true);
 assert.equal(summary.physicalQueries,0);assert.equal(summary.allOwnedQueriesSettled,true);assert.ok(states.every(s=>s.cancelled===1));assert.equal(t.size(),0);
});
test('a timeout cannot manufacture settlement: cancellation must actually settle all owned DNS promises',async()=>{
 const t=timers(),states=[];let done=false;
 const p=resolveNativeStudyDns({...t,createResolver:()=>{const s={reject:[],cancelled:0};states.push(s);return {
  resolve4:()=>new Promise((_,no)=>s.reject.push(no)),resolve6:()=>new Promise((_,no)=>s.reject.push(no)),cancel(){s.cancelled++;}};}}).then(r=>{done=true;return r;});
 t.advance(30000);await Promise.resolve();assert.equal(done,false);assert.ok(states.every(s=>s.cancelled===1));
 for(const s of states)for(const no of s.reject)no(missing('ECANCELLED'));await p;assert.equal(done,true);
});
test('caller abort and unknown DNS errors stop, cancel and drain rather than publishing pins or retrying',async()=>{
 const t=timers(),controller=new AbortController(),states=[];
 const p=resolveNativeStudyDns({...t,signal:controller.signal,createResolver:()=>{const s={reject:[],cancelled:0};states.push(s);return {
  resolve4:()=>new Promise((_,no)=>s.reject.push(no)),resolve6:()=>new Promise((_,no)=>s.reject.push(no)),cancel(){s.cancelled++;for(const no of s.reject)no(missing('ECANCELLED'));}};}});
 controller.abort();await assert.rejects(p,{code:'aborted'});assert.ok(states.every(s=>s.cancelled===1));assert.equal(t.size(),0);
 let calls=0;await assert.rejects(resolveNativeStudyDns({createResolver:()=>({resolve4:async()=>{calls++;throw missing('UNLISTED_ERROR');},resolve6:async()=>{throw missing('ENODATA');},cancel(){}})}),{code:'unexpected-dns-error'});
 assert.equal(calls,4);
});
test('private or malformed answers are fatal; recognized host failure is unavailable with no address/family rescue',async()=>{
 await assert.rejects(resolveNativeStudyDns({createResolver:()=>({resolve4:async()=>['8.8.8.8','127.0.0.1'],resolve6:async()=>[],cancel(){}})}),{code:'dns-validation-failed'});
 let a=0;const r=await resolveNativeStudyDns({createResolver:()=>({resolve4:async()=>{a++;throw missing('ETIMEOUT');},resolve6:async()=>['2606:4700:4700::1111'],cancel(){}})});
 assert.equal(r.summary.pinnedHosts,0);assert.equal(r.summary.unavailableHosts,34);assert.equal(a,34);
 await assert.rejects(resolveNativeStudyDns({createResolver:()=>({resolve4:async()=>new Proxy([],{get(){throw Error('do not invoke');}}),resolve6:async()=>[],cancel(){}})}));
});
test('owned5s query leases are not reset; late success after lease does not become a selected pin',async()=>{
 const t=timers(),states=[];const p=resolveNativeStudyDns({...t,createResolver:()=>{const s={yes:[],no:[]};states.push(s);return {
  resolve4:()=>new Promise((yes,no)=>{s.yes.push(yes);s.no.push(no);}),resolve6:()=>new Promise((yes,no)=>{s.yes.push(yes);s.no.push(no);}),
  cancel(){s.yes[0](['8.8.8.8']);s.no[1](missing('ECANCELLED'));}};}});
 t.advance(30000);const r=await p;assert.equal(r.summary.pinnedHosts,0);assert.equal(r.summary.physicalQueries,0);assert.equal(states.length,4);
});

test('recognized family refusal and elapsed leases cannot hide fulfilled private or malformed answers',async()=>{
 for(const {answer,code} of [{answer:['127.0.0.1'],code:'dns-validation-failed'},{answer:Array(1),code:'dns-contract'}]){
  await assert.rejects(resolveNativeStudyDns({createResolver:()=>({resolve4:async()=>answer,
   resolve6:async()=>{throw missing('ETIMEOUT');},cancel(){}})}),{code});
 }
 const t=timers();const p=resolveNativeStudyDns({...t,createResolver:()=>{let yes,no;return {
  resolve4:()=>new Promise(resolve=>{yes=resolve;}),resolve6:()=>new Promise((_,reject)=>{no=reject;}),
  cancel(){yes(['127.0.0.1']);no(missing('ECANCELLED'));}};}});
 t.advance(30000);await assert.rejects(p,{code:'dns-validation-failed'});assert.equal(t.size(),0);
});

test('whole-worker clock and timer-cleanup failures cannot disappear inside allSettled',async()=>{
 const f=successful();let clocks=0;
 await assert.rejects(resolveNativeStudyDns({...f,clock:()=>{if(++clocks===4)throw Error('invented clock failure');return 0;}}),{code:'dns-worker-failed'});
 const t=timers();await assert.rejects(resolveNativeStudyDns({...successful(),...t,cancel:id=>{t.cancel(id);throw Error('invented cancellation failure');}}),{code:'timer-cancel-failed'});
 assert.equal(t.size(),0);
});
