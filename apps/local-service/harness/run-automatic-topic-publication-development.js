// Closed same-response metadata and hard-case DEV. Inert imports, explicit actual.
// Policy-checked Node HTTP only; owned Chrome parses supplied HTML offline.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {benchmarkNeed as need,benchmarkSha as sha,readBenchmarkJson as json,benchmarkSourcePins as pins,
 checkBenchmarkPins as endPins,createBenchmarkOutput as directory,saveBenchmarkJson as save} from './hierarchy-benchmark-files.js';
import {checkAutomaticTopicDevelopmentSource} from './run-automatic-topic-development.js';
import {AUTOMATIC_TOPIC_METADATA_DEVELOPMENT as PROBES} from './automatic-topic-development-corpus.js';
import {AUTOMATIC_TOPIC_COMPARISON_DEVELOPMENT,AUTOMATIC_TOPIC_COMPARISON_PROTOCOL} from './automatic-topic-comparison-corpus.js';
import {createAutomaticTopicMetadataDevelopmentCapture,createAutomaticTopicComparisonDevelopmentCapture} from './hierarchy-public-capture.js';
import {fetchPublicResource} from '../src/crawler/public-fetch.js';
import {openPublicationResponseDom} from './publication-response-dom.js';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),D='apps/local-service/data/';
const METADATA_OUTPUT=D+'automatic-topic-publication-development-capture-20261029';
const EXTRA_SOURCES=[
 'apps/local-service/harness/run-automatic-topic-publication-development.js',
 'apps/local-service/harness/publication-response-dom.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/publication-dom.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/publication-dom.test.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/publication-metadata.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/publication-metadata.test.js',
 'spikes/topic-resolution/harness/chromium-pipe.js',
];
const flags={developmentOnly:true,liveChanged:false,assignmentAuthority:false,nativeSourceAttestation:false,goldEventDatesUsedAsInputs:false};
let used=false;
export async function captureAutomaticTopicPublicationDevelopment(){
 need(arguments.length===0);return captureDevelopment(false);
}
export async function captureAutomaticTopicComparisonDevelopment(){
 need(arguments.length===0);return captureDevelopment(true);
}
async function captureDevelopment(comparison){
 need(!used);used=true;
 const probes=comparison?AUTOMATIC_TOPIC_COMPARISON_DEVELOPMENT:PROBES,
  OUTPUT=comparison?D+'automatic-topic-comparison-development-capture-20261029':METADATA_OUTPUT,
  factory=comparison?createAutomaticTopicComparisonDevelopmentCapture:createAutomaticTopicMetadataDevelopmentCapture;
 const ledger=[],first=await json(D+'automatic-topic-development-capture-20261029/result.json',{sha256:'b979b37197ba0cb231e04862e601ab174c09a9b1358139aa1afe499601297de0'},ledger),
  extra=await json(D+'automatic-topic-development-additional-capture-20261029/result.json',{sha256:'e3972b02513a973362d5ba92cc99ce7c5e83e0f5062d623c8d8a1e856cddd2f9'},ledger);
 need(first.status==='completed'&&extra.status==='completed'&&first.endPinsChecked&&extra.endPinsChecked);
 const old=[...first.rows,...extra.rows];if(!comparison)for(const p of probes)need(old.some(r=>r.id===p.priorObservationId&&r.url===p.url&&r.status==='available'));
 const base=await checkAutomaticTopicDevelopmentSource(),sources=[...base.sourcePins,...await pins(EXTRA_SOURCES)],files=sources.map(p=>p.file);
 need(new Set(files).size===files.length);await directory(OUTPUT);
 const started=performance.now(),rows=[],profiles=[];
 await save(OUTPUT,'inputs.json',{sourcePins:sources,inputPins:ledger,probes,comparisonProtocol:comparison?AUTOMATIC_TOPIC_COMPARISON_PROTOCOL:null,
  protocol:{maximumHttpRequests:comparison?28:12,maximumCaptureMs:240000,minimumRequestSpacingMs:5000,
   noDeniedPublisherRetry:true,maximumHtmlCharacters:524288,maximumHtmlUtf8Bytes:786432,
   browserResources:'deny-all except supplied current document; HTTP CSP disables page scripts',
   timing:'Publication claims only, no gold/visit time as publication date; day precision stays a day.'},...flags});
 let active=null,held=null,closed=null,failure=null,endPinsChecked=false,profileRemoved=false;
 async function retire(rec){
  if(rec.reader){rec.closed=await rec.reader.close();rec.reader=null;}
  const absolute=path.resolve(rec.profile),parent=path.resolve(ROOT,OUTPUT),s=await fs.lstat(absolute);
  need(rec.closed?.ownedExited&&path.dirname(absolute)===parent&&s.isDirectory()&&!s.isSymbolicLink()&&(await fs.realpath(absolute)).toLowerCase()===absolute.toLowerCase());
  await fs.rm(absolute,{recursive:true,maxRetries:5,retryDelay:100});rec.removed=true;
 }
 async function readMetadata(url,html){
  if(active?.reads===4){await retire(active);active=null;}
  if(!active){active={profile:path.join(ROOT,OUTPUT,'owned-browser-profile-'+profiles.length),reader:null,closed:null,reads:0,removed:false};profiles.push(active);active.reader=await openPublicationResponseDom(active.profile);}
  const result=await active.reader.read(url,html);active.reads++;return result;
 }
 const capture=factory({fetchPublic:async(url,options)=>{
  const response=await fetchPublicResource(url,options);
  if(options.resourceKind==='page'){
   need(held===null);held={url,text:typeof response.text==='string'&&response.text.length<=524288&&Buffer.byteLength(response.text,'utf8')<=786432?response.text:null};
  }return response;
 }});
 try{
  for(const p of probes){
   const r=await capture.capture(p.id),response=held;held=null;need(r.id===p.id&&r.url===p.url);
   let row;
   if(r.status==='unavailable')row={id:p.id,priorObservationId:p.priorObservationId,url:p.url,status:'unavailable',reason:r.reason,publication:null};
   else{
    need(r.status==='available'&&r.assignmentAuthority===false&&sha(r.text)===r.bodySha256&&sha(r.title)===r.titleSha256);
    const prior=old.find(x=>x.id===p.priorObservationId);
    row={id:p.id,priorObservationId:p.priorObservationId,url:p.url,status:'available',title:r.title,observedAt:Date.now(),
     sourceInputHash:r.sourceInputHash,responseSha256:r.responseSha256,htmlTextSha256:r.htmlTextSha256,rightsEvidenceHash:r.rightsEvidenceHash,
     titleSha256:r.titleSha256,bodySha256:r.bodySha256,extractorVersion:r.extractorVersion,
     priorEmbeddingMaterialUnchanged:prior?prior.bodySha256===r.bodySha256&&prior.titleSha256===r.titleSha256:null,
     publication:null,metadataCaptureStatus:'unavailable',metadataCaptureReason:'html-bound'};
    if(comparison){row.text=r.text;row.publisherKey=p.publisherKey;}
    need(response?.url===p.url);
    if(response.text!==null){
     need(sha(response.text)===r.htmlTextSha256);
     const metadata=await readMetadata(p.url,response.text);
     row.publication=metadata.metadata;row.metadataCaptureStatus=metadata.captureStatus;row.metadataCaptureReason=metadata.captureReason;row.metadataElapsedMs=metadata.elapsedMs;
    }
   }
   rows.push(row);await save(OUTPUT,p.id+'.json',row);
  }
 }catch{failure={stage:'capture-or-dom-or-persistence',completed:rows.length};}
 finally{
  held=null;for(const rec of profiles)if(!rec.removed)try{await retire(rec);}catch{failure??={stage:'browser-close-or-profile-cleanup'};}
  closed={ownedExited:profiles.every(p=>p.closed?.ownedExited===true),browsers:profiles.length,
   reads:profiles.reduce((n,p)=>n+(p.closed?.reads??0),0),fulfilled:profiles.reduce((n,p)=>n+(p.closed?.fulfilled??0),0),
   blocked:profiles.reduce((n,p)=>n+(p.closed?.blocked??0),0),networkFailure:profiles.some(p=>p.closed?.networkFailure!==false),continuedExternalRequests:0};
  profileRemoved=profiles.every(p=>p.removed);
 }
 try{await endPins(ledger,files,sources);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 if(!closed?.ownedExited||closed.networkFailure||!profileRemoved)failure??={stage:'browser-final-state'};
 const result={schema:comparison?'automatic-topic-comparison-development-capture/v1':'automatic-topic-publication-development-capture/v1',status:failure?'failed':'completed',failure,rows,
  counts:{declared:probes.length,available:rows.filter(r=>r.status==='available').length,unavailable:rows.filter(r=>r.status==='unavailable').length,
   knownPublication:rows.filter(r=>r.publication?.status==='known').length,notCompleted:probes.length-rows.length},
  capture:capture.snapshot(),browser:closed,profileRemoved,endPinsChecked,sourcePins:sources,inputPins:ledger,elapsedMs:performance.now()-started,
  scope:'Normalized publication claims from the same policy-checked HTTP response parsed in an offline native DOM. Publisher claims, not verified event time, user browsing or live Source ingestion.',...flags};
 return {status:result.status,counts:result.counts,browser:closed,profileRemoved,endPinsChecked,result:await save(OUTPUT,'result.json',result)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||!['--capture-development','--capture-comparison-development'].includes(process.argv[2])){process.stderr.write('Explicit closed DEV capture required; no action.\n');process.exitCode=2;}
 else try{const r=await (process.argv[2]==='--capture-development'?captureAutomaticTopicPublicationDevelopment():captureAutomaticTopicComparisonDevelopment());process.stdout.write(JSON.stringify(r)+'\n');if(r.status!=='completed')process.exitCode=1;}
 catch{process.stderr.write('Publication development refused.\n');process.exitCode=1;}
}
