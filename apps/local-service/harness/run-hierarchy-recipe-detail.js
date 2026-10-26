// Ordinary fixed dish-versus-technique development run. Import is inert.
// fit and evaluate own separate permanent directories; neither ingests or retunes roots.
import {createHash} from 'node:crypto';
import {mkdir,lstat,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPackagedCrawlerEmbedder} from '../src/crawler/packaged-e5.js';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';
import {compileHierarchyLinearHeads,scoreHierarchyLinearHeads} from '../src/domain/hierarchical-e5-paired-linear-heads.js';
import {compileHierarchyLocalEvidence,describeHierarchyLocalEvidence,scoreHierarchyLocalEvidence,classifyHierarchyLocalEvidence} from '../src/domain/hierarchical-e5-local-evidence.js';
import {fitPartialHierarchyLocalCuts} from '../src/domain/hierarchy-partial-local-calibration.js';
import {trainBinaryHierarchyDetail,compileBinaryHierarchyDetail,describeBinaryHierarchyDetail,classifyBinaryHierarchyDetail} from '../src/domain/hierarchy-binary-detail.js';
import {compilePooledRootRankPolicy,classifyPooledRootRankPolicy} from '../experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js';
import {parseVectorPacket} from '../experiments/topic-encoder/hierarchical-e5-broad-heads-v1/vector-packet.js';
import {createHierarchyPublicCapture} from './hierarchy-public-capture.js';
import {evaluateHierarchyPublicProbe} from './hierarchy-quality-evaluation.js';
import {RECIPE_TRAIN_MEMBER_GROUPS,RECIPE_TRAIN_STOP_GROUPS,RECIPE_CAL_POSITIVE_GROUPS,RECIPE_CAL_PROBES,RECIPE_TEST_PROBES,RECIPE_CORPUS_SCOPE} from './hierarchy-recipe-corpus.js';

const BASE='../experiments/topic-encoder/';
const INPUTS=Object.freeze({
 rootModel:[BASE+'hierarchical-e5-current-producer-transfer-v1/output/root-model.json','442ceb797e071f13ea4bc25df701846d2f167a7deb3e60de31711da8bdec7451'],
 rootPolicy:[BASE+'hierarchical-e5-current-producer-transfer-v1/output/root-policy.json','309afc18b29695640f4f15d8138d75ad002768f4e0b13d47df902e3d8bb6b546'],
 inputDefinition:[BASE+'hierarchical-e5-current-producer-transfer-v1/output/input-definition.json','2ec96c1244761b9688e5fea2a2dec168df1ac961aa2d440fcd42bdb085e6096c'],
 traincalVectors:[BASE+'hierarchical-e5-real-root-v3/output/traincal.current-static.vectors.json','bcdf5c846acdc469b1e4de05ad4d9069612ec50b5c81c79500d90470aa833c6a'],
 expansionVectors:[BASE+'hierarchical-e5-capacity-real-root-v1/output/training-expansion.current-static.vectors.json','86eef41ce94da614738ae3035f83f42786a55c3b44ca8576adf58d7ba11c04f0'],
 eligibility:[BASE+'hierarchical-e5-capacity-real-root-v1/output/training-eligibility.json','ef73b44936579c39ec054031f79864abb9f15c9dfce86eca0450d724341dd6cd'],
 calibrationGold:['../data/hierarchy-real-root-calibration-gold-adr136.json','8b755d8ae214de78f51005f547cb074655382cd2fb0fc0cf99b8f2e9bba76cfc'],
 traincalEncoding:[BASE+'hierarchical-e5-real-root-v3/output/encoding-traincal.json','1df069f65ebfcba7b8f67dcafe2e401718704bcb55cd7aa3396e20375a18b687'],
 expansionEncoding:[BASE+'hierarchical-e5-capacity-real-root-v1/output/encoding-training-expansion.json','789d46cb6f237c9d94f272c24d0b464ac6f35750254809e9237d12c06ac47b34'],
});
const SOURCES=Object.freeze(['./run-hierarchy-recipe-detail.js','./hierarchy-recipe-corpus.js','./hierarchy-public-capture.js','./hierarchy-public-probes.js','./hierarchy-quality-evaluation.js',
 '../src/domain/hierarchy-binary-detail.js','../src/domain/hierarchical-e5-observed-head-policy.js',
 '../src/domain/hierarchy-partial-local-calibration.js','../src/domain/hierarchical-e5-local-evidence.js','../src/domain/hierarchical-e5-paired-input.js','../src/domain/hierarchical-e5-paired-linear-heads.js',
 BASE+'hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js',BASE+'hierarchical-e5-broad-heads-v1/vector-packet.js',
 '../src/crawler/packaged-e5.js','../src/crawler/public-fetch.js','../src/crawler/robots.js','../src/crawler/static-capture.js','../src/crawler/url-policy.js',
 '../../../spikes/topic-resolution/browser/core/page-content-policy.js','../../../spikes/topic-resolution/browser/embedding/embedding-contract.js','../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json']);
