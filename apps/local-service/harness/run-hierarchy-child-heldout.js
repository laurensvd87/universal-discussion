// Frozen candidate, separate held-out collection and offline evaluation.
// This command never fits, retunes, installs, ingests or changes owner policy.
import {createHash} from 'node:crypto';
import {open,lstat,realpath,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHierarchyChildEvaluationCapture} from './hierarchy-public-capture.js';
import {createPackagedCrawlerEmbedder} from '../src/crawler/packaged-e5.js';
import {compileRootedHierarchyMatcher,classifyRootedHierarchyMatcher} from '../src/domain/hierarchy-rooted-matcher.js';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),D='apps/local-service/data/',A='apps/local-service/assets/hierarchy/';
const CAPTURE=D+'hierarchy-child-heldout-capture-20261029',EVALUATION=D+'hierarchy-child-heldout-evaluation-20261029';
const F=D+'hierarchy-child-calibration-fit-20261029/';
const INPUTS=Object.freeze({
 corpus:['apps/local-service/harness/hierarchy-child-corpus.json',103445,'ba36c30292e56270e21d5f8f98fb01392e42dad44bdeda1ee5879f844a64a548'],
 fit:[F+'result.json',11475,'097260251f99564f1c20ebb0bcb81f782b823a3b6c15e6796f942a03867bc1e2'],
 videoGames:[F+'video-games-artifact.json',25563,'dadd1bca052dfec9bed14288f99e3175104ed33727d514e303a0f5c45ab92544'],
 animals:[F+'animals-artifact.json',25551,'0dbcd5ad07b55ed35a576b80fefd2d377944864736f3fe22536f6c2f233e366b'],
 koalas:[F+'koalas-artifact.json',8719,'38a42e6b459600c931b57d5c1debfc22fe6319ae5c258d913ea89d654504fe6a'],
 rootModel:[A+'root-model.json',143743,'442ceb797e071f13ea4bc25df701846d2f167a7deb3e60de31711da8bdec7451'],
 rootPolicy:[A+'root-policy.json',983,'309afc18b29695640f4f15d8138d75ad002768f4e0b13d47df902e3d8bb6b546'],
 inputDefinition:[A+'input-definition.json',119,'2ec96c1244761b9688e5fea2a2dec168df1ac961aa2d440fcd42bdb085e6096c'],
 gta:[A+'gta-detail.json',16394,'0233a7b624b646c2060495935f53bee6901e7068cedbda9352bf85945c1b54ea'],
 manifest:['spikes/topic-resolution/browser/embedding/.assets/manifest.json',null,'5766e675660a8fbe74842a69b670a84ce5f9eb457b77032337e4a69d6180b984'],
});
const SOURCES=Object.freeze(['apps/local-service/harness/run-hierarchy-child-heldout.js','apps/local-service/harness/hierarchy-public-capture.js',
 'apps/local-service/test/hierarchy-public-capture.test.js','apps/local-service/src/crawler/public-fetch.js','apps/local-service/src/crawler/robots.js',
 'apps/local-service/src/crawler/static-capture.js','apps/local-service/src/crawler/url-policy.js','apps/local-service/src/crawler/packaged-e5.js',
 'apps/local-service/harness/hierarchy-public-probes.js','apps/local-service/harness/hierarchy-recipe-corpus.js','apps/local-service/harness/hierarchy-gta-corpus.js',
 'spikes/topic-resolution/browser/core/page-content-policy.js','spikes/topic-resolution/browser/embedding/embedding-contract.js',
 'apps/local-service/src/domain/hierarchy-rooted-matcher.js','apps/local-service/src/domain/hierarchy-binary-detail.js',
 'apps/local-service/src/domain/hierarchical-e5-paired-input.js','apps/local-service/src/domain/hierarchical-e5-paired-linear-heads.js',
 'apps/local-service/src/domain/hierarchical-e5-observed-head-policy.js','apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js']);
