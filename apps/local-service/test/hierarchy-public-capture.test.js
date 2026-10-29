import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {createHierarchyPublicCapture,createHierarchyChildTrainCalCapture,createHierarchyChildDiagnosisCapture,createHierarchyChildCalibrationRepairCapture,createHierarchyChildEvaluationCapture,createHierarchyChildDiversityCapture,createHierarchyKoalaTrainingSupplementCapture,createHierarchyKoalaAdditionalTrainingCapture,createHierarchyChildAdditionalBoardTestCapture} from '../harness/hierarchy-public-capture.js';
import {ADDITIONAL_CHILD_TEST_PROBES} from '../harness/hierarchy-child-additional-test-corpus.js';
import {readFileSync} from 'node:fs';
import {PUBLIC_HIERARCHY_PROBES as probes} from '../harness/hierarchy-public-probes.js';
import {RECIPE_CAL_PROBES,RECIPE_TEST_PROBES} from '../harness/hierarchy-recipe-corpus.js';
import {GTA_TRAIN_PROBES,GTA_CAL_PROBES,GTA_TEST_PROBES} from '../harness/hierarchy-gta-corpus.js';
import {PublicFetchError} from '../src/crawler/public-fetch.js';
import {createAutomaticTopicDevelopmentCapture,createAutomaticTopicAdditionalDevelopmentCapture,createAutomaticTopicMetadataDevelopmentCapture,createAutomaticTopicComparisonDevelopmentCapture} from '../harness/hierarchy-public-capture.js';
import {AUTOMATIC_TOPIC_DEVELOPMENT,AUTOMATIC_TOPIC_ADDITIONAL_DEVELOPMENT,AUTOMATIC_TOPIC_METADATA_DEVELOPMENT} from '../harness/automatic-topic-development-corpus.js';
import {AUTOMATIC_TOPIC_COMPARISON_DEVELOPMENT} from '../harness/automatic-topic-comparison-corpus.js';
import {createGeneralWebSubjectScreenCapture,createGeneralWebSubjectRepairCapture} from '../harness/hierarchy-public-capture.js';
import {GENERAL_WEB_SUBJECT_PROBES,GENERAL_WEB_CAPTURE_REPAIR_PROBES} from '../harness/general-web-subject-corpus.js';

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
const diversityPlan=JSON.parse(readFileSync(new URL('../harness/hierarchy-child-diversity-corpus.json',import.meta.url),'utf8'));

test('general-web screen admits only its12 public non-Wikipedia pages under unchanged34-request caps',async()=>{
 const f=fixture(),capture=createGeneralWebSubjectScreenCapture(f.options);
 for(const p of [...AUTOMATIC_TOPIC_DEVELOPMENT,...AUTOMATIC_TOPIC_COMPARISON_DEVELOPMENT,...childPlan.freshCandidates,...probes])await assert.rejects(capture.capture(p.id));
 assert.equal(f.calls.length,0);assert.equal(GENERAL_WEB_SUBJECT_PROBES.length,12);
 for(const p of GENERAL_WEB_SUBJECT_PROBES){assert(!p.url.includes('wikipedia.org'));const r=await capture.capture(p.id);assert.equal(r.status,'available');assert.equal(r.url,p.url);}
 assert.equal(f.calls.length,26);assert.equal(capture.snapshot().maxRequests,34);assert.equal(capture.snapshot().minimumOriginDelayMs,5000);
 assert.deepEqual(f.calls.filter(c=>c.resourceKind==='page').map(c=>c.url),GENERAL_WEB_SUBJECT_PROBES.map(p=>p.url));
 const calls=f.calls.length;assert.equal((await capture.capture(GENERAL_WEB_SUBJECT_PROBES[0].id)).reason,'already-attempted');assert.equal(f.calls.length,calls);
});

test('a slightly early timer waits the remaining interval without failing or dispatching HTTP early',async()=>{
 const f=fixture();let waits=0;
 const capture=createHierarchyPublicCapture({...f.options,sleep:async ms=>{waits++;f.advance(Math.max(0,ms-1));}});
 const row=await capture.capture(probes[0].id);assert.equal(row.status,'available');assert.equal(f.calls.length,3);
 for(let i=1;i<f.calls.length;i++)assert(f.calls[i].time-f.calls[i-1].time>=5000);
 assert(waits<=6,'clock retries must stay finite and inside the original request deadline');
});

