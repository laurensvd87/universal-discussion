import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {createHierarchyPublicCapture,createHierarchyChildTrainCalCapture} from '../harness/hierarchy-public-capture.js';
import {readFileSync} from 'node:fs';
import {PUBLIC_HIERARCHY_PROBES as probes} from '../harness/hierarchy-public-probes.js';
import {RECIPE_CAL_PROBES,RECIPE_TEST_PROBES} from '../harness/hierarchy-recipe-corpus.js';
import {GTA_TRAIN_PROBES,GTA_CAL_PROBES,GTA_TEST_PROBES} from '../harness/hierarchy-gta-corpus.js';
import {PublicFetchError} from '../src/crawler/public-fetch.js';

const sha=s=>createHash('sha256').update(s).digest('hex');
const body='A public article about this independently selected subject has enough actual prose to pass the existing minimum text policy. '.repeat(4);
const html=(head='',text=body)=>`<!doctype html><html><head><title>Fresh public title</title>${head}</head><body><main><p>${text}</p></main></body></html>`;
function fixture({robots='',tdm=null,page=()=>html(),onRequest}={}){
 let time=0;const calls=[],buffers=[],sleeps=[];
 const content=(url,text,resourceKind,headers={})=>{const bytes=Buffer.from(text);buffers.push(bytes);return {kind:'content',url,finalUrl:url,status:200,mimeType:resourceKind==='page'?'text/html':resourceKind==='robots'?'text/plain':'application/json',text,body:bytes,
  headers:{xRobotsTag:[],tdmReservation:null,tdmPolicy:null,...headers}};};
 const fetchPublic=async(url,options)=>{
  calls.push({url,time,...options});if(onRequest)return onRequest(url,options,content);
  if(options.resourceKind==='robots'){if(robots===null)throw new PublicFetchError('http-status',{status:404});return content(url,robots,'robots');}
  if(options.resourceKind==='tdmrep'){if(tdm===null)throw new PublicFetchError('http-status',{status:410});return content(url,tdm,'tdmrep');}
  const value=page(url,options);return typeof value==='string'?content(url,value,'page'):value;
 };
 const options={fetchPublic,clock:()=>time,sleep:async ms=>{sleeps.push(ms);time+=ms;},deadline:240000};
 return {capture:createHierarchyPublicCapture(options),options,calls,buffers,sleeps,advance:ms=>{time+=ms;},content};
}

const childPlan=JSON.parse(readFileSync(new URL('../harness/hierarchy-child-corpus.json',import.meta.url),'utf8'));
const childRows=childPlan.freshCandidates.filter(r=>r.split!=='test');
test('closed child TRAIN/CAL batch matches exact plan and uses independent five-origin policies under unchanged caps',async()=>{
 const f=fixture(),capture=createHierarchyChildTrainCalCapture(f.options);
 for(const row of childRows){const result=await capture.capture(row.id);assert.equal(result.url,row.url);assert.equal(result.status,'available',row.id);}
 assert.equal(f.calls.length,21);assert.equal(f.calls.filter(c=>c.resourceKind==='page').length,11);
 for(const origin of new Set(childRows.map(r=>r.origin))){assert.equal(f.calls.filter(c=>new URL(c.url).origin===origin&&c.resourceKind==='robots').length,1);assert.equal(f.calls.filter(c=>new URL(c.url).origin===origin&&c.resourceKind==='tdmrep').length,1);}
 for(let i=1;i<f.calls.length;i++)assert.ok(f.calls[i].time-f.calls[i-1].time>=5000);
 assert.equal(capture.snapshot().maxRequests,34);assert.equal(capture.snapshot().deadline,240000);
 assert.equal((await capture.capture(childRows[0].id)).reason,'already-attempted');assert.equal(f.calls.length,21);
 for(const row of childPlan.freshCandidates.filter(r=>r.split==='test'))await assert.rejects(capture.capture(row.id));
 await assert.rejects(capture.capture('https://www.qld.gov.au/foreign'));await assert.rejects(capture.capture(probes[0].id));
 await assert.rejects(f.capture.capture(childRows[0].id));assert.equal(f.calls.length,21);
});
test('child origin stop affects only that origin and policy failures cannot be retried',async()=>{
 const f=fixture({onRequest(url,options,content){if(options.resourceKind==='robots')return content(url,'','robots');if(options.resourceKind==='tdmrep')throw new PublicFetchError('http-status',{status:404});if(new URL(url).origin==='https://savethekoala.com')throw new PublicFetchError('http-status',{status:429});return content(url,html(),'page');}});
 const capture=createHierarchyChildTrainCalCapture(f.options);
 assert.equal((await capture.capture('child-train-01')).reason,'rate-limited');const count=f.calls.length;
 assert.equal((await capture.capture('child-train-02')).reason,'origin-paused');assert.equal(f.calls.length,count);
 assert.equal((await capture.capture('child-cal-01')).status,'available');assert.equal((await capture.capture('child-cal-02')).status,'available');
 const g=fixture({onRequest(url,options,content){if(new URL(url).origin==='https://savethekoala.com')throw new PublicFetchError('http-status',{status:403});if(options.resourceKind==='robots')return content(url,'','robots');if(options.resourceKind==='tdmrep')throw new PublicFetchError('http-status',{status:404});return content(url,html(),'page');}});
 const other=createHierarchyChildTrainCalCapture(g.options);assert.equal((await other.capture('child-train-01')).reason,'policy-unavailable');assert.equal((await other.capture('child-train-02')).reason,'policy-unavailable');assert.equal(g.calls.length,1);assert.equal((await other.capture('child-cal-01')).status,'available');
});

