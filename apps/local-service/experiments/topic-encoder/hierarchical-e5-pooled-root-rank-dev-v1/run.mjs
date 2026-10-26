// Explicit consumed-data DEVELOPMENT diagnostic. No training, encoder, web or DB.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile,writeFile,mkdir,statfs,realpath} from 'node:fs/promises';
import {freemem} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {compileHierarchyLinearHeads,scoreHierarchyLinearHeads} from '../../../src/domain/hierarchical-e5-paired-linear-heads.js';
import {compileHierarchyLocalEvidence,scoreHierarchyLocalEvidence} from '../../../src/domain/hierarchical-e5-local-evidence.js';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../../../src/domain/hierarchical-e5-paired-input.js';
import {rankRootScores,fitPooledRootRankPolicy,compilePooledRootRankPolicy,classifyPooledRootRankPolicy,pooledRankWorkUpperBound} from './rank-policy.js';
const here=new URL('./',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex'),digest=v=>sha(JSON.stringify(v));
const V='../hierarchical-e5-real-root-v3/',C='../hierarchical-e5-broad-heads-v1/',D='../hierarchical-e5-local-evidence-dev-v1/';
const PINS={
  [V+'output/root-model.json']:'53af460313c2798c394c82a91f00d352d0530f0fe1ea20e7bdb1781c53f608e7',
  [V+'output/traincal.current-static.vectors.json']:'bcdf5c846acdc469b1e4de05ad4d9069612ec50b5c81c79500d90470aa833c6a',
  [V+'output/test.current-static.vectors.json']:'dcf0a35689fd447bae6efb251563352a630a5cae7a2b0b10c12bfb2ad615f51c',
  [V+'output/selection.json']:'cc71a97c91852ddde488d79cb2d99f8e7f3797672dc5b3b35178fc4125472429',
  [C+'output/model.json']:'105de0a2c6b8df0aa769df8d6688f94b797845c43bc859aad76f5b5908980b72',
  [C+'output/input-definition.json']:'75d443c8186a375b8e68cdefe383e77a31ef746ae3f725d92f84ae9341b46db2',
  [D+'output/real-root-only.artifact.json']:'9b5571e714fd66eb61a97ddd7bfda6ffbec5568030bde8d7988b4652276ac5fe',
  [D+'output/descriptor.json']:'e36f122ec2f2ae8442415718d5157ccbccabcfccb6d43049657b4ba969422762'};
const cache=new Map();
async function freshBytes(name){const url=new URL(name,here),p=fileURLToPath(url),s=await lstat(url);
  assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=8*1024*1024);assert.equal(await realpath(p),p);
  const b=await readFile(url);assert.equal(b.length,s.size);return b;}
async function bytes(name){const key=new URL(name,here).href;if(!cache.has(key))cache.set(key,await freshBytes(name));return cache.get(key);}
const json=async name=>JSON.parse(await bytes(name));
const write=(name,v)=>writeFile(new URL('output/'+name,here),JSON.stringify(v)+'\n',{flag:'wx'});
async function guard(started){assert.ok(performance.now()-started<90000,'Cooperative 90s work limit');assert.ok(process.memoryUsage().rss<384*1048576,'RSS reserve');
  assert.ok(freemem()>=1024*1048576,'Physical reserve');for(const [drive,reserve]of [['C:',768],['D:',512]]){const s=await statfs(drive+'/');assert.ok(s.bavail*s.bsize>=reserve*1048576,'Drive reserve');}}
function summary(rows,outcomes){assert.equal(rows.length,outcomes.length);let assigned=0,correct=0,tied=0;const byRoot={};
  for(let i=0;i<rows.length;i++){const r=rows[i],o=outcomes[i];assert.equal(r.id,o.id);const root=o.selectedPath[0]??null;
    const count=byRoot[r.expectedRootId]??={total:0,assigned:0,correct:0,wrong:0};count.total++;if(o.tied)tied++;
    if(root!==null){assigned++;count.assigned++;if(root===r.expectedRootId){correct++;count.correct++;}else count.wrong++;}}
  return {total:rows.length,assigned,correct,wrong:assigned-correct,unresolved:rows.length-assigned,tied,byRoot,developmentOnly:true,independentValidation:false};}