const sha=b=>createHash('sha256').update(b).digest('hex'),need=v=>{if(!v)throw new Error('Frozen child evaluation refused');};
const flags={fittingExecuted:false,rootRetuned:false,gtaRetuned:false,liveChanged:false,assignmentAuthority:false,productionValidated:false,representativePopulation:false,statisticalIndependenceClaim:false};
async function read(file,pin=null,ledger=null){
 need(typeof file==='string'&&!path.isAbsolute(file)&&!file.includes('\\')&&!file.split('/').includes('..'));
 const name=path.resolve(ROOT,file),before=await lstat(name,{bigint:true});need(before.isFile()&&!before.isSymbolicLink()&&before.size>0n&&before.size<=4194304n&&(await realpath(name)).toLowerCase()===name.toLowerCase());
 const same=s=>['dev','ino','size','mtimeNs','ctimeNs'].every(k=>s[k]===before[k]),fd=await open(name,'r');let bytes;
 try{need(same(await fd.stat({bigint:true})));bytes=Buffer.alloc(Number(before.size)+1);let used=0;
  while(used<bytes.length){const step=await fd.read(bytes,used,bytes.length-used,used);if(!step.bytesRead)break;used+=step.bytesRead;}
  need(used===Number(before.size)&&same(await fd.stat({bigint:true}))&&same(await lstat(name,{bigint:true})));bytes=bytes.subarray(0,used);
 }finally{await fd.close();}
 const actual={file,bytes:bytes.length,sha256:sha(bytes)};if(pin)need(actual.sha256===pin.sha256&&(pin.bytes==null||actual.bytes===pin.bytes));ledger?.push(actual);return bytes;
}
async function json(file,pin,ledger){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await read(file,pin,ledger)));}
async function pins(){const list=[];for(const f of SOURCES)await read(f,null,list);return list;}
async function load(){
 const values={},ledger=[];for(const [k,[file,bytes,sha256]]of Object.entries(INPUTS))values[k]=await json(file,{bytes,sha256},ledger);
 need(values.fit.status==='completed'&&values.fit.endPinsChecked&&values.fit.trainingUnchanged&&values.videoGames.eligible&&values.animals.eligible&&!values.koalas.eligible);
 const probes=values.corpus.freshCandidates.filter(p=>p.split==='test');need(probes.length===14&&probes.every((p,i)=>p.id==='child-test-'+String(i+1).padStart(2,'0')));
 const nodes=[...values.rootModel.nodes,{id:'video-games',parentId:'games'},{id:'gta',parentId:'video-games'},{id:'animals',parentId:'nature'},{id:'koalas',parentId:'animals'}];
 const base={rootModel:values.rootModel,rootPolicy:values.rootPolicy,inputDefinition:values.inputDefinition,nodes};
 const baseline=compileRootedHierarchyMatcher({...base,detailArtifacts:[values.gta]}),candidate=compileRootedHierarchyMatcher({...base,detailArtifacts:[values.gta,values.videoGames,values.animals]});
 return {values,ledger,probes,baseline,candidate};
}
async function endPins(ledger,sources){for(const pin of ledger)await read(pin.file,pin);need(JSON.stringify(await pins())===JSON.stringify(sources));}
async function directory(folder){const target=path.join(ROOT,folder);for(let p=path.dirname(target);;p=path.dirname(p)){const s=await lstat(p);need(s.isDirectory()&&!s.isSymbolicLink()&&(await realpath(p)).toLowerCase()===p.toLowerCase());if(path.dirname(p)===p)break;}await mkdir(target);}
async function save(folder,file,value){need(/^(inputs|result|child-test-\d{2})\.json$/u.test(file));const raw=Buffer.from(JSON.stringify(value)+'\n');need(raw.length<=1048576);await writeFile(path.join(ROOT,folder,file),raw,{flag:'wx'});return {file,bytes:raw.length,sha256:sha(raw)};}
function project(probe,row){
 need(row.id===probe.id&&row.url===probe.url);const base={id:probe.id,url:probe.url,groupId:probe.groupId,split:'test',expectedRootId:probe.expectedRootId,labels:probe.labels};
 if(row.status==='unavailable'){need(/^[a-z-]{1,48}$/u.test(row.reason));return {...base,status:row.status,reason:row.reason};}
 need(row.status==='available'&&typeof row.text==='string'&&row.text.length>=160&&row.text.length<=4096&&typeof row.title==='string'&&row.title.length<=200);
 const out={...base,status:'available',title:row.title,text:row.text,extractorVersion:row.extractorVersion};
 for(const k of ['responseSha256','htmlTextSha256','titleSha256','bodySha256','rightsEvidenceHash','sourceInputHash']){need(/^[a-f0-9]{64}$/u.test(row[k]));out[k]=row[k];}
 need(sha(row.text)===out.bodySha256&&sha(row.title)===out.titleSha256&&row.assignmentAuthority===false&&row.nativeObservation===false);return {...out,nativeObservation:false,assignmentAuthority:false};
}
export async function checkHeldoutChildSource(){const {ledger,probes}=await load();return {inputPins:ledger,sourcePins:await pins(),ids:probes.map(p=>p.id),networkUsed:false,encoderOpened:false,...flags};}
let used=false;
export async function captureHeldoutChildren(){
 need(arguments.length===0&&!used);used=true;const data=await load(),sources=await pins();await directory(CAPTURE);
 const started=performance.now(),rows=[],casePins=[];let failure=null,endPinsChecked=false,capture=null;
 try{
  await save(CAPTURE,'inputs.json',{inputPins:data.ledger,sourcePins:sources,probes:data.probes,candidateFrozenBeforeTest:true,limits:{requests:34,deadlineMs:240000,spacingMs:5000},...flags});
  capture=createHierarchyChildEvaluationCapture();for(const p of data.probes){const row=project(p,await capture.capture(p.id));rows.push(row);casePins.push(await save(CAPTURE,p.id+'.json',row));}
 }catch{failure={stage:'capture-or-persistence',completedRows:rows.length};}
 try{await endPins(data.ledger,sources);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'frozen-child-heldout-capture/v1',status:failure?'failed':'completed',failure,rows,casePins,inputPins:data.ledger,sourcePins:sources,endPinsChecked,capture:capture?.snapshot()??null,
  counts:{declared:14,available:rows.filter(r=>r.status==='available').length,unavailable:rows.filter(r=>r.status==='unavailable').length,notCompleted:14-rows.length},elapsedMs:performance.now()-started,...flags};
 return {status:result.status,counts:result.counts,result:await save(CAPTURE,'result.json',result)};
}
export async function evaluateHeldoutChildren(expectedCaptureSha){
 need(!used&&/^[a-f0-9]{64}$/u.test(expectedCaptureSha));used=true;const data=await load(),sources=await pins(),fixedInputs=JSON.stringify(data.ledger),capture=await json(CAPTURE+'/result.json',{sha256:expectedCaptureSha},data.ledger);
 need(capture.status==='completed'&&capture.endPinsChecked&&capture.casePins.length===14&&JSON.stringify(capture.inputPins)===fixedInputs);const raw=[];
 for(const p of data.probes){const pin=capture.casePins.find(x=>x.file===p.id+'.json');need(pin);const row=await json(CAPTURE+'/'+pin.file,pin,data.ledger);need(row.id===p.id&&row.url===p.url&&row.split==='test'&&row.groupId===p.groupId&&JSON.stringify(row.labels)===JSON.stringify(p.labels));raw.push(row);}
 await directory(EVALUATION);const rows=[],casePins=[],started=performance.now();let encoder=null,encoderClosed=false,failure=null;
 try{
  await save(EVALUATION,'inputs.json',{inputPins:data.ledger,sourcePins:sources,expectedCaptureSha,trainedOrRetunedAfterTest:false,...flags});
  encoder=await createPackagedCrawlerEmbedder({expectedManifestSha256:INPUTS.manifest[2]});
  for(let i=0;i<raw.length;i++){
   const p=data.probes[i],r=raw[i];if(r.status==='unavailable'){rows.push({id:p.id,labels:p.labels,status:'unavailable',reason:r.reason,expectedRootId:p.expectedRootId});continue;}
   need(r.status==='available'&&sha(r.text)===r.bodySha256&&sha(r.title)===r.titleSha256);
   const body=await encoder.embed(r.text),title=await encoder.embed(r.title),q={sourceId:p.id,sourceVersion:r.sourceInputHash,bodyVector:body.values,titleVector:title.values},
    before=classifyRootedHierarchyMatcher(data.baseline,q),after=classifyRootedHierarchyMatcher(data.candidate,q);
   need(JSON.stringify(before.rootPath)===JSON.stringify(after.rootPath));if(before.semanticPath.at(-1)==='gta')need(JSON.stringify(before.semanticPath)===JSON.stringify(after.semanticPath));
   const row={id:p.id,status:'scored',expectedRootId:p.expectedRootId,labels:p.labels,rootPath:after.rootPath,before:before.semanticPath,after:after.semanticPath,
    sourceInputHash:r.sourceInputHash,bodyVector:body.values,titleVector:title.values,modelId:body.modelId};
   casePins.push(await save(EVALUATION,p.id+'.json',row));rows.push({id:row.id,status:row.status,expectedRootId:row.expectedRootId,labels:row.labels,rootPath:row.rootPath,before:row.before,after:row.after});
  }
 }catch{failure={stage:'evaluation-or-persistence',completedRows:rows.length};}
 finally{if(encoder)try{await encoder.close();encoderClosed=true;}catch{failure??={stage:'encoder-close'};}}
 let endPinsChecked=false;try{await endPins(data.ledger,sources);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 const metrics={};for(const node of ['video-games','animals','koalas']){
  const scored=rows.filter(r=>r.status==='scored'),parent=node==='video-games'?'games':'nature';
  metrics[node]={knownPositive:scored.filter(r=>r.labels[node]===true).length,knownNegative:scored.filter(r=>r.labels[node]===false).length,
   parentPositive:scored.filter(r=>r.labels[node]===true&&r.expectedRootId===parent).length,parentNegative:scored.filter(r=>r.labels[node]===false&&(node==='koalas'?r.labels.animals===true:r.expectedRootId===parent)).length,
   rootGatePositive:scored.filter(r=>r.labels[node]===true&&r.rootPath.includes(parent)).length,
   rootGateNegative:scored.filter(r=>r.labels[node]===false&&(node==='koalas'?r.labels.animals===true:r.expectedRootId===parent)&&r.rootPath.includes(parent)).length,
   animalGatePositive:node==='koalas'?scored.filter(r=>r.labels[node]===true&&r.after.includes('animals')).length:null,
   animalGateNegative:node==='koalas'?scored.filter(r=>r.labels[node]===false&&r.labels.animals===true&&r.after.includes('animals')).length:null,
   acceptedPositive:scored.filter(r=>r.labels[node]===true&&r.after.includes(node)).length,acceptedNegative:scored.filter(r=>r.labels[node]===false&&r.after.includes(node)).length};
 }
 const result={schema:'frozen-child-heldout-evaluation/v1',status:failure?'failed':'completed',failure,rows,metrics,declared:14,scored:rows.filter(r=>r.status==='scored').length,
  unavailable:rows.filter(r=>r.status==='unavailable').length,casePins,rootCorrect:rows.filter(r=>r.status==='scored'&&r.rootPath.length===1&&r.rootPath[0]===r.expectedRootId).length,
  rootAbstained:rows.filter(r=>r.status==='scored'&&r.rootPath.length===0).length,encoderClosed,endPinsChecked,elapsedMs:performance.now()-started,sourcePins:sources,inputPins:data.ledger,...flags};
 return {status:result.status,scored:result.scored,unavailable:result.unavailable,metrics,result:await save(EVALUATION,'result.json',result)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);try{let result;if(args.length===1&&args[0]==='--source-check')result=await checkHeldoutChildSource();
  else if(args.length===1&&args[0]==='--capture')result=await captureHeldoutChildren();else if(args.length===2&&args[0]==='--evaluate')result=await evaluateHeldoutChildren(args[1]);else throw new Error();
  process.stdout.write(JSON.stringify(result)+'\n');if(result.status==='failed')process.exitCode=1;
 }catch{process.stderr.write('Frozen child evaluation refused; existing artifacts retained.\n');process.exitCode=1;}
}
