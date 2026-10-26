// Explicit predeclared real-root challenger. NO capture/network, owner DB,
// canonical writes, runtime activation or training of detail/child heads.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {trainHierarchyLinearHeads,compileHierarchyLinearHeads} from '../../../src/domain/hierarchical-e5-paired-linear-heads.js';
import {calibrateHierarchyHeadPolicy,compileHierarchyHeadAssignment,classifyHierarchyHeads,observedHeadPolicyWorkUpperBound} from '../../../src/domain/hierarchical-e5-observed-head-policy.js';
import {compileHierarchyHeadAssignment as compileFixed,classifyHierarchyHeads as classifyFixed} from '../../../src/domain/hierarchical-e5-paired-head-policy.js';
import {compileHierarchyRootDetailConsensus,classifyHierarchyRootDetailConsensus,describeHierarchyRootDetailConsensus} from '../../../src/domain/hierarchical-e5-root-detail-consensus.js';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../../../src/domain/hierarchical-e5-paired-input.js';
import {createPackagedCrawlerEmbedder} from '../../../src/crawler/packaged-e5.js';
import {serializeVectorPacket,parseVectorPacket,VECTOR_PACKET_SCHEMA,MAX_VECTOR_PACKET_BYTES} from '../hierarchical-e5-broad-heads-v1/vector-packet.js';
import {MODEL_ID,MODEL_SHA256} from '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

const here=new URL('./',import.meta.url),sha=value=>createHash('sha256').update(value).digest('hex'),digest=value=>sha(JSON.stringify(value));
const HEX=/^[a-f0-9]{64}$/u,TRAINCAL='../../../data/hierarchy-real-root-capture-adr138.traincal.json',TEST='../../../data/hierarchy-real-root-capture-adr138.test.json';
const SELECTED='../../../data/hierarchy-real-root-selection-adr138.json';
const CONTRACT='../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';
const ASSETS='../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json';
const PRUNER='../html-metadata-prune-v1/prune.js',PRUNER_SHA256='1f553a8d4febbb32bceaf44a20622bf0d04598273c32be01c857bf0d756d1b8e';
const captureSources=['../hierarchical-public-capture-v3/capture.js','../hierarchical-public-capture-v2/robots-deny-space-repair.js',PRUNER,'../../../data/hierarchy-real-root-capture-adr138.mjs',
  '../../../data/hierarchy-real-root-capture-adr138-supervise.py','../../../src/crawler/public-fetch.js',
  '../../../src/crawler/robots.js','../../../src/crawler/static-capture.js'];
const sources=[...captureSources,'../hierarchical-e5-real-root-v1/manifest.js','../hierarchical-e5-real-root-v1/assessment.js','../../../src/domain/hierarchical-e5-paired-linear-heads.js','../../../src/domain/hierarchical-e5-paired-head-policy.js',
  '../../../src/domain/hierarchical-e5-observed-head-policy.js','../../../src/domain/hierarchical-e5-paired-input.js',
  '../../../src/domain/hierarchical-e5-root-detail-consensus.js','../../../src/crawler/packaged-e5.js',
  '../hierarchical-e5-broad-heads-v1/vector-packet.js','../hierarchical-e5-paired-v1/taxonomy.js',CONTRACT,ASSETS,
  '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js'];
const views=['current-static','wikipedia-prose-lead'];
const phaseResults={freeze:'freeze.json','encode-traincal':'output/encoding-traincal.json','fit-calibrate':'output/selection.json',
  'encode-test':'output/encoding-test.json',test:'measured-results.json'};
async function bytes(name,maximum=8*1024*1024){
  const url=new URL(name,here),stat=await lstat(url);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=maximum,'Bounded experiment file unavailable');
  const b=await readFile(url);assert.equal(b.length,stat.size);return b;
}
const read=async(name,max)=>JSON.parse(await bytes(name,max));
const write=(name,value)=>writeFile(new URL(name,here),JSON.stringify(value)+'\n',{flag:'wx'});
async function absent(names){for(const name of names){try{await lstat(new URL(name,here));}catch(e){if(e.code==='ENOENT')continue;throw e;}throw Error('Existing experiment evidence prohibits repeat');}}
async function claim(mode){
  assert.equal(process.env.MURMINGLE_REAL_ROOT_V3_SUPERVISED,mode,'Use the checked resource supervisor');
  await mkdir(new URL('output/',here),{recursive:true});const stat=await lstat(new URL('output/',here));assert.ok(stat.isDirectory()&&!stat.isSymbolicLink());
  await absent([`output/${mode}.started.json`,phaseResults[mode]]);await write(`output/${mode}.started.json`,{mode,noAutomaticRepeat:true,noCaptureOrNetwork:true});
}
async function manifest(){const {loadManifest}=await import('./manifest.js');return loadManifest();}
function checkedProtocol(p){
  assert.equal(p.schema,'hierarchical-e5-real-root-experiment/v3');assert.deepEqual(p.expectedSplits,{training:48,calibration:48,test:32});
  assert.deepEqual(p.inputViews,views);assert.equal(p.lambda,.1);assert.equal(p.bodyWeight,.75);assert.equal(p.titleWeight,.25);
  assert.deepEqual(p.calibration,{split:'calibration',minimumAcceptedGroups:3,targetPrecision:1});assert.equal(p.maximumRootNodes,16);
  assert.equal(p.detailPolicyMode,'observed');return p;
}
function manifestIdentity(m){return {cases:m.cases,goldSourceHashes:m.goldSourceHashes,taxonomyNodes:m.taxonomyNodes,rootNodes:m.rootNodes,
  detailArtifacts:m.detailArtifacts,inputDefinition:m.inputDefinition,sourceHashes:m.sourceHashes};}
