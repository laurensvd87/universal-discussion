import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {captureStaticHtml} from '../../../src/crawler/static-capture.js';
import {PublicFetchError} from '../../../src/crawler/public-fetch.js';
import {CASES,collectDiagnostic,extractWikipediaLeadCandidate} from '../../../data/hierarchy-capture-quality-adr135.mjs';

const prose='This independently authored paragraph explains a real article subject using connected complete sentences rather than navigation labels or tabular side information. ';
const html=`<html><head><title>Authored diagnostic fixture</title></head><body><main>
<div role="navigation">Language chooser Menu Navigation</div><div class="mw-parser-output">
<table class="infobox"><tr><td><p>${'Unrelated infobox row '.repeat(15)}</p></td></tr></table>
<div class="hatnote"><p>${'Disambiguation other meanings '.repeat(8)}</p></div>
<p>${prose}<sup>citation-noise</sup></p><p>${prose}</p><h2>Later section</h2><p>${'Not lead '.repeat(40)}</p>
</div></main></body></html>`;
function transport(transform=()=>{}){
  let now=0;const seen=[],bodies=[];
  return {seen,bodies,clock:()=>now,sleep:async ms=>{now+=ms;},fetchPublic:async(url,options)=>{
    seen.push({url,at:now,...options});
    let text=options.resourceKind==='robots'?'User-agent: *\nAllow: /\nCrawl-delay: 2\n':options.resourceKind==='tdmrep'?'[]':html;
    const response={kind:'content',status:200,url,finalUrl:url,text,body:Buffer.from(text),compressedBytes:Buffer.byteLength(text),
      mimeType:options.resourceKind==='robots'?'text/plain':options.resourceKind==='tdmrep'?'application/json':'text/html',contentEncoding:'identity',
      headers:{xRobotsTag:[],tdmReservation:null}};
    bodies.push(response.body);return transform({url,options,response,seen})??response;
  }};
}

test('fixture proves current semantic-main prefix can include role navigation and an infobox; prose candidate excludes both',()=>{
  const old=captureStaticHtml(html,CASES[0].url),candidate=extractWikipediaLeadCandidate(html);
  assert.ok(old.text.startsWith('Language chooser Menu Navigation'));
  assert.ok(old.text.includes('Unrelated infobox row'));
  assert.equal(candidate.status,'available');assert.equal(candidate.paragraphCount,2);
  assert.ok(candidate.text.startsWith('This independently authored paragraph'));
  for(const noise of ['Language chooser','infobox','Disambiguation','citation-noise','Not lead'])assert.ok(!candidate.text.includes(noise));
  assert.equal(candidate.sha256,createHash('sha256').update(candidate.text).digest('hex'));
  assert.equal(candidate.browserParityClaim,false);
});

test('no explicit Wikipedia content or no substantial prose yields unavailable, never a whole-page fallback',()=>{
  for(const source of [`<main><p>${prose}</p></main>`,`<div class="mw-parser-output"><p>Short stub.</p></div>`]){
    const result=extractWikipediaLeadCandidate(source);assert.equal(result.status,'unavailable');assert.equal(result.text,'');
  }
});

test('candidate excludes hidden wrappers, decodes entities and bounds text without splitting surrogate pairs',()=>{
  const result=extractWikipediaLeadCandidate(`<section data-mw-section-id="0"><div hidden><p>${prose}</p></div><p>${'a &amp; b '.repeat(800)}</p></section>`);
  assert.equal(result.status,'available');assert.ok(result.characters<=4096);assert.ok(result.text.includes('a & b'));
  assert.throws(()=>extractWikipediaLeadCandidate('x'.repeat(2*1024*1024+1)));
});

