// Two explicit offline phases: encode eight already captured CAL observations,
// then fit with their pinned manifest. No fetching, TEST, SQL or live activation.
import {createHash} from 'node:crypto';
import {open,lstat,realpath,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPackagedCrawlerEmbedder} from '../src/crawler/packaged-e5.js';
import {readRetainedHierarchyChildInputs} from './run-retained-hierarchy-child-fit.js';
import {CHILD_TASKS,retainedChildTrainingArguments,summarizeParentConditionedChildRows} from './retained-hierarchy-child-inputs.js';
import {extendChildCalibration} from './hierarchy-child-calibration-extension.js';
import {trainBinaryHierarchyDetail,compileBinaryHierarchyDetail,classifyBinaryHierarchyDetail} from '../src/domain/hierarchy-binary-detail.js';
import {compileRootedHierarchyMatcher,classifyRootedHierarchyMatcher} from '../src/domain/hierarchy-rooted-matcher.js';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),D='apps/local-service/data/';
const ENCODE=D+'hierarchy-child-calibration-features-20261029',FIT=D+'hierarchy-child-calibration-fit-20261029';
const CORPUS='apps/local-service/harness/hierarchy-child-corpus.json',MANIFEST='spikes/topic-resolution/browser/embedding/.assets/manifest.json';
const IDS=Object.freeze(['child-cal-01','child-cal-02','child-cal-03','child-cal-04','child-cal-05','child-cal-07','child-cal-08','child-cal-09']);
const REPAIRED=D+'hierarchy-child-calibration-parser-repair-20261029/',ORIGINAL=D+'hierarchy-child-traincal-capture-20261027/';
const SOURCES=Object.freeze(['apps/local-service/harness/run-hierarchy-child-calibration-extension.js','apps/local-service/harness/hierarchy-child-calibration-extension.js',
 'apps/local-service/harness/run-retained-hierarchy-child-fit.js','apps/local-service/harness/retained-hierarchy-child-inputs.js',
 'apps/local-service/test/hierarchy-child-calibration-extension.test.js','apps/local-service/src/crawler/packaged-e5.js',
 'apps/local-service/src/domain/hierarchy-rooted-matcher.js','apps/local-service/src/domain/hierarchy-binary-detail.js',
 'apps/local-service/src/domain/hierarchical-e5-paired-input.js','apps/local-service/src/domain/hierarchical-e5-paired-linear-heads.js',
 'apps/local-service/src/domain/hierarchical-e5-observed-head-policy.js','apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js',
 'apps/local-service/experiments/topic-encoder/hierarchical-e5-broad-heads-v1/vector-packet.js','spikes/topic-resolution/browser/embedding/embedding-contract.js',MANIFEST]);