export async function runPooledRankDevelopment(){
  assert.equal(process.platform,'win32');assert.match(here.pathname,/^\/D:/iu);assert.ok(process.execArgv.includes('--max-old-space-size=256'));
  const started=performance.now();await guard(started);const sourceHashes={};
  for(const [name,pin]of Object.entries(PINS)){assert.equal(sha(await bytes(name)),pin,'Pinned consumed artifact changed');sourceHashes[name]=pin;}
  // Preserve every source dependency of the closed 139 screen, including its
  // original ADR139 bytes. Mutable ADR140/status/handoff are intentionally absent.
  const oldDescriptor=await json(D+'output/descriptor.json');assert.equal(digest(oldDescriptor),'9f8a00749d8341305f8812dacc1b6c4f0471fac976f11c0e8f0e9d2805a3bb51');
  for(const [name,pin]of Object.entries(oldDescriptor.sourceHashes)){const key=D+name;assert.equal(sha(await bytes(key)),pin,'Closed screen dependency changed');sourceHashes[key]=pin;}
  for(const name of ['run.mjs','rank-policy.js','rank-policy.test.js','README.md','../../../src/domain/hierarchical-e5-paired-linear-heads.js',
    '../../../src/domain/hierarchical-e5-local-evidence.js','../../../src/domain/hierarchical-e5-paired-input.js',
    '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js'])sourceHashes[name]=sha(await bytes(name));
  const frozen=await json(V+'freeze.json'),{freezeHash,...freezeBody}=frozen;assert.equal(freezeHash,'6892118af0326115f1bc40d19db30956b319157efde7991e6128d9823b4fb92a');assert.equal(digest(freezeBody),freezeHash);
  const selected=await json(V+'output/selection.json');assert.equal(selected.receipt.inputView,'current-static');
  const primaryModel=await json(V+'output/root-model.json'),cModel=await json(C+'output/model.json'),localArtifact=await json(D+'output/real-root-only.artifact.json');
  const nodeIds=primaryModel.nodes.map(n=>{assert.equal(n.parentId,null);return n.id;}).sort();assert.equal(nodeIds.length,16);
  assert.deepEqual(cModel.nodes.filter(n=>n.parentId===null).map(n=>n.id).sort(),nodeIds);assert.deepEqual(localArtifact.nodes.map(n=>n.id).sort(),nodeIds);
  assert.ok(primaryModel.heads.every(h=>h.enabled&&h.positiveGroups===3&&h.negativeGroups===45));
  assert.ok(cModel.heads.filter(h=>nodeIds.includes(h.nodeId)).every(h=>h.enabled),'A disabled C root is not a raw-ranking comparator');
  const definition=await json(C+'output/input-definition.json'),adapter=compilePairedE5Input(definition),paired=describePairedE5Input(adapter);
  for(const m of [primaryModel,cModel,localArtifact]){assert.equal(m.representation,paired.representation);assert.equal(m.representationHash,paired.representationHash);}
  const inputConstructionHash=selected.receipt.inputConstructionHash;
  const allCases=frozen.manifestIdentity.cases,calCases=allCases.filter(r=>r.split==='calibration'),diagnosticCases=allCases.filter(r=>r.split==='test');
  assert.equal(allCases.filter(r=>r.split==='training').length,48);assert.equal(calCases.length,48);assert.equal(diagnosticCases.length,32);
  const groupIds=[...calCases,...diagnosticCases].map(r=>r.entityGroup);assert.equal(new Set(groupIds).size,80);
  for(const r of calCases){assert.ok(!primaryModel.trainingIdHashes.includes(sha(r.id)));assert.ok(!primaryModel.trainingGroupHashes.includes(sha(r.entityGroup)));}
  const coordinateProductUpperBound=80*16*384+32*63*384+32*48*384;
  const rankWorkUpperBound=pooledRankWorkUpperBound(48,16)+(80*2+32*2)*16*4;
  assert.ok(coordinateProductUpperBound<=5000000);assert.ok(rankWorkUpperBound<=1000000);assert.equal(localArtifact.examples.length,48);assert.equal(cModel.nodes.length,63);
  const descriptor={schema:'pooled-root-rank-development-screen/v1',sourceHashes,primary:'immutable-v3-16-root-affine-heads',
    diagnostics:['immutable-C-root-heads-raw-top1','immutable-139-real-root-local-best-positive-raw-top1'],inputView:'current-static',
    representationHash:paired.representationHash,inputConstructionHash,calibrationRows:48,consumedDiagnosticRows:32,
    minimumAcceptedGroups:20,targetCalibrationErrors:0,selection:'maximum-CAL-accepted-then-higher-gap-then-higher-score',
    cuts:'observed-unique-winner-score-and-gap-inclusive-score-tie-groups',newTraining:false,newHoldout:false,
    rankWorkUpperBound,coordinateProductUpperBound,maximumRankWork:1000000,maximumCoordinateProducts:5000000,
    resourceGuard:'cooperative90s-RSS384MiB-physical1GiB-C768MiB-D512MiB-heap256MiB-not-external-hard-termination',
    perClassPrecisionGuaranteed:false,productionValidated:false,assignmentAuthority:false};
  const descriptorHash=digest(descriptor);await guard(started);
  await mkdir(new URL('output/',here));assert.ok(!(await lstat(new URL('output/',here))).isSymbolicLink());
  await write('started.json',{descriptorHash,noAutomaticRepeat:true});await write('descriptor.json',descriptor);
  // All parses below use exactly the initial hashed bytes, not a re-opened file.
  const traincalPacket=await json(V+'output/traincal.current-static.vectors.json'),diagnosticPacket=await json(V+'output/test.current-static.vectors.json');
  assert.equal(traincalPacket.vectors.length,96);assert.equal(diagnosticPacket.vectors.length,32);
  const packetMap=packet=>{const map=new Map();for(const r of packet.vectors){assert.ok(!map.has(r.id));map.set(r.id,r);}return map;};
  const traincalMap=packetMap(traincalPacket),diagnosticMap=packetMap(diagnosticPacket);
  const primary=compileHierarchyLinearHeads(primaryModel),c=compileHierarchyLinearHeads(cModel),local=compileHierarchyLocalEvidence(localArtifact);
  const totals={primaryCoordinateProducts:0,cCoordinateProducts:0,localCoordinateProducts:0,localCountedUnits:0,rankComparisons:0,fusionRows:0,
    coordinateProductScope:'exact model/exemplar dot-product coordinate multiplications only; query norms, input validation and fusion excluded',
    rankWorkScope:'charged rank/cut-search units; input validation/canonicalization and fusion excluded',
    fusionScope:'separately counted rows; existing adapter validates two384D inputs and constructs normalized384D output'};
  function fuse(row,map){const r=map.get(row.id);assert.ok(r);const out=applyPairedE5Input(adapter,{sourceId:row.id,sourceVersion:descriptorHash,bodyVector:r.bodyVector,titleVector:r.titleVector});
    assert.equal(out.status,'available');totals.fusionRows++;return out.vector;}
  const affineWitness=(row,vector)=>({sourceId:row.id,sourceVersion:descriptorHash,representation:paired.representation,representationHash:paired.representationHash,vector});
  const calRows=[],calRanks=[];
  for(const row of calCases){await guard(started);const vector=fuse(row,traincalMap),raw=scoreHierarchyLinearHeads(primary,affineWitness(row,vector));totals.primaryCoordinateProducts+=raw.work.scalarProducts;
    const scores=raw.scores.map(({nodeId,score})=>({nodeId,score})),r=rankRootScores({nodeIds,scores});totals.rankComparisons+=r.comparisonWork;
    calRows.push({id:row.id,groupId:row.entityGroup,expectedRootId:row.expectedRootId,scores});calRanks.push({id:row.id,selectedPath:r.winnerId?[r.winnerId]:[],...r});}
  const policy=fitPooledRootRankPolicy({modelHash:PINS[V+'output/root-model.json'],representationHash:paired.representationHash,inputConstructionHash,nodeIds,rows:calRows});
  const policyHandle=compilePooledRootRankPolicy(policy),calAccepted=calRows.map(row=>({id:row.id,...classifyPooledRootRankPolicy(policyHandle,
    {modelHash:PINS[V+'output/root-model.json'],representationHash:paired.representationHash,inputConstructionHash,sourceId:row.id,sourceVersion:descriptorHash,scores:row.scores})}));
  totals.rankComparisons+=calAccepted.reduce((sum,r)=>sum+r.comparisonWork,0);
  const outcomes=[];
  for(const row of diagnosticCases){await guard(started);const vector=fuse(row,diagnosticMap),w=affineWitness(row,vector),raw=scoreHierarchyLinearHeads(primary,w);totals.primaryCoordinateProducts+=raw.work.scalarProducts;
    const primaryScores=raw.scores.map(({nodeId,score})=>({nodeId,score})),primaryRank=rankRootScores({nodeIds,scores:primaryScores});
    const accepted=classifyPooledRootRankPolicy(policyHandle,{modelHash:PINS[V+'output/root-model.json'],representationHash:paired.representationHash,inputConstructionHash,sourceId:row.id,sourceVersion:descriptorHash,scores:primaryScores});
    const cRaw=scoreHierarchyLinearHeads(c,w);totals.cCoordinateProducts+=cRaw.work.scalarProducts;
    const cScores=cRaw.scores.filter(s=>nodeIds.includes(s.nodeId)).map(({nodeId,score})=>({nodeId,score})),cRank=rankRootScores({nodeIds,scores:cScores});
    const localRaw=scoreHierarchyLocalEvidence(local,{...w,inputConstructionHash:localArtifact.inputConstructionHash});totals.localCoordinateProducts+=localRaw.work.coordinateProducts;totals.localCountedUnits+=localRaw.work.countedUnits;
    const localScores=localRaw.nodes.map(n=>{assert.notEqual(n.bestSimilarity,null);return {nodeId:n.nodeId,score:n.bestSimilarity};}),localRank=rankRootScores({nodeIds,scores:localScores});
    totals.rankComparisons+=primaryRank.comparisonWork+accepted.comparisonWork+cRank.comparisonWork+localRank.comparisonWork;
    outcomes.push({id:row.id,expectedRootId:row.expectedRootId,language:row.language,
      primaryRaw:{id:row.id,selectedPath:primaryRank.winnerId?[primaryRank.winnerId]:[],...primaryRank},primaryPooled:{id:row.id,...accepted},
      cRaw:{id:row.id,selectedPath:cRank.winnerId?[cRank.winnerId]:[],...cRank},localRaw:{id:row.id,selectedPath:localRank.winnerId?[localRank.winnerId]:[],...localRank},
      rootScores:{primary:primaryScores,c:cScores,local:localScores}});
  }
  const countedCoordinateProducts=totals.primaryCoordinateProducts+totals.cCoordinateProducts+totals.localCoordinateProducts;
  assert.ok(countedCoordinateProducts<=coordinateProductUpperBound);assert.ok(totals.rankComparisons+policy.work.countedUnits<1000000);
  await guard(started);for(const [name,pin]of Object.entries(sourceHashes))assert.equal(sha(await freshBytes(name)),pin,'Input/source drift during development screen');await guard(started);
  const report={descriptorHash,policy,calibration:{raw:summary(calCases,calRanks),pooled:summary(calCases,calAccepted),
      scoreRows:calRows,rawRankOutcomes:calRanks,pooledOutcomes:calAccepted},
    diagnostic:{primaryRaw:summary(diagnosticCases,outcomes.map(o=>o.primaryRaw)),primaryPooled:summary(diagnosticCases,outcomes.map(o=>o.primaryPooled)),
      cRaw:summary(diagnosticCases,outcomes.map(o=>o.cRaw)),localRaw:summary(diagnosticCases,outcomes.map(o=>o.localRaw))},outcomes,
    work:{...totals,countedCoordinateProducts,rankAndFitWork:totals.rankComparisons+policy.work.countedUnits},elapsedMs:performance.now()-started,finalRssBytes:process.memoryUsage().rss,
    developmentOnly:true,newHoldout:false,thresholdsSelectedUsingDiagnostic:false,perClassPrecisionGuaranteed:false,productionValidated:false,assignmentAuthority:false,
    trainingCalls:0,encoderCalls:0,modelDownloads:0,pageFetches:0,ownerDataRead:false,canonicalWrites:false,crawlerActions:0};
  await write('policy.json',policy);await write('results.json',report);return {descriptorHash,resultHash:digest(report),diagnostic:report.diagnostic,developmentOnly:true};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  if(process.argv.length===2)console.log('No action. Explicit --development-screen; consumed data only.');
  else if(process.argv.length===3&&process.argv[2]==='--development-screen')console.log(JSON.stringify(await runPooledRankDevelopment()));
  else throw Error('Unknown fixed development operation');
}
