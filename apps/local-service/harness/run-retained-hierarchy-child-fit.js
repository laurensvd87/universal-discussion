// Fixed offline development fit. No network, encoder, database or activation.
import {createHash} from 'node:crypto';
import {lstat,open,realpath,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateVectorPacket} from '../experiments/topic-encoder/hierarchical-e5-broad-heads-v1/vector-packet.js';
import {trainBinaryHierarchyDetail,compileBinaryHierarchyDetail,classifyBinaryHierarchyDetail} from '../src/domain/hierarchy-binary-detail.js';
import {compileRootedHierarchyMatcher,classifyRootedHierarchyMatcher} from '../src/domain/hierarchy-rooted-matcher.js';
import {CHILD_TASKS,projectRetainedHierarchyChildRows,retainedChildTrainingArguments,summarizeParentConditionedChildRows} from './retained-hierarchy-child-inputs.js';

const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),OUTPUT='apps/local-service/data/hierarchy-retained-child-fit-bindings-20261029';
const ENCODER='76332323c22d9523de1c54e45bbec0ea762b9c259b10775f5ccb4cbad13a9cd3';
const E='apps/local-service/experiments/topic-encoder/',D='apps/local-service/data/',A='apps/local-service/assets/hierarchy/';
const SPECS=Object.freeze({
 corpus:['apps/local-service/harness/hierarchy-child-corpus.json',103445,'ba36c30292e56270e21d5f8f98fb01392e42dad44bdeda1ee5879f844a64a548'],
 oldEncoding:[E+'hierarchical-e5-real-root-v3/output/encoding-traincal.json',28922,'1df069f65ebfcba7b8f67dcafe2e401718704bcb55cd7aa3396e20375a18b687'],
 oldVectors:[E+'hierarchical-e5-real-root-v3/output/traincal.current-static.vectors.json',1542201,'bcdf5c846acdc469b1e4de05ad4d9069612ec50b5c81c79500d90470aa833c6a'],
 expansionEncoding:[E+'hierarchical-e5-capacity-real-root-v1/output/encoding-training-expansion.json',29325,'789d46cb6f237c9d94f272c24d0b464ac6f35750254809e9237d12c06ac47b34'],
 expansionVectors:[E+'hierarchical-e5-capacity-real-root-v1/output/training-expansion.current-static.vectors.json',1270036,'86eef41ce94da614738ae3035f83f42786a55c3b44ca8576adf58d7ba11c04f0'],
 gtaFit:[D+'hierarchy-gta-detail-fit-parser-repair-20261026/fit-result.json',6682,'9ae931e18992cf83a0a0d541e30f5f46c13142f813c37f76c29fe2a8f553feb5'],
 rootModel:[A+'root-model.json',143743,'442ceb797e071f13ea4bc25df701846d2f167a7deb3e60de31711da8bdec7451'],
 rootPolicy:[A+'root-policy.json',983,'309afc18b29695640f4f15d8138d75ad002768f4e0b13d47df902e3d8bb6b546'],
 inputDefinition:[A+'input-definition.json',119,'2ec96c1244761b9688e5fea2a2dec168df1ac961aa2d440fcd42bdb085e6096c'],
 gtaArtifact:[A+'gta-detail.json',16394,'0233a7b624b646c2060495935f53bee6901e7068cedbda9352bf85945c1b54ea'],
});
const SOURCES=['apps/local-service/harness/run-retained-hierarchy-child-fit.js','apps/local-service/harness/retained-hierarchy-child-inputs.js',
 'apps/local-service/test/retained-hierarchy-child-inputs.test.js','apps/local-service/src/domain/hierarchy-binary-detail.js',
 'apps/local-service/src/domain/hierarchy-rooted-matcher.js','apps/local-service/src/domain/hierarchical-e5-paired-input.js',
 'apps/local-service/src/domain/hierarchical-e5-paired-linear-heads.js','apps/local-service/src/domain/hierarchical-e5-observed-head-policy.js',
 'apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js',
 'apps/local-service/experiments/topic-encoder/hierarchical-e5-broad-heads-v1/vector-packet.js',
 'spikes/topic-resolution/harness/deny-external-capabilities.js'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),need=(v,code='binding')=>{if(!v)throw Object.assign(new Error('Retained child fit refused'),{code});};