test('fresh same-response title and body use real extraction, bounded hashes and cleared buffers',async()=>{
 const f=fixture(),row=await f.capture.capture(probes[0].id);
 assert.equal(row.status,'available');assert.equal(row.title,'Fresh public title');assert.ok(row.text.length>=160&&row.text.length<=4096);
 assert.equal(row.bodySha256,sha(row.text));assert.equal(row.titleSha256,sha(row.title));assert.equal(row.responseSha256,sha(html()));
 assert.equal(row.extractorVersion,'crawler-static-html-prefix/v1');assert.equal(row.nativeObservation,false);assert.equal(row.assignmentAuthority,false);
 assert.ok(!Object.hasOwn(row,'headers'));assert.ok(!Object.hasOwn(row,'html'));assert.ok(Object.isFrozen(row));
 assert.ok(f.buffers.every(bytes=>bytes.every(n=>n===0)));assert.deepEqual(f.calls.map(c=>c.resourceKind),['robots','tdmrep','page']);
 assert.ok(f.calls.every(c=>c.timeoutMs<=15000&&c.timeoutMs>0));
});

test('all fixed probes share one origin policy, consume at most34 sequential paced requests and cannot retry',async()=>{
 const f=fixture({robots:'User-agent: *\nAllow: /\nCrawl-delay: 6'});
 const rows=await Promise.all(probes.map(p=>f.capture.capture(p.id)));assert.equal(rows.length,32);assert.ok(rows.every(r=>r.status==='available'));
 assert.equal(f.calls.length,34);assert.equal(f.calls.filter(c=>c.resourceKind==='robots').length,1);assert.equal(f.calls.filter(c=>c.resourceKind==='tdmrep').length,1);
 for(let i=1;i<f.calls.length;i++)assert.ok(f.calls[i].time-f.calls[i-1].time>=6000);
 const duplicate=await f.capture.capture(probes[0].id);assert.equal(duplicate.reason,'already-attempted');assert.equal(f.calls.length,34);
 assert.equal(f.capture.snapshot().attempted,32);assert.equal(f.capture.snapshot().requests,34);assert.equal(f.capture.snapshot().pacing,'local-only-not-coordinated-with-live-crawler');
 await assert.rejects(f.capture.capture('https://foreign.example/'),/Invalid fixed public probe/);await assert.rejects(f.capture.capture(probes[0].id,{}),/Invalid fixed public probe/);assert.equal(f.calls.length,34);
});

test('robots denial prevents article requests and policy failure stays cached for later probes',async()=>{
 const f=fixture({robots:'User-agent: *\nDisallow: /wiki/'});assert.equal((await f.capture.capture(probes[0].id)).reason,'robots-denied');assert.equal(f.calls.length,2);
 assert.equal((await f.capture.capture(probes[1].id)).reason,'robots-denied');assert.equal(f.calls.length,2);
 const g=fixture({onRequest(){throw new Error('PRIVATE upstream details must not escape');}});
 assert.equal((await g.capture.capture(probes[0].id)).reason,'policy-unavailable');assert.equal((await g.capture.capture(probes[1].id)).reason,'policy-unavailable');assert.equal(g.calls.length,1);
 assert.equal((await g.capture.capture(probes[0].id)).reason,'already-attempted');
 const malformed=fixture({robots:'User-agent: *\nDisallow: /bad path'});assert.equal((await malformed.capture.capture(probes[0].id)).reason,'policy-unavailable');assert.equal(malformed.calls.length,1);
});

test('missing404/410 origin documents follow normal crawler absent-policy semantics',async()=>{
 const f=fixture({robots:null,tdm:null});assert.equal((await f.capture.capture(probes[0].id)).status,'available');assert.equal(f.calls.length,3);
 const g=fixture({onRequest(){throw new PublicFetchError('http-status',{status:403});}});assert.equal((await g.capture.capture(probes[0].id)).reason,'policy-unavailable');assert.equal(g.calls.length,1);
});

test('recipe calibration requests do not fetch predeclared test subjects',async()=>{
 const f=fixture();
 for(const probe of RECIPE_CAL_PROBES)assert.equal((await f.capture.capture(probe.id)).status,'available');
 assert.equal(f.calls.length,6);
 assert.ok(f.calls.every(call=>!RECIPE_TEST_PROBES.some(probe=>probe.url===call.url)));
 assert.equal(f.capture.snapshot().attempted,4);
});