async function descriptor(){
  const p=checkedProtocol(await read('protocol.json')),m=await manifest();
  assert.equal(m.cases.length,128);assert.equal(m.rootNodes.length,16);assert.ok(m.rootNodes.every(n=>n.parentId===null));
  assert.deepEqual([m.inputDefinition.bodyWeight,m.inputDefinition.titleWeight],[.75,.25]);
  const adapter=compilePairedE5Input(m.inputDefinition),identity=describePairedE5Input(adapter);
  assert.equal(m.detailModel.representationHash,identity.representationHash);assert.equal(m.detailModel.representation,identity.representation);
  const local=(await readdir(here)).filter(n=>/\.(?:js|py)$/u.test(n)||n==='protocol.json').sort();
  for(const name of ['run.js','supervise.py','manifest.js','verify.js','protocol.json'])assert.ok(local.includes(name));
  const sourceHashes={};for(const source of [...local,...sources])sourceHashes[source]=sha(await bytes(source));
  assert.equal(sourceHashes[PRUNER],PRUNER_SHA256,'Immutable metadata pruner changed');
  const encoderHash=digest({modelSha256:MODEL_SHA256,embeddingContractSha256:sourceHashes[CONTRACT],assetManifestSha256:sourceHashes[ASSETS]});
  assert.equal(encoderHash,m.inputDefinition.encoderHash);
  const body={schema:p.schema,protocol:p,protocolSha256:sourceHashes['protocol.json'],sourceHashes,
    manifestIdentity:manifestIdentity(m),manifestHash:digest(manifestIdentity(m)),encoderHash,
    representation:identity.representation,representationHash:identity.representationHash,modelId:MODEL_ID,modelSha256:MODEL_SHA256};
  return {...body,freezeHash:digest(body)};
}
async function verified(){const f=await read('freeze.json');assert.deepEqual(await descriptor(),f,'Frozen real-root experiment changed');return f;}
async function unchanged(f){assert.deepEqual(await descriptor(),f,'Real-root source changed during phase');}
function constructionHash(f,inputView){
  assert.ok(views.includes(inputView));
  return digest({schema:'hierarchy-real-root-selected-input-construction/v3',inputView,
    inputConstruction:f.protocol.inputConstruction,representationHash:f.representationHash,
    inputDefinitionSha256:f.manifestIdentity.detailArtifacts.inputDefinitionSha256,
    modelSha256:MODEL_SHA256,embeddingContractSha256:f.sourceHashes[CONTRACT],assetManifestSha256:f.sourceHashes[ASSETS],
    pairedAdapterSha256:f.sourceHashes['../../../src/domain/hierarchical-e5-paired-input.js'],protocolSha256:f.protocolSha256,
    captureConstructorSourceHashes:Object.fromEntries(captureSources.map(name=>[name,f.sourceHashes[name]]))});
}
function phaseCases(m,phase){return m.cases.filter(c=>phase==='traincal'?c.split==='training'||c.split==='calibration':c.split==='test');}
function captureSourceKey(name){
  if(name.startsWith('../../../data/'))return 'data/'+name.slice('../../../data/'.length);
  if(name.startsWith('../../../src/'))return 'src/'+name.slice('../../../src/'.length);
  if(name.startsWith('../hierarchical-public-capture-v3/'))return 'experiments/topic-encoder/hierarchical-public-capture-v3/'+name.slice('../hierarchical-public-capture-v3/'.length);
  if(name==='../hierarchical-public-capture-v2/robots-deny-space-repair.js')return 'experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js';
  if(name===PRUNER)return 'experiments/topic-encoder/html-metadata-prune-v1/prune.js';
  throw Error('Unknown fixed capture source');
}
function validatePrunedCapture(o){
  assert.match(o.decodedHtmlSha256,HEX);
  assert.ok(Number.isSafeInteger(o.decodedHtmlCharacters)&&o.decodedHtmlCharacters>0&&o.decodedHtmlCharacters<=2*1024*1024);
  const p=o.metadataPrune;
  assert.ok(p&&typeof p==='object'&&!Array.isArray(p));
  assert.deepEqual(Object.keys(p).sort(),['version','originalSha256','outputSha256','originalCharacters','outputCharacters','removedAttributes','removedCharacters','tokens','oversizedTagCount','reportedOversizedTags','experimental','productionValidated'].sort());
  assert.equal(p.version,'wikipedia-quoted-transport-metadata-prune/v1');
  assert.equal(p.experimental,true);assert.equal(p.productionValidated,false);
  assert.equal(p.originalSha256,o.decodedHtmlSha256);assert.match(p.outputSha256,HEX);
  for(const key of ['originalCharacters','outputCharacters','removedAttributes','removedCharacters','tokens','oversizedTagCount','reportedOversizedTags'])
    assert.ok(Number.isSafeInteger(p[key])&&p[key]>=0&&p[key]<=2*1024*1024);
  assert.equal(p.originalCharacters,o.decodedHtmlCharacters);assert.ok(p.outputCharacters>0&&p.outputCharacters<=p.originalCharacters);
  assert.equal(p.originalCharacters-p.outputCharacters,p.removedCharacters);
  assert.equal(p.removedAttributes===0,p.removedCharacters===0);
  if(!p.removedCharacters)assert.equal(p.originalSha256,p.outputSha256);
  assert.ok(p.tokens>0&&p.tokens<=100000&&p.removedAttributes<=p.tokens*128);
  assert.ok(p.oversizedTagCount<=p.tokens&&p.reportedOversizedTags<=Math.min(32,p.oversizedTagCount));
  const policy=o.policy;assert.ok(policy&&typeof policy==='object'&&!Array.isArray(policy));
  assert.equal(policy.robotsAllowed,true);assert.ok(policy.tdmReservation===null||policy.tdmReservation===0);
  assert.ok(typeof policy.robotsAbsent==='boolean'&&typeof policy.tdmAbsent==='boolean'&&typeof policy.nofollow==='boolean');
  assert.ok(Number.isFinite(policy.crawlDelayMs)&&policy.crawlDelayMs>=0&&policy.crawlDelayMs<=86400000);
  for(const key of ['robotsSha256','robotsDecodedSha256','robotsCanonicalSha256'])assert.match(policy[key],HEX);
  if(policy.tdmSha256!==null)assert.match(policy.tdmSha256,HEX);
  if(policy.robotsRepairId===null){assert.equal(policy.robotsRepairManifestHash,null);assert.equal(policy.robotsCanonicalSha256,policy.robotsDecodedSha256);}
  else{assert.equal(policy.robotsRepairId,'adr137-nl-wikipedia-known-disallow-space-percent20/v1');
    assert.equal(new URL(o.url).origin,'https://nl.wikipedia.org');assert.equal(policy.robotsAbsent,false);
    assert.equal(policy.robotsSha256,'5b208e484c176e5fdcea5ba86f9ba5aa370117b03b706b37da2451baeb4b88b4');
    assert.equal(policy.robotsDecodedSha256,'5bd4fdfe000f3371420eb68a396513fac4a3c75ef5a0c9324ce2eb8be8b6a5dd');
    assert.equal(policy.robotsRepairManifestHash,'197646022460b0bffbc2a8701848525559f0bd50d2fcde0927f6d5d47bb56818');
    assert.equal(policy.robotsCanonicalSha256,'0f9d910c04b4ed4c26215eb4c9292ff18051376b95dd66cda201aef4538b29f4');}
}
async function captureFor(f,m,phase,selected=null){
  // Caller must verify the persisted selection BEFORE this function can open test bytes.
  if(phase==='test')assert.ok(selected&&selected.receipt.phase==='selected-before-test');
  const name=phase==='traincal'?TRAINCAL:TEST,b=await bytes(name,4*1024*1024),value=JSON.parse(b),cases=phaseCases(m,phase);
  assert.equal(value.schema,'hierarchy-real-root-public-capture-result/v3');assert.equal(value.phase,phase);
  assert.ok(['complete','partial-failure'].includes(value.capture.status));assert.equal(value.capture.expectedCases,cases.length);
  assert.equal(value.capture.phase,phase);assert.equal(value.rawHtmlPersisted,false);assert.equal(value.modelExecuted,false);
  assert.equal(value.currentOwnerDataRead,false);assert.equal(value.canonicalWrites,false);
  assert.equal(value.publicLicensedTextOnly,true);assert.equal(value.noAutomaticRetry,true);
  for(const source of captureSources)assert.equal(value.sourceHashes[captureSourceKey(source)],f.sourceHashes[source]);
  assert.deepEqual(value.cases,cases.map(c=>({id:c.id,entityGroup:c.entityGroup,url:c.publicUrl,expectedRootId:c.expectedRootId,split:c.split,labelScope:'root-only'})));
  const expectedManifest={namespace:'hierarchy-real-root-public-capture/v3',phase,cases:cases.map(c=>({id:c.id,url:c.publicUrl}))};
  assert.equal(value.capture.manifestHash,digest(expectedManifest));
  assert.equal(value.labelUidPathMapHash,digest(value.cases.map(c=>({id:c.id,split:c.split,supportedPath:[c.expectedRootId]}))));
  const requiredGold=Object.values(f.manifestIdentity.goldSourceHashes).sort();
  assert.deepEqual(Object.values(value.goldHashes).sort(),requiredGold);
  if(phase==='test'){
    const {receiptSha256,...receipt}=value.selection;assert.equal(receiptSha256,selected.receiptSha256);assert.deepEqual(receipt,selected.receipt);
  }else assert.equal(value.selection,null);
  assert.ok(Array.isArray(value.capture.outcomes)&&value.capture.outcomes.length<=cases.length);
  const byId=new Map(cases.map(c=>[c.id,c])),outcomes=new Map();
  for(const [position,o] of value.capture.outcomes.entries()){
    assert.equal(o.id,cases[position].id,'Capture retains an exact successful prefix, not arbitrary omissions');
    assert.ok(byId.has(o.id)&&!outcomes.has(o.id));assert.equal(o.url,byId.get(o.id).publicUrl);
    validatePrunedCapture(o);
    assert.ok(typeof o.title==='string'&&o.title.length<=200);assert.match(o.htmlSha256,HEX);
    assert.equal(o.current.characters,o.current.text.length);assert.ok(typeof o.current.text==='string'&&o.current.text.length<=4096);
    assert.equal(o.current.sha256,o.current.text?sha(o.current.text):null);
    assert.ok(['available','unavailable'].includes(o.leadCandidate.status));
    assert.ok(typeof o.leadCandidate.text==='string'&&o.leadCandidate.text.length<=4096);
    assert.equal(o.leadCandidate.characters,o.leadCandidate.text.length);
    assert.equal(o.leadCandidate.sha256,o.leadCandidate.text?sha(o.leadCandidate.text):null);
    assert.equal(o.leadCandidate.status==='available',o.leadCandidate.text.length>0);
    // Pinned capture wrapper's exact eight-field sourceInputHash, without importing capture/network code.
    assert.equal(o.sourceInputHash,digest({id:o.id,url:o.url,htmlSha256:o.htmlSha256,title:o.title,
      currentSha256:o.current.sha256,leadSha256:o.leadCandidate.sha256,
      decodedHtmlSha256:o.decodedHtmlSha256,metadataPruneReceiptSha256:digest(o.metadataPrune)}));
    outcomes.set(o.id,o);
  }
  assert.equal(value.capture.completedCases,outcomes.size);
  assert.equal(value.capture.status==='complete',outcomes.size===cases.length,'Complete capture must contain every case');
  if(value.capture.status==='complete'){
    assert.equal(value.capture.failedCaseId,null);assert.equal(value.capture.failedStage,null);assert.equal(value.capture.failureCode,null);
  }else{
    assert.equal(value.capture.failedCaseId,cases[outcomes.size].id);assert.match(value.capture.failureCode,/^[a-z0-9-]{1,120}$/u);
  }
  return {cases,outcomes,captureSha256:sha(b),captureStatus:value.capture.status,name};
}
const viewText=(o,view)=>!o?null:view==='current-static'?o.current.text:o.leadCandidate.status==='available'?o.leadCandidate.text:null;
function availability(capture,c){
  const o=capture.outcomes.get(c.id),title=!!o?.title.trim();
  return {id:c.id,sourceInputHash:o?.sourceInputHash??digest({schema:'real-root-missing-capture-witness/v1',id:c.id,captureSha256:capture.captureSha256}),
    sourceInputHashScope:o?'captured-public-input':'missing-capture-marker-not-model-input',
    titleProvenance:o?.titleProvenance??'missing-capture',
    'current-static':title&&!!viewText(o,'current-static')?.trim(),
    'wikipedia-prose-lead':title&&!!viewText(o,'wikipedia-prose-lead')?.trim()};
}
function packetName(phase,view){return `output/${phase}.${view}.vectors.json`;}
async function encodePhase(f,phase,selected=null){
  if(phase==='test')selected=await selectedFor(f); // before opening any test capture
  const m=await manifest(),capture=await captureFor(f,m,phase,selected);
  await absent(views.map(view=>packetName(phase,view)));
  const available=capture.cases.map(c=>availability(capture,c)),packets=new Map(views.map(v=>[v,[]]));
  const started=performance.now();let initializationMs=0,encoderCalls=0,encoder=null;
  try{
    for(let i=0;i<capture.cases.length;i++){
      const c=capture.cases[i],flags=available[i];if(!views.some(view=>flags[view]))continue;
      if(!encoder){const cold=performance.now();encoder=await createPackagedCrawlerEmbedder();initializationMs=performance.now()-cold;}
      const o=capture.outcomes.get(c.id),title=await encoder.embed(o.title);encoderCalls++;assert.equal(title.modelId,MODEL_ID);
      // Exactly one title encode reused by both independently captured body views.
      for(const view of views)if(flags[view]){
        const body=await encoder.embed(viewText(o,view));encoderCalls++;assert.equal(body.modelId,MODEL_ID);
        packets.get(view).push({id:c.id,bodyVector:body.values,titleVector:title.values});
      }
    }
  }finally{if(encoder)await encoder.close();}
  const encodingElapsedMs=performance.now()-started,packetReceipts=[];
  await unchanged(f);assert.equal(sha(await bytes(capture.name,4*1024*1024)),capture.captureSha256);
  for(const view of views){
    const vectors=packets.get(view);let vectorPacketSha256=null;
    if(vectors.length){const b=serializeVectorPacket({schema:VECTOR_PACKET_SCHEMA,freezeHash:f.freezeHash,encoderHash:f.encoderHash,vectors});
      await writeFile(new URL(packetName(phase,view),here),b,{flag:'wx'});vectorPacketSha256=sha(b);}
    packetReceipts.push({inputView:view,rows:vectors.length,vectorPacketSha256});
  }
  await write(`output/encoding-${phase}.json`,{schema:f.schema,freezeHash:f.freezeHash,phase,captureSha256:capture.captureSha256,
    captureStatus:capture.captureStatus,cases:available,packets:packetReceipts,encoderCalls,initializationMs,encodingElapsedMs,
    selectedReceiptSha256:selected?.receiptSha256??null,source:'already-captured-public-text-only-no-network',productionReady:false});
}
async function encodedFor(f,m,phase,selected=null){
  if(phase==='test')assert.ok(selected);
  const receiptName=`output/encoding-${phase}.json`,receiptBytes=await bytes(receiptName),
    encodingReceiptSha256=sha(receiptBytes),record=JSON.parse(receiptBytes),capture=await captureFor(f,m,phase,selected);
  const evidence=[{name:receiptName,sha256:encodingReceiptSha256,maximum:8*1024*1024},
    {name:capture.name,sha256:capture.captureSha256,maximum:4*1024*1024}];
  assert.equal(record.freezeHash,f.freezeHash);assert.equal(record.phase,phase);assert.equal(record.captureSha256,capture.captureSha256);
  assert.equal(record.selectedReceiptSha256,selected?.receiptSha256??null);
  assert.deepEqual(record.cases,capture.cases.map(c=>availability(capture,c)));
  const packets=new Map();assert.equal(record.packets.length,2);
  for(let i=0;i<views.length;i++){
    const spec=record.packets[i],view=views[i];assert.equal(spec.inputView,view);
    const ids=record.cases.filter(c=>c[view]).map(c=>c.id);assert.equal(spec.rows,ids.length);
    if(!ids.length){assert.equal(spec.vectorPacketSha256,null);packets.set(view,new Map());continue;}
    const b=await bytes(packetName(phase,view),MAX_VECTOR_PACKET_BYTES);assert.equal(sha(b),spec.vectorPacketSha256);
    evidence.push({name:packetName(phase,view),sha256:spec.vectorPacketSha256,maximum:MAX_VECTOR_PACKET_BYTES});
    const packet=parseVectorPacket(b);assert.equal(packet.freezeHash,f.freezeHash);assert.equal(packet.encoderHash,f.encoderHash);
    assert.deepEqual(packet.vectors.map(r=>r.id),ids);packets.set(view,new Map(packet.vectors.map(r=>[r.id,r])));
  }
  const expectedCalls=record.cases.reduce((n,c)=>n+(views.some(v=>c[v])?1:0)+views.filter(v=>c[v]).length,0);assert.equal(record.encoderCalls,expectedCalls);
  return {record,capture,packets,encodingReceiptSha256,evidence};
}
async function verifyEncodedEvidence(encoded){
  for(const file of encoded.evidence)assert.equal(sha(await bytes(file.name,file.maximum)),file.sha256,'Encoding evidence changed during phase');
}
function samples(cases,index,adapter,available,inputView,split){
  const inputHashes=new Map(available.map(r=>[r.id,r.sourceInputHash]));
  return cases.filter(c=>c.split===split).map(c=>{
    const raw=index.get(c.id);assert.ok(raw,'No row dropping or input fallback');
    const result=applyPairedE5Input(adapter,{sourceId:c.id,sourceVersion:inputHashes.get(c.id)+'|'+inputView,bodyVector:raw.bodyVector,titleVector:raw.titleVector});
    assert.equal(result.status,'available','Zero fusion cannot become a guessed topic');
    return {id:c.id,groupId:c.entityGroup,split,language:c.language,expectedTopicId:c.expectedRootId,vector:result.vector};
  });
}
const assessorCases=cases=>cases.map(({id,entityGroup,language,expectedRootId,specificityPath})=>({id,entityGroup,language,expectedRootId,specificityPath}));
const witness=(model,row,sourceInputHash,inputView)=>({sourceId:row.id,sourceVersion:sourceInputHash+'|'+inputView,
  representation:model.representation,representationHash:model.representationHash,vector:row.vector});