const flags={nativeObservation:false,productionValidated:false,assignmentAuthority:false,independentValidation:false,
 representativePopulation:false,statisticalIndependenceClaim:false,testEvaluated:false,encoderUsed:false,liveChanged:false};
async function readPinned(spec,ledger){
 const [relative,size,expected]=spec;need(typeof relative==='string'&&!relative.includes('\\')&&!relative.split('/').includes('..')&&!path.isAbsolute(relative),'path');
 const file=path.resolve(ROOT,relative),before=await lstat(file,{bigint:true});need(before.isFile()&&!before.isSymbolicLink()&&before.size>0n&&before.size<=4194304n&&
  (size===null||before.size===BigInt(size))&&(await realpath(file)).toLowerCase()===file.toLowerCase(),'file');
 const handle=await open(file,'r');let raw;
 const same=s=>['dev','ino','size','mtimeNs','ctimeNs'].every(k=>s[k]===before[k]);
 try{need(same(await handle.stat({bigint:true})),'file');raw=Buffer.alloc(Number(before.size)+1);let used=0;
  while(used<raw.length){const step=await handle.read(raw,used,raw.length-used,used);if(!step.bytesRead)break;used+=step.bytesRead;}
  need(used===Number(before.size)&&same(await handle.stat({bigint:true}))&&same(await lstat(file,{bigint:true})),'file');
  const bytes=raw.subarray(0,used),digest=sha(bytes);need(expected===null||digest===expected,'pin');if(ledger)ledger.push({path:relative,bytes:used,sha256:digest});return bytes;
 }finally{await handle.close();}
}
async function json(spec,ledger){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readPinned(spec,ledger)));}
async function sources(){const result=[];for(const p of SOURCES)await readPinned([p,null,null],result);return result;}
function checkCorpus(c){need(c.schema==='hierarchy-child-label-candidates/v1'&&c.reviewedArchivedRows.length===37&&
 c.reviewedArchivedRows.filter(r=>r.reuseEligible).length===36&&c.unknownArchivedRoster.training.length===111&&c.unknownArchivedRoster.calibration.length===42&&
 c.minimums.knownTrainingPositiveGroups===2&&c.minimums.knownTrainingNegativeGroups===2&&c.minimums.knownCalibrationPositiveGroups===3&&
 c.minimums.knownCalibrationNegativeGroups===3&&c.minimums.maximumAcceptedKnownCalibrationNegatives===0&&c.minimums.lambda===.1,'corpus');}
async function save(name,value){need(/^[a-z-]+\.json$/u.test(name),'output');const raw=Buffer.from(JSON.stringify(value)+'\n');need(raw.length<=1048576,'output');await writeFile(path.join(ROOT,OUTPUT,name),raw,{flag:'wx'});return {file:name,bytes:raw.length,sha256:sha(raw)};}
export async function checkRetainedHierarchyChildFitSource(){const corpus=await json(SPECS.corpus);checkCorpus(corpus);return {
 schema:'retained-child-fit-source-check/v1',sourcePins:await sources(),fixedInputFiles:Object.keys(SPECS).length,
 reviewedKnownRows:36,unknownOmitted:153,quarantined:1,numericFeaturesOpened:false,fittingExecuted:false,testPermitted:false};}