const FIT=new URL('../data/hierarchy-recipe-detail-fit-20261026/',import.meta.url),EVALUATION=new URL('../data/hierarchy-recipe-detail-evaluation-20261026/',import.meta.url);
const BINARY_FIT=new URL('../data/hierarchy-recipe-detail-binary-fit-20261026/',import.meta.url);
const LOCAL_AUDIT=new URL('../data/hierarchy-recipe-local-fit-audit-20261026.json',import.meta.url),LOCAL_AUDIT_SHA='18ea01ba8b043f776b95284e5ecbed9c9f93cd9f71cb54584e163095b97dd6e7';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),digest=value=>sha(JSON.stringify(value));
const requireTrue=value=>{if(!value)throw new TypeError('Recipe detail source or data identity refused');};
const json=value=>JSON.stringify(value,(_key,item)=>typeof item==='number'&&Object.is(item,-0)?JSON.rawJSON('-0'):item)+'\n';
const flags={productionValidated:false,assignmentAuthority:false,nativeObservation:false,independentValidation:false};
async function bytes(url,max=8*1024*1024){const info=await lstat(url);requireTrue(info.isFile()&&!info.isSymbolicLink()&&info.size>0&&info.size<=max);const raw=await readFile(url);requireTrue(raw.length===info.size);return raw;}
async function save(folder,name,value){const raw=Buffer.from(json(value));requireTrue(raw.length<=8*1024*1024);await writeFile(new URL(name,folder),raw,{flag:'wx'});return {file:name,sha256:sha(raw),bytes:raw.length};}
async function pinnedOutput(folder,name,pin){requireTrue(pin?.file===name&&/^[a-f0-9]{64}$/u.test(pin.sha256));const raw=await bytes(new URL(name,folder));requireTrue(raw.length===pin.bytes&&sha(raw)===pin.sha256);return JSON.parse(raw);}
async function inputBuffers(keys=Object.keys(INPUTS)){const parsed={},pins={};for(const key of keys){const [name,expected]=INPUTS[key],raw=await bytes(new URL(name,import.meta.url));requireTrue(sha(raw)===expected);pins[key]={sha256:expected,bytes:raw.length};parsed[key]=key.endsWith('Vectors')?parseVectorPacket(raw):JSON.parse(raw);}return {parsed,pins};}
async function sourcePins(){const pins={};for(const name of SOURCES){const raw=await bytes(new URL(name,import.meta.url));pins[name]={sha256:sha(raw),bytes:raw.length};}return pins;}
async function recheckInputs(inputs){requireTrue(Object.keys(inputs).length===Object.keys(INPUTS).length);for(const [key,pin] of Object.entries(inputs)){requireTrue(Object.hasOwn(INPUTS,key)&&pin.sha256===INPUTS[key][1]);const raw=await bytes(new URL(INPUTS[key][0],import.meta.url));requireTrue(sha(raw)===pin.sha256&&raw.length===pin.bytes);}}
async function recheck(inputs,sources){await recheckInputs(inputs);for(const name of SOURCES){const raw=await bytes(new URL(name,import.meta.url)),pin=sources[name];requireTrue(pin&&raw.length===pin.bytes&&sha(raw)===pin.sha256);}requireTrue(Object.keys(sources).length===SOURCES.length);}

/** Pure editorial mapping: unknown root members remain members, never STOP.
 * The caller's annotations identify references, not source/native authority.
 */
export function buildRecipeTrainingReferences({trainingRows,rawPairs,rootNodes,inputDefinition,memberGroups,stopGroups,constructionHash}){
 requireTrue(Array.isArray(trainingRows)&&trainingRows.length>0&&trainingRows.length<=384&&Array.isArray(rawPairs)&&rawPairs.length<=512&&Array.isArray(rootNodes)&&rootNodes.length>=2&&rootNodes.length<=16);
 requireTrue(rootNodes.every(n=>n.parentId===null)&&new Set(rootNodes.map(n=>n.id)).size===rootNodes.length&&rootNodes.some(n=>n.id==='cooking'));
 const members=new Set(memberGroups),stops=new Set(stopGroups);requireTrue(members.size===memberGroups.length&&stops.size===stopGroups.length&&[...members].every(id=>!stops.has(id)));
 const pairMap=new Map(rawPairs.map(row=>[row.id,row]));requireTrue(pairMap.size===rawPairs.length);
 const adapter=compilePairedE5Input(inputDefinition),paired=describePairedE5Input(adapter),ids=new Set(),groups=new Set(),roots=new Set(rootNodes.map(n=>n.id)),found=new Set();
 const examples=trainingRows.map(row=>{
  requireTrue(typeof row.id==='string'&&typeof row.groupId==='string'&&!ids.has(row.id)&&!groups.has(row.groupId)&&roots.has(row.expectedRootId)&&/^[a-f0-9]{64}$/u.test(row.sourceInputHash));ids.add(row.id);groups.add(row.groupId);
  const raw=pairMap.get(row.id);requireTrue(raw);const fused=applyPairedE5Input(adapter,{sourceId:row.id,sourceVersion:row.sourceInputHash,bodyVector:raw.bodyVector,titleVector:raw.titleVector});requireTrue(fused.status==='available');
  const specific=members.has(row.groupId),stop=stops.has(row.groupId);if(specific||stop){requireTrue(row.expectedRootId==='cooking');found.add(row.groupId);}
  return {id:row.id,groupId:row.groupId,nodeId:specific?'recipes':row.expectedRootId,kind:stop?'stop':'member',vector:fused.vector};
 });
 requireTrue(found.size===members.size+stops.size);
 const nodes=[...rootNodes.map(n=>({...n})),{id:'recipes',parentId:'cooking'}];
 const artifact={schema:'hierarchical-e5-local-evidence/v1',representation:paired.representation,representationHash:paired.representationHash,inputConstructionHash:constructionHash,
  taxonomyVersion:'development-16-roots-plus-recipes/v1',evidenceVersion:'real-archived-train-root-prefix-and-reviewed-recipe-annotations/v1',calibrationVersion:'recipe-partial-calibration/v1',calibrationStatus:'experimental',nodes,examples,
  nodePolicies:nodes.map(n=>({nodeId:n.id,enabled:false,minSupport:2,minSimilarity:1,minNegativeMargin:2,minRivalMargin:2}))};
 compileHierarchyLocalEvidence(artifact);return artifact;
}
/** Reuse the accepted fused references without turning unknown prefixes into
 * negatives. Labels belong only to the recipe membership task. */
