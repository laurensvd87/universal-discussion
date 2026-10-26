import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {CAPTURE_NAMESPACE,CAPTURE_LIMITS,compileCaptureManifest,describeCaptureManifest,collectPublicCaptures,extractWikipediaLeadCandidate} from './capture.js';
import {PublicFetchError} from '../../../src/crawler/public-fetch.js';
import {captureStaticHtml} from '../../../src/crawler/static-capture.js';
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
  assert.equal(CAPTURE_NAMESPACE,'hierarchy-real-root-public-capture/v4');
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

test('runtime source is the frozenv3 implementation with only declared namespace/phase/count changes',async()=>{
  const current=await readFile(new URL('./capture.js',import.meta.url),'utf8');
  const prior=await readFile(new URL('../hierarchical-public-capture-v3/capture.js',import.meta.url),'utf8');
  const expected=prior.replace('hierarchy-real-root-public-capture/v3','hierarchy-real-root-public-capture/v4')
    .replace('maxTraincalCases:96','maxTrainingExpansionCases:80')
    .replace("['traincal','test']","['training-expansion','test']")
    .replace("a.phase==='traincal'?96:32","a.phase==='training-expansion'?80:32");
  assert.equal(current.replace(/\r\n/gu,'\n').trimEnd(),expected.replace(/\r\n/gu,'\n').trimEnd());
});
