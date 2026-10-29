// A separately declared TRAIN-only observation, not a replacement of the three
// preserved unavailable AKF/Zoo captures. Fit only Koalas; freeze other heads.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {benchmarkNeed as need,benchmarkSha as sha,readBenchmarkJson as json,benchmarkSourcePins as pins,
 checkBenchmarkPins as endPins,createBenchmarkOutput as directory,saveBenchmarkJson as save} from './hierarchy-benchmark-files.js';
import {createHierarchyKoalaTrainingSupplementCapture,createHierarchyKoalaAdditionalTrainingCapture} from './hierarchy-public-capture.js';
import {createPackagedCrawlerEmbedder} from '../src/crawler/packaged-e5.js';
import {normalizeCrawlUrl} from '../src/crawler/url-policy.js';
import {readFittedChildDiversityInputs,CHILD_DIVERSITY_SOURCE_FILES} from './run-hierarchy-child-diversity.js';
import {extendReviewedChildDevelopment} from './hierarchy-child-calibration-extension.js';
import {parentConditionedChildTrainingArguments} from './retained-hierarchy-child-inputs.js';
import {trainBinaryHierarchyDetail} from '../src/domain/hierarchy-binary-detail.js';
import {compileRootedHierarchyMatcher,classifyRootedHierarchyMatcher} from '../src/domain/hierarchy-rooted-matcher.js';
import {summarizeChildMatchRows} from './hierarchy-child-match-metrics.js';
const D='apps/local-service/data/',CAPTURE=D+'hierarchy-koala-supplement-capture-20261029',ADDITIONAL=D+'hierarchy-koala-additional-training-capture-20261029',FIT=D+'hierarchy-koala-supplement-fit-20261029';
const PRIOR='ad0d8a210662c8acc4e61e4102d090526941aadb60e674d81bddd66ad8a76341',MANIFEST='5766e675660a8fbe74842a69b670a84ce5f9eb457b77032337e4a69d6180b984';
const PROBE=Object.freeze({id:'koala-supplement-train-01',groupId:'victorian-government-koala-ecology-document',split:'training',language:'en',
 url:'https://www.wildlife.vic.gov.au/our-wildlife/koalas',publisher:'Victorian Government',expectedRootId:'nature',labels:{'video-games':false,animals:true,koalas:true}});
const ADDITIONAL_PROBES=Object.freeze([
 {id:'koala-additional-train-01',groupId:'animal-diversity-web-koala-species-document',url:'https://animaldiversity.org/accounts/Phascolarctos_cinereus/',publisher:'University of Michigan Animal Diversity Web',language:'en'},
 {id:'koala-additional-train-02',groupId:'zoo-leipzig-koala-species-document',url:'https://www.zoo-leipzig.de/tier/koala/',publisher:'Zoo Leipzig',language:'de'},
 {id:'koala-additional-train-03',groupId:'australia-zoo-koala-biology-document',url:'https://australiazoo.com.au/wildlife/our-animals/koalas/',publisher:'Australia Zoo',language:'en'},
].map(p=>Object.freeze({...p,split:'training',expectedRootId:'nature',labels:{'video-games':false,animals:true,koalas:true}})));
const SOURCES=Object.freeze(['apps/local-service/harness/run-hierarchy-koala-supplement.js',...CHILD_DIVERSITY_SOURCE_FILES]);
const flags={liveChanged:false,assignmentAuthority:false,productionValidated:false,independentValidation:false,representativePopulation:false,statisticalIndependenceClaim:false};
const review={kind:'Root-only primary publisher subject review before new vectors/predictions',independentReviewer:false,
 speciesAndVictoriaPublisherCorrelationDeclared:true,originalFourUnavailableTrainObservationsPreserved:true};
