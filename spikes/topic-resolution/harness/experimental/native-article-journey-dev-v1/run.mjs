// Default inert. ADR169's invented article policy runs only after baseline ACK.
import assert from 'node:assert/strict';
import {mkdir,open,link,lstat,realpath,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {HERE,REPO,OWN,LEGACY,V151,PACKAGE_ROOT,INFRASTRUCTURE_SOURCE,INFRASTRUCTURE_PIN,sha,digest,strict,checked,inspectSources,validateFreeze} from './source-ledger.js';
import {createJourney,observeFulfillment,recordCommit,JourneyError,fields,dense,fail} from './journey.mjs';
const hash=sha;

const OUTPUT=resolve(HERE,'output');
let terminalProjector=null;
export const STAGE_FILES=Object.freeze({'manifest.json':LEGACY+'manifest.json','worker.js':LEGACY+'worker.js','native-adapter.js':LEGACY+'native-adapter.js','native-rights.js':'spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/native-rights.js','chromium/page-content-reader.js':'spikes/topic-resolution/browser/chromium/page-content-reader.js','core/page-content-policy.js':'spikes/topic-resolution/browser/core/page-content-policy.js'});
const STAGE_LAYOUT=Object.freeze({'':['chromium','core','manifest.json','native-adapter.js','native-rights.js','worker.js'],chromium:['page-content-reader.js'],core:['page-content-policy.js']});
export async function checkStageLayout(stage,{list=readdir,metadata=async path=>{const s=await lstat(path);return {directory:s.isDirectory(),file:s.isFile(),symbolic:s.isSymbolicLink(),resolved:await realpath(path)};}}={}){
 for(const [sub,expected]of Object.entries(STAGE_LAYOUT)){
  const path=sub?resolve(stage,sub):stage,m=await metadata(path);assert.ok(m.directory&&!m.symbolic&&m.resolved.toLowerCase()===path.toLowerCase());assert.deepEqual((await list(path)).sort(),expected);
  for(const name of expected){const p=resolve(path,name),s=await metadata(p);assert.ok(!s.symbolic&&s.resolved.toLowerCase()===p.toLowerCase());assert.equal(s.directory,sub===''&&['chromium','core'].includes(name));assert.equal(s.file,!(sub===''&&['chromium','core'].includes(name)));}
 }
}
function exact(value,keys){assert.ok(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Object.keys(value),keys);return value;}
const wire=value=>Buffer.from(JSON.stringify(value));
export function validateStartupAck(ack,start,readySha){
 exact(ack,['schema','readySha256','freezeSha256','sourceHashesHash','originalNodePid','originalNodeCreationFiletime','baseline','baselineHash']);assert.equal(ack.schema,'native-console-ack/v1');assert.equal(ack.readySha256,readySha);
 for(const key of ['freezeSha256','sourceHashesHash','originalNodePid','originalNodeCreationFiletime'])assert.equal(ack[key],start[key]);
 const b=exact(ack.baseline,['schema','node','console','baselineHash']);assert.equal(b.schema,'native-console-baseline/v1');
 const encoding='win32-absolute-lexical-slash-ascii-fold-no-filesystem/v1';
 function identity(v,path){exact(v,['pid','creationFiletime','imagePathSha256','imagePathHashEncoding']);assert.ok(Number.isSafeInteger(v.pid)&&v.pid>0&&v.pid<=0xffffffff);assert.ok(typeof v.creationFiletime==='string'&&/^[1-9][0-9]{0,19}$/u.test(v.creationFiletime)&&BigInt(v.creationFiletime)<(1n<<64n));assert.equal(v.imagePathHashEncoding,encoding);assert.equal(v.imagePathSha256,sha(encoding+'\0'+path));}
 identity(b.node,'c:\\program files\\nodejs\\node.exe');assert.equal(b.node.pid,start.originalNodePid);assert.equal(b.node.creationFiletime,start.originalNodeCreationFiletime);
 if(b.console!==null){identity(b.console,'c:\\windows\\system32\\conhost.exe');assert.notEqual(b.console.pid,b.node.pid);}
 assert.equal(b.baselineHash,digest({schema:b.schema,node:b.node,console:b.console}));assert.equal(ack.baselineHash,b.baselineHash);return ack;
}
export function drainRequest(index,variant,start,readySha,startupAckSha,baselineHash){
 assert.ok(index===1||index===2);
 return {schema:'baselined-startup-drain-request/v1',variantIndex:index,variantHash:digest(variant),readySha256:readySha,startupAckSha256:startupAckSha,freezeSha256:start.freezeSha256,sourceHashesHash:start.sourceHashesHash,baselineHash,originalNodePid:start.originalNodePid,originalNodeCreationFiletime:start.originalNodeCreationFiletime};
}
export function validateDrainAck(value,request,requestSha){
 const expected={schema:'baselined-startup-drain-ack/v1',requestSha256:requestSha,variantIndex:request.variantIndex,freezeSha256:request.freezeSha256,sourceHashesHash:request.sourceHashesHash,readySha256:request.readySha256,startupAckSha256:request.startupAckSha256,baselineHash:request.baselineHash,originalNodePid:request.originalNodePid,originalNodeCreationFiletime:request.originalNodeCreationFiletime,browserResidualAbsent:true};
 assert.deepEqual(value,expected);assert.deepEqual(Object.keys(value),Object.keys(expected));return value;
}
export async function awaitMetadata(read,until,{clock=()=>performance.now(),guard=()=>{},wait=pause}={}){
 while(true){guard();assert.ok(clock()<until);let bytes;
  try{bytes=await read();}catch(error){if(error.code!=='ENOENT')throw error;}
  guard();assert.ok(clock()<until);if(bytes!==undefined)return bytes;await wait(25);
 }
}
export async function admitStartup({ackBytes,start,readySha,until,action,clock=()=>performance.now()}){
 assert.ok(clock()<until);const ack=validateStartupAck(strict(ackBytes),start,readySha);assert.ok(clock()<until);
 return {ack,value:await action()};
}
async function publish(name,value){
 const bytes=wire(value);assert.ok(bytes.length<=65536);const pending=resolve(OUTPUT,name+'.pending'),final=resolve(OUTPUT,name+'.json');
 const out=await open(pending,'wx');try{await out.writeFile(bytes);await out.sync();}finally{await out.close();}await link(pending,final);return sha(bytes);
}
export const FIXED_BROWSER_PATHS=Object.freeze(['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']);
export async function resolveFixedBrowser({resolvePath=resolve,inspect=lstat,real=realpath}={}){
 for(const literal of FIXED_BROWSER_PATHS){
  const fixed=resolvePath(literal);let info;
  try{info=await inspect(fixed);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  assert.ok(info.isFile()&&!info.isSymbolicLink());
  assert.equal((await real(fixed)).toLowerCase(),fixed.toLowerCase());return fixed;
 }
 throw Error('Fixed browser unavailable');
}
const PRELUDE_STAGES=Object.freeze(['coordinator-import','staging-recheck','fixed-browser-resolver','maintained-client-import']);
export function createPrelude(onRecord=()=>{},guard=()=>{}){
 const rows=[];let next=0,busy=false,failed=false;
 function emit(stage,event){assert.ok(rows.length<8);const row=Object.freeze({schema:'baselined-startup-prelude/v1',stage,event});rows.push(row);onRecord(row);}
 return Object.freeze({async step(stage,action){
  assert.ok(!busy&&!failed&&stage===PRELUDE_STAGES[next]&&typeof action==='function');guard();busy=true;
  try{emit(stage,'before');const value=await action();guard();emit(stage,'after');next++;return value;}
  catch(error){failed=true;throw error;}finally{busy=false;}
 },snapshot:()=>Object.freeze([...rows])});
}

export function rightsDenied(snapshot){
 const s=fields(snapshot),d=fields(s.document);assert.equal(s.schema,'native-document-policy-snapshot/v1');assert.equal(d.complete,true);
 const robots=dense(d.robots,32),tdm=dense(d.tdm,32);for(const v of [...robots,...tdm])assert.ok(typeof v==='string'&&v.length<=4096);
 return robots.some(v=>v.toLowerCase().split(/[\s,;:]+/u).some(x=>['noindex','none','noai','noimageai'].includes(x)))||tdm.some(v=>v.trim()==='1');
}
export function validateFixtureCapture(fixture,value,documentId){
 const v=fields(value);assert.equal(v.status,'collected');const w=fields(v.nativeWitness);
 assert.equal(w.caseId,fixture.id);assert.equal(w.ordinal,fixture.ordinal);assert.equal(w.documentId,documentId);assert.equal(w.sourceUrl,fixture.url);assert.equal(w.documentUrl,fixture.url);
 assert.equal(hash(v.rawTitle),fixture.rawTitleSha256);assert.equal(hash(v.effectiveTitle),fixture.effectiveTitleSha256);assert.equal(hash(v.body),fixture.bodySha256);assert.equal(v.extractorVersion,fixture.extractorVersion);
 return Object.freeze({caseId:fixture.id,ordinal:fixture.ordinal,status:'collected',htmlSha256:fixture.htmlSha256,rawTitleSha256:hash(v.rawTitle),effectiveTitleSha256:hash(v.effectiveTitle),bodySha256:hash(v.body),extractorVersion:v.extractorVersion});
}
function epoch(value){assert.ok(Number.isSafeInteger(value)&&value>=0&&!Object.is(value,-0));}
export function validateNativeStudyBegin(value,studyId){
 const v=fields(value);assert.deepEqual(Object.keys(v),['schema','studyId','studyRevision','eventEpoch','caseCount']);
 assert.equal(v.schema,'native-article-dev-study/v1');assert.equal(v.studyId,studyId);assert.equal(v.caseCount,4);
 assert.ok(typeof v.studyRevision==='string'&&/^[A-Za-z0-9._:-]{1,160}$/u.test(v.studyRevision));epoch(v.eventEpoch);
 return Object.freeze({...v});
}
export function validateNativeStudyEnd(value,begin){
 const v=fields(value);assert.deepEqual(Object.keys(v),['schema','studyId','studyRevision','eventEpoch']);
 assert.equal(v.schema,'native-article-dev-study-ended/v1');assert.equal(v.studyId,begin.studyId);assert.equal(v.studyRevision,begin.studyRevision);epoch(v.eventEpoch);assert.ok(v.eventEpoch>begin.eventEpoch);
 return Object.freeze({...v});
}
export const OPERATION_STAGES=Object.freeze(['launch','blank-anchor','fixture-route','socket-deny','browser-cdp','download-deny','anchor-session','anchor-info','discovery','census','extension-load','worker-lookup','worker-wait','native-window','native-begin','article-new-page','article-session','article-info','article-authenticate','article-foreground','page-enable','frame-tree','lifecycle-enable','network-enable','fixture-navigate','fixture-journey','native-tab','native-locate','native-snapshot','native-skip','native-observe','head-mutation','native-bad-document','article-close','retirement-drain','article-detach','native-end','close-context','close-browser']);
/** Actual diagnostic path; explicit infrastructure/clients are trusted code.
 * Tests inject invented clients. No default client import or native execution. */
export async function runArticleDiagnostic({chromium,executablePath,stagedExtensionPath,infrastructureModule,reuse,guard,clock=()=>performance.now(),onOperation=()=>{},onCallback=()=>{},onFault=()=>{},onJourneyReport=()=>{}}){
 const {createInfrastructurePolicy,createNativeCaptureCoordinator,NATIVE_LAUNCH_ARGUMENTS}=infrastructureModule;
 const {createArticleOwner,createFixtureTransport,createCallbackObservation,ArticleOwnerError,fail,FIXTURES,FIXED_CASES,HEAD_MUTATION,BAD_DOCUMENT_ID}=reuse;
 assert.equal(typeof createInfrastructurePolicy,'function');assert.equal(typeof createNativeCaptureCoordinator,'function');
 let fatal=null,context=null,browser=null,anchor=null,session=null,anchorSession=null,worker=null,extensionId=null,loading=false,closing=false,events=0,callbackRows=0,operationRows=0,owner=null;
 let leaseUntil=clock()+45000,contextClosed=false,browserClosed=false,contextAttempts=0,browserAttempts=0,activeArticle=null;
 const deferredWorkers=[],deferredTargets=[],jobs=new Set(),results=[],journeys=[],started=clock(),wholeUntil=started+360000;
 function check(){guard();if(fatal)throw fatal;if(owner&&owner.snapshot().retainedBytes+journeys.reduce((n,j)=>n+j.journey.retainedBytes(),0)>32768)fail('registry-capacity');if(clock()>=wholeUntil)fail('active-deadline');if(clock()>=leaseUntil)fail('article-deadline');}
 function failed(e){if(fatal===null){fatal=e;observer.fault(e);owner?.abortPending(e);activeArticle?.journey?.abort();}}
 const observer=createCallbackObservation({emit:onCallback,onFault,errorPrototypes:[ArticleOwnerError.prototype,JourneyError.prototype,...[infrastructureModule.StartupFatal,infrastructureModule.NativeCaptureError].filter(c=>typeof c==='function').map(c=>c.prototype)]});
 const coordinator=createNativeCaptureCoordinator({guard:check,clock,until:()=>leaseUntil,onFailure:failed});
 owner=createArticleOwner({infrastructure:createInfrastructurePolicy(),clock});
 function count(){guard();if(++events>4096)fail('event-capacity');}
 function callback(kind,action){return value=>observer.callback(kind,value,()=>{count();action(value);},failed);}
 function track(p){const observed=Promise.resolve(p).catch(failed).finally(()=>jobs.delete(observed));jobs.add(observed);return observed;}
 async function rpc(stage,action,{cleanup=false}={}){
  if(!cleanup)check();assert.ok(OPERATION_STAGES.includes(stage));if(operationRows>=256)fail('operation-capacity');operationRows++;onOperation(Object.freeze({stage,event:'before'}));
  const value=await(cleanup?coordinator.cleanup(action):coordinator.rpc(action));
  if(!cleanup)check();onOperation(Object.freeze({stage,event:'after'}));return value;
 }
 const workerCall=(method,input)=>rpc('native-'+method,()=>worker.evaluate(({method,input})=>{
  if(method==='window')return chrome.windows.getLastFocused({populate:false}).then(w=>({windowId:w.id,type:w.type,incognito:w.incognito,focused:w.focused}));
  if(method==='locate')return globalThis.nativeDocumentRights.locate(input);
  if(method==='snapshot')return globalThis.nativeDocumentRights.snapshot(input);
  if(method==='bad-document')return globalThis.nativeArticleBadDocumentProbe(input);
  if(method==='begin')return globalThis.nativeReaderTransfer.beginStudy(input);
  if(method==='observe')return globalThis.nativeReaderTransfer.observe(input);
  if(method==='skip')return globalThis.nativeReaderTransfer.skipUnavailable(input);
  if(method==='end')return globalThis.nativeReaderTransfer.endStudy(input);
  throw Error('Fixed native command only');
 },{method,input}));
 let identity=null,windowMetadata=null,preLoadCensus=null,postLoadCensus=null,finalCensus=null;
 try{
  context=await rpc('launch',()=>chromium.launchPersistentContext('',{executablePath,headless:true,chromiumSandbox:true,serviceWorkers:'allow',ignoreHTTPSErrors:false,acceptDownloads:false,permissions:[],ignoreDefaultArgs:['--disable-extensions'],args:[...NATIVE_LAUNCH_ARGUMENTS,'--host-resolver-rules=MAP * ~NOTFOUND'],timeout:10000}));
  browser=context.browser();assert.ok(browser);browser.on('disconnected',callback('disconnected',()=>{if(!closing)fail('unexpected-disconnect');}));
  const pages=await rpc('blank-anchor',()=>context.pages());assert.equal(pages.length,1);anchor=pages[0];assert.equal(anchor.url(),'about:blank');
  context.on('page',callback('page',p=>{
   owner.page(p);const articleState=activeArticle;assert.ok(articleState&&!articleState.page);articleState.page=p;const mainFrame=p.mainFrame();
   for(const event of ['dialog','download','crash','worker'])p.on(event,callback('article-'+event,()=>fail('unexpected-page-event')));
   p.on('framenavigated',callback('article-navigation',frame=>{if(activeArticle!==articleState||articleState.retired)fail('late-article-callback');if(articleState.retiring)fail('late-navigation');owner.pageNavigation(frame,mainFrame,frame.url());}));
  }));
  context.on('serviceworker',callback('worker',w=>{if(loading&&!extensionId){if(deferredWorkers.length)fail('unexpected-worker');deferredWorkers.push(w);return;}if(!extensionId||w.url()!=='chrome-extension://'+extensionId+'/worker.js'||worker&&worker!==w)fail('unexpected-worker');}));
  anchor.on('framenavigated',callback('anchor-navigation',f=>{if(f!==anchor.mainFrame()||f.url()!=='about:blank')fail('anchor-mutation');}));
  for(const event of ['dialog','download','crash','worker'])anchor.on(event,callback('anchor-'+event,()=>fail('unexpected-page-event')));
  // ONE HTTP interception owner. Pinned Playwright route.fulfill emits the
  // request-stage CDP Fetch.fulfillRequest; no second Fetch.enable/session.
  await rpc('fixture-route',()=>context.route(/^https?:\/\//u,route=>{try{count();if(activeArticle?.transport)return activeArticle.transport.route(observeFulfillment(route,activeArticle.journey,activeArticle));track(coordinator.resolveFetch(()=>route.abort('blockedbyclient')));failed(new ArticleOwnerError('unexpected-network'));}catch(e){failed(e);}}));
  await rpc('socket-deny',()=>context.routeWebSocket('**/*',route=>{try{count();track(coordinator.rpc(()=>route.close()));failed(new ArticleOwnerError('unexpected-network'));}catch(e){failed(e);}}));
  session=await rpc('browser-cdp',()=>browser.newBrowserCDPSession());await rpc('download-deny',()=>session.send('Browser.setDownloadBehavior',{behavior:'deny'}));
  anchorSession=await rpc('anchor-session',()=>context.newCDPSession(anchor));owner.seal(await rpc('anchor-info',()=>anchorSession.send('Target.getTargetInfo')));check();
  for(const [protocol,event]of [['Target.targetInfoChanged','target-info-changed'],['Target.targetDestroyed','target-destroyed'],['Target.targetCrashed','target-crashed']])session.on(protocol,callback(event,p=>owner.lifecycle(event,p)));
  session.on('Target.targetCreated',callback('target-created',p=>{const t=fields(fields(p).targetInfo);
   if(t.type==='service_worker'){
    if(loading&&!extensionId){if(deferredTargets.length)fail('unexpected-worker');owner.worker(p);deferredTargets.push(t);return;}
    if(!extensionId||t.url!=='chrome-extension://'+extensionId+'/worker.js')fail('unexpected-worker');owner.worker(p);return;
   }owner.created(p);
  }));
  await rpc('discovery',()=>session.send('Target.setDiscoverTargets',{discover:true}));preLoadCensus=owner.census(await rpc('census',()=>session.send('Target.getTargets')),'pre-load');check();
  loading=true;const loaded=await rpc('extension-load',()=>session.send('Extensions.loadUnpacked',{path:stagedExtensionPath}));assert.match(loaded.id,/^[a-p]{32}$/u);extensionId=loaded.id;loading=false;
  const workerUrl='chrome-extension://'+extensionId+'/worker.js';assert.ok(deferredTargets.every(t=>t.url===workerUrl)&&deferredWorkers.every(w=>w.url()===workerUrl));
  let workers=await rpc('worker-lookup',()=>context.serviceWorkers());assert.ok(workers.length<=1&&workers.every(w=>w.url()===workerUrl));worker=workers[0]??await rpc('worker-wait',()=>context.waitForEvent('serviceworker',{predicate:w=>w.url()===workerUrl,timeout:8000}));assert.equal(worker.url(),workerUrl);
  postLoadCensus=owner.census(await rpc('census',()=>session.send('Target.getTargets')),'post-load',workerUrl);check();
  windowMetadata=await workerCall('window');assert.equal(windowMetadata.type,'normal');assert.equal(windowMetadata.incognito,false);assert.equal(windowMetadata.focused,true);
  identity=validateNativeStudyBegin(await workerCall('begin',{studyId:'adr169-invented-article-dev',windowId:windowMetadata.windowId,cases:FIXED_CASES}),'adr169-invented-article-dev');
  for(const fixture of FIXTURES){
   // Starts BEFORE newPage or ANY per-article setup; no late success after lease.
   leaseUntil=clock()+20000;check();owner.reserve(fixture,leaseUntil);
   const articleState={page:null,cdp:null,transport:null,retiring:false,retired:false,journey:null};activeArticle=articleState;const page=await rpc('article-new-page',()=>context.newPage());owner.returned(page);
   const cdp=await rpc('article-session',()=>context.newCDPSession(page));activeArticle.cdp=cdp;
   const articleInfo=await rpc('article-info',()=>cdp.send('Target.getTargetInfo'));await rpc('article-authenticate',()=>owner.awaitAuthentication(articleInfo));assert.equal(activeArticle.page,page);check();
   await rpc('article-foreground',()=>page.bringToFront());await rpc('page-enable',()=>cdp.send('Page.enable'));
   const tree=fields(await rpc('frame-tree',()=>cdp.send('Page.getFrameTree'))),blank=fields(fields(tree.frameTree).frame);assert.equal(blank.url,'about:blank');owner.navigate(blank.id,blank.loaderId);
   const journey=createJourney({incarnation:articleState,frameId:blank.id,blankLoaderId:blank.loaderId,url:fixture.url,until:leaseUntil,guard:check,clock,onFailure:failed,onReport:onJourneyReport});articleState.journey=journey;journeys.push({caseId:fixture.id,ordinal:fixture.ordinal,journey});
   cdp.on('Page.frameNavigated',callback('frame-committed',p=>{if(activeArticle!==articleState||articleState.retiring||articleState.retired)fail('late-article-callback');recordCommit(owner,journey,articleState,p);}));
   cdp.on('Page.frameAttached',()=>failed(new ArticleOwnerError('unexpected-frame')));
   cdp.on('Page.frameDetached',p=>{try{count();const d=fields(p);if(activeArticle!==articleState||articleState.retired)fail('late-article-callback');if(!articleState.retiring||d.frameId!==blank.id)fail('unexpected-frame');}catch(e){failed(e);}});
   const transport=createFixtureTransport({fixture,page,mainFrame:page.mainFrame(),guard:check,onFatal:failed,dispatch:action=>coordinator.resolveFetch(action)});activeArticle.transport=transport;
   let networkResponse=null;
   cdp.on('Network.responseReceived',p=>{try{count();if(activeArticle!==articleState||articleState.retiring||articleState.retired)fail('late-article-callback');const d=fields(p);if(d.type!=='Document'||networkResponse)fail('fixture-response');journey.response(articleState,p);networkResponse=p;}catch(e){failed(e);}});
   cdp.on('Network.loadingFailed',()=>failed(new ArticleOwnerError('fixture-response')));
   cdp.on('Page.lifecycleEvent',p=>{try{count();if(activeArticle!==articleState||articleState.retiring||articleState.retired)fail('late-article-callback');journey.lifecycle(articleState,p);}catch(e){failed(e);}});
   await rpc('lifecycle-enable',()=>cdp.send('Page.setLifecycleEventsEnabled',{enabled:true}));
   await rpc('network-enable',()=>cdp.send('Network.enable'));
   journey.begin(articleState);
   const navigation=await rpc('fixture-navigate',()=>cdp.send('Page.navigate',{url:fixture.url}));check();
   journey.reply(articleState,navigation);await rpc('fixture-journey',()=>journey.wait(articleState));journey.assertReady(articleState);owner.verifyNavigation(navigation);check();await transport.drain();transport.response(networkResponse,blank.id,navigation.loaderId);transport.verify();check();
   owner.census(await rpc('census',()=>session.send('Target.getTargets')),'post-load',workerUrl);check();
   const tab=await rpc('native-tab',()=>worker.evaluate(url=>chrome.tabs.query({active:true,currentWindow:true}).then(rows=>{if(rows.length!==1||rows[0].url!==url)throw Error('Native tab mismatch');return {tabId:rows[0].id};}),fixture.url));
   const locator=await workerCall('locate',{tabId:tab.tabId,sourceUrl:fixture.url,documentUrl:fixture.url});assert.equal(locator.schema,'native-document-locator/v1');assert.equal(locator.frameId,0);assert.equal(locator.tabId,tab.tabId);
   const pinned={tabId:tab.tabId,documentId:locator.documentId,sourceUrl:fixture.url,documentUrl:fixture.url};
   const before=await workerCall('snapshot',pinned);assert.equal(before.documentId,locator.documentId);owner.assertReading();
   const command={studyId:identity.studyId,studyRevision:identity.studyRevision,caseId:fixture.id,ordinal:fixture.ordinal,observationNonce:'adr168-observation-'+fixture.ordinal};
   if(fixture.ordinal===3){assert.equal(rightsDenied(before),true);const skipped=await workerCall('skip',{...command,reason:'document-policy-unavailable'});assert.equal(skipped.status,'unavailable');results.push(Object.freeze({caseId:fixture.id,ordinal:3,status:'head-denied',bodyRead:false,successfulPublications:0}));}
   else{
    assert.equal(rightsDenied(before),false);let observed=await workerCall('observe',command);owner.assertReading();const baseline=validateFixtureCapture(fixture,observed,locator.documentId);
    if(fixture.ordinal===4){
     const mutation=await rpc('head-mutation',()=>worker.evaluate(({pinned,mutation})=>chrome.scripting.executeScript({target:{tabId:pinned.tabId,documentIds:[pinned.documentId]},world:'ISOLATED',args:[mutation],func:m=>{const e=document.createElement('meta');e.name=m.name;e.content=m.content;document.head.append(e);return true;}}).then(r=>r.map(x=>({frameId:x.frameId,documentId:x.documentId,result:x.result}))),{pinned,mutation:HEAD_MUTATION}));
     assert.equal(mutation.length,1);assert.deepEqual(mutation[0],{frameId:0,documentId:locator.documentId,result:true});const after=await workerCall('snapshot',pinned);assert.equal(after.documentId,locator.documentId);assert.equal(rightsDenied(after),true);
     assert.notEqual(locator.documentId,BAD_DOCUMENT_ID);const bad=await workerCall('bad-document',{...pinned,documentId:BAD_DOCUMENT_ID});assert.deepEqual(bad,{refused:true,rightsHelperCode:'native-execution'});
     // The valid document must remain reachable with the deny intact. A dead
     // worker/scripting API or unrelated TypeError cannot stand for this probe.
     const recovered=await workerCall('snapshot',pinned);assert.equal(recovered.documentId,locator.documentId);assert.equal(rightsDenied(recovered),true);assert.deepEqual(recovered,after);observed=null;
     results.push(Object.freeze({caseId:fixture.id,ordinal:4,status:'mutation-and-bad-document-refused',baselineBodySha256:baseline.bodySha256,sameNativeDocument:true,mutationDenied:true,badDocumentRefused:true,badDocumentRefusalCode:'native-execution',validTargetRecheck:true,successfulPublications:0}));
    }else{const after=await workerCall('snapshot',pinned);assert.equal(after.documentId,locator.documentId);assert.equal(rightsDenied(after),false);assert.deepEqual(after,before);check();results.push(Object.freeze({...baseline,successfulPublications:1}));observed=null;}
   }
   // No reads/publication after this transition. Retirement has a distinct30s cap.
   journey.retire(articleState);const retiredSignal=owner.retire(),retirementStarted=clock();activeArticle.retiring=true;transport.stop();leaseUntil=retirementStarted+10000;
   await rpc('article-close',()=>page.close({runBeforeUnload:false}));await transport.drain();await rpc('retirement-drain',()=>retiredSignal);check();leaseUntil=retirementStarted+30000;
   owner.census(await rpc('census',()=>session.send('Target.getTargets')),'post-load',workerUrl);check();await rpc('article-detach',()=>cdp.detach());owner.retired();articleState.retired=true;activeArticle=null;check();
  }
  leaseUntil=Math.min(wholeUntil,clock()+20000);validateNativeStudyEnd(await workerCall('end',{studyId:identity.studyId,studyRevision:identity.studyRevision}),identity);finalCensus=owner.census(await rpc('census',()=>session.send('Target.getTargets')),'final',workerUrl);check();
 }catch(e){failed(e);}
 finally{
  leaseUntil=Infinity;closing=true;try{owner.setClosing();}catch(e){failed(e);}
  if(activeArticle)activeArticle.retiring=true;
  if(context){contextAttempts++;try{await rpc('close-context',()=>context.close(),{cleanup:true});contextClosed=true;}catch(e){failed(e);}}
  if(browser){browserAttempts++;try{await rpc('close-browser',()=>browser.close(),{cleanup:true});browserClosed=true;}catch(e){failed(e);}}
 }
 try{await Promise.all([...jobs]);coordinator.assertDrained();if(fatal)throw fatal;guard();assert.ok(clock()<wholeUntil);assert.equal(results.length,4);assert.equal(owner.snapshot().tombstones,4);
  const callbackSummary=observer.snapshot();callbackRows=callbackSummary.retained;
  return Object.freeze({schema:'native-article-journey-diagnostic/v1',status:'complete',cases:Object.freeze(results),journeys:Object.freeze(journeys.map(({caseId,ordinal,journey})=>Object.freeze({caseId,ordinal,witness:journey.snapshot(),retainedBytes:journey.retainedBytes()}))),preLoadCensus,postLoadCensus,finalCensus,events,callbackRows,callbackSummary,operationRows,contextCloseAttempts:contextAttempts,browserCloseAttempts:browserAttempts,contextClosed,browserClosed,physicalOperationsDrained:true,callbacksDrained:true,pending:0,elapsedMs:clock()-started,publicRequests:0,modelCalls:0,rawInputPersisted:false,syntheticTransportOnly:true,nativeWriteAuthority:false,productionValidated:false,assignmentAuthority:false});
 }finally{owner.release();coordinator.dispose();}
}

async function runDev(){
 assert.equal(process.platform,'win32');assert.equal(process.env.MURMINGLE_NATIVE_ARTICLE_JOURNEY_DEV_V1_SUPERVISED,'1');
 const until=performance.now()+350000,guard=()=>assert.ok(performance.now()<until),timer=setTimeout(()=>{process.stderr.write('Native article child deadline.\n');process.exit(1);},350000);
 try{
  let input='';for await(const part of process.stdin){input+=part;assert.ok(Buffer.byteLength(input)<=4096);guard();}
  const lines=input.split('\n');assert.equal(lines.length,3);assert.equal(lines[0],'NATIVE_ARTICLE_JOURNEY_DEV_JOB_ASSIGNED_V1');assert.equal(lines[2],'');
  const start=exact(strict(Buffer.from(lines[1])),['schema','freezeSha256','sourceHashesHash','originalNodePid','originalNodeCreationFiletime']);assert.equal(start.schema,'native-console-start/v1');assert.equal(start.originalNodePid,process.pid);
  const freezeBytes=await checked(resolve(HERE,'freeze.json'),65536),initial=await inspectSources();guard();const f=validateFreeze(strict(freezeBytes),initial.sourceHashes);
  assert.equal(sha(freezeBytes),start.freezeSha256);assert.equal(digest(initial.sourceHashes),start.sourceHashesHash);
  const ready={schema:'native-console-ready/v1',freezeSha256:start.freezeSha256,sourceHashesHash:start.sourceHashesHash,originalNodePid:process.pid,originalNodeCreationFiletime:start.originalNodeCreationFiletime,baselineHash:'pending'};
  const readySha=await publish('ready',ready),ackUntil=performance.now()+5000,ackBytes=await awaitMetadata(()=>checked(resolve(OUTPUT,'ack.json'),65536),ackUntil,{guard});
  const ack=validateStartupAck(strict(ackBytes),start,readySha),startupAckSha=sha(ackBytes);assert.ok(performance.now()<ackUntil);guard();
  // ALL executed static transitive CODE is in authenticated base187 BEFORE this
  // import. Selecting pure exports does not suppress module static evaluation.
  assert.equal(sha(await checked(resolve(REPO,INFRASTRUCTURE_SOURCE))),INFRASTRUCTURE_PIN);
  const infrastructure=await import(pathToFileURL(resolve(REPO,INFRASTRUCTURE_SOURCE)).href);
  const capturePath='spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/browser-capture.mjs';assert.equal(sha(await checked(resolve(REPO,capturePath))),initial.sourceHashes[capturePath]);
  const capture=await import(pathToFileURL(resolve(REPO,capturePath)).href);guard();
  for(const source of [LEGACY+'article-owner.mjs',LEGACY+'fixtures.js'])assert.equal(sha(await checked(resolve(REPO,source))),initial.sourceHashes[source]);
  const ownerModule=await import(pathToFileURL(resolve(REPO,LEGACY+'article-owner.mjs')).href),fixtureModule=await import(pathToFileURL(resolve(REPO,LEGACY+'fixtures.js')).href);guard();
  const stage=resolve(OUTPUT,'staged-extension');
  async function recheck(){await checkStageLayout(stage);for(const [target,source]of Object.entries(STAGE_FILES)){assert.equal(sha(await checked(resolve(stage,target))),initial.sourceHashes[source]);assert.equal(sha(await checked(resolve(REPO,source))),initial.sourceHashes[source]);guard();}await checkStageLayout(stage);assert.deepEqual((await inspectSources()).sourceHashes,initial.sourceHashes);assert.deepEqual(await checked(resolve(HERE,'freeze.json'),65536),freezeBytes);guard();}
  await mkdir(stage);await mkdir(resolve(stage,'chromium'));await mkdir(resolve(stage,'core'));
  for(const [target,source]of Object.entries(STAGE_FILES)){const bytes=await checked(resolve(REPO,source));assert.equal(sha(bytes),initial.sourceHashes[source]);const out=await open(resolve(stage,target),'wx');try{await out.writeFile(bytes);}finally{await out.close();}guard();}
  await recheck();const executablePath=await resolveFixedBrowser();guard();
  const {chromium}=await import(pathToFileURL(resolve(PACKAGE_ROOT,'index.mjs')).href);guard();
  const trace=[],callbacks=[];await publish('variant-1.started',{schema:'baselined-startup-variant-started/v1',variantIndex:1,freezeSha256:start.freezeSha256});
  const diagnostic=await runArticleDiagnostic({chromium,executablePath,stagedExtensionPath:stage,reuse:{...ownerModule,...fixtureModule},infrastructureModule:{createInfrastructurePolicy:infrastructure.createInfrastructurePolicy,createNativeCaptureCoordinator:capture.createNativeCaptureCoordinator,NATIVE_LAUNCH_ARGUMENTS:capture.NATIVE_LAUNCH_ARGUMENTS,StartupFatal:infrastructure.StartupFatal,NativeCaptureError:capture.NativeCaptureError},guard,
   onOperation:row=>{assert.ok(trace.length<512);trace.push(row);process.stdout.write(JSON.stringify({schema:'native-article-operation/v1',...row})+'\n');},onCallback:row=>{assert.ok(callbacks.length<32);callbacks.push(row);},onFault:row=>process.stdout.write(JSON.stringify(row)+'\n'),onJourneyReport:row=>process.stdout.write(JSON.stringify(row)+'\n')});
  guard();await recheck();await publish('variant-1.result',diagnostic);
  const request=drainRequest(1,diagnostic,start,readySha,startupAckSha,ack.baselineHash),requestSha=await publish('drain-1.request',request),drainUntil=performance.now()+15000;
  const drainBytes=await awaitMetadata(()=>checked(resolve(OUTPUT,'drain-1.ack.json'),65536),drainUntil,{guard});validateDrainAck(strict(drainBytes),request,requestSha);assert.ok(performance.now()<drainUntil);guard();await recheck();
  const drainPairs=[{requestSha256:requestSha,ackSha256:sha(drainBytes),variantHash:request.variantHash}];
  const result={schema:'native-article-journey-dev-result/v1',status:'complete',freezeHash:f.freezeHash,freezeSha256:start.freezeSha256,sourceHashesHash:start.sourceHashesHash,readySha256:readySha,startupAckSha256:startupAckSha,baselineHash:ack.baselineHash,diagnostic,drainPairs,trace,callbacks,sourceHashesRechecked:true,stageBytesRechecked:true,publicRequests:0,modelCalls:0,rawInputPersisted:false,syntheticTransportOnly:true,completeOsEgressIsolation:false,productionValidated:false,assignmentAuthority:false};
  await publish('result',result);await publish('completion',{schema:'baselined-startup-complete/v1',freezeSha256:start.freezeSha256,sourceHashesHash:start.sourceHashesHash,readySha256:readySha,startupAckSha256:startupAckSha,baselineHash:ack.baselineHash,originalNodePid:process.pid,originalNodeCreationFiletime:start.originalNodeCreationFiletime,resultSha256:digest(result),drainPairs});guard();
 }finally{clearTimeout(timer);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length===2)console.log('Inert. Review, preparation and separate native permission required.');
 else if(process.argv.length===3&&process.argv[2]==='--run-dev')await runDev().catch(error=>{const codes=new Set(['descriptor','identity','article-deadline','active-deadline','article-slot','unexpected-page','unexpected-target','article-identity','article-lifecycle','navigation-journey','late-read','article-retirement','census-omission','census-revival','fixture-request','unexpected-request','native-failure']);const d=error&&Object.getOwnPropertyDescriptor(error,'code');process.stderr.write(JSON.stringify({schema:'native-article-terminal/v1',code:d&&Object.hasOwn(d,'value')&&codes.has(d.value)?d.value:'diagnostic-failed'})+'\n');process.exitCode=1;});
 else throw Error('Fixed CLI only');
}