export function buildRecipeBinaryTrainingRows(artifact){
 compileHierarchyLocalEvidence(artifact);
 const members=new Set(RECIPE_TRAIN_MEMBER_GROUPS),stops=new Set(RECIPE_TRAIN_STOP_GROUPS),found=new Set(),ids=new Set(),groups=new Set();
 requireTrue(artifact.nodes.length===17&&artifact.nodes.filter(n=>n.parentId===null).length===16&&artifact.nodes.some(n=>n.id==='recipes'&&n.parentId==='cooking')&&artifact.examples.length===127&&members.size===4&&stops.size===2);
 const roots=new Set(artifact.nodes.filter(n=>n.parentId===null).map(n=>n.id));
 const rows=artifact.examples.map(example=>{
  requireTrue(!ids.has(example.id)&&!groups.has(example.groupId));ids.add(example.id);groups.add(example.groupId);let label=null;
  if(members.has(example.groupId)){requireTrue(example.nodeId==='recipes'&&example.kind==='member');label=true;found.add(example.groupId);}
  else if(stops.has(example.groupId)){requireTrue(example.nodeId==='cooking'&&example.kind==='stop');label=false;found.add(example.groupId);}
  else requireTrue(roots.has(example.nodeId)&&example.kind==='member');
  return {id:example.id,groupId:example.groupId,vector:example.vector,label};
 });
 requireTrue(found.size===6);return rows;
}
async function acceptedLocalFit(expectedFitSha){
 const rawAudit=await bytes(LOCAL_AUDIT);requireTrue(sha(rawAudit)===LOCAL_AUDIT_SHA);const audit=JSON.parse(rawAudit);
 requireTrue(audit.sourceCommit==='9cfaef1f'&&audit.rawPins.fitResult.sha256===expectedFitSha&&audit.casePins.length===4);
 const raw=await bytes(new URL('fit-result.json',FIT));requireTrue(sha(raw)===expectedFitSha&&raw.length===audit.rawPins.fitResult.bytes);const result=JSON.parse(raw);
 requireTrue(result.schema==='hierarchy-recipe-fit-result/v1'&&result.status==='completed'&&result.rootRetuned===false&&result.testEvaluated===false);
 for(const [key,pinName] of [['inputs','inputs'],['artifact','artifact'],['calibration','calibration']])requireTrue(result[key].sha256===audit.rawPins[pinName].sha256&&result[key].bytes===audit.rawPins[pinName].bytes);
 const inputs=await pinnedOutput(FIT,'inputs.json',result.inputs),artifact=await pinnedOutput(FIT,'artifact.json',result.artifact);await pinnedOutput(FIT,'calibration.json',result.calibration);await recheckInputs(inputs.inputPins);
 requireTrue(describeHierarchyLocalEvidence(compileHierarchyLocalEvidence(artifact)).artifactHash===result.artifactHash);
 const cases=[];for(const probe of RECIPE_CAL_PROBES){
  const matching=audit.casePins.filter(pin=>pin.id===probe.id);requireTrue(matching.length===1);const pin=matching[0],rawCase=await bytes(new URL(probe.id+'.json',FIT));requireTrue(rawCase.length===pin.bytes&&sha(rawCase)===pin.sha256);
  const row=JSON.parse(rawCase);requireTrue(row.id===probe.id&&row.url===probe.url&&row.groupId===probe.groupId&&row.recipeMember===false&&row.expectedRootId==='cooking'&&row.evaluationStatus==='scored'&&row.captureStatus==='available'&&row.modelId==='e5-small-q8-browser-main-prefix-v1'&&row.observation?.nativeObservation===false&&row.sourceVersion===row.observation.sourceInputHash);
  cases.push(row);
 }
 return {inputs,artifact,cases,binding:{acceptedLocalFitResultSha256:expectedFitSha,acceptedLocalAuditSha256:LOCAL_AUDIT_SHA,legacySourceCommit:audit.sourceCommit,
  legacySourcePins:inputs.sourcePins,legacySourceScope:'recorded-legacy-execution-source-identity',rawPins:audit.rawPins,casePins:audit.casePins}};
}
function binaryCalibrationRows(parsed,cases){
 const wanted=new Set(RECIPE_CAL_POSITIVE_GROUPS),packet=new Map(parsed.traincalVectors.vectors.map(row=>[row.id,row])),receipt=new Map(parsed.traincalEncoding.cases.map(row=>[row.id,row])),adapter=compilePairedE5Input(parsed.inputDefinition);
 const selected=parsed.calibrationGold.cases.filter(row=>wanted.has(row.entityGroup));requireTrue(selected.length===3&&wanted.size===3);
 const rows=selected.map(row=>{
  const raw=packet.get(row.id),observation=receipt.get(row.id);requireTrue(row.split==='calibration'&&row.expectedRootId==='cooking'&&raw&&observation?.['current-static']===true&&observation.sourceInputHashScope==='captured-public-input');
  const fused=applyPairedE5Input(adapter,{sourceId:row.id,sourceVersion:observation.sourceInputHash,bodyVector:raw.bodyVector,titleVector:raw.titleVector});requireTrue(fused.status==='available');
  return {id:row.id,groupId:row.entityGroup,language:row.language,vector:fused.vector,label:true};
 });
 for(const row of cases){const fused=applyPairedE5Input(adapter,{sourceId:row.id,sourceVersion:row.observation.sourceInputHash,bodyVector:row.bodyVector,titleVector:row.titleVector});requireTrue(fused.status==='available');rows.push({id:row.id,groupId:row.groupId,language:'en',vector:fused.vector,label:false});}
 requireTrue(rows.length===7);return rows;
}
function localInput(artifact,sourceId,sourceVersion,vector){return {sourceId,sourceVersion,representation:artifact.representation,representationHash:artifact.representationHash,inputConstructionHash:artifact.inputConstructionHash,vector};}
export function compileRecipeBinaryMethods(rootModel,rootPolicy,definition,binaryArtifact){
 const binary=compileBinaryHierarchyDetail(binaryArtifact),identity=describeBinaryHierarchyDetail(binary),model=compileHierarchyLinearHeads(rootModel),policy=compilePooledRootRankPolicy(rootPolicy),adapter=compilePairedE5Input(definition),paired=describePairedE5Input(adapter),modelHash=digest(rootModel),policyConstruction=rootPolicy.inputConstructionHash;
 requireTrue(identity.nodeId==='recipes'&&identity.canonicalPath.length===2&&identity.canonicalPath[0]==='cooking'&&identity.canonicalPath[1]==='recipes'&&identity.representationHash===paired.representationHash&&rootPolicy.modelHash===modelHash&&rootModel.representationHash===paired.representationHash&&rootPolicy.representationHash===paired.representationHash&&rootModel.nodes.length>=2&&rootModel.nodes.length<=16&&rootModel.nodes.every(n=>n.parentId===null)&&rootModel.heads.every(h=>h.enabled));
 requireTrue(digest(rootModel.nodes.map(n=>n.id).sort())===digest([...rootPolicy.nodeIds].sort()));
 return Object.freeze({identity,classify(q){
  const fused=applyPairedE5Input(adapter,q);let rootPath=[],rootReason='zero-paired-vector',detail={path:[],reason:'zero-paired-vector',detailAccepted:false,binaryEvaluated:false};
  if(fused.status==='available'){
   const scores=scoreHierarchyLinearHeads(model,{sourceId:q.sourceId,sourceVersion:q.sourceVersion,representation:paired.representation,representationHash:paired.representationHash,vector:fused.vector}).scores.map(({nodeId,score})=>({nodeId,score}));
   const root=classifyPooledRootRankPolicy(policy,{modelHash,representationHash:paired.representationHash,inputConstructionHash:policyConstruction,sourceId:q.sourceId,sourceVersion:q.sourceVersion,scores});rootPath=root.selectedPath;rootReason=root.reason;
   detail=classifyBinaryHierarchyDetail(binary,{sourceId:q.sourceId,sourceVersion:q.sourceVersion,representation:paired.representation,representationHash:paired.representationHash,vector:fused.vector,independentRootPath:rootPath});
  }
  const result=(path,reason)=>({status:path.length?'accepted':'abstained',rootId:path[0]??null,path,reason,productionValidated:false,assignmentAuthority:false});
  return {rootLinear:result(rootPath,rootReason),rootWithRealRecipeDetail:{...result(detail.path,detail.reason),detailAccepted:detail.detailAccepted,binaryEvaluated:detail.binaryEvaluated,syntheticDetailReferences:false,
   taskScope:'membership-not-root-taxonomy',provenance:'explicit-known-real-binary-membership-with-independent-root'},...flags};
 }});
}
function compileRecipeMethods(rootModel,rootPolicy,definition,artifact){
 const model=compileHierarchyLinearHeads(rootModel),policy=compilePooledRootRankPolicy(rootPolicy),adapter=compilePairedE5Input(definition),paired=describePairedE5Input(adapter),local=compileHierarchyLocalEvidence(artifact),modelHash=digest(rootModel);
 requireTrue(rootPolicy.modelHash===modelHash&&rootModel.nodes.length===16&&rootModel.nodes.every(n=>n.parentId===null)&&rootModel.heads.every(h=>h.enabled)&&artifact.representationHash===paired.representationHash&&rootModel.representationHash===paired.representationHash&&rootPolicy.representationHash===paired.representationHash);
 return {classify(q){const fused=applyPairedE5Input(adapter,q);let rootPath=[],rootReason='zero-paired-vector',path=[],reason='root-abstained';
  if(fused.status==='available'){
   const scores=scoreHierarchyLinearHeads(model,{sourceId:q.sourceId,sourceVersion:q.sourceVersion,representation:paired.representation,representationHash:paired.representationHash,vector:fused.vector}).scores.map(({nodeId,score})=>({nodeId,score}));
   const decision=classifyPooledRootRankPolicy(policy,{modelHash,representationHash:paired.representationHash,inputConstructionHash:rootPolicy.inputConstructionHash,sourceId:q.sourceId,sourceVersion:q.sourceVersion,scores});rootPath=decision.selectedPath;rootReason=decision.reason;path=[...rootPath];
   if(rootPath.length){reason='root-outside-recipe-branch';if(rootPath[0]==='cooking'){const detail=classifyHierarchyLocalEvidence(local,localInput(artifact,q.sourceId,q.sourceVersion,fused.vector));if(detail.selectedPath[0]==='cooking'){path=detail.selectedPath;reason=path.length>1?'same-root-real-recipe-detail':'same-root-local-coarsening';}else reason=detail.selectedPath.length?'detail-root-disagreement':'detail-abstained';}}
  }
  const result=(p,r)=>({status:p.length?'accepted':'abstained',rootId:p[0]??null,path:p,reason:r,productionValidated:false,assignmentAuthority:false});
  return {rootLinear:result(rootPath,rootReason),rootWithRealRecipeDetail:{...result(path,reason),syntheticDetailReferences:false},...flags};
 }};
}
function oldPositiveRows(parsed,artifact){
 const wanted=new Set(RECIPE_CAL_POSITIVE_GROUPS),packet=new Map(parsed.traincalVectors.vectors.map(r=>[r.id,r])),receipt=new Map(parsed.traincalEncoding.cases.map(r=>[r.id,r]));
 const adapter=compilePairedE5Input(parsed.inputDefinition),local=compileHierarchyLocalEvidence(artifact),selected=parsed.calibrationGold.cases.filter(r=>wanted.has(r.entityGroup));requireTrue(selected.length===3&&wanted.size===3);
 return selected.map(row=>{requireTrue(row.split==='calibration'&&row.expectedRootId==='cooking');const raw=packet.get(row.id),observation=receipt.get(row.id);requireTrue(raw&&observation?.['current-static']===true&&observation.sourceInputHashScope==='captured-public-input');
  const fused=applyPairedE5Input(adapter,{sourceId:row.id,sourceVersion:observation.sourceInputHash,bodyVector:raw.bodyVector,titleVector:raw.titleVector});requireTrue(fused.status==='available');
  return {id:row.id,groupId:row.entityGroup,split:'calibration',annotation:{positivePathPrefix:['cooking','recipes'],completeEndpoint:false,excludedSubtrees:[]},
   features:scoreHierarchyLocalEvidence(local,localInput(artifact,row.id,observation.sourceInputHash,fused.vector)).nodes};
 });
}
function checkCohorts(trainGroups,calGroups,probes){const seen=new Set([...trainGroups,...calGroups]);for(const probe of probes){requireTrue(probe.rootId==='cooking'&&typeof probe.recipeMember==='boolean'&&!seen.has(probe.groupId));seen.add(probe.groupId);}}
async function captures(probes,methods,folder,rows){
 const capture=createHierarchyPublicCapture({deadline:Date.now()+240000});let encoder=null,initializationMilliseconds=null,failure=null;
 try{
  for(const probe of probes){const result=await evaluateHierarchyPublicProbe({probe,capture,methods,getEmbedder:async()=>{if(!encoder){const before=performance.now();encoder=await createPackagedCrawlerEmbedder();initializationMilliseconds=performance.now()-before;}return encoder;},now:()=>performance.now()});
   rows.push({...result.row,recipeMember:probe.recipeMember});await save(folder,probe.id+'.json',rows.at(-1));if(result.fatal){failure=result.row.failureStage;break;}}
 }finally{if(encoder)try{await encoder.close();}catch{failure??='encoder-close';}}
 for(const probe of probes.slice(rows.length)){const row={id:probe.id,groupId:probe.groupId,url:probe.url,expectedRootId:'cooking',recipeMember:probe.recipeMember,captureStatus:'not-attempted',captureReason:'stopped-after-failure',evaluationStatus:'not-attempted'};rows.push(row);await save(folder,probe.id+'.json',row);}
 return {failure,initializationMilliseconds,capture:capture.snapshot()};
}

