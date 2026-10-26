// Actual composition, default inert. Imported ONLY after the original pipe header.
// Parent CODE/package authentication precedes Popen. Child repeats its own gates.
import {win32 as path} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {types} from 'node:util';

const HERE='spikes/topic-resolution/harness/experimental/native-specificity-study-v11';
const ASSETS='spikes/topic-resolution/browser/embedding/.assets';
const PACKAGE='spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core';
const P=Promise,then=Promise.prototype.then,SHA=/^[a-f0-9]{64}$/u;
const hash=b=>createHash('sha256').update(b).digest('hex');
const bytes=v=>Buffer.from(JSON.stringify(v));
const digest=v=>hash(bytes(v));
const seal=v=>{if(v&&typeof v==='object'){for(const c of Object.values(v))seal(c);Object.freeze(v);}return v;};
const need=v=>{if(v!==true)throw new Error('Specificity driver refused');};
const pin=v=>{need(typeof v==='string'&&SHA.test(v));return v;};
function record(v,keys){need(v!==null&&typeof v==='object'&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Object.prototype);
 need(Reflect.ownKeys(v).length===keys.length);return Object.fromEntries(keys.map(k=>{const d=Object.getOwnPropertyDescriptor(v,k);need(d?.enumerable===true&&Object.hasOwn(d,'value'));return [k,d.value];}));}
const same=(a,b)=>digest(a)===digest(b);
export const SPECIFICITY_DRIVER_FAILURE_STAGES=Object.freeze(['startup','bootstrap','code-auth','source-ledger','stage-prepare','asset-checks','prepare-publish','semantic-setup','test-admission','batch-start','batch-stage','batch-dns','browser-capture','batch-recheck','batch-drain','cohort-drain','encoding','fitting','assessment','checks','endchecks','publication','finish','completion']);

/** Diagnostic-only trusted-capability seam. It cannot authorize any phase or
 * convert failure into availability/success. The action's exact thrown value,
 * including null/false/undefined, wins over every diagnostic failure. */
export function createSpecificityDriverFailureBoundary({phase,emitFailure,captureDiagnostic}){
 need(['prepare','train-cal','test'].includes(phase));
 for(const f of [emitFailure,captureDiagnostic])need(typeof f==='function'&&!types.isProxy(f));
 let stage='startup',started=false,hasFailure=false;
 function observeEmitter(value){
  // The actual emitter is synchronous original stderr.write. A mistaken safe
  // native Promise is observed only for rejection hygiene, never awaited or
  // accepted as authority. Unsafe caller hooks are never invoked here.
  if(types.isProxy(value)||!types.isPromise(value)||Object.getPrototypeOf(value)!==P.prototype)return;
  const ds=Object.getOwnPropertyDescriptors(value);
  if(Object.hasOwn(ds,'constructor')||Object.hasOwn(ds,'then')||Reflect.ownKeys(ds).some(k=>!Object.hasOwn(ds[k],'value')))return;
  then.call(value,()=>undefined,()=>undefined);
 }
 return Object.freeze({
  mark(value){need(!hasFailure&&SPECIFICITY_DRIVER_FAILURE_STAGES.includes(value));stage=value;},
  async run(action){need(!started&&typeof action==='function'&&!types.isProxy(action));started=true;
   try{return await action();}catch(error){
    hasFailure=true;
    // captureDiagnostic is a trusted closure over the authenticated module's
    // private first-fault reader AND its exact finite DTO validator. It returns
    // JSON text, not an object which JSON.stringify could inspect through hooks.
    let capture='null';
    try{const candidate=captureDiagnostic();if(candidate!==null){need(typeof candidate==='string'&&candidate.length<=700&&candidate.isWellFormed());need(JSON.stringify(JSON.parse(candidate))===candidate);capture=candidate;}}catch{}
    const prefix=JSON.stringify({schema:'native-specificity-execution-failure/v1',phase,stage});
    let line=prefix.slice(0,-1)+',"capture":'+capture+'}\n';
    if(Buffer.byteLength(line)>900)line=prefix.slice(0,-1)+',"capture":null}\n';
    try{observeEmitter(emitFailure(Buffer.from(line,'utf8')));}catch{}
    throw error;
   }
  }
 });
}
export const SPECIFICITY_PHASE_LEAVES=Object.freeze({prepare:'prepare-r3','train-cal':'train-cal',test:'test'});
export function specificityPhaseLeaf(phase){need(typeof phase==='string'&&Object.hasOwn(SPECIFICITY_PHASE_LEAVES,phase));return SPECIFICITY_PHASE_LEAVES[phase];}
function parseCanonical(b,max){need(Buffer.isBuffer(b)&&b.length>0&&b.length<=max);const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));need(bytes(value).equals(b));return value;}
const relative=b=>'batch-'+String(b.batchIndex).padStart(2,'0');

