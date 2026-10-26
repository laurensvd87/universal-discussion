// Default inert. NO Playwright import, browser, public request or app access here.
import { readFile,lstat,realpath,readdir,mkdir,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname,resolve,relative,sep } from 'node:path';
import {types} from 'node:util';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { createDocumentGate,reserveDocument,verifyResponse,bindDocument,assertDocument,retainPairedSnapshot,closeDocumentGate,
 collectOriginPolicies,requestHeaders,ControlFatal,ControlUnavailable,browserRequestFailureReason } from './policy.js';
import {BATCHES,CANDIDATE_SHA256,LABEL_SEAL_SHA256,validateCandidateStructure,fixedBatch,buildInputPacket,validatePriorBatch,deriveDocumentIdentity} from './manifest.js';
import {CONSTRUCTION_SOURCE_KEYS,buildBrowserProducerProfile} from './producer-profiles.js';
import {validateBrowserArtifactReuseReceipt,ARTIFACT_REUSE_DEPENDENCY_PINS} from './artifact-reuse.js';
const HERE=dirname(fileURLToPath(import.meta.url)),REPO=resolve(HERE,'../../../..');
const READER='spikes/topic-resolution/browser/chromium/page-content-reader.js';
const READER_SHA='c7946a7e19adb3fd9c14b2304101dbd3bf8b7c92fd1ab7c3ba679104b55e428f';
const PW_ROOT=resolve(REPO,'spikes/topic-resolution/harness/experimental/playwright-dev-v1/node_modules/playwright-core');
const CANDIDATE='apps/local-service/data/hierarchy-current-producer-transfer-candidates-adr143.json',LABEL_SEAL='apps/local-service/data/hierarchy-current-producer-transfer-label-seal-adr143.json';
const REUSE='apps/local-service/data/hierarchy-browser-root-artifact-reuse-adr148.json',FIT='apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/';
const PACKAGE='node_modules/playwright-core/';
let operationFailure=null;
export const PACKAGE_INTEGRITY='sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ==';
export const OLD_FIT_SOURCE_PATHS=Object.freeze({
  "fit.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/fit.js",
  "contracts.test.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/contracts.test.js",
  "protocol.json": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/protocol.json",
  "supervise.py": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/supervise.py",
  "manifest.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/manifest.js",
  "methods.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.js",
  "methods.test.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/methods.test.js",
  "README.md": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/README.md",
  "producer-profiles.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.js",
  "producer-profiles.test.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.test.js",
  "../builder-scoped-root-rank-candidate-v1/scorer.js": "apps/local-service/experiments/topic-encoder/builder-scoped-root-rank-candidate-v1/scorer.js",
  "../../../src/domain/hierarchical-e5-paired-input.js": "apps/local-service/src/domain/hierarchical-e5-paired-input.js",
  "../../../src/domain/hierarchical-e5-paired-linear-heads.js": "apps/local-service/src/domain/hierarchical-e5-paired-linear-heads.js",
  "../hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js",
  "../hierarchical-e5-broad-heads-v1/vector-packet.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-broad-heads-v1/vector-packet.js",
  "../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js": "spikes/topic-resolution/harness/deny-external-capabilities.js"
});
export const OLD_TARGET_SOURCE_PATHS=Object.freeze({
  "../../../../../spikes/topic-resolution/harness/current-producer-final-v1/run.mjs": "spikes/topic-resolution/harness/current-producer-final-v1/run.mjs",
  "../../../../../spikes/topic-resolution/harness/current-producer-final-v1/policy.js": "spikes/topic-resolution/harness/current-producer-final-v1/policy.js",
  "../../../../../spikes/topic-resolution/harness/current-producer-final-v1/manifest.js": "spikes/topic-resolution/harness/current-producer-final-v1/manifest.js",
  "../../../../../spikes/topic-resolution/harness/current-producer-final-v1/protocol.json": "spikes/topic-resolution/harness/current-producer-final-v1/protocol.json",
  "../../../../../spikes/topic-resolution/browser/core/page-content-policy.js": "spikes/topic-resolution/browser/core/page-content-policy.js",
  "../../../../../apps/local-service/src/crawler/public-fetch.js": "apps/local-service/src/crawler/public-fetch.js",
  "../../../../../apps/local-service/src/crawler/robots.js": "apps/local-service/src/crawler/robots.js",
  "../../../../../apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js": "apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js",
  "../../../../../apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.js": "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-v1/producer-profiles.js",
  "../../../../../apps/local-service/src/crawler/static-capture.js": "apps/local-service/src/crawler/static-capture.js",
  "../../../../../spikes/topic-resolution/browser/chromium/page-content-reader.js": "spikes/topic-resolution/browser/chromium/page-content-reader.js"
});
export const SOURCE_FILES=Object.freeze(Object.fromEntries([
 ['run.mjs',resolve(HERE,'run.mjs')],['policy.js',resolve(HERE,'policy.js')],['manifest.js',resolve(HERE,'manifest.js')],
 ['producer-profiles.js',resolve(HERE,'producer-profiles.js')],['supervise.py',resolve(HERE,'supervise.py')],['protocol.json',resolve(HERE,'protocol.json')],
 ['run.test.mjs',resolve(HERE,'run.test.mjs')],['policy.test.mjs',resolve(HERE,'policy.test.mjs')],['manifest.test.mjs',resolve(HERE,'manifest.test.mjs')],['README.md',resolve(HERE,'README.md')],
 ['artifact-reuse.js',resolve(HERE,'artifact-reuse.js')],['artifact-reuse.test.mjs',resolve(HERE,'artifact-reuse.test.mjs')],
 ['page-content-reader.js',resolve(REPO,READER)],['page-content-policy.js',resolve(REPO,'spikes/topic-resolution/browser/core/page-content-policy.js')],
 ['final-policy.js',resolve(REPO,'spikes/topic-resolution/harness/current-producer-final-v2/policy.js')],['final-manifest.js',resolve(REPO,'spikes/topic-resolution/harness/current-producer-final-v2/manifest.js')],
 ['public-fetch.js',resolve(REPO,'apps/local-service/src/crawler/public-fetch.js')],['robots.js',resolve(REPO,'apps/local-service/src/crawler/robots.js')],
 ['static-capture.js',resolve(REPO,'apps/local-service/src/crawler/static-capture.js')],['robots-deny-space-repair.js',resolve(REPO,'apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js')],
 ['package.json',resolve(PW_ROOT,'../../package.json')],['package-lock.json',resolve(PW_ROOT,'../../package-lock.json')],
 ['ADR148.md',resolve(REPO,'decisions/ADR-148-browser-input-transfer-with-fixed-root-model.md')],
 [CANDIDATE,resolve(REPO,CANDIDATE)],[LABEL_SEAL,resolve(REPO,LABEL_SEAL)],[REUSE,resolve(REPO,REUSE)],
 [FIT+'freeze.json',resolve(REPO,FIT+'freeze.json')],[FIT+'output/supervisor.json',resolve(REPO,FIT+'output/supervisor.json')],
 [FIT+'output/selection-receipt.json',resolve(REPO,FIT+'output/selection-receipt.json')],
 ...[...Object.values(OLD_FIT_SOURCE_PATHS),...Object.values(OLD_TARGET_SOURCE_PATHS),...Object.keys(ARTIFACT_REUSE_DEPENDENCY_PINS)].map(p=>[p,resolve(REPO,p)])
]));
export const LAUNCH_ARGUMENTS=Object.freeze(['--no-first-run','--no-default-browser-check','--disable-background-networking',
 '--disable-component-update','--disable-domain-reliability','--disable-sync','--disable-quic','--disable-client-side-phishing-detection',
 '--safebrowsing-disable-auto-update','--disable-default-apps','--autoplay-policy=user-gesture-required']);