test('a nonadvancing injected timer still fails after three waits without dispatching another request',async()=>{
 const f=fixture();let waits=0;const capture=createHierarchyPublicCapture({...f.options,sleep:async()=>{waits++;}});
 const row=await capture.capture(probes[0].id);assert.equal(row.status,'unavailable');assert.equal(waits,3);assert.equal(f.calls.length,1);
});

test('general extraction repair admits only six internal failures, never the policy-failed Steam publisher',async()=>{
 const f=fixture(),capture=createGeneralWebSubjectRepairCapture(f.options);
 for(const p of GENERAL_WEB_SUBJECT_PROBES)await assert.rejects(capture.capture(p.id));assert.equal(f.calls.length,0);
 for(const p of GENERAL_WEB_CAPTURE_REPAIR_PROBES){assert(!p.url.includes('steamdeck.com'));assert.equal((await capture.capture(p.id)).status,'available');}
 assert.equal(f.calls.length,10);assert.equal(capture.snapshot().maxRequests,10);assert.equal(GENERAL_WEB_CAPTURE_REPAIR_PROBES.length,6);
});

test('comparison DEV captures exactly12 declared hard cases and cannot fetch previous DEV or hierarchy TEST',async()=>{
 const f=fixture(),capture=createAutomaticTopicComparisonDevelopmentCapture(f.options);
 for(const p of [...AUTOMATIC_TOPIC_DEVELOPMENT,...AUTOMATIC_TOPIC_ADDITIONAL_DEVELOPMENT,...AUTOMATIC_TOPIC_METADATA_DEVELOPMENT,...childPlan.freshCandidates,...diversityPlan.test])await assert.rejects(capture.capture(p.id));
 assert.equal(f.calls.length,0);
 for(const p of AUTOMATIC_TOPIC_COMPARISON_DEVELOPMENT){const r=await capture.capture(p.id);assert.equal(r.status,'available');assert.equal(r.url,p.url);}
 assert.equal(f.calls.length,28);assert.equal(capture.snapshot().maxRequests,28);
 assert.deepEqual(f.calls.filter(c=>c.resourceKind==='page').map(c=>c.url),AUTOMATIC_TOPIC_COMPARISON_DEVELOPMENT.map(p=>p.url));
});

test('metadata DEV observes only the four usable literal pages, without retrying original denied publishers',async()=>{
 const f=fixture(),capture=createAutomaticTopicMetadataDevelopmentCapture(f.options);
 for(const p of [...AUTOMATIC_TOPIC_DEVELOPMENT,...AUTOMATIC_TOPIC_ADDITIONAL_DEVELOPMENT,...childPlan.freshCandidates,...diversityPlan.test])await assert.rejects(capture.capture(p.id));
 assert.equal(f.calls.length,0);
 for(const p of AUTOMATIC_TOPIC_METADATA_DEVELOPMENT){const r=await capture.capture(p.id);assert.equal(r.status,'available');assert.equal(r.url,p.url);}
 assert.equal(f.calls.length,12);assert.equal(capture.snapshot().maxRequests,12);
 assert.deepEqual(f.calls.filter(c=>c.resourceKind==='page').map(c=>c.url),AUTOMATIC_TOPIC_METADATA_DEVELOPMENT.map(p=>p.url));
});

test('additional automatic DEV preserves original six failures and uses only four new primary publishers',async()=>{
 const f=fixture(),capture=createAutomaticTopicAdditionalDevelopmentCapture(f.options);
 for(const p of [...AUTOMATIC_TOPIC_DEVELOPMENT,...childPlan.freshCandidates,...diversityPlan.test])await assert.rejects(capture.capture(p.id));
 assert.equal(f.calls.length,0);
 for(const p of AUTOMATIC_TOPIC_ADDITIONAL_DEVELOPMENT){const r=await capture.capture(p.id);assert.equal(r.status,'available');assert.equal(r.url,p.url);}
 assert.equal(f.calls.length,12);assert.equal(capture.snapshot().maxRequests,12);
 assert.deepEqual(f.calls.filter(c=>c.resourceKind==='page').map(c=>c.url),AUTOMATIC_TOPIC_ADDITIONAL_DEVELOPMENT.map(p=>p.url));
});