async function fitCalibrate(f){
  await absent(['output/root-model.json','output/root-policy.json',SELECTED]);
  const m=await manifest(),encoded=await encodedFor(f,m,'traincal'),adapter=compilePairedE5Input(m.inputDefinition),candidates=[];
  const {assessRootOnlyPredictions}=await import('../hierarchical-e5-real-root-v1/assessment.js');
  for(const inputView of views){
    const cases=encoded.capture.cases,index=encoded.packets.get(inputView),trainingCount=cases.filter(c=>c.split==='training'&&index.has(c.id)).length,
      calibrationCount=cases.filter(c=>c.split==='calibration'&&index.has(c.id)).length;
    if(trainingCount!==48||calibrationCount!==48){candidates.push({inputView,status:'ineligible',reason:'incomplete-training-or-calibration-view',
      trainingAvailable:trainingCount,calibrationAvailable:calibrationCount});continue;}
    const training=samples(cases,index,adapter,encoded.record.cases,inputView,'training').map(({language,...row})=>row),
      calibration=samples(cases,index,adapter,encoded.record.cases,inputView,'calibration');
    const started=performance.now(),rootModel=trainHierarchyLinearHeads({nodes:m.rootNodes,rows:training,representation:f.representation,
      representationHash:f.representationHash,trainingVersion:f.freezeHash+'|'+inputView,lambda:.1}),trainingElapsedMs=performance.now()-started;
    const preflight=observedHeadPolicyWorkUpperBound(48,16);assert.ok(preflight<=64000000);
    const calStarted=performance.now(),rootPolicy=calibrateHierarchyHeadPolicy({model:rootModel,rows:calibration,minimumAcceptedGroups:3,targetPrecision:1}),
      calibrationElapsedMs=performance.now()-calStarted,compiled=compileHierarchyHeadAssignment({model:rootModel,policy:rootPolicy});
    const inputHashes=new Map(encoded.record.cases.map(r=>[r.id,r.sourceInputHash]));
    const predictions=calibration.map(row=>{const d=classifyHierarchyHeads(compiled,witness(rootModel,row,inputHashes.get(row.id),inputView));
      return {id:row.id,sourceInputHash:inputHashes.get(row.id),selectedPath:d.paths.length===1?[...d.paths[0]]:[]};});
    const calibrationAssessment=assessRootOnlyPredictions({nodes:m.taxonomyNodes,cases:assessorCases(cases.filter(c=>c.split==='calibration')),predictions});
    candidates.push({inputView,status:'eligible',rootModel,rootPolicy,rootModelArtifactHash:digest(rootModel),rootPolicyHash:rootPolicy.policyHash,
      calibrationAssessment,trainingElapsedMs,calibrationElapsedMs,
      trainingWork:rootModel.trainingWork,calibrationWork:rootPolicy.calibrationWork});
  }
  const selected=candidates.filter(c=>c.status==='eligible').sort((a,b)=>b.calibrationAssessment.correctRoot-a.calibrationAssessment.correctRoot||
    views.indexOf(a.inputView)-views.indexOf(b.inputView))[0];
  const reports=candidates.map(({rootModel,rootPolicy,...report})=>report);await unchanged(f);await verifyEncodedEvidence(encoded);
  if(!selected){await write('output/selection.json',{schema:f.schema,freezeHash:f.freezeHash,status:'no-eligible-candidate',candidates:reports,
    finalTestEvaluated:false,testCaptureAuthorized:false,productionReady:false});return;}
  const consensus=compileHierarchyRootDetailConsensus({rootModel:selected.rootModel,rootPolicy:selected.rootPolicy,detailModel:m.detailModel,detailPolicy:m.detailPolicy});
  assert.equal(describeHierarchyRootDetailConsensus(consensus).detailPolicyMode,'observed');
  await write('output/root-model.json',selected.rootModel);await write('output/root-policy.json',selected.rootPolicy);
  const receipt={schema:'hierarchy-real-root-selection/v3',phase:'selected-before-test',finalTestEvaluated:false,
    inputConstructionHash:constructionHash(f,selected.inputView),selectedModelSha256:sha(await bytes('output/root-model.json')),
    selectedPolicySha256:sha(await bytes('output/root-policy.json')),protocolSha256:f.protocolSha256,freezeHash:f.freezeHash,
    detailModelSha256:m.detailArtifacts.modelSha256,detailPolicySha256:m.detailArtifacts.policySha256,detailPolicyMode:'observed',
    consensusHash:describeHierarchyRootDetailConsensus(consensus).consensusHash,inputView:selected.inputView};
  // The external capture gate receives this exact immutable receipt, not caller claims.
  await write(SELECTED,receipt);
  await write('output/selection.json',{schema:f.schema,freezeHash:f.freezeHash,status:'selected',receipt,
    receiptSha256:sha(await bytes(SELECTED,65536)),traincalEncodingSha256:encoded.encodingReceiptSha256,
    candidates:reports,selection:'calibration-correct-assigned-root-count-then-declared-view-order',
    calibrationIsSelectionData:true,notIndependentQualityEvidence:true,finalTestEvaluated:false,timingExcludesEncoding:true,productionReady:false});
}
async function selectedFor(f){
  const local=await read('output/selection.json');assert.equal(local.freezeHash,f.freezeHash);assert.equal(local.status,'selected');assert.equal(local.finalTestEvaluated,false);
  const receiptBytes=await bytes(SELECTED,65536),receipt=JSON.parse(receiptBytes);assert.equal(sha(receiptBytes),local.receiptSha256);assert.deepEqual(receipt,local.receipt);
  assert.equal(receipt.schema,'hierarchy-real-root-selection/v3');assert.equal(receipt.phase,'selected-before-test');assert.equal(receipt.finalTestEvaluated,false);
  assert.equal(receipt.freezeHash,f.freezeHash);assert.equal(receipt.protocolSha256,f.protocolSha256);assert.equal(receipt.detailPolicyMode,'observed');
  assert.equal(receipt.inputConstructionHash,constructionHash(f,receipt.inputView));
  assert.equal(sha(await bytes('output/encoding-traincal.json')),local.traincalEncodingSha256);
  const modelBytes=await bytes('output/root-model.json'),policyBytes=await bytes('output/root-policy.json');
  assert.equal(sha(modelBytes),receipt.selectedModelSha256);assert.equal(sha(policyBytes),receipt.selectedPolicySha256);
  const rootModel=JSON.parse(modelBytes),rootPolicy=JSON.parse(policyBytes),m=await manifest();compileHierarchyLinearHeads(rootModel);
  assert.equal(rootModel.trainingVersion,f.freezeHash+'|'+receipt.inputView);assert.equal(rootModel.lambda,.1);
  const nodeOrder=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
  assert.deepEqual([...rootModel.nodes].sort(nodeOrder),[...m.rootNodes].sort(nodeOrder));
  assert.equal(rootModel.representationHash,f.representationHash);assert.equal(rootModel.representation,f.representation);
  assert.equal(receipt.detailModelSha256,m.detailArtifacts.modelSha256);assert.equal(receipt.detailPolicySha256,m.detailArtifacts.policySha256);
  const consensus=compileHierarchyRootDetailConsensus({rootModel,rootPolicy,detailModel:m.detailModel,detailPolicy:m.detailPolicy});
  assert.equal(receipt.consensusHash,describeHierarchyRootDetailConsensus(consensus).consensusHash);
  return {receipt,receiptSha256:sha(receiptBytes),rootModel,rootPolicy,consensus};
}
async function finalTest(f){
  const selected=await selectedFor(f),m=await manifest(),encoded=await encodedFor(f,m,'test',selected),inputView=selected.receipt.inputView;
  const adapter=compilePairedE5Input(m.inputDefinition),compiledRoot=compileHierarchyHeadAssignment({model:selected.rootModel,policy:selected.rootPolicy}),
    compiledBaseline=compileFixed({model:m.detailModel,policy:m.baselineDetailPolicy});
  const {assessRootOnlyPredictions}=await import('../hierarchical-e5-real-root-v1/assessment.js'),rootPredictions=[],consensusPredictions=[],baselinePredictions=[],outcomes=[];
  const available=new Map(encoded.record.cases.map(c=>[c.id,c]));
  for(const c of encoded.capture.cases){
    const flags=available.get(c.id),raw=encoded.packets.get(inputView).get(c.id),sourceInputHash=flags.sourceInputHash;
    let rootPath=[],consensusPath=[],baselinePath=[],reason='missing-selected-view-no-fallback',timing=null,work=null;
    if(raw){
      const fused=applyPairedE5Input(adapter,{sourceId:c.id,sourceVersion:sourceInputHash+'|'+inputView,bodyVector:raw.bodyVector,titleVector:raw.titleVector});
      if(fused.status==='available'){
        const row={id:c.id,vector:fused.vector},w=witness(selected.rootModel,row,sourceInputHash,inputView),t0=performance.now(),
          root=classifyHierarchyHeads(compiledRoot,w),t1=performance.now(),consensus=classifyHierarchyRootDetailConsensus(selected.consensus,w),t2=performance.now(),
          baseline=classifyFixed(compiledBaseline,w),t3=performance.now();
        rootPath=root.paths.length===1?[...root.paths[0]]:[];consensusPath=[...consensus.supportedPath];baselinePath=baseline.paths.length===1?[...baseline.paths[0]]:[];
        reason=consensus.reason;timing={rootOnlyMs:t1-t0,consensusMs:t2-t1,fixedBaselineMs:t3-t2};work={root:root.work,consensus:consensus.work,baseline:baseline.work};
      }else reason='zero-fused-norm-no-fallback';
    }
    rootPredictions.push({id:c.id,sourceInputHash,selectedPath:rootPath});consensusPredictions.push({id:c.id,sourceInputHash,selectedPath:consensusPath});
    baselinePredictions.push({id:c.id,sourceInputHash,selectedPath:baselinePath});
    outcomes.push({id:c.id,sourceInputHash,sourceInputHashScope:flags.sourceInputHashScope,titleProvenance:flags.titleProvenance,selectedViewAvailable:!!raw,
      inputView,rootPath,consensusPath,fixedBaselinePath:baselinePath,reason,timing,work});
  }
  const cases=assessorCases(encoded.capture.cases),common={nodes:m.taxonomyNodes,cases};
  const rootOnly=assessRootOnlyPredictions({...common,predictions:rootPredictions}),consensus=assessRootOnlyPredictions({...common,predictions:consensusPredictions}),
    fixedBaseline=assessRootOnlyPredictions({...common,predictions:baselinePredictions});
  const timing={scope:'validation-and-whole-classifier-excluding-compile-encoding-capture-queue-database',queueWaitMeasured:false,
    compilationIncluded:false,encodingIncluded:false,captureIncluded:false,databaseIncluded:false,
    fixedEvaluationOrder:['root-only','consensus','fixed-C-baseline'],controlledSpeedComparison:false};
  for(const key of ['rootOnlyMs','consensusMs','fixedBaselineMs']){
    const values=outcomes.filter(o=>o.timing).map(o=>o.timing[key]).sort((a,b)=>a-b);
    timing[key]={samples:values.length,median:values.length?values[Math.floor(values.length/2)]:null,p95:values.length?values[Math.ceil(values.length*.95)-1]:null,maximum:values.at(-1)??null};
  }
  await unchanged(f);await selectedFor(f);await verifyEncodedEvidence(encoded);
  await write('measured-results.json',{schema:f.schema,freezeHash:f.freezeHash,selectionReceipt:selected.receipt,selectionReceiptSha256:selected.receiptSha256,
    testCaptureSha256:encoded.record.captureSha256,testEncodingSha256:encoded.encodingReceiptSha256,
    rootOnly,consensus,fixedBaseline,outcomes,timing,
    calibrationUsedForSelection:true,testSelectionOrRetuning:false,rootOnlySupervision:true,unannotatedChildNegativesCreated:false,
    specificityScope:'only-four-separately-curated-terminal-anchors-others-unscored',unknownChildNegativesTested:false,
    representativePopulationClaim:false,productionReady:false,assignmentAuthority:false,ownerDataRead:false,canonicalWrites:0,providerCalls:0,pageFetches:0,crawlerActions:0});
}
export async function runCli(args){
  if(!args.length){process.stdout.write('No action. Explicit supervised --freeze/--encode-traincal/--fit-calibrate/--encode-test/--test only.\n');return 'inert';}
  assert.ok(args.length===1&&args[0].startsWith('--')&&Object.hasOwn(phaseResults,args[0].slice(2)),'Invalid real-root phase');
  const mode=args[0].slice(2);assert.equal(process.env.MURMINGLE_REAL_ROOT_V3_SUPERVISED,mode,'Use the checked resource supervisor');await claim(mode);
  if(mode==='freeze')await write('freeze.json',await descriptor());else{const f=await verified();if(mode==='encode-traincal')await encodePhase(f,'traincal');
    else if(mode==='fit-calibrate')await fitCalibrate(f);else if(mode==='encode-test')await encodePhase(f,'test');else await finalTest(f);}
  process.stdout.write(JSON.stringify({stage:mode+'-complete',productionReady:false,assignmentAuthority:false})+'\n');return mode;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runCli(process.argv.slice(2));
