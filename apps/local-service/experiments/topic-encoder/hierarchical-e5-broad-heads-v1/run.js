// One-shot authored-synthetic experiment only. No owner DB, network or provider.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {serializeVectorPacket,parseVectorPacket,VECTOR_PACKET_SCHEMA,MAX_VECTOR_PACKET_BYTES} from './vector-packet.js';
import {trainHierarchyLinearHeads,compileHierarchyLinearHeads} from '../../../src/domain/hierarchical-e5-paired-linear-heads.js';
import {HEAD_POLICY_GRID,calibrateHierarchyHeadPolicy,compileHierarchyHeadAssignment} from '../../../src/domain/hierarchical-e5-paired-head-policy.js';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../../../src/domain/hierarchical-e5-paired-input.js';
import {createPackagedCrawlerEmbedder} from '../../../src/crawler/packaged-e5.js';
import {MODEL_ID,MODEL_SHA256} from '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

const here=new URL('./',import.meta.url),sha=value=>createHash('sha256').update(value).digest('hex'),jsonHash=value=>sha(JSON.stringify(value));
const CONTRACT='../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';
const ASSET_MANIFEST='../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json';
const externalSources=['../../../src/domain/hierarchical-e5-paired-linear-heads.js','../../../src/domain/hierarchical-e5-paired-head-policy.js',
  '../../../src/domain/hierarchical-e5-paired-input.js','../../../src/crawler/packaged-e5.js',CONTRACT,ASSET_MANIFEST,
  '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js','../hierarchical-e5-paired-v1/taxonomy.js'];