export async function runHierarchyRecipeDetail(mode,expectedFitSha){
 requireTrue(mode==='fit'&&arguments.length===1||['evaluate','fit-binary','evaluate-binary'].includes(mode)&&arguments.length===2&&typeof expectedFitSha==='string'&&/^[a-f0-9]{64}$/u.test(expectedFitSha));
 const folder=mode==='fit'?FIT:mode==='fit-binary'?BINARY_FIT:EVALUATION;await mkdir(folder);const started=performance.now(),rows=[];let stage='input-validation';
 try{
  const sources=await sourcePins();
  if(mode==='fit-binary'){
   stage='accepted-local-fit-validation';const old=await acceptedLocalFit(expectedFitSha),{parsed,pins}=await inputBuffers();
   requireTrue(digest(pins)===digest(old.inputs.inputPins)&&parsed.rootModel.nodes.length===16&&parsed.inputDefinition.bodyWeight===.75&&parsed.inputDefinition.titleWeight===.25&&old.artifact.representationHash===parsed.rootModel.representationHash);
   const trainingRows=buildRecipeBinaryTrainingRows(old.artifact),calibrationRows=binaryCalibrationRows(parsed,old.cases),trainGroups=trainingRows.map(row=>row.groupId),calGroups=calibrationRows.map(row=>row.groupId);
   const inputs=await save(folder,'inputs.json',{schema:'hierarchy-recipe-binary-fit-inputs/v1',inputPins:pins,sourcePins:sources,acceptedLocal:old.binding,trainGroups,calGroups,
    scope:RECIPE_CORPUS_SCOPE,taskScope:'membership-not-root-taxonomy',fitRequests:'none-reuse-authenticated-CAL-only-no-TEST',...flags});
   stage='binary-membership-fit';const artifact=trainBinaryHierarchyDetail({nodeId:'recipes',canonicalPath:['cooking','recipes'],representation:old.artifact.representation,representationHash:old.artifact.representationHash,
    trainingVersion:'recipe-binary-from-accepted-local-'+expectedFitSha,trainingRows,calibrationRows});
   const identity=describeBinaryHierarchyDetail(compileBinaryHierarchyDetail(artifact));requireTrue(artifact.model===null||artifact.model.lambda===.1);
   await recheck(pins,sources);requireTrue(digest((await acceptedLocalFit(expectedFitSha)).binding)===digest(old.binding));
   const savedArtifact=await save(folder,'artifact.json',artifact),audit=await save(folder,'calibration.json',{audit:artifact.audit,reason:artifact.reason,eligible:artifact.eligible,
    acceptedLocal:old.binding,rootRetuned:false,testEvaluated:false,newNetworkRequests:0,newEncoderCalls:0,taskScope:'membership-not-root-taxonomy',...flags});
   const manifest={schema:'hierarchy-recipe-binary-fit-result/v1',status:'completed',method:'binary-membership',inputs,artifact:savedArtifact,artifactPath:fileURLToPath(new URL('artifact.json',BINARY_FIT)),calibration:audit,
    artifactHash:identity.artifactHash,recipeEnabled:identity.eligible,acceptedLocalFitResultSha256:expectedFitSha,acceptedLocalAuditSha256:LOCAL_AUDIT_SHA,
    trainingKnownPositiveGroups:artifact.audit.training.positiveGroups,trainingKnownNegativeGroups:artifact.audit.training.negativeGroups,trainingUnknownGroups:artifact.audit.training.unknownGroups,
    calibrationKnownPositiveGroups:artifact.audit.calibration.positiveGroups,calibrationKnownNegativeGroups:artifact.audit.calibration.negativeGroups,
    elapsedMilliseconds:performance.now()-started,scope:RECIPE_CORPUS_SCOPE,taskScope:'membership-not-root-taxonomy',rootRetuned:false,testEvaluated:false,newNetworkRequests:0,newEncoderCalls:0,...flags};
   const saved=await save(folder,'fit-result.json',manifest);return {status:'completed',mode,recipeEnabled:manifest.recipeEnabled,fitResultSha256:saved.sha256,fitResultPath:fileURLToPath(new URL('fit-result.json',BINARY_FIT))};
  }
  if(mode==='fit'){
   const {parsed,pins}=await inputBuffers();requireTrue(parsed.eligibility.eligibleTraining.length===127&&parsed.traincalVectors.vectors.length===96&&parsed.expansionVectors.vectors.length===79&&parsed.calibrationGold.cases.length===48);
   requireTrue(parsed.inputDefinition.bodyWeight===.75&&parsed.inputDefinition.titleWeight===.25&&parsed.traincalVectors.encoderHash===parsed.inputDefinition.encoderHash&&parsed.expansionVectors.encoderHash===parsed.inputDefinition.encoderHash);
   requireTrue(parsed.traincalEncoding.captureStatus==='complete'&&parsed.expansionEncoding.captureStatus==='complete'&&parsed.expansionEncoding.eligibilityReceiptSha256===INPUTS.eligibility[1]);
   const constructionHash=digest({schema:'real-recipe-detail-reference-construction/v1',inputPins:pins,annotationSource:sources['./hierarchy-recipe-corpus.js'],provenance:'reused-archived-pruned-static-pairs-not-current-native-input'});
   const artifact=buildRecipeTrainingReferences({trainingRows:parsed.eligibility.eligibleTraining,rawPairs:[...parsed.traincalVectors.vectors,...parsed.expansionVectors.vectors],rootNodes:parsed.rootModel.nodes,inputDefinition:parsed.inputDefinition,memberGroups:RECIPE_TRAIN_MEMBER_GROUPS,stopGroups:RECIPE_TRAIN_STOP_GROUPS,constructionHash});
   const calRows=oldPositiveRows(parsed,artifact),trainGroups=artifact.examples.map(r=>r.groupId);requireTrue(artifact.nodes.length===17&&artifact.examples.length===127&&RECIPE_CAL_PROBES.length===4&&RECIPE_CAL_PROBES.every(p=>p.split==='calibration'&&!p.recipeMember));checkCohorts(trainGroups,calRows.map(r=>r.groupId),RECIPE_CAL_PROBES);
   const inputs=await save(folder,'inputs.json',{schema:'hierarchy-recipe-fit-inputs/v1',inputPins:pins,sourcePins:sources,scope:RECIPE_CORPUS_SCOPE,trainGroups,calGroups:[...calRows.map(r=>r.groupId),...RECIPE_CAL_PROBES.map(r=>r.groupId)],fitRequests:'four-fixed-CAL-only-no-TEST-content-or-vectors',...flags});
   const adapter=compilePairedE5Input(parsed.inputDefinition),local=compileHierarchyLocalEvidence(artifact);
   const featureMethods={classify(q){const fused=applyPairedE5Input(adapter,q);requireTrue(fused.status==='available');return {features:scoreHierarchyLocalEvidence(local,localInput(artifact,q.sourceId,q.sourceVersion,fused.vector)).nodes};}};
   stage='calibration-capture-encoding';const captured=await captures(RECIPE_CAL_PROBES,featureMethods,folder,rows);if(captured.failure){await save(folder,'failure.json',{mode,stage:captured.failure,rows,...captured,...flags});return {status:'failed',mode,failureStage:captured.failure};}
   for(const row of rows.filter(r=>r.evaluationStatus==='scored'))calRows.push({id:row.id,groupId:row.groupId,split:'calibration',annotation:{positivePathPrefix:['cooking'],completeEndpoint:true,excludedSubtrees:[]},features:row.methods.features});
   stage='partial-local-cut-fit';const calibration=fitPartialHierarchyLocalCuts({nodes:artifact.nodes,rows:calRows});artifact.nodePolicies=calibration.policies;
   const compiled=compileHierarchyLocalEvidence(artifact),description=describeHierarchyLocalEvidence(compiled);await recheck(pins,sources);
   const savedArtifact=await save(folder,'artifact.json',artifact),audit=await save(folder,'calibration.json',{calibration,scoredCalRows:calRows,availability:rows.map(({id,captureStatus,captureReason,evaluationStatus})=>({id,captureStatus,captureReason,evaluationStatus})),...captured,...flags});
   const manifest={schema:'hierarchy-recipe-fit-result/v1',status:'completed',inputs,artifact:savedArtifact,artifactPath:fileURLToPath(new URL('artifact.json',FIT)),calibration:audit,artifactHash:description.artifactHash,
    recipeEnabled:artifact.nodePolicies.find(p=>p.nodeId==='recipes').enabled,trainReferences:127,calPositiveGroups:3,availableCalNegativeGroups:calRows.length-3,
    elapsedMilliseconds:performance.now()-started,scope:RECIPE_CORPUS_SCOPE,rootRetuned:false,testEvaluated:false,...flags};
   const result=await save(folder,'fit-result.json',manifest);return {status:'completed',mode,recipeEnabled:manifest.recipeEnabled,fitResultSha256:result.sha256,fitResultPath:fileURLToPath(new URL('fit-result.json',FIT))};
  }
  // Root supplies the independently accepted raw fit-result hash. No fit function
  // or TRAIN/CAL row parser is called in this evaluation branch.
  const binaryMode=mode==='evaluate-binary',fitFolder=binaryMode?BINARY_FIT:FIT;
  const rawFit=await bytes(new URL('fit-result.json',fitFolder));requireTrue(sha(rawFit)===expectedFitSha);const fit=JSON.parse(rawFit);requireTrue(fit.schema===(binaryMode?'hierarchy-recipe-binary-fit-result/v1':'hierarchy-recipe-fit-result/v1')&&fit.status==='completed'&&fit.recipeEnabled===true&&fit.rootRetuned===false&&fit.testEvaluated===false);
  const inputs=await pinnedOutput(fitFolder,'inputs.json',fit.inputs);await recheck(inputs.inputPins,inputs.sourcePins);requireTrue(digest(sources)===digest(inputs.sourcePins));
  let acceptedOld=null;if(binaryMode){requireTrue(fit.acceptedLocalAuditSha256===LOCAL_AUDIT_SHA&&fit.acceptedLocalFitResultSha256===inputs.acceptedLocal.acceptedLocalFitResultSha256);acceptedOld=await acceptedLocalFit(fit.acceptedLocalFitResultSha256);requireTrue(digest(acceptedOld.binding)===digest(inputs.acceptedLocal));}
  const artifact=await pinnedOutput(fitFolder,'artifact.json',fit.artifact);await pinnedOutput(fitFolder,'calibration.json',fit.calibration);
  if(binaryMode){const identity=describeBinaryHierarchyDetail(compileBinaryHierarchyDetail(artifact));requireTrue(identity.eligible&&identity.artifactHash===fit.artifactHash&&identity.canonicalPath.length===2&&identity.canonicalPath[0]==='cooking'&&identity.canonicalPath[1]==='recipes');}
  else requireTrue(describeHierarchyLocalEvidence(compileHierarchyLocalEvidence(artifact)).artifactHash===fit.artifactHash);
  const {parsed,pins}=await inputBuffers(['rootModel','rootPolicy','inputDefinition']);checkCohorts(inputs.trainGroups,inputs.calGroups,RECIPE_TEST_PROBES);requireTrue(RECIPE_TEST_PROBES.length===6&&RECIPE_TEST_PROBES.every(p=>p.split==='test'));
  const binding=await save(folder,'inputs.json',{schema:'hierarchy-recipe-evaluation-inputs/v1',method:binaryMode?'binary-membership':'local-evidence',acceptedFitResultSha256:expectedFitSha,acceptedLocal:acceptedOld?.binding??null,artifact:fit.artifact,inputPins:pins,sourcePins:sources,scope:RECIPE_CORPUS_SCOPE,retuned:false,...flags});
  const methods=binaryMode?compileRecipeBinaryMethods(parsed.rootModel,parsed.rootPolicy,parsed.inputDefinition,artifact):compileRecipeMethods(parsed.rootModel,parsed.rootPolicy,parsed.inputDefinition,artifact);stage='test-capture-encoding-scoring';const captured=await captures(RECIPE_TEST_PROBES,methods,folder,rows);await recheck(inputs.inputPins,inputs.sourcePins);
  requireTrue(sha(await bytes(new URL('fit-result.json',fitFolder)))===expectedFitSha);await pinnedOutput(fitFolder,'artifact.json',fit.artifact);
  if(binaryMode)requireTrue(digest((await acceptedLocalFit(fit.acceptedLocalFitResultSha256)).binding)===digest(acceptedOld.binding));
  const scored=rows.filter(r=>r.evaluationStatus==='scored'),positives=scored.filter(r=>r.recipeMember),negatives=scored.filter(r=>!r.recipeMember),refined=r=>r.methods.rootWithRealRecipeDetail.path.includes('recipes');
  const result={schema:'hierarchy-recipe-evaluation-result/v1',method:binaryMode?'binary-membership':'local-evidence',taskScope:binaryMode?'membership-not-root-taxonomy':'local-evidence-development',status:captured.failure?'failed':'completed',failureStage:captured.failure,total:6,available:scored.length,unavailable:6-scored.length,
   rootAccepted:scored.filter(r=>r.methods.rootLinear.status==='accepted').length,rootCorrect:scored.filter(r=>r.methods.rootLinear.rootId==='cooking').length,rootWrong:scored.filter(r=>r.methods.rootLinear.rootId!==null&&r.methods.rootLinear.rootId!=='cooking').length,
   childPositiveTotal:RECIPE_TEST_PROBES.filter(p=>p.recipeMember).length,childPositiveAvailable:positives.length,childPositiveAccepted:positives.filter(refined).length,
   childNegativeTotal:RECIPE_TEST_PROBES.filter(p=>!p.recipeMember).length,childNegativeAvailable:negatives.length,falseChildRefinements:negatives.filter(refined).length,
   childPositiveNotRefined:positives.filter(r=>!refined(r)).length,childNegativeNotRefined:negatives.filter(r=>!refined(r)).length,
   rootAbstained:scored.filter(r=>r.methods.rootLinear.status==='abstained').length,childNotRefined:scored.filter(r=>!refined(r)).length,
   recipeEnabled:fit.recipeEnabled,inputsSha256:binding.sha256,acceptedFitResultSha256:expectedFitSha,elapsedMilliseconds:performance.now()-started,
   timingRows:rows.map(({id,captureMilliseconds,bodyMilliseconds,titleMilliseconds,matchingMilliseconds,evaluationStatus})=>({id,captureMilliseconds,bodyMilliseconds,titleMilliseconds,matchingMilliseconds,evaluationStatus})),...captured,scope:RECIPE_CORPUS_SCOPE,rootRetuned:false,...flags};
  await save(folder,'result.json',result);return {status:result.status,mode,total:6,available:result.available,childPositiveAccepted:result.childPositiveAccepted,falseChildRefinements:result.falseChildRefinements};
 }catch{await save(folder,'failure.json',{mode,stage,rows,elapsedMilliseconds:performance.now()-started,...flags});return {status:'failed',mode,failureStage:stage};}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2);
  const result=args.length===1?await runHierarchyRecipeDetail(args[0]):args.length===2?await runHierarchyRecipeDetail(args[0],args[1]):{status:'failed',failureStage:'arguments'};
  process.stdout.write(JSON.stringify(result)+'\n');if(result.status!=='completed')process.exitCode=1;
 }catch{process.stderr.write('hierarchy-recipe-detail-failed\n');process.exitCode=1;}
}
