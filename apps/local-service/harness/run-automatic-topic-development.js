// Fixed six-page DEV collection and offline E5/grouping diagnostic. Import inert.
// No database, browser profile, provider, ingestion or registry activation.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {benchmarkNeed as need,benchmarkSha as sha,readBenchmarkJson as json,benchmarkSourcePins as pins,
 checkBenchmarkPins as endPins,createBenchmarkOutput as directory,saveBenchmarkJson as save} from './hierarchy-benchmark-files.js';
import {AUTOMATIC_TOPIC_DEVELOPMENT as PROBES,AUTOMATIC_TOPIC_DEVELOPMENT_PROTOCOL as PROTOCOL} from './automatic-topic-development-corpus.js';
import {createAutomaticTopicDevelopmentCapture} from './hierarchy-public-capture.js';
import {proposeAutomaticTopics} from '../experiments/automatic-topic-discovery-v1/proposals.js';
import {createPackagedCrawlerEmbedder} from '../src/crawler/packaged-e5.js';
import {compilePairedE5Input,applyPairedE5Input,describePairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';
import {loadInstalledHierarchyMatcher} from '../src/application/installed-hierarchy-matcher.js';
import {classifyRootedHierarchyMatcher} from '../src/domain/hierarchy-rooted-matcher.js';

const D='apps/local-service/data/',CAPTURE=D+'automatic-topic-development-capture-20261029',FEATURES=D+'automatic-topic-development-features-20261029';
const SOURCES=Object.freeze([
 'apps/local-service/harness/run-automatic-topic-development.js','apps/local-service/harness/automatic-topic-development-corpus.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/proposals.js','apps/local-service/experiments/automatic-topic-discovery-v1/proposals.test.js',
 'apps/local-service/harness/hierarchy-benchmark-files.js','apps/local-service/harness/hierarchy-public-capture.js',
 'apps/local-service/harness/hierarchy-public-probes.js','apps/local-service/harness/hierarchy-recipe-corpus.js','apps/local-service/harness/hierarchy-gta-corpus.js',
 'apps/local-service/harness/hierarchy-child-corpus.json','apps/local-service/harness/hierarchy-child-diversity-corpus.json','apps/local-service/harness/hierarchy-child-additional-test-corpus.js',
 'apps/local-service/src/crawler/public-fetch.js','apps/local-service/src/crawler/robots.js','apps/local-service/src/crawler/static-capture.js','apps/local-service/src/crawler/url-policy.js',
 'apps/local-service/src/crawler/packaged-e5.js','apps/local-service/src/domain/hierarchical-e5-paired-input.js',
 'apps/local-service/src/application/installed-hierarchy-matcher.js','apps/local-service/src/domain/hierarchy-rooted-matcher.js',
 'apps/local-service/src/domain/hierarchy-binary-detail.js','apps/local-service/src/domain/hierarchical-e5-paired-linear-heads.js',
 'apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js',
 'spikes/topic-resolution/browser/core/page-content-policy.js','spikes/topic-resolution/browser/embedding/embedding-contract.js',
 'spikes/topic-resolution/browser/embedding/.assets/manifest.json',
 ...['root-model.json','root-policy.json','input-definition.json','gta-detail.json','animals-detail.json','koalas-detail.json'].map(f=>'apps/local-service/assets/hierarchy/'+f),
]);
const POLICY=Object.freeze({minimumSimilarity:.9,minimumMargin:.01,minimumDistinctInputs:2,minimumPublishers:2,maximumObservedSpanMs:604800000,maximumPublishedSpanMs:86400000});
const flags={liveChanged:false,assignmentAuthority:false,productionValidated:false,independentValidation:false,representativePopulation:false,statisticalIndependenceClaim:false,developmentOnly:true};
let captureUsed=false,encodeUsed=false;
export async function checkAutomaticTopicDevelopmentSource(){return {sourcePins:await pins(SOURCES),probes:PROBES,protocol:PROTOCOL,proposalPolicy:POLICY,networkUsed:false,encoderOpened:false,...flags};}
export async function captureAutomaticTopicDevelopment(){
 need(!captureUsed);captureUsed=true;const sources=await pins(SOURCES),rows=[],casePins=[],started=performance.now();let capture=null,endPinsChecked=false,failure=null;
 await directory(CAPTURE);await save(CAPTURE,'inputs.json',{sourcePins:sources,probes:PROBES,protocol:PROTOCOL,proposalPolicy:POLICY,...flags});
 try{
  capture=createAutomaticTopicDevelopmentCapture();for(const p of PROBES){const r=await capture.capture(p.id);need(r.id===p.id&&r.url===p.url);let row;
   if(r.status==='unavailable'){need(/^[a-z-]{1,48}$/u.test(r.reason));row={...p,status:'unavailable',reason:r.reason};}
   else{need(r.status==='available'&&r.text.length>=160&&r.text.length<=4096&&r.title.length<=200&&r.assignmentAuthority===false);
    row={...p,status:'available',title:r.title,text:r.text,extractorVersion:r.extractorVersion,observedAt:Date.now(),publishedAt:null};
    for(const k of ['responseSha256','htmlTextSha256','titleSha256','bodySha256','rightsEvidenceHash','sourceInputHash']){need(/^[a-f0-9]{64}$/u.test(r[k]));row[k]=r[k];}
    need(sha(row.text)===row.bodySha256&&sha(row.title)===row.titleSha256);
   }rows.push(row);casePins.push(await save(CAPTURE,p.id+'.json',row));
  }
 }catch{failure={stage:'capture-or-persistence',completed:rows.length};}
 try{await endPins([],SOURCES,sources);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'automatic-topic-development-capture/v1',status:failure?'failed':'completed',failure,rows,casePins,
  counts:{declared:6,available:rows.filter(r=>r.status==='available').length,unavailable:rows.filter(r=>r.status==='unavailable').length,notCompleted:6-rows.length},
  sourcePins:sources,endPinsChecked,capture:capture?.snapshot()??null,encoderUsed:false,elapsedMs:performance.now()-started,...flags};
 return {status:result.status,counts:result.counts,result:await save(CAPTURE,'result.json',result)};
}
export async function encodeAutomaticTopicDevelopment(expectedCaptureSha256){
 need(!encodeUsed&&typeof expectedCaptureSha256==='string'&&/^[a-f0-9]{64}$/u.test(expectedCaptureSha256));encodeUsed=true;
 const ledger=[],capture=await json(CAPTURE+'/result.json',{sha256:expectedCaptureSha256},ledger);
 need(capture.schema==='automatic-topic-development-capture/v1'&&capture.status==='completed'&&capture.endPinsChecked&&capture.rows.length===6&&capture.developmentOnly);
 for(let i=0;i<6;i++)need(capture.rows[i].id===PROBES[i].id&&capture.rows[i].url===PROBES[i].url&&capture.rows[i].eventId===PROBES[i].eventId);
 const sources=await pins(SOURCES),definition=await json('apps/local-service/assets/hierarchy/input-definition.json',null,ledger),fusion=compilePairedE5Input(definition),installed=await loadInstalledHierarchyMatcher();
 need(capture.rows.filter(r=>r.status==='available').length>=2);await directory(FEATURES);
 await save(FEATURES,'inputs.json',{captureSha256:expectedCaptureSha256,sourcePins:sources,inputPins:ledger,probes:PROBES,proposalPolicy:POLICY,protocol:PROTOCOL,...flags});
 const started=performance.now(),rows=[],features=[],casePins=[];let encoder=null,encoderClosed=false,endPinsChecked=false,failure=null,subject=null,event=null,metrics=null;
 try{
  encoder=await createPackagedCrawlerEmbedder({expectedManifestSha256:'5766e675660a8fbe74842a69b670a84ce5f9eb457b77032337e4a69d6180b984'});
  for(const r of capture.rows){
   if(r.status==='unavailable'){rows.push({id:r.id,status:r.status,reason:r.reason});continue;}
   need(sha(r.text)===r.bodySha256&&sha(r.title)===r.titleSha256&&r.publishedAt===null);
   const body=await encoder.embed(r.text),title=await encoder.embed(r.title);need(body.modelId===title.modelId);
   const fused=applyPairedE5Input(fusion,{sourceId:r.id,sourceVersion:r.sourceInputHash,bodyVector:body.values,titleVector:title.values});
   const match=classifyRootedHierarchyMatcher(installed.matcher,{sourceId:r.id,sourceVersion:r.sourceInputHash,bodyVector:body.values,titleVector:title.values});
   features.push({sourceId:r.id,inputHash:r.sourceInputHash,url:r.url,title:r.title,publisherKey:r.publisherKey,observedAt:r.observedAt,publishedAt:null,vector:fused.vector});
   const feature={id:r.id,status:'encoded',sourceInputHash:r.sourceInputHash,bodyVector:body.values,titleVector:title.values,fusedVector:fused.vector,rootPath:match.rootPath,supportedPath:match.semanticPath};
   rows.push({id:r.id,status:'encoded',rootPath:match.rootPath});casePins.push(await save(FEATURES,r.id+'.json',feature));
  }
  // This known-parent diagnostic does not assert that all real broad routes
  // agree; their actual paths above remain visible for full-pipeline analysis.
  const args={representationHash:describePairedE5Input(fusion).representationHash,parentId:'development-cohort',policy:POLICY,observations:features};
  subject=proposeAutomaticTopics({...args,kind:'subject'});event=proposeAutomaticTopics({...args,kind:'event'});
  const group=new Map(subject.proposals.flatMap((p,i)=>p.members.map(m=>[m.sourceId,{index:i,supported:p.status==='supported-proposal'}])));
  metrics={available:features.length,candidateTruePairs:0,candidateFalsePairs:0,missedTruePairs:0,supportedTruePairs:0,supportedFalsePairs:0};
  for(let i=0;i<features.length;i++)for(let j=0;j<i;j++){
   const x=features[i].sourceId,y=features[j].sourceId,sameGold=PROBES.find(p=>p.id===x).eventId===PROBES.find(p=>p.id===y).eventId,sameGroup=group.get(x).index===group.get(y).index;
   if(sameGroup){metrics[sameGold?'candidateTruePairs':'candidateFalsePairs']++;if(group.get(x).supported)metrics[sameGold?'supportedTruePairs':'supportedFalsePairs']++;}else if(sameGold)metrics.missedTruePairs++;
  }
 }catch{failure={stage:'encode-or-proposals',completed:features.length};}
 finally{if(encoder)try{await encoder.close();encoderClosed=true;}catch{failure??={stage:'encoder-close'};}}
 try{await endPins(ledger,SOURCES,sources);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'automatic-topic-development-diagnostic/v1',status:failure?'failed':'completed',failure,captureSha256:expectedCaptureSha256,
  rows,casePins,subject,event,metrics,sourcePins:sources,inputPins:ledger,encoderClosed,endPinsChecked,elapsedMs:performance.now()-started,
  knownParentDiagnosticOnly:true,goldEventDatesUsedAsInputs:false,publicationMetadataMissing:true,notFreshFinalValidation:true,...flags};
 return {status:result.status,metrics,encoderClosed,endPinsChecked,result:await save(FEATURES,'result.json',result)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2);try{let r;if(a.length===1&&a[0]==='--source-check')r=await checkAutomaticTopicDevelopmentSource();
  else if(a.length===1&&a[0]==='--capture-development')r=await captureAutomaticTopicDevelopment();
  else if(a.length===2&&a[0]==='--encode-development')r=await encodeAutomaticTopicDevelopment(a[1]);else need(false);
  process.stdout.write(JSON.stringify(r)+'\n');if(r.status==='failed')process.exitCode=1;
 }catch{process.stderr.write('Automatic topic development refused; no live state changed.\n');process.exitCode=1;}
}