const modes=['freeze','encode','fit','calibrate','test'];
const phaseResults={freeze:'freeze.json',encode:'output/encoding.json',fit:'output/fit.json',calibrate:'output/calibration.json',test:'measured-results.json'};
async function bytes(name,maximum=8*1024*1024){
  const url=new URL(name,here),stat=await lstat(url);
  assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=maximum,'Bounded experiment file unavailable');
  const value=await readFile(url);assert.equal(value.length,stat.size);return value;
}
const read=async(name,max)=>JSON.parse(await bytes(name,max));
const write=(name,value)=>writeFile(new URL(name,here),JSON.stringify(value)+'\n',{flag:'wx'});
async function absent(names){for(const name of names){
  try{await lstat(new URL(name,here));}catch(error){if(error.code==='ENOENT')continue;throw error;}
  throw Error('Existing experiment evidence forbids repeat');
}}
async function outputDirectory(){
  await mkdir(new URL('output/',here),{recursive:true});const stat=await lstat(new URL('output/',here));
  assert.ok(stat.isDirectory()&&!stat.isSymbolicLink(),'Unsafe experiment output directory');
}
async function claim(mode){
  assert.equal(process.env.MURMINGLE_BROAD_HEADS_SUPERVISED,mode,'Use the checked resource supervisor');
  await outputDirectory();
  await absent([`output/${mode}.started.json`,phaseResults[mode]]);
  await write(`output/${mode}.started.json`,{mode,noAutomaticRepeat:true,syntheticOnly:true});
}
async function corpus(){
  const [{CORPUS},{TAXONOMY}]=await Promise.all([import('./corpus.js'),import('./taxonomy.js')]);
  return {CORPUS,TAXONOMY};
}
function checkedProtocol(p){
  assert.equal(typeof p.schema,'string');assert.ok(p.schema.length>0&&p.schema.length<=160);
  assert.deepEqual(p.expectedSplits,{training:130,development:67,calibration:193,test:67});
  assert.equal(p.maximumRows,457);assert.deepEqual(p.bodyWeights,[.75,.5,.25]);assert.deepEqual(p.lambdas,[.01,.1,1]);
  assert.equal(p.maximumSearchModels,9);assert.equal(p.maximumAggregateCountedTrainingWork,128000000);
  assert.deepEqual(p.policyGrid,HEAD_POLICY_GRID);
  assert.deepEqual(p.calibration,{split:'calibration',minimumAcceptedGroups:3,targetPrecision:1});
  assert.equal(p.representationIdentity,'sha256-json of {modelSha256,embeddingContractSha256,assetManifestSha256}');
  return p;
}
async function descriptor(){
  const protocol=checkedProtocol(await read('protocol.json')),{CORPUS,TAXONOMY}=await corpus();
  assert.equal(CORPUS.length,protocol.maximumRows);assert.equal(TAXONOMY.nodes.length,63);
  const ids=new Set(),groups=new Set(),nodes=new Set(TAXONOMY.nodes.map(n=>n.id));
  for(const [split,count] of Object.entries(protocol.expectedSplits))assert.equal(CORPUS.filter(r=>r.split===split).length,count);
  for(const row of CORPUS){
    assert.equal(row.provenance,'synthetic-authored');assert.ok(typeof row.title==='string'&&row.title.length>0&&row.title.length<=512);
    assert.ok(typeof row.body==='string'&&row.body.length>0&&row.body.length<=4096);
    for(const key of ['id','groupId','language'])assert.ok(typeof row[key]==='string'&&row[key].length>0&&row[key].length<=160);
    assert.ok(!ids.has(row.id)&&!groups.has(row.groupId));ids.add(row.id);groups.add(row.groupId);
    assert.ok(row.expectedTopicId===null||nodes.has(row.expectedTopicId));assert.ok(Object.hasOwn(protocol.expectedSplits,row.split));
  }
  // Include every local executable source, all corpus*.js split files and both taxonomy sources.
  const local=(await readdir(here)).filter(name=>/\.(?:js|py)$/u.test(name)||name==='protocol.json').sort();
  for(const required of ['run.js','supervise.py','assessment.js','vector-packet.js','corpus.js','taxonomy.js','protocol.json'])assert.ok(local.includes(required));
  const sourceHashes={};for(const source of [...local,...externalSources])sourceHashes[source]=sha(await bytes(source));
  const encoderHash=jsonHash({modelSha256:MODEL_SHA256,embeddingContractSha256:sourceHashes[CONTRACT],assetManifestSha256:sourceHashes[ASSET_MANIFEST]});
  const body={schema:protocol.schema,protocol,sourceHashes,corpusHash:jsonHash(CORPUS),taxonomyHash:jsonHash(TAXONOMY),
    modelId:MODEL_ID,modelSha256:MODEL_SHA256,encoderHash,rows:CORPUS.length};
  return {...body,freezeHash:jsonHash(body)};
}
async function verified(){const frozen=await read('freeze.json');assert.deepEqual(await descriptor(),frozen,'Frozen experiment source changed');return frozen;}
async function unchanged(frozen){assert.deepEqual(await descriptor(),frozen,'Experiment source changed during phase');}
function inputDefinition(frozen,bodyWeight){return {bodyWeight,titleWeight:1-bodyWeight,encoderHash:frozen.encoderHash};}
function adapterFor(frozen,definition){
  assert.ok(frozen.protocol.bodyWeights.includes(definition.bodyWeight));assert.deepEqual(definition,inputDefinition(frozen,definition.bodyWeight));
  return compilePairedE5Input(definition);
}
async function encode(frozen){
  await absent(['output/vectors.json']);const {CORPUS}=await corpus();
  const cold=performance.now(),encoder=await createPackagedCrawlerEmbedder(),initializationMs=performance.now()-cold;
  const vectors=[],loop=performance.now();let encoderCalls=0;
  try{for(const row of CORPUS){
    const body=await encoder.embed(row.body),title=await encoder.embed(row.title);encoderCalls+=2;
    assert.equal(body.modelId,MODEL_ID);assert.equal(title.modelId,MODEL_ID);
    vectors.push({id:row.id,bodyVector:body.values,titleVector:title.values});
    if(vectors.length%64===0)process.stdout.write(JSON.stringify({stage:'encoding',rows:vectors.length})+'\n');
  }}finally{await encoder.close();}
  const encodingLoopMs=performance.now()-loop,coldElapsedMs=performance.now()-cold;
  const packet={schema:VECTOR_PACKET_SCHEMA,freezeHash:frozen.freezeHash,encoderHash:frozen.encoderHash,vectors};
  const packetBytes=serializeVectorPacket(packet);await unchanged(frozen);
  await writeFile(new URL('output/vectors.json',here),packetBytes,{flag:'wx'});
  await write('output/encoding.json',{freezeHash:frozen.freezeHash,vectorPacketSha256:sha(packetBytes),rows:vectors.length,encoderCalls,
    vectorScope:'authored-synthetic-raw-e5-body-and-title-separate',initializationMs,encodingLoopMs,coldElapsedMs});
}
async function packetFor(frozen){
  const encoding=await read('output/encoding.json'),packetBytes=await bytes('output/vectors.json',MAX_VECTOR_PACKET_BYTES);
  assert.equal(encoding.freezeHash,frozen.freezeHash);assert.equal(encoding.rows,frozen.rows);assert.equal(encoding.encoderCalls,frozen.rows*2);
  assert.equal(sha(packetBytes),encoding.vectorPacketSha256);
  const packet=parseVectorPacket(packetBytes);assert.equal(packet.freezeHash,frozen.freezeHash);assert.equal(packet.encoderHash,frozen.encoderHash);
  const {CORPUS}=await corpus();assert.equal(packet.vectors.length,CORPUS.length);
  const index=new Map(packet.vectors.map(r=>[r.id,r]));assert.ok(CORPUS.every(row=>index.has(row.id)));
  return {packet,index,encoding};
}
async function samples(index,adapter,split){
  const {CORPUS}=await corpus();return CORPUS.filter(row=>row.split===split).map(row=>{
    const r=index.get(row.id),fused=applyPairedE5Input(adapter,{sourceId:row.id,sourceVersion:split,bodyVector:r.bodyVector,titleVector:r.titleVector});
    assert.equal(fused.status,'available','Unavailable synthetic fusion is not a label fallback');
    return {id:row.id,groupId:row.groupId,split,language:row.language,expectedTopicId:row.expectedTopicId,vector:fused.vector};
  });
}
// Upper bound on explicitly charged trainer arithmetic, NOT total CPU or encoding.
export function maximumTrainingWork(n,nodeCount){
  assert.ok(Number.isInteger(n)&&n>0&&n<=384&&Number.isInteger(nodeCount)&&nodeCount>0&&nodeCount<=128);
  const d=384;return 4*n*d+d+d*n*(n+1)/2+n+n*(n+1)*(n+2)/6+
    nodeCount*(n*9+n*(n-1)+4*n+n*d+d+2);
}
async function fit(frozen){
  await absent(['output/model.json','output/input-definition.json']);
  const protocol=frozen.protocol,{TAXONOMY,CORPUS}=await corpus();
  const bound=maximumTrainingWork(protocol.expectedSplits.training,TAXONOMY.nodes.length);
  assert.ok(bound<=100000000&&bound*protocol.maximumSearchModels<=protocol.maximumAggregateCountedTrainingWork,'Training preflight capacity');
  const {index,encoding}=await packetFor(frozen),{balancedDevelopmentLoss}=await import('./assessment.js'),candidates=[];
  let aggregateWork=0;
  for(const bodyWeight of protocol.bodyWeights){
    const definition=inputDefinition(frozen,bodyWeight),adapter=adapterFor(frozen,definition),identity=describePairedE5Input(adapter);
    const training=(await samples(index,adapter,'training')).map(({language,...row})=>row),development=await samples(index,adapter,'development');
    for(const lambda of protocol.lambdas){
      const started=performance.now(),model=trainHierarchyLinearHeads({nodes:TAXONOMY.nodes.map(({id,parentId})=>({id,parentId})),
        rows:training,representation:identity.representation,representationHash:identity.representationHash,trainingVersion:frozen.freezeHash,lambda});
      const trainingElapsedMs=performance.now()-started;assert.ok(model.trainingWork.units<=bound);aggregateWork+=model.trainingWork.units;
      assert.ok(aggregateWork<=protocol.maximumAggregateCountedTrainingWork);
      const assessmentStarted=performance.now(),developmentLoss=balancedDevelopmentLoss(model,development);
      assert.ok(Number.isFinite(developmentLoss.loss));
      candidates.push({model,definition,trainingElapsedMs,developmentElapsedMs:performance.now()-assessmentStarted,development:developmentLoss,priorOrder:candidates.length});
    }
  }
  assert.equal(candidates.length,protocol.maximumSearchModels);
  const selected=[...candidates].sort((a,b)=>a.development.loss-b.development.loss||a.priorOrder-b.priorOrder)[0];
  compileHierarchyLinearHeads(selected.model);await unchanged(frozen);
  await write('output/model.json',selected.model);await write('output/input-definition.json',selected.definition);
  const development=CORPUS.filter(row=>row.split==='development');
  await write('output/fit.json',{schema:frozen.schema,freezeHash:frozen.freezeHash,selection:'development-only',
    modelSha256:sha(await bytes('output/model.json')),inputDefinitionSha256:sha(await bytes('output/input-definition.json')),
    selectedBodyWeight:selected.definition.bodyWeight,selectedLambda:selected.model.lambda,
    developmentIdHashes:development.map(r=>sha(r.id)).sort(),developmentGroupHashes:development.map(r=>sha(r.groupId)).sort(),
    candidates:candidates.map(c=>({bodyWeight:c.definition.bodyWeight,lambda:c.model.lambda,priorOrder:c.priorOrder,
      trainingWork:c.model.trainingWork,trainingElapsedMs:c.trainingElapsedMs,developmentElapsedMs:c.developmentElapsedMs,development:c.development})),
    aggregateCountedTrainingWork:aggregateWork,preflightTrainingWorkUpperBound:bound*protocol.maximumSearchModels,
    timingExcludesEncoding:true,encoding,calibrationUsed:false,finalTestEvaluated:false,productionReady:false});
}
async function selectedFor(frozen){
  const fit=await read('output/fit.json'),modelBytes=await bytes('output/model.json'),definitionBytes=await bytes('output/input-definition.json');
  assert.equal(fit.freezeHash,frozen.freezeHash);assert.equal(fit.selection,'development-only');assert.equal(fit.calibrationUsed,false);assert.equal(fit.finalTestEvaluated,false);
  assert.equal(sha(modelBytes),fit.modelSha256);assert.equal(sha(definitionBytes),fit.inputDefinitionSha256);
  const model=JSON.parse(modelBytes),definition=JSON.parse(definitionBytes),adapter=adapterFor(frozen,definition),identity=describePairedE5Input(adapter);
  compileHierarchyLinearHeads(model);assert.equal(model.trainingVersion,frozen.freezeHash);
  assert.equal(model.representation,identity.representation);assert.equal(model.representationHash,identity.representationHash);
  assert.equal(definition.bodyWeight,fit.selectedBodyWeight);assert.equal(model.lambda,fit.selectedLambda);
  return {fit,model,definition,adapter};
}
async function calibrate(frozen){
  await absent(['output/policy.json']);const selected=await selectedFor(frozen),{index}=await packetFor(frozen),started=performance.now();
  const policy=calibrateHierarchyHeadPolicy({model:selected.model,rows:await samples(index,selected.adapter,'calibration'),
    minimumAcceptedGroups:frozen.protocol.calibration.minimumAcceptedGroups,targetPrecision:frozen.protocol.calibration.targetPrecision});
  compileHierarchyHeadAssignment({model:selected.model,policy});const calibrationElapsedMs=performance.now()-started;
  await unchanged(frozen);await write('output/policy.json',policy);
  await write('output/calibration.json',{schema:frozen.schema,freezeHash:frozen.freezeHash,fitSha256:sha(await bytes('output/fit.json')),
    modelSha256:selected.fit.modelSha256,inputDefinitionSha256:selected.fit.inputDefinitionSha256,
    policySha256:sha(await bytes('output/policy.json')),calibrationElapsedMs,timingExcludesEncoding:true,
    split:'calibration',testUsed:false,finalTestEvaluated:false,productionReady:false});
}
async function finalTest(frozen){
  const selected=await selectedFor(frozen),calibration=await read('output/calibration.json'),policyBytes=await bytes('output/policy.json');
  assert.equal(calibration.freezeHash,frozen.freezeHash);assert.equal(calibration.fitSha256,sha(await bytes('output/fit.json')));
  assert.equal(calibration.modelSha256,selected.fit.modelSha256);assert.equal(calibration.inputDefinitionSha256,selected.fit.inputDefinitionSha256);
  assert.equal(calibration.policySha256,sha(policyBytes));assert.equal(calibration.finalTestEvaluated,false);assert.equal(calibration.testUsed,false);
  const policy=JSON.parse(policyBytes);compileHierarchyHeadAssignment({model:selected.model,policy});
  const {index,encoding}=await packetFor(frozen),{evaluateFrozenHeads}=await import('./assessment.js'),started=performance.now();
  const test=evaluateFrozenHeads({model:selected.model,policy,rows:await samples(index,selected.adapter,'test'),
    developmentIdHashes:selected.fit.developmentIdHashes,developmentGroupHashes:selected.fit.developmentGroupHashes});
  const fusionAndEvaluationElapsedMs=performance.now()-started;await unchanged(frozen);
  await write('measured-results.json',{schema:frozen.schema,freezeHash:frozen.freezeHash,vectorPacketSha256:encoding.vectorPacketSha256,
    selectedModelSha256:selected.fit.modelSha256,selectedInputDefinitionSha256:selected.fit.inputDefinitionSha256,
    selectedPolicySha256:calibration.policySha256,selection:{bodyWeight:selected.definition.bodyWeight,lambda:selected.model.lambda,
      basedOn:'synthetic-development-only',calibrationSplit:'separate-calibration',testRetuning:false},
    fit:selected.fit,calibration,test,fusionAndEvaluationElapsedMs,timingExcludesEncoding:true,
    corpus:{rows:frozen.rows,provenance:'new-authored-synthetic-feasibility',realWebQualityClaim:false},
    productionReady:false,assignmentAuthority:false,ownerDataRead:false,providerCalls:0,canonicalWrites:0,crawlerActions:0});
}
export async function runCli(args){
  if(!args.length){process.stdout.write('No action. Explicit supervised --freeze/--encode/--fit/--calibrate/--test only.\n');return 'inert';}
  assert.ok(args.length===1&&/^--/u.test(args[0])&&modes.includes(args[0].slice(2)),'Invalid experiment phase');
  const mode=args[0].slice(2);assert.equal(process.env.MURMINGLE_BROAD_HEADS_SUPERVISED,mode,'Use the checked resource supervisor');
  await claim(mode);
  if(mode==='freeze')await write('freeze.json',await descriptor());
  else{const frozen=await verified();if(mode==='encode')await encode(frozen);else if(mode==='fit')await fit(frozen);
    else if(mode==='calibrate')await calibrate(frozen);else await finalTest(frozen);}
  process.stdout.write(JSON.stringify({stage:mode+'-complete',productionReady:false,assignmentAuthority:false})+'\n');return mode;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runCli(process.argv.slice(2));
