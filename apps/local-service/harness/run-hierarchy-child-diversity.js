// Fixed diversity experiment. Explicit development collection, fit, frozen TEST
// collection, and evaluation. No ingestion, deployment or owner-policy writes.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {benchmarkNeed as need,benchmarkSha as sha,readBenchmarkJson as json,benchmarkSourcePins as pins,
 checkBenchmarkPins as endPins,createBenchmarkOutput as directory,saveBenchmarkJson as save} from './hierarchy-benchmark-files.js';
import {createHierarchyChildDiversityCapture} from './hierarchy-public-capture.js';
import {createPackagedCrawlerEmbedder} from '../src/crawler/packaged-e5.js';
import {readExtendedChildInputs} from './run-hierarchy-child-calibration-extension.js';
import {extendReviewedChildDevelopment} from './hierarchy-child-calibration-extension.js';
import {CHILD_TASKS,parentConditionedChildTrainingArguments} from './retained-hierarchy-child-inputs.js';
import {trainBinaryHierarchyDetail} from '../src/domain/hierarchy-binary-detail.js';
import {compileRootedHierarchyMatcher,classifyRootedHierarchyMatcher} from '../src/domain/hierarchy-rooted-matcher.js';
import {summarizeChildMatchRows} from './hierarchy-child-match-metrics.js';
const D='apps/local-service/data/',DEV=D+'hierarchy-child-diversity-development-20261029',FIT=D+'hierarchy-child-diversity-fit-20261029',
 TEST=D+'hierarchy-child-diversity-test-20261029',EVAL=D+'hierarchy-child-diversity-evaluation-20261029';
const CORPUS='apps/local-service/harness/hierarchy-child-diversity-corpus.json',CORPUS_PIN={bytes:7635,sha256:'b12b30c0b923deccd0c2658d75e3671e9ecb4b0a8ca3dc5237668bc36ace5d01'},
 FEATURES='c571ef713dee5c4762ad4e7fa2cc1f1af7246b93178569788f05212f8dba7989',MANIFEST='5766e675660a8fbe74842a69b670a84ce5f9eb457b77032337e4a69d6180b984';
const SOURCES=Object.freeze(['apps/local-service/harness/run-hierarchy-child-diversity.js',CORPUS,'apps/local-service/harness/hierarchy-benchmark-files.js',
 'apps/local-service/harness/hierarchy-child-match-metrics.js','apps/local-service/test/hierarchy-child-match-metrics.test.js',
 'apps/local-service/harness/hierarchy-public-capture.js','apps/local-service/harness/hierarchy-child-corpus.json','apps/local-service/test/hierarchy-public-capture.test.js',
 'apps/local-service/harness/run-hierarchy-child-calibration-extension.js','apps/local-service/harness/run-retained-hierarchy-child-fit.js',
 'apps/local-service/harness/retained-hierarchy-child-inputs.js','apps/local-service/harness/hierarchy-child-calibration-extension.js',
 'apps/local-service/test/hierarchy-child-calibration-extension.test.js','apps/local-service/test/hierarchy-child-parent-conditioning.test.js',
 'apps/local-service/harness/hierarchy-public-probes.js','apps/local-service/harness/hierarchy-recipe-corpus.js','apps/local-service/harness/hierarchy-gta-corpus.js',
 'apps/local-service/src/crawler/public-fetch.js','apps/local-service/src/crawler/robots.js','apps/local-service/src/crawler/static-capture.js','apps/local-service/src/crawler/url-policy.js',
 'apps/local-service/src/crawler/packaged-e5.js','apps/local-service/src/domain/hierarchy-rooted-matcher.js','apps/local-service/src/domain/hierarchy-binary-detail.js',
 'apps/local-service/src/domain/hierarchical-e5-paired-input.js','apps/local-service/src/domain/hierarchical-e5-paired-linear-heads.js',
 'apps/local-service/src/domain/hierarchical-e5-observed-head-policy.js','apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js',
 'apps/local-service/experiments/topic-encoder/hierarchical-e5-broad-heads-v1/vector-packet.js','spikes/topic-resolution/browser/core/page-content-policy.js',
 'spikes/topic-resolution/browser/embedding/embedding-contract.js','spikes/topic-resolution/browser/embedding/.assets/manifest.json']);