test('automatic event DEV collector has six fixed primary pages and cannot consume old hierarchy TRAIN/CAL/TEST',async()=>{
 const f=fixture(),capture=createAutomaticTopicDevelopmentCapture(f.options);
 for(const p of [...childPlan.freshCandidates,...diversityPlan.development,...diversityPlan.test,...probes])await assert.rejects(capture.capture(p.id));
 assert.equal(f.calls.length,0);
 for(const p of AUTOMATIC_TOPIC_DEVELOPMENT){const r=await capture.capture(p.id);assert.equal(r.status,'available');assert.equal(r.url,p.url);assert.equal(p.split,'development');}
 assert.equal(f.calls.length,16);assert.equal(capture.snapshot().maxRequests,16);
 assert.deepEqual(f.calls.filter(c=>c.resourceKind==='page').map(c=>c.url),AUTOMATIC_TOPIC_DEVELOPMENT.map(p=>p.url));
});

test('additional board TEST is a separate two-document frozen collector with no TRAIN/CAL or original TEST retry',async()=>{
 const f=fixture(),capture=createHierarchyChildAdditionalBoardTestCapture(f.options);
 for(const p of [...childPlan.freshCandidates,...diversityPlan.development,...diversityPlan.test,{id:'koala-supplement-train-01'},{id:'koala-additional-train-02'}])await assert.rejects(capture.capture(p.id));
 for(const p of ADDITIONAL_CHILD_TEST_PROBES){const r=await capture.capture(p.id);assert.equal(r.status,'available');assert.equal(r.url,p.url);assert.equal(p.split,'test');assert.equal(p.labels['video-games'],false);}
 assert.equal(f.calls.length,4);assert.equal(capture.snapshot().maxRequests,4);
});

test('separate Koala TRAIN supplement cannot fetch any old/new CAL or TEST or replace a failed TRAIN ID',async()=>{
 const f=fixture(),capture=createHierarchyKoalaTrainingSupplementCapture(f.options);
 for(const p of [...childPlan.freshCandidates,...diversityPlan.development,...diversityPlan.test])await assert.rejects(capture.capture(p.id));
 const row=await capture.capture('koala-supplement-train-01');assert.equal(row.status,'available');assert.equal(row.url,'https://www.wildlife.vic.gov.au/our-wildlife/koalas');
 assert.equal(f.calls.length,3);assert.equal(capture.snapshot().maxRequests,3);assert.equal((await capture.capture(row.id)).reason,'already-attempted');
});
test('additional Koala TRAIN permits two exact documents and refuses the account-path candidate without network',async()=>{
 const f=fixture(),capture=createHierarchyKoalaAdditionalTrainingCapture(f.options);
 for(const p of [...childPlan.freshCandidates,...diversityPlan.development,...diversityPlan.test,{id:'koala-supplement-train-01'},{id:'koala-additional-train-01'}])await assert.rejects(capture.capture(p.id));
 const urls=['https://www.zoo-leipzig.de/tier/koala/','https://australiazoo.com.au/wildlife/our-animals/koalas/'];
 for(let i=0;i<2;i++){const r=await capture.capture('koala-additional-train-0'+(i+2));assert.equal(r.status,'available');assert.equal(r.url,urls[i]);}
 assert.equal(f.calls.length,6);assert.equal(capture.snapshot().maxRequests,6);
});

