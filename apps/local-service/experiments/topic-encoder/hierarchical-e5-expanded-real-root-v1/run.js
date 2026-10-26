// Opt-in offline ADR141 six-candidate experiment; default inert. No network/owner DB.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {trainHierarchyLinearHeads,compileHierarchyLinearHeads,scoreHierarchyLinearHeads} from '../../../src/domain/hierarchical-e5-paired-linear-heads.js';
import {compileHierarchyHeadAssignment,classifyHierarchyHeads} from '../../../src/domain/hierarchical-e5-observed-head-policy.js';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../../../src/domain/hierarchical-e5-paired-input.js';
import {createPackagedCrawlerEmbedder} from '../../../src/crawler/packaged-e5.js';
import {serializeVectorPacket,parseVectorPacket,VECTOR_PACKET_SCHEMA,MAX_VECTOR_PACKET_BYTES} from '../hierarchical-e5-broad-heads-v1/vector-packet.js';
import {fitPooledRootRankPolicy,compilePooledRootRankPolicy,classifyPooledRootRankPolicy,rankRootScores} from '../hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js';
import {MODEL_ID,MODEL_SHA256} from '../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';
import {CANDIDATE_ORDER,selectCandidate,workPreflight,inputConstructionIdentity,compileDualRepresentationGate,describeDualRepresentationGate,applyDualRepresentationGate,partialPrefixAgreement,requireCompleteExpansion,encodingViews} from './methods.js';
const here=new URL('./',import.meta.url),sha=v=>createHash('sha256').update(v).digest('hex'),digest=v=>sha(JSON.stringify(v));
const HEX=/^[a-f0-9]{64}$/u,EXPANSION='../../../data/hierarchy-root-expansion-capture-adr141.training-expansion.json',TEST='../../../data/hierarchy-root-expansion-capture-adr141.test.json',
 SELECTED='../../../data/hierarchy-root-expansion-selection-adr141.json',V3='../hierarchical-e5-real-root-v3/';
const CONTRACT='../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js',ASSETS='../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json';
const PRUNER='../html-metadata-prune-v1/prune.js',views=['current-static','wikipedia-prose-lead'];
const captureSources=['../hierarchical-public-capture-v4/capture.js','../hierarchical-public-capture-v2/robots-deny-space-repair.js',PRUNER,
 '../../../data/hierarchy-root-expansion-capture-adr141.mjs','../../../data/hierarchy-root-expansion-capture-adr141-supervise.py',
 '../../../src/crawler/public-fetch.js','../../../src/crawler/robots.js','../../../src/crawler/static-capture.js'];
const sources=[...captureSources,'../../../src/domain/hierarchical-e5-paired-linear-heads.js','../../../src/domain/hierarchical-e5-observed-head-policy.js',
 '../../../src/domain/hierarchical-e5-paired-input.js','../../../src/crawler/packaged-e5.js','../hierarchical-e5-broad-heads-v1/vector-packet.js',
 '../hierarchical-e5-paired-v1/taxonomy.js','../hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js',
 '../hierarchical-e5-real-root-v1/assessment.js',CONTRACT,ASSETS,'../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js',
 '../../../../../decisions/ADR-141-expanded-real-root-training-and-prospective-input-selection.md'];
const reusedNames=[V3+'freeze.json',V3+'output/encoding-traincal.json',V3+'output/traincal.current-static.vectors.json',
 V3+'output/traincal.wikipedia-prose-lead.vectors.json','../../../data/hierarchy-real-root-capture-adr138.traincal.json'];
const reusedPins=[
 '449d10d74a9b5e91bd6726a40199f51f2190662b238e317b8f000e6247eeb9f0',
 '1df069f65ebfcba7b8f67dcafe2e401718704bcb55cd7aa3396e20375a18b687',
 'bcdf5c846acdc469b1e4de05ad4d9069612ec50b5c81c79500d90470aa833c6a',
 'ce33edbccedddca147d0b473cf5924d07b7ed4ad7c53adc0797d593bbd12c169',
 '6659f34a3e800bc447eb5331500c647194d1fe71164e8c7ca2b08a28d1418955'];