export function specificityWorkspaceLayout(phase){
 need(['prepare','train-cal','test'].includes(phase));
 const directories=[],files=[],add=(p,n)=>files.push({path:p,maximumBytes:n});
 for(const p of ['ready.json','ack.json','finish.request.json','finish.ack.json','completion.json'])add(p,16384);
 add('result.json',524288);
 if(phase==='prepare')add('freeze.json',262144);
 else{
  if(phase==='train-cal')add('selection.json',524288);
  for(let i=1;i<=(phase==='train-cal'?24:18);i++){
   const b='batch-'+String(i).padStart(2,'0');directories.push(b,b+'/profile',b+'/extension',b+'/extension/chromium',b+'/extension/core');
   for(const name of ['batch-config.js','manifest.json','worker.js','native-adapter.js','native-rights.js','chromium/page-content-reader.js','core/page-content-policy.js'])add(b+'/extension/'+name,name==='manifest.json'||name==='batch-config.js'?16384:131072);
   for(const stem of ['start','drain'])for(const tail of ['request','ack'])add(b+'.'+stem+'.'+tail+'.json',16384);
  }
  for(const stem of ['cohort.drain','model-'+(phase==='train-cal'?'fitting':'assessment'),'model-checks'])for(const tail of ['request','ack'])add(stem+'.'+tail+'.json',16384);
 }
 return seal({directories,files});
}

/** A separate IO catalog adds only fixed phase controls. Base ledger catalog is
 * unchanged; neither catalog/profile/freeze identity depends on future outputs. */
export function specificityIoCatalog(base,phase){
 need(['prepare','train-cal','test'].includes(phase)&&base?.schema==='native-specificity-source-catalog/v1');
 const extra=[{key:'control:bootstrap',path:HERE+'/output/'+specificityPhaseLeaf(phase)+'/bootstrap.json',kind:'code',maximumBytes:16384,sha256:null}];
 if(phase==='prepare')extra.push({key:'control:reviewed-sources',path:HERE+'/reviewed-sources-r3.json',kind:'code',maximumBytes:65536,sha256:null});
 else extra.push({key:'control:freeze',path:HERE+'/output/prepare-r3/node-owned/freeze.json',kind:'code',maximumBytes:262144,sha256:null});
 if(phase==='test')for(const [key,name,cap]of [
  ['selection-audit','independent-audit.json',65536],['train-supervisor','supervisor.json',524288],
  ['train-result','node-owned/result.json',524288],['train-selection','node-owned/selection.json',524288]]){
   extra.push({key:'audit:'+key,path:HERE+'/output/train-cal/'+name,kind:'code',maximumBytes:cap,sha256:null});
 }
 const entries=[...base.entries,...extra];need(new Set(entries.map(e=>e.key)).size===entries.length&&new Set(entries.map(e=>e.path.toLowerCase())).size===entries.length);
 return seal({...base,entries});
}

export function validateSpecificityBootstrap(value,expected){
 const v=record(value,['schema','phase','sourceIdentityHash','sourceIdentityKind','sourcePathsSha256','sourceMapHash','originalNodePid','originalNodeCreationFiletime','nodeIdentityHash','testAuditSha256']);
 need(v.schema==='native-specificity-bootstrap/v1'&&v.phase===expected.phase&&v.sourceIdentityHash===expected.sourceIdentityHash&&v.sourcePathsSha256===expected.sourcePathsSha256);
 need(v.sourceIdentityKind===(v.phase==='prepare'?'reviewed-source-map-file':'freeze-file'));
 need(Number.isSafeInteger(v.originalNodePid)&&v.originalNodePid>0&&v.originalNodePid===expected.nodePid);
 need(typeof v.originalNodeCreationFiletime==='string'&&/^[1-9][0-9]{0,19}$/u.test(v.originalNodeCreationFiletime)&&BigInt(v.originalNodeCreationFiletime)<=18446744073709551615n);
 pin(v.sourceMapHash);pin(v.nodeIdentityHash);
 need(v.testAuditSha256===expected.testAuditSha256&&(v.phase==='test'?SHA.test(v.testAuditSha256):v.testAuditSha256===null));return seal(v);
}