test('diversity collectors enforce the frozen development/TEST boundary and exact publisher policies',async()=>{
 for(const phase of ['development','test']){
  const f=fixture(),capture=createHierarchyChildDiversityCapture(phase,f.options),probes=diversityPlan[phase];
  for(const p of diversityPlan[phase==='test'?'development':'test'])await assert.rejects(capture.capture(p.id));
  for(const p of childPlan.freshCandidates)await assert.rejects(capture.capture(p.id));
  for(const p of probes){const r=await capture.capture(p.id);assert.equal(r.status,'available');assert.equal(r.url,p.url);}
  const origins=new Set(probes.map(p=>new URL(p.url).origin));assert.equal(f.calls.length,probes.length+2*origins.size);assert.ok(f.calls.length<=34);
  assert.deepEqual(f.calls.filter(c=>c.resourceKind==='page').map(c=>c.url),probes.map(p=>p.url));
 }
 assert.throws(()=>createHierarchyChildDiversityCapture('arbitrary'));
 const all=[...diversityPlan.development,...diversityPlan.test];assert.equal(new Set(all.map(p=>p.id)).size,18);assert.equal(new Set(all.map(p=>p.url)).size,18);assert.equal(new Set(all.map(p=>p.groupId)).size,18);
 const roles=new Map();for(const p of all){const role=p.split==='test'?'test':p.split==='calibration'?'calibration':'training';assert.ok(!roles.has(p.publisher)||roles.get(p.publisher)===role);roles.set(p.publisher,role);}
});

test('held-out collector contains exactly the declared fourteen TEST pages and never TRAIN or CAL',async()=>{
 const f=fixture(),capture=createHierarchyChildEvaluationCapture(f.options),heldout=childPlan.freshCandidates.filter(r=>r.split==='test');
 for(const row of childRows)await assert.rejects(capture.capture(row.id));
 for(const row of heldout){const result=await capture.capture(row.id);assert.equal(result.status,'available');assert.equal(result.url,row.url);}
 assert.equal(heldout.length,14);assert.equal(f.calls.filter(c=>c.resourceKind==='page').length,14);assert.equal(f.calls.length,30);
 assert.deepEqual(f.calls.filter(c=>c.resourceKind==='page').map(c=>c.url),heldout.map(r=>r.url));
 assert.equal((await capture.capture(heldout[0].id)).reason,'already-attempted');
 assert.ok(f.buffers.every(b=>b.every(n=>n===0)));
});

test('parser repair collection stays on six declared CAL pages, with one policy and eight requests',async()=>{
 const f=fixture(),capture=createHierarchyChildCalibrationRepairCapture(f.options);
 for(const id of ['child-train-01','child-test-01','child-cal-05','child-cal-06','child-cal-07'])await assert.rejects(capture.capture(id));
 for(const suffix of ['01','02','03','04','08','09']){
  const id='child-cal-'+suffix,row=await capture.capture(id);
  assert.equal(row.status,'available');assert.equal(row.url,childRows.find(p=>p.id===id).url);
 }
 assert.equal(f.calls.length,8);assert.equal(capture.snapshot().maxRequests,8);
 assert.ok(f.calls.every(c=>new URL(c.url).origin==='https://www.qld.gov.au'));
 assert.ok(f.buffers.every(buffer=>buffer.every(n=>n===0)));
 assert.equal((await capture.capture('child-cal-01')).reason,'already-attempted');
 for(let i=1;i<f.calls.length;i++)assert.ok(f.calls[i].time-f.calls[i-1].time>=5000);
});

