import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {CAPTURE_NAMESPACE,CAPTURE_LIMITS,compileCaptureManifest,describeCaptureManifest,isPageCapacityRefusal,collectPublicCaptures,extractWikipediaLeadCandidate} from './capture.js';
import {PublicFetchError} from '../../../src/crawler/public-fetch.js';
import {captureStaticHtml} from '../../../src/crawler/static-capture.js';
import {compileCaptureManifest as compilePrior,collectPublicCaptures as collectPrior,CAPTURE_NAMESPACE as PRIOR_NAMESPACE} from '../hierarchical-public-capture-v4/capture.js';
const sha=x=>createHash('sha256').update(x).digest('hex');
// Pure reference for the unchanged eight-field downstream input contract.
const fixtureSourceInputHash=o=>sha(JSON.stringify({id:o.id,url:o.url,htmlSha256:o.htmlSha256,title:o.title,currentSha256:o.current.sha256,
  leadSha256:o.leadCandidate.sha256,decodedHtmlSha256:o.decodedHtmlSha256,metadataPruneReceiptSha256:sha(JSON.stringify(o.metadataPrune))}));
function input(phase='test'){return {namespace:CAPTURE_NAMESPACE,phase,cases:Array.from({length:phase==='test'?32:80},(_,i)=>({id:'case-'+i,url:'https://en.wikipedia.org/wiki/Fixture_'+i}))};}
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
test('policy, origin pacing and buffer erasure; no links traversed',async()=>{
  const t=transport();const out=await collectPublicCaptures(compileCaptureManifest(input()),t);
  assert.equal(out.status,'complete');assert.equal(out.outcomes.length,32);assert.equal(t.calls.length,34);
  assert(t.calls.every((c,i)=>i===0||c.at-t.calls[i-1].at>=2000));assert(t.buffers.every(b=>b.every(n=>n===0)));
  assert(out.outcomes.every(o=>o.current.characters<=4096&&o.leadCandidate.characters<=4096));
  assert.equal(fixtureSourceInputHash(out.outcomes[0]).length,64);
  assert.equal(out.outcomes[0].policy.robotsSha256,sha(''));
  assert.equal(out.outcomes[0].policy.robotsDecodedSha256,sha(''));
  assert.equal(out.outcomes[0].policy.robotsCanonicalSha256,sha(''));
  assert.equal(out.outcomes[0].policy.robotsRepairId,null);
});

test('unknown invalid NL robots snapshot cannot enter repair, TDM or page capture',async()=>{
  const manifest=input();manifest.cases=manifest.cases.map(c=>({...c,url:c.url.replace('en.wikipedia','nl.wikipedia')}));
  const t=transport({robots:"User-agent: *\nDisallow: /wiki/Overleg wikipedia:Te_beoordelen_pagina's/"});
  const out=await collectPublicCaptures(compileCaptureManifest(manifest),t);
  assert.equal(out.status,'partial-failure');assert.equal(out.failedStage,'robots');assert.equal(out.completedCases,0);
  assert.equal(t.calls.length,1);assert.equal(t.calls[0].resourceKind,'robots');assert(t.buffers.every(b=>b.every(n=>n===0)));
});

test('prune precedes BOTH legacy extractors, keeps original identity and binds receipt',async()=>{
  const page=html.replace('<p>','<span data-mw="'+('x'.repeat(17000))+'"></span><p>');
  assert.throws(()=>captureStaticHtml(page,input().cases[0].url));
  const t=transport({page}),out=await collectPublicCaptures(compileCaptureManifest(input()),t);
  assert.equal(out.status,'complete');const o=out.outcomes[0];
  assert.equal(o.htmlSha256,sha(Buffer.from(page)));assert.equal(o.decodedHtmlSha256,sha(page));assert.equal(o.decodedHtmlCharacters,page.length);
  assert.equal(o.metadataPrune.originalSha256,o.decodedHtmlSha256);assert.equal(o.metadataPrune.removedAttributes,1);
  assert.equal(o.metadataPrune.version,'wikipedia-quoted-transport-metadata-prune/v1');
  assert.equal(o.leadCandidate.status,'available');assert(o.current.characters>0);assert(!o.current.text.includes('xxxxx'));
  const expected=sha(JSON.stringify({id:o.id,url:o.url,htmlSha256:o.htmlSha256,title:o.title,currentSha256:o.current.sha256,
    leadSha256:o.leadCandidate.sha256,decodedHtmlSha256:o.decodedHtmlSha256,metadataPruneReceiptSha256:sha(JSON.stringify(o.metadataPrune))}));
  assert.equal(fixtureSourceInputHash(o),expected);
  assert.notEqual(fixtureSourceInputHash({...o,decodedHtmlSha256:'0'.repeat(64)}),expected);
  assert.notEqual(fixtureSourceInputHash({...o,metadataPrune:{...o.metadataPrune,removedCharacters:0}}),expected);
  assert(t.buffers.every(b=>b.every(n=>n===0)));
});