export function validateSpecificityStartupAck(value,bootstrap,readySha256){
 const a=record(value,['schema','phase','sourceIdentityHash','sourceMapHash','originalNodePid','originalNodeCreationFiletime','readySha256','baseline','baselineHash','testAuditSha256']);
 need(a.schema==='native-specificity-startup-ack/v1'&&a.readySha256===pin(readySha256));
 for(const k of ['phase','sourceIdentityHash','sourceMapHash','originalNodePid','originalNodeCreationFiletime','testAuditSha256'])need(a[k]===bootstrap[k]);
 const baseline=record(a.baseline,['schema','node','console','baselineHash']);need(baseline.schema==='native-console-baseline/v1');
 const {baselineHash,...body}=baseline;need(pin(baselineHash)===digest(body)&&baselineHash===a.baselineHash);
 for(const row of [baseline.node,...(baseline.console===null?[]:[baseline.console])]){
  const r=record(row,['pid','creationFiletime','imagePathSha256','imagePathHashEncoding']);
  need(Number.isSafeInteger(r.pid)&&r.pid>0&&typeof r.creationFiletime==='string'&&/^[1-9][0-9]{0,19}$/u.test(r.creationFiletime));
  pin(r.imagePathSha256);need(r.imagePathHashEncoding==='win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1');
 }
 need(baseline.node.pid===bootstrap.originalNodePid&&baseline.node.creationFiletime===bootstrap.originalNodeCreationFiletime);
 const encoding='win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1';
 need(baseline.node.imagePathSha256===hash(encoding+'\0c:\\program files\\nodejs\\node.exe'));
 if(baseline.console!==null)need(baseline.console.pid!==baseline.node.pid&&baseline.console.imagePathSha256===hash(encoding+'\0c:\\windows\\system32\\conhost.exe'));
 need(digest({pid:baseline.node.pid,creationFileTime:baseline.node.creationFiletime,imagePathHash:baseline.node.imagePathSha256,pathEncoding:baseline.node.imagePathHashEncoding})===bootstrap.nodeIdentityHash);return seal(a);
}

export function specificityFreeze(context,sourcePathsSha256,stages,catalogHash){
 const batchIds=Object.fromEntries(['train-cal','test'].map(phase=>[phase,context.manifest.batches.filter(b=>b.phase===phase).map(b=>b.batchId)]));
 need(stages.length===42&&new Set(stages.map(s=>s.batchId)).size===42);
 const body={schema:'native-specificity-study-freeze/v1',sourcePathsSha256:pin(sourcePathsSha256),sourceHashes:Object.fromEntries(Object.entries(context.sourceHashes).sort(([a],[b])=>a<b?-1:a>b?1:0)),
  catalogHash:pin(catalogHash),contextHash:pin(context.contextHash),manifestHash:context.manifest.manifestHash,panelIdentity:context.panel.panelIdentity,
  recipeHash:context.profile.recipeHash,encoderHash:context.encoderHash,assetPinsHash:digest(context.assetPins),packageFiles:context.package.files,packageBytes:context.package.bytes,
  batchIds,batchStageHashes:Object.fromEntries(stages.map(s=>[s.batchId,Object.fromEntries(s.files.map(f=>[f.path,f.sha256]))]))};
 need(same(Object.keys(body.batchStageHashes).sort(),Object.values(batchIds).flat().sort()));return seal({...body,freezeHash:digest(body)});
}

/** Ordering consistency only; actual drain authority belongs to the held wire
 * and native parent. A caller-provided matching snapshot is not such authority. */