const phaseResults={freeze:'freeze.json','encode-expansion':'output/encoding-training-expansion.json','fit-calibrate':'output/selection.json','encode-test':'output/encoding-test.json',test:'measured-results.json'};
const snapshots=new Map();
async function freshBytes(name,maximum=8*1024*1024){const stat=await lstat(new URL(name,here));assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=maximum);const b=await readFile(new URL(name,here));assert.equal(b.length,stat.size);return b;}
async function bytes(name,maximum=8*1024*1024){if(!snapshots.has(name))snapshots.set(name,await freshBytes(name,maximum));const b=snapshots.get(name);assert.ok(b.length<=maximum);return b;}
const read=async(n,max)=>JSON.parse(await bytes(n,max)),write=(n,v)=>writeFile(new URL(n,here),JSON.stringify(v)+'\n',{flag:'wx'});
async function absent(names){for(const n of names){try{await lstat(new URL(n,here));}catch(e){if(e.code==='ENOENT')continue;throw e;}throw Error('Existing evidence prohibits replay');}}
async function claim(mode){assert.equal(process.env.MURMINGLE_EXPANDED_ROOT_V1_SUPERVISED,mode);await mkdir(new URL('output/',here),{recursive:true});const s=await lstat(new URL('output/',here));assert.ok(s.isDirectory()&&!s.isSymbolicLink());await absent(['output/'+mode+'.started.json',phaseResults[mode]]);await write('output/'+mode+'.started.json',{mode,noAutomaticRepeat:true});}
async function manifest(){return (await import('./manifest.js')).loadManifest();}
function checkedProtocol(p){assert.equal(p.schema,'hierarchical-e5-expanded-real-root-experiment/v1');assert.deepEqual(p.expectedSplits,{training:128,calibration:48,test:32});assert.deepEqual(p.candidateOrder,CANDIDATE_ORDER);assert.deepEqual(p.inputViews,views);assert.deepEqual(p.bodyWeights,[.75,.5,.25]);assert.equal(p.lambda,.1);assert.equal(p.maxSearchModels,6);assert.deepEqual(p.calibration,{minimumAcceptedGroups:20,maximumErrors:0,method:'unchanged-ADR140-observed-score-gap-cuts'});return p;}
const manifestIdentity=m=>({cases:m.cases,goldSourceHashes:m.goldSourceHashes,taxonomyNodes:m.taxonomyNodes,rootNodes:m.rootNodes,detailArtifacts:m.detailArtifacts,inputDefinition:m.inputDefinition,sourceHashes:m.sourceHashes});
async function descriptor(){
 const p=checkedProtocol(await read('protocol.json')),m=await manifest();assert.equal(m.cases.length,208);
 const local=(await readdir(here)).filter(n=>/\.(?:js|py)$/u.test(n)||n==='protocol.json'||n==='README.md').sort(),sourceHashes={};
 for(const n of [...local,...sources,...Object.keys(m.sourceHashes)])sourceHashes[n]=sha(await bytes(n));
 for(const [n,expected]of Object.entries(m.sourceHashes))assert.equal(sourceHashes[n],expected,'Manifest parsed bytes differ from source witness');
 const reusedInputHashes={};for(const n of reusedNames)reusedInputHashes[n]=sha(await bytes(n,MAX_VECTOR_PACKET_BYTES));
 for(let i=0;i<reusedNames.length;i++)assert.equal(reusedInputHashes[reusedNames[i]],reusedPins[i],'Complete closed V3 input changed');
 const original=await read(V3+'freeze.json');assert.equal(original.freezeHash,'6892118af0326115f1bc40d19db30956b319157efde7991e6128d9823b4fb92a');
 const {freezeHash:priorHash,...priorBody}=original;assert.equal(digest(priorBody),priorHash);
 const oldRecord=await read(V3+'output/encoding-traincal.json');assert.equal(oldRecord.freezeHash,priorHash);assert.equal(oldRecord.captureStatus,'complete');
 assert.equal(oldRecord.captureSha256,'6659f34a3e800bc447eb5331500c647194d1fe71164e8c7ca2b08a28d1418955');
 assert.equal(reusedInputHashes[reusedNames[4]],oldRecord.captureSha256);
 for(const spec of oldRecord.packets)assert.equal(reusedInputHashes[V3+'output/traincal.'+spec.inputView+'.vectors.json'],spec.vectorPacketSha256);
 const encoderHash=digest({modelSha256:MODEL_SHA256,embeddingContractSha256:sourceHashes[CONTRACT],assetManifestSha256:sourceHashes[ASSETS]});assert.equal(encoderHash,m.inputDefinition.encoderHash);
 const identity=describePairedE5Input(compilePairedE5Input(m.inputDefinition));assert.equal(m.detailModel.representationHash,identity.representationHash);
 const body={schema:p.schema,protocol:p,protocolSha256:sourceHashes['protocol.json'],sourceHashes,reusedInputHashes,
 captureSourceHashes:Object.fromEntries(captureSources.map(n=>[n,sourceHashes[n]])),manifestIdentity:manifestIdentity(m),manifestHash:digest(manifestIdentity(m)),
 encoderHash,detailRepresentationHash:identity.representationHash,modelId:MODEL_ID,modelSha256:MODEL_SHA256,preflight:workPreflight()};
 return {...body,freezeHash:digest(body)};
}
async function verified(){const f=await read('freeze.json');assert.deepEqual(await descriptor(),f);return f;}
async function unchanged(f){for(const [name,b]of snapshots)assert.equal(sha(await freshBytes(name,Math.max(8*1024*1024,b.length))),sha(b),'Initial input bytes changed during phase');assert.deepEqual(await descriptor(),f,'Source/input bytes changed during phase');}
function phaseCases(m,phase){return m.cases.filter(c=>phase==='training-expansion'?c.split==='training'&&c.id.startsWith('root-expansion-'):c.split==='test');}
function captureSourceKey(n){if(n.startsWith('../../../'))return n.slice(9);if(n.startsWith('../'))return 'experiments/topic-encoder/'+n.slice(3);throw Error('Unknown capture source');}
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
  const name=phase==='training-expansion'?EXPANSION:TEST,b=await bytes(name,4*1024*1024),value=JSON.parse(b),cases=phaseCases(m,phase);
  assert.equal(value.schema,'hierarchy-root-expansion-public-capture-result/v1');assert.equal(value.phase,phase);
  assert.equal(value.freezeHash,f.freezeHash);assert.equal(value.protocolSha256,f.protocolSha256);
  assert.equal(value.freezeSha256,sha(await bytes('freeze.json')),'Capture bound to exact current freeze bytes');
  assert.ok(['complete','partial-failure'].includes(value.capture.status));assert.equal(value.capture.expectedCases,cases.length);
  assert.equal(value.capture.phase,phase);assert.equal(value.rawHtmlPersisted,false);assert.equal(value.modelExecuted,false);
  assert.equal(value.currentOwnerDataRead,false);assert.equal(value.canonicalWrites,false);
  assert.equal(value.publicLicensedTextOnly,true);assert.equal(value.noAutomaticRetry,true);
  for(const source of captureSources)assert.equal(value.sourceHashes[captureSourceKey(source)],f.sourceHashes[source]);
  assert.deepEqual(value.cases,cases.map(c=>({id:c.id,entityGroup:c.entityGroup,url:c.publicUrl,expectedRootId:c.expectedRootId,split:c.split,labelScope:'positive-prefix-only',supportedPathPrefix:c.supportedPathPrefix,maximumSpecificityKnown:c.maximumSpecificityKnown})));
  const expectedManifest={namespace:'hierarchy-real-root-public-capture/v4',phase,cases:cases.map(c=>({id:c.id,url:c.publicUrl}))};
  assert.equal(value.capture.manifestHash,digest(expectedManifest));
  assert.equal(value.labelUidPathMapHash,digest(value.cases.map(c=>({id:c.id,split:c.split,supportedPath:c.supportedPathPrefix,maximumSpecificityKnown:c.maximumSpecificityKnown}))));
  const requiredGold=Object.entries(f.manifestIdentity.goldSourceHashes).filter(([k])=>k.includes('root-expansion-')).map(([,v])=>v).sort();
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
  const allowedViews=encodingViews(phase,selected?.receipt.inputView??null);
  if(phase==='training-expansion')requireCompleteExpansion({captureStatus:capture.captureStatus,availability:available});
  const started=performance.now();let initializationMs=0,encoderCalls=0,encoder=null;
  try{
    for(let i=0;i<capture.cases.length;i++){
      const c=capture.cases[i],flags=available[i];if(!allowedViews.some(view=>flags[view]))continue;
      if(!encoder){const cold=performance.now();encoder=await createPackagedCrawlerEmbedder();initializationMs=performance.now()-cold;}
      const o=capture.outcomes.get(c.id),title=await encoder.embed(o.title);encoderCalls++;assert.equal(title.modelId,MODEL_ID);
      // Exactly one title encode reused by both independently captured body views.
      for(const view of allowedViews)if(flags[view]){
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
    captureStatus:capture.captureStatus,cases:available,encodedViews:allowedViews,packets:packetReceipts,encoderCalls,initializationMs,encodingElapsedMs,
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
  const allowedViews=encodingViews(phase,selected?.receipt.inputView??null);assert.deepEqual(record.encodedViews,allowedViews);
  const packets=new Map();assert.equal(record.packets.length,2);
  for(let i=0;i<views.length;i++){
    const spec=record.packets[i],view=views[i];assert.equal(spec.inputView,view);
    const ids=record.cases.filter(c=>allowedViews.includes(view)&&c[view]).map(c=>c.id);assert.equal(spec.rows,ids.length);
    if(!ids.length){assert.equal(spec.vectorPacketSha256,null);packets.set(view,new Map());continue;}
    const b=await bytes(packetName(phase,view),MAX_VECTOR_PACKET_BYTES);assert.equal(sha(b),spec.vectorPacketSha256);
    evidence.push({name:packetName(phase,view),sha256:spec.vectorPacketSha256,maximum:MAX_VECTOR_PACKET_BYTES});
    const packet=parseVectorPacket(b);assert.equal(packet.freezeHash,f.freezeHash);assert.equal(packet.encoderHash,f.encoderHash);
    assert.deepEqual(packet.vectors.map(r=>r.id),ids);packets.set(view,new Map(packet.vectors.map(r=>[r.id,r])));
  }
  const expectedCalls=record.cases.reduce((n,c)=>n+(allowedViews.some(v=>c[v])?1:0)+allowedViews.filter(v=>c[v]).length,0);assert.equal(record.encoderCalls,expectedCalls);
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

const assessCases=rows=>rows.map(({id,entityGroup,language,expectedRootId,specificityPath})=>({id,entityGroup,language,expectedRootId,specificityPath}));
const witness=(model,id,sourceVersion,vector)=>({sourceId:id,sourceVersion,representation:model.representation,representationHash:model.representationHash,vector});
const rootScores=out=>out.scores.map(({nodeId,score})=>({nodeId,score}));
async function reusedFor(f,m){
 const evidence=[];for(const name of reusedNames){assert.equal(sha(await bytes(name,MAX_VECTOR_PACKET_BYTES)),f.reusedInputHashes[name]);evidence.push({name,sha256:f.reusedInputHashes[name],maximum:MAX_VECTOR_PACKET_BYTES});}
 const old=await read(V3+'output/encoding-traincal.json'),prior=await read(V3+'freeze.json'),capture=await read(reusedNames[4]);
 assert.equal(old.freezeHash,prior.freezeHash);assert.equal(old.captureStatus,'complete');assert.equal(old.cases.length,96);
 assert.equal(capture.capture.status,'complete');assert.equal(capture.capture.outcomes.length,96);
 const cases=m.cases.filter(c=>!c.id.startsWith('root-expansion-'));assert.equal(cases.length,96);
 assert.deepEqual(old.cases.map(r=>r.id),cases.map(c=>c.id));
 for(let i=0;i<96;i++){
  const o=capture.capture.outcomes[i],r=old.cases[i];assert.equal(o.id,cases[i].id);assert.equal(o.url,cases[i].publicUrl);
  validatePrunedCapture(o);assert.equal(o.sourceInputHash,r.sourceInputHash);
  assert.equal(o.sourceInputHash,digest({id:o.id,url:o.url,htmlSha256:o.htmlSha256,title:o.title,currentSha256:o.current.sha256,leadSha256:o.leadCandidate.sha256,decodedHtmlSha256:o.decodedHtmlSha256,metadataPruneReceiptSha256:digest(o.metadataPrune)}));
  assert.ok(views.every(v=>r[v]),'Whole96 reuse requires both complete views');
 }
 const packets=new Map();for(const view of views){
  const packet=parseVectorPacket(await bytes(V3+'output/traincal.'+view+'.vectors.json',MAX_VECTOR_PACKET_BYTES));
  assert.equal(packet.freezeHash,prior.freezeHash);assert.equal(packet.encoderHash,f.encoderHash);
  assert.deepEqual(packet.vectors.map(r=>r.id),cases.map(c=>c.id));packets.set(view,new Map(packet.vectors.map(r=>[r.id,r])));
 }
 return {cases,available:old.cases,packets,evidence};
}
function adapterFor(f,m,weight){return compilePairedE5Input({...m.inputDefinition,bodyWeight:weight,titleWeight:1-weight});}
function gateDefinition(f,m,receipt){return {
 inputConstructionHash:receipt.inputConstructionHash,inputView:receipt.inputView,rootModelSha256:receipt.selectedModelSha256,rootPolicySha256:receipt.selectedPolicySha256,
 rootRepresentationHash:receipt.rootRepresentationHash,detailModelSha256:m.detailArtifacts.modelSha256,detailPolicySha256:m.detailArtifacts.policySha256,detailRepresentationHash:f.detailRepresentationHash};}
async function fitCalibrate(f){
 await absent(['output/root-model.json','output/root-policy.json',SELECTED]);
 const m=await manifest(),old=await reusedFor(f,m),added=await encodedFor(f,m,'training-expansion');
 assert.equal(added.capture.captureStatus,'complete');assert.equal(added.record.cases.length,80);
 for(const row of added.record.cases)assert.ok(views.every(v=>row[v]),'Missing TRAIN/CAL view stops selection, never drops a row/view');
 const allCases=[...old.cases,...added.capture.cases],available=[...old.available,...added.record.cases],reports=[],models=[];
 assert.equal(allCases.filter(c=>c.split==='training').length,128);assert.equal(allCases.filter(c=>c.split==='calibration').length,48);
 const totals={trainingWork:0,fusionCoordinateVisits:0,scoringCoordinateProducts:0,rankWork:0};const preflight=workPreflight();
 for(const [inputView,bodyWeight]of CANDIDATE_ORDER){
  const adapter=adapterFor(f,m,bodyWeight),identity=describePairedE5Input(adapter),inputConstructionHash=inputConstructionIdentity(f,inputView,bodyWeight,identity.representationHash);
  const index=new Map([...old.packets.get(inputView),...added.packets.get(inputView)]);
  const training=samples(allCases,index,adapter,available,inputView,'training').map(({language,...r})=>r);
  const calibration=samples(allCases,index,adapter,available,inputView,'calibration');totals.fusionCoordinateVisits+=(128+48)*384*8;
  const t0=performance.now(),model=trainHierarchyLinearHeads({nodes:m.rootNodes,rows:training,representation:identity.representation,representationHash:identity.representationHash,trainingVersion:f.freezeHash+'|'+inputView+'|'+bodyWeight,lambda:.1});
  const trainingMs=performance.now()-t0;totals.trainingWork+=model.trainingWork.units;
  assert.ok(model.heads.every(h=>h.enabled),'Every16-root candidate must have independent TRAIN support');
  const compiled=compileHierarchyLinearHeads(model),modelHash=digest(model),hashes=new Map(available.map(r=>[r.id,r.sourceInputHash]));
  const t1=performance.now(),rows=calibration.map(r=>{
   const sourceInputHash=hashes.get(r.id),out=scoreHierarchyLinearHeads(compiled,witness(model,r.id,sourceInputHash+'|'+inputView,r.vector));
   totals.scoringCoordinateProducts+=out.work.scalarProducts;
   return {id:r.id,groupId:r.groupId,expectedRootId:r.expectedTopicId,scores:rootScores(out)};
  });
  const policy=fitPooledRootRankPolicy({modelHash,representationHash:identity.representationHash,inputConstructionHash,nodeIds:m.rootNodes.map(n=>n.id),rows});
  const scoringAndCalibrationMs=performance.now()-t1;totals.rankWork+=policy.work.countedUnits;
  const raw=rows.map(r=>({id:r.id,...rankRootScores({nodeIds:policy.nodeIds,scores:r.scores})}));
  totals.rankWork+=raw.reduce((n,r)=>n+r.comparisonWork,0);
  const rawCorrect=raw.filter(r=>r.winnerId===rows.find(x=>x.id===r.id).expectedRootId).length;
  const report={inputView,bodyWeight,titleWeight:1-bodyWeight,inputConstructionHash,representationHash:identity.representationHash,
   modelHash,policyHash:policy.policyHash,acceptedCorrect:policy.correctGroups,acceptedGroups:policy.acceptedGroups,rawCorrect,
   calibrationRows:rows.map(r=>({...r,sourceInputHash:hashes.get(r.id)})),rawRanks:raw,
   policy,trainingWork:model.trainingWork,trainingMs,scoringAndCalibrationMs};
  reports.push(report);models.push({model,policy});
 }
 assert.ok(totals.trainingWork<=preflight.trainingWork);assert.ok(totals.scoringCoordinateProducts<=preflight.scoringCoordinateProducts);
 assert.ok(totals.scoringCoordinateProducts<=2000000,'CAL scoring coordinate budget');
 assert.ok(totals.fusionCoordinateVisits<=preflight.fusionCoordinateVisits);assert.ok(totals.rankWork<=preflight.rankWork);
 const selected=selectCandidate(reports),index=reports.indexOf(selected),{model,policy}=models[index];
 await unchanged(f);await verifyEncodedEvidence(old);await verifyEncodedEvidence(added);
 await write('output/root-model.json',model);await write('output/root-policy.json',policy);
 const receipt={schema:'hierarchy-root-expansion-selection/v1',phase:'selected-before-test',finalTestEvaluated:false,
  inputConstructionHash:selected.inputConstructionHash,selectedModelSha256:sha(await bytes('output/root-model.json')),selectedPolicySha256:sha(await bytes('output/root-policy.json')),
  protocolSha256:f.protocolSha256,freezeHash:f.freezeHash,detailModelSha256:m.detailArtifacts.modelSha256,detailPolicySha256:m.detailArtifacts.policySha256,
  detailPolicyMode:'observed',dualGateHash:null,inputView:selected.inputView,bodyWeight:selected.bodyWeight,titleWeight:selected.titleWeight,
  rootRepresentationHash:selected.representationHash,detailRepresentationHash:f.detailRepresentationHash};
 const gate=compileDualRepresentationGate(gateDefinition(f,m,receipt));receipt.dualGateHash=describeDualRepresentationGate(gate).dualGateHash;
 await write(SELECTED,receipt);
 await write('output/selection.json',{schema:f.schema,freezeHash:f.freezeHash,status:'selected',receipt,receiptSha256:sha(await bytes(SELECTED)),
  expansionEncodingSha256:added.encodingReceiptSha256,candidates:reports,preflight,totals,selectedIndex:index,
  calibrationIsOptimization:true,finalTestEvaluated:false,noIndependentCalibrationQualityClaim:true,unknownRootsTested:false,productionReady:false,assignmentAuthority:false});
}
async function selectedFor(f){
 const selection=await read('output/selection.json'),receiptBytes=await bytes(SELECTED,65536),receipt=JSON.parse(receiptBytes),m=await manifest();
 assert.equal(selection.freezeHash,f.freezeHash);assert.equal(selection.status,'selected');assert.equal(selection.finalTestEvaluated,false);
 assert.equal(sha(receiptBytes),selection.receiptSha256);assert.deepEqual(receipt,selection.receipt);
 assert.equal(receipt.schema,'hierarchy-root-expansion-selection/v1');assert.equal(receipt.phase,'selected-before-test');assert.equal(receipt.finalTestEvaluated,false);
 assert.equal(receipt.freezeHash,f.freezeHash);assert.equal(receipt.protocolSha256,f.protocolSha256);assert.equal(receipt.detailPolicyMode,'observed');
 const chosen=selectCandidate(selection.candidates);assert.equal(chosen,selection.candidates[selection.selectedIndex]);
 for(const k of ['inputView','bodyWeight','titleWeight','inputConstructionHash'])assert.equal(receipt[k],chosen[k]);
 const rootBytes=await bytes('output/root-model.json'),policyBytes=await bytes('output/root-policy.json');
 assert.equal(sha(rootBytes),receipt.selectedModelSha256);assert.equal(sha(policyBytes),receipt.selectedPolicySha256);
 const model=JSON.parse(rootBytes),policy=JSON.parse(policyBytes),adapter=adapterFor(f,m,receipt.bodyWeight),identity=describePairedE5Input(adapter);
 compileHierarchyLinearHeads(model); // Complete coefficient/provenance validation BEFORE any TEST capture opens.
 assert.equal(model.representationHash,identity.representationHash);assert.equal(receipt.rootRepresentationHash,identity.representationHash);
 assert.equal(receipt.detailRepresentationHash,f.detailRepresentationHash);assert.equal(model.lambda,.1);
 assert.equal(model.trainingVersion,f.freezeHash+'|'+receipt.inputView+'|'+receipt.bodyWeight);
 assert.deepEqual(model.nodes,[...m.rootNodes].sort((a,b)=>a.id<b.id?-1:1));
 assert.equal(receipt.inputConstructionHash,inputConstructionIdentity(f,receipt.inputView,receipt.bodyWeight,identity.representationHash));
 assert.equal(policy.modelHash,digest(model));assert.equal(policy.representationHash,identity.representationHash);assert.equal(policy.inputConstructionHash,receipt.inputConstructionHash);
 assert.equal(policy.policyHash,chosen.policyHash);assert.deepEqual(policy,chosen.policy);compilePooledRootRankPolicy(policy);
 assert.equal(receipt.detailModelSha256,m.detailArtifacts.modelSha256);assert.equal(receipt.detailPolicySha256,m.detailArtifacts.policySha256);
 assert.equal(sha(await bytes('output/encoding-training-expansion.json')),selection.expansionEncodingSha256);
 const gate=compileDualRepresentationGate(gateDefinition(f,m,receipt));assert.equal(describeDualRepresentationGate(gate).dualGateHash,receipt.dualGateHash);
 return {receipt,receiptSha256:sha(receiptBytes),model,policy,gate,selection,adapter};
}
async function finalTest(f){
 const selected=await selectedFor(f),m=await manifest(),encoded=await encodedFor(f,m,'test',selected),view=selected.receipt.inputView;
 const rootModel=compileHierarchyLinearHeads(selected.model),rootPolicy=compilePooledRootRankPolicy(selected.policy),
 detail=compileHierarchyHeadAssignment({model:m.detailModel,policy:m.detailPolicy}),detailAdapter=compilePairedE5Input(m.inputDefinition);
 const {assessRootOnlyPredictions}=await import('../hierarchical-e5-real-root-v1/assessment.js');
 const roots=[],guarded=[],details=[],rawRoots=[],outcomes=[];let coordinateProducts=0,fusionCoordinateVisits=0,rankWork=0;
 const flags=new Map(encoded.record.cases.map(c=>[c.id,c]));
 for(const c of encoded.capture.cases){
  const available=flags.get(c.id),raw=encoded.packets.get(view).get(c.id),sourceInputHash=available.sourceInputHash,sourceVersion=sourceInputHash+'|'+view;
  let rootPath=[],detailPath=[],consensusPath=[],rawPath=[],reason='missing-selected-input-no-fallback',scores=null,timing=null;
  if(raw){
   const t0=performance.now(),input={sourceId:c.id,sourceVersion,bodyVector:raw.bodyVector,titleVector:raw.titleVector},
    rootVector=applyPairedE5Input(selected.adapter,input),detailVector=applyPairedE5Input(detailAdapter,input);
   fusionCoordinateVisits+=384*16;
   if(rootVector.status==='available'){
    const scored=scoreHierarchyLinearHeads(rootModel,witness(selected.model,c.id,sourceVersion,rootVector.vector));
    coordinateProducts+=scored.work.scalarProducts;scores=rootScores(scored);
    const ranked=rankRootScores({nodeIds:selected.policy.nodeIds,scores});rankWork+=ranked.comparisonWork;
    rawPath=ranked.winnerId?[ranked.winnerId]:[];
    const decision=classifyPooledRootRankPolicy(rootPolicy,{modelHash:selected.policy.modelHash,representationHash:selected.model.representationHash,
     inputConstructionHash:selected.receipt.inputConstructionHash,sourceId:c.id,sourceVersion,scores});
    rootPath=[...decision.selectedPath];rankWork+=decision.comparisonWork;
    if(detailVector.status==='available'){
     const d=classifyHierarchyHeads(detail,witness(m.detailModel,c.id,sourceVersion,detailVector.vector));
     coordinateProducts+=d.work.scalarProducts;detailPath=d.paths.length===1?[...d.paths[0]]:[];
    }
    const common={sourceId:c.id,sourceVersion,sourceInputHash,inputView:view,inputConstructionHash:selected.receipt.inputConstructionHash};
    const gated=applyDualRepresentationGate(selected.gate,{
     root:{...common,modelSha256:selected.receipt.selectedModelSha256,policySha256:selected.receipt.selectedPolicySha256,representationHash:selected.receipt.rootRepresentationHash,path:rootPath},
     detail:{...common,modelSha256:selected.receipt.detailModelSha256,policySha256:selected.receipt.detailPolicySha256,representationHash:selected.receipt.detailRepresentationHash,path:detailPath}});
    consensusPath=[...gated.selectedPath];reason=gated.reason;
   }else reason='zero-root-fusion-no-fallback';
   timing={fusionAndClassifiersMs:performance.now()-t0};
  }
  for(const [target,path]of [[roots,rootPath],[guarded,consensusPath],[details,detailPath],[rawRoots,rawPath]])target.push({id:c.id,sourceInputHash,selectedPath:path});
  const scope={supportedPathPrefix:c.supportedPathPrefix,maximumSpecificityKnown:c.maximumSpecificityKnown},
   guardedPrefix=partialPrefixAgreement({...scope,selectedPath:consensusPath}),detailPrefix=partialPrefixAgreement({...scope,selectedPath:detailPath});
  outcomes.push({id:c.id,sourceInputHash,inputView:view,selectedViewAvailable:!!raw,rootPath,detailPath,consensusPath,rawPath,scores,reason,timing,
   supportedPathPrefix:c.supportedPathPrefix,maximumSpecificityKnown:c.maximumSpecificityKnown,
   guardedPrefixAgreement:guardedPrefix,detailPrefixAgreement:detailPrefix,unscoredDescendants:guardedPrefix.unscoredDescendants});
 }
 const common={nodes:m.taxonomyNodes,cases:assessCases(encoded.capture.cases)};
 const rootOnly=assessRootOnlyPredictions({...common,predictions:roots}),consensus=assessRootOnlyPredictions({...common,predictions:guarded}),
 detailAlone=assessRootOnlyPredictions({...common,predictions:details}),rawRoot=assessRootOnlyPredictions({...common,predictions:rawRoots});
 assert.ok(coordinateProducts<=32*(16+63)*384);assert.ok(fusionCoordinateVisits<=32*384*16);assert.ok(rankWork<=32*16*8);
 await unchanged(f);await selectedFor(f);await verifyEncodedEvidence(encoded);
 const prefixCounts=field=>Object.fromEntries(['unresolved','safe-broader','known-prefix-satisfied','incompatible-known-prefix'].map(k=>[k,outcomes.filter(o=>o[field].outcome===k).length]));
 const times=outcomes.filter(o=>o.timing).map(o=>o.timing.fusionAndClassifiersMs).sort((a,b)=>a-b);
 const timing={samples:times.length,medianMs:times.length?times[Math.floor(times.length/2)]:null,
  p95Ms:times.length?times[Math.ceil(times.length*.95)-1]:null,maximumMs:times.at(-1)??null};
 await write('measured-results.json',{schema:f.schema,freezeHash:f.freezeHash,finalTestEvaluated:true,selectionReceipt:selected.receipt,selectionReceiptSha256:selected.receiptSha256,
  testCaptureSha256:encoded.record.captureSha256,testEncodingSha256:encoded.encodingReceiptSha256,rootOnly,consensus,detailAlone,rawRoot,outcomes,
  feasibilityGate:{minimumAccepted:24,maximumWrongAccepted:0,passed:rootOnly.assigned>=24&&rootOnly.wrongRoot===0},
  partialPrefixAgreement:{guarded:prefixCounts('guardedPrefixAgreement'),detailAlone:prefixCounts('detailPrefixAgreement')},
  work:{coordinateProducts,fusionCoordinateVisits,rankWork},timing,timingScope:'fusion-and-classifiers-excludes-capture-encoding-compile-queue-database',
  unknownRootsTested:false,unknownChildrenAreNegatives:false,testSelectionOrRetuning:false,calibrationIsOptimization:true,
  representativeWebClaim:false,productionReady:false,assignmentAuthority:false,ownerDataRead:false,canonicalWrites:0,pageFetches:0,providerCalls:0});
}
export async function runCli(args){
 if(!args.length){process.stdout.write('No action. Explicit supervised experiment phase only.\n');return 'inert';}
 assert.ok(args.length===1&&args[0].startsWith('--')&&Object.hasOwn(phaseResults,args[0].slice(2)));
 const mode=args[0].slice(2);assert.equal(process.env.MURMINGLE_EXPANDED_ROOT_V1_SUPERVISED,mode);
 await jobHandshake();await claim(mode);
 if(mode==='freeze'){const f=await descriptor();await unchanged(f);await write('freeze.json',f);}else{
  const f=await verified();if(mode==='encode-expansion')await encodePhase(f,'training-expansion');else if(mode==='fit-calibrate')await fitCalibrate(f);
  else if(mode==='encode-test')await encodePhase(f,'test');else await finalTest(f);
 }
 process.stdout.write(JSON.stringify({stage:mode+'-complete',productionReady:false,assignmentAuthority:false})+'\n');return mode;
}
async function jobHandshake(){
 let text="";const deadline=setTimeout(()=>process.stdin.destroy(new Error("Job assignment handshake timeout")),10000);
 try{for await(const chunk of process.stdin){text+=chunk.toString("utf8");assert.ok(text.length<=64);if(text.includes("\n"))break;}
 assert.equal(text,"EXPANDED_ROOT_JOB_ASSIGNED_V1\n");}finally{clearTimeout(deadline);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runCli(process.argv.slice(2));
