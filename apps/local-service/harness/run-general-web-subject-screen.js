// Closed12-page general-web screen. Capture and local E5 are separate explicit
// phases. Nothing is ingested, registered, published or sent to an LLM.
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {benchmarkNeed as need,benchmarkSha as sha,readBenchmarkJson as json,benchmarkSourcePins as pins,
 checkBenchmarkPins as endPins,createBenchmarkOutput as directory,saveBenchmarkJson as save} from './hierarchy-benchmark-files.js';
import {GENERAL_WEB_SUBJECT_PROBES as PROBES,GENERAL_WEB_SUBJECT_PROTOCOL as PROTOCOL} from './general-web-subject-corpus.js';
import {createGeneralWebSubjectScreenCapture} from './hierarchy-public-capture.js';
import {checkAutomaticTopicDevelopmentSource} from './run-automatic-topic-development.js';
import {createPackagedCrawlerEmbedder} from '../src/crawler/packaged-e5.js';
import {compilePairedE5Input,applyPairedE5Input,describePairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';
import {loadInstalledHierarchyMatcher} from '../src/application/installed-hierarchy-matcher.js';
import {classifyRootedHierarchyMatcher} from '../src/domain/hierarchy-rooted-matcher.js';
import {proposeFocusedSubjects} from '../experiments/automatic-topic-discovery-v1/focus-subjects.js';
const D='apps/local-service/data/',CAPTURE=D+'general-web-subject-screen-capture-20261029',FEATURES=D+'general-web-subject-screen-features-20261029';
const MORE=['apps/local-service/harness/run-general-web-subject-screen.js','apps/local-service/harness/general-web-subject-corpus.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/focus-subjects.js'];
const flags={liveChanged:false,assignmentAuthority:false,registryChanged:false,wikipediaRequired:false,providerUsed:false,
 independentReview:false,populationValidated:false,nativeSourceAttestation:false,eventIdentityAsserted:false};
let used=false;
async function checked(){const base=await checkAutomaticTopicDevelopmentSource(),sourcePins=[...base.sourcePins,...await pins(MORE)],files=sourcePins.map(p=>p.file);need(new Set(files).size===files.length);
 const ledger=[],policy=await json('apps/local-service/experiments/automatic-topic-discovery-v1/focus-policy.json',null,ledger);
 const algorithm=sourcePins.find(p=>p.file===policy.algorithm.file);need(algorithm.sha256===policy.algorithm.sha256&&algorithm.bytes===policy.algorithm.bytes);return {sourcePins,files,ledger,policy};}
export async function captureGeneralWebSubjectScreen(){
 need(arguments.length===0&&!used);used=true;const {sourcePins,files,ledger,policy}=await checked(),rows=[],casePins=[];let failure=null,endPinsChecked=false;
 await directory(CAPTURE);await save(CAPTURE,'inputs.json',{sourcePins,inputPins:ledger,probes:PROBES,protocol:PROTOCOL,policy,...flags});
 const capture=createGeneralWebSubjectScreenCapture(),started=performance.now();
 try{for(const p of PROBES){const r=await capture.capture(p.id);need(r.id===p.id&&r.url===p.url);let row;
  if(r.status==='unavailable')row={...p,status:'unavailable',reason:r.reason};
  else{need(r.status==='available'&&r.text.length>=160&&r.text.length<=4096&&sha(r.text)===r.bodySha256&&sha(r.title)===r.titleSha256);
   row={...p,status:'available',title:r.title,text:r.text,extractorVersion:r.extractorVersion,observedAt:new Date().toISOString()};
   for(const k of ['responseSha256','htmlTextSha256','titleSha256','bodySha256','rightsEvidenceHash','sourceInputHash'])row[k]=r[k];}
  rows.push(row);casePins.push(await save(CAPTURE,p.id+'.json',row));console.log(JSON.stringify({id:p.id,status:row.status,...(row.reason?{reason:row.reason}:{})}));
 }}catch{failure={stage:'capture-or-persistence',completed:rows.length};}
 try{await endPins(ledger,files,sourcePins);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'general-web-subject-screen-capture/v1',status:failure?'failed':'completed',failure,rows,casePins,
  counts:{declared:PROBES.length,available:rows.filter(r=>r.status==='available').length,unavailable:rows.filter(r=>r.status==='unavailable').length,notCompleted:PROBES.length-rows.length},
  protocol:PROTOCOL,sourcePins,inputPins:ledger,endPinsChecked,capture:capture.snapshot(),elapsedMs:performance.now()-started,...flags};
 return {status:result.status,counts:result.counts,endPinsChecked,result:await save(CAPTURE,'result.json',result)};
}
export async function encodeGeneralWebSubjectScreen(expectedHash){
 need(arguments.length===1&&!used&&typeof expectedHash==='string'&&/^[a-f0-9]{64}$/u.test(expectedHash));used=true;
 const {sourcePins,files,ledger,policy}=await checked(),capture=await json(CAPTURE+'/result.json',{sha256:expectedHash},ledger);
 need(capture.status==='completed'&&capture.endPinsChecked&&capture.rows.length===12);
 for(let i=0;i<12;i++)need(capture.rows[i].id===PROBES[i].id&&capture.rows[i].url===PROBES[i].url);
 const definition=await json('apps/local-service/assets/hierarchy/input-definition.json',null,ledger),fusion=compilePairedE5Input(definition),representation=describePairedE5Input(fusion),installed=await loadInstalledHierarchyMatcher();
 need(representation.representationHash===policy.representationHash&&installed.descriptor.matcherIdentityHash===policy.matcherHash);
 await directory(FEATURES);await save(FEATURES,'inputs.json',{captureHash:expectedHash,sourcePins,inputPins:ledger,protocol:PROTOCOL,policy,...flags});
 const started=performance.now(),observations=[],outcomes=[],casePins=[],classifications=[];let encoder=null,encoderClosed=false,failure=null,output=null,endPinsChecked=false;
 try{
  encoder=await createPackagedCrawlerEmbedder({expectedManifestSha256:'5766e675660a8fbe74842a69b670a84ce5f9eb457b77032337e4a69d6180b984'});
  for(const r of capture.rows){if(r.status==='unavailable'){outcomes.push({id:r.id,status:r.status,reason:r.reason});continue;}
   need(sha(r.text)===r.bodySha256&&sha(r.title)===r.titleSha256);const at=performance.now(),body=await encoder.embed(r.text),title=await encoder.embed(r.title);
   const paired=applyPairedE5Input(fusion,{sourceId:r.id,sourceVersion:r.sourceInputHash,bodyVector:body.values,titleVector:title.values}),match=classifyRootedHierarchyMatcher(installed.matcher,{sourceId:r.id,sourceVersion:r.sourceInputHash,bodyVector:body.values,titleVector:title.values});
   const feature={id:r.id,inputHash:r.sourceInputHash,bodyVector:body.values,titleVector:title.values,pairedVector:paired.vector,representationHash:representation.representationHash,encoderMs:performance.now()-at};
   casePins.push(await save(FEATURES,r.id+'.json',feature));outcomes.push({id:r.id,status:'encoded',encoderMs:feature.encoderMs});
   observations.push({sourceId:r.id,inputHash:r.sourceInputHash,materialHash:sha(JSON.stringify([r.bodySha256,r.titleSha256])),title:r.title,publisherKey:r.publisherKey,acceptedPath:match.semanticPath,vector:paired.vector});
   classifications.push({sourceId:r.id,title:r.title,acceptedPath:match.semanticPath,reason:match.reason});
  }
  output=proposeFocusedSubjects(JSON.stringify({representationHash:policy.representationHash,matcherHash:policy.matcherHash,minimumSimilarity:policy.parameters.minimumSimilarity,observations}));
 }catch{failure={stage:'encoding-or-frozen-policy',completed:observations.length};}
 finally{if(encoder)try{await encoder.close();encoderClosed=true;}catch{failure??={stage:'encoder-close'};}}
 const timings=[];if(output)for(let i=0;i<100;i++){const at=performance.now();proposeFocusedSubjects(JSON.stringify({representationHash:policy.representationHash,matcherHash:policy.matcherHash,minimumSimilarity:policy.parameters.minimumSimilarity,observations}));timings.push(performance.now()-at);}timings.sort((a,b)=>a-b);
 try{await endPins(ledger,files,sourcePins);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'general-web-subject-screen-features/v1',status:failure?'failed':'completed',failure,counts:{declared:12,encoded:observations.length,unavailable:capture.counts.unavailable},outcomes,classifications,output,casePins,
  timing:{repetitions:timings.length,p50Ms:timings[49]??null,p95Ms:timings[94]??null},sourcePins,inputPins:ledger,endPinsChecked,encoderClosed,elapsedMs:performance.now()-started,protocol:PROTOCOL,...flags};
 return {status:result.status,counts:result.counts,encoderClosed,endPinsChecked,names:output?.proposals.map(p=>({label:p.label,members:p.members.map(m=>m.sourceId),parent:p.parentProposalKey}))??[],timing:result.timing,result:await save(FEATURES,'result.json',result)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{let result;if(process.argv.length===3&&process.argv[2]==='--capture-general-subject-screen')result=await captureGeneralWebSubjectScreen();
  else if(process.argv.length===4&&process.argv[2]==='--encode-general-subject-screen')result=await encodeGeneralWebSubjectScreen(process.argv[3]);else throw Error('Explicit phase required');
  console.log(JSON.stringify(result));if(result.status!=='completed')process.exitCode=1;
 }catch{console.error('General-web subject screen refused; no live change');process.exitCode=1;}
}