export function assertSpecificityDrainStage(snapshot,expectedBatches,stage,finalDrainAckHash=null){
 const s=record(snapshot,['failed','pendingOriginals','unsafeOperationRefused','completedBatches','started','modelStage','previousAckHash']);
 need([24,18].includes(expectedBatches)&&['encoding','checks'].includes(stage));
 need(s.failed===false&&s.pendingOriginals===0&&s.unsafeOperationRefused===false&&s.started===false&&s.completedBatches===expectedBatches&&s.modelStage===stage);
 pin(s.previousAckHash);if(finalDrainAckHash!==null)need(s.previousAckHash===pin(finalDrainAckHash));return true;
}

/** Trusted publication seam used by the actual driver. A valid completed
 * no-reference result has no selected artifact and must not call takeSelection.
 * The surrounding driver owns sticky failure, physical IO and original leases. */
export async function publishSpecificityTrainSelection(input){
 const a=record(input,['semantic','takeSelection','publishSelection','guard']);
 for(const f of [a.takeSelection,a.publishSelection,a.guard])need(typeof f==='function'&&!types.isProxy(f));
 const guard=()=>{const value=a.guard();need(value===undefined||value===true);};
 const data=(value,key)=>{
  need(value!==null&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype);
  const d=Object.getOwnPropertyDescriptor(value,key);need(d?.enumerable===true&&Object.hasOwn(d,'value'));return d.value;
 };
 guard();const status=data(a.semantic,'status');
 const keys=['status','accounted','referenceCount','calibrationSelections',
  ...(status==='selected-pending-independent-audit'?['selectionIdentity','packetHash','artifactHash']:[]),'testAllowed'];
 const semantic=record(a.semantic,keys);
 need(semantic.accounted===96&&semantic.testAllowed===false);
 if(status==='no-reference-set'){
  need(semantic.referenceCount===0&&semantic.calibrationSelections===0);guard();return null;
 }
 need(status==='selected-pending-independent-audit'&&Number.isSafeInteger(semantic.referenceCount)&&
  semantic.referenceCount>0&&semantic.referenceCount<=48&&semantic.calibrationSelections===1);
 for(const key of ['selectionIdentity','packetHash','artifactHash'])pin(semantic[key]);
 guard();const selected=a.takeSelection();guard();
 need(data(selected,'selectionIdentity')===semantic.selectionIdentity);
 const packet=data(selected,'referencePacket');
 need(data(packet,'packetHash')===semantic.packetHash&&data(packet,'artifactHash')===semantic.artifactHash);
 guard();const published=await a.publishSelection(selected);guard();return pin(published);
}

/** Trusted capabilities below are the actual entrypoint's originals. Importing
 * this module cannot create a workspace, read any artifact or start a process. */
