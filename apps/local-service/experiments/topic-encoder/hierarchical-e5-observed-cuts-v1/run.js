// Fresh authored calibration/test only, reusing CLOSED C weights unchanged.
// No training, owner pages, network, provider, canonical write or activation.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {serializeVectorPacket,parseVectorPacket,VECTOR_PACKET_SCHEMA,MAX_VECTOR_PACKET_BYTES} from '../hierarchical-e5-broad-heads-v1/vector-packet.js';
import {compileHierarchyHeadAssignment as compileBaseline} from '../../../src/domain/hierarchical-e5-paired-head-policy.js';
import {calibrateHierarchyHeadPolicy,compileHierarchyHeadAssignment,observedHeadPolicyWorkUpperBound,OBSERVED_HEAD_POLICY_LIMITS} from '../../../src/domain/hierarchical-e5-observed-head-policy.js';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../../../src/domain/hierarchical-e5-paired-input.js';
import {createPackagedCrawlerEmbedder} from '../../../src/crawler/packaged-e5.js';
import {MODEL_ID,MODEL_SHA256} from '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

const here=new URL('./',import.meta.url),sha=value=>createHash('sha256').update(value).digest('hex'),jsonHash=value=>sha(JSON.stringify(value));
const C='../hierarchical-e5-broad-heads-v1/';
const CONTRACT='../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';
const ASSET_MANIFEST='../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json';
const sources=[C+'assessment.js',C+'vector-packet.js',C+'taxonomy.js','../hierarchical-e5-paired-v1/taxonomy.js',
  C+'freeze.json',C+'output/model.json',C+'output/policy.json',C+'output/input-definition.json',C+'output/fit.json',
  '../../../src/domain/hierarchical-e5-paired-linear-heads.js','../../../src/domain/hierarchical-e5-paired-head-policy.js',
  '../../../src/domain/hierarchical-e5-observed-head-policy.js','../../../src/domain/hierarchical-e5-paired-input.js',
  '../../../src/crawler/packaged-e5.js',CONTRACT,ASSET_MANIFEST,'../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js'];
