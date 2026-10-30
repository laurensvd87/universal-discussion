import test from 'node:test';import assert from 'node:assert/strict';
import {createPublicTopicPageCapture,publicTopicCaptureFailure} from './public-topic-page-capture.js';
import {PublicFetchError} from '../src/crawler/public-fetch.js';
function fixture({robots='User-agent: *\nAllow: /',reservation=null,redirect=false}={}){
 let time=0;const calls=[],buffers=[];
 const fetchPublic=async(url,options)=>{calls.push({url,at:time,...options});
  if(options.resourceKind==='tdmrep')throw new PublicFetchError('http-status',{status:404});
  const text=options.resourceKind==='robots'?robots:'<html><title>Koalas</title><body><main><p>'+('Koalas are marsupials that eat eucalyptus leaves. '.repeat(10))+'</p></main></body></html>';
  const body=Buffer.from(text);buffers.push(body);return{kind:'content',url,finalUrl:redirect?url+'/other':url,text,body,mimeType:'text/html',headers:{xRobotsTag:[],tdmReservation:reservation,tdmPolicy:null}};
 };
 return{calls,buffers,capture:createPublicTopicPageCapture({fetchPublic,now:()=>time,sleep:async ms=>{time+=ms;}})};
}
test('real parser receives public content after policy and pacing; response buffers are wiped',async()=>{
 const f=fixture(),r=await f.capture('https://example.org/koalas',50000);
 assert.equal(r.title,'Koalas');assert.ok(r.body.length>=160);assert.match(r.evidenceSha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(f.calls.map(c=>c.at),[0,5000,10000]);assert.ok(f.buffers.every(b=>b.every(n=>n===0)));
});
test('denied robots do not dispatch the page; a reserved page is never returned',async()=>{
 const denied=fixture({robots:'User-agent: *\nDisallow: /koalas'});
 await assert.rejects(denied.capture('https://example.org/koalas',50000),e=>publicTopicCaptureFailure(e)==='policy-denied');
 assert.equal(denied.calls.some(c=>c.resourceKind==='page'),false);
 const reserved=fixture({reservation:'1'});await assert.rejects(reserved.capture('https://example.org/koalas',50000),e=>publicTopicCaptureFailure(e)==='policy-denied');
 assert.ok(reserved.buffers.every(b=>b.every(n=>n===0)));
});
test('a changed final URL and an exhausted pacing deadline cannot supply substitute text',async()=>{
 const moved=fixture({redirect:true});await assert.rejects(moved.capture('https://example.org/koalas',50000));assert.equal(moved.calls.length,1);
 const late=fixture();await assert.rejects(late.capture('https://example.org/koalas',9000),e=>publicTopicCaptureFailure(e)==='capture-deadline');
 assert.equal(late.calls.some(c=>c.resourceKind==='page'),false);
});