test('GTA fitting subjects stay in the fixed training/calibration list without test requests',async()=>{
 const f=fixture();
 for(const probe of [...GTA_TRAIN_PROBES,...GTA_CAL_PROBES])assert.equal((await f.capture.capture(probe.id)).status,'available');
 assert.equal(f.calls.length,18);
 assert.ok(f.calls.every(call=>!GTA_TEST_PROBES.some(probe=>probe.url===call.url)));
 assert.equal(f.capture.snapshot().attempted,16);
});

test('TDM origin/header/document and robots directives use actual parsers and normal precedence',async()=>{
 const origin=fixture({tdm:'[{"location":"/wiki/","tdm-reservation":1}]'});assert.equal((await origin.capture.capture(probes[0].id)).reason,'tdm-reserved');
 for(const directive of ['noindex','noai','notrain']){
  const f=fixture({onRequest(url,options,content){
   if(options.resourceKind==='robots')return content(url,'','robots');if(options.resourceKind==='tdmrep')throw new PublicFetchError('http-status',{status:404});
   return content(url,html(),'page',{xRobotsTag:[directive]});
  }});assert.equal((await f.capture.capture(probes[0].id)).reason,'header-restricted');assert.ok(f.buffers.every(b=>b.every(n=>n===0)));
  const g=fixture({page:()=>html(`<meta name="robots" content="${directive}">`)});assert.equal((await g.capture.capture(probes[0].id)).reason,'document-restricted');
 }
 for(const reservation of ['1','ambiguous']){
  const f=fixture({onRequest(url,options,content){if(options.resourceKind==='robots')return content(url,'','robots');if(options.resourceKind==='tdmrep')return content(url,'[]','tdmrep');return content(url,html(),'page',{tdmReservation:reservation});}});
  assert.equal((await f.capture.capture(probes[0].id)).reason,reservation==='1'?'tdm-reserved':'tdm-ambiguous');
 }
 const conflicting=fixture({page:()=>html('<meta name="tdm-reservation" content="0"><meta name="tdm-reservation" content="1">')});assert.equal((await conflicting.capture.capture(probes[0].id)).reason,'tdm-ambiguous');
 const normalPrecedence=fixture({tdm:'[{"location":"/wiki/","tdm-reservation":1}]',page:()=>html('<meta name="tdm-reservation" content="0">')});assert.equal((await normalPrecedence.capture.capture(probes[0].id)).status,'available');
});

test('redirects are unavailable without following alternative pages or policy URLs',async()=>{
 const f=fixture({page:url=>({kind:'redirect',url,redirectUrl:'https://en.wikipedia.org/wiki/Alternative'})});assert.equal((await f.capture.capture(probes[0].id)).reason,'redirect-refused');assert.equal(f.calls.length,3);
 const g=fixture({onRequest(url){return {kind:'redirect',url,redirectUrl:'https://foreign.example/robots.txt'};}});assert.equal((await g.capture.capture(probes[0].id)).reason,'policy-unavailable');assert.equal(g.calls.length,1);
});

test('rate limiting, access denial and upstream failure stop further origin requests without retry',async()=>{
 for(const [status,reason] of [[429,'rate-limited'],[403,'access-denied'],[503,'upstream-unavailable']]){
  const f=fixture({onRequest(url,options,content){
   if(options.resourceKind==='robots')return content(url,'','robots');
   if(options.resourceKind==='tdmrep')throw new PublicFetchError('http-status',{status:404});
   throw new PublicFetchError('http-status',{status});
  }});
  assert.equal((await f.capture.capture(probes[0].id)).reason,reason);
  assert.equal((await f.capture.capture(probes[1].id)).reason,'origin-paused');
  assert.equal(f.calls.length,3);assert.equal(f.capture.snapshot().originStopped,true);
 }
});

test('insufficient text, finite deadline and abort retain unavailable outcomes without later fetches',async()=>{
 const short=fixture({page:()=>html('','Tiny text')});assert.equal((await short.capture.capture(probes[0].id)).reason,'insufficient-text');
 const f=fixture(),deadline=createHierarchyPublicCapture({...f.options,deadline:9000});const row=await deadline.capture(probes[0].id);assert.equal(row.reason,'deadline');assert.equal(f.calls.length,2);
 assert.equal((await deadline.capture(probes[1].id)).reason,'deadline');assert.equal(f.calls.length,2);
 assert.throws(()=>createHierarchyPublicCapture({...f.options,deadline:300000}),/Invalid fixed public capture deadline/);
 const controller=new AbortController(),g=fixture(),aborted=createHierarchyPublicCapture({...g.options,signal:controller.signal});controller.abort();assert.equal((await aborted.capture(probes[0].id)).reason,'aborted');assert.equal(g.calls.length,0);
});