test('four fixed pages use only ten whitelisted resources, shared origin pacing, ordinary transport timeout and no retained response buffers',async()=>{
  const mock=transport(),result=await collectDiagnostic(mock);assert.equal(result.outcomes.length,4);assert.equal(result.requests.length,10);
  assert.deepEqual(result.outcomes.map(r=>r.url),CASES.map(r=>r.url));
  const last=new Map();for(const request of mock.seen){const origin=new URL(request.url).origin;if(last.has(origin))assert.ok(request.at-last.get(origin)>=2000);
    last.set(origin,request.at);assert.ok(request.timeoutMs<=15000);assert.equal(new URL(request.url).protocol,'https:');}
  assert.ok(mock.bodies.every(b=>b.every(v=>v===0)));assert.ok(result.outcomes.every(r=>r.revisionId===null));
  assert.ok(result.outcomes.every(r=>r.current.characters<=4096&&r.leadCandidate.characters<=4096));
  assert.ok(result.outcomes.every(r=>!Object.hasOwn(r,'html')&&!Object.hasOwn(r,'body')));
});

test('robots denial aborts before fetching a page, with no retry or further case',async()=>{
  const mock=transport(({options,response})=>{if(options.resourceKind==='robots')response.text='User-agent: *\nDisallow: /wiki/';});
  await assert.rejects(collectDiagnostic(mock),e=>e.diagnosticCode==='page-robots-denied');
  assert.equal(mock.seen.filter(r=>r.resourceKind==='page').length,0);assert.equal(mock.seen.length,2);
});

test('TDM document, header, meta and X-Robots restrictions abort rather than retaining an output or following links',async()=>{
  for(const kind of ['document','header','meta','robots']){
    const mock=transport(({options,response})=>{
      if(kind==='document'&&options.resourceKind==='tdmrep')response.text='[{"location":"/wiki/*","tdm-reservation":1}]';
      if(options.resourceKind==='page'){
        if(kind==='header')response.headers.tdmReservation='1';
        if(kind==='meta')response.text=html.replace('<head>','<head><meta name="tdm-reservation" content="1">');
        if(kind==='robots')response.headers.xRobotsTag=['noai'];
      }
    });await assert.rejects(collectDiagnostic(mock));assert.ok(mock.seen.length<=3);
  }
});

test('redirects and network failures abort once without alias expansion or retry',async()=>{
  for(const kind of ['redirect','failure']){
    const mock=transport(({response})=>{if(kind==='failure')throw new PublicFetchError('network-failed');
      return {...response,kind:'redirect',redirectUrl:'https://en.wikipedia.org/wiki/Other'};});
    await assert.rejects(collectDiagnostic(mock));assert.equal(mock.seen.length,1);
  }
});

test('only policy 404/410 is absent; 403 never converts to allow-all and huge origin delay refuses before sleep',async()=>{
  const absent=transport(({options})=>{if(options.resourceKind!=='page')throw new PublicFetchError('http-status',{status:404});});
  assert.equal((await collectDiagnostic(absent)).outcomes.length,4);
  const denied=transport(()=>{throw new PublicFetchError('http-status',{status:403});});
  await assert.rejects(collectDiagnostic(denied));assert.equal(denied.seen.length,1);
  const slow=transport(({options,response})=>{if(options.resourceKind==='robots')response.text='User-agent: *\nCrawl-delay: 999\n';});
  await assert.rejects(collectDiagnostic(slow),e=>e.diagnosticCode==='origin-delay-exceeds-deadline');assert.equal(slow.seen.length,1);
});

test('revision attribution is literal and conflicting or missing identifiers never invent a revision',async()=>{
  const mock=transport(({options,response})=>{if(options.resourceKind==='page')response.text=html+'<script>{"wgRevisionId":123456}</script>';});
  const result=await collectDiagnostic(mock);assert.ok(result.outcomes.every(r=>r.revisionId==='123456'));
  assert.ok(result.outcomes.every(r=>r.revisionUrl.endsWith('/w/index.php?oldid=123456')));
  const conflicting=transport(({options,response})=>{if(options.resourceKind==='page')response.text=html+'<script>{"wgRevisionId":123456,"nested":{"wgRevisionId":987654}}</script>';});
  assert.ok((await collectDiagnostic(conflicting)).outcomes.every(r=>r.revisionId===null&&r.revisionUrl===null));
});