const flags={liveChanged:false,assignmentAuthority:false,productionValidated:false,independentValidation:false,representativePopulation:false,statisticalIndependenceClaim:false};
async function load(){
 const {extended,values,ledger}=await readExtendedChildInputs(FEATURES),corpus=await json(CORPUS,CORPUS_PIN,ledger);
 need(corpus.schema==='hierarchy-child-diversity-corpus/v1'&&corpus.development.length===7&&corpus.test.length===11&&corpus.protocol.method==='parent-training-and-calibration');
 const all=[...corpus.development,...corpus.test],roles=new Map(),groups=new Set(extended.rows.map(r=>r.groupId));
 need(new Set(all.map(r=>r.id)).size===18&&new Set(all.map(r=>r.url)).size===18);
 for(const p of all){need(!groups.has(p.groupId));groups.add(p.groupId);const role=p.split==='test'?'test':p.split;need(!roles.has(p.publisher)||roles.get(p.publisher)===role);roles.set(p.publisher,role);}
 const nodes=[...values.rootModel.nodes,{id:'video-games',parentId:'games'},{id:'gta',parentId:'video-games'},{id:'animals',parentId:'nature'},{id:'koalas',parentId:'animals'}],
  base={rootModel:values.rootModel,rootPolicy:values.rootPolicy,inputDefinition:values.inputDefinition,nodes},baseline=compileRootedHierarchyMatcher({...base,detailArtifacts:[values.gtaArtifact]});
 return {extended,values,ledger,corpus,base,baseline};
}
function project(p,r){
 need(r.id===p.id&&r.url===p.url);const base={id:p.id,url:p.url,split:p.split,groupId:p.groupId,labels:p.labels,expectedRootId:p.expectedRootId};
 if(r.status==='unavailable'){need(/^[a-z-]{1,48}$/u.test(r.reason));return {...base,status:r.status,reason:r.reason};}
 need(r.status==='available'&&typeof r.text==='string'&&r.text.length>=160&&r.text.length<=4096&&typeof r.title==='string'&&r.title.length<=200&&r.assignmentAuthority===false);
 const out={...base,status:'available',title:r.title,text:r.text,extractorVersion:r.extractorVersion};
 for(const k of ['responseSha256','htmlTextSha256','titleSha256','bodySha256','rightsEvidenceHash','sourceInputHash']){need(/^[a-f0-9]{64}$/u.test(r[k]));out[k]=r[k];}
 need(sha(r.text)===out.bodySha256&&sha(r.title)===out.titleSha256);return {...out,nativeObservation:false,assignmentAuthority:false};
}
async function loadCapture(data,folder,expected,phase){
 const result=await json(folder+'/result.json',{sha256:expected},data.ledger),probes=data.corpus[phase];
 need(result.status==='completed'&&result.endPinsChecked&&result.phase===phase&&result.casePins.length===probes.length&&result.corpusSha256===CORPUS_PIN.sha256);
 const rows=[];for(const p of probes){const pin=result.casePins.find(x=>x.file===p.id+'.json');need(pin);const r=await json(folder+'/'+pin.file,pin,data.ledger);
  need(r.id===p.id&&r.url===p.url&&r.groupId===p.groupId&&r.split===p.split&&JSON.stringify(r.labels)===JSON.stringify(p.labels));rows.push(r);}
 return {result,rows};
}
async function loadCandidate(data,expected){
 const result=await json(FIT+'/result.json',{sha256:expected},data.ledger);need(result.status==='completed'&&result.endPinsChecked&&result.encoderClosed&&result.corpusSha256===CORPUS_PIN.sha256);
 const artifacts=[];for(const n of CHILD_TASKS){const pin=result.artifactPins[n];need(pin?.file===n+'-artifact.json');const a=await json(FIT+'/'+pin.file,pin,data.ledger);need(a.nodeId===n);if(a.eligible)artifacts.push(a);}
 need(artifacts.length>0);return {result,matcher:compileRootedHierarchyMatcher({...data.base,detailArtifacts:[data.values.gtaArtifact,...artifacts]})};
}
async function encode(encoder,p,r){
 if(r.status==='unavailable')return {id:p.id,url:p.url,split:p.split,status:'unavailable',reason:r.reason};
 need(r.status==='available'&&sha(r.text)===r.bodySha256&&sha(r.title)===r.titleSha256);const start=performance.now(),body=await encoder.embed(r.text),title=await encoder.embed(r.title);need(body.modelId===title.modelId);
 return {id:p.id,url:p.url,split:p.split,status:'encoded',sourceInputHash:r.sourceInputHash,modelId:body.modelId,bodyVector:body.values,titleVector:title.values,encodingMs:performance.now()-start};
}
function classify(data,matcher,p,f){
 if(f.status==='unavailable')return {id:p.id,status:'unavailable',reason:f.reason,labels:p.labels,expectedRootId:p.expectedRootId};
 const q={sourceId:p.id,sourceVersion:f.sourceInputHash,bodyVector:f.bodyVector,titleVector:f.titleVector},start=performance.now(),before=classifyRootedHierarchyMatcher(data.baseline,q),after=classifyRootedHierarchyMatcher(matcher,q);
 need(JSON.stringify(before.rootPath)===JSON.stringify(after.rootPath));if(before.semanticPath.at(-1)==='gta')need(JSON.stringify(before.semanticPath)===JSON.stringify(after.semanticPath));
 return {id:p.id,status:'scored',labels:p.labels,expectedRootId:p.expectedRootId,rootPath:after.rootPath,before:before.semanticPath,after:after.semanticPath,matchingMs:performance.now()-start};
}
let used=false;
export async function checkChildDiversitySource(){const data=await load();return {sourcePins:await pins(SOURCES),inputPins:data.ledger,developmentIds:data.corpus.development.map(p=>p.id),reservedTestIds:data.corpus.test.map(p=>p.id),encoderOpened:false,networkUsed:false,...flags};}
export async function captureChildDiversity(phase,fitSha=null){
 need(!used&&['development','test'].includes(phase));used=true;const data=await load(),sources=await pins(SOURCES),folder=phase==='development'?DEV:TEST;
 if(phase==='test'){need(/^[a-f0-9]{64}$/u.test(fitSha));await loadCandidate(data,fitSha);}else need(fitSha===null);
 await directory(folder);const rows=[],casePins=[],started=performance.now();let capture=null,failure=null,endPinsChecked=false;
 try{
  await save(folder,'inputs.json',{phase,fitSha,inputPins:data.ledger,sourcePins:sources,probes:data.corpus[phase],limits:{requests:34,deadlineMs:240000,spacingMs:5000},...flags});
  capture=createHierarchyChildDiversityCapture(phase);for(const p of data.corpus[phase]){const r=project(p,await capture.capture(p.id));rows.push(r);casePins.push(await save(folder,p.id+'.json',r));}
 }catch{failure={stage:'capture-or-persistence',completed:rows.length};}
 try{await endPins(data.ledger,SOURCES,sources);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'child-diversity-capture/v1',phase,status:failure?'failed':'completed',failure,fitSha,corpusSha256:CORPUS_PIN.sha256,casePins,rows,
  counts:{declared:data.corpus[phase].length,available:rows.filter(r=>r.status==='available').length,unavailable:rows.filter(r=>r.status==='unavailable').length,notCompleted:data.corpus[phase].length-rows.length},
  inputPins:data.ledger,sourcePins:sources,capture:capture?.snapshot()??null,endPinsChecked,encoderUsed:false,elapsedMs:performance.now()-started,...flags};
 return {status:result.status,counts:result.counts,result:await save(folder,'result.json',result)};
}
export async function fitChildDiversity(captureSha){
 need(!used&&/^[a-f0-9]{64}$/u.test(captureSha));used=true;const data=await load(),sources=await pins(SOURCES),capture=await loadCapture(data,DEV,captureSha,'development');
 await directory(FIT);const features=[],casePins=[],artifactPins={},started=performance.now();let encoder=null,encoderClosed=false,endPinsChecked=false,failure=null,heads={},calibration=[];
 try{
  await save(FIT,'inputs.json',{captureSha,inputPins:data.ledger,sourcePins:sources,protocol:data.corpus.protocol,...flags});
  encoder=await createPackagedCrawlerEmbedder({expectedManifestSha256:MANIFEST});
  for(let i=0;i<capture.rows.length;i++){const p=data.corpus.development[i],f=await encode(encoder,p,capture.rows[i]);features.push(f);casePins.push(await save(FIT,p.id+'.json',f));}
  const extended=extendReviewedChildDevelopment({projected:data.extended,probes:data.corpus.development,features,inputDefinition:data.values.inputDefinition}),artifacts={};
  for(const n of CHILD_TASKS){artifacts[n]=trainBinaryHierarchyDetail(parentConditionedChildTrainingArguments(extended,n,'parent-training-and-calibration'));artifactPins[n]=await save(FIT,n+'-artifact.json',artifacts[n]);}
  heads=Object.fromEntries(CHILD_TASKS.map(n=>[n,{eligible:artifacts[n].eligible,reason:artifacts[n].reason,audit:artifacts[n].audit}]));
  const matcher=compileRootedHierarchyMatcher({...data.base,detailArtifacts:[data.values.gtaArtifact,...CHILD_TASKS.filter(n=>artifacts[n].eligible).map(n=>artifacts[n])]});
  for(const r of extended.rows.filter(r=>r.split==='calibration'))calibration.push(classify(data,matcher,r,{status:'encoded',sourceInputHash:r.sourceVersion,bodyVector:r.bodyVector,titleVector:r.titleVector}));
 }catch{failure={stage:'encode-fit-or-persistence',completed:features.length};}
 finally{if(encoder)try{await encoder.close();encoderClosed=true;}catch{failure??={stage:'encoder-close'};}}
 try{await endPins(data.ledger,SOURCES,sources);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'child-diversity-fit/v1',status:failure?'failed':'completed',failure,corpusSha256:CORPUS_PIN.sha256,captureSha,casePins,artifactPins,heads,calibration,
  calibrationSummary:summarizeChildMatchRows(calibration),testEvaluated:false,encoderClosed,endPinsChecked,elapsedMs:performance.now()-started,inputPins:data.ledger,sourcePins:sources,...flags};
 return {status:result.status,heads:Object.fromEntries(CHILD_TASKS.map(n=>[n,heads[n]?{eligible:heads[n].eligible,reason:heads[n].reason}:null])),result:await save(FIT,'result.json',result)};
}
export async function evaluateChildDiversity(fitSha,testSha){
 need(!used&&/^[a-f0-9]{64}$/u.test(fitSha)&&/^[a-f0-9]{64}$/u.test(testSha));used=true;const data=await load(),sources=await pins(SOURCES),candidate=await loadCandidate(data,fitSha),capture=await loadCapture(data,TEST,testSha,'test');
 need(capture.result.fitSha===fitSha);await directory(EVAL);const rows=[],casePins=[],started=performance.now();let encoder=null,encoderClosed=false,endPinsChecked=false,failure=null;
 try{
  await save(EVAL,'inputs.json',{fitSha,testSha,inputPins:data.ledger,sourcePins:sources,trainedOrRetunedAfterTest:false,...flags});
  encoder=await createPackagedCrawlerEmbedder({expectedManifestSha256:MANIFEST});
  for(let i=0;i<capture.rows.length;i++){const p=data.corpus.test[i],f=await encode(encoder,p,capture.rows[i]),r=classify(data,candidate.matcher,p,f);
   casePins.push(await save(EVAL,p.id+'.json',{...f,match:r}));rows.push({...r,encodingMs:f.encodingMs??null});}
 }catch{failure={stage:'evaluation-or-persistence',completed:rows.length};}
 finally{if(encoder)try{await encoder.close();encoderClosed=true;}catch{failure??={stage:'encoder-close'};}}
 try{await endPins(data.ledger,SOURCES,sources);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'child-diversity-evaluation/v1',status:failure?'failed':'completed',failure,fitSha,testSha,corpusSha256:CORPUS_PIN.sha256,rows,casePins,summary:summarizeChildMatchRows(rows),
  encoderClosed,endPinsChecked,elapsedMs:performance.now()-started,inputPins:data.ledger,sourcePins:sources,...flags};
 return {status:result.status,summary:result.summary,result:await save(EVAL,'result.json',result)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2);try{let result;
  if(a.length===1&&a[0]==='--source-check')result=await checkChildDiversitySource();else if(a.length===1&&a[0]==='--capture-development')result=await captureChildDiversity('development');
  else if(a.length===2&&a[0]==='--fit')result=await fitChildDiversity(a[1]);else if(a.length===2&&a[0]==='--capture-test')result=await captureChildDiversity('test',a[1]);
  else if(a.length===3&&a[0]==='--evaluate')result=await evaluateChildDiversity(a[1],a[2]);else throw new Error();
  process.stdout.write(JSON.stringify(result)+'\n');if(result.status==='failed')process.exitCode=1;
 }catch{process.stderr.write('Child diversity experiment refused; existing artifacts retained.\n');process.exitCode=1;}
}
