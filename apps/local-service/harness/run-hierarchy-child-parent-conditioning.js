// Fixed two-method development comparison; no encoder, network, TEST or SQL.
import {createHash} from 'node:crypto';
import {lstat,open,mkdir,realpath,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readExtendedChildInputs} from './run-hierarchy-child-calibration-extension.js';
import {CHILD_TASKS,parentConditionedChildTrainingArguments,summarizeParentConditionedChildRows} from './retained-hierarchy-child-inputs.js';
import {trainBinaryHierarchyDetail,compileBinaryHierarchyDetail,classifyBinaryHierarchyDetail} from '../src/domain/hierarchy-binary-detail.js';
import {compileRootedHierarchyMatcher,classifyRootedHierarchyMatcher} from '../src/domain/hierarchy-rooted-matcher.js';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),OUTPUT='apps/local-service/data/hierarchy-child-parent-conditioning-20261029';
const FEATURES='c571ef713dee5c4762ad4e7fa2cc1f1af7246b93178569788f05212f8dba7989';
const MODES=Object.freeze(['parent-training-and-calibration','parent-training']);
const SOURCES=Object.freeze(['apps/local-service/harness/run-hierarchy-child-parent-conditioning.js','apps/local-service/harness/run-hierarchy-child-calibration-extension.js',
 'apps/local-service/harness/hierarchy-child-calibration-extension.js','apps/local-service/harness/retained-hierarchy-child-inputs.js','apps/local-service/harness/run-retained-hierarchy-child-fit.js',
 'apps/local-service/test/hierarchy-child-parent-conditioning.test.js','apps/local-service/src/domain/hierarchy-binary-detail.js','apps/local-service/src/domain/hierarchy-rooted-matcher.js',
 'apps/local-service/src/domain/hierarchical-e5-paired-input.js','apps/local-service/src/domain/hierarchical-e5-paired-linear-heads.js','apps/local-service/src/domain/hierarchical-e5-observed-head-policy.js',
 'apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js','apps/local-service/experiments/topic-encoder/hierarchical-e5-broad-heads-v1/vector-packet.js',
 'apps/local-service/src/crawler/packaged-e5.js','spikes/topic-resolution/browser/embedding/embedding-contract.js']);