const sha=b=>createHash('sha256').update(b).digest('hex');
const sleep=ms=>new Promise(yes=>setTimeout(yes,ms));
const fatal=()=>{throw new ControlFatal('response-integrity');};
async function absent(path){try{await lstat(path);fatal();}catch(e){if(e.code!=='ENOENT')throw e;}}
async function checked(path,max=4*1024*1024){
 const absolute=resolve(path),rel=relative(REPO,absolute);if(rel.startsWith('..')||resolve(REPO,rel)!==absolute)fatal();
 let part=REPO;for(const segment of rel.split(sep)){part=resolve(part,segment);if((await lstat(part)).isSymbolicLink())fatal();}
 const info=await lstat(absolute);if(!info.isFile()||info.size>max||(await realpath(absolute)).toLowerCase()!==absolute.toLowerCase())fatal();
 const b=await readFile(absolute);if(b.length>max||b.length!==info.size)fatal();return b;
}
async function sources(){
 const paths={...SOURCE_FILES},root=PW_ROOT;let files=0,total=0;
 async function walk(path,depth=0){
  if(depth>8||(await lstat(path)).isSymbolicLink()||(await realpath(path)).toLowerCase()!==path.toLowerCase())fatal();
  const children=await readdir(path,{withFileTypes:true});if(children.length>128)fatal();
  for(const entry of children.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
   const file=resolve(path,entry.name);if(entry.isSymbolicLink())fatal();
   if(entry.isDirectory())await walk(file,depth+1);else if(entry.isFile()){
    if(++files>128)fatal();const b=await checked(file);total+=b.length;if(total>16*1024*1024)fatal();paths[PACKAGE+relative(root,file).split(sep).join('/')]=file;
   }else fatal();
  }
 }
 await walk(root);if(Object.keys(paths).length>256)fatal();const hashes={},buffers={};for(const [key,path]of Object.entries(paths)){const b=await checked(path);hashes[key]=sha(b);buffers[key]=b;}
 if(hashes['page-content-reader.js']!==READER_SHA)fatal();
 const pkg=JSON.parse(buffers[PACKAGE+'package.json']);const lock=JSON.parse(buffers['package-lock.json']);
 if(pkg.name!=='playwright-core'||pkg.version!=='1.64.1'||lock.packages?.['node_modules/playwright-core']?.integrity!==PACKAGE_INTEGRITY)fatal();
 if(hashes[CANDIDATE]!==CANDIDATE_SHA256||hashes[LABEL_SEAL]!==LABEL_SEAL_SHA256)fatal();
 const candidates=JSON.parse(buffers[CANDIDATE]),cases=validateCandidateStructure(candidates),seal=JSON.parse(buffers[LABEL_SEAL]);
 if(seal.schema!=='hierarchy-current-producer-label-seal/v1'||seal.candidateSha256!==CANDIDATE_SHA256||seal.labelsFrozenBeforeFinalInputs!==true||
  seal.rootReviewed!==true||seal.independentlyReviewed!==true||seal.noFinalInputsRead!==true||seal.caseCount!==32||JSON.stringify(seal.caseIds)!==JSON.stringify(BATCHES.flat()))fatal();
 const projection=candidates.cases.map(c=>({id:c.id,entityGroup:c.entityGroup,publicUrl:c.publicUrl,language:c.language,expectedRootId:c.expectedRootId,supportedPathPrefix:c.supportedPathPrefix,maximumSpecificityKnown:c.maximumSpecificityKnown}));
 if(sha(JSON.stringify(projection))!==seal.labelIdentityHash)fatal();
 for(const [p,h]of Object.entries(ARTIFACT_REUSE_DEPENDENCY_PINS))if(hashes[p]!==h)fatal();
 const profiles=buildBrowserProducerProfile({runtimeSourceHashes:Object.fromEntries(CONSTRUCTION_SOURCE_KEYS.map(k=>[k,hashes[k]])),
  packageSourceHashes:Object.fromEntries(Object.entries(hashes).filter(([k])=>k.startsWith(PACKAGE)))});
 const oldSourceHashes=Object.fromEntries(Object.entries(OLD_FIT_SOURCE_PATHS).map(([k,p])=>[k,hashes[p]]));
 const oldTargetHashes=Object.fromEntries(Object.entries(OLD_TARGET_SOURCE_PATHS).map(([k,p])=>[k,hashes[p]]));
 const oldFreeze=JSON.parse(buffers[FIT+'freeze.json']);
 if(JSON.stringify(oldFreeze.sourceHashes)!==JSON.stringify(oldSourceHashes)||JSON.stringify(oldFreeze.targetSourceHashes)!==JSON.stringify(oldTargetHashes))fatal();
 const reuseReceipt=validateBrowserArtifactReuseReceipt({receipt:JSON.parse(buffers[REUSE]),oldProof:{freezeBytes:buffers[FIT+'freeze.json'],
  supervisorBytes:buffers[FIT+'output/supervisor.json'],selectionReceiptBytes:buffers[FIT+'output/selection-receipt.json'],sourceHashes:oldSourceHashes},
  next:{browserProfile:profiles.producerProfile,profileRecipeHash:profiles.recipeHash,protocolSha256:hashes['protocol.json'],candidateSha256:hashes[CANDIDATE],labelSealSha256:hashes[LABEL_SEAL]}});
 const freezeBytes=await checked(resolve(HERE,'freeze.json')),f=JSON.parse(freezeBytes);const {freezeHash,...body}=f;
 if(f.schema!=='browser-root-transfer-freeze/v1'||sha(JSON.stringify(body))!==freezeHash||JSON.stringify(f.sourceHashes)!==JSON.stringify(hashes)||
  f.protocolSha256!==hashes['protocol.json']||f.artifactReuseReceiptSha256!==hashes[REUSE]||f.candidateSha256!==hashes[CANDIDATE]||
  f.labelSealSha256!==hashes[LABEL_SEAL]||JSON.stringify(f.targetProfiles)!==JSON.stringify(reuseReceipt.targetProfiles))fatal();
 return {paths,hashes,buffers,freezeHash,freezeSha256:sha(freezeBytes),cases,profiles,reuseReceipt};
}
async function recheck(initial){
 const next=await sources();if(JSON.stringify(next.hashes)!==JSON.stringify(initial.hashes)||next.freezeSha256!==initial.freezeSha256)fatal();
}
export function createCompletionFence({clock,guard,current,failure,finishing}){
 return article=>{guard();if(failure())throw failure();if(current()!==article||article.stopping||finishing())fatal();
  if(article.refusal)throw new ControlUnavailable(article.refusal);if(clock()>=article.until)throw new ControlUnavailable('article-timeout');};
}
export function createArticleCallbacks({article,frameId,current,resource,fail,clock}){
 const live=()=>current()===article&&!article.stopping;
 const guarded=fn=>value=>{try{if(!live())return;resource();fn(value);}catch(e){fail(e);}};
 return Object.freeze({
  frameNavigated:guarded(p=>{if(p.frame.parentId)return;if(p.frame.id!==frameId||p.frame.url!==article.url||article.committed)fatal();
   article.committed={frameId:p.frame.id,loaderId:p.frame.loaderId,url:p.frame.url};}),
  lifecycle:guarded(p=>{if(p.name!=='DOMContentLoaded'||p.frameId!==frameId)return;if(article.dcl)fatal();article.dcl={frameId:p.frameId,loaderId:p.loaderId,at:clock()};}),
  frameDetached:guarded(p=>{if(p.frameId===frameId)fatal();}),
  contextsCleared:guarded(()=>{if(article.worldId)fatal();}),
  contextDestroyed:guarded(p=>{if(article.worldId===p.executionContextId)fatal();}),
  requestFailed:guarded(request=>{
   if(article.blockedRequests?.has(request))return;
   if(request!==article.request)fatal();
   const reason=browserRequestFailureReason(request.failure());
   if(reason)article.refusal=reason;else throw new ControlFatal('unhandled-transport');
  })
 });
}
export function projectError(error){return {kind:error instanceof ControlUnavailable?'unavailable':'fatal',
 reason:error instanceof ControlUnavailable?error.code:error instanceof ControlFatal?error.code:'client-or-validation-failure',operationFailure};}