const sha=b=>createHash('sha256').update(b).digest('hex'),need=v=>{if(!v)throw new Error('Child calibration extension refused');};
const flags={networkUsed:false,testEvaluated:false,liveChanged:false,assignmentAuthority:false,productionValidated:false,independentValidation:false};
async function read(file,expected=null,ledger=null){
 need(typeof file==='string'&&!path.isAbsolute(file)&&!file.includes('\\')&&!file.split('/').includes('..'));
 const name=path.resolve(ROOT,file),s=await lstat(name,{bigint:true});need(s.isFile()&&!s.isSymbolicLink()&&s.size>0n&&s.size<=4194304n&&(await realpath(name)).toLowerCase()===name.toLowerCase());
 const same=x=>['dev','ino','size','mtimeNs','ctimeNs'].every(k=>x[k]===s[k]);const fd=await open(name,'r');let raw;
 try{need(same(await fd.stat({bigint:true})));raw=Buffer.alloc(Number(s.size)+1);let used=0;while(used<raw.length){const step=await fd.read(raw,used,raw.length-used,used);if(!step.bytesRead)break;used+=step.bytesRead;}
  need(used===Number(s.size)&&same(await fd.stat({bigint:true}))&&same(await lstat(name,{bigint:true})));raw=raw.subarray(0,used);
 }finally{await fd.close();}
 const pin={file,bytes:raw.length,sha256:sha(raw)};if(expected)need(pin.sha256===expected.sha256&&(expected.bytes===undefined||pin.bytes===expected.bytes));ledger?.push(pin);return raw;
}
async function json(file,pin,ledger){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await read(file,pin,ledger)));}
async function pins(){const list=[];for(const file of SOURCES)await read(file,null,list);return list;}
async function save(folder,file,value){need(/^[a-z0-9-]+\.json$/u.test(file));const raw=Buffer.from(JSON.stringify(value)+'\n');need(raw.length<=1048576);await writeFile(path.join(ROOT,folder,file),raw,{flag:'wx'});return {file,bytes:raw.length,sha256:sha(raw)};}
async function directory(folder){const target=path.join(ROOT,folder);for(let p=path.dirname(target);;p=path.dirname(p)){const s=await lstat(p);need(s.isDirectory()&&!s.isSymbolicLink()&&(await realpath(p)).toLowerCase()===p.toLowerCase());if(path.dirname(p)===p)break;}await mkdir(target);}
async function observations(){
 const ledger=[],corpus=await json(CORPUS,{bytes:103445,sha256:'ba36c30292e56270e21d5f8f98fb01392e42dad44bdeda1ee5879f844a64a548'},ledger);
 const repair=await json(REPAIRED+'result.json',{bytes:33012,sha256:'77a4732c2e5b40fd8ab65b37af8d897110d6dc141c1fc4f31f6ae4182aadaaf2'},ledger);
 need(repair.status==='completed'&&repair.endPinsChecked&&repair.counts.available===6);
 const probes=IDS.map(id=>{const p=corpus.freshCandidates.find(r=>r.id===id);need(p&&p.split==='calibration');return p;}),rows=[];
 for(const p of probes){
  const old=p.id==='child-cal-05'||p.id==='child-cal-07',file=p.id+'.json',pin=old?{sha256:p.id==='child-cal-05'?'4a06ec0bd8b2811c527e94c96e07bdb16c899d2840f9f595f432ad10dc85eae7':'323de7b2b4a4c07aa243e2a5c5e60f0edcea2ebf6a0918f58fb87f061cf385b7'}:repair.casePins.find(x=>x.file===file);
  need(pin);const row=await json((old?ORIGINAL:REPAIRED)+file,pin,ledger);
  need(row.id===p.id&&row.url===p.url&&row.split==='calibration'&&row.groupId===p.groupId&&JSON.stringify(row.labels)===JSON.stringify(p.labels)&&row.status==='available'&&
   sha(row.text)===row.bodySha256&&sha(row.title)===row.titleSha256&&/^[a-f0-9]{64}$/u.test(row.sourceInputHash));rows.push(row);
 }
 return {ledger,probes,rows};
}
async function endPins(ledger,sources){for(const pin of ledger)await read(pin.file,pin);need(JSON.stringify(await pins())===JSON.stringify(sources));}
export async function checkChildCalibrationExtension(){const data=await observations();return {sourcePins:await pins(),inputPins:data.ledger,ids:IDS,testPermitted:false,encoderOpened:false,...flags};}
let used=false;
export async function encodeChildCalibrationExtension(){
 need(arguments.length===0&&!used);used=true;const sources=await pins(),data=await observations();await read(MANIFEST,{sha256:'5766e675660a8fbe74842a69b670a84ce5f9eb457b77032337e4a69d6180b984'},data.ledger);
 await directory(ENCODE);let encoder=null,failure=null,closed=false;const cases=[],started=performance.now();
 try{
  await save(ENCODE,'inputs.json',{sourcePins:sources,inputPins:data.ledger,probes:data.probes,...flags});
  encoder=await createPackagedCrawlerEmbedder({expectedManifestSha256:'5766e675660a8fbe74842a69b670a84ce5f9eb457b77032337e4a69d6180b984'});
  for(const row of data.rows){const body=await encoder.embed(row.text),title=await encoder.embed(row.title);need(body.modelId===title.modelId);
   const feature={id:row.id,url:row.url,split:'calibration',status:'encoded',sourceInputHash:row.sourceInputHash,modelId:body.modelId,bodyVector:body.values,titleVector:title.values};
   cases.push(await save(ENCODE,row.id+'.json',feature));
  }
 }catch{failure={stage:'encoding',completedCases:cases.length};}
 finally{if(encoder)try{await encoder.close();closed=true;}catch{failure??={stage:'encoder-close'};}}
 let endPinsChecked=false;try{await endPins(data.ledger,sources);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'child-calibration-features/v1',status:failure?'failed':'completed',failure,cases,inputPins:data.ledger,sourcePins:sources,encoderClosed:closed,endPinsChecked,elapsedMs:performance.now()-started,...flags};
 return {status:result.status,result:await save(ENCODE,'result.json',result)};
}
export async function fitChildCalibrationExtension(expectedFeatureSha){
 need(!used&&/^[a-f0-9]{64}$/u.test(expectedFeatureSha));used=true;const sources=await pins(),ledger=[],encoded=await json(ENCODE+'/result.json',{sha256:expectedFeatureSha},ledger);
 need(encoded.status==='completed'&&encoded.encoderClosed&&encoded.endPinsChecked&&encoded.cases.length===8);
 const data=await observations(),features=[];ledger.push(...data.ledger);
 for(const id of IDS){const pin=encoded.cases.find(p=>p.file===id+'.json');need(pin);features.push(await json(ENCODE+'/'+id+'.json',pin,ledger));}
 const {projected,values,ledger:retainedLedger}=await readRetainedHierarchyChildInputs();ledger.push(...retainedLedger.map(p=>({file:p.path,bytes:p.bytes,sha256:p.sha256})));
 const extended=extendChildCalibration({projected,probes:data.probes,features,inputDefinition:values.inputDefinition});need(extended.rows.length===44&&extended.extensionUnavailable.length===0);
 await directory(FIT);const artifacts={},handles={},started=performance.now();
 await save(FIT,'inputs.json',{inputPins:ledger,sourcePins:sources,featureManifestSha256:expectedFeatureSha,trainingUnchanged:true,calibrationExtendedBy:8,...flags});
 for(const node of CHILD_TASKS){artifacts[node]=trainBinaryHierarchyDetail(retainedChildTrainingArguments(extended,node));handles[node]=compileBinaryHierarchyDetail(artifacts[node]);await save(FIT,node+'-artifact.json',artifacts[node]);}
 const nodes=[...values.rootModel.nodes,{id:'video-games',parentId:'games'},{id:'gta',parentId:'video-games'},{id:'animals',parentId:'nature'},{id:'koalas',parentId:'animals'}];
 const base={rootModel:values.rootModel,rootPolicy:values.rootPolicy,inputDefinition:values.inputDefinition,nodes},baseline=compileRootedHierarchyMatcher({...base,detailArtifacts:[values.gtaArtifact]}),
  candidate=compileRootedHierarchyMatcher({...base,detailArtifacts:[values.gtaArtifact,...CHILD_TASKS.filter(n=>artifacts[n].eligible).map(n=>artifacts[n])]});
 const calibration=[];
 for(const row of extended.rows.filter(r=>r.split==='calibration')){
  const query={sourceId:row.id,sourceVersion:row.sourceVersion,bodyVector:row.bodyVector,titleVector:row.titleVector},before=classifyRootedHierarchyMatcher(baseline,query),after=classifyRootedHierarchyMatcher(candidate,query);
  need(JSON.stringify(before.rootPath)===JSON.stringify(after.rootPath));if(before.semanticPath.at(-1)==='gta')need(JSON.stringify(before.semanticPath)===JSON.stringify(after.semanticPath));
  const decisions={};for(const n of CHILD_TASKS){const d=classifyBinaryHierarchyDetail(handles[n],{...Object.fromEntries(['sourceId','sourceVersion'].map(k=>[k,query[k]])),representation:extended.representation.representation,representationHash:extended.representation.representationHash,vector:row.vector,independentRootPath:before.rootPath});decisions[n]={accepted:d.detailAccepted,reason:d.reason};}
  calibration.push({id:row.id,expectedRootId:row.expectedRootId,labels:row.labels,rootPath:before.rootPath,before:before.semanticPath,after:after.semanticPath,decisions});
 }
 await endPins(ledger,sources);
 const result={schema:'child-extended-calibration-fit/v1',status:'completed',heads:Object.fromEntries(CHILD_TASKS.map(n=>[n,{eligible:artifacts[n].eligible,reason:artifacts[n].reason,audit:artifacts[n].audit}])),calibration,
  parentConditionedCalibration:Object.fromEntries(CHILD_TASKS.map(n=>[n,summarizeParentConditionedChildRows(calibration,n)])),rootRetuned:false,gtaUnchanged:true,trainingUnchanged:true,endPinsChecked:true,elapsedMs:performance.now()-started,...flags};
 return {status:result.status,heads:Object.fromEntries(CHILD_TASKS.map(n=>[n,{eligible:artifacts[n].eligible,reason:artifacts[n].reason}])),result:await save(FIT,'result.json',result)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);try{let result;if(args.length===1&&args[0]==='--source-check')result=await checkChildCalibrationExtension();
  else if(args.length===1&&args[0]==='--encode')result=await encodeChildCalibrationExtension();else if(args.length===2&&args[0]==='--fit')result=await fitChildCalibrationExtension(args[1]);else throw new Error();
  process.stdout.write(JSON.stringify(result)+'\n');if(result.status==='failed')process.exitCode=1;
 }catch{process.stderr.write('Child calibration extension refused; existing artifacts retained.\n');process.exitCode=1;}
}
