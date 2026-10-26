import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {CAPTURE_NAMESPACE,compileCaptureManifest,describeCaptureManifest,collectPublicCaptures,extractWikipediaLeadCandidate} from './capture.js';
import {parseCaptureArguments,verifySelectionReceipt,buildCohorts,captureSourceInputHash} from '../../../data/hierarchy-real-root-capture-adr136.mjs';
import {PublicFetchError} from '../../../src/crawler/public-fetch.js';
const sha=x=>createHash('sha256').update(x).digest('hex');
function input(phase='test'){return {namespace:CAPTURE_NAMESPACE,phase,cases:Array.from({length:phase==='test'?32:96},(_,i)=>({id:'case-'+i,url:'https://en.wikipedia.org/wiki/Fixture_'+i}))};}
const html='<html><title>Public fixture</title><main id="mw-content-text"><div class="mw-parser-output"><p>'+('This public article describes the central subject with enough prose for a bounded extraction. '.repeat(5))+'</p></div></main></html>';
function transport({robots='',tdm='[]',page=html,redirect=false}={}){
  let now=0;const calls=[],buffers=[];
  return {calls,buffers,clock:()=>now,sleep:async ms=>{now+=ms;},fetchPublic:async(url,options)=>{
    calls.push({url,...options,at:now});if(redirect)return {kind:'redirect'};
    const text=options.resourceKind==='robots'?robots:options.resourceKind==='tdmrep'?tdm:page;
    const body=Buffer.from(text);buffers.push(body);return {kind:'content',status:200,finalUrl:url,text,body,
      headers:{xRobotsTag:[],tdmReservation:null},mimeType:'text/html',contentEncoding:'identity',compressedBytes:body.length};
  }};
}
test('manifest namespace, fixed sizes, hostile shape, whitelist and private copy',()=>{
  const a=input(),h=compileCaptureManifest(a);a.cases[0].url='https://evil.test/';assert.match(describeCaptureManifest(h).cases[0].url,/wikipedia/);
  for(const url of ['http://en.wikipedia.org/wiki/A','https://en.wikipedia.org:444/wiki/A','https://user@en.wikipedia.org/wiki/A','https://en.wikipedia.org/wiki/A?x=1','https://en.wikipedia.org/wiki/A#x','https://evil.test/wiki/A','https://en.wikipedia.org/wiki/A%2fb']){
    const x=input();x.cases[0].url=url;assert.throws(()=>compileCaptureManifest(x));
  }
  for(const mutate of [a=>a.cases.pop(),a=>a.namespace='other',a=>a.cases[1]=a.cases[0],a=>Object.defineProperty(a,'phase',{get(){throw Error('getter invoked');}})]){const x=input();mutate(x);assert.throws(()=>compileCaptureManifest(x));}
  assert.throws(()=>compileCaptureManifest(new Proxy(input(),{})));
});
test('default inert, strict CLI and selected receipt whole-byte/phase fence',()=>{
  assert.equal(parseCaptureArguments([]),null);assert.equal(parseCaptureArguments(['--traincal']).phase,'traincal');
  assert.throws(()=>parseCaptureArguments(['--test']));assert.throws(()=>parseCaptureArguments(['--traincal','--selected-receipt-sha256','a'.repeat(64)]));
  const r={schema:'hierarchy-real-root-selection/v1',phase:'selected-before-test',finalTestEvaluated:false,inputConstructionHash:'1'.repeat(64),selectedModelSha256:'2'.repeat(64),selectedPolicySha256:'3'.repeat(64),protocolSha256:'4'.repeat(64)};
  const b=Buffer.from(JSON.stringify(r));assert.equal(verifySelectionReceipt(b,sha(b)).phase,r.phase);assert.throws(()=>verifySelectionReceipt(b,'0'.repeat(64)));
  for(const patch of [{finalTestEvaluated:true},{phase:'after-test'},{extra:'forbidden'},{selectedModelSha256:'bad'}]){const v=Buffer.from(JSON.stringify({...r,...patch}));assert.throws(()=>verifySelectionReceipt(v,sha(v)));}
});
test('policy, origin pacing and buffer erasure; no links traversed',async()=>{
  const t=transport();const out=await collectPublicCaptures(compileCaptureManifest(input()),t);
  assert.equal(out.status,'complete');assert.equal(out.outcomes.length,32);assert.equal(t.calls.length,34);
  assert(t.calls.every((c,i)=>i===0||c.at-t.calls[i-1].at>=2000));assert(t.buffers.every(b=>b.every(n=>n===0)));
  assert(out.outcomes.every(o=>o.current.characters<=4096&&o.leadCandidate.characters<=4096));
  assert.equal(captureSourceInputHash(out.outcomes[0]).length,64);
});
test('robots denial, TDM reservation and redirect are fail-closed without retries',async()=>{
  for(const options of [{robots:'User-agent: *\nDisallow: /wiki/'},{tdm:'[{"location":"/wiki/*","tdm-reservation":1}]'},{redirect:true}]){
    const t=transport(options),out=await collectPublicCaptures(compileCaptureManifest(input()),t);
    assert.equal(out.status,'partial-failure');assert.equal(out.completedCases,0);assert(t.calls.length<=3);assert(t.buffers.every(b=>b.every(n=>n===0)));
  }
});
test('absolute deadline and aborted signal do not launch requests',async()=>{
  const t=transport(),abort=new AbortController();abort.abort();assert.equal((await collectPublicCaptures(compileCaptureManifest(input()),{...t,signal:abort.signal})).status,'partial-failure');assert.equal(t.calls.length,0);
  let n=0;const u=transport();const out=await collectPublicCaptures(compileCaptureManifest(input()),{...u,clock:()=>n++?360001:0});assert.equal(out.failureCode,'absolute-capture-deadline');assert.equal(u.calls.length,0);
});
test('absent policies allowed only404/410; transient errors no retry; successful prefix retained',async()=>{
  const t=transport(),fetch=t.fetchPublic;let pages=0;
  t.fetchPublic=async(url,options)=>{if(options.resourceKind!=='page')throw new PublicFetchError('http-status',{status:404});
    if(++pages===2)throw new PublicFetchError('http-status',{status:503});return fetch(url,options);};
  const out=await collectPublicCaptures(compileCaptureManifest(input()),t);
  assert.equal(out.status,'partial-failure');assert.equal(out.completedCases,1);assert.equal(out.failedCaseId,'case-1');assert.equal(pages,2);
  assert(t.buffers.every(b=>b.every(n=>n===0)));assert.equal(out.outcomes[0].policy.robotsAbsent,true);
});
test('header/meta reservation wins, response overcap rejects and wipes buffer',async()=>{
  for(const kind of ['header','meta','oversize']){
    const t=transport(),fetch=t.fetchPublic;
    t.fetchPublic=async(url,options)=>{const r=await fetch(url,options);if(options.resourceKind==='page'){
      if(kind==='header')r.headers.tdmReservation='1';
      if(kind==='meta')r.text=r.text.replace('<html>','<html><meta name="tdm-reservation" content="1">');
      if(kind==='oversize'){r.body.fill(0);r.body=Buffer.alloc(2*1024*1024+1,1);t.buffers.push(r.body);}
    }return r;};
    const out=await collectPublicCaptures(compileCaptureManifest(input()),t);assert.equal(out.status,'partial-failure');assert.equal(out.completedCases,0);assert(t.buffers.every(b=>b.every(n=>n===0)));
  }
});
test('lead excludes menu/infobox, unavailable has no wholepage fallback',()=>{
  const lead=extractWikipediaLeadCandidate(html.replace('<p>','<table><tr><td>NOISE</td></tr></table><p>'));
  assert.equal(lead.status,'available');assert(!lead.text.includes('NOISE'));assert.equal(extractWikipediaLeadCandidate('<main>menu only</main>').status,'unavailable');
});
test('explicit lead extractor is exact reviewed four-page diagnostic copy',async()=>{
  const current=await readFile(new URL('./capture.js',import.meta.url),'utf8'),prior=await readFile(new URL('../../../data/hierarchy-capture-quality-adr135.mjs',import.meta.url),'utf8');
  const block=s=>s.slice(s.indexOf('// Small bounded tokenizer'),s.indexOf('function revisionMetadata'));
  assert.equal(block(current),block(prior));
  assert.equal(sha(Buffer.from(prior)),'adb6c89899a6fea8caa2a8ac937b5703538da3496c89b04ad955087e8996adc5');
});
test('pinned gold produces 96 disjoint traincal and 32 root-only reserved test rows',async()=>{
  const golds={};for(const [key,name]of Object.entries({training:'hierarchy-real-root-training-gold-adr136.json',calibration:'hierarchy-real-root-calibration-gold-adr136.json',original:'hierarchy-curated-web-gold-adr134.json',supplement:'hierarchy-real-root-test-supplement-adr136.json'}))golds[key]=JSON.parse(await readFile(new URL('../../../data/'+name,import.meta.url),'utf8'));
  const cohorts=buildCohorts(golds);assert.equal(cohorts.traincal.length,96);assert.equal(cohorts.test.length,32);
  for(const phase of ['traincal','test'])assert.doesNotThrow(()=>compileCaptureManifest({namespace:CAPTURE_NAMESPACE,phase,cases:cohorts[phase].map(({id,url})=>({id,url}))}));
  assert(cohorts.test.every(c=>!['web-01','web-02','web-03','web-04'].includes(c.id)&&c.labelScope==='root-only'));
  golds.calibration.cases[0].entityGroup=golds.training.cases[0].entityGroup;assert.throws(()=>buildCohorts(golds));
});
