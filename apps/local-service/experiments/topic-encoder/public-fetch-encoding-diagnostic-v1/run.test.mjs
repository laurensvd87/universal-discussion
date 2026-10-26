import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createPublicFetcher,PublicFetchError,PUBLIC_FETCH_POLICY} from '../../../src/crawler/public-fetch.js';
import {TARGET_URL,responseMetadata,errorMetadata,observedRequestImpl,collectDiagnostic} from './run.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const dnsLookup=async()=>[{address:'8.8.8.8',family:4}];
function inventedRequest(body,{encoding='gzip',status=200}={}){
  return (options,onResponse)=>{
    const request=new EventEmitter();request.destroy=()=>{};request.setTimeout=()=>{};
    request.end=()=>queueMicrotask(()=>{
      const response=new EventEmitter();Object.assign(response,{statusCode:status,destroyed:false,socket:{remoteAddress:'8.8.8.8'},
        headers:{'content-type':'text/html; charset=utf-8','content-encoding':encoding,'content-length':String(body.length)}});
      response.destroy=()=>{response.destroyed=true;};onResponse(response);
      queueMicrotask(()=>{if(response.destroyed)return;response.emit('data',body);response.emit('end');});
    });return request;
  };
}

test('singleton header projection is bounded and never persists unrelated headers',()=>{
  const m=responseMetadata({statusCode:200,headers:{'content-encoding':'br','content-length':'123',cookie:'not-retained','set-cookie':'not-retained'}});
  assert.deepEqual(m,{status:200,contentEncoding:'br',contentEncodingSafe:true,contentLength:'123',contentLengthSafe:true});
  assert.equal(JSON.stringify(m).includes('not-retained'),false);
  for(const value of ['x'.repeat(65),'gzip\r\nprivate','gzip;cookie=secret'])assert.equal(responseMetadata({headers:{'content-encoding':value}}).contentEncoding,null);
  assert.equal(responseMetadata({headersDistinct:{'content-encoding':['gzip','br']}}).contentEncodingSafe,false);
  for(const value of ['1'.repeat(33),'+4','2 secret','-1'])assert.equal(responseMetadata({headers:{'content-length':value}}).contentLengthSafe,false);
});
test('typed fetch failure exposes only allowlisted direct/cause codes, never messages or stacks',()=>{
  const e=new PublicFetchError('content-encoding',{cause:Object.assign(Error('private server payload'),{code:'ERR_BUFFER_TOO_LARGE'})});
  assert.deepEqual(errorMetadata(e),{type:'PublicFetchError',code:'content-encoding',causeCode:'ERR_BUFFER_TOO_LARGE',status:null});
  const unknown=new PublicFetchError('network-failed',{cause:{code:'SECRET_DIAGNOSTIC_TEXT'}});
  assert.equal(errorMetadata(unknown).causeCode,null);assert.equal(JSON.stringify(errorMetadata(e)).includes('private'),false);
});
test('observing request delegates EXACT options and lookup, core callback before observation',()=>{
  const records=[],lookup=()=>{},options={lookup,headers:{accept:'unchanged'}},before=structuredClone(options.headers);
  const response=new EventEmitter();Object.assign(response,{statusCode:200,headers:{'content-encoding':'identity'},destroyed:false});
  const token={},delegate=(actual,callback)=>{assert.equal(actual,options);assert.equal(actual.lookup,lookup);callback(response);return token;};
  let coreCalled=false;const request=observedRequestImpl(records,delegate)(options,r=>{assert.equal(r,response);assert.equal(r.listenerCount('data'),0);coreCalled=true;});
  assert.equal(request,token);assert.equal(coreCalled,true);assert.deepEqual(options.headers,before);
  const b=Buffer.from('invented compressed bytes');response.emit('data',b);response.emit('end');
  assert.equal(records[0].compressedSha256,sha(b));assert.equal(records[0].compressedHashComplete,true);
  assert.equal(records[0].compressedBytesObserved,b.length);assert.equal(Object.hasOwn(records[0],'body'),false);
});
test('unchanged real fetch decoder rejects invented invalid gzip and retains safe cause + raw hash',async()=>{
  const b=Buffer.from('not a gzip stream'),records=[];
  const fetchPublic=createPublicFetcher({dnsLookup,requestImpl:observedRequestImpl(records,inventedRequest(b))});
  let error;try{await fetchPublic(TARGET_URL);}catch(e){error=e;}
  assert.equal(errorMetadata(error).code,'content-encoding');assert.equal(errorMetadata(error).causeCode,'Z_DATA_ERROR');
  assert.equal(records[0].contentEncoding,'gzip');assert.equal(records[0].compressedSha256,sha(b));assert.equal(records[0].compressedHashComplete,true);
});
test('unchanged decompression cap rejects oversized invented output without fallback/limit increase',async()=>{
  const b=gzipSync(Buffer.alloc(3*1024*1024,65)),records=[];
  const fetchPublic=createPublicFetcher({dnsLookup,requestImpl:observedRequestImpl(records,inventedRequest(b))});
  let error;try{await fetchPublic(TARGET_URL);}catch(e){error=e;}
  assert.equal(errorMetadata(error).code,'content-encoding');assert.equal(errorMetadata(error).causeCode,'ERR_BUFFER_TOO_LARGE');
  assert.equal(records[0].compressedSha256,sha(b));assert.equal(PUBLIC_FETCH_POLICY.maxDecompressedBytes,2*1024*1024);
});
test('core rejection precedes observer body flow; oversized hash tap stops independently',()=>{
  const records=[],response=new EventEmitter();Object.assign(response,{headers:{},destroyed:false});
  observedRequestImpl(records,(_,callback)=>{callback(response);return {};})({},r=>{r.destroyed=true;});
  assert.equal(response.listenerCount('data'),0);assert.equal(records[0].compressedHashComplete,false);
  const r2=new EventEmitter();Object.assign(r2,{headers:{},destroyed:false});const other=[];
  observedRequestImpl(other,(_,callback)=>{callback(r2);return {};})({},()=>{});
  r2.emit('data',Buffer.alloc(PUBLIC_FETCH_POLICY.maxCompressedBytes+1));r2.emit('end');
  assert.equal(other[0].observerCapped,true);assert.equal(other[0].compressedSha256,null);
});
test('fixed robots/TDM checked first, exact three requests, pacing and buffer erasure',async()=>{
  let now=0;const calls=[],buffers=[];
  const fetchPublic=async(url,options)=>{
    calls.push({url,...options,at:now});
    if(options.resourceKind==='page')throw new PublicFetchError('content-encoding',{cause:{code:'Z_BUF_ERROR'}});
    const text=options.resourceKind==='robots'?'User-agent: *\nAllow: /':'[]',body=Buffer.from(text);buffers.push(body);
    return {kind:'content',status:200,finalUrl:url,text,body};
  };
  const d=await collectDiagnostic({fetchPublic,clock:()=>now,sleep:async ms=>{now+=ms;}});
  assert.equal(d.stage,'page');assert.equal(d.outcome.failure.causeCode,'Z_BUF_ERROR');assert.equal(calls.length,3);
  assert.equal(calls[2].url,TARGET_URL);assert(calls.every((c,i)=>!i||c.at-calls[i-1].at>=2000));
  assert(calls.every(c=>c.timeoutMs<=15000));assert(buffers.every(b=>b.every(v=>v===0)));
});
test('robots and TDM denial prevent page request; absent404 policy allowed but no retries',async()=>{
  for(const kind of ['robots','tdmrep']){
    const calls=[];const fetchPublic=async(url,options)=>{
      calls.push(options.resourceKind);const text=options.resourceKind==='robots'?(kind==='robots'?'User-agent: *\nDisallow: /wiki/':'User-agent: *\nAllow: /'):'[{"location":"/wiki/*","tdm-reservation":1}]';
      return {kind:'content',status:200,finalUrl:url,text,body:Buffer.from(text)};
    };
    const d=await collectDiagnostic({fetchPublic,clock:()=>0,sleep:async()=>{}});assert.equal(d.outcome.status,'observed-failure');assert.equal(calls.includes('page'),false);
  }
  let now=0,calls=0;
  const d=await collectDiagnostic({clock:()=>now,sleep:async ms=>{now+=ms;},fetchPublic:async(_,options)=>{
    calls++;throw new PublicFetchError('http-status',{status:options.resourceKind==='page'?503:404});
  }});
  assert.equal(calls,3);assert.equal(d.stage,'page');assert.equal(d.outcome.failure.status,503);
});
test('absolute45second deadline and already-aborted signal launch no requests',async()=>{
  let calls=0,n=0;const fetchPublic=async()=>{calls++;throw Error('unexpected');};
  const timed=await collectDiagnostic({fetchPublic,clock:()=>n++?45001:0,sleep:async()=>{}});
  assert.equal(timed.outcome.failure.code,'timeout');assert.equal(calls,0);
  const abort=new AbortController();abort.abort();
  const aborted=await collectDiagnostic({fetchPublic,clock:()=>0,sleep:async()=>{},signal:abort.signal});
  assert.equal(aborted.outcome.failure.code,'timeout');assert.equal(calls,0);
});
test('header/error projectors reject hostile access without getter/proxy callbacks',()=>{
  let touched=0;const p=new Proxy({}, {getPrototypeOf(){touched++;throw Error('trap');}});
  assert.equal(responseMetadata(p).status,null);assert.equal(errorMetadata(p).code,null);
  const headers={};Object.defineProperty(headers,'content-encoding',{get(){touched++;return 'secret';}});
  assert.equal(responseMetadata({headers}).contentEncoding,null);assert.equal(touched,0);
});