let used=false;
export async function runRetainedHierarchyChildFit(){
 need(arguments.length===0&&!used,'one-shot');used=true;const started=performance.now(),sourcePins=await sources(),ledger=[],values={},pairs=new Map();
 const corpus=await json(SPECS.corpus,ledger);checkCorpus(corpus);await mkdir(path.join(ROOT,OUTPUT));let stage='inputs';
 try{
  for(const [key,spec]of Object.entries(SPECS))if(key!=='corpus')values[key]=await json(spec,ledger);
  for(const [key,encodingKey,count,freeze]of [['oldVectors','oldEncoding',96,'6892118af0326115f1bc40d19db30956b319157efde7991e6128d9823b4fb92a'],
   ['expansionVectors','expansionEncoding',79,'ee742344cdfd96d77f70764ffbe7c33d71b3404fa86d7f4646003389262d4c83']]){
   const packet=validateVectorPacket(values[key]),receipt=values[encodingKey];need(packet.encoderHash===ENCODER&&packet.freezeHash===freeze&&receipt.freezeHash===freeze&&
    packet.vectors.length===count&&receipt.captureStatus==='complete'&&receipt.packets[0].inputView==='current-static'&&receipt.packets[0].vectorPacketSha256===SPECS[key][2],'packet');
   need(JSON.stringify(packet.vectors.map(r=>r.id))===JSON.stringify(receipt.cases.filter(r=>r['current-static']).map(r=>r.id)),'packet');
   for(const row of packet.vectors){need(!pairs.has(row.id),'duplicate');const meta=receipt.cases.find(m=>m.id===row.id);need(meta&&/^[a-f0-9]{64}$/u.test(meta.sourceInputHash),'binding');pairs.set(row.id,{...row,sourceInputHash:meta.sourceInputHash});}
  }
  need(pairs.size===175,'packet');need(values.gtaFit.status==='completed'&&values.gtaFit.testEvaluated===false&&values.gtaFit.casePins.length===16,'gta');
  for(const meta of corpus.reviewedArchivedRows.filter(r=>r.reuseEligible&&r.id.startsWith('gta-'))){
   need(/^gta-(train|cal)-\d{2}$/u.test(meta.id),'path');const file=meta.id+'.json',pin=values.gtaFit.casePins.find(p=>p.file===file);need(pin,'gta');
   const row=await json([D+'hierarchy-gta-detail-fit-parser-repair-20261026/'+file,pin.bytes,pin.sha256],ledger);
   // Curation did not reopen these feature bodies: it bound the whole case
   // file. Its null input-hash field is not the observation-hash domain.
   need(meta.sourceInputHash===null&&meta.cohort==='gta-repaired-fit'&&meta.casePin.file===pin.file&&meta.casePin.bytes===pin.bytes&&meta.casePin.sha256===pin.sha256,'gta');
   need(row.id===meta.id&&row.groupId===meta.groupId&&row.split===meta.split&&row.url===meta.url&&row.evaluationStatus==='scored'&&row.captureStatus==='available'&&
    /^[a-f0-9]{64}$/u.test(row.observation.sourceInputHash)&&row.sourceVersion===row.observation.sourceInputHash&&row.modelId==='e5-small-q8-browser-main-prefix-v1','gta');
   need(!pairs.has(meta.id),'duplicate');pairs.set(meta.id,{id:meta.id,sourceInputHash:row.observation.sourceInputHash,labelCasePin:{...pin},bodyVector:row.bodyVector,titleVector:row.titleVector});
  }
  stage='projection';const projected=projectRetainedHierarchyChildRows({corpus,pairs,inputDefinition:values.inputDefinition});need(projected.rows.length===36&&projected.quarantined.length===1&&projected.unknownOmitted.length===153,'projection');
  await save('inputs.json',{schema:'retained-child-fit-inputs/v1',ledger,sourcePins,definition:values.inputDefinition,
   included:projected.rows.map(({id,groupId,split,labels,sourceVersion,labelBinding})=>({id,groupId,split,labels,labelBinding,sourceInputHash:sourceVersion})),
   unknownOmitted:projected.unknownOmitted,quarantined:projected.quarantined,unavailable:corpus.unavailableArchivedRows.map(r=>({id:r.id,reason:r.reason})),...flags});
  stage='fit';const artifacts={},handles={};for(const node of CHILD_TASKS){artifacts[node]=trainBinaryHierarchyDetail(retainedChildTrainingArguments(projected,node));handles[node]=compileBinaryHierarchyDetail(artifacts[node]);await save(node+'-artifact.json',artifacts[node]);}
  const nodes=[...values.rootModel.nodes,{id:'video-games',parentId:'games'},{id:'gta',parentId:'video-games'}],base={rootModel:values.rootModel,rootPolicy:values.rootPolicy,inputDefinition:values.inputDefinition,nodes};
  const baseline=compileRootedHierarchyMatcher({...base,detailArtifacts:[values.gtaArtifact]}),candidate=compileRootedHierarchyMatcher({...base,
   detailArtifacts:[values.gtaArtifact,...(artifacts['video-games'].eligible?[artifacts['video-games']]:[])]});
  stage='calibration-report';const rows=[];for(const row of projected.rows.filter(r=>r.split==='calibration')){
   const query={sourceId:row.id,sourceVersion:row.sourceVersion,bodyVector:row.bodyVector,titleVector:row.titleVector},before=classifyRootedHierarchyMatcher(baseline,query),after=classifyRootedHierarchyMatcher(candidate,query);
   need(JSON.stringify(before.rootPath)===JSON.stringify(after.rootPath),'root-retuned');if(before.semanticPath.at(-1)==='gta')need(JSON.stringify(before.semanticPath)===JSON.stringify(after.semanticPath),'gta-changed');
   const decisions={};for(const node of CHILD_TASKS)decisions[node]=classifyBinaryHierarchyDetail(handles[node],{
    sourceId:row.id,sourceVersion:row.sourceVersion,representation:projected.representation.representation,representationHash:projected.representation.representationHash,
    vector:row.vector,independentRootPath:before.rootPath});
   rows.push({id:row.id,labels:row.labels,expectedRootId:row.expectedRootId,rootPath:before.rootPath,before:before.semanticPath,after:after.semanticPath,
    decisions:Object.fromEntries(Object.entries(decisions).map(([node,d])=>[node,{evaluated:d.binaryEvaluated,accepted:d.detailAccepted,reason:d.reason}]))});
  }
  stage='end-pins';for(const pin of ledger)await readPinned([pin.path,pin.bytes,pin.sha256]);need(JSON.stringify(await sources())===JSON.stringify(sourcePins),'source-pin');
  const result={schema:'retained-child-development-fit/v1',status:'completed',heads:Object.fromEntries(CHILD_TASKS.map(n=>[n,{eligible:artifacts[n].eligible,reason:artifacts[n].reason,audit:artifacts[n].audit}])),
   calibration:rows,parentConditionedCalibration:Object.fromEntries(CHILD_TASKS.map(n=>[n,summarizeParentConditionedChildRows(rows,n)])),
   calibrationOnly:true,freshTestRequiredBeforeActivation:true,parentConditionedGatesNeedFreshEvidence:true,sourcePinScope:'listed JS closure; Node builtin/runtime and package resolution trusted',
   rootRetuned:false,gtaUnchanged:true,unknownOmitted:153,quarantined:projected.quarantined,endPinsChecked:true,elapsedMs:Math.round(performance.now()-started),...flags};
  const output=await save('result.json',result);return {status:'completed',heads:Object.fromEntries(CHILD_TASKS.map(n=>[n,{eligible:artifacts[n].eligible,reason:artifacts[n].reason}])),output};
 }catch(error){await save('failure.json',{status:'failed',stage,code:['path','file','pin','binding','corpus','output','packet','duplicate','gta','projection','root-retuned','gta-changed','source-pin'].includes(error?.code)?error.code:'unknown',...flags});throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length!==1||!['--source-check','--fit'].includes(args[0]))process.exitCode=2;
 else try{console.log(JSON.stringify(await(args[0]==='--source-check'?checkRetainedHierarchyChildFitSource():runRetainedHierarchyChildFit())));}catch{process.stderr.write('Retained child benchmark unavailable; preserved outputs.\n');process.exitCode=1;}
}