test('closed diagnosis reuses two independent policies and emits only bounded parser counters under six requests',async()=>{
 const f=fixture(),capture=createHierarchyChildDiagnosisCapture(f.options),rows=[];
 for(const id of ['child-train-01','child-cal-01'])rows.push(await capture.capture(id));
 assert.equal(f.calls.length,6);assert.equal(f.calls.filter(call=>call.resourceKind==='page').length,2);
 for(let i=1;i<f.calls.length;i++)assert.ok(f.calls[i].time-f.calls[i-1].time>=5000);
 assert.equal(capture.snapshot().maxRequests,6);assert.equal(capture.snapshot().deadline,240000);
 for(const row of rows){assert.deepEqual(Object.keys(row),['id','status','reason','parserDiagnostic']);assert.equal(row.status,'diagnosed');assert.equal(row.reason,'eligible');
  assert.equal(row.parserDiagnostic.status,'eligible');assert.ok(Object.isFrozen(row)&&Object.isFrozen(row.parserDiagnostic.summary));
  for(const value of ['Fresh public title','public article','https://','contentHash','headers','extractorVersion'])assert.equal(JSON.stringify(row).includes(value),false);}
 assert.ok(f.buffers.every(buffer=>buffer.every(n=>n===0)));
 assert.deepEqual(await capture.capture('child-train-01'),{id:'child-train-01',status:'unavailable',reason:'already-attempted',parserDiagnostic:null});
 for(const id of ['child-train-02','child-cal-02','child-test-01',probes[0].id,'https://www.qld.gov.au/foreign'])await assert.rejects(capture.capture(id));
 await assert.rejects(capture.capture('child-cal-01',{}));assert.equal(f.calls.length,6);
});
test('diagnosis distinguishes insufficient extraction from finite parser refusal without releasing either document',async()=>{
 const f=fixture({page:url=>new URL(url).origin==='https://savethekoala.com'?html('','short'):'<article title="missing>'}),capture=createHierarchyChildDiagnosisCapture(f.options);
 const short=await capture.capture('child-train-01');assert.equal(short.reason,'insufficient-text');assert.equal(short.parserDiagnostic.status,'insufficient-text');
 const invalid=await capture.capture('child-cal-01');assert.equal(invalid.reason,'document-invalid');assert.equal(invalid.parserDiagnostic.failure,'unterminated-tag');
 assert.equal(JSON.stringify([short,invalid]).includes('missing'),false);assert.equal(f.calls.length,6);
});
test('diagnosis preserves policy precedence and exposes no parser diagnostics when rights are denied',async()=>{
 const denied=fixture({robots:'User-agent: *\nDisallow: /about-koalas/'}),robots=createHierarchyChildDiagnosisCapture(denied.options);
 assert.equal((await robots.capture('child-train-01')).reason,'robots-denied');assert.equal(denied.calls.some(call=>call.resourceKind==='page'),false);
 for(const [head,headers,reason]of [['',{xRobotsTag:['noai']},'header-restricted'],['',{tdmReservation:'1'},'tdm-reserved'],
  ['<meta name="robots" content="noindex">',{},'document-restricted'],['<meta name="tdm-reservation" content="bad">',{},'tdm-ambiguous']]){
  const f=fixture({onRequest(url,options,content){if(options.resourceKind==='robots')return content(url,'','robots');if(options.resourceKind==='tdmrep')throw new PublicFetchError('http-status',{status:404});
   return content(url,reason==='header-restricted'?'<unclosed title="':html(head),'page',headers);}}),capture=createHierarchyChildDiagnosisCapture(f.options);
  const row=await capture.capture('child-train-01');assert.equal(row.reason,reason);assert.equal(row.status,'unavailable');assert.equal(row.parserDiagnostic,null);
 }
});
test('diagnosis keeps redirect refusal and sticky policy failures while ignoring unknown exception hooks',async()=>{
 const f=fixture({onRequest(){throw false;}}),capture=createHierarchyChildDiagnosisCapture(f.options);
 assert.equal((await capture.capture('child-train-01')).reason,'policy-unavailable');assert.equal((await capture.capture('child-train-01')).reason,'already-attempted');assert.equal(f.calls.length,1);
 let hooks=0;const unknown=new Proxy({}, {get(){hooks++;throw Error('secret');},getPrototypeOf(){hooks++;throw Error('secret');}});
 const g=fixture({onRequest(url,options,content){if(options.resourceKind==='robots')return content(url,'','robots');if(options.resourceKind==='tdmrep')throw new PublicFetchError('http-status',{status:404});throw unknown;}});
 assert.equal((await createHierarchyChildDiagnosisCapture(g.options).capture('child-train-01')).reason,'page-unavailable');assert.equal(hooks,0);
 const h=fixture({page:url=>({kind:'redirect',url,redirectUrl:'https://foreign.example/'})});
 assert.equal((await createHierarchyChildDiagnosisCapture(h.options).capture('child-train-01')).reason,'redirect-refused');
});
test('a deadline after parsing stays an unavailable deadline rather than mislabelling a diagnostic result',async()=>{
 let pageReturned=false,checks=0;const f=fixture({page:()=>{pageReturned=true;return html();}}),clock=f.options.clock;
 f.options.clock=()=>pageReturned&&++checks>=2?240000:clock();
 const row=await createHierarchyChildDiagnosisCapture(f.options).capture('child-train-01');
 assert.deepEqual(row,{id:'child-train-01',status:'unavailable',reason:'deadline',parserDiagnostic:null});
});
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