export async function runSpecificityDriver({phase,sourceIdentityHash,sourcePathsSha256,testAuditSha256,nodePid,channel,clock,deadline,execution,emitFailure}){
 need(['prepare','train-cal','test'].includes(phase));pin(sourceIdentityHash);pin(sourcePathsSha256);
 need(phase==='test'?SHA.test(testAuditSha256):testAuditSha256===null);
 const repoRoot=path.resolve(fileURLToPath(new URL('../../../../../',import.meta.url)));
 need(repoRoot.toLowerCase()==='d:\\gitprojekts\\universal-discussion-bootstrap');
 const workspaceRoot=path.join(repoRoot,...HERE.split('/'),'output',specificityPhaseLeaf(phase),'node-owned');
 let failed=false,stageDeadline=deadline,io=null,captureModule=null;
 const failureBoundary=createSpecificityDriverFailureBoundary({phase,emitFailure,captureDiagnostic:()=>{
  const value=captureModule?.captureFailureDiagnostic();
  return value==null?null:JSON.stringify(captureModule.projectSpecificityCaptureDiagnostic(value));
 }});
 return failureBoundary.run(async()=>{
 const fail=()=>{failed=true;throw new Error('Specificity driver refused');};
 function localGuard(){if(failed)return fail();const n=clock();if(!Number.isFinite(n)||n>=deadline||n>=stageDeadline)return fail();return true;}
 function guard(){localGuard();channel.assertHealthy();captureModule?.assertCaptureHealthy();localGuard();return true;}
 const cleanGuard=()=>{need(Number.isFinite(clock())&&clock()<deadline+60000);return true;};
 const proof=execution.createSpecificityFsProofWire({phase,sourceIdentityHash,capabilities:{guard:localGuard,now:clock,write:frame=>channel.write(frame),readChunk:()=>channel.readChunk()}});
 // This sole adapter/catalog import exception follows the actual original header
 // and parent's complete pre-Popen CODE authentication. All semantic imports wait
 // the child's repeat CODE gate, below.
 const {createSpecificityIo}=await import('./io.mjs'),{SOURCE_CATALOG}=await import('./source-paths.js');guard();
 const ioCatalog=specificityIoCatalog(SOURCE_CATALOG,phase),layout=specificityWorkspaceLayout(phase);
 io=createSpecificityIo({repoRoot,workspaceRoot,catalog:ioCatalog,expectedCatalogHash:digest(ioCatalog),workspaceLayout:layout,expectedWorkspaceLayoutHash:digest(layout),sourceAssetRoot:ASSETS,
  inspectNoReparse:(_actualPath,context)=>proof.inspect({pathKey:context.pathKey,operationNonce:context.operationNonce,edge:context.edge,parentPathKey:context.parentPathKey}),guard,cleanupGuard:cleanGuard});
 const entry=k=>{const s=ioCatalog.entries.find(e=>e.key===k);need(s!==undefined);return s;};
 const read=k=>io.readEntry(entry(k));
 failureBoundary.mark('bootstrap');
 const bootstrapBytes=await read('control:bootstrap'),bootstrap=validateSpecificityBootstrap(parseCanonical(bootstrapBytes,16384),{phase,sourceIdentityHash,sourcePathsSha256,nodePid,testAuditSha256});
 const sourceList=execution.authenticateSpecificitySourceList(await read(HERE+'/source-paths.js'),sourcePathsSha256);
 const identityKey=phase==='prepare'?'control:reviewed-sources':'control:freeze',identityBytes=await read(identityKey);let frozen=null,sourcePins;
 if(phase==='prepare')sourcePins=execution.authenticateSpecificityReviewedMap(identityBytes,sourceIdentityHash,sourceList).sourceHashes;
 else{frozen=execution.authenticateSpecificityFreeze(identityBytes,sourceIdentityHash,sourceList);sourcePins=frozen.sourceHashes;}
 await io.createWorkspace();guard();
 const publish=async(name,value)=>{guard();const b=Buffer.isBuffer(value)?value:bytes(value);const out=await io.publishExclusive({path:name,bytes:b,beforePublish:guard});guard();need(out.sha256===hash(b));return out.sha256;};
 const ready={schema:'native-specificity-ready/v1',phase,sourceIdentityHash,sourceMapHash:bootstrap.sourceMapHash,testAuditSha256,originalNodePid:nodePid,originalNodeCreationFiletime:bootstrap.originalNodeCreationFiletime,baselineHash:'pending'};
 const readySha256=await publish('ready.json',ready),startupUntil=Math.min(deadline,clock()+15000);
 const pause=ms=>new P(resolve=>setTimeout(resolve,ms));
 async function poll(name,until){for(;;){guard();need(clock()<until);const b=await io.readPublishedIfPresent(name);guard();need(clock()<until);if(b!==null)return b;await pause(Math.min(20,Math.max(1,until-clock())));}}
 const ackBytes=await poll('ack.json',startupUntil),ack=validateSpecificityStartupAck(parseCanonical(ackBytes,16384),bootstrap,readySha256);
 const bindings={sourceMapHash:bootstrap.sourceMapHash,nodeIdentityHash:bootstrap.nodeIdentityHash,readySha256,startupAckSha256:hash(ackBytes),baselineHash:ack.baselineHash};
 failureBoundary.mark('code-auth');await execution.authenticateSpecificityCode({sourceList,sourceHashes:sourcePins,readLiteral:k=>read(k),guard});guard();
 const {createSpecificitySourceLedger}=await import('./source-ledger.js');guard();
 const expectedSourceHashes=Object.fromEntries(sourceList.paths.map(k=>[k,sourcePins[k]]));
 const ledger=createSpecificitySourceLedger({catalog:SOURCE_CATALOG,expectedCatalogHash:digest(SOURCE_CATALOG),expectedSourceHashes,readEntry:s=>io.readEntry(s),walkPackage:k=>io.walkPackage(k),guard});
 failureBoundary.mark('source-ledger');const context=await ledger.inspect();guard();need(digest(Object.fromEntries(Object.entries(context.sourceHashes).sort(([a],[b])=>a<b?-1:a>b?1:0)))===bootstrap.sourceMapHash);
 failureBoundary.mark('stage-prepare');
 const {buildSpecificityStage,STAGE_SOURCE_PATHS}=await import('./stage.js');guard();
 const paths={'manifest.json':HERE+'/manifest.json','worker.js':HERE+'/worker.js','native-adapter.js':HERE+'/native-adapter.js',
  'native-rights.js':'spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/native-rights.js',
  'chromium/page-content-reader.js':'spikes/topic-resolution/browser/chromium/page-content-reader.js','core/page-content-policy.js':'spikes/topic-resolution/browser/core/page-content-policy.js'};
 const stageTexts={},stagePins={};for(const k of STAGE_SOURCE_PATHS){guard();const raw=await read(paths[k]);need(hash(raw)===context.sourceHashes[paths[k]]);stageTexts[k]=new TextDecoder('utf-8',{fatal:true}).decode(raw);stagePins[k]=context.sourceHashes[paths[k]];}
 const stages=context.manifest.batches.map(batch=>{guard();return buildSpecificityStage({manifest:context.manifest,batch,expectedPanelIdentity:context.panel.panelIdentity,expectedManifestHash:context.manifest.manifestHash,expectedSourceHashes:stagePins,sources:stageTexts});});
 const prepared=specificityFreeze(context,sourcePathsSha256,stages,digest(SOURCE_CATALOG));
 if(frozen)need(same(prepared,frozen));
 async function endchecks(){failureBoundary.mark('endchecks');guard();need(await ledger.recheck(context)===true);guard();await io.streamAssets(context.assetPins);guard();
  need((await read('control:bootstrap')).equals(bootstrapBytes));need((await read(identityKey)).equals(identityBytes));guard();return true;}
 // Nonprepare asset proofs are parent-gated until the final cohort drain.
 // Source ledger authenticates the manifest/pins now, not those nine asset bytes.
 if(phase==='prepare'){failureBoundary.mark('asset-checks');await io.streamAssets(context.assetPins);guard();}
 let resultValue,selectionSha256=null,finalDrainAckHash=null;
 if(phase==='prepare'){
  await endchecks();failureBoundary.mark('prepare-publish');const freezeSha256=await publish('freeze.json',prepared);
  resultValue={schema:'native-specificity-study-prepared/v1',phase,sourceIdentityHash,...bindings,freezeSha256,fsProofCheckpoint:proof.checkpoint(),sourceAssetEndchecksPassed:true,productionValidated:false,assignmentAuthority:false};
 }else{
  // Actual public/model composition is loaded only after both CODE gates,
  // baseline identity and full source/package ledger. Asset bytes wait drain.
  failureBoundary.mark('semantic-setup');const modules=await Promise.all([import('./run.mjs'),import('./browser-capture.mjs'),import('./network-policy.js'),import('./dns-resolver.js'),import('./origin-policy.js'),
   import('../../../../../apps/local-service/src/crawler/public-fetch.js'),import('../../../../../apps/local-service/src/crawler/robots.js'),
   import('../../../../../apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js'),import('../../current-producer-final-v2/policy.js')]);guard();
  captureModule=modules[1];
  const drain=execution.createSpecificityDrainWire({phase,freezeHash:prepared.freezeHash,manifestHash:context.manifest.manifestHash,nodeIdentityHash:bindings.nodeIdentityHash,sourceMapHash:bindings.sourceMapHash,
   batchIds:prepared.batchIds[phase],capabilities:{guard,now:clock,publish:async(name,b)=>{await publish(name,b);return true;},read:name=>io.readPublishedIfPresent(name),sleep:pause}});
  let admission=null;
  if(phase==='test'){
   failureBoundary.mark('test-admission');
   const {admitSpecificityTest}=await import('./test-admission.js');guard();
   const bundle={auditBytes:await read('audit:selection-audit'),supervisorBytes:await read('audit:train-supervisor'),resultBytes:await read('audit:train-result'),selectionBytes:await read('audit:train-selection')};guard();
   // Final source read authenticates model/transfer identity, never a new fit.
   const {compileNativeRootRankCandidate,describeNativeRootRankCandidate}=await import('../../../../../apps/local-service/experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js');guard();
   admission=admitSpecificityTest({expectedAuditFileHash:testAuditSha256,bundle,context:{freezeFileSha256:sourceIdentityHash,freezeHash:prepared.freezeHash,sourceMapHash:bindings.sourceMapHash,
    panelIdentity:context.panel.panelIdentity,manifestHash:context.manifest.manifestHash,producerRecipeHash:context.profile.recipeHash,rootReuseReceiptHash:context.rootReuse.receiptHash,
    rootTransferHash:describeNativeRootRankCandidate(compileNativeRootRankCandidate(context.rootCandidate)).transferHash,manifest:context.manifest,rootCandidate:context.rootCandidate},guard});guard();
  }
  const {createSpecificityPacing}=await import('./pacing.mjs');guard();
  const pacing=createSpecificityPacing({origins:[...new Set(context.manifest.cases.map(c=>new URL(c.publicUrl).origin))].sort(),seed:admission?.networkPacing??null,
   clock,guard,sleep:pause,parseRobots:modules[7].parseRobotsWithKnownDenySpaceRepair,evaluateRobots:modules[6].evaluateRobots,unavailable:()=>new modules[8].ControlUnavailable('origin-policy-budget')});
  let chromium=null,activeBatchOrigins=null;
  const runner=modules[0].createSpecificityPhaseRunner({manifest:context.manifest,expectedPanelIdentity:context.panel.panelIdentity,expectedManifestHash:context.manifest.manifestHash,
   profileSet:context.profile,expectedRecipeHash:context.profile.recipeHash,rootCandidate:context.rootCandidate,rootReuseReceiptHash:context.rootReuse.receiptHash,
   phase,selection:admission?.selection??null,nodeIdentityHash:bindings.nodeIdentityHash,phaseDeadline:deadline,capabilities:{guard,now:clock,
    assertCaptureHealthy:()=>captureModule.assertCaptureHealthy(),releaseBatch:summary=>{
     captureModule.releaseCapturedBatch(summary);need(activeBatchOrigins!==null);pacing.closedBatch(activeBatchOrigins);activeBatchOrigins=null;
    },
    async captureBatch({batch,onRow}){
     failureBoundary.mark('batch-start');guard();const batchStarted=clock();stageDeadline=Math.min(deadline,batchStarted+360000);await drain.beginBatch({batchId:batch.batchId,batchIndex:batch.batchIndex});guard();
     need(activeBatchOrigins===null);activeBatchOrigins=[...new Set(batch.cases.map(c=>new URL(c.url).origin))].sort();
     const name=relative(batch),stage=stages.find(s=>s.batchId===batch.batchId);need(stage!==undefined);
     failureBoundary.mark('batch-stage');await io.createDirectory(name);await io.createDirectory(name+'/profile');
     // stageExtension itself exclusively creates its directories: do not precreate.
     const staged=await io.stageExtension({directory:name+'/extension',stage,expectedStageIdentity:stage.stageIdentity,beforePublish:guard});guard();
     const scope=modules[2].compileSpecificityNetworkScope({scope:(await import('./manifest.js')).deriveBatchNetworkScope(context.manifest,batch),batch});
     failureBoundary.mark('batch-dns');const resolved=await modules[3].resolveNativeStudyDns({scope,guard,clock});guard();
     const fetchPublic=modules[5].createPublicFetcher({dnsLookup:modules[2].createNativePolicyDnsLookup(resolved.dnsPins)});
     const collectPolicies=opts=>pacing.collect({...opts,fetchPublic,collect:modules[4].collectOriginPolicies});
     if(chromium===null){chromium=(await import(pathToFileURL(path.join(repoRoot,...PACKAGE.split('/'),'index.mjs')).href)).chromium;guard();}
     // Original fixed Chrome selection remains independently checked by parent.
     failureBoundary.mark('browser-capture');const summary=await captureModule.captureNativeSpecificityBatch({manifest:context.manifest,batch,expectedPanelIdentity:context.panel.panelIdentity,expectedManifestHash:context.manifest.manifestHash,
      dnsPins:resolved.dnsPins,chromium,stagedExtensionPath:path.join(workspaceRoot,name,'extension'),executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
      profilePath:path.join(workspaceRoot,name,'profile'),studyId:'specificity-'+batch.batchId,onRow,guard,collectPolicies,clock,pause});guard();
     failureBoundary.mark('batch-recheck');await staged.recheck();guard();return summary;
    },
    requestBatchDrain:r=>{failureBoundary.mark('batch-drain');return drain.requestBatchDrain(r);},verifyBatchDrain:r=>drain.verifyBatchDrain(r),
    async requestFinalDrain(r){failureBoundary.mark('cohort-drain');stageDeadline=deadline;const receipt=await drain.requestFinalDrain(r);finalDrainAckHash=receipt.receiptHash;return receipt;},
    async createEncoder(){failureBoundary.mark('encoding');guard();assertSpecificityDrainStage(drain.snapshot(),prepared.batchIds[phase].length,'encoding',finalDrainAckHash);await io.streamAssets(context.assetPins);guard();const {createPackagedCrawlerEmbedder}=await import('../../../../../apps/local-service/src/crawler/packaged-e5.js');guard();const encoder=await createPackagedCrawlerEmbedder({assetRoot:path.join(repoRoot,...ASSETS.split('/'))});guard();return encoder;},
    recheckAssetsAndSources:endchecks,authorizeTest:r=>{guard();need(admission!==null&&r.selectionIdentity===admission.selectionIdentity);return {manifestHash:admission.manifestHash,selectionIdentity:admission.selectionIdentity,auditIdentity:admission.auditIdentity};},
    enterModelStage:r=>{failureBoundary.mark(r.stage);return drain.enterModelStage(r);}}});
  const result=await runner.run();guard();
  if(phase==='train-cal')selectionSha256=await publishSpecificityTrainSelection({semantic:result.semantic,
   takeSelection:()=>runner.takeSelection(),publishSelection:value=>publish('selection.json',value),guard});
  assertSpecificityDrainStage(drain.snapshot(),prepared.batchIds[phase].length,'checks',finalDrainAckHash);
  resultValue={schema:'native-specificity-study-result/v1',phase,freezeHash:prepared.freezeHash,...bindings,result:{...result,networkPacing:pacing.snapshot()},selectionSha256,
   fsProofCheckpoint:proof.checkpoint(),sourceAssetEndchecksPassed:true,productionValidated:false,assignmentAuthority:false};
 }
 failureBoundary.mark('publication');const resultSha256=await publish('result.json',resultValue);guard();
 const finish={schema:'native-specificity-finish-request/v1',phase,sourceIdentityHash,...bindings,resultSha256,selectionSha256,finalDrainAckHash,fsProofCheckpoint:proof.checkpoint()};
 failureBoundary.mark('finish');const finishRequestSha256=await publish('finish.request.json',finish),finishAckBytes=await poll('finish.ack.json',Math.min(deadline,clock()+15000));
 const finishAck=parseCanonical(finishAckBytes,16384),expected={schema:'native-specificity-finish-ack/v1',phase,sourceIdentityHash,...bindings,requestHash:finishRequestSha256,resultSha256,selectionSha256};need(same(finishAck,expected));guard();
 failureBoundary.mark('completion');await publish('completion.json',{schema:'native-specificity-study-complete/v1',phase,sourceIdentityHash,...bindings,finishRequestSha256,finishAckSha256:hash(finishAckBytes),resultSha256,selectionSha256,finalDrainAckHash,fsProofCheckpoint:proof.checkpoint()});
 guard();const state=io.snapshot();need(!state.failed&&!state.busy&&state.pendingOriginals===0&&state.openHandles===0&&!state.closeUncertain&&!state.unsafeOperationRefused);
 proof.checkpoint();channel.finish();localGuard();
 return seal({completed:true,phase,physicalParentExitProofRequired:true});
 });
}