export async function checkKoalaSupplementSource(){const data=await readFittedChildDiversityInputs(PRIOR);return {sourcePins:await pins(SOURCES),inputPins:data.ledger,probe:PROBE,additionalProbes:ADDITIONAL_PROBES,review,encoderOpened:false,networkUsed:false,testPermitted:false,...flags};}
let used=false;
export async function captureKoalaSupplement(){
 need(!used);used=true;const data=await readFittedChildDiversityInputs(PRIOR),sources=await pins(SOURCES);await directory(CAPTURE);
 const started=performance.now();let row=null,failure=null,endPinsChecked=false,capture=null,casePin=null;
 try{
  await save(CAPTURE,'inputs.json',{probe:PROBE,review,inputPins:data.ledger,sourcePins:sources,maximumRequests:3,testPermitted:false,...flags});
  capture=createHierarchyKoalaTrainingSupplementCapture();const r=await capture.capture(PROBE.id);need(r.id===PROBE.id&&r.url===PROBE.url);
  if(r.status==='unavailable'){need(/^[a-z-]{1,48}$/u.test(r.reason));row={...PROBE,status:r.status,reason:r.reason};}
  else{
   need(r.status==='available'&&r.text.length>=160&&r.text.length<=4096&&r.title.length<=200&&r.assignmentAuthority===false);
   row={...PROBE,status:'available',text:r.text,title:r.title,extractorVersion:r.extractorVersion};
   for(const k of ['responseSha256','htmlTextSha256','titleSha256','bodySha256','rightsEvidenceHash','sourceInputHash']){need(/^[a-f0-9]{64}$/u.test(r[k]));row[k]=r[k];}
   need(sha(row.text)===row.bodySha256&&sha(row.title)===row.titleSha256);
  }
  casePin=await save(CAPTURE,PROBE.id+'.json',row);
 }catch{failure={stage:'capture-or-persistence'};}
 try{await endPins(data.ledger,SOURCES,sources);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'koala-train-supplement-capture/v1',status:failure?'failed':'completed',failure,row,casePin,review,endPinsChecked,inputPins:data.ledger,sourcePins:sources,
  capture:capture?.snapshot()??null,encoderUsed:false,testCaptured:false,elapsedMs:performance.now()-started,...flags};
 return {status:result.status,observationStatus:row?.status??null,reason:row?.reason??null,result:await save(CAPTURE,'result.json',result)};
}
export async function captureAdditionalKoalaTraining(){
 need(!used);used=true;const data=await readFittedChildDiversityInputs(PRIOR),sources=await pins(SOURCES);await directory(ADDITIONAL);
 const rows=[],casePins=[],started=performance.now();let capture=null,failure=null,endPinsChecked=false;
 try{
  await save(ADDITIONAL,'inputs.json',{probes:ADDITIONAL_PROBES,review,inputPins:data.ledger,sourcePins:sources,maximumRequests:6,testPermitted:false,...flags});
  capture=createHierarchyKoalaAdditionalTrainingCapture();
  for(const p of ADDITIONAL_PROBES){
   // The public biological account URL is blocked by the shared /accounts/
   // privacy rule. Keep its declared outcome without requesting it or weakening
   // that rule; it cannot supply training support.
   if(normalizeCrawlUrl(p.url,undefined,[])!==p.url){const row={...p,status:'unavailable',reason:'url-restricted'};rows.push(row);casePins.push(await save(ADDITIONAL,p.id+'.json',row));continue;}
   const r=await capture.capture(p.id);need(r.id===p.id&&r.url===p.url);let row;
   if(r.status==='unavailable'){need(/^[a-z-]{1,48}$/u.test(r.reason));row={...p,status:r.status,reason:r.reason};}
   else{need(r.status==='available'&&r.text.length>=160&&r.text.length<=4096&&r.title.length<=200&&r.assignmentAuthority===false);
    row={...p,status:'available',text:r.text,title:r.title,extractorVersion:r.extractorVersion};
    for(const k of ['responseSha256','htmlTextSha256','titleSha256','bodySha256','rightsEvidenceHash','sourceInputHash']){need(/^[a-f0-9]{64}$/u.test(r[k]));row[k]=r[k];}
    need(sha(row.text)===row.bodySha256&&sha(row.title)===row.titleSha256);
   }rows.push(row);casePins.push(await save(ADDITIONAL,p.id+'.json',row));
  }
 }catch{failure={stage:'capture-or-persistence',completed:rows.length};}
 try{await endPins(data.ledger,SOURCES,sources);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'koala-additional-training-capture/v1',status:failure?'failed':'completed',failure,rows,casePins,review,endPinsChecked,inputPins:data.ledger,sourcePins:sources,
  counts:{declared:3,available:rows.filter(r=>r.status==='available').length,unavailable:rows.filter(r=>r.status==='unavailable').length,notCompleted:3-rows.length},capture:capture?.snapshot()??null,encoderUsed:false,testCaptured:false,elapsedMs:performance.now()-started,...flags};
 return {status:result.status,counts:result.counts,result:await save(ADDITIONAL,'result.json',result)};
}
export async function fitKoalaSupplement(expectedCaptureSha,expectedAdditionalSha){
 need(!used&&/^[a-f0-9]{64}$/u.test(expectedCaptureSha)&&/^[a-f0-9]{64}$/u.test(expectedAdditionalSha));used=true;const data=await readFittedChildDiversityInputs(PRIOR),sources=await pins(SOURCES),capture=await json(CAPTURE+'/result.json',{sha256:expectedCaptureSha},data.ledger);
 need(capture.status==='completed'&&capture.endPinsChecked&&capture.casePin?.file===PROBE.id+'.json');
 const r=await json(CAPTURE+'/'+capture.casePin.file,capture.casePin,data.ledger);need(r.id===PROBE.id&&r.url===PROBE.url&&r.split==='training'&&r.groupId===PROBE.groupId&&JSON.stringify(r.labels)===JSON.stringify(PROBE.labels));
 const additional=await json(ADDITIONAL+'/result.json',{sha256:expectedAdditionalSha},data.ledger);need(additional.status==='completed'&&additional.endPinsChecked&&additional.casePins.length===3);
 const probes=[PROBE,...ADDITIONAL_PROBES],observations=[r];for(const p of ADDITIONAL_PROBES){const pin=additional.casePins.find(x=>x.file===p.id+'.json');need(pin);const row=await json(ADDITIONAL+'/'+pin.file,pin,data.ledger);need(row.id===p.id&&row.url===p.url&&row.split==='training'&&row.groupId===p.groupId&&JSON.stringify(row.labels)===JSON.stringify(p.labels));observations.push(row);}
 await directory(FIT);const started=performance.now(),featurePins=[],features=[];let encoder=null,encoderClosed=false,endPinsChecked=false,failure=null,artifactPin=null,artifact=null,calibration=[];
 try{
  await save(FIT,'inputs.json',{priorDiversityFitSha256:PRIOR,expectedCaptureSha,expectedAdditionalSha,inputPins:data.ledger,sourcePins:sources,review,fitOnly:'koalas',rootVideoGamesAnimalsGtaUnchanged:true,...flags});
  if(observations.some(r=>r.status==='available'))encoder=await createPackagedCrawlerEmbedder({expectedManifestSha256:MANIFEST});
  for(let i=0;i<probes.length;i++){const p=probes[i],r=observations[i];let f={id:p.id,url:p.url,split:'training',status:'unavailable',reason:r.reason};
   if(r.status==='available'){
    need(sha(r.text)===r.bodySha256&&sha(r.title)===r.titleSha256);
    const body=await encoder.embed(r.text),title=await encoder.embed(r.title);f={id:p.id,url:p.url,split:'training',status:'encoded',sourceInputHash:r.sourceInputHash,modelId:body.modelId,bodyVector:body.values,titleVector:title.values};
   }else need(r.status==='unavailable');
   features.push(f);featurePins.push(await save(FIT,p.id+'.json',f));
  }
  const extended=extendReviewedChildDevelopment({projected:data.extended,probes,features,inputDefinition:data.values.inputDefinition});
  artifact=trainBinaryHierarchyDetail(parentConditionedChildTrainingArguments(extended,'koalas','parent-training-and-calibration'));
  artifactPin=await save(FIT,'koalas-artifact.json',artifact);
  const matcher=compileRootedHierarchyMatcher({...data.base,detailArtifacts:[data.values.gtaArtifact,data.artifacts['video-games'],data.artifacts.animals,...(artifact.eligible?[artifact]:[])]});
  for(const p of extended.rows.filter(p=>p.split==='calibration')){
   const q={sourceId:p.id,sourceVersion:p.sourceVersion,bodyVector:p.bodyVector,titleVector:p.titleVector},before=classifyRootedHierarchyMatcher(data.baseline,q),after=classifyRootedHierarchyMatcher(matcher,q);
   need(JSON.stringify(before.rootPath)===JSON.stringify(after.rootPath));if(before.semanticPath.at(-1)==='gta')need(JSON.stringify(before.semanticPath)===JSON.stringify(after.semanticPath));
   calibration.push({id:p.id,status:'scored',expectedRootId:p.expectedRootId,labels:p.labels,rootPath:after.rootPath,before:before.semanticPath,after:after.semanticPath});
  }
 }catch{failure={stage:'encode-fit-or-persistence'};}
 finally{if(encoder)try{await encoder.close();encoderClosed=true;}catch{failure??={stage:'encoder-close'};}}
 try{await endPins(data.ledger,SOURCES,sources);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'koala-train-supplement-fit/v1',status:failure?'failed':'completed',failure,priorDiversityFitSha256:PRIOR,artifactPin,featurePins,
  head:artifact?{eligible:artifact.eligible,reason:artifact.reason,audit:artifact.audit}:null,calibration,calibrationSummary:summarizeChildMatchRows(calibration),review,
  rootVideoGamesAnimalsGtaUnchanged:true,encoderClosed,endPinsChecked,inputPins:data.ledger,sourcePins:sources,testEvaluated:false,elapsedMs:performance.now()-started,...flags};
 return {status:result.status,head:result.head?{eligible:result.head.eligible,reason:result.head.reason}:null,result:await save(FIT,'result.json',result)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2);try{let result;if(a.length===1&&a[0]==='--source-check')result=await checkKoalaSupplementSource();else if(a.length===1&&a[0]==='--capture')result=await captureKoalaSupplement();
  else if(a.length===1&&a[0]==='--capture-additional')result=await captureAdditionalKoalaTraining();else if(a.length===3&&a[0]==='--fit')result=await fitKoalaSupplement(a[1],a[2]);else throw new Error();process.stdout.write(JSON.stringify(result)+'\n');if(result.status==='failed')process.exitCode=1;
 }catch{process.stderr.write('Koala supplement refused; existing observations retained.\n');process.exitCode=1;}
}