const phaseResults={freeze:'freeze.json',encode:'output/encoding.json',calibrate:'output/calibration.json',test:'measured-results.json'};
async function bytes(name,maximum=8*1024*1024){
  const url=new URL(name,here),stat=await lstat(url);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=maximum,'Bounded experiment file unavailable');
  const value=await readFile(url);assert.equal(value.length,stat.size);return value;
}
const read=async(name,max)=>JSON.parse(await bytes(name,max));
const write=(name,value)=>writeFile(new URL(name,here),JSON.stringify(value)+'\n',{flag:'wx'});
async function absent(names){for(const name of names){try{await lstat(new URL(name,here));}catch(error){if(error.code==='ENOENT')continue;throw error;}throw Error('Existing evidence prohibits replay');}}
async function claim(mode){
  assert.equal(process.env.MURMINGLE_OBSERVED_CUTS_SUPERVISED,mode,'Use the checked resource supervisor');
  await mkdir(new URL('output/',here),{recursive:true});const stat=await lstat(new URL('output/',here));assert.ok(stat.isDirectory()&&!stat.isSymbolicLink());
  await absent([`output/${mode}.started.json`,phaseResults[mode]]);await write(`output/${mode}.started.json`,{mode,noAutomaticRepeat:true,syntheticOnly:true});
}
async function cohort(){const [{CORPUS},{TAXONOMY}]=await Promise.all([import('./corpus.js'),import(C+'taxonomy.js')]);return {CORPUS,TAXONOMY};}
function protocol(value){
  assert.ok(typeof value.schema==='string'&&value.schema.length>0&&value.schema.length<=160);
  assert.deepEqual(value.expectedSplits,{calibration:205,test:142});assert.equal(value.maximumRows,347);
  assert.deepEqual(value.calibration,{split:'calibration',minimumAcceptedGroups:3,targetPrecision:1});
  assert.equal(value.maximumCountedCalibrationWork,OBSERVED_HEAD_POLICY_LIMITS.maxCalibrationWork);
  assert.equal(value.baseline.freezeHash,'7bf0ee5450ed3cf9768f08c678589767fa7277542a88aa8652f7bd6324ab91fb');
  for(const key of ['freezeSha256','modelSha256','policySha256','inputDefinitionSha256'])assert.match(value.baseline[key],/^[a-f0-9]{64}$/u);
  assert.equal(value.minimumUsefulCoverage,.6);assert.equal(value.minimumSpecificCoverage,.3);return value;
}
async function baseline(p){
  const f=await bytes(C+'freeze.json'),m=await bytes(C+'output/model.json'),policy=await bytes(C+'output/policy.json'),i=await bytes(C+'output/input-definition.json');
  for(const [value,key]of [[f,'freezeSha256'],[m,'modelSha256'],[policy,'policySha256'],[i,'inputDefinitionSha256']])assert.equal(sha(value),p.baseline[key]);
  const frozen=JSON.parse(f),model=JSON.parse(m),baselinePolicy=JSON.parse(policy),inputDefinition=JSON.parse(i),fit=await read(C+'output/fit.json');
  const {freezeHash,...body}=frozen;assert.equal(freezeHash,p.baseline.freezeHash);assert.equal(jsonHash(body),freezeHash);
  assert.equal(fit.freezeHash,freezeHash);assert.equal(fit.modelSha256,p.baseline.modelSha256);assert.equal(fit.inputDefinitionSha256,p.baseline.inputDefinitionSha256);
  assert.equal(fit.selection,'development-only');assert.equal(fit.finalTestEvaluated,false);
  assert.equal(model.trainingVersion,freezeHash);assert.equal(frozen.modelSha256,MODEL_SHA256);
  assert.deepEqual(inputDefinition,{bodyWeight:.75,titleWeight:.25,encoderHash:frozen.encoderHash});
  const adapter=compilePairedE5Input(inputDefinition),identity=describePairedE5Input(adapter);
  assert.equal(model.representation,identity.representation);assert.equal(model.representationHash,identity.representationHash);
  compileBaseline({model,policy:baselinePolicy});
  return {frozen,model,baselinePolicy,inputDefinition,adapter,fit};
}
async function descriptor(){
  const p=protocol(await read('protocol.json')),b=await baseline(p),{CORPUS,TAXONOMY}=await cohort();
  assert.equal(CORPUS.length,p.maximumRows);assert.equal(TAXONOMY.nodes.length,63);
  const ids=new Set(),groups=new Set(),nodeIds=new Set(TAXONOMY.nodes.map(n=>n.id));
  const blockedIds=new Set([...b.model.trainingIdHashes,...b.baselinePolicy.calibrationIdHashes,...b.fit.developmentIdHashes]);
  const blockedGroups=new Set([...b.model.trainingGroupHashes,...b.baselinePolicy.calibrationGroupHashes,...b.fit.developmentGroupHashes]);
  for(const [split,count]of Object.entries(p.expectedSplits))assert.equal(CORPUS.filter(r=>r.split===split).length,count);
  for(const row of CORPUS){
    assert.equal(row.provenance,'synthetic-authored');assert.ok(typeof row.title==='string'&&row.title.length>0&&row.title.length<=512);
    assert.ok(typeof row.body==='string'&&row.body.length>0&&row.body.length<=4096);
    for(const key of ['id','groupId','language'])assert.ok(typeof row[key]==='string'&&row[key].length>0&&row[key].length<=160);
    assert.ok(!ids.has(row.id)&&!groups.has(row.groupId)&&!blockedIds.has(sha(row.id))&&!blockedGroups.has(sha(row.groupId)));
    ids.add(row.id);groups.add(row.groupId);assert.ok(Object.hasOwn(p.expectedSplits,row.split));assert.ok(row.expectedTopicId===null||nodeIds.has(row.expectedTopicId));
  }
  const local=(await readdir(here)).filter(name=>/\.(?:js|py)$/u.test(name)||name==='protocol.json').sort();
  for(const name of ['run.js','supervise.py','assessment.js','corpus.js','protocol.json'])assert.ok(local.includes(name));
  const sourceHashes={};for(const source of [...local,...sources])sourceHashes[source]=sha(await bytes(source));
  // All reused closed C implementation sources must still equal C's freeze.
  for(const source of sources){
    const oldKey=source.startsWith(C)&&source.endsWith('.js')?source.slice(C.length):source;
    if(Object.hasOwn(b.frozen.sourceHashes,oldKey))assert.equal(sourceHashes[source],b.frozen.sourceHashes[oldKey]);
  }
  assert.equal(b.frozen.encoderHash,jsonHash({modelSha256:MODEL_SHA256,embeddingContractSha256:sourceHashes[CONTRACT],assetManifestSha256:sourceHashes[ASSET_MANIFEST]}));
  const body={schema:p.schema,protocol:p,sourceHashes,corpusHash:jsonHash(CORPUS),taxonomyHash:jsonHash(TAXONOMY),
    rows:CORPUS.length,modelId:MODEL_ID,modelSha256:MODEL_SHA256,encoderHash:b.frozen.encoderHash,
    baselineFreezeHash:p.baseline.freezeHash,modelRepresentationHash:b.model.representationHash};
  return {...body,freezeHash:jsonHash(body)};
}
async function verified(){const frozen=await read('freeze.json');assert.deepEqual(await descriptor(),frozen,'Frozen observed experiment changed');return frozen;}
// Read-only preflight. No markers, encoder, fitting, predictions or owner access.
export async function describeExperiment(){return descriptor();}
async function unchanged(frozen){assert.deepEqual(await descriptor(),frozen,'Experiment changed during phase');}
async function encode(frozen){
  await absent(['output/vectors.json']);const {CORPUS}=await cohort(),cold=performance.now(),encoder=await createPackagedCrawlerEmbedder();
  const initializationMs=performance.now()-cold,started=performance.now(),vectors=[];let encoderCalls=0;
  try{for(const row of CORPUS){
    const body=await encoder.embed(row.body),title=await encoder.embed(row.title);encoderCalls+=2;assert.equal(body.modelId,MODEL_ID);assert.equal(title.modelId,MODEL_ID);
    vectors.push({id:row.id,bodyVector:body.values,titleVector:title.values});
    if(vectors.length%64===0)process.stdout.write(JSON.stringify({stage:'encoding',rows:vectors.length})+'\n');
  }}finally{await encoder.close();}
  const encodingLoopMs=performance.now()-started,coldElapsedMs=performance.now()-cold;
  const packetBytes=serializeVectorPacket({schema:VECTOR_PACKET_SCHEMA,freezeHash:frozen.freezeHash,encoderHash:frozen.encoderHash,vectors});
  await unchanged(frozen);await writeFile(new URL('output/vectors.json',here),packetBytes,{flag:'wx'});
  await write('output/encoding.json',{freezeHash:frozen.freezeHash,vectorPacketSha256:sha(packetBytes),rows:vectors.length,encoderCalls,
    vectorScope:'fresh-authored-synthetic-raw-e5-body-and-title-separate',initializationMs,encodingLoopMs,coldElapsedMs});
}
async function packetFor(frozen){
  const encoding=await read('output/encoding.json'),packetBytes=await bytes('output/vectors.json',MAX_VECTOR_PACKET_BYTES);
  assert.equal(encoding.freezeHash,frozen.freezeHash);assert.equal(encoding.rows,frozen.rows);assert.equal(encoding.encoderCalls,2*frozen.rows);
  assert.equal(sha(packetBytes),encoding.vectorPacketSha256);const packet=parseVectorPacket(packetBytes);
  assert.equal(packet.freezeHash,frozen.freezeHash);assert.equal(packet.encoderHash,frozen.encoderHash);
  const {CORPUS}=await cohort();assert.equal(packet.vectors.length,CORPUS.length);const index=new Map(packet.vectors.map(r=>[r.id,r]));
  assert.ok(CORPUS.every(row=>index.has(row.id)));return {index,encoding};
}
async function samples(index,adapter,split){
  const {CORPUS}=await cohort();return CORPUS.filter(row=>row.split===split).map(row=>{
    const r=index.get(row.id),f=applyPairedE5Input(adapter,{sourceId:row.id,sourceVersion:split,bodyVector:r.bodyVector,titleVector:r.titleVector});
    assert.equal(f.status,'available','Unavailable fusion is not a classification fallback');
    return {id:row.id,groupId:row.groupId,split,language:row.language,expectedTopicId:row.expectedTopicId,vector:f.vector};
  });
}
async function calibrate(frozen){
  await absent(['output/policy.json']);const b=await baseline(frozen.protocol);
  const bound=observedHeadPolicyWorkUpperBound(205,b.model.nodes.length);assert.ok(bound<=frozen.protocol.maximumCountedCalibrationWork);
  const {index,encoding}=await packetFor(frozen),started=performance.now(),rows=await samples(index,b.adapter,'calibration');
  const policy=calibrateHierarchyHeadPolicy({model:b.model,rows,minimumAcceptedGroups:3,targetPrecision:1});compileHierarchyHeadAssignment({model:b.model,policy});
  const calibrationElapsedMs=performance.now()-started;assert.ok(policy.calibrationWork.units<=bound);await unchanged(frozen);
  await write('output/policy.json',policy);
  await write('output/calibration.json',{schema:frozen.schema,freezeHash:frozen.freezeHash,baseline:frozen.protocol.baseline,
    observedPolicySha256:sha(await bytes('output/policy.json')),vectorPacketSha256:encoding.vectorPacketSha256,
    calibrationWork:policy.calibrationWork,calibrationElapsedMs,timingExcludesEncoding:true,split:'calibration',
    minimumAcceptedGroups:3,targetPrecision:1,testUsed:false,finalTestEvaluated:false,productionReady:false});
}
async function finalTest(frozen){
  const b=await baseline(frozen.protocol),record=await read('output/calibration.json'),policyBytes=await bytes('output/policy.json');
  assert.equal(record.freezeHash,frozen.freezeHash);assert.deepEqual(record.baseline,frozen.protocol.baseline);
  assert.equal(record.observedPolicySha256,sha(policyBytes));assert.equal(record.testUsed,false);assert.equal(record.finalTestEvaluated,false);
  const policy=JSON.parse(policyBytes);compileHierarchyHeadAssignment({model:b.model,policy});
  const {index,encoding}=await packetFor(frozen);assert.equal(record.vectorPacketSha256,encoding.vectorPacketSha256);
  const rows=await samples(index,b.adapter,'test'),{evaluateFrozenHeads}=await import('./assessment.js');
  const common={model:b.model,rows,developmentIdHashes:b.fit.developmentIdHashes,developmentGroupHashes:b.fit.developmentGroupHashes,
    additionalForbiddenIdHashes:[...policy.calibrationIdHashes,...b.baselinePolicy.calibrationIdHashes],
    additionalForbiddenGroupHashes:[...policy.calibrationGroupHashes,...b.baselinePolicy.calibrationGroupHashes]};
  // Fixed predeclared order; runtime timings are descriptive, not controlled speed comparisons.
  const observed=evaluateFrozenHeads({...common,method:'observed',policy});
  const baselineReport=evaluateFrozenHeads({...common,method:'baseline',policy:b.baselinePolicy});
  assert.equal(observed.rowCount,142);assert.equal(baselineReport.rowCount,142);
  const comparison={sameFreshCases:true,noPostTestRetuning:true,
    assignedDelta:observed.accepted-baselineReport.accepted,safeAcceptedDelta:observed.safeAccepted-baselineReport.safeAccepted,
    deepestCorrectDelta:observed.correctDeepestOutcome-baselineReport.correctDeepestOutcome,
    broadFallbackDelta:observed.broadFallback-baselineReport.broadFallback,wrongBroadDelta:observed.wrongBroad-baselineReport.wrongBroad,
    leafCorrectDelta:observed.leafCorrect-baselineReport.leafCorrect};
  await unchanged(frozen);await write('measured-results.json',{schema:frozen.schema,freezeHash:frozen.freezeHash,
    baselineArtifacts:frozen.protocol.baseline,observedPolicySha256:record.observedPolicySha256,vectorPacketSha256:encoding.vectorPacketSha256,
    encoding,calibration:record,observed,baseline:baselineReport,comparison,
    scope:'fresh-authored-family-groups-not-independent-real-web-origins',syntheticOnly:true,representativeWebValidation:false,
    timingExcludesEncoding:true,productionReady:false,assignmentAuthority:false,ownerDataRead:false,
    modelTrainingCalls:0,canonicalWrites:0,providerCalls:0,pageFetches:0,crawlerActions:0});
}
export async function runCli(args){
  if(!args.length){process.stdout.write('No action. Explicit supervised --freeze/--encode/--calibrate/--test only.\n');return 'inert';}
  assert.ok(args.length===1&&Object.hasOwn(phaseResults,args[0].slice(2))&&args[0].startsWith('--'),'Invalid observed experiment phase');
  const mode=args[0].slice(2);assert.equal(process.env.MURMINGLE_OBSERVED_CUTS_SUPERVISED,mode,'Use the checked resource supervisor');await claim(mode);
  if(mode==='freeze')await write('freeze.json',await descriptor());else{const frozen=await verified();if(mode==='encode')await encode(frozen);
    else if(mode==='calibrate')await calibrate(frozen);else await finalTest(frozen);}
  process.stdout.write(JSON.stringify({stage:mode+'-complete',productionReady:false,assignmentAuthority:false})+'\n');return mode;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runCli(process.argv.slice(2));
