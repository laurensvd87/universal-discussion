// Fresh observations only for six previous INTERNAL extraction/timer failures.
// Rights failure publisher is excluded. Same-response old/fixed parser counters
// are diagnostic evidence, not adoption of an earlier response or live Source.
import {diagnoseStaticHtml} from '../src/crawler/static-capture.js';
import {fetchPublicResource} from '../src/crawler/public-fetch.js';
import {createGeneralWebSubjectRepairCapture} from './hierarchy-public-capture.js';
import {GENERAL_WEB_CAPTURE_REPAIR_PROBES as PROBES} from './general-web-subject-corpus.js';
import {checkAutomaticTopicDevelopmentSource} from './run-automatic-topic-development.js';
import {benchmarkNeed as need,benchmarkSha as sha,readBenchmarkJson as json,readBenchmarkBytes as bytes,
 benchmarkSourcePins as pins,checkBenchmarkPins as endPins,createBenchmarkOutput as directory,saveBenchmarkJson as save} from './hierarchy-benchmark-files.js';
const D='apps/local-service/data/',OUTPUT=D+'general-web-subject-repair-capture-20261029';
const BASELINE=D+'hierarchy-release-20261029-nature-heads/apps/local-service/src/crawler/static-capture.js';
if(process.argv.length!==3||process.argv[2]!=='--capture-internal-failure-repair')throw Error('Explicit internal-failure repair phase required');
const ledger=[],prior=await json(D+'general-web-subject-screen-capture-20261029/result.json',{sha256:'a464fc8d95c266e94d2ae50f6f3997e7f71e61311699b1d55ff35b39ef132d47'},ledger);
need(prior.status==='completed'&&prior.endPinsChecked&&prior.rows.length===12);
for(const p of PROBES)need(prior.rows.some(r=>r.id===p.priorObservationId&&r.url===p.url&&r.status==='unavailable'&&['document-invalid','pace-unavailable'].includes(r.reason)));
const oldPin=prior.sourcePins.find(p=>p.file==='apps/local-service/src/crawler/static-capture.js');need(oldPin);
await bytes(BASELINE,{bytes:oldPin.bytes,sha256:oldPin.sha256},ledger);
const {diagnoseStaticHtml:beforeParser}=await import(new URL('../data/hierarchy-release-20261029-nature-heads/apps/local-service/src/crawler/static-capture.js',import.meta.url));
const base=await checkAutomaticTopicDevelopmentSource(),sourcePins=[...base.sourcePins,...await pins([
 'apps/local-service/harness/run-general-web-capture-repair.js','apps/local-service/harness/general-web-subject-corpus.js'])],files=sourcePins.map(p=>p.file);
need(new Set(files).size===files.length);
await directory(OUTPUT);await save(OUTPUT,'inputs.json',{sourcePins,inputPins:ledger,probes:PROBES,
 protocol:{maximumRequests:10,maximumCaptureMs:240000,minimumRequestSpacingMs:5000,noPolicyPublisherRetry:true,
  sameResponseComparison:'Pinned old pure parser from the existing sealed release, and current fixed parser; no old runtime entrypoint or live service operation.'}});
let held=null,failure=null,endPinsChecked=false;const rows=[],casePins=[],started=performance.now();
const capture=createGeneralWebSubjectRepairCapture({fetchPublic:async(url,options)=>{
 const response=await fetchPublicResource(url,options);if(options.resourceKind==='page'){
  need(held===null);held=typeof response.text==='string'&&response.text.length<=2*1024*1024?{url,html:response.text}:null;
 }return response;
}});
try{for(const p of PROBES){const r=await capture.capture(p.id),current=held;held=null;let row;
 if(r.status==='unavailable')row={...p,status:'unavailable',reason:r.reason};
 else{need(r.status==='available'&&sha(r.text)===r.bodySha256&&sha(r.title)===r.titleSha256);row={...p,status:'available',title:r.title,text:r.text,extractorVersion:r.extractorVersion};
  for(const key of ['responseSha256','htmlTextSha256','titleSha256','bodySha256','rightsEvidenceHash','sourceInputHash'])row[key]=r[key];}
 // The ordinary collector has already evaluated origin/header/document policy.
 // Never run additional parsing on a refused rights/redirect/access response.
 if(current&&current.url===p.url&&(r.status==='available'||['document-invalid','insufficient-text'].includes(r.reason))){
  row.parserComparison={before:beforeParser(current.html,p.url),after:diagnoseStaticHtml(current.html,p.url),sameResponse:true};current.html=null;
 }
 rows.push(row);casePins.push(await save(OUTPUT,p.id+'.json',row));console.log(JSON.stringify({id:p.id,status:row.status,reason:row.reason??null,
  beforeFailure:row.parserComparison?.before.failure??null,afterFailure:row.parserComparison?.after.failure??null}));
}}catch{failure={stage:'repair-capture-or-persistence',completed:rows.length};}
finally{held=null;}
try{await endPins(ledger,files,sourcePins);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
const result={schema:'general-web-internal-capture-repair/v1',status:failure?'failed':'completed',failure,rows,casePins,
 counts:{declared:6,available:rows.filter(r=>r.status==='available').length,unavailable:rows.filter(r=>r.status==='unavailable').length,notCompleted:6-rows.length},
 sourcePins,inputPins:ledger,endPinsChecked,capture:capture.snapshot(),elapsedMs:performance.now()-started,
 originalTwelveOutcomesRetained:true,htmlPersisted:false,providerUsed:false,liveChanged:false,registryChanged:false,assignmentAuthority:false,nativeObservation:false,independentReview:false};
console.log(JSON.stringify({status:result.status,counts:result.counts,endPinsChecked,result:await save(OUTPUT,'result.json',result)}));if(result.status!=='completed')process.exitCode=1;