const sha=b=>createHash('sha256').update(b).digest('hex'),need=v=>{if(!v)throw new Error('Parent-conditioned comparison refused');};
const flags={encoderUsed:false,networkUsed:false,testEvaluated:false,liveChanged:false,assignmentAuthority:false,productionValidated:false,independentValidation:false};
async function read(file,pin=null){
 need(!path.isAbsolute(file)&&!file.includes('\\')&&!file.split('/').includes('..'));const name=path.join(ROOT,file),s=await lstat(name,{bigint:true});
 need(s.isFile()&&!s.isSymbolicLink()&&s.size>0n&&s.size<=4194304n&&(await realpath(name)).toLowerCase()===name.toLowerCase());
 const same=x=>['dev','ino','size','mtimeNs','ctimeNs'].every(k=>s[k]===x[k]),fd=await open(name,'r');let raw;
 try{need(same(await fd.stat({bigint:true})));raw=Buffer.alloc(Number(s.size)+1);let used=0;while(used<raw.length){const step=await fd.read(raw,used,raw.length-used,used);if(!step.bytesRead)break;used+=step.bytesRead;}
  need(used===Number(s.size)&&same(await fd.stat({bigint:true}))&&same(await lstat(name,{bigint:true})));raw=raw.subarray(0,used);
 }finally{await fd.close();}
 const out={file,bytes:raw.length,sha256:sha(raw)};if(pin)need(out.bytes===pin.bytes&&out.sha256===pin.sha256);return out;
}
async function pins(){const list=[];for(const file of SOURCES)list.push(await read(file));return list;}
async function save(file,value){need(/^[a-z-]+\.json$/u.test(file));const raw=Buffer.from(JSON.stringify(value)+'\n');need(raw.length<=1048576);await writeFile(path.join(ROOT,OUTPUT,file),raw,{flag:'wx'});return {file,bytes:raw.length,sha256:sha(raw)};}
export async function checkParentConditionedChildSource(){const data=await readExtendedChildInputs(FEATURES);return {sourcePins:await pins(),inputPins:data.ledger,modes:MODES,rows:data.extended.rows.length,...flags};}
let used=false;
export async function compareParentConditionedChildren(){
 need(arguments.length===0&&!used);used=true;const sources=await pins(),{extended,values,ledger}=await readExtendedChildInputs(FEATURES),started=performance.now();
 const target=path.join(ROOT,OUTPUT);for(let p=path.dirname(target);;p=path.dirname(p)){const s=await lstat(p);need(s.isDirectory()&&!s.isSymbolicLink()&&(await realpath(p)).toLowerCase()===p.toLowerCase());if(path.dirname(p)===p)break;}await mkdir(target);
 await save('inputs.json',{sourcePins:sources,inputPins:ledger,modes:MODES,selection:'CAL-only; fully parent-conditioned first on ties; no automatic activation',...flags});
 const nodes=[...values.rootModel.nodes,{id:'video-games',parentId:'games'},{id:'gta',parentId:'video-games'},{id:'animals',parentId:'nature'},{id:'koalas',parentId:'animals'}],
  base={rootModel:values.rootModel,rootPolicy:values.rootPolicy,inputDefinition:values.inputDefinition,nodes},baseline=compileRootedHierarchyMatcher({...base,detailArtifacts:[values.gtaArtifact]}),reports={};
 for(const mode of MODES){
  const artifacts={},handles={},artifactPins={};for(const node of CHILD_TASKS){artifacts[node]=trainBinaryHierarchyDetail(parentConditionedChildTrainingArguments(extended,node,mode));handles[node]=compileBinaryHierarchyDetail(artifacts[node]);artifactPins[node]=await save(mode+'-'+node+'.json',artifacts[node]);}
  const candidate=compileRootedHierarchyMatcher({...base,detailArtifacts:[values.gtaArtifact,...CHILD_TASKS.filter(n=>artifacts[n].eligible).map(n=>artifacts[n])]}),calibration=[];
  for(const row of extended.rows.filter(r=>r.split==='calibration')){
   const q={sourceId:row.id,sourceVersion:row.sourceVersion,bodyVector:row.bodyVector,titleVector:row.titleVector},before=classifyRootedHierarchyMatcher(baseline,q),after=classifyRootedHierarchyMatcher(candidate,q);
   need(JSON.stringify(before.rootPath)===JSON.stringify(after.rootPath));if(before.semanticPath.at(-1)==='gta')need(JSON.stringify(before.semanticPath)===JSON.stringify(after.semanticPath));
   const decisions={};for(const n of CHILD_TASKS){const d=classifyBinaryHierarchyDetail(handles[n],{sourceId:row.id,sourceVersion:row.sourceVersion,representation:extended.representation.representation,representationHash:extended.representation.representationHash,vector:row.vector,independentRootPath:before.rootPath});decisions[n]={accepted:d.detailAccepted,reason:d.reason};}
   calibration.push({id:row.id,labels:row.labels,expectedRootId:row.expectedRootId,rootPath:before.rootPath,before:before.semanticPath,after:after.semanticPath,decisions});
  }
  reports[mode]={heads:Object.fromEntries(CHILD_TASKS.map(n=>[n,{eligible:artifacts[n].eligible,reason:artifacts[n].reason,audit:artifacts[n].audit}])),artifactPins,calibration,
   parentConditionedCalibration:Object.fromEntries(CHILD_TASKS.map(n=>[n,summarizeParentConditionedChildRows(calibration,n)]))};
 }
 for(const pin of ledger)await read(pin.file,pin);need(JSON.stringify(await pins())===JSON.stringify(sources));
 const result={schema:'parent-conditioned-child-comparison/v1',status:'completed',reports,endPinsChecked:true,rootRetuned:false,gtaUnchanged:true,elapsedMs:performance.now()-started,...flags};
 return {status:result.status,heads:Object.fromEntries(MODES.map(m=>[m,Object.fromEntries(CHILD_TASKS.map(n=>[n,{eligible:reports[m].heads[n].eligible,reason:reports[m].heads[n].reason}]))])),result:await save('result.json',result)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);try{need(args.length===1&&['--source-check','--compare'].includes(args[0]));process.stdout.write(JSON.stringify(await(args[0]==='--source-check'?checkParentConditionedChildSource():compareParentConditionedChildren()))+'\n');}
 catch{process.stderr.write('Parent-conditioned comparison refused; outputs retained.\n');process.exitCode=1;}
}