export function rethrowGotoRejection(error,article,{guard,failure,fence}){
 guard();if(failure())throw failure();
 // ONLY this awaited client goto rejection may use an already-observed native
 // request refusal. Programming subclasses/our protocol/deadline errors never do.
 if(!article.refusal||!error||types.isProxy(error)||!types.isNativeError(error)||Object.getPrototypeOf(error)!==Error.prototype)throw error;
 fence(article);throw error;
}
export function rpcWindow(now,articleUntil,maximumMs,isGoto){
 if(!Number.isFinite(now)||!Number.isFinite(maximumMs)||maximumMs<=0||typeof isGoto!=='boolean'||articleUntil!==null&&!Number.isFinite(articleUntil))fatal();
 const remaining=articleUntil===null?Infinity:articleUntil-now;
 const maximum=isGoto&&articleUntil!==null?remaining:Math.min(10000,maximumMs);
 return {waitMs:Math.min(maximum,remaining),articleDeadline:articleUntil!==null&&remaining<=maximum};
}
export function rpcDeadlineError({article,articleDeadline,clock,current,finishing,guard,failure,closeGate}){
 try{
  guard();if(failure())return failure();
  if(articleDeadline&&article&&clock()>=article.until){
   if(current()!==article||article.stopping||finishing())return new ControlFatal('response-integrity');
   article.stopping=true;closeGate(article.gate);return new ControlUnavailable('article-timeout');
  }
  return new ControlFatal('protocol-failed');
 }catch(error){return error;}
}
export async function openAfterPagePolicy({beforePage,url,guard,failure,openContext}){
 guard();if(failure())throw failure();
 try{await beforePage(url);}catch(error){guard();if(failure())throw failure();throw error;}
 guard();if(failure())throw failure();return openContext();
}
async function handshake(batch){
 if(process.env.MURMINGLE_BROWSER_ROOT_TRANSFER_V1_SUPERVISED!==String(batch))fatal();let wire='';
 await new Promise((yes,no)=>{const timer=setTimeout(()=>no(new ControlFatal('aborted')),5000);
  const onData=chunk=>{wire+=chunk.toString('ascii');if(wire.length>128||wire.includes('\n')){clearTimeout(timer);process.stdin.off('data',onData);wire===`BROWSER_ROOT_TRANSFER_JOB_ASSIGNED_V1:${batch}\n`?yes():no(new ControlFatal('aborted'));}};
  process.stdin.on('data',onData);process.stdin.once('end',()=>{clearTimeout(timer);if(wire!==`BROWSER_ROOT_TRANSFER_JOB_ASSIGNED_V1:${batch}\n`)no(new ControlFatal('aborted'));});});
}
async function executable(){
 for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']){
  try{const s=await lstat(p);if(s.isFile()&&!s.isSymbolicLink()&&(await realpath(p)).toLowerCase()===resolve(p).toLowerCase())return p;}catch(e){if(e.code!=='ENOENT')throw e;}
 }fatal();
}
export function batchOutput(batch){if(!Number.isInteger(batch)||batch<1||batch>8)fatal();return resolve(HERE,'output-batch-'+String(batch).padStart(2,'0'));}
async function evidenceBudget(output,extra=0){
 let total=extra;for(const entry of await readdir(output,{withFileTypes:true})){
  if(entry.name==='temp'&&entry.isDirectory()&&!entry.isSymbolicLink())continue;
  const p=resolve(output,entry.name),info=await lstat(p);if(!info.isFile()||info.isSymbolicLink())fatal();total+=info.size;if(total>256*1024)fatal();
 }
 return total;
}
async function priorEvidence(initial,batch){
 const prior=[];
 for(let previous=1;previous<batch;previous++){
  const output=batchOutput(previous),paths=['result.json','supervisor.json','input.packet.json'].map(p=>resolve(output,p));
  const buffers=await Promise.all(paths.map(p=>checked(p,128*1024))),hashes=buffers.map(sha);
  validatePriorBatch({batch:previous,freezeHash:initial.freezeHash,freezeSha256:initial.freezeSha256,sourceHashes:initial.hashes,
   result:JSON.parse(buffers[0]),supervisor:JSON.parse(buffers[1]),packetSha256:hashes[2],resultSha256:hashes[0]});
  prior.push({batch:previous,paths,hashes}); // packet bytes hashed, NEVER parsed/read as model input
 }
 return prior;
}
export async function run(batch){
 if(!Number.isInteger(batch)||batch<1||batch>8)fatal();
 const OUTPUT=batchOutput(batch);
 await handshake(batch); // Before client dynamic import AND all public work/browser spawn.
 const started=performance.now(),deadline=started+165000;
 const guard=()=>{if(performance.now()>=deadline)throw new ControlFatal('absolute-job-deadline');};
 if(!/^D:/iu.test(HERE))fatal();await absent(resolve(OUTPUT,'node.started.json'));await absent(resolve(OUTPUT,'result.json'));
 const initial=await sources(),scope=fixedBatch(initial.cases,batch),prior=await priorEvidence(initial,batch);await writeFile(resolve(OUTPUT,'node.started.json'),JSON.stringify({schema:'browser-root-transfer-started/v1',sourceHashes:initial.hashes,freezeSha256:initial.freezeSha256}),{flag:'wx'});
 const policy=await collectOriginPolicies({cases:scope,browser:true,batch,guard});guard();if(policy.elapsedMs>60000)throw new ControlFatal('absolute-job-deadline');
 const {chromium}=await import(pathToFileURL(resolve(PW_ROOT,'index.mjs')).href);guard();await recheck(initial);
 const {collectPageContent}=await import(pathToFileURL(resolve(REPO,READER)).href);await recheck(initial);guard();
 let browser,context,current=null,failure=null,finishing=false,pending=0,peakPending=0,eventCount=0,navigationMs=0,expectingPage=false,openingPage=null;
 const operations=new Set(),rows=[],inputs=[];const fail=e=>{failure??=e instanceof ControlFatal?e:new ControlFatal('callback-failed');};
 const track=promise=>{const p=promise.catch(fail).finally(()=>operations.delete(p));operations.add(p);};
 const fence=createCompletionFence({clock:()=>performance.now(),guard,current:()=>current,failure:()=>failure,finishing:()=>finishing});
 async function rpc(operation,ms=10000,cleanup=false,stage='coordinator'){
  if(!cleanup){guard();if(failure)throw failure;}
  const scope=!cleanup&&current&&!current.stopping?current:null;
  const window=rpcWindow(performance.now(),scope?.until??null,ms,stage==='navigate');
  if(window.waitMs<=0)throw rpcDeadlineError({article:scope,articleDeadline:true,clock:()=>performance.now(),current:()=>current,finishing:()=>finishing,guard,failure:()=>failure,closeGate:closeDocumentGate});
  if(++pending>128){pending--;operationFailure??={stage,category:'coordinator-capacity'};throw new ControlFatal('request-capacity');}peakPending=Math.max(peakPending,pending);
  let timer;const p=Promise.resolve().then(operation);p.catch(()=>{});p.then(()=>pending--,()=>pending--);
  try{return await Promise.race([p,new Promise((_,no)=>{timer=setTimeout(()=>{
   operationFailure??={stage,category:'coordinator-rpc-deadline'};
   no(rpcDeadlineError({article:scope,articleDeadline:window.articleDeadline,clock:()=>performance.now(),current:()=>current,finishing:()=>finishing,guard,failure:()=>failure,closeGate:closeDocumentGate}));
  },Math.max(1,Math.ceil(window.waitMs)));})]);}catch(e){operationFailure??={stage,category:'client-operation-rejected'};throw e;}finally{clearTimeout(timer);}
 }
 const resource=()=>{if(++eventCount>4096)throw new ControlFatal('request-capacity');guard();};
 try{
  const chromePath=await executable();guard();
  browser=await rpc(()=>chromium.launch({executablePath:chromePath,headless:true,chromiumSandbox:true,args:[...LAUNCH_ARGUMENTS],timeout:10000}),10000,false,'browser-launch');
  async function openContext(){
  const own=await rpc(()=>browser.newContext({serviceWorkers:'block',ignoreHTTPSErrors:false,acceptDownloads:false,permissions:[]}),10000,false,'context-create');
  context=own;
  await rpc(()=>own.route('**/*',route=>track((async()=>{
   resource();const req=route.request();let admitted=false;
   if(current&&!current.stopping&&!finishing){let frame=null;try{frame=req.frame();}catch{}
    if(frame)admitted=reserveDocument(current.gate,{request:req,url:req.url(),method:req.method(),resourceType:req.resourceType(),frame});}
   if(!admitted){
    if(current?.request===req&&!current.refusal&&!current.stopping&&!finishing)fatal();
    if(current&&!current.stopping)current.blockedRequests.add(req);
    await rpc(()=>route.abort('blockedbyclient'),10000,false,'request-deny');return;
   }
   current.request=req;const headers=Object.fromEntries(requestHeaders(req.headers()).map(h=>[h.name,h.value]));
   await rpc(()=>route.continue({headers}),10000,false,'request-continue');
  })())));
  await rpc(()=>own.routeWebSocket('**/*',socket=>track((async()=>{resource();await rpc(()=>socket.close());})())));
  own.on('page',page=>{if(expectingPage&&openingPage===null){openingPage=page;return;}if(current?.page!==page)track(rpc(()=>page.close({runBeforeUnload:false})));});
  return own;
  }
  const rootSession=await rpc(()=>browser.newBrowserCDPSession());await rpc(()=>rootSession.send('Browser.setDownloadBehavior',{behavior:'deny'}));
  for(const [index,c]of scope.entries()){
   guard();if(failure)throw failure;const origin=policy.entries.get(c.url);
   if(origin?.status!=='eligible'){rows.push({id:c.id,status:'unavailable',reason:origin?.reason??'origin-policy-unavailable'});continue;}
   let page,session,article,outcome,navStarted=null;
   try{
    context=await openAfterPagePolicy({beforePage:url=>policy.beforePage(url),url:c.url,guard,failure:()=>failure,
     openContext:()=>{navStarted=performance.now();return openContext();}});
    // Page event uses this exact pending creation slot, never an owner tab.
    expectingPage=true;openingPage=null;page=await rpc(()=>context.newPage());expectingPage=false;
    if(openingPage!==page)fatal();
    session=await rpc(()=>context.newCDPSession(page));
    await rpc(()=>session.send('Page.enable'));await rpc(()=>session.send('Page.setLifecycleEventsEnabled',{enabled:true}));await rpc(()=>session.send('Runtime.enable'));
    await rpc(()=>session.send('Network.enable'));await rpc(()=>session.send('Network.setBypassServiceWorker',{bypass:true}));
    await rpc(()=>session.send('Network.setCacheDisabled',{cacheDisabled:true}));
    const blank=(await rpc(()=>session.send('Page.getFrameTree'))).frameTree?.frame;
    if(!blank||blank.parentId||blank.url!=='about:blank'||!blank.id)fatal();
    article={page,url:c.url,request:null,gate:createDocumentGate({url:c.url,mainFrame:page.mainFrame(),frameId:blank.id,scope}),until:performance.now()+20000,
     stopping:false,refusal:null,committed:null,dcl:null,blockedRequests:new WeakSet()};current=article;
    page.on('dialog',dialog=>track(rpc(()=>dialog.dismiss())));
    page.on('crash',()=>fail(new ControlFatal('response-integrity')));
    const callbacks=createArticleCallbacks({article,frameId:blank.id,current:()=>current,resource,fail,clock:()=>performance.now()});
    session.on('Page.frameDetached',callbacks.frameDetached);session.on('Runtime.executionContextsCleared',callbacks.contextsCleared);
    session.on('Runtime.executionContextDestroyed',callbacks.contextDestroyed);session.on('Page.frameNavigated',callbacks.frameNavigated);
    session.on('Page.lifecycleEvent',callbacks.lifecycle);page.on('requestfailed',callbacks.requestFailed);
    let response;
    try{response=await rpc(()=>page.goto(c.url,{waitUntil:'commit',timeout:0}),10000,false,'navigate');}
    catch(error){rethrowGotoRejection(error,article,{guard,failure:()=>failure,fence});}
    fence(article);
    if(!response)fatal();
    const headers=await rpc(()=>response.headersArray(),10000,false,'response-headers');fence(article);
    const peer=await rpc(()=>response.serverAddr(),10000,false,'response-peer');fence(article);
    const security=await rpc(()=>response.securityDetails(),10000,false,'response-security');fence(article);
    verifyResponse(article.gate,{request:response.request(),url:response.url(),status:response.status(),headers,serverIp:peer?.ipAddress??null,
     tlsVerified:security!==null,mimeType:(headers.find(h=>h.name.toLowerCase()==='content-type')?.value??'').split(';')[0].trim().toLowerCase()});fence(article);
    while(!article.dcl&&performance.now()<article.until-2000){await sleep(25);fence(article);}
    const committed=article.committed,dcl=article.dcl;
    if(!committed||!dcl||dcl.frameId!==committed.frameId||dcl.loaderId!==committed.loaderId||dcl.at>article.until-2000)throw new ControlUnavailable('article-timeout');
    bindDocument(article.gate,committed);
    const frame=()=>rpc(()=>session.send('Page.getFrameTree'),10000,false,'frame-tree');
    let tree=(await frame()).frameTree?.frame;fence(article);assertDocument(article.gate,{frameId:tree?.id,loaderId:tree?.loaderId,url:tree?.url});
    const world=await rpc(()=>session.send('Page.createIsolatedWorld',{frameId:blank.id,worldName:'murmingle-playwright-dev-reader',grantUniveralAccess:false}),10000,false,'isolated-world');fence(article);
    if(!Number.isSafeInteger(world.executionContextId))fatal();
    article.worldId=world.executionContextId;
    await sleep(Math.max(0,dcl.at+2000-performance.now()));fence(article);
    const expression=`(()=>{const robots=[],tdm=[];let canonicalUrl='',n=0,e=document.head?.firstElementChild;for(;e&&n<128;e=e.nextElementSibling,n++){if(e.tagName==='META'){const k=(e.getAttribute('name')||e.getAttribute('http-equiv')||'').toLowerCase(),v=e.getAttribute('content')||'';if(v.length>4096)return {capture:null,document:{url:location.href,canonicalUrl:'',robots:[],tdm:[],complete:false}};if(['robots','x-robots-tag','murmingletopiccrawler'].includes(k))robots.push(v);if(k==='tdm-reservation')tdm.push(v);}if(e.tagName==='LINK'&&(e.getAttribute('rel')||'').toLowerCase()==='canonical'){const h=e.getAttribute('href')||'';if(h.length<=2048)canonicalUrl=h;}}return {capture:(${collectPageContent.toString()})(${JSON.stringify(c.url)}),document:{url:location.href,canonicalUrl,robots,tdm,complete:!e}};})()`;
    const snapshot=await rpc(()=>session.send('Runtime.evaluate',{expression,contextId:world.executionContextId,returnByValue:true}),10000,false,'snapshot');fence(article);
    if(snapshot.exceptionDetails||!snapshot.result?.value)fatal();
    const documentIdentity=deriveDocumentIdentity({id:c.id,batch,freezeHash:initial.freezeHash,frameId:article.committed.frameId,loaderId:article.committed.loaderId});
    const retained=retainPairedSnapshot(article.gate,{...snapshot.result.value,navigationId:documentIdentity.navigationId,documentId:documentIdentity.sourceIncarnation});
    const {pairedInput,...summary}=retained;
    tree=(await frame()).frameTree?.frame;fence(article);assertDocument(article.gate,{frameId:tree?.id,loaderId:tree?.loaderId,url:tree?.url});
    fence(article);outcome={id:c.id,...summary};
    if(pairedInput)inputs.push({id:c.id,groupId:c.groupId,url:c.url,sourceVersion:documentIdentity.sourceVersion,sourceIncarnation:documentIdentity.sourceIncarnation,
     ...pairedInput,originPolicyHash:origin.receiptSha256,pagePolicyHash:retained.pagePolicyHash});
    rows.push(outcome); // synchronous paired input + metadata publication, no await
   }catch(e){
    guard();if(e instanceof ControlUnavailable){if(failure)throw failure;rows.push({id:c.id,status:'unavailable',reason:e.code});}else throw e;
   }
   finally{expectingPage=false;if(article){article.stopping=true;closeDocumentGate(article.gate);}
    try{if(context)await rpc(()=>context.close(),2000,true);}finally{current=null;context=null;if(navStarted!==null)navigationMs+=performance.now()-navStarted;}}
   if(navigationMs>80000||performance.now()-started-policy.elapsedMs-policy.spacingMs-navigationMs>40000)throw new ControlFatal('absolute-job-deadline');
  }
 }finally{
  finishing=true;
  let closeFailure=null;
  try{if(context)await rpc(()=>context.close(),2000,true,'context-close');}catch(e){closeFailure=e;}
  try{if(browser)await rpc(()=>browser.close(),2000,true,'browser-close');}catch(e){closeFailure??=e;}
  const until=performance.now()+2000;while(operations.size&&performance.now()<until)await sleep(10);
  if(operations.size||pending||failure||closeFailure)throw failure??closeFailure??new ControlFatal('unsettled-callbacks');
 }
 guard();await recheck(initial);guard();
 const packet=buildInputPacket({phase:'browser-only',batch,freezeHash:initial.freezeHash,freezeSha256:initial.freezeSha256,candidateSha256:initial.hashes[CANDIDATE],
  labelSealSha256:initial.hashes[LABEL_SEAL],artifactReuseReceiptSha256:initial.hashes[REUSE],producerProfile:initial.profiles.producerProfile,rows:inputs});
 const packetWire=JSON.stringify(packet);
 for(const p of prior)for(let i=0;i<p.paths.length;i++)if(sha(await checked(p.paths[i],128*1024))!==p.hashes[i])fatal();
 guard();
 const result={schema:'browser-root-transfer-result/v1',phase:'browser-only',batch,status:'complete',denominator:4,fullProducerDenominator:32,
  cases:rows.map(row=>({...row,...(row.status==='collected'?{sourceInputHash:packet.rows.find(p=>p.id===row.id).sourceInputHash}: {})})),
  collected:rows.filter(r=>r.status==='collected').length,policyRequests:policy.requests.length,policyElapsedMs:policy.elapsedMs,policySpacingMs:policy.spacingMs,navigationMs,
  sourceHashes:initial.hashes,freezeHash:initial.freezeHash,freezeSha256:initial.freezeSha256,sourceHashesRechecked:true,protocolCallbacksDrained:true,
  producerProfile:initial.profiles.producerProfile,artifactReuseReceiptSha256:initial.hashes[REUSE],artifactReuseReceiptHash:initial.reuseReceipt.receiptHash,
  transferHash:initial.reuseReceipt.transferHash,profileRecipeHash:initial.profiles.recipeHash,packetSha256:sha(packetWire),
  priorEvidence:prior.map(p=>({batch:p.batch,resultSha256:p.hashes[0],supervisorSha256:p.hashes[1],packetSha256:p.hashes[2]})),
  peakCoordinatorPending:peakPending,resourceEvents:eventCount,elapsedMs:performance.now()-started,reobservation:true,independentCohort:false,noOldInputSplice:true,
  evaluatedProducers:['browser-current'],unexercisedProducers:['current-static'],originalStaticProfileUnchanged:true,
  witnessSchema:'playwright-owned-document/v1',networkRequestIdCorrelated:false,rawPlaywrightIpcFourMiBAndInternalPending128Enforced:false,
  browserProducerScope:'restricted-single-document-dom-reader/v1',ordinaryDynamicBrowserProducerValidated:false,noNativeAttestation:true,
  noModelCalls:true,noCanonicalWrites:true,productionValidated:false,assignmentAuthority:false};
 const wire=JSON.stringify(result);if(Buffer.byteLength(wire)>65536)fatal();await evidenceBudget(OUTPUT,Buffer.byteLength(packetWire)+Buffer.byteLength(wire));
 await writeFile(resolve(OUTPUT,'input.packet.json'),packetWire,{flag:'wx'});await writeFile(resolve(OUTPUT,'result.json'),wire,{flag:'wx'});
 console.log(JSON.stringify({status:'complete',batch,denominator:4,collected:result.collected,resultSha256:sha(wire),packetSha256:sha(packetWire)}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length===2)console.log('No action. Explicit supervised browser-only approval and reviewed freeze required.');
 else if(process.argv.length===4&&process.argv[2]==='--browser-batch'&&/^[1-8]$/u.test(process.argv[3]))run(Number(process.argv[3])).catch(e=>{console.error(JSON.stringify({status:'failed',...projectError(e)}));process.exitCode=1;});
 else{console.error('Unsupported DEV mode');process.exitCode=1;}
}