test('pruning never removes ordinary oversized attributes or weakens directives',async()=>{
  for(const fragment of ['<div data-other="'+('x'.repeat(17000))+'"></div>',
    '<div data-mw="'+('x'.repeat(17000))+'"></div><meta name="robots" content="noindex">',
    '<div data-parsoid="'+('x'.repeat(17000))+'"></div><meta name="tdm-reservation" content="1">']){
    const t=transport({page:html.replace('<p>',fragment+'<p>')}),out=await collectPublicCaptures(compileCaptureManifest(input()),t);
    assert.equal(out.status,'partial-failure');assert.equal(out.completedCases,0);assert.equal(t.calls.length,3);
    assert(t.buffers.every(b=>b.every(n=>n===0)));
  }
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

test('only exact80 training-expansion or exact32 test manifests; legacy and variable phases refuse',()=>{
  assert.equal(CAPTURE_NAMESPACE,'hierarchy-real-root-public-capture/v5');
  assert.equal(CAPTURE_LIMITS.maxTrainingExpansionCases,80);assert.equal(CAPTURE_LIMITS.maxTestCases,32);
  for(const phase of ['training-expansion','test']){
    const value=input(phase),h=compileCaptureManifest(value);
    assert.equal(describeCaptureManifest(h).cases.length,phase==='training-expansion'?80:32);
    for(const delta of [-1,1]){
      const a=input(phase);
      if(delta<0)a.cases.pop();else a.cases.push({id:'extra',url:'https://en.wikipedia.org/wiki/Extra_fixture'});
      assert.throws(()=>compileCaptureManifest(a));
    }
  }
  for(const phase of ['traincal','training','calibration','development','variable',undefined]){
    const a=input('training-expansion');a.phase=phase;assert.throws(()=>compileCaptureManifest(a));
  }
  const a=input();a.expectedCases=32;assert.throws(()=>compileCaptureManifest(a));
  for(const namespace of ['hierarchy-real-root-public-capture/v3','hierarchy-real-root-public-capture/v2']){
    assert.throws(()=>compileCaptureManifest({...input(),namespace}));
  }
});

test('full80 synthetic augmentation capture retains fixed request/pacing/byte math',async()=>{
  const t=transport(),out=await collectPublicCaptures(compileCaptureManifest(input('training-expansion')),t);
  assert.equal(out.namespace,CAPTURE_NAMESPACE);assert.equal(out.phase,'training-expansion');
  assert.equal(out.status,'complete');assert.equal(out.expectedCases,80);assert.equal(out.completedCases,80);
  assert.equal(out.outcomes.length,80);assert.equal(t.calls.length,82);
  assert(t.calls.every(c=>c.timeoutMs<=15000));assert(t.calls.every((c,i)=>i===0||c.at-t.calls[i-1].at>=2000));
  assert(t.buffers.every(b=>b.every(n=>n===0)));assert.equal(out.noAutomaticRetry,true);
  assert(Object.isFrozen(out)&&Object.isFrozen(out.outcomes)&&Object.isFrozen(out.outcomes[0].metadataPrune));
});

test('capacity classifier requires actual typed error and own data cause code; no getter/proxy callbacks',()=>{
  assert.equal(isPageCapacityRefusal(new PublicFetchError('body-too-large')),true);
  assert.equal(isPageCapacityRefusal(new PublicFetchError('content-encoding',{cause:Object.assign(Error('unretained'),{code:'ERR_BUFFER_TOO_LARGE'})})),true);
  let touched=0;
  const inherited=Object.create({code:'ERR_BUFFER_TOO_LARGE'}),getter={};Object.defineProperty(getter,'code',{get(){touched++;return 'ERR_BUFFER_TOO_LARGE';}});
  const errorGetter=new PublicFetchError('content-encoding');Object.defineProperty(errorGetter,'cause',{get(){touched++;return {code:'ERR_BUFFER_TOO_LARGE'};}});
  for(const error of [{code:'body-too-large'},new Error('body-too-large'),new PublicFetchError('content-encoding'),
    new PublicFetchError('content-encoding',{cause:{code:'Z_DATA_ERROR'}}),new PublicFetchError('content-encoding',{cause:inherited}),
    new PublicFetchError('content-encoding',{cause:getter}),errorGetter,new Proxy({}, {getPrototypeOf(){touched++;throw Error('trap');}})])assert.equal(isPageCapacityRefusal(error),false);
  assert.equal(touched,0);
});
test('80ledger continues ONLY typedPAGEcapacity, sharedpolicycache/pacing and no false Source identity',async()=>{
  const t=transport(),fetch=t.fetchPublic;let pages=0;
  t.fetchPublic=async(url,options)=>{if(options.resourceKind==='page'&&[1,3].includes(pages++))throw pages===2?
    new PublicFetchError('body-too-large'):new PublicFetchError('content-encoding',{cause:{code:'ERR_BUFFER_TOO_LARGE'}});return fetch(url,options);};
  const out=await collectPublicCaptures(compileCaptureManifest(input('training-expansion')),t);
  assert.equal(out.status,'complete');assert.equal(out.ledger.length,80);assert.equal(out.completedCases,80);assert.equal(out.attemptedCases,80);
  assert.equal(out.capturedCases,78);assert.equal(out.capacityRefusedCases,2);assert.equal(out.fatalCases,0);assert.equal(out.notAttemptedCases,0);
  assert.equal(out.requests.length,82);assert.equal(t.calls.filter(c=>c.resourceKind==='robots').length,1);assert.equal(t.calls.filter(c=>c.resourceKind==='tdmrep').length,1);
  assert(out.requests.every((r,i)=>!i||r.startedOffsetMs-out.requests[i-1].startedOffsetMs>=2000));
  for(const row of out.ledger.filter(r=>r.status==='capacity-refused')){
    assert.equal(row.pagePolicyAvailable,false);assert.equal(row.pagePolicyApproved,false);assert.equal(row.rightsPageUnknown,true);
    assert.equal(row.originPolicy.robotsAllowed,true);assert.equal(row.sourceInputIdentityAvailable,false);
    for(const key of ['text','title','sourceInputHash','vector','outcomeIndex'])assert.equal(Object.hasOwn(row,key),false);
  }
});
test('full32all-refused is accounted complete but has ZEROusable captures',async()=>{
  const t=transport(),fetch=t.fetchPublic;t.fetchPublic=(url,options)=>options.resourceKind==='page'?Promise.reject(new PublicFetchError('body-too-large')):fetch(url,options);
  const out=await collectPublicCaptures(compileCaptureManifest(input()),t);
  assert.equal(out.status,'complete');assert.equal(out.ledger.length,32);assert.equal(out.completedCases,32);assert.equal(out.capturedCases,0);
  assert.equal(out.capacityRefusedCases,32);assert.equal(out.outcomes.length,0);assert.equal(out.requests.length,34);
});
test('capacity at robots orTDM remains fatal and fullledger marks all latercases notattempted',async()=>{
  for(const stage of ['robots','tdmrep'])for(const code of ['body-too-large','content-encoding']){
    const t=transport(),fetch=t.fetchPublic;t.fetchPublic=(url,options)=>options.resourceKind===stage?Promise.reject(new PublicFetchError(code,{cause:{code:'ERR_BUFFER_TOO_LARGE'}})):fetch(url,options);
    const out=await collectPublicCaptures(compileCaptureManifest(input('training-expansion')),t);
    assert.equal(out.status,'partial-failure');assert.equal(out.capacityRefusedCases,0);assert.equal(out.fatalCases,1);assert.equal(out.notAttemptedCases,79);
    assert.equal(out.ledger[0].status,'fatal');assert.equal(out.requests.length,stage==='robots'?1:2);
  }
});
test('noncapacityPAGEvariants STOP instead of hiding error as refusal',async()=>{
  const errors=[new PublicFetchError('content-encoding',{cause:{code:'Z_BUF_ERROR'}}),new PublicFetchError('content-encoding',{cause:{code:'Z_DATA_ERROR'}}),
    new PublicFetchError('content-encoding'),new PublicFetchError('compression-ratio'),new PublicFetchError('content-type'),new PublicFetchError('character-encoding'),
    new PublicFetchError('timeout'),new PublicFetchError('aborted'),new PublicFetchError('network-failed'),{code:'body-too-large'}];
  for(const error of errors){
    const t=transport(),fetch=t.fetchPublic;t.fetchPublic=(url,options)=>options.resourceKind==='page'?Promise.reject(error):fetch(url,options);
    const out=await collectPublicCaptures(compileCaptureManifest(input()),t);
    assert.equal(out.status,'partial-failure');assert.equal(out.capacityRefusedCases,0);assert.equal(out.fatalCases,1);assert.equal(out.notAttemptedCases,31);
    assert.equal(out.requests.length,3);assert.equal(out.ledger[0].failedStage,'page');
  }
});
test('fatal after capture and refusal retains orderedfull denominator without splicing or retry',async()=>{
  const t=transport(),fetch=t.fetchPublic;let pages=0;
  t.fetchPublic=(url,options)=>{if(options.resourceKind==='page'){
    pages++;if(pages===2)return Promise.reject(new PublicFetchError('body-too-large'));if(pages===3)return Promise.reject(new PublicFetchError('network-failed'));
  }return fetch(url,options);};
  const out=await collectPublicCaptures(compileCaptureManifest(input('training-expansion')),t);
  assert.deepEqual(out.ledger.slice(0,4).map(r=>r.status),['captured','capacity-refused','fatal','not-attempted']);
  assert.equal(out.ledger.length,80);assert.equal(out.completedCases,2);assert.equal(out.attemptedCases,3);assert.equal(out.notAttemptedCases,77);
  assert.equal(out.outcomes.length,1);assert.equal(out.ledger[0].outcomeIndex,0);assert.equal(pages,3);
});
test('pagepolicy/prune/extraction failures remain fatal, never eligibility escape',async()=>{
  for(const fragment of ['<meta name="robots" content="noindex">','<meta name="tdm-reservation" content="1">','<div data-other="'+'x'.repeat(17000)+'"></div>']){
    const t=transport({page:html.replace('<p>',fragment+'<p>')}),out=await collectPublicCaptures(compileCaptureManifest(input()),t);
    assert.equal(out.fatalCases,1);assert.equal(out.capacityRefusedCases,0);assert.equal(out.notAttemptedCases,31);
    assert.equal(out.ledger[0].failedStage,'extractor');assert(t.buffers.every(b=>b.every(n=>n===0)));
  }
});
test('successfulDTOand eightfield inputidentity are unchanged fromv4',async()=>{
  const value=input(),a=await collectPublicCaptures(compileCaptureManifest(value),transport());
  const b=await collectPrior(compilePrior({...value,namespace:PRIOR_NAMESPACE}),transport());
  const detached=o=>{const {fetchedAt,...rest}=o;return rest;};
  assert.deepEqual(a.outcomes.map(detached),b.outcomes.map(detached));
  assert.deepEqual(a.outcomes.map(fixtureSourceInputHash),b.outcomes.map(fixtureSourceInputHash));
});
test('deadline or abort during capacity throw is fatal, including the finalcase',async()=>{
  for(const kind of ['deadline','abort'])for(const failingPage of [0,31]){
    const t=transport(),fetch=t.fetchPublic,clock=t.clock,controller=new AbortController();let expired=false,pages=0;
    t.clock=()=>expired?360001:clock();
    t.fetchPublic=(url,options)=>{
      if(options.resourceKind==='page'&&pages++===failingPage){
        if(kind==='deadline')expired=true;else controller.abort();
        return Promise.reject(new PublicFetchError('content-encoding',{cause:{code:'ERR_BUFFER_TOO_LARGE'}}));
      }
      return fetch(url,options);
    };
    const out=await collectPublicCaptures(compileCaptureManifest(input()),{...t,signal:controller.signal});
    assert.equal(out.status,'partial-failure');assert.equal(out.failureCode,'absolute-capture-deadline');
    assert.equal(out.capacityRefusedCases,0);assert.equal(out.fatalCases,1);
    assert.equal(out.ledger[failingPage].status,'fatal');assert.equal(out.completedCases,failingPage);
    assert.equal(out.attemptedCases,failingPage+1);assert.equal(out.notAttemptedCases,31-failingPage);
    assert.equal(pages,failingPage+1);assert.equal(out.ledger.length,32);
  }
});
