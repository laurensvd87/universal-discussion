import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {types} from 'node:util';
import {Resolver} from 'node:dns/promises';
















// ADR216: authenticate frozen SOURCE reference FILEs/all128 CODE before imports.
// Candidate imports below are local; external Root before/end pins authenticate
// fresh mutable candidate bytes. No frozen map is claimed to authenticate v20.
const sourceRepo=new URL('../../../../../',import.meta.url),oldSource='spikes/topic-resolution/harness/experimental/native-specificity-study-v19/';
const sourceSha=b=>createHash('sha256').update(b).digest('hex');
const sourceListBytes=await readFile(new URL(oldSource+'source-paths.js',sourceRepo));
assert.equal(sourceSha(sourceListBytes),'f806aafcb5e41e83853e09b4efe930737d068d6a6cca86401cafc97390354c29');
const sourceMapBytes=await readFile(new URL(oldSource+'reviewed-sources-r3.json',sourceRepo));
assert.equal(sourceSha(sourceMapBytes),'9da490a224e59feaca9a959ff1a8d68684ca2f49930fbb2125fb68a90adff1c0');
const sourceKeys=JSON.parse(sourceListBytes.toString().match(/export const SOURCE_PATHS=Object\.freeze\((\[[\s\S]*?\])\);/)[1]),sourcePins=JSON.parse(sourceMapBytes).sourceHashes;
assert.equal(sourceKeys.length,128);assert.deepEqual(Object.keys(sourcePins),sourceKeys);
for(const key of sourceKeys)assert.equal(sourceSha(await readFile(new URL(key,sourceRepo))),sourcePins[key],key);
const heldSourcePins=Object.freeze({
 'spikes/topic-resolution/harness/experimental/native-capture-context-integration-v1/article-owner.mjs':'37b3aa8ad8fbae3d5556b4ade57c4e68e4632e4010876d455fa13257f09e9d4e',
 'spikes/topic-resolution/harness/experimental/native-capture-context-integration-v1/driver.mjs':'1bc12535b22c44b5709359566b657beb253c6a57d8a0ef08b705d0efd172435a',
 'spikes/topic-resolution/harness/experimental/native-capture-context-integration-v1/browser-capture.mjs':'419527915aaf5c060f647b59726a103d2f54966d214ce061efb4f43cb117d475',
 'spikes/topic-resolution/harness/experimental/native-specificity-public-journey-v4/journey.mjs':'a3fbee3a6d2d5bffef3dbe5ccdf93272f758e74b4545cfff68ff85e357b288f4',
 'spikes/topic-resolution/harness/experimental/native-specificity-public-journey-v4/test.mjs':'40a0d8c0021e525f23e3918677c7c5c1b337bb2843e5951f5839e5e3ac466dcf'
});


for(const key of Object.keys(heldSourcePins))assert.equal(sourceSha(await readFile(new URL(key,sourceRepo))),heldSourcePins[key],key);
after(async()=>{for(const key of Object.keys(heldSourcePins))assert.equal(sourceSha(await readFile(new URL(key,sourceRepo))),heldSourcePins[key],key);});
const {PublicFetchError}=await import('../../../../../apps/local-service/src/crawler/public-fetch.js');
const {buildSpecificityManifest,deriveBatchNetworkScope,digest}=await import('./manifest.js');
const {compileSpecificityNetworkScope,compileNativeDnsPins,describeNativeDnsPins,selectNativeDnsPin,createNativeArticleNetworkGate,describeNativeArticleNetworkGate,admitNativePageRequest,admitNativeMainResponse,verifyNativeNavigationLoader,NATIVE_RESOURCE_ORIGINS}=await import('./network-policy.js');
const {resolveNativeStudyDns}=await import('./dns-resolver.js');
const {collectOriginPolicies}=await import('./origin-policy.js');
const {createNativeReaderTransfer}=await import('./native-adapter.js');
const urlPolicy=await import('../../../browser/core/page-content-policy.js');
const {createPageContentReader}=await import('../../../browser/chromium/page-content-reader.js');
const {createInfrastructurePolicy,StartupFatal}=await import('../exact-browser-infrastructure-v1/compatibility-variant.mjs');
const localOwnerModule=await import('./article-owner.mjs');
const {createArticleOwner,createCallbackObservation,ArticleOwnerError}=await import('./article-owner.mjs');
const {createPublicJourney,PublicJourneyError,FACTS,REPLAY_CATEGORIES,IGNORED_LIFECYCLE,CODES:actualJourneyCodes}=await import('../native-specificity-public-journey-v4/journey.mjs');
const {captureNativeSpecificityBatch,releaseCapturedBatch,createNativeCaptureCoordinator,createPublicArticleCallbacks:actualCreatePublicArticleCallbacks,createMainNavigationAccounting,packNativeArticleSummary,unpackNativeArticleSummary,nativeArticleSummaryBound,projectNativeDomPolicy,projectSpecificityCaptureDiagnostic,createPlaywrightChildFrameGraph,createJourneyFailureWitness,NativeCaptureError}=await import('./browser-capture.mjs');
const {createRouteCoordinator}=await import('../playwright-route-coordinator-v1/coordinator.mjs');
const {createSpecificityDriverFailureBoundary}=await import('./driver.mjs');
after(async()=>{for(const key of sourceKeys)assert.equal(sourceSha(await readFile(new URL(key,sourceRepo))),sourcePins[key],key);});

// The shared offline guard does not patch Resolver.prototype. Explicitly deny
// ALL real resolver methods in this test realm; every DNS seam below is fake.
const realResolverMethods=Object.fromEntries(['resolve4','resolve6','cancel'].map(k=>[k,Resolver.prototype[k]]));
for(const k of Object.keys(realResolverMethods))Resolver.prototype[k]=()=>{throw new Error('Real DNS forbidden by invented test');};
after(()=>{for(const [k,v]of Object.entries(realResolverMethods))Resolver.prototype[k]=v;});

// Invented callback-only units historically omit browser/read capabilities.
// Supply those explicitly through the REAL accounting factory; this adapter
// never changes counts/state or intercepts the production full-batch wiring.
function createPublicArticleCallbacks(options){
 if(options.mainNavigation)return actualCreatePublicArticleCallbacks(options);
 const s=options.state,page=s.page??{},main=options.initialMainFrame??{},session=s.session??{},token=s.token??{};
 s.page=page;s.session=session;s.token=token;s.url??='https://fixture.invalid/';
 const original=options.owner,journey=s.journey;
 const helper=createMainNavigationAccounting({page,mainFrame:main,session,token,frameId:s.frameId,blankLoaderId:options.initialBlankLoaderId??'blank',caseUrl:s.url,
  until:20000,clock:options.clock??(()=>0),guard:options.guard,
  owner:{commit:value=>original.commit(value),pageNavigation:(...a)=>original.pageNavigation?.(...a),assertReading:()=>original.assertReading?.()},
  journey:{commit:(...a)=>journey.commit(...a),assertComplete:(...a)=>journey.assertComplete?journey.assertComplete(...a):true},
  journeyCall:options.journeyCall??((_site,_input,action)=>action())});
 return actualCreatePublicArticleCallbacks({...options,initialMainFrame:main,mainNavigation:helper});
}

function panel(){const cases=[];for(const split of ['training','calibration','test'])for(let i=0;i<(split==='test'?72:48);i++){
 const id=split==='test'&&i<2?'adr159-test-'+(i===0?'054':'083'):'invented-'+split+'-'+i,unverified=split==='test'&&i<2,gold={kind:'complete',path:['games','video-games','gta']};
 cases.push({id,groupId:'group-'+id,split,role:'leaf',nodeId:'gta',publicUrl:`https://publisher${i%7}.org/${id}`,publicSupportUrl:'https://support-only.org/'+id,language:i%2?'de':'en',publisherFamily:'family-'+split+'-'+i%(split==='test'?25:24),proposedGold:gold,assessmentGold:unverified?null:{...gold,path:[...gold.path]},labelStatus:unverified?'unverified':'verified',referenceAnnotation:split==='training'?{nodeId:'gta',kind:'member'}:null,formatState:'not-a-challenge'});
 }const body={schema:'hierarchy-native-specificity-panel/v1',cases,counts:{},sourceDigests:{},taxonomy:{unionNodeCount:25},assessmentPolicy:{allOriginalRowsAndDenominatorsRetained:true,unverifiedOrDisputedProposedGoldNeverPassedToAssessor:true},limitations:{},fullyReviewedGoldReady:false,nativeReady:false,modelReady:false,productionValidated:false,assignmentAuthority:false};
 return buildSpecificityManifest({panel:{...body,panelIdentity:digest(body)},expectedPanelIdentity:digest(body)});
}
function fixture(index=0){const manifest=panel(),batch=manifest.batches[index],scopeDTO=deriveBatchNetworkScope(manifest,batch),scope=compileSpecificityNetworkScope({scope:scopeDTO,batch});
 const dnsPins=compileNativeDnsPins({scope,rows:scopeDTO.hosts.map(host=>({host,status:'pinned',answers:[{address:'8.8.8.8',family:4}]}))});return {manifest,batch,scope,scopeDTO,dnsPins};}
const event=()=>({addListener(){},removeListener(){}});
function chromeFixture(){const state={url:'about:blank',tabId:10,windowId:1,calls:0,read:0,attest:0};const api={
 tabs:{onActivated:event(),onUpdated:event(),onRemoved:event(),onReplaced:event(),async query(){state.calls++;return [{id:state.tabId,windowId:1,url:state.url,status:'complete',active:true,incognito:false}];}},
 windows:{onFocusChanged:event(),onRemoved:event(),async getLastFocused(){state.calls++;return {id:1,type:'normal',incognito:false,focused:true};}},permissions:{onRemoved:event(),async contains(){return true;}}};
 const reader={async read(){state.read++;return {documentId:'document-'+state.tabId,result:{contractVersion:'page-content/1',status:'collected',url:state.url,title:' Invented title ',text:'Invented public subject.\nSecond line.',extractorVersion:'main-text-prefix/v1'}};},async attest(){state.attest++;return {contractVersion:'page-content-attestation/1',status:'attested',url:state.url};}};
 return {state,api,reader};}

test('scope is batch-bound, primary-only plus literal5CDN and rejects aliases/foreign URLs',()=>{
 const f=fixture();assert.equal(f.scopeDTO.hosts.length,9);assert.deepEqual(f.scopeDTO.cdnOrigins,NATIVE_RESOURCE_ORIGINS);assert.equal(f.scopeDTO.hosts.includes('support-only.org'),false);
 assert.throws(()=>compileSpecificityNetworkScope({scope:{...f.scopeDTO,hosts:[...f.scopeDTO.hosts,'evil.org']},batch:f.batch}));
 assert.throws(()=>createNativeArticleNetworkGate({dnsPins:f.dnsPins,caseUrl:'https://publisher0.org/not-current',frameId:'frame'}));
 const g=createNativeArticleNetworkGate({dnsPins:f.dnsPins,caseUrl:f.batch.cases[0].url,frameId:'frame'});
 const base={requestId:'req',networkId:'net',frameId:'frame',url:f.batch.cases[0].url,method:'GET',resourceType:'Document',authorizationPresent:false};
 assert.equal(admitNativePageRequest(g,base).mainDocument,true);assert.throws(()=>admitNativePageRequest(g,base));
 for(const [k,v]of [['frameId','child'],['method','POST'],['authorizationPresent',true],['url','https://support-only.org/x']]){
  const gate=createNativeArticleNetworkGate({dnsPins:f.dnsPins,caseUrl:base.url,frameId:'frame'});assert.equal(admitNativePageRequest(gate,{...base,[k]:v}).action,'abort');}
});
test('response TLS/peer/header/loader joins independently, no fabricated navigation',()=>{
 const f=fixture(),url=f.batch.cases[0].url;
 const make=()=>{const g=createNativeArticleNetworkGate({dnsPins:f.dnsPins,caseUrl:url,frameId:'frame'});admitNativePageRequest(g,{requestId:'req',networkId:'net',frameId:'frame',url,method:'GET',resourceType:'Document',authorizationPresent:false});return g;};
 const paused={url,status:200,headers:[],networkId:'net',frameId:'frame',requestId:'resp'},network={url,status:200,requestId:'net',frameId:'frame',loaderId:'loader',remoteAddress:'8.8.8.8',securityState:'secure',mimeType:'text/html'};
 const gate=make();assert.equal(admitNativeMainResponse(gate,{paused,network}).navigationLoaderVerified,false);assert.equal(verifyNativeNavigationLoader(gate,{url,frameId:'frame',loaderId:'loader'}).navigationLoaderVerified,true);
 for(const [k,v]of [['securityState','insecure'],['remoteAddress','127.0.0.1'],['requestId','other'],['mimeType','application/json']])assert.throws(()=>admitNativeMainResponse(make(),{paused,network:{...network,[k]:v}}));
 const x=make();admitNativeMainResponse(x,{paused,network});assert.throws(()=>verifyNativeNavigationLoader(x,{url,frameId:'frame',loaderId:'other'}));
});
test('owned DNS max18 submissions/4resolvers/8physical, validates ALL answers and settles',async()=>{
 const f=fixture();let queries=0,physical=0,peak=0;
 const result=await resolveNativeStudyDns({scope:f.scope,createResolver:()=>({resolve4(){queries++;peak=Math.max(peak,++physical);return Promise.resolve(['8.8.8.8']).finally(()=>physical--);},resolve6(){queries++;peak=Math.max(peak,++physical);return Promise.resolve([]).finally(()=>physical--);},cancel(){}})});
 assert.equal(queries,18);assert.equal(result.summary.querySubmissions,18);assert.ok(peak<=8);assert.equal(result.summary.physicalQueries,0);assert.equal(describeNativeDnsPins(result.dnsPins).batchId,f.batch.batchId);
 assert.throws(()=>selectNativeDnsPin({scope:f.scope,host:f.scopeDTO.hosts[0],answers:[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]}));
 assert.throws(()=>selectNativeDnsPin({scope:f.scope,host:f.scopeDTO.hosts[0],answers:Array.from({length:33},()=>({address:'8.8.8.8',family:4}))}));
});
test('fresh origin policies are exact8 bounded endpoints, no page/support URL or retries',async()=>{
 const f=fixture();let now=0;const urls=[];const p=await collectOriginPolicies({cases:f.batch.cases.map(({id,groupId,url,language})=>({id,groupId,url,language})),batch:24,browser:true,clock:()=>now,sleep:async ms=>{now+=ms;},fetchPublic:async(url,options)=>{
  urls.push(url);assert.ok(options.timeoutMs<=5000);const text=url.endsWith('/robots.txt')?'User-agent: *\nAllow: /\n':'{"tdm-reservation":0}';return {kind:'content',finalUrl:url,status:200,text,body:Buffer.from(text)};
 }});assert.equal(urls.length,8);assert.equal(p.requests.length,8);assert.equal(p.entries.size,4);assert.ok(urls.every(u=>u.endsWith('/robots.txt')||u.endsWith('/.well-known/tdmrep.json')));
});
test('native adapter global IDs and batch-local1..4, one use skips/no native calls',async()=>{
 const f=fixture(24),c=chromeFixture(),adapter=createNativeReaderTransfer({chromeApi:c.api,reader:c.reader,urlPolicy,batch:f.batch});
 const started=await adapter.beginStudy({studyId:'invented-specificity-study',windowId:1,cases:f.batch.cases.map(r=>({id:r.id,ordinal:r.nativeOrdinal,url:r.url}))});
 const before=c.state.calls;const a=f.batch.cases[0],cmd={studyId:started.studyId,studyRevision:started.studyRevision,caseId:a.id,ordinal:1,observationNonce:'one-use-invented-nonce-1'};
 assert.equal(adapter.skipUnavailable({...cmd,reason:'origin-policy-refused'}).status,'unavailable');assert.equal(c.state.calls,before);assert.throws(()=>adapter.skipUnavailable({...cmd,reason:'origin-policy-refused'}));
 for(const row of f.batch.cases.slice(1)){c.state.url=row.url;const r=await adapter.observe({...cmd,caseId:row.id,ordinal:row.nativeOrdinal,observationNonce:'one-use-invented-nonce-'+row.nativeOrdinal});assert.equal(r.status,'collected');assert.equal(r.nativeWitness.caseId,row.id);assert.equal(r.nativeWitness.ordinal,row.nativeOrdinal);assert.equal(r.body,'Invented public subject.\nSecond line.');}
 assert.equal(c.state.read,3);assert.equal(c.state.attest,3);const end=adapter.endStudy({studyId:started.studyId,studyRevision:started.studyRevision});assert.ok(end.eventEpoch>started.eventEpoch);
});
test('native unknown reader errors are fatal, not fabricated unavailable',async()=>{
 const f=fixture(),c=chromeFixture();c.state.url=f.batch.cases[0].url;c.reader.read=async()=>{throw new TypeError('programmer');};
 const a=createNativeReaderTransfer({chromeApi:c.api,reader:c.reader,urlPolicy,batch:f.batch}),s=await a.beginStudy({studyId:'invented-specificity-study',windowId:1,cases:f.batch.cases.map(r=>({id:r.id,ordinal:r.nativeOrdinal,url:r.url}))});
 await assert.rejects(a.observe({studyId:s.studyId,studyRevision:s.studyRevision,caseId:f.batch.cases[0].id,ordinal:1,observationNonce:'one-use-invented-nonce'}),{code:'native-contract'});
});
test('owned public callback join uses actual7facts and distinct IDs, rejection never settles fiction',async()=>{
 const f=fixture(),url=f.batch.cases[0].url,token={},faults=[],calls=[],state={token,url,frameId:'frame',retiring:false,retired:false,encodedBytes:0,paused:null,network:null,responseStarted:false};
 state.gate=createNativeArticleNetworkGate({dnsPins:f.dnsPins,caseUrl:url,frameId:'frame'});state.journey=createPublicJourney({incarnation:token,url,frameId:'frame',blankLoaderId:'blank',until:20000,clock:()=>0,guard:()=>{},onFailure:e=>faults.push(e)});
 state.session={send(method,args){calls.push([method,args]);return Promise.resolve({unused:true});}};
 const coordinator=createNativeCaptureCoordinator({guard:()=>{},clock:()=>0,onFailure:e=>faults.push(e)}),cb=createPublicArticleCallbacks({state,coordinator,owner:{commit(){}},guard:()=>{},clock:()=>0,countEvent(){},onFatal:e=>faults.push(e)});
 state.journey.begin(token);cb.paused({requestId:'fetch-req',networkId:'net',frameId:'frame',request:{url,method:'GET',headers:{}},resourceType:'Document'});
 cb.loadingFinished({requestId:'net',timestamp:1,encodedDataLength:12});cb.response({requestId:'net',frameId:'frame',loaderId:'loader',type:'Document',response:{url,status:200,remoteIPAddress:'8.8.8.8',securityState:'secure',mimeType:'text/html'}});
 cb.paused({requestId:'fetch-resp',networkId:'net',frameId:'frame',request:{url,method:'GET',headers:{}},resourceType:'Document',responseStatusCode:200,responseHeaders:[]});
 cb.frameNavigated(typedNavigation({id:'frame',url,loaderId:'loader'}));cb.lifecycle({frameId:'frame',loaderId:'loader',name:'DOMContentLoaded',timestamp:1});state.journey.reply(token,{frameId:'frame',loaderId:'loader'});
 await cb.drain();await state.journey.wait(token);state.journey.assertComplete(token);assert.equal(faults.length,0);assert.deepEqual(calls.map(x=>x[0]),['Fetch.continueRequest','Fetch.continueResponse']);coordinator.assertDrained();coordinator.dispose();
 cb.loadingFailed({requestId:'unknown',errorText:'net::ERR_TIMED_OUT'});assert.ok(faults.length>0);
});
test('same URL wrong native document policy fails, valid reserved head is refused not rescued',()=>{
 const url='https://publisher0.org/example',snapshot={schema:'native-document-policy-snapshot/v1',tabId:1,frameId:0,documentId:'doc',sourceUrl:url,documentUrl:url,document:{url,canonicalUrl:'',robots:[],tdm:[],complete:true}};
 const args={tabId:1,documentId:'doc',sourceUrl:url,documentUrl:url,snapshot};assert.equal(projectNativeDomPolicy(args).documentId,'doc');assert.throws(()=>projectNativeDomPolicy({...args,documentId:'wrong'}));
 assert.throws(()=>projectNativeDomPolicy({...args,snapshot:{...snapshot,document:{...snapshot.document,robots:['noindex']}}}),{reason:'document-policy-refused'});
});
test('full census partitions only authenticated article, never hides unknown/retired/duplicates',()=>{
 const f=fixture(),infra=createInfrastructurePolicy(),owner=createArticleOwner({infrastructure:infra,cases:f.batch.cases,clock:()=>0});
 const info=(targetId,type,url,attached=false)=>({targetId,type,url,attached,browserContextId:'context'}),anchor=info('anchor','page','about:blank',true),ui=info('ui','browser_ui','chrome://omnibox-popup.top-chrome/'),aim=info('aim','browser_ui','chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html');
 owner.seal({targetInfo:anchor});for(const t of [anchor,ui,aim])owner.created({targetInfo:t});owner.census({targetInfos:[anchor,ui,aim]},'pre-load');
 assert.throws(()=>owner.census({targetInfos:[anchor,ui,aim,info('unknown','page','about:blank')]},'pre-load'));
 assert.throws(()=>owner.census({targetInfos:[anchor,ui,aim,ui]},'pre-load'));owner.release();
});
test('stage source uses only static batch config and unchanged modules; template cannot launch',async()=>{
 const m=JSON.parse(await readFile(new URL('./manifest.json',import.meta.url),'utf8'));assert.deepEqual(m.host_permissions,[]);assert.deepEqual(m.permissions,['scripting','tabs']);
 const worker=await readFile(new URL('./worker.js',import.meta.url),'utf8');assert.ok(worker.includes("import {BATCH} from './batch-config.js'"));assert.ok(!worker.includes('onMessage'));assert.ok(!worker.includes('import('));
 assert.equal(typeof createPageContentReader,'function');
});

function typedNavigation(frame){const u=new URL(frame.url);return {frame:{name:'invented-frame',urlFragment:'',domainAndRegistry:u.hostname,securityOrigin:u.origin,securityOriginDetails:{isLocalhost:false},mimeType:'text/html',secureContextType:'Secure',crossOriginIsolatedContextType:'NotIsolated',gatedAPIFeatures:[],adFrameStatus:{adFrameType:'none',explanations:[]},...frame},type:'Navigation'};}
function fakeBrowser(f,{unsupportedOrdinal=null,missingHeadOrdinal=null,nativeThrowOrdinal=null,status=200,peer='8.8.8.8',security='secure',responseFirst=false,causalResponse=false,causalMissingNetwork=false,responseOriginal=null,deniedResourceErrorText=null,retirementErrorText=null,retirementOriginalFactory=null,retirementDestroyFirst=false,lateOldRetirement=false,terminalDescendants=null,terminalDescendantOrdinal=null,terminalNewTarget=false,terminalLifecycle=null,lateOldLifecycle=false,childLifecycle=false,teardownEvents=false,lateOldAttach=false,lateOldSocket=false,responseHeaders=[],longIds=false,childMode=null,pwChildMode=null,lateOldChild=false,missingParentDestroy=false,lingerParent=false,journeyFaultSite=null,initialBlankIdle=null,frameEvent=value=>value,afterPageClose=()=>{},localImageEvents=null,lateOperations=null,pwNavigation=null,onFresh=null}={}){
 const pad=v=>longIds?v.padEnd(160,'x'):v,doc=v=>longIds?('document-'+v).padEnd(128,'x'):'document-'+v;
 const c=chromeFixture(),targets=new Map(),ctx=new EventEmitter(),root=new EventEmitter();const extensionId='a'.repeat(32),workerUrl='chrome-extension://'+extensionId+'/worker.js';let next=0,contextCloses=0,browserCloses=0;
 const info=(targetId,type,url,attached=false)=>({targetId:pad(targetId),type,url,attached,browserContextId:pad('context')});
 const anchorInfo=info('anchor','page','about:blank',true),ui=info('ui','browser_ui','chrome://omnibox-popup.top-chrome/'),aim=info('aim','browser_ui','chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html');for(const t of [anchorInfo,ui,aim])targets.set(t.targetId,t);
 const anchor=new EventEmitter();anchor.url=()=> 'about:blank';anchor.mainFrame=()=>anchor;
 const adapter=createNativeReaderTransfer({chromeApi:c.api,reader:c.reader,urlPolicy,batch:f.batch});
 const originalRead=c.reader.read;c.reader.read=async(...args)=>{const ordinal=c.state.tabId-10;if(ordinal===nativeThrowOrdinal)throw new TypeError('unknown programmer failure');
  if(ordinal===unsupportedOrdinal)return {documentId:doc(c.state.tabId),result:{contractVersion:'page-content/1',status:'unsupported',reason:'missing-region'}};const value=await originalRead(...args);return {...value,documentId:doc(c.state.tabId)};};
 const rights={async locate(cmd){return {schema:'native-document-locator/v1',...cmd,frameId:0,documentId:doc(c.state.tabId),attestation:{contractVersion:'page-content-attestation/1',status:'attested',url:cmd.sourceUrl}};},
  async snapshot(cmd){return {schema:'native-document-policy-snapshot/v1',...cmd,frameId:0,document:{url:cmd.documentUrl,canonicalUrl:'',robots:[],tdm:[],complete:c.state.tabId-10!==missingHeadOrdinal}};}};
 const previous={chrome:globalThis.chrome,nativeReaderTransfer:globalThis.nativeReaderTransfer,nativeDocumentRights:globalThis.nativeDocumentRights,isSpecificityRightsRefusal:globalThis.isSpecificityRightsRefusal};
 Object.assign(globalThis,{chrome:c.api,nativeReaderTransfer:adapter,nativeDocumentRights:rights,isSpecificityRightsRefusal:()=>false});
 const worker={url:()=>workerUrl,async evaluate(fn,arg){return fn(arg);}};
 const browser=new EventEmitter();browser.newBrowserCDPSession=async()=>root;browser.close=async()=>{browserCloses++;};ctx.browser=()=>browser;ctx.pages=()=>[anchor];ctx.serviceWorkers=()=>targets.has(pad('worker'))?[worker]:[];
 ctx.routeWebSocket=async()=>{};ctx.close=async()=>{contextCloses++;for(const id of [...targets.keys()])root.emit('Target.targetDestroyed',{targetId:id});targets.clear();browser.emit('disconnected');};
 root.send=async(method,args)=>{
  if(method==='Target.setDiscoverTargets'){for(const t of targets.values())root.emit('Target.targetCreated',{targetInfo:t});return {};}
  if(method==='Target.getTargets')return {targetInfos:[...targets.values()]};
  if(method==='Extensions.loadUnpacked'){const t=info('worker','service_worker',workerUrl);targets.set(pad('worker'),t);root.emit('Target.targetCreated',{targetInfo:t});ctx.emit('serviceworker',worker);return {id:extensionId};}return {};
 };
 const oldPages=[],transport=[];let retiredCount=0,pageCloseCalls=0;
 ctx.newPage=async()=>{const n=++next,id=pad('article-'+n),page=new EventEmitter(),frame={};let url='about:blank',mainDetached=false;frame.url=()=>url;frame.page=()=>page;frame.isDetached=()=>mainDetached;page.mainFrame=()=>frame;page.url=()=>url;page.bringToFront=async()=>{c.state.tabId=10+n;};page.routeWebSocket=async(_,handler)=>{page.socketHandler=handler;};
  const t=info(id,'page',url,false);targets.set(id,t);ctx.emit('page',page);root.emit('Target.targetCreated',{targetInfo:t});
  let navigateResolve,retirementOriginal,retirementFulfilled=false,terminalResolve,terminalReject,terminalFulfilled=0,terminalRemove,lateStarted=false;
  const terminalOriginals=[];
  const session=new EventEmitter();
  function response(){session.emit('Network.responseReceived',{requestId:pad('net-'+n),frameId:pad('frame-'+n),loaderId:pad((journeyFaultSite==='response'?'blank-':'loader-')+n),type:'Document',response:{url,status,remoteIPAddress:peer,securityState:security,mimeType:'text/html'}});}
  function fresh(){session.emit('Page.frameNavigated',frameEvent(typedNavigation({id:pad('frame-'+n),url,loaderId:pad((journeyFaultSite==='commit'?'blank-':'loader-')+n)})));onFresh?.({page,frame,n,url,session,normal:()=>page.emit('framenavigated',frame)});}
  function dcl(){session.emit('Page.lifecycleEvent',{frameId:pad('frame-'+n),loaderId:pad((journeyFaultSite==='lifecycle'?'blank-':'loader-')+n),name:'DOMContentLoaded',timestamp:1});}
  session.send=(method,args)=>{
   transport.push(method);
   if(method==='Target.getTargetInfo'){t.attached=true;return {targetInfo:{...t}};}
   if(method==='Page.getFrameTree'){if(lateOperations&&!lateStarted&&c.state.read===n){lateStarted=true;lateOperations.start({session,page,n,url});}return {frameTree:{frame:{id:pad('frame-'+n),loaderId:url==='about:blank'?pad('blank-'+n):pad('loader-'+n),url}}};}
   if(method==='Page.navigate'){
    const held=causalResponse?new Promise(resolve=>{navigateResolve=resolve;}):null;
    url=args.url;t.url=url;c.state.url=url;root.emit('Target.targetInfoChanged',{targetInfo:{...t}});if(pwNavigation)pwNavigation({page,frame,n,url,session,normal:()=>page.emit('framenavigated',frame)});else page.emit('framenavigated',frame);
    session.emit('Fetch.requestPaused',{requestId:pad('fetch-'+n),networkId:pad('net-'+n),frameId:pad('frame-'+n),resourceType:'Document',request:{url,method:'GET',headers:{}}});
    return held??{frameId:pad('frame-'+n),loaderId:pad((journeyFaultSite==='reply'?'blank-':'loader-')+n)};
   }
   if(method==='Fetch.continueRequest'){
    if(deniedResourceErrorText!==null)session.emit('Fetch.requestPaused',{requestId:pad('denied-fetch-'+n),networkId:pad('denied-net-'+n),frameId:pad('frame-'+n),resourceType:'Image',request:{url,method:'POST',headers:{}}});
    if(initialBlankIdle==='before-fresh')session.emit('Page.lifecycleEvent',{frameId:pad('frame-'+n),loaderId:pad('blank-'+n),name:'networkAlmostIdle',timestamp:1});
    if(!causalResponse)fresh();
    if(initialBlankIdle==='after-fresh')session.emit('Page.lifecycleEvent',{frameId:pad('frame-'+n),loaderId:pad('blank-'+n),name:'networkAlmostIdle',timestamp:1});
    const paused=()=>session.emit('Fetch.requestPaused',{requestId:pad('fetch-response-'+n),networkId:pad('net-'+n),frameId:pad('frame-'+n),resourceType:'Document',request:{url,method:'GET',headers:{}},responseStatusCode:status,responseHeaders});
    if(causalResponse)paused();else{if(responseFirst){paused();response();}else{response();paused();}dcl();}
   }
   if(method==='Fetch.continueResponse'){if(causalResponse){if(!causalMissingNetwork)response();if(localImageEvents)localImageEvents(session,n);fresh();dcl();navigateResolve({frameId:pad('frame-'+n),loaderId:pad('loader-'+n)});}
    session.emit('Network.loadingFinished',{requestId:pad('net-'+n),timestamp:1,encodedDataLength:128});if(childMode){session.emit('Page.frameAttached',{frameId:pad('child-'+n),parentFrameId:pad('frame-'+n)});
     if(childLifecycle)session.emit('Page.lifecycleEvent',{frameId:pad('child-'+n),loaderId:pad('child-loader-'+n),name:'init',timestamp:1});
     session.emit('Page.frameNavigated',typedNavigation({id:pad('child-'+n),parentId:pad('frame-'+n),url,loaderId:pad('child-loader-'+n)}));
     if(childLifecycle){session.emit('Page.frameAttached',{frameId:pad('nested-'+n),parentFrameId:pad('child-'+n)});session.emit('Page.lifecycleEvent',{frameId:pad('nested-'+n),loaderId:pad('nested-loader-'+n),name:'init',timestamp:1});session.emit('Page.frameNavigated',typedNavigation({id:pad('nested-'+n),parentId:pad('child-'+n),url,loaderId:pad('nested-loader-'+n)}));session.emit('Page.lifecycleEvent',{frameId:pad('nested-'+n),loaderId:pad('nested-loader-'+n),name:'DOMContentLoaded',timestamp:1});}}
    if(pwChildMode){const child={page(){return pwChildMode==='crosspage'?{}:page;},parentFrame(){return frame;},url(){throw Error('child URL must never be read');}};page.child=child;page.emit('framenavigated',child);if(pwChildMode==='same-parent')page.emit('framenavigated',child);}
    if(responseOriginal!==null)return responseOriginal;
   }
   if(method==='Fetch.failRequest'){
    if(lateOperations&&args.requestId.startsWith('late-active-'))return lateOperations.deny({session,page,n,args});
    if(args.requestId===pad('terminal-fetch-one-'+n)||args.requestId===pad('terminal-fetch-two-'+n)){
     const second=args.requestId===pad('terminal-fetch-two-'+n),original=retirementOriginalFactory?retirementOriginalFactory():new Promise(resolve=>queueMicrotask(resolve));terminalOriginals.push(original);
     original.then(()=>{if(++terminalFulfilled===2)terminalResolve();},error=>terminalReject(error));
     session.emit('Page.lifecycleEvent',{frameId:pad('terminal-nested-'+n),loaderId:pad('terminal-nested-loader-'+n),name:'DOMContentLoaded',timestamp:1});
     if(second)terminalRemove();
     session.emit('Network.loadingFailed',{requestId:pad((second?'terminal-network-two-':'terminal-network-one-')+n),errorText:retirementErrorText??'net::ERR_BLOCKED_BY_CLIENT.Inspector',canceled:false,blockedReason:'inspector'});return original;
    }
    if(args.requestId===pad('retiring-fetch-'+n)){
     retirementOriginal=retirementOriginalFactory?retirementOriginalFactory():new Promise(resolve=>queueMicrotask(resolve));
     retirementOriginal.then(()=>{retirementFulfilled=true;},()=>{});
     session.emit('Network.loadingFailed',{requestId:pad('retiring-net-'+n),errorText:retirementErrorText,canceled:false,blockedReason:'inspector'});return retirementOriginal;
    }
    session.emit('Network.loadingFailed',{requestId:pad(args.requestId===pad('denied-fetch-'+n)?'denied-net-'+n:'net-'+n),errorText:deniedResourceErrorText??'net::ERR_BLOCKED_BY_CLIENT',canceled:false,blockedReason:'inspector'});
   }return Promise.resolve({});
  };
  page.session=session;page.close=async()=>{pageCloseCalls++;lateOperations?.beforeClose?.({session,page,n});
   if(terminalDescendants&&(terminalDescendantOrdinal===null||n===terminalDescendantOrdinal)){
    const wait=new Promise((resolve,reject)=>{terminalResolve=resolve;terminalReject=reject;}),mode=terminalDescendants;let childRemoved=false,nestedRemoved=false;
    const child={page:()=>page,parentFrame:()=>frame,isDetached:()=>childRemoved,url(){throw Error('terminal child URL forbidden');}},nested={page:()=>page,parentFrame:()=>child,isDetached:()=>nestedRemoved,url(){throw Error('terminal nested URL forbidden');}};
    terminalRemove=()=>{for(const suffix of mode.parentFirst?['child','nested']:['nested','child']){session.emit('Page.frameDetached',{frameId:pad('terminal-'+suffix+'-'+n),reason:'remove'});if(suffix==='child')childRemoved=true;else nestedRemoved=true;}};
    if(mode.pwFirst)page.emit('framenavigated',nested);
    const attach={frameId:pad('terminal-child-'+n),parentFrameId:pad('frame-'+n)};if(mode.stack)attach.stack={callFrames:[]};session.emit('Page.frameAttached',attach);
    session.emit('Page.lifecycleEvent',{frameId:pad('terminal-child-'+n),loaderId:pad('terminal-child-loader-'+n),name:'init',timestamp:1});
    session.emit('Page.frameNavigated',typedNavigation({id:pad('terminal-child-'+n),parentId:pad('frame-'+n),url,loaderId:pad('terminal-child-loader-'+n)}));
    session.emit('Page.frameAttached',{frameId:pad('terminal-nested-'+n),parentFrameId:pad('terminal-child-'+n)});
    session.emit('Page.lifecycleEvent',{frameId:pad('terminal-nested-'+n),loaderId:pad('terminal-nested-loader-'+n),name:'init',timestamp:1});
    session.emit('Page.frameNavigated',typedNavigation({id:pad('terminal-nested-'+n),parentId:pad('terminal-child-'+n),url,loaderId:pad('terminal-nested-loader-'+n)}));
    if(!mode.pwFirst)page.emit('framenavigated',nested);
    if(terminalNewTarget){root.emit('Target.targetCreated',{targetInfo:info('new-unowned-target-'+n,'iframe','about:blank')});return;}
    for(const [suffix,frameId,resourceType]of [['one','terminal-child-',mode.document?'Document':'Image'],['two','terminal-nested-','Image']])session.emit('Fetch.requestPaused',{requestId:pad('terminal-fetch-'+suffix+'-'+n),networkId:pad('terminal-network-'+suffix+'-'+n),frameId:pad(frameId+n),resourceType,request:{url,method:'GET',headers:{}}});
    if(retirementDestroyFirst){targets.delete(id);root.emit('Target.targetDestroyed',{targetId:id});retiredCount++;}
    await wait;assert.equal(terminalOriginals.length,2);assert.equal(terminalFulfilled,2);
   }
   if(retirementErrorText!==null){session.emit('Fetch.requestPaused',{requestId:pad('retiring-fetch-'+n),networkId:pad('retiring-net-'+n),frameId:pad('frame-'+n),resourceType:'Image',request:{url,method:'GET',headers:{}}});assert.ok(retirementOriginal,'close must dispatch the actual denial');
    if(retirementDestroyFirst){targets.delete(id);root.emit('Target.targetDestroyed',{targetId:id});retiredCount++;}await retirementOriginal;assert.equal(retirementFulfilled,true);}
   const terminalEvent=()=>session.emit('Page.lifecycleEvent',{frameId:pad((terminalLifecycle==='known-child'||terminalLifecycle==='removed-child'?'child-':terminalLifecycle==='unknown-child'?'unknown-child-':'frame-')+n),loaderId:pad((terminalLifecycle==='main-blank'?'blank-':terminalLifecycle==='unknown-loader'?'unknown-loader-':terminalLifecycle==='known-child'||terminalLifecycle==='removed-child'?'child-loader-':'loader-')+n),name:'DOMContentLoaded',timestamp:1});
   if(terminalLifecycle&&terminalLifecycle!=='removed-child'&&terminalLifecycle!=='detached-main')terminalEvent();
   if(terminalLifecycle==='detached-main'){session.emit('Page.frameDetached',{frameId:pad('frame-'+n),reason:'remove'});terminalEvent();}
   if(childMode==='removed'||childMode==='duplicate'||childMode==='swap'||childMode==='unknown')session.emit('Page.frameDetached',{frameId:pad((childMode==='unknown'?'unknown-child-':'child-')+n),reason:childMode==='swap'?'swap':'remove'});
   if(terminalLifecycle==='removed-child')terminalEvent();
   if(childMode==='duplicate')session.emit('Page.frameDetached',{frameId:pad('child-'+n),reason:'remove'});
   if(teardownEvents){session.emit('Page.lifecycleEvent',{frameId:pad('frame-'+n),loaderId:pad('loader-'+n),name:'networkIdle',timestamp:1});session.emit('Network.loadingFailed',{requestId:pad('net-'+n),errorText:'net::ERR_ABORTED',canceled:true});session.emit('Page.frameDetached',{frameId:pad('frame-'+n),reason:'remove'});}
   if(n>1&&lateOldAttach)oldPages[0].session.emit('Page.frameAttached',{frameId:'late-child',parentFrameId:'frame-1'});
   if(n>1&&lateOldChild)oldPages[0].emit('framenavigated',oldPages[0].child);
   if(n>1&&lateOldSocket)oldPages[0].socketHandler({close(){throw Error('must not attribute old socket to new article');}});
   if(n>1&&lateOldRetirement)oldPages[0].session.emit('Fetch.requestPaused',{requestId:'old-retirement-fetch',networkId:'old-retirement-net',frameId:'frame-1',resourceType:'Image',request:{url,method:'GET',headers:{}}});
   if(n>1&&lateOldLifecycle)oldPages[0].session.emit('Page.lifecycleEvent',{frameId:'frame-1',loaderId:'blank-1',name:'DOMContentLoaded',timestamp:1});
   mainDetached=true;if(!lingerParent)targets.delete(id);if(!missingParentDestroy&&!retirementDestroyFirst){root.emit('Target.targetDestroyed',{targetId:id});retiredCount++;}afterPageClose();};oldPages.push(page);return page;
 };
 ctx.newCDPSession=async page=>page===anchor?{async send(){return {targetInfo:anchorInfo};}}:page.session;
 return {context:ctx,root,chromium:{async launchPersistentContext(_,options){assert.equal(options.serviceWorkers,'block');return ctx;}},counts:()=>({contextCloses,browserCloses}),
  observation:()=>({nativeReads:c.state.read,retiredCount,pageCloseCalls,transport:[...transport]}),
  fireMainNavigation(){const page=oldPages.at(-1);if(page)page.emit('framenavigated',page.mainFrame());},
  fireLateAttach(){oldPages[0].session.emit('Page.frameAttached',{frameId:'late-child',parentFrameId:'frame-1'});},
  restore(){for(const [k,v]of Object.entries(previous)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}};
}
function heldOriginal(){let yes,no;const record={fulfilled:false,dispatched:false};record.promise=new Promise((resolve,reject)=>{yes=resolve;no=reject;});record.promise.then(()=>{record.fulfilled=true;},()=>{});return Object.assign(record,{resolve:yes,reject:no});}
async function waitInvented(predicate){for(let i=0;i<200&&!predicate();i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(predicate(),'invented causal milestone not reached');}
function lateDenials({thirdOutsideSnapshot=false}={}){
 const articles=[];return {articles,
  start({session,page,n,url}){const row={session,page,n,url,originals:Array.from({length:3},heldOriginal)};articles.push(row);
   row.pause=i=>session.emit('Fetch.requestPaused',{requestId:'late-active-'+n+'-'+i,networkId:'late-network-'+n+'-'+i,frameId:'frame-'+n,resourceType:'Image',request:{url,method:'POST',headers:{}}});
   if(thirdOutsideSnapshot)row.originals[1].promise.then(()=>row.pause(3));row.pause(1);row.pause(2);
  },
  deny({session,n,args}){const row=articles[n-1],index=Number(args.requestId.split('-').at(-1))-1,original=row.originals[index];original.dispatched=true;if(index===1)assert.equal(row.originals[0].fulfilled,true);
   session.emit('Network.loadingFailed',{requestId:'late-network-'+n+'-'+(index+1),errorText:'net::ERR_BLOCKED_BY_CLIENT',canceled:false});return original.promise;
  },
  beforeClose({n}){const row=articles[n-1];for(const original of row.originals.slice(0,thirdOutsideSnapshot?3:2))if(!original.fulfilled){original.reject(Error('invented close canceled original'));throw Error('close before original fulfillment');}},
  release(){for(const row of articles)for(const original of row.originals)original.resolve();}
 };
}
test('ADR202 genuine late final-frame denials hold close until BOTH originals settle, including queued second',async()=>{
 const api=await import('./browser-capture.mjs?adr202-late-four'),f=fixture(),late=lateDenials(),fake=fakeBrowser(f,{causalResponse:true,lateOperations:late}),rows=[];let completed=false;
 const running=api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)}));running.then(()=>{completed=true;},()=>{});
 try{for(let n=1;n<=4;n++){
   await waitInvented(()=>rows.length===n);const row=late.articles[n-1];assert.equal(fake.observation().nativeReads,n);assert.equal(row.originals[0].dispatched,true);assert.equal(row.originals[1].dispatched,false);assert.equal(fake.observation().pageCloseCalls,n-1);assert.equal(completed,false);
   row.originals[0].resolve();await waitInvented(()=>row.originals[1].dispatched);assert.equal(fake.observation().pageCloseCalls,n-1);assert.equal(fake.observation().nativeReads,n);row.originals[1].resolve();
  }
  const summary=await running;assert.equal(summary.available,4);assert.equal(rows.length,4);assert.ok(rows.every(r=>r.status==='collected'));assert.equal(fake.observation().nativeReads,4);assert.equal(fake.observation().pageCloseCalls,4);assert.equal(fake.observation().retiredCount,4);api.releaseCapturedBatch(summary);
 }finally{late.release();fake.restore();}
});
test('ADR202 rejected late denial is fatal before normal page close, with exact original operation witness',async()=>{
 const api=await import('./browser-capture.mjs?adr202-late-reject'),f=fixture(),late=lateDenials(),fake=fakeBrowser(f,{lateOperations:late}),rows=[];
 const observed=thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)})));
 try{await waitInvented(()=>rows.length===1);late.articles[0].originals[0].reject(Error('private protocol details'));const error=await observed;assert.equal(error.code,'client-operation');assert.deepEqual(api.captureFailureDiagnostic().operationWitness,{lane:'denial',rpc:'Fetch.failRequest',kind:'promise-rejection',cause:{family:'unclassified',code:'unclassified'}});assert.equal(fake.observation().pageCloseCalls,0);assert.equal(fake.observation().retiredCount,0);assert.equal(fake.observation().nativeReads,1);assert.equal(rows.length,1);assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});
 }finally{late.release();fake.restore();}
});
test('ADR202 nonsettling late original times out without fulfillment, close or25s retirement',async()=>{
 const api=await import('./browser-capture.mjs?adr202-late-never'),f=fixture(),late=lateDenials(),fake=fakeBrowser(f,{lateOperations:late}),rows=[];
 const observed=thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)})));
 try{await waitInvented(()=>rows.length===1);const error=await observed;assert.equal(error.code,'rpc-deadline');assert.equal(late.articles[0].originals[0].fulfilled,false);assert.equal(late.articles[0].originals[1].dispatched,false);assert.equal(fake.observation().pageCloseCalls,0);assert.equal(fake.observation().retiredCount,0);assert.deepEqual(api.captureFailureDiagnostic().timerWitness,{lane:'denial',rpc:'Fetch.failRequest'});assert.equal(api.captureFailureDiagnostic().operationWitness,null);assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});
 }finally{late.release();await new Promise(resolve=>setImmediate(resolve));fake.restore();}
});
test('ADR202 new work outside callback drain snapshot cannot cross into close',async()=>{
 const api=await import('./browser-capture.mjs?adr202-late-snapshot'),f=fixture(),late=lateDenials({thirdOutsideSnapshot:true}),fake=fakeBrowser(f,{lateOperations:late}),rows=[];
 const observed=thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)})));
 try{await waitInvented(()=>rows.length===1);late.articles[0].originals[0].resolve();await waitInvented(()=>late.articles[0].originals[1].dispatched);late.articles[0].originals[1].resolve();const error=await observed;assert.equal(error.code,'unsettled-retirement');assert.equal(late.articles[0].originals[2].dispatched,true);assert.equal(late.articles[0].originals[2].fulfilled,false);assert.equal(fake.observation().pageCloseCalls,0);assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});
 }finally{late.release();fake.restore();}
});
test('ADR202 active child after fenced publication invalidates WHOLE phase, never rewrites or rereads row',async()=>{
 const api=await import('./browser-capture.mjs?adr202-late-child'),f=fixture(),late=lateDenials(),fake=fakeBrowser(f,{lateOperations:late}),rows=[];
 const observed=thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)})));
 try{await waitInvented(()=>rows.length===1);late.articles[0].session.emit('Page.frameAttached',{frameId:'new-active-child',parentFrameId:'frame-1'});late.release();const error=await observed;assert.equal(error.code,'late-article-callback');assert.equal(rows.length,1);assert.equal(rows[0].status,'collected');assert.equal(fake.observation().nativeReads,1);assert.equal(fake.observation().pageCloseCalls,0);assert.equal(fake.observation().retiredCount,0);assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});
 }finally{late.release();fake.restore();}
});
test('ADR202 original20s deadline cannot be renewed to25s by the preclose wait',async()=>{
 const api=await import('./browser-capture.mjs?adr202-old-lease'),f=fixture(),late=lateDenials(),fake=fakeBrowser(f,{lateOperations:late}),rows=[];let now=0;
 const observed=thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake,{clock:()=>now,onRow:r=>rows.push(r)})));
 try{await waitInvented(()=>rows.length===1);now=20001;late.release();const error=await observed;assert.equal(error.code,'article-deadline');assert.equal(fake.observation().pageCloseCalls,0);assert.equal(fake.observation().retiredCount,0);assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});
 }finally{late.release();fake.restore();}
});
test('ADR202 late socket rejection keeps own websocket.close label and blocks normal retirement',async()=>{
 const api=await import('./browser-capture.mjs?adr202-socket'),f=fixture(),late=lateDenials(),fake=fakeBrowser(f,{lateOperations:late}),rows=[],socket=heldOriginal();
 const observed=thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>{rows.push(r);queueMicrotask(()=>late.articles[0].page.socketHandler({close(){socket.dispatched=true;return socket.promise;}}));}})));
 try{await waitInvented(()=>rows.length===1&&socket.dispatched);socket.reject(Error('private socket details'));await new Promise(resolve=>setImmediate(resolve));late.release();const error=await observed;assert.equal(error.code,'client-operation');assert.deepEqual(api.captureFailureDiagnostic().operationWitness,{lane:'ordinary',rpc:'websocket.close',kind:'promise-rejection',cause:{family:'unclassified',code:'unclassified'}});assert.equal(fake.observation().pageCloseCalls,0);assert.equal(rows.length,1);assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});
 }finally{socket.resolve();late.release();fake.restore();}
});
test('ADR202 cleanup-first operation owns witness; earlier falsy and foreign coordinator faults cannot borrow it',async()=>{
 const firstApi=await import('./browser-capture.mjs?adr202-cleanup-first'),first=fixture(),firstFake=fakeBrowser(first),firstClose=firstFake.context.close;firstFake.context.close=async()=>{await firstClose();throw Error('private cleanup cause');};
 try{const error=await thrown(()=>firstApi.captureNativeSpecificityBatch(captureArgs(first,firstFake)));assert.equal(error.code,'client-operation');assert.deepEqual(firstApi.captureFailureDiagnostic().operationWitness,{lane:'cleanup',rpc:'context.close',kind:'promise-rejection',cause:{family:'unclassified',code:'unclassified'}});assert.deepEqual(firstFake.counts(),{contextCloses:1,browserCloses:1});}finally{firstFake.restore();}
 for(const [i,value]of [undefined,null,false,0].entries()){
  const api=await import('./browser-capture.mjs?adr202-falsy-before-op-'+i),f=fixture(),fake=fakeBrowser(f),close=fake.context.close;fake.context.close=async()=>{await close();throw Error('later private cleanup');};
  try{assert.equal(await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow(){throw value;}}))),value);assert.equal(api.captureFailureDiagnostic().operationWitness,null);assert.equal(api.captureFailureDiagnostic().primary.family,'unclassified');assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});}finally{fake.restore();}
 }
 const api=await import('./browser-capture.mjs?adr202-foreign-operation'),external=api.createNativeCaptureCoordinator({guard(){},clock:()=>0,onFailure(){}}),foreign=await thrown(()=>external.rpc(()=>{throw Error('private external cause');},'Page.navigate'));assert.ok(external.operationWitnessFor(foreign));const f=fixture(),fake=fakeBrowser(f);
 try{assert.equal(await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow(){throw foreign;}}))),foreign);assert.equal(api.captureFailureDiagnostic().primary.code,'client-operation');assert.equal(api.captureFailureDiagnostic().operationWitness,null);}finally{external.dispose();fake.restore();}
});

test('actual joined four-case collector: public7facts→native bracket→retirement→close; ACK release separate',async()=>{
 const f=fixture(),fake=fakeBrowser(f),rows=[];
 const policy=async()=>({requests:Array(8).fill({kind:'invented'}),elapsedMs:0,entries:new Map(f.batch.cases.map(c=>[c.url,{status:'eligible',receiptSha256:'a'.repeat(64)}])),async beforePage(){}});
 try{
  const summary=await captureNativeSpecificityBatch({...f,expectedPanelIdentity:f.manifest.panelIdentity,expectedManifestHash:f.manifest.manifestHash,...fake,stagedExtensionPath:'D:/owned-invented/stage',profilePath:'D:/owned-invented/profile',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',studyId:'invented-specificity-batch',guard:()=>{},onRow:r=>rows.push(r),collectPolicies:policy});
  assert.equal(summary.accounted,4);assert.equal(summary.available,4);assert.equal(summary.cases.length,4);assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});assert.ok(summary.cases.every(r=>Object.values(r.journey.seen).every(Boolean)));
  assert.deepEqual(rows.map(r=>r.caseId),f.batch.cases.map(r=>r.id));assert.ok(rows.every(r=>r.rightsEvidence.sameNativeDocument&&r.nativeWitness.ordinal<=4));
  assert.equal(JSON.stringify(summary).includes('Invented public subject'),false);assert.equal(summary.physicalOperationsDrained,true);
  await assert.rejects(captureNativeSpecificityBatch({...f,expectedPanelIdentity:f.manifest.panelIdentity,expectedManifestHash:f.manifest.manifestHash,...fake,stagedExtensionPath:'D:/owned/stage',profilePath:'D:/owned/profile',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',studyId:'invented-second-batch',guard:()=>{},onRow(){}}),{code:'previous-batch-not-released'});
  // Invented owner acknowledges its own synthetic close only. This is NOT a
  // real guardian proof; future driver must authenticate actual ACK before call.
  releaseCapturedBatch(summary);assert.throws(()=>releaseCapturedBatch(summary),{code:'batch-release'});
 }finally{fake.restore();}
});
test('joined mixed rows preserve all4: policy skip/native unsupported/missing head/collected, no rescue',async()=>{
 const f=fixture(),fake=fakeBrowser(f,{unsupportedOrdinal:1,missingHeadOrdinal:2}),rows=[];
 const policy=async()=>({requests:[],elapsedMs:0,entries:new Map(f.batch.cases.map((c,i)=>[c.url,i===0?{status:'unavailable',reason:'origin-robots-denied'}:{status:'eligible',receiptSha256:'a'.repeat(64)}])),async beforePage(){}});
 try{
  const summary=await captureNativeSpecificityBatch({...f,expectedPanelIdentity:f.manifest.panelIdentity,expectedManifestHash:f.manifest.manifestHash,...fake,stagedExtensionPath:'D:/owned-invented/stage-mixed',profilePath:'D:/owned-invented/profile-mixed',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',studyId:'invented-specificity-mixed',guard:()=>{},onRow:r=>rows.push(r),collectPolicies:policy});
  assert.equal(summary.accounted,4);assert.equal(summary.available,1);assert.deepEqual(rows.map(r=>r.status),['unavailable','unavailable','unavailable','collected']);
  assert.deepEqual(rows.slice(0,3).map(r=>r.reason),['origin-policy-refused','reader-unavailable','document-policy-unavailable']);
  assert.ok(rows.slice(0,3).every(r=>Reflect.ownKeys(r).length===4&&!Object.hasOwn(r,'nativeWitness')));assert.equal(rows[3].ordinal,4);releaseCapturedBatch(summary);
 }finally{fake.restore();}
});
test('actual callback old-incarnation lifecycle/frame/nav remain fatal during a later retirement',()=>{
 const f=fixture(),token={},s={token,url:f.batch.cases[0].url,frameId:'frame',retiring:true,retired:false,encodedBytes:0};let current=s,failures=[];
 const coordinator={resolveFetch:fn=>Promise.resolve().then(fn)};s.session={send:()=>Promise.resolve()};s.gate=createNativeArticleNetworkGate({dnsPins:f.dnsPins,caseUrl:s.url,frameId:'frame'});
 s.journey=createPublicJourney({incarnation:token,url:s.url,frameId:'frame',blankLoaderId:'blank',until:20000,clock:()=>0,guard:()=>{},onFailure(){}});
 const cb=createPublicArticleCallbacks({state:s,coordinator,owner:{commit(){throw Error('must not reach old owner');}},guard:()=>{if(current!==s)throw Object.assign(new Error('old'),{code:'late-article-callback'});},clock:()=>0,countEvent(){},onFatal:e=>failures.push(e)});
 current={retiring:true};cb.frameNavigated(typedNavigation({id:'frame',url:s.url,loaderId:'loader'}));cb.frameDetached({frameId:'frame'});cb.lifecycle({frameId:'frame',loaderId:'loader',name:'load',timestamp:1});assert.equal(failures.length,3);assert.ok(failures.every(e=>e.code==='late-article-callback'));
});
test('bounded callback malformed/proxy/overflow are fatal, not ordinary article unavailable',()=>{
 const f=fixture(),token={},faults=[],s={token,url:f.batch.cases[0].url,frameId:'frame',retiring:false,retired:false,encodedBytes:0,mainNetworkId:null};let hooks=0;
 s.gate=createNativeArticleNetworkGate({dnsPins:f.dnsPins,caseUrl:s.url,frameId:'frame'});s.journey=createPublicJourney({incarnation:token,url:s.url,frameId:'frame',blankLoaderId:'blank',until:20000,clock:()=>0,guard:()=>{},onFailure:e=>faults.push(e)});s.journey.begin(token);s.session={send:()=>Promise.resolve()};
 const cb=createPublicArticleCallbacks({state:s,coordinator:{resolveFetch:fn=>Promise.resolve().then(fn)},owner:{commit(){}},guard:()=>{},clock:()=>0,countEvent(){},onFatal:e=>faults.push(e)});
 cb.paused(new Proxy({},{get(){hooks++;throw Error();}}));cb.response(Object.defineProperty({},'requestId',{enumerable:true,get(){hooks++;throw Error();}}));assert.equal(hooks,0);assert.ok(faults.length>=2);
 const before=faults.length;cb.loadingFailed({requestId:'unknown',errorText:'net::ERR_CERT_AUTHORITY_INVALID'});assert.equal(faults.length,before+1);
});
test('DNS unexpected failure and cancelling pending queries await actual physical settlement',async()=>{
 const f=fixture();let cancelled=0,pending=0;
 await assert.rejects(resolveNativeStudyDns({scope:f.scope,createResolver:()=>({resolve4(){pending++;return Promise.reject(Object.assign(new Error('not printed'),{code:'PROGRAMMER'})).finally(()=>pending--);},resolve6(){pending++;return Promise.resolve([]).finally(()=>pending--);},cancel(){cancelled++;}})}));
 assert.equal(pending,0);assert.ok(cancelled>0);
});
test('unknown origin fetch/parser/programmer errors cannot become normal unavailable',async()=>{
 const f=fixture();await assert.rejects(collectOriginPolicies({cases:f.batch.cases.map(({id,groupId,url,language})=>({id,groupId,url,language})),browser:true,batch:1,fetchPublic:async()=>{throw new TypeError('programmer');}}));
});
test('typed origin absence/timeout still classified in batch24 with exact real diagnostic context',async()=>{
 const f=fixture();let now=0;const diagnostics=[];
 const p=await collectOriginPolicies({cases:f.batch.cases.map(({id,groupId,url,language})=>({id,groupId,url,language})),browser:true,batch:24,clock:()=>now,sleep:async ms=>{now+=ms;},onDiagnostic:d=>diagnostics.push(d),
  fetchPublic:async()=>{throw new PublicFetchError('http-status',{status:404});}});
 assert.equal(p.entries.size,4);assert.ok([...p.entries.values()].every(v=>v.status==='eligible'));assert.equal(diagnostics.length,8);assert.ok(diagnostics.every(d=>d.batch===24&&d.disposition==='policy-absence'));
 const q=await collectOriginPolicies({cases:f.batch.cases.map(({id,groupId,url,language})=>({id,groupId,url,language})),browser:true,batch:24,fetchPublic:async()=>{throw new PublicFetchError('timeout');}});
 assert.ok([...q.entries.values()].every(v=>v.status==='unavailable'&&v.reason==='origin-policy-timeout'));
});
test('fatal actual joined native error closes both once and blocks phase reset/no partial result',async()=>{
 const f=fixture(),fake=fakeBrowser(f,{nativeThrowOrdinal:1});const policy=async()=>({requests:[],elapsedMs:0,entries:new Map(f.batch.cases.map(c=>[c.url,{status:'eligible',receiptSha256:'a'.repeat(64)}])),async beforePage(){}});
 const args={...f,expectedPanelIdentity:f.manifest.panelIdentity,expectedManifestHash:f.manifest.manifestHash,...fake,stagedExtensionPath:'D:/owned-invented/stage-fatal',profilePath:'D:/owned-invented/profile-fatal',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',studyId:'invented-specificity-fatal',guard:()=>{},onRow(){},collectPolicies:policy};
 try{let first;await assert.rejects(captureNativeSpecificityBatch(args),e=>{first=e;return true;});assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});await assert.rejects(captureNativeSpecificityBatch(args),e=>e===first);assert.throws(()=>releaseCapturedBatch({}),{code:'batch-release'});}finally{fake.restore();}
});
test('503/MIME unavailable cannot hide observed bad TLS/private/wrong peer',()=>{
 const f=fixture(),url=f.batch.cases[0].url;
 const run=(patch,status=503)=>{const gate=createNativeArticleNetworkGate({dnsPins:f.dnsPins,caseUrl:url,frameId:'frame'});admitNativePageRequest(gate,{requestId:'req',networkId:'net',frameId:'frame',url,method:'GET',resourceType:'Document',authorizationPresent:false});
  return ()=>admitNativeMainResponse(gate,{paused:{url,status,headers:[],networkId:'net',frameId:'frame',requestId:'response'},network:{url,status,requestId:'net',frameId:'frame',loaderId:'loader',remoteAddress:'8.8.8.8',securityState:'secure',mimeType:'text/html',...patch}});};
 assert.throws(run({}),{code:'main-response-unavailable'});
 for(const status of [200,503]){
  assert.throws(run({securityState:'insecure'},status),{code:'main-tls-unverified'});assert.throws(run({remoteAddress:'127.0.0.1'},status),{code:'non-public-dns-or-peer'});assert.throws(run({remoteAddress:'8.8.4.4'},status),{code:'peer-pin-mismatch'});
 }
 assert.throws(run({mimeType:'application/json',remoteAddress:'127.0.0.1'},200),{code:'non-public-dns-or-peer'});
});
function callbackFixture(coordinatorOptions={},callbackOptions={},deferCallbacks=false){const f=fixture(),url=f.batch.cases[0].url,token={},errors=[],sent=[],s={token,page:{},url,frameId:'frame',retiring:false,retired:false,refusal:null,encodedBytes:0,paused:null,network:null,responseStarted:false,mainNetworkId:null};
 s.gate=createNativeArticleNetworkGate({dnsPins:f.dnsPins,caseUrl:url,frameId:'frame'});s.journey=createPublicJourney({incarnation:token,url,frameId:'frame',blankLoaderId:'blank',until:20000,clock:()=>0,guard:()=>{},onFailure(){}});
 s.session={send(method,args){sent.push({method,args});return Promise.resolve();}};
 // Deliberate callback recomposition units defer this first construction instead
 // of resetting/overwriting an already-bound actual helper in the same state.
 const coordinator=createNativeCaptureCoordinator({guard:()=>{},clock:()=>0,onFailure:e=>errors.push(e),...coordinatorOptions}),cb=deferCallbacks?null:createPublicArticleCallbacks({state:s,coordinator,owner:{commit(){}},guard:()=>{},clock:()=>0,countEvent(){},onFatal:e=>errors.push(e),initialBlankLoaderId:'blank',...callbackOptions});
 s.journey.begin(token);const request=(requestId='request')=>({requestId,networkId:'net',frameId:'frame',resourceType:'Document',request:{url,method:'GET',headers:{}}});
 const paused=(status=200)=>({...request('response'),responseStatusCode:status,responseHeaders:[]}),network=(status=200,patch={})=>({requestId:'net',frameId:'frame',loaderId:'loader',type:'Document',response:{url,status,remoteIPAddress:'8.8.8.8',securityState:'secure',mimeType:'text/html',...patch}});
 return {s,cb,errors,sent,coordinator,request,paused,network,token,url};}
function dataImageResponse(patch={},responsePatch={}){return {requestId:'local-image',frameId:'frame',loaderId:'loader',type:'Image',timestamp:1,hasExtraInfo:false,...patch,response:{url:'data:image/png;base64,AA==',status:200,mimeType:'image/png',...responsePatch}};}
function authenticatedImageFixture(options={}){const f=callbackFixture({},options);f.cb.paused(f.request());f.cb.response(f.network());f.cb.paused(f.paused());assert.equal(f.errors.length,0);return f;}
const imageData=(patch={})=>({requestId:'local-image',timestamp:1,dataLength:5,encodedDataLength:0,...patch});
const imageFinished=(patch={})=>({requestId:'local-image',timestamp:1,encodedDataLength:0,...patch});
function retireImageFixture(f){f.s.journey.abort();f.cb.revokeForRetirement();f.s.retiring=true;f.s.closeIssued=true;}

test('data Image is bookkeeping after actual provisional admission, before reply/DCL, no main facts or dispatch',async()=>{
 const f=authenticatedImageFixture();try{await f.cb.drain();const before=f.s.journey.snapshot(),sent=f.sent.length,retained=f.cb.retainedTerminalBytes();
  f.cb.response(dataImageResponse());f.cb.dataReceived(imageData());f.cb.dataReceived(imageData({dataLength:7,encodedDataLength:3}));f.cb.loadingFinished(imageFinished({encodedDataLength:8}));
  assert.equal(f.errors.length,0);assert.deepEqual(f.s.journey.snapshot(),before);assert.equal(before.seen.reply,false);assert.equal(before.seen.dcl,false);assert.equal(f.sent.length,sent);
  assert.equal(f.s.encodedBytes,'data:image/png;base64,AA=='.length+5+7+3+5);assert.equal(f.cb.retainedTerminalBytes()-retained,256+2*('local-image'.length+'frame'.length+'loader'.length));
  retireImageFixture(f);f.cb.assertRetirementDenials();f.s.retired=true;f.cb.releaseRetired();assert.ok(f.cb.retainedTerminalBytes()<retained+1);
 }finally{f.coordinator.dispose();}
});
test('forged state provisional cannot birth a local Image; real private admission still requires all final facts',()=>{
 const f=callbackFixture();f.s.provisional={frameId:'frame',loaderId:'loader'};f.cb.response(dataImageResponse());assert.equal(f.errors[0].code,'unknown-network-response');assert.equal(f.s.encodedBytes,0);f.coordinator.dispose();
 const g=authenticatedImageFixture();g.cb.response(dataImageResponse());assert.throws(()=>g.s.journey.assertComplete(g.token));assert.equal(g.s.journey.snapshot().seen.reply,false);g.coordinator.dispose();
});
test('data Image strict response metadata, own current identity and loader fences',()=>{
 const cases=[
  [d=>{d.type='Document';}],[d=>{d.type='Script';}],[d=>{d.frameId='child';}],[d=>{d.loaderId='other';}],[d=>{delete d.frameId;}],[d=>{delete d.loaderId;}],
  [d=>{d.timestamp=-0;}],[d=>{d.timestamp=Infinity;}],[d=>{d.hasExtraInfo=true;}],[d=>{delete d.hasExtraInfo;}],
  ...['http:','https:','blob:','file:','about:','chrome-extension:','DATA:'].map(prefix=>[d=>{d.response.url=prefix+'untrusted';}]),
  ...['fromDiskCache','fromServiceWorker','fromPrefetchCache','fromEarlyHints'].map(k=>[d=>{d.response[k]=true;}]),
  ...['serviceWorkerResponseSource','serviceWorkerRouterInfo','securityDetails','cacheStorageCacheName'].map(k=>[d=>{d.response[k]='visible-evidence';}]),
  [d=>{d.response.remoteIPAddress='8.8.8.8';}],[d=>{d.response.remotePort=443;}],[d=>{d.response.remotePort=-0;}],[d=>{d.response.status=206;}],
  [d=>{d.response.mimeType='text/html';}],[d=>{d.response.mimeType='image/png; charset=utf8';}],[d=>{d.response.mimeType='image/'+'a'.repeat(91);}],[d=>{d.redirectResponse={};}],
  [()=>{},s=>{s.verifiedLoader='other';}],[()=>{},s=>{s.retiring=true;s.closeIssued=true;}],[()=>{},s=>{s.mainDetached=true;}],[()=>{},s=>{s.session={};}],[()=>{},s=>{s.page={};}],[()=>{},s=>{s.token={};}]
 ];
 for(const [alter,change]of cases){const f=authenticatedImageFixture();try{const d=dataImageResponse();alter(d);change?.(f.s);f.cb.response(d);assert.equal(f.errors[0]?.code,'unknown-network-response');assert.equal(f.s.encodedBytes,0);}finally{f.coordinator.dispose();}}
 for(const patch of [{},{fromDiskCache:false,fromServiceWorker:false,fromPrefetchCache:false,fromEarlyHints:false,cacheStorageCacheName:'',remoteIPAddress:'',remotePort:0}]){const f=authenticatedImageFixture();f.cb.response(dataImageResponse({},patch));assert.equal(f.errors.length,0);f.coordinator.dispose();}
});
test('data Image response descriptor/proxy projection never invokes hooks or retains payload',()=>{
 let hooks=0;const getter=(v,k)=>{Object.defineProperty(v,k,{enumerable:true,get(){hooks++;throw 0;}});return v;};
 for(const alter of [d=>{d.response=getter(d.response,'url');},d=>{d.response=new Proxy(d.response,{ownKeys(){hooks++;throw 0;},getPrototypeOf(){hooks++;throw 0;}});},d=>getter(d,'frameId'),d=>{d.response.url={toString(){hooks++;return 'data:x';}};},d=>{d.response.mimeType=new String('image/png');}]){
  const f=authenticatedImageFixture();const d=dataImageResponse();alter(d);f.cb.response(d);assert.ok(f.errors.length);assert.equal(f.s.encodedBytes,0);assert.equal(JSON.stringify(f.cb.networkWitnessFor(f.errors[0])).includes('base64'),false);f.coordinator.dispose();
 }assert.equal(hooks,0);
});
test('data Image zero chunks, cumulative deltas, decoded bytes and SAME32MiB boundary',()=>{
 for(const final of [5,10]){const f=authenticatedImageFixture();f.cb.response(dataImageResponse());f.cb.dataReceived(imageData({dataLength:4,encodedDataLength:5}));f.cb.loadingFinished(imageFinished({encodedDataLength:final}));assert.equal(f.errors.length,0);assert.equal(f.s.encodedBytes,'data:image/png;base64,AA=='.length+4+final);f.coordinator.dispose();}
 const f=authenticatedImageFixture();f.s.encodedBytes=33554432-5;f.cb.response(dataImageResponse({},{url:'data:'}));f.cb.loadingFinished(imageFinished());assert.equal(f.errors.length,0);assert.equal(f.s.encodedBytes,33554432);f.coordinator.dispose();
 for(const alter of [f=>{f.s.encodedBytes=33554432-4;f.cb.response(dataImageResponse({},{url:'data:'}));},f=>{f.cb.response(dataImageResponse());f.s.encodedBytes=33554431;f.cb.dataReceived(imageData({dataLength:2}));},f=>{f.cb.response(dataImageResponse());f.cb.dataReceived(imageData({dataLength:Number.MAX_SAFE_INTEGER,encodedDataLength:1}));},f=>{f.cb.response(dataImageResponse());f.cb.loadingFinished(imageFinished({encodedDataLength:33554432}));}]){const g=authenticatedImageFixture();alter(g);assert.ok(g.errors.length);assert.ok(g.s.encodedBytes<=33554432);g.coordinator.dispose();}
});
test('data Image refuses inline streamed payload, malformed counts, duplicate/unknown/postterminal sequences',()=>{
 const actions=[f=>f.cb.dataReceived(imageData()),f=>f.cb.loadingFinished(imageFinished()),f=>{f.cb.response(dataImageResponse());f.cb.response(dataImageResponse());},f=>{f.cb.response(dataImageResponse());f.cb.dataReceived(imageData({data:''}));},
  ...[-0,-1,1.5,Infinity,NaN,'1'].map(dataLength=>f=>{f.cb.response(dataImageResponse());f.cb.dataReceived(imageData({dataLength}));}),
  f=>{f.cb.response(dataImageResponse());f.cb.loadingFinished(imageFinished());f.cb.dataReceived(imageData());},f=>{f.cb.response(dataImageResponse());f.cb.loadingFinished(imageFinished());f.cb.loadingFinished(imageFinished());},
  f=>{f.cb.response(dataImageResponse());f.cb.paused({...f.request('second'),networkId:'local-image',resourceType:'Image'});},
  f=>{f.cb.response(dataImageResponse());const before=f.coordinator.snapshot();f.cb.paused({...f.request('local-image'),networkId:'different-network',resourceType:'Image'});assert.deepEqual(f.coordinator.snapshot(),before);}
 ];for(const action of actions){const f=authenticatedImageFixture();action(f);assert.ok(f.errors.length);f.coordinator.dispose();}
});
test('data Image32 historical tombstones and exact aggregate retained guard precede acceptance',()=>{
 const f=authenticatedImageFixture();for(let i=0;i<32;i++){f.cb.response(dataImageResponse({requestId:'local-'+i}));f.cb.loadingFinished(imageFinished({requestId:'local-'+i}));}assert.equal(f.errors.length,0);const before=f.s.encodedBytes;f.cb.response(dataImageResponse({requestId:'local-32'}));assert.equal(f.errors[0].code,'local-image-capacity');assert.equal(f.s.encodedBytes,before);f.coordinator.dispose();
 let account=()=>0;const g=authenticatedImageFixture({guard(){if(account()>32768)throw Object.assign(Error('invented aggregate refusal'),{code:'registry-capacity'});}});const empty=g.cb.retainedTerminalBytes();account=()=>32768-empty+g.cb.retainedTerminalBytes();g.cb.response(dataImageResponse());assert.equal(g.errors[0].code,'registry-capacity');assert.ok(account()>32768);g.coordinator.dispose();
});
test('data Image requires actual terminal event; exact owned close abort alone is allowed',()=>{
 for(const failure of [{type:'Image',errorText:'net::ERR_ABORTED',canceled:false},{type:'Image',errorText:'net::ERR_BLOCKED_BY_CLIENT',canceled:true},{type:'Image',errorText:'net::ERR_ABORTED',canceled:true}]){
  const f=authenticatedImageFixture();f.cb.response(dataImageResponse());f.cb.loadingFailed({...imageFinished(),...failure});assert.equal(f.errors[0]?.code,'resource-transport-loss');f.coordinator.dispose();
 }
 const f=authenticatedImageFixture();f.cb.response(dataImageResponse());retireImageFixture(f);assert.throws(()=>f.cb.assertRetirementDenials(),{code:'local-image-unsettled'});f.cb.loadingFailed({...imageFinished(),type:'Image',errorText:'net::ERR_ABORTED',canceled:true});assert.equal(f.errors.length,0);f.cb.assertRetirementDenials();f.coordinator.dispose();
 const g=authenticatedImageFixture();g.cb.response(dataImageResponse());g.s.verifiedLoader='wrong';g.cb.loadingFinished(imageFinished());assert.equal(g.errors[0].code,'local-image-sequence');g.coordinator.dispose();
});
test('unknown four Network events bind only exact generated error to closed enums, never grant HTTP admission',()=>{
 for(const [method,event,code]of [['response','response','unknown-network-response'],['dataReceived','data','unknown-network-data'],['loadingFinished','finished','unknown-loading-finished'],['loadingFailed','failed','unknown-network-failure']]){
  const f=authenticatedImageFixture(),d=method==='response'?dataImageResponse({},{url:'https://unknown.org/private'}):{requestId:'unknown'};f.cb[method](d);const first=f.errors[0];assert.equal(first.code,code);const witness=f.cb.networkWitnessFor(first);
  assert.equal(witness.event,event);assert.equal(witness.scheme,method==='response'?'https':'unavailable');assert.equal(f.cb.networkWitnessFor(Object.assign(Error(),{code})),null);assert.equal(f.cb.networkWitnessFor(undefined),null);assert.ok(Object.isFrozen(witness));
  f.cb.response(dataImageResponse());assert.equal(f.errors.at(-1),first);assert.deepEqual(f.cb.networkWitnessFor(first),witness);assert.equal(JSON.stringify(witness).includes('private'),false);f.coordinator.dispose();
 }
});
test('networkWitness projection is closed, event/code matched and maximum capture shape stays700B',()=>{
 const witness={schema:'native-network-observation-witness/v1',event:'response',scheme:'extension',resourceType:'CSPViolationReport',frameRelation:'unavailable',loaderRelation:'unavailable'};
 const d={schema:'native-specificity-capture-failure/v1',stage:'article-navigation',rpc:'Page.setLifecycleEventsEnabled',primary:{family:'capture',code:'unknown-network-response'},cleanup:{family:'control-unavailable',code:'origin-representation-unavailable'},journeyWitness:null,timerWitness:null,infrastructureWitness:null,networkWitness:witness,operationWitness:null,ownerNavigationWitness:null,navigationAccountingWitness:null};
 const projected=projectSpecificityCaptureDiagnostic(d);assert.ok(Object.isFrozen(projected.networkWitness));assert.ok(Buffer.byteLength(JSON.stringify(projected))<=700);let hooks=0;const getter={...witness};Object.defineProperty(getter,'scheme',{get(){hooks++;throw 0;}});
 for(const networkWitness of [getter,new Proxy(witness,{ownKeys(){hooks++;throw 0;},getPrototypeOf(){hooks++;throw 0;}}),{...witness,event:'failed'},{...witness,scheme:'secret'},{...witness,resourceType:'secret'},{...witness,frameRelation:'secret'},{...witness,extra:1}])assert.throws(()=>projectSpecificityCaptureDiagnostic({...d,networkWitness}),{code:'diagnostic-contract'});
 assert.throws(()=>projectSpecificityCaptureDiagnostic({...d,primary:{family:'capture',code:'contract'}}));assert.equal(hooks,0);
});

test('local Image every subsequent event binds original capabilities and private terminal proof',()=>{
 for(const method of ['dataReceived','loadingFinished','loadingFailed'])for(const state of ['session','token','page','frameId','fake-close']){
  const f=authenticatedImageFixture();f.cb.response(dataImageResponse());if(state==='fake-close'){f.s.retiring=true;f.s.closeIssued=true;f.s.readsRevoked=true;}else f.s[state]=state==='frameId'?'other':{};
  f.cb[method](method==='dataReceived'?imageData():{...imageFinished(),errorText:'net::ERR_ABORTED',canceled:true});assert.equal(f.errors[0]?.code,'local-image-contract');f.coordinator.dispose();
 }
 const f=authenticatedImageFixture();f.cb.response(dataImageResponse());retireImageFixture(f);f.s.mainDetached=true;f.cb.dataReceived(imageData());f.cb.loadingFinished(imageFinished());assert.equal(f.errors.length,0);f.cb.assertRetirementDenials();f.coordinator.dispose();
 for(const method of ['dataReceived','loadingFinished','loadingFailed']){const g=authenticatedImageFixture();g.cb.response(dataImageResponse());g.cb[method]({...imageData(),timestamp:-0,errorText:'net::ERR_ABORTED',canceled:true});assert.equal(g.errors[0]?.code,'local-image-contract');g.coordinator.dispose();}
});
test('local Image admission event and retained exact boundaries run before acceptance, including maximum MIME',()=>{
 let events=0;const f=authenticatedImageFixture({countEvent(){if(++events>3)throw Object.assign(Error('invented event ceiling'),{code:'event-capacity'});}});f.cb.response(dataImageResponse());assert.equal(f.errors[0]?.code,'event-capacity');assert.equal(f.s.encodedBytes,0);f.coordinator.dispose();
 for(const limit of [32768,32767]){let account=()=>0;const g=authenticatedImageFixture({guard(){if(account()>32768)throw Object.assign(Error('invented retained ceiling'),{code:'registry-capacity'});}}),empty=g.cb.retainedTerminalBytes(),row=256+2*('local-image'.length+'frame'.length+'loader'.length);account=()=>limit-empty-row+g.cb.retainedTerminalBytes();g.cb.response(dataImageResponse({},{mimeType:'image/'+'a'.repeat(90)}));assert.equal(g.errors.length,0);assert.equal(account(),limit);g.coordinator.dispose();}
 const g=authenticatedImageFixture();g.cb.response(dataImageResponse({},{fromEarlyHints:true}));assert.equal(g.errors[0]?.code,'unknown-network-response');g.coordinator.dispose();
});
test('local Image initial/chunk/final encoded counters charge once and contradictions cannot terminalize',()=>{
 for(const initial of [0,3]){const f=authenticatedImageFixture();f.cb.response(dataImageResponse({},{encodedDataLength:initial}));assert.equal(f.s.encodedBytes,'data:image/png;base64,AA=='.length+initial);f.cb.dataReceived(imageData({dataLength:4,encodedDataLength:5}));f.cb.loadingFinished(imageFinished({encodedDataLength:10}));assert.equal(f.errors.length,0);assert.equal(f.s.encodedBytes,'data:image/png;base64,AA=='.length+4+10);f.coordinator.dispose();}
 for(const initial of [-0,-1,NaN,Infinity,33554433,1.5,'1']){const g=authenticatedImageFixture();g.cb.response(dataImageResponse({},{encodedDataLength:initial}));assert.equal(g.errors[0]?.code,'unknown-network-response');assert.equal(g.s.encodedBytes,0);g.coordinator.dispose();}
 for(const [initial,chunks,final]of [[4,0,3],[0,5,4]]){const g=authenticatedImageFixture();g.cb.response(dataImageResponse({},{encodedDataLength:initial}));g.cb.dataReceived(imageData({encodedDataLength:chunks}));g.cb.loadingFinished(imageFinished({encodedDataLength:final}));assert.equal(g.errors[0]?.code,'local-image-contract');g.coordinator.dispose();}
 for(const type of [undefined,'Document','Script','Other']){const g=authenticatedImageFixture();g.cb.response(dataImageResponse());retireImageFixture(g);g.cb.loadingFailed({...imageFinished(),type,errorText:'net::ERR_ABORTED',canceled:true});assert.equal(g.errors[0]?.code,'local-image-contract');assert.throws(()=>g.cb.assertRetirementDenials());g.coordinator.dispose();}
 const g=authenticatedImageFixture();g.s.encodedBytes=33554432-7;g.cb.response(dataImageResponse({},{url:'data:',encodedDataLength:3}));assert.equal(g.errors[0]?.code,'encoded-resource-capacity');assert.equal(g.s.encodedBytes,33554432-7);g.coordinator.dispose();
});
test('actual four-case data Image producer precedes navigation reply/DCL without changing reads/facts/outcomes',async()=>{
 const api=await import('./browser-capture.mjs?adr201-local-four'),f=fixture();let emissions=0;const fake=fakeBrowser(f,{causalResponse:true,localImageEvents(session,n){
  assert.equal(fake.observation().nativeReads,n-1);emissions++;session.emit('Network.responseReceived',dataImageResponse({requestId:'local-'+n,frameId:'frame-'+n,loaderId:'loader-'+n}));
  session.emit('Network.dataReceived',imageData({requestId:'local-'+n,dataLength:12}));session.emit('Network.loadingFinished',imageFinished({requestId:'local-'+n}));
 }}),rows=[];
 try{const summary=await api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)}));assert.equal(summary.available,4);assert.equal(emissions,4);assert.equal(fake.observation().nativeReads,4);assert.ok(summary.cases.every(c=>Object.values(c.journey.seen).every(Boolean)&&c.encodedBytes==='data:image/png;base64,AA=='.length+12));
  assert.equal(fake.observation().transport.filter(m=>m==='Fetch.continueRequest').length,4);assert.equal(fake.observation().transport.filter(m=>m==='Fetch.continueResponse').length,4);assert.equal(fake.observation().transport.includes('Fetch.failRequest'),false);assert.equal(rows.length,4);api.releaseCapturedBatch(summary);
 }finally{fake.restore();}
});
test('actual page destruction and full census cannot invent a missing local Image terminal event',async()=>{
 const api=await import('./browser-capture.mjs?adr201-missing-local-terminal'),f=fixture(),fake=fakeBrowser(f,{causalResponse:true,localImageEvents(session,n){session.emit('Network.responseReceived',dataImageResponse({requestId:'local-'+n,frameId:'frame-'+n,loaderId:'loader-'+n}));}});
 try{await assert.rejects(api.captureNativeSpecificityBatch(captureArgs(f,fake)),{code:'local-image-unsettled'});assert.equal(fake.observation().retiredCount,1);assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});assert.equal(api.captureFailureDiagnostic().networkWitness,null);}finally{fake.restore();}
});
test('actual unknown HTTP capture exact witness survives cleanup and bounded capture-to-driver serialization',async()=>{
 const api=await import('./browser-capture.mjs?adr201-unknown-http'),f=fixture(),fake=fakeBrowser(f,{causalResponse:true,localImageEvents(session,n){session.emit('Network.responseReceived',dataImageResponse({requestId:'unknown-'+n,frameId:'frame-'+n,loaderId:'loader-'+n},{url:'https://unowned.invalid/private-content'}));}}),close=fake.context.close;fake.context.close=async()=>{await close();throw Error('private cleanup details');};
 try{const original=await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake)));assert.equal(original.code,'unknown-network-response');const d=api.captureFailureDiagnostic();assert.deepEqual(d.networkWitness,{schema:'native-network-observation-witness/v1',event:'response',scheme:'https',resourceType:'Image',frameRelation:'main',loaderRelation:'main'});assert.equal(d.journeyWitness,null);assert.equal(d.timerWitness,null);assert.equal(d.infrastructureWitness,null);assert.ok(d.cleanup);assert.equal(fake.observation().nativeReads,0);
  let emitted;const boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:chunk=>{emitted=chunk;},captureDiagnostic:()=>JSON.stringify(api.projectSpecificityCaptureDiagnostic(api.captureFailureDiagnostic()))});boundary.mark('browser-capture');assert.equal(await thrown(()=>boundary.run(async()=>{throw original;})),original);const wire=Buffer.isBuffer(emitted)?emitted.toString('utf8'):String(emitted);assert.ok(Buffer.byteLength(wire)<=900);assert.deepEqual(JSON.parse(wire).capture.networkWitness,d.networkWitness);assert.equal(wire.includes('private'),false);assert.equal(await thrown(()=>api.assertCaptureHealthy()),original);
 }finally{fake.restore();}
});
test('earlier falsy and other-registry same-code errors cannot borrow a later network witness',async()=>{
 for(const [index,value]of [undefined,null,false,0].entries()){
  const api=await import('./browser-capture.mjs?adr201-first-'+index),f=fixture();let later;const fake=fakeBrowser(f,{causalResponse:true,localImageEvents(session,n){later=()=>session.emit('Network.responseReceived',dataImageResponse({requestId:'late-'+n,frameId:'frame-'+n,loaderId:'loader-'+n},{url:'https://unowned.invalid/private'}));}}),close=fake.context.close;
  fake.context.close=async()=>{later?.();await close();throw Error('later cleanup');};try{assert.equal(await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow(){throw value;}}))),value);assert.equal(api.captureFailureDiagnostic().networkWitness,null);assert.equal(api.captureFailureDiagnostic().primary.family,'unclassified');}finally{fake.restore();}
 }
 const api=await import('./browser-capture.mjs?adr201-other-registry'),external=callbackFixture(),errors=[];
 const cb=api.createPublicArticleCallbacks({state:external.s,coordinator:external.coordinator,owner:{commit(){}},guard(){},clock:()=>0,countEvent(){},onFatal:e=>errors.push(e)});cb.response(dataImageResponse({},{url:'https://unowned.invalid/private'}));const error=errors[0];assert.ok(cb.networkWitnessFor(error));
 const f=fixture(),fake=fakeBrowser(f);try{assert.equal(await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow(){throw error;}}))),error);assert.equal(api.captureFailureDiagnostic().networkWitness,null);assert.equal(api.captureFailureDiagnostic().primary.code,'unknown-network-response');}finally{fake.restore();external.coordinator.dispose();}
});

test('typed metadata-rich Navigation projects ONE whole detached frame to owner/journey/witness',()=>{
 const f=callbackFixture({},{},true),raw=typedNavigation({id:'frame',loaderId:'loader',url:f.url}),actual=f.s.journey;let owned,witnessed,committed;
 f.s.journey={commit(token,value){committed=value;actual.commit(token,value);},abort(){actual.abort();}};
 const cb=createPublicArticleCallbacks({state:f.s,coordinator:f.coordinator,guard(){},clock:()=>0,countEvent(){},onFatal:e=>f.errors.push(e),
  owner:{commit(value){owned=value;assert.notEqual(value,raw);assert.notEqual(value.frame,raw.frame);assert.deepEqual(value.frame,raw.frame);
   raw.frame.id='mutated';raw.frame.securityOriginDetails.isLocalhost=true;raw.frame.gatedAPIFeatures.push('mutated');}},
  journeyCall(site,value,action,suppress){assert.equal(site,'commit');assert.equal(suppress,false);witnessed=value;return action();}});
 cb.frameNavigated(raw);assert.equal(f.errors.length,0);assert.equal(owned,witnessed);assert.equal(owned,committed);assert.deepEqual(Object.keys(owned),['frame']);
 assert.equal(owned.frame.id,'frame');assert.equal(owned.frame.securityOriginDetails.isLocalhost,false);assert.deepEqual(owned.frame.gatedAPIFeatures,[]);
 assert.ok(Object.isFrozen(owned.frame.adFrameStatus.explanations));assert.equal(actual.snapshot().seen.commit,true);f.coordinator.dispose();
});

test('closed typed envelope and nested metadata refuse malformed/accessor/Proxy data without hooks',()=>{
 let hooks=0;const valid=()=>typedNavigation({id:'frame',loaderId:'loader',url:'https://publisher0.org/invented'});
 const getter=(object,key)=>{Object.defineProperty(object,key,{enumerable:true,configurable:true,get(){hooks++;throw Error('forbidden');}});return object;};
 const proxy=value=>new Proxy(value,{getPrototypeOf(){hooks++;throw Error('forbidden');},ownKeys(){hooks++;throw Error('forbidden');},get(){hooks++;throw Error('forbidden');}});
 const inputs=[
  {frame:valid().frame},{...valid(),type:'BackForwardCacheRestore'},{...valid(),type:'unknown'},
  {...valid(),type:null},{...valid(),type:new String('Navigation')},{...valid(),extra:1},
  getter(valid(),'frame'),getter(valid(),'type'),proxy(valid()),{...valid(),frame:proxy(valid().frame)},
  {...valid(),frame:getter(valid().frame,'loaderId')},{...valid(),frame:null},{...valid(),frame:[]},
  {...valid(),frame:{...valid().frame,securityOriginDetails:getter({},'isLocalhost')}},
  {...valid(),frame:{...valid().frame,securityOriginDetails:proxy({isLocalhost:false})}},
  {...valid(),frame:{...valid().frame,gatedAPIFeatures:getter(['known'],'0')}},
  {...valid(),frame:{...valid().frame,gatedAPIFeatures:proxy([])}},
  {...valid(),frame:{...valid().frame,securityOriginDetails:{isLocalhost:()=>{hooks++;}}}},
  {...valid(),frame:{...valid().frame,name:'x'.repeat(32769)}},
 ];
 const nonenumerable=valid();Object.defineProperty(nonenumerable,'type',{value:'Navigation',enumerable:false});inputs.push(nonenumerable);
 const cyclic=valid();cyclic.frame.securityOriginDetails.loop=cyclic.frame;inputs.push(cyclic);
 for(const input of inputs){const f=callbackFixture({},{},true);let calls=0;const cb=createPublicArticleCallbacks({state:f.s,coordinator:f.coordinator,owner:{commit(){calls++;}},guard(){},clock:()=>0,countEvent(){},onFatal:e=>f.errors.push(e)});
  cb.frameNavigated(input);assert.equal(calls,0);assert.equal(f.errors[0].code,'descriptor');assert.equal(f.s.journey.snapshot().seen.commit,false);f.coordinator.dispose();}
 assert.equal(hooks,0);
});

test('typed child retains parent restrictions; wrong frame/loader/URL/late/duplicate stay fatal and owner ordering is unchanged',()=>{
 const child=callbackFixture();child.cb.frameAttached({frameId:'child',parentFrameId:'frame'});child.cb.frameNavigated(typedNavigation({id:'child',parentId:'frame',loaderId:'child-loader',url:child.url}));
 assert.equal(child.errors.length,0);assert.equal(child.s.refusal,'restricted-rendering');assert.equal(child.s.journey.snapshot().seen.commit,false);child.coordinator.dispose();
 for(const patch of [{id:'wrong'},{loaderId:'blank'},{url:'https://other.org/invented'},{parentId:'unknown'}]){const f=callbackFixture();f.cb.frameNavigated(typedNavigation({id:'frame',loaderId:'loader',url:f.url,...patch}));assert.ok(f.errors.length);assert.equal(f.s.journey.snapshot().seen.commit,false);f.coordinator.dispose();}
 for(const state of ['retiring','retired']){const f=callbackFixture();f.s[state]=true;f.cb.frameNavigated(typedNavigation({id:'frame',loaderId:'loader',url:f.url}));assert.ok(f.errors.length);assert.equal(f.s.journey.snapshot().seen.commit,false);f.coordinator.dispose();}
 const duplicate=callbackFixture();duplicate.cb.frameNavigated(typedNavigation({id:'frame',loaderId:'loader',url:duplicate.url}));duplicate.cb.frameNavigated(typedNavigation({id:'frame',loaderId:'loader',url:duplicate.url}));assert.equal(duplicate.errors[0].code,'duplicate');duplicate.coordinator.dispose();
 const f=callbackFixture({},{},true),ownerError=new Error('invented owner fault'),journeyError=new Error('invented journey fault'),order=[];let ownerValue,journeyValue;
 f.s.journey={commit(token,value){order.push('journey');journeyValue=value;throw journeyError;},abort(){}};
 const cb=createPublicArticleCallbacks({state:f.s,coordinator:f.coordinator,owner:{commit(value){order.push('owner');ownerValue=value;throw ownerError;}},guard(){},clock:()=>0,countEvent(){},onFatal:e=>f.errors.push(e),journeyCall(site,value,action,suppress){order.push('witness');assert.equal(suppress,true);assert.equal(value,ownerValue);return action();}});
 cb.frameNavigated(typedNavigation({id:'frame',loaderId:'loader',url:f.url}));assert.deepEqual(order,['owner','witness','journey']);assert.equal(f.errors[0],ownerError);assert.equal(journeyValue,ownerValue);f.coordinator.dispose();
});

test('typed rich causal and both independent response orders still reach all7facts and native brackets',async()=>{
 for(const options of [{causalResponse:true},{responseFirst:false},{responseFirst:true}]){
  const api=await import('./browser-capture.mjs?adr188-order-'+JSON.stringify(options)),f=fixture(),fake=fakeBrowser(f,options),rows=[];
  try{const result=await api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)}));assert.equal(result.available,4);assert.equal(fake.observation().nativeReads,4);assert.ok(result.cases.every(c=>Object.values(c.journey.seen).every(Boolean)));assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});api.releaseCapturedBatch(result);}finally{fake.restore();}
 }
});

test('actual typed joined fake rejects malformed/BFCache commits before native reads and closes both once',async()=>{
 let hooks=0;const transforms=[value=>({...value,type:'BackForwardCacheRestore'}),value=>({frame:value.frame}),value=>({...value,extra:true}),value=>{
  Object.defineProperty(value.frame.securityOriginDetails,'isLocalhost',{get(){hooks++;throw Error('must not read metadata getter');},enumerable:true});return value;
 }];
 for(let i=0;i<transforms.length;i++){
  const api=await import('./browser-capture.mjs?adr188-bad-join-'+i),f=fixture(),fake=fakeBrowser(f,{frameEvent:transforms[i]}),rows=[];
  try{await assert.rejects(api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)})),{code:'descriptor'});assert.equal(rows.length,0);assert.equal(fake.observation().nativeReads,0);assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});const d=api.captureFailureDiagnostic();assert.equal(d.journeyWitness,null);assert.equal(d.timerWitness,null);}finally{fake.restore();}
 }
 assert.equal(hooks,0);
});

test('both response orders authenticate observed security before503 refusal',async()=>{
 for(const pausedFirst of [false,true])for(const patch of [{},{securityState:'insecure'},{remoteIPAddress:'127.0.0.1'},{remoteIPAddress:'8.8.4.4'}]){
  const f=callbackFixture();f.cb.paused(f.request());if(pausedFirst){f.cb.paused(f.paused(503));assert.equal(f.s.refusal,null);f.cb.response(f.network(503,patch));}else{f.cb.response(f.network(503,patch));assert.equal(f.s.refusal,null);f.cb.paused(f.paused(503));}
  await f.cb.drain().catch(()=>{});
  if(Object.keys(patch).length){assert.ok(f.errors.length>0);assert.equal(f.s.refusal,null);assert.ok(!f.sent.some(x=>x.method==='Fetch.failRequest'));if(!pausedFirst)assert.ok(!f.sent.some(x=>x.method==='Fetch.continueResponse'));}
  else{assert.equal(f.errors.length,0);assert.equal(f.s.refusal,'article-unavailable');assert.equal(f.sent.filter(x=>x.method==='Fetch.failRequest').length,0);assert.equal(f.sent.filter(x=>x.method==='Fetch.continueResponse').length,1);}
  f.coordinator.dispose();
 }
});

test('causal response transport: old wait-both cannot progress; actual collector completes all7facts',async()=>{
 // The old prerequisite is deliberately exercised without a real timer/client:
 // no independent Network record is emitted until this transport is resumed.
 let network=null,oldDispatch=0;const paused={status:200};
 const oldFinish=()=>{if(paused&&network){oldDispatch++;network={};}};
 oldFinish();assert.equal(oldDispatch,0);assert.equal(network,null);
 const api=await import('./browser-capture.mjs?adr187-causal'),f=fixture(),fake=fakeBrowser(f,{causalResponse:true}),rows=[];
 try{const summary=await api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)}));
  assert.equal(rows.length,4);assert.equal(fake.observation().nativeReads,4);assert.equal(summary.available,4);
  assert.ok(summary.cases.every(c=>Object.values(c.journey.seen).every(Boolean)));
  assert.equal(fake.observation().transport.filter(x=>x==='Fetch.continueResponse').length,4);api.releaseCapturedBatch(summary);
 }finally{fake.restore();}
});

test('causal503 and reserved headers publish only AFTER continuation settlement and positive retirement',async()=>{
 for(const options of [{status:503},{responseHeaders:[{name:'x-robots-tag',value:'noindex'}]}]){
  const api=await import('./browser-capture.mjs?adr187-refusal-'+JSON.stringify(options)),f=fixture(),fake=fakeBrowser(f,{...options,causalResponse:true}),rows=[];
  try{const summary=await api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>{assert.equal(fake.observation().retiredCount,rows.length+1);rows.push(r);}}));
   assert.equal(summary.unavailable,4);assert.equal(fake.observation().nativeReads,0);assert.ok(rows.every(r=>r.status==='unavailable'));
   assert.equal(fake.observation().transport.filter(x=>x==='Fetch.continueResponse').length,4);assert.ok(!fake.observation().transport.includes('Fetch.failRequest'));api.releaseCapturedBatch(summary);
  }finally{fake.restore();}
 }
});

test('actual causal refusal cannot publish while original is pending/rejected or independent Network is missing',async()=>{
 for(const reject of [false,true]){
  let settle;const held=new Promise((yes,no)=>{settle=reject?no:yes;}),api=await import('./browser-capture.mjs?adr187-held-'+reject),f=fixture(),fake=fakeBrowser(f,{causalResponse:true,status:503,responseOriginal:held}),rows=[];
  try{const outcome=api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)}));const observed=outcome.then(value=>({value}),error=>({error}));
   for(let i=0;i<100&&!fake.observation().transport.includes('Fetch.continueResponse');i++)await new Promise(resolve=>setImmediate(resolve));
   assert.ok(fake.observation().transport.includes('Fetch.continueResponse'));assert.equal(rows.length,0);assert.equal(fake.observation().retiredCount,0);assert.equal(fake.observation().nativeReads,0);
   settle(reject?new Error('invented original rejection'):undefined);const result=await observed;
   if(reject){assert.equal(result.error.code,'continuation-rejected');assert.equal(rows.length,0);assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});}
   else{assert.equal(rows.length,4);api.releaseCapturedBatch(result.value);}
  }finally{fake.restore();}
 }
 const api=await import('./browser-capture.mjs?adr187-missing-network'),f=fixture(),fake=fakeBrowser(f,{causalResponse:true,causalMissingNetwork:true}),rows=[];let now=0;
 try{await assert.rejects(api.captureNativeSpecificityBatch(captureArgs(f,fake,{clock:()=>now,pause:async()=>{now=20000;},onRow:r=>rows.push(r)})),{code:'article-deadline'});assert.equal(rows.length,0);assert.equal(fake.observation().nativeReads,0);assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});}finally{fake.restore();}
});

test('response reservation is immutable/once before queued and reentrant dispatch; malformed headers never dispatch',async()=>{
 for(const headers of [[{name:'bad name',value:'x'}],[{name:'ok',value:'bad\r\nheader'}],[{name:'ok',value:'\u0001'}],[{name:'ok',value:'x'.repeat(8193)}],Array.from({length:65},()=>({name:'ok',value:'x'}))]){
  const f=callbackFixture();f.cb.paused(f.request());f.cb.paused({...f.paused(),responseHeaders:headers});await f.cb.drain().catch(()=>{});assert.ok(['response-contract','descriptor'].includes(f.errors[0].code));assert.ok(!f.sent.some(x=>x.method==='Fetch.continueResponse'));f.coordinator.dispose();
 }
 let hooks=0;const h={name:'ok'};Object.defineProperty(h,'value',{enumerable:true,get(){hooks++;throw Error();}});
 const unsafe=callbackFixture();unsafe.cb.paused(unsafe.request());unsafe.cb.paused({...unsafe.paused(),responseHeaders:[h]});await unsafe.cb.drain().catch(()=>{});assert.equal(hooks,0);assert.ok(!unsafe.sent.some(x=>x.method==='Fetch.continueResponse'));unsafe.coordinator.dispose();
 const valid=callbackFixture();valid.cb.paused(valid.request());valid.cb.paused({...valid.paused(),responseHeaders:[{name:'x-test',value:'\tfield\u0080'}]});await valid.cb.drain();assert.equal(valid.errors.length,0);assert.equal(valid.s.refusal,null);assert.equal(valid.s.journey.snapshot().seen.response,false);assert.ok(Object.isFrozen(valid.s.paused));valid.coordinator.dispose();
 for(const reenter of [false,true]){
  const f=callbackFixture();let resolveRequest,responseCalls=0;
  f.s.session.send=(method,args)=>{f.sent.push({method,args});if(method==='Fetch.continueRequest')return new Promise(resolve=>{resolveRequest=resolve;});if(method==='Fetch.continueResponse'){responseCalls++;if(reenter)f.cb.paused(f.paused());}return Promise.resolve();};
  f.cb.paused(f.request());f.cb.paused(f.paused());assert.equal(f.s.responseContinuationSubmitted,true);assert.equal(responseCalls,0);
  if(!reenter)f.cb.paused(f.paused());resolveRequest();await f.cb.drain().catch(()=>{});
  assert.ok(f.errors.length);assert.ok(responseCalls<=1);assert.ok(!f.sent.some(x=>x.method==='Fetch.failRequest'));f.coordinator.dispose();
 }
});

test('missing independent response, rejected/pending original and late contradictions never provide readiness',async()=>{
 const missing=callbackFixture();missing.cb.paused(missing.request());missing.cb.paused(missing.paused());await missing.cb.drain();assert.equal(missing.s.journey.snapshot().seen.response,false);assert.throws(()=>missing.s.journey.assertComplete(missing.token));missing.coordinator.dispose();
 for(const pending of [false,true]){
  const timers=[];const f=callbackFixture({schedule:fn=>{timers.push(fn);return timers.length;},cancel(){}});let rejectResponse;
  f.s.session.send=method=>method==='Fetch.continueResponse'?new Promise((_,no)=>{rejectResponse=no;}):Promise.resolve();
  f.cb.paused(f.request());await f.cb.drain();f.cb.paused(f.paused());assert.equal(f.coordinator.snapshot().physical,1);assert.throws(()=>f.coordinator.assertDrained(),{code:'unsettled-operations'});
  if(pending){timers.at(-1)();await Promise.resolve();assert.equal(f.coordinator.snapshot().physical,1);}
  rejectResponse(new Error('invented transport rejection'));await f.cb.drain().catch(()=>{});assert.ok(f.errors.length);assert.equal(f.s.refusal,null);assert.throws(()=>f.s.journey.assertComplete(f.token));f.coordinator.dispose();
 }
 const late=callbackFixture();late.cb.paused(late.request());late.cb.paused(late.paused());late.cb.response(late.network());await late.cb.drain();late.cb.response(late.network(200,{securityState:'insecure'}));assert.equal(late.errors[0].code,'duplicate-main-response');assert.ok(!late.sent.some(x=>x.method==='Fetch.failRequest'));late.coordinator.dispose();
});

test('exact timer entry attribution survives concurrent lanes/changed labels; first error and physical slots stay held',async()=>{
 for(const lane of ['ordinary','denial','cleanup']){
  const timers=[],failures=[];let release;
  const c=createNativeCaptureCoordinator({guard(){},clock:()=>0,schedule:fn=>{timers.push(fn);return timers.length;},cancel(){},onFailure:e=>failures.push(e)});
  const method=lane==='ordinary'?'rpc':lane==='denial'?'resolveFetch':'cleanup',label=lane==='ordinary'?'Page.navigate':lane==='denial'?'Fetch.continueResponse':'browser.close';
  const original=c[method](()=>new Promise(resolve=>{release=resolve;}),label);const observed=original.catch(e=>e);
  // Another operation/label must not become the pending entry's timer identity.
  if(lane!=='cleanup')await c.rpc(()=>Promise.resolve(),'Fetch.continueRequest');
  timers[0]();const error=await observed;assert.equal(error,failures[0]);assert.deepEqual(c.timerWitnessFor(error),{lane,rpc:label});assert.equal(c.timerWitnessFor(new Error()),null);
  assert.equal(c.snapshot().physical,1);assert.throws(()=>c.assertDrained(),{code:'unsettled-operations'});
  if(timers.length>1){timers[1]();assert.deepEqual(c.timerWitnessFor(error),{lane,rpc:label});}
  release();await new Promise(resolve=>setImmediate(resolve));c.assertDrained();c.dispose();
 }
 let hooks=0;const proxy=new Proxy({lane:'ordinary',rpc:'Page.navigate'},{ownKeys(){hooks++;throw Error();},get(){hooks++;throw Error();},getPrototypeOf(){hooks++;throw Error();}});
 const failures=[],c=createNativeCaptureCoordinator({guard(){},clock:()=>0,onFailure:e=>failures.push(e)});c.fail('client-operation',proxy);assert.equal(hooks,0);assert.equal(c.timerWitnessFor(failures[0]),null);c.dispose();
});

test('ADR202 exact operation witness is bound before synchronous reporting for all lanes and both kinds, no rearm',async()=>{
 for(const [method,lane,rpc]of [['rpc','ordinary','Page.navigate'],['resolveFetch','denial','Fetch.failRequest'],['cleanup','cleanup','browser.close']])for(const kind of ['sync-throw','promise-rejection']){
  const timers=[],failures=[],atDispatch=[];let c;const cause=new NativeCaptureError('response-contract');
  c=createNativeCaptureCoordinator({guard(){},clock:()=>0,schedule:fn=>{timers.push(fn);return timers.length;},cancel(){},onFailure:error=>{failures.push(error);atDispatch.push(c.operationWitnessFor(error));}});
  const error=await thrown(()=>c[method](()=>{if(kind==='sync-throw')throw cause;return Promise.reject(cause);},rpc));
  assert.equal(error,failures[0]);assert.equal(error.code,'client-operation');assert.notEqual(error,cause);assert.deepEqual(c.operationWitnessFor(error),{lane,rpc,kind,cause:{family:'capture',code:'response-contract'}});assert.equal(c.operationWitnessFor(error),atDispatch[0]);assert.ok(Object.isFrozen(atDispatch[0].cause));assert.equal(c.operationWitnessFor(cause),null);assert.equal(c.operationWitnessFor(new NativeCaptureError('client-operation')),null);assert.equal(c.timerWitnessFor(error),null);assert.equal(timers.length,1);await new Promise(resolve=>setImmediate(resolve));c.assertDrained();c.dispose();
 }
});
test('ADR202 pending earlier denial retains submission label despite a later ordinary RPC',async()=>{
 const timers=[],failures=[],original=heldOriginal(),c=createNativeCaptureCoordinator({guard(){},clock:()=>0,schedule:fn=>{timers.push(fn);return timers.length;},cancel(){},onFailure:e=>failures.push(e)});
 const observed=c.resolveFetch(()=>original.promise,'Fetch.failRequest').catch(e=>e);await c.rpc(()=>Promise.resolve(),'Page.getFrameTree');assert.equal(c.snapshot().physical,1);original.reject(Error('private protocol detail'));const error=await observed;
 assert.deepEqual(c.operationWitnessFor(error),{lane:'denial',rpc:'Fetch.failRequest',kind:'promise-rejection',cause:{family:'unclassified',code:'unclassified'}});assert.equal(timers.length,2);assert.equal(error,failures[0]);await new Promise(resolve=>setImmediate(resolve));c.assertDrained();c.dispose();
});
test('ADR202 timer-first late rejection and public fail cannot borrow operation attribution or free originals',async()=>{
 const timers=[],failures=[],original=heldOriginal(),c=createNativeCaptureCoordinator({guard(){},clock:()=>0,schedule:fn=>{timers.push(fn);return timers.length;},cancel(){},onFailure:e=>failures.push(e)});
 const observed=c.resolveFetch(()=>original.promise,'Fetch.failRequest').catch(e=>e);timers[0]();const error=await observed;assert.equal(error.code,'rpc-deadline');assert.equal(c.operationWitnessFor(error),null);assert.equal(c.snapshot().physical,1);assert.throws(()=>c.assertDrained());original.reject(Error('late private details'));await new Promise(resolve=>setImmediate(resolve));assert.equal(c.operationWitnessFor(error),null);assert.equal(failures.at(-1),error);assert.equal(timers.length,1);c.assertDrained();c.dispose();
 const failures2=[],d=createNativeCaptureCoordinator({guard(){},clock:()=>0,onFailure:e=>failures2.push(e)});d.fail('client-operation',{lane:'ordinary',rpc:'Page.navigate',kind:'sync-throw',cause:{family:'capture',code:'contract'}});assert.equal(d.operationWitnessFor(failures2[0]),null);d.dispose();
});
test('ADR202 primitive, forged, Proxy, getter and nonnominal operation causes invoke zero hooks',async()=>{
 let hooks=0;const getter=new NativeCaptureError('contract');Object.defineProperty(getter,'code',{get(){hooks++;throw 0;}});const proxy=new Proxy(Error('private'),{get(){hooks++;throw 0;},getPrototypeOf(){hooks++;throw 0;},ownKeys(){hooks++;throw 0;}});
 for(const cause of [undefined,null,false,0,'private',proxy,getter,{code:'contract',toJSON(){hooks++;throw 0;}},new Error('private')]){
  const failures=[],c=createNativeCaptureCoordinator({guard(){},clock:()=>0,onFailure:e=>failures.push(e)});const error=await thrown(()=>c.rpc(()=>{throw cause;},'Page.navigate'));assert.deepEqual(c.operationWitnessFor(error).cause,{family:'unclassified',code:'unclassified'});assert.equal(error,failures[0]);c.dispose();
 }assert.equal(hooks,0);
});
test('ADR202 actual arm reporting projection failure preserves same generated error and projects only first',async()=>{
 const source=await readFile(new URL('./browser-capture.mjs',import.meta.url),'utf8'),start=source.indexOf('export function createNativeCaptureCoordinator('),end=source.indexOf('\nconst RETIREMENT_RESOURCE_TYPES',start),text=source.slice(start,end).replace(/^export /u,'');
 // Same realm keeps the immutable route core's exact task-prototype checks;
 // only the private observation projector is fault-injected, not execution.
 for(const projectionThrows of [false,true]){let projections=0;const failures=[],timers=[],factory=Function('createRouteCoordinator','NativeCaptureError','FAILURE_RPCS','frozen','bad','errorProjection','return ('+text+');')(createRouteCoordinator,NativeCaptureError,new Set(['Page.navigate','browser.close']),Object.freeze,code=>{throw new NativeCaptureError(code);},()=>{projections++;if(projectionThrows)throw Error('invented projection refusal');return {family:'unclassified',code:'unclassified'};});
  const c=factory({guard(){},clock:()=>0,schedule:fn=>{timers.push(fn);return timers.length;},cancel(){},onFailure:e=>failures.push(e)}),error=await thrown(()=>c.rpc(()=>{throw false;},'Page.navigate'));
  assert.equal(error,failures[0]);assert.equal(error.code,'client-operation');assert.equal(c.operationWitnessFor(error)===null,projectionThrows);const first=c.operationWitnessFor(error);assert.equal(await thrown(()=>c.cleanup(()=>{throw undefined;},'browser.close')),error);assert.equal(projections,1);assert.equal(timers.length,2);assert.equal(c.operationWitnessFor(error),first);c.dispose();
 }
 const factory=runInNewContext('('+text+')',{createRouteCoordinator:()=>({snapshot:()=>({normalActive:0,cleanupActive:0,denialActive:1,backlog:0}),dispose(){}}),NativeCaptureError,bad:code=>{throw new NativeCaptureError(code);}});assert.throws(()=>factory({guard(){},clock:()=>0,schedule(){},cancel(){},onFailure(){}}).assertDrained(),{code:'unsettled-operations'});
});
test('ADR202 operation DTO is closed, zero-hook, primary restricted and bounded with maximal cause',()=>{
 const operationWitness={lane:'ordinary',rpc:'Page.setLifecycleEventsEnabled',kind:'promise-rejection',cause:{family:'control-unavailable',code:'origin-representation-unavailable'}},d={schema:'native-specificity-capture-failure/v1',stage:'article-retirement',rpc:'Page.setLifecycleEventsEnabled',primary:{family:'capture',code:'client-operation'},cleanup:{family:'control-unavailable',code:'origin-representation-unavailable'},journeyWitness:null,timerWitness:null,infrastructureWitness:null,networkWitness:null,operationWitness,ownerNavigationWitness:null,navigationAccountingWitness:null};
 const p=projectSpecificityCaptureDiagnostic(d);assert.ok(Object.isFrozen(p.operationWitness.cause));assert.ok(Buffer.byteLength(JSON.stringify(p))<=700);let hooks=0;const getter={...operationWitness};Object.defineProperty(getter,'lane',{get(){hooks++;throw 0;}});
 for(const witness of [getter,new Proxy(operationWitness,{getPrototypeOf(){hooks++;throw 0;},ownKeys(){hooks++;throw 0;}}),{...operationWitness,lane:'private'},{...operationWitness,rpc:'private'},{...operationWitness,kind:'private'},{...operationWitness,cause:{family:'unclassified',code:'private'}},{...operationWitness,extra:1}])assert.throws(()=>projectSpecificityCaptureDiagnostic({...d,operationWitness:witness}),{code:'diagnostic-contract'});
 assert.throws(()=>projectSpecificityCaptureDiagnostic({...d,primary:{family:'capture',code:'contract'}}),{code:'diagnostic-contract'});assert.equal(hooks,0);
});

test('timer witness projection is closed/zero hooks, under700B, with no attribution to earlier faults',()=>{
 const base={schema:'native-specificity-capture-failure/v1',stage:'article-retirement',rpc:'Page.setLifecycleEventsEnabled',primary:{family:'capture',code:'article-deadline'},cleanup:{family:'control-unavailable',code:'origin-representation-unavailable'},journeyWitness:null,infrastructureWitness:null,networkWitness:null,operationWitness:null,ownerNavigationWitness:null,navigationAccountingWitness:null};
 for(const lane of ['ordinary','denial','cleanup']){const d=projectSpecificityCaptureDiagnostic({...base,timerWitness:{lane,rpc:'Page.setLifecycleEventsEnabled'}});assert.ok(Buffer.byteLength(JSON.stringify(d))<=700);assert.ok(Object.isFrozen(d.timerWitness));}
 let hooks=0;const value={lane:'ordinary'};Object.defineProperty(value,'rpc',{get(){hooks++;throw Error();}});
 for(const timerWitness of [value,new Proxy({},{getPrototypeOf(){hooks++;throw Error();}}),{lane:'unknown',rpc:'Page.navigate'},{lane:'ordinary',rpc:'private-secret'},{lane:'ordinary',rpc:'Page.navigate',extra:1}])assert.throws(()=>projectSpecificityCaptureDiagnostic({...base,timerWitness}),{code:'diagnostic-contract'});
 assert.throws(()=>projectSpecificityCaptureDiagnostic({...base,primary:{family:'capture',code:'client-operation'},timerWitness:{lane:'ordinary',rpc:'Page.navigate'}}),{code:'diagnostic-contract'});assert.equal(hooks,0);
 const timers=[],errors=[],c=createNativeCaptureCoordinator({guard(){},clock:()=>0,schedule:fn=>{timers.push(fn);return 1;},cancel(){},onFailure:e=>errors.push(e)});let release;
 const task=c.cleanup(()=>new Promise(resolve=>{release=resolve;}),'browser.close').catch(e=>e);c.fail('client-operation');timers[0]();assert.equal(c.timerWitnessFor(errors[0]),null);release();return task.then(()=>c.dispose());
});

test('actual capture timer joins the exact global primary; cleanup-first can own it, earlier falsy body cannot borrow',async()=>{
 const saved={setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
 for(const kind of ['launch','cleanup-first','earlier-body']){
  const timers=[];let release;
  globalThis.setTimeout=(fn,ms)=>{const ticket={fn,ms,canceled:false};timers.push(ticket);return ticket;};globalThis.clearTimeout=ticket=>{ticket.canceled=true;};
  const api=await import('./browser-capture.mjs?adr187-global-timer-'+kind),f=fixture(),fake=fakeBrowser(f),held=new Promise(resolve=>{release=resolve;});
  try{
   if(kind==='launch')fake.chromium.launchPersistentContext=()=>held;
   else{const close=fake.context.close;fake.context.close=async()=>{await close();return held;};}
   const outcome=api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow(){if(kind==='earlier-body')throw false;}}));const observed=outcome.then(value=>({value}),error=>({error}));
   let timer;for(let i=0;i<200&&!timer;i++){timer=timers.find(t=>!t.canceled&&t.ms===(kind==='launch'?10000:2000));if(!timer)await new Promise(resolve=>setImmediate(resolve));}
   assert.ok(timer);timer.fn();const result=await observed,d=api.captureFailureDiagnostic();
   if(kind==='earlier-body'){assert.equal(result.error,false);assert.equal(d.timerWitness,null);assert.equal(d.primary.family,'unclassified');assert.equal(d.cleanup.code,'rpc-deadline');}
   else{assert.equal(result.error.code,'rpc-deadline');assert.deepEqual(d.timerWitness,{lane:kind==='launch'?'ordinary':'cleanup',rpc:kind==='launch'?'context.launch':'context.close'});}
   assert.ok(Buffer.byteLength(JSON.stringify(d))<=700);if(kind!=='launch')assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});
   release(kind==='launch'?fake.context:undefined);await new Promise(resolve=>setImmediate(resolve));
  }finally{release();fake.restore();globalThis.setTimeout=saved.setTimeout;globalThis.clearTimeout=saved.clearTimeout;}
 }
});
test('second FetchID cannot mask admitted main NetworkID before or after readiness',async()=>{
 for(const ready of [false,true])for(const errorText of ['net::ERR_TIMED_OUT','net::ERR_CERT_AUTHORITY_INVALID','unknown']){
  const f=callbackFixture();f.cb.paused(f.request());
  if(ready){f.cb.response(f.network());f.cb.paused(f.paused());f.cb.frameNavigated(typedNavigation({id:'frame',loaderId:'loader',url:f.url}));f.cb.lifecycle({frameId:'frame',loaderId:'loader',name:'DOMContentLoaded',timestamp:1});f.cb.loadingFinished({requestId:'net',timestamp:1,encodedDataLength:1});f.s.journey.reply(f.token,{frameId:'frame',loaderId:'loader'});await f.cb.drain();f.s.journey.assertComplete(f.token);}
  f.cb.paused(f.request('malformed-second-request'));f.cb.loadingFailed({requestId:'net',errorText});await f.cb.drain().catch(()=>{});
  assert.equal(f.errors[0].code,'admitted-main-id-reuse');assert.equal(f.s.refusal,null);assert.ok(!f.sent.some(x=>x.method==='Fetch.failRequest'));
  let published=0;try{f.s.journey.assertComplete(f.token);published++;}catch{}assert.equal(published,0);f.coordinator.dispose();
 }
});
test('origin/native roster element getters and Array subclasses invoke zero hooks',async()=>{
 const f=fixture(),cases=f.batch.cases.map(({id,groupId,url,language})=>({id,groupId,url,language}));let hooks=0;
 Object.defineProperty(cases,'0',{enumerable:true,configurable:true,get(){hooks++;throw Error('forbidden element read');}});
 await assert.rejects(collectOriginPolicies({cases,fetchPublic:async()=>{hooks++;throw Error('forbidden fetch');}}));
 const batch={...f.batch,cases:[...f.batch.cases]};Object.defineProperty(batch.cases,'0',{enumerable:true,configurable:true,get(){hooks++;throw Error('forbidden roster read');}});
 assert.throws(()=>createNativeReaderTransfer({chromeApi:{},reader:{},urlPolicy,batch}));
 class Hostile extends Array{map(){hooks++;throw Error('must not call map');}}
 await assert.rejects(collectOriginPolicies({cases:Hostile.from(f.batch.cases),fetchPublic:async()=>{hooks++;}}));assert.equal(hooks,0);
});
test('all4ordinary503 refusals compact only after destruction/census/drain, same32KiB cap',async()=>{
 const api=await import('./browser-capture.mjs?invented-four-refusals'),f=fixture(),fake=fakeBrowser(f,{status:503,teardownEvents:true}),rows=[];
 try{const summary=await api.captureNativeSpecificityBatch({...f,expectedPanelIdentity:f.manifest.panelIdentity,expectedManifestHash:f.manifest.manifestHash,...fake,stagedExtensionPath:'D:/invented/stage',profilePath:'D:/invented/profile',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',studyId:'invented-all-http-refused',guard(){},onRow:r=>rows.push(r),collectPolicies:async()=>({requests:[],elapsedMs:0,entries:new Map(f.batch.cases.map(c=>[c.url,{status:'eligible',receiptSha256:'a'.repeat(64)}])),async beforePage(){}})});
  assert.equal(summary.unavailable,4);assert.equal(summary.available,0);assert.ok(rows.every(r=>r.reason==='article-unavailable'));assert.equal(summary.cases.length,4);assert.ok(summary.cases.every(r=>r.journey.code==='external-failure'&&r.teardownLifecycle===1));api.releaseCapturedBatch(summary);
 }finally{fake.restore();}
});
test('owned teardown allows exact current lifecycle/known canceled resources, never old attach/socket',async()=>{
 const f=fixture(),fake=fakeBrowser(f,{teardownEvents:true}),api=await import('./browser-capture.mjs?invented-owned-teardown');
 const args={...f,expectedPanelIdentity:f.manifest.panelIdentity,expectedManifestHash:f.manifest.manifestHash,...fake,stagedExtensionPath:'D:/invented/stage',profilePath:'D:/invented/profile',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',studyId:'invented-transport-teardown',guard(){},onRow(){},collectPolicies:async()=>({requests:[],elapsedMs:0,entries:new Map(f.batch.cases.map(c=>[c.url,{status:'eligible',receiptSha256:'a'.repeat(64)}])),async beforePage(){}})};
 try{const summary=await api.captureNativeSpecificityBatch(args);assert.ok(summary.cases.every(r=>r.teardownLifecycle===1&&r.teardownAborts===1));api.releaseCapturedBatch(summary);}finally{fake.restore();}
 for(const kind of ['lateOldAttach','lateOldSocket']){
  const module=await import('./browser-capture.mjs?invented-'+kind),fake=fakeBrowser(f,{[kind]:true}),rows=[];
  try{await assert.rejects(module.captureNativeSpecificityBatch({...args,...fake,studyId:'invented-'+kind,onRow:r=>rows.push(r)}));assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});assert.ok(rows.length<4);}finally{fake.restore();}
 }
});
test('four header refusals retain bounded compact state after exact normal retirement',async()=>{
 const f=fixture(),fake=fakeBrowser(f,{responseHeaders:[{name:'x-robots-tag',value:'noindex'}],teardownEvents:true}),api=await import('./browser-capture.mjs?invented-header-refusals'),rows=[];
 try{const summary=await api.captureNativeSpecificityBatch({...f,expectedPanelIdentity:f.manifest.panelIdentity,expectedManifestHash:f.manifest.manifestHash,...fake,stagedExtensionPath:'D:/invented/stage',profilePath:'D:/invented/profile',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',studyId:'s'.repeat(160),guard(){},onRow:r=>rows.push(r),collectPolicies:async()=>({requests:[],elapsedMs:0,entries:new Map(f.batch.cases.map(c=>[c.url,{status:'eligible',receiptSha256:'a'.repeat(64)}])),async beforePage(){}})});
  assert.equal(summary.unavailable,4);assert.equal(summary.accounted,4);assert.ok(summary.peakRetainedRegistryBytes<=32768);assert.ok(rows.every(r=>r.reason==='document-policy-unavailable'));api.releaseCapturedBatch(summary);
 }finally{fake.restore();}
});
test('maximum combined identity crossproduct is refused finitely rather than exempted from32KiB',async()=>{
 const f=fixture(),fake=fakeBrowser(f,{responseHeaders:[{name:'x-robots-tag',value:'noindex'}],longIds:true,teardownEvents:true}),api=await import('./browser-capture.mjs?invented-maximum-capacity');
 try{await assert.rejects(api.captureNativeSpecificityBatch({...f,expectedPanelIdentity:f.manifest.panelIdentity,expectedManifestHash:f.manifest.manifestHash,...fake,stagedExtensionPath:'D:/invented/stage',profilePath:'D:/invented/profile',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',studyId:'s'.repeat(160),guard(){},onRow(){},collectPolicies:async()=>({requests:[],elapsedMs:0,entries:new Map(f.batch.cases.map(c=>[c.url,{status:'eligible',receiptSha256:'a'.repeat(64)}])),async beforePage(){}})}),{code:'registry-capacity'});
  assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});assert.throws(()=>api.releaseCapturedBatch({}),{code:'batch-release'});
 }finally{fake.restore();}
});
test('late fault during ACK wait blocks release; late after release poisons phase/model/next batch',async()=>{
 for(const releaseFirst of [false,true]){
  const api=await import('./browser-capture.mjs?invented-late-health-'+releaseFirst),f=fixture(),fake=fakeBrowser(f);let now=0,modelCalls=0;
  const args={...f,expectedPanelIdentity:f.manifest.panelIdentity,expectedManifestHash:f.manifest.manifestHash,...fake,stagedExtensionPath:'D:/invented/stage',profilePath:'D:/invented/profile',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',studyId:'invented-late-health-study',clock:()=>now,guard:()=>api.assertCaptureHealthy(),onRow(){},collectPolicies:async()=>({requests:[],elapsedMs:0,entries:new Map(f.batch.cases.map(c=>[c.url,{status:'eligible',receiptSha256:'a'.repeat(64)}])),async beforePage(){}})};
  try{const summary=await api.captureNativeSpecificityBatch(args);now=540000;assert.equal(api.assertCaptureHealthy(summary),true); // no obsolete20/360s lease
   if(releaseFirst){api.releaseCapturedBatch(summary);assert.equal(api.assertCaptureHealthy(summary),true);}
   fake.fireLateAttach();assert.throws(()=>api.assertCaptureHealthy(),{code:'late-frame-attach'});assert.throws(()=>api.assertCaptureHealthy(summary),{code:'late-frame-attach'});
   assert.equal(api.captureFailureDiagnostic().stage,'late-callback');assert.equal(api.captureFailureDiagnostic().primary.code,'late-frame-attach');
   if(!releaseFirst)assert.throws(()=>api.releaseCapturedBatch(summary),{code:'late-frame-attach'});
   try{api.assertCaptureHealthy();modelCalls++;}catch{}assert.equal(modelCalls,0);await assert.rejects(api.captureNativeSpecificityBatch(args),{code:'late-frame-attach'});
  }finally{fake.restore();}
 }
});

test('joined onRow refuses async returns without constructor/species/then hooks; safe rejection is observed',async()=>{
 for(const kind of ['constructor-getter','subclass-species','then-getter','proxy','safe-rejected']){
  const api=await import('./browser-capture.mjs?invented-async-row-'+kind),f=fixture(),fake=fakeBrowser(f);let hooks=0,submissions=0;
  const original=Promise.resolve();let value=original;
  if(kind==='constructor-getter')Object.defineProperty(value,'constructor',{get(){hooks++;throw new Error('never called');}});
  if(kind==='then-getter')Object.defineProperty(value,'then',{get(){hooks++;throw new Error('never called');}});
  if(kind==='subclass-species'){class Sub extends Promise{static get [Symbol.species](){hooks++;throw new Error('never called');}}value=new Sub(resolve=>resolve());}
  if(kind==='proxy')value=new Proxy(original,{get(){hooks++;throw new Error('never called');},getPrototypeOf(){hooks++;throw new Error('never called');}});
  if(kind==='safe-rejected')value=Promise.reject(new Error('invented rejected row; no raw persistence'));
  try{await assert.rejects(api.captureNativeSpecificityBatch({...f,expectedPanelIdentity:f.manifest.panelIdentity,expectedManifestHash:f.manifest.manifestHash,...fake,
   stagedExtensionPath:'D:/invented/stage',profilePath:'D:/invented/profile',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',studyId:'invented-async-row-'+kind,
   guard(){},onRow(){submissions++;return value;},collectPolicies:async()=>({requests:[],elapsedMs:0,entries:new Map(f.batch.cases.map(c=>[c.url,{status:'eligible',receiptSha256:'a'.repeat(64)}])),async beforePage(){}})}),{code:'async-row'});
   assert.equal(submissions,1);assert.equal(hooks,0);assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});
  }finally{fake.restore();}
 }
});

function captureArgs(f,fake,extra={}){return {...f,expectedPanelIdentity:f.manifest.panelIdentity,expectedManifestHash:f.manifest.manifestHash,...fake,
 stagedExtensionPath:'D:/invented/stage',profilePath:'D:/invented/profile',executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',studyId:'invented-diagnostic-study',guard(){},onRow(){},
 collectPolicies:async()=>({requests:[],elapsedMs:0,entries:new Map(f.batch.cases.map(c=>[c.url,{status:'eligible',receiptSha256:'a'.repeat(64)}])),async beforePage(){}}),...extra};}
async function thrown(action){try{await action();assert.fail('expected refusal');}catch(error){return error;}}

test('diagnostic DTO is closed, bounded and descriptor-first with zero hooks',()=>{
 const value={schema:'native-specificity-capture-failure/v1',stage:'article-read',rpc:'worker.observe',primary:{family:'capture',code:'contract'},cleanup:null,journeyWitness:null,timerWitness:null,infrastructureWitness:null,networkWitness:null,operationWitness:null,ownerNavigationWitness:null,navigationAccountingWitness:null};
 const copy=projectSpecificityCaptureDiagnostic(value);assert.deepEqual(copy,value);assert.ok(Object.isFrozen(copy.primary));assert.ok(Buffer.byteLength(JSON.stringify(copy))<=700);
 let hooks=0;const hostile={...value};Object.defineProperty(hostile,'primary',{get(){hooks++;throw Error('secret');}});
 for(const v of [hostile,new Proxy(value,{getPrototypeOf(){hooks++;throw Error('secret');}}),{...value,stage:'x'.repeat(10000)},{...value,primary:{family:'capture',code:'secret'}},{...value,extra:1}])assert.throws(()=>projectSpecificityCaptureDiagnostic(v),{code:'diagnostic-contract'});
 assert.equal(hooks,0);
});

function witnessFixture(){const token={},scope=createJourneyFailureWitness('blank'),errors=[],url='https://publisher0.org/invented';let journey;
 journey=createPublicJourney({incarnation:token,frameId:'frame',blankLoaderId:'blank',url,until:20000,clock:()=>0,guard(){},onFailure:error=>{scope.capture(error,journey.failureReport());errors.push(error);}});
 return {token,scope,journey,errors,url};}
function witnessReport(phase='dispatched',mask=0){return {phase,seen:Object.fromEntries(FACTS.map((k,i)=>[k,!!(mask&2**i)]))};}
test('four real journey rejection sites project current loader only, unchanged blank refusal',()=>{
 for(const site of ['reply','commit','response','lifecycle']){
  const f=witnessFixture();f.journey.begin(f.token);const input=site==='commit'?{frame:{id:'frame',url:f.url,loaderId:'blank'}}:site==='lifecycle'?{frameId:'frame',loaderId:'blank',name:'commit',timestamp:1}:site==='response'?{schema:'native-main-response-journey/v1',finalUrlHash:createHash('sha256').update(f.url).digest('hex'),status:200,frameId:'frame',loaderId:'blank',fetchRequestId:'request',fetchResponseId:'response',networkRequestId:'network',requestUrlExact:true,ordinaryTlsSecure:true,selectedPublicPinMatched:true,pinHash:'a'.repeat(64),headerPolicyHash:'b'.repeat(64),navigationLoaderVerified:false,domPolicyRequiredSeparately:true,nativeDocumentIdDirectlyCorrelated:false}:{frameId:'frame',loaderId:'blank'};
  assert.throws(()=>f.scope.call(site,input,()=>f.journey[site](f.token,input)),{code:'blank-loader'});
  const error=f.errors[0];assert.deepEqual(f.scope.candidateFor(error),{site,phase:'dispatched',blankLoaderMatch:true,lifecycleName:site==='lifecycle'?'commit':'non-lifecycle',seenFactsMask:0});assert.equal(f.scope.candidateFor(new Error('other')),null);
 }
});
test('accepted commit bit and different current loader survive lifecycle contradiction; replay remains fatal',()=>{
 for(const loader of ['blank','other']){const f=witnessFixture();f.journey.begin(f.token);f.scope.call('commit',{frame:{id:'frame',url:f.url,loaderId:'fresh'}},()=>f.journey.commit(f.token,{frame:{id:'frame',url:f.url,loaderId:'fresh'}}));
  const input={frameId:'frame',loaderId:loader,name:'networkIdle',timestamp:1};assert.throws(()=>f.scope.call('lifecycle',input,()=>f.journey.lifecycle(f.token,input)),{code:loader==='blank'?'blank-loader':'loader-contradiction'});
  assert.deepEqual(f.scope.candidateFor(f.errors[0]),{site:'lifecycle',phase:'dispatched',blankLoaderMatch:loader==='blank',lifecycleName:'networkIdle',seenFactsMask:2});}
 const f=witnessFixture(),input={frameId:'frame',loaderId:'blank',name:'commit',timestamp:1};f.scope.call('lifecycle',input,()=>f.journey.lifecycle(f.token,input));f.journey.begin(f.token);assert.throws(()=>f.scope.call('lifecycle',input,()=>f.journey.lifecycle(f.token,input)),{code:'blank-loader'});assert.equal(f.scope.candidateFor(f.errors[0]).phase,'dispatched');
 const prior=witnessFixture();prior.journey.begin(prior.token);assert.throws(()=>prior.scope.call('lifecycle',input,()=>prior.journey.lifecycle({},input)),{code:'wrong-incarnation'});assert.equal(prior.scope.candidateFor(prior.errors[0]).seenFactsMask,0);
});
test('witness scope restores nested context, clears on throw/Promise, keeps first exact error and invokes zero hooks',async()=>{
 const error=new Error('private'),report=witnessReport();let hooks=0;
 for(const hostile of [new Proxy({loaderId:'blank'},{getPrototypeOf(){hooks++;throw Error();}}),Object.defineProperty({},'loaderId',{get(){hooks++;throw Error();}})]){
  const scope=createJourneyFailureWitness('blank');scope.call('reply',hostile,()=>scope.capture(error,report));assert.equal(scope.candidateFor(error),null);}
 assert.equal(hooks,0);
 const scope=createJourneyFailureWitness('blank');scope.call('reply',{loaderId:'blank'},()=>{scope.call('lifecycle',{loaderId:'fresh',name:'load'},()=>{});scope.capture(error,report);});assert.equal(scope.candidateFor(error).site,'reply');
 scope.call('response',{loaderId:'fresh'},()=>scope.capture(new Error('later'),witnessReport('resolved',127)));assert.equal(scope.candidateFor(error).site,'reply');
 for(const mode of ['throw','promise']){const cleared=createJourneyFailureWitness('blank');if(mode==='throw')assert.throws(()=>cleared.call('reply',{loaderId:'blank'},()=>{throw error;}));else await cleared.call('reply',{loaderId:'blank'},()=>Promise.resolve());cleared.capture(error,report);assert.equal(cleared.candidateFor(error),null);}
 const suppressed=createJourneyFailureWitness('blank');suppressed.call('commit',{frame:{loaderId:'blank'}},()=>suppressed.capture(error,report),true);assert.equal(suppressed.candidateFor(error),null);
 for(const name of [...REPLAY_CATEGORIES,'boundedUnknown','name with spaces']){const next=createJourneyFailureWitness('blank');next.call('lifecycle',{loaderId:'fresh',name},()=>next.capture(error,report));assert.equal(next.candidateFor(error).lifecycleName,REPLAY_CATEGORIES.includes(name)?name:name==='boundedUnknown'?'other-bounded':'unavailable');}
 const badReport=createJourneyFailureWitness('blank'),unsafe=Object.defineProperty({},'seen',{get(){hooks++;throw Error('projection');}});badReport.call('reply',{loaderId:'blank'},()=>badReport.capture(error,unsafe));assert.equal(badReport.candidateFor(error),null);assert.equal(hooks,0);
});
test('largest witness and finite errors remain closed under700B and invalid projections have zero hooks',()=>{
 const witness={site:'lifecycle',phase:'dispatched',blankLoaderMatch:false,lifecycleName:'firstMeaningfulPaintCandidate',seenFactsMask:127};
 const d={schema:'native-specificity-capture-failure/v1',stage:'article-retirement',rpc:'Page.setLifecycleEventsEnabled',primary:{family:'public-journey',code:'continuation-rejected'},cleanup:{family:'control-unavailable',code:'origin-representation-unavailable'},journeyWitness:witness,timerWitness:null,infrastructureWitness:null,networkWitness:null,operationWitness:null,ownerNavigationWitness:null,navigationAccountingWitness:null};
 assert.ok(Buffer.byteLength(JSON.stringify(projectSpecificityCaptureDiagnostic(d)))<=700);let hooks=0;const getter={...witness};Object.defineProperty(getter,'site',{get(){hooks++;throw Error();}});
 for(const w of [getter,new Proxy(witness,{getPrototypeOf(){hooks++;throw Error();}}),{...witness,seenFactsMask:128},{...witness,lifecycleName:'private arbitrary'},{...witness,extra:1}])assert.throws(()=>projectSpecificityCaptureDiagnostic({...d,journeyWitness:w}),{code:'diagnostic-contract'});
 assert.throws(()=>projectSpecificityCaptureDiagnostic({...d,primary:{family:'capture',code:'contract'}}),{code:'diagnostic-contract'});assert.equal(hooks,0);
});

test('actual capture callsites attach same-error first witness, owner overlap null, cleanup cannot replace',async()=>{
 for(const site of ['reply','commit','response','lifecycle']){
  const api=await import('./browser-capture.mjs?actual-journey-witness-'+site),f=fixture(),fake=fakeBrowser(f,{journeyFaultSite:site}),close=fake.context.close;fake.context.close=async()=>{await close();throw new Error('private cleanup');};
  try{const original=await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake)));const d=api.captureFailureDiagnostic();assert.equal(d.primary.family,'public-journey');assert.equal(d.primary.code,'blank-loader');assert.ok(d.cleanup);assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});
   if(site==='commit')assert.equal(d.journeyWitness,null);else{assert.equal(d.journeyWitness.site,site);assert.equal(d.journeyWitness.blankLoaderMatch,true);assert.equal(d.journeyWitness.phase,'dispatched');assert.equal(d.journeyWitness.seenFactsMask&2,2);}assert.equal(await thrown(()=>api.assertCaptureHealthy()),original);
  }finally{fake.restore();}
 }
});

test('actual fake browser quarantines pre-fresh initial idle only; after fresh commit stays fatal',async()=>{
 for(const mode of ['before-fresh','after-fresh']){const api=await import('./browser-capture.mjs?initial-idle-'+mode),f=fixture(),fake=fakeBrowser(f,{initialBlankIdle:mode}),rows=[];
  try{if(mode==='before-fresh'){const summary=await api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)}));assert.equal(summary.available,4);assert.equal(rows.length,4);assert.ok(summary.cases.every(c=>c.journey.initialReplay.networkAlmostIdle===1&&Object.values(c.journey.seen).every(Boolean)));assert.equal(api.captureFailureDiagnostic(),null);api.releaseCapturedBatch(summary);}
   else{await assert.rejects(api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)})),{code:'blank-loader'});const d=api.captureFailureDiagnostic();assert.deepEqual(d.journeyWitness,{site:'lifecycle',phase:'dispatched',blankLoaderMatch:true,lifecycleName:'networkAlmostIdle',seenFactsMask:2});assert.equal(rows.length,0);}assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});
  }finally{fake.restore();}
 }
});

test('falsy body first faults survive cleanup faults and both cleanup attempts',async()=>{
 for(const [i,original]of [false,null,undefined,0,''].entries()){
  const api=await import('./browser-capture.mjs?falsy-body-'+i),f=fixture(),fake=fakeBrowser(f),close=fake.context.close;
  fake.context.close=async()=>{await close();throw new Error('private-cleanup-secret');};
  try{assert.equal(await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow(){throw original;}}))),original);
   const d=api.captureFailureDiagnostic();assert.deepEqual(d.primary,{family:'unclassified',code:'unclassified'});assert.ok(d.cleanup);assert.equal(JSON.stringify(d).includes('secret'),false);
   assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});assert.equal(await thrown(()=>api.assertCaptureHealthy()),original);
  }finally{fake.restore();}
 }
});

test('only exact nominal safe own codes project; proxy/getter/subclass/forged codes invoke zero hooks',async()=>{
 for(const kind of ['known','unknown','subclass','getter','proxy','forged','startup','startup-unknown','startup-subclass']){
  const api=await import('./browser-capture.mjs?nominal-'+kind),f=fixture(),fake=fakeBrowser(f);let hooks=0;
  let error=new api.NativeCaptureError('contract');
  if(kind==='unknown')error.code='secret'.repeat(1000);
  if(kind==='subclass'){class Sub extends api.NativeCaptureError{}error=new Sub('contract');}
  if(kind==='getter')Object.defineProperty(error,'code',{get(){hooks++;throw Error('secret');}});
  if(kind==='proxy')error=new Proxy(error,{getPrototypeOf(){hooks++;throw Error('secret');}});
  if(kind==='forged')error=Object.assign(new Error('secret'),{code:'contract'});
  if(kind==='startup')error=new StartupFatal('infrastructure-lifecycle');
  if(kind==='startup-unknown')error=new StartupFatal('secret');
  if(kind==='startup-subclass'){class Sub extends StartupFatal{}error=new Sub('infrastructure-lifecycle');}
  try{assert.equal(await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow(){throw error;}}))),error);
   assert.deepEqual(api.captureFailureDiagnostic().primary,kind==='known'?{family:'capture',code:'contract'}:kind==='startup'?{family:'startup',code:'infrastructure-lifecycle'}:{family:'unclassified',code:'unclassified'});assert.equal(hooks,0);
  }finally{fake.restore();}
 }
});

test('actual driver catch joins finite fake RPC evidence without replacing capture error',async()=>{
 const api=await import('./browser-capture.mjs?driver-failure-join'),f=fixture(),fake=fakeBrowser(f),send=fake.root.send,emissions=[];let original;
 fake.root.send=async(method,args)=>{if(method==='Browser.setDownloadBehavior')throw Error('private path/URL secret');return send(method,args);};
 const boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:value=>emissions.push(value),captureDiagnostic:()=>JSON.stringify(api.projectSpecificityCaptureDiagnostic(api.captureFailureDiagnostic()))});boundary.mark('browser-capture');
 try{const caught=await thrown(()=>boundary.run(async()=>{try{return await api.captureNativeSpecificityBatch(captureArgs(f,fake));}catch(error){original=error;throw error;}}));assert.equal(caught,original);
  assert.equal(emissions.length,1);const bytes=Buffer.isBuffer(emissions[0])?emissions[0].toString('utf8'):String(emissions[0]);assert.ok(Buffer.byteLength(bytes)<=900);assert.equal(bytes.includes('secret'),false);
  const d=api.captureFailureDiagnostic();assert.equal(d.stage,'anchor-setup');assert.equal(d.rpc,'Browser.setDownloadBehavior');assert.deepEqual(d.primary,{family:'capture',code:'client-operation'});assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});
 }finally{fake.restore();}
});

function terminalFixture(options={}){const f=callbackFixture(options);f.s.verifiedLoader='loader';f.s.journey.abort();f.cb.revokeForRetirement();f.s.retiring=true;f.s.closeIssued=true;return f;}
function terminalFrameFixture(options={}){
 const f=callbackFixture(options.coordinatorOptions??{},{},true),page={},main={page:()=>page,isDetached:()=>false};f.s.page=page;f.s.pwChildGraph=createPlaywrightChildFrameGraph(page,main);f.s.verifiedLoader='loader';
 const cb=createPublicArticleCallbacks({state:f.s,coordinator:f.coordinator,owner:{commit(){throw Error('terminal owner commit forbidden');}},guard:options.guard??(()=>{}),clock:()=>0,countEvent:options.countEvent??(()=>{}),onFatal:e=>f.errors.push(e),initialBlankLoaderId:'blank',initialMainFrame:main});
 f.s.journey.abort();cb.revokeForRetirement();f.s.retiring=true;f.s.closeIssued=true;f.cb=cb;f.main=main;f.page=page;f.child=(parent=main)=>({page:()=>page,parentFrame:()=>parent,isDetached:()=>false,url(){throw Error('child URL forbidden');}});return f;
}
const terminalPause=(f,frameId='child',resourceType='Image',suffix='one')=>({requestId:'terminal-fetch-'+suffix,networkId:'terminal-network-'+suffix,frameId,resourceType,request:{url:f.url,method:'GET',headers:{}}});

test('ADR195 causal close matrix preserves captured rows across CDP/PW ordering, stack and cascading removals',async()=>{
 let i=0;for(const pwFirst of [false,true])for(const parentFirst of [false,true])for(const document of [false,true]){
  const api=await import('./browser-capture.mjs?descendant-sequence-'+i++),f=fixture(),fake=fakeBrowser(f,{causalResponse:true,terminalDescendants:{pwFirst,parentFirst,document,stack:i%2===0}}),rows=[];
  try{const summary=await api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)}));assert.equal(summary.available,4);assert.equal(summary.unavailable,0);assert.equal(rows.length,4);assert.ok(rows.every(r=>r.status==='collected'&&r.body==='Invented public subject.\nSecond line.'));assert.ok(summary.cases.every(r=>r.teardownLifecycle===4));const observed=fake.observation();assert.equal(observed.nativeReads,4);assert.equal(observed.retiredCount,4);assert.equal(observed.transport.filter(m=>m==='Fetch.failRequest').length,8);assert.equal(observed.transport.filter(m=>m==='Fetch.continueRequest').length,4);assert.equal(observed.transport.filter(m=>m==='Fetch.continueResponse').length,4);api.releaseCapturedBatch(summary);}finally{fake.restore();}
 }
 const api=await import('./browser-capture.mjs?descendant-deferred-refusal'),f=fixture(),fake=fakeBrowser(f,{status:503,causalResponse:true,terminalDescendants:{pwFirst:true,parentFirst:true,document:true,stack:true},terminalDescendantOrdinal:1}),rows=[];
 try{const summary=await api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)}));assert.equal(summary.unavailable,4);assert.ok(rows.every(r=>r.reason==='article-unavailable'));api.releaseCapturedBatch(summary);}finally{fake.restore();}
});

test('ADR195 terminal attachment copies one complete bounded envelope and drops optional stack without hooks',()=>{
 const f=terminalFrameFixture(),before=f.cb.retainedTerminalBytes(),input={frameId:'child',parentFrameId:'frame',stack:{callFrames:[]}};f.cb.frameAttached(input);input.parentFrameId='mutated';input.stack.callFrames.push({});assert.deepEqual(f.s.childFrames.get('child'),{parentId:'frame',status:'live'});assert.equal(f.s.refusal,null);assert.equal(f.cb.retainedTerminalBytes(),before+64);assert.equal(f.sent.length,0);f.coordinator.dispose();
 let hooks=0;const getter={frameId:'child',parentFrameId:'frame'};Object.defineProperty(getter,'stack',{enumerable:true,get(){hooks++;throw Error();}});const nested={};Object.defineProperty(nested,'callFrames',{enumerable:true,get(){hooks++;throw Error();}});const proxy=new Proxy({callFrames:[]},{getPrototypeOf(){hooks++;throw Error();}});
 for(const input of [getter,{frameId:'child',parentFrameId:'frame',stack:nested},{frameId:'child',parentFrameId:'frame',stack:proxy},{frameId:'child',parentFrameId:'frame',extra:1},{frameId:'child',parentFrameId:'frame',stack:{value:'x'.repeat(32768)}}]){const g=terminalFrameFixture();g.cb.frameAttached(input);assert.equal(g.errors[0].code,'terminal-frame-contract');assert.equal(g.s.childFrames.size,0);assert.equal(g.sent.length,0);g.coordinator.dispose();}assert.equal(hooks,0);
});

test('ADR195 fresh terminal descendants require private revocation and exact rooted live ancestry',async()=>{
 const missing=callbackFixture();missing.s.retiring=true;missing.s.closeIssued=true;missing.cb.frameAttached({frameId:'child',parentFrameId:'frame'});assert.equal(missing.errors[0].code,'terminal-frame-state');assert.equal(missing.s.childFrames.size,0);missing.coordinator.dispose();
 for(const kind of ['unknown-parent','self','main','duplicate','removed-reuse','parent-removed']){const f=terminalFrameFixture();let input={frameId:'child',parentFrameId:'frame'};
  if(kind==='unknown-parent')input.parentFrameId='unknown';if(kind==='self')input.parentFrameId='child';if(kind==='main')input.frameId='frame';
  if(['duplicate','removed-reuse','parent-removed'].includes(kind)){f.cb.frameAttached(input);if(kind!=='duplicate')f.cb.frameDetached({frameId:'child',reason:'remove'});if(kind==='parent-removed')input={frameId:'nested',parentFrameId:'child'};}
  f.cb.frameAttached(input);assert.ok(f.errors.length);assert.equal(f.sent.length,0);f.coordinator.dispose();
 }
 for(const kind of ['navigate','detach','pw','Image','Document']){const f=callbackFixture();f.s.childFrames.set('child',{parentId:'frame',status:'live'});f.s.refusal='restricted-rendering';f.s.retiring=true;f.s.closeIssued=true;
  if(kind==='navigate')f.cb.frameNavigated(typedNavigation({id:'child',parentId:'frame',loaderId:'loader',url:f.url}));else if(kind==='detach')f.cb.frameDetached({frameId:'child',reason:'remove'});else if(kind==='pw')assert.throws(()=>f.cb.terminalPlaywrightNavigation({}),{code:'terminal-frame-state'});else f.cb.paused(terminalPause(f,'child',kind));assert.ok(kind==='pw'||f.errors.length);assert.equal(f.sent.length,0);f.coordinator.dispose();
 }
 for(const activity of ['attach','navigate','lifecycle','Image','Document']){const f=terminalFrameFixture();f.cb.frameAttached({frameId:'child',parentFrameId:'frame'});f.cb.frameAttached({frameId:'nested',parentFrameId:'child'});f.cb.frameDetached({frameId:'child',reason:'remove'});
  if(activity==='attach')f.cb.frameAttached({frameId:'fresh',parentFrameId:'nested'});else if(activity==='navigate')f.cb.frameNavigated(typedNavigation({id:'nested',parentId:'child',loaderId:'loader',url:f.url}));else if(activity==='lifecycle')f.cb.lifecycle(terminalEvent({frameId:'nested'}));else f.cb.paused(terminalPause(f,'nested',activity));
  await f.cb.drain().catch(()=>{});assert.ok(f.errors.length);assert.equal(f.sent.length,0);f.coordinator.dispose();
 }
});

test('ADR195 pending child original remains physically owned after main removal and timeout',async()=>{
 const timers=[],f=terminalFrameFixture({coordinatorOptions:{schedule:fn=>{timers.push(fn);return timers.length;},cancel(){}}});let reject;f.s.session.send=()=>new Promise((_,no)=>{reject=no;});
 f.cb.frameAttached({frameId:'child',parentFrameId:'frame'});f.cb.paused(terminalPause(f,'child','Document'));f.cb.frameDetached({frameId:'frame',reason:'remove'});f.cb.frameDetached({frameId:'child',reason:'remove'});f.cb.loadingFailed({requestId:'terminal-network-one',canceled:true,errorText:'net::ERR_ABORTED'});assert.equal(f.errors.length,0);assert.equal(f.s.retirementDenials.get('terminal-network-one').fulfilled,false);assert.equal(f.coordinator.snapshot().physical,1);assert.throws(()=>f.cb.assertRetirementDenials());
 timers.at(-1)();await Promise.resolve();assert.equal(f.coordinator.snapshot().physical,1);reject(Error('invented unresolved child denial'));await f.cb.drain().catch(()=>{});assert.ok(f.errors.length);assert.equal(f.s.retirementDenials.get('terminal-network-one').fulfilled,false);f.coordinator.dispose();
});

test('ADR195 child Image/Document reservations settle originals after removal but fresh reservations cannot rejoin',async()=>{
 for(const resourceType of ['Image','Document']){const f=terminalFrameFixture();let resolve;f.s.session.send=(method,args)=>{f.sent.push({method,args});return new Promise(yes=>{resolve=yes;});};f.cb.frameAttached({frameId:'child',parentFrameId:'frame'});f.cb.frameAttached({frameId:'nested',parentFrameId:'child'});f.cb.paused(terminalPause(f,'nested',resourceType));assert.equal(f.s.retirementDenials.size,1);assert.equal(f.s.retirementDenials.get('terminal-network-one').fulfilled,false);
  f.cb.frameDetached({frameId:'child',reason:'remove'});f.cb.frameDetached({frameId:'nested',reason:'remove'});f.cb.loadingFailed({requestId:'terminal-network-one',errorText:'net::ERR_BLOCKED_BY_CLIENT.Inspector'});assert.equal(f.errors.length,0);assert.equal(f.coordinator.snapshot().physical,1);resolve();await f.cb.drain();f.cb.assertRetirementDenials();assert.equal(f.s.retirementDenials.get('terminal-network-one').fulfilled,true);assert.equal(f.sent.length,1);assert.equal(f.sent[0].method,'Fetch.failRequest');assert.equal(f.s.refusal,null);f.coordinator.dispose();
 }
 for(const [frameId,resourceType]of [['frame','Document'],['unknown','Document']]){const f=terminalFrameFixture();f.cb.paused(terminalPause(f,frameId,resourceType));await f.cb.drain().catch(()=>{});assert.ok(f.errors.length);assert.equal(f.sent.length,0);f.coordinator.dispose();}
});

test('ADR195 terminal typed child commits stay separate; main, changed parent and swaps remain fatal',()=>{
 const f=terminalFrameFixture();f.cb.frameAttached({frameId:'child',parentFrameId:'frame'});const before=f.s.journey.snapshot();f.cb.frameNavigated(typedNavigation({id:'child',parentId:'frame',loaderId:'child-loader',url:f.url}));assert.equal(f.errors.length,0);assert.deepEqual(f.s.journey.snapshot(),before);assert.equal(f.s.refusal,null);f.coordinator.dispose();
 for(const kind of ['main','unknown','changed-parent','swap']){const g=terminalFrameFixture();g.cb.frameAttached({frameId:'child',parentFrameId:'frame'});if(kind==='swap')g.cb.frameDetached({frameId:'child',reason:'swap'});else g.cb.frameNavigated(typedNavigation({id:kind==='main'?'frame':kind==='unknown'?'unknown':'child',...(kind==='main'?{}:{parentId:kind==='changed-parent'?'unknown':'frame'}),loaderId:'child-loader',url:g.url}));assert.ok(g.errors.length);assert.equal(g.sent.length,0);g.coordinator.dispose();}
});

test('ADR195 terminal Playwright uses independent live capability ancestry and never reads any URL',()=>{
 const f=terminalFrameFixture(),child=f.child(),nested=f.child(child);const before=f.s.journey.snapshot();f.cb.terminalPlaywrightNavigation(nested);assert.deepEqual(f.s.journey.snapshot(),before);assert.equal(f.s.pwChildGraph.retainedBytes(),64+2*160);assert.equal(f.s.childFrames.size,0);assert.equal(f.s.refusal,null);f.coordinator.dispose();
 for(const kind of ['main','detached-child','detached-parent','detached-main','removed-main','null-parent','cross-page','changed-parent','proxy','getter']){const g=terminalFrameFixture();let parent=g.child(),frame=g.child(parent),hooks=0;
  if(kind==='main')frame=g.main;if(kind==='detached-child')frame.isDetached=()=>true;if(kind==='detached-parent')parent.isDetached=()=>true;if(kind==='detached-main')g.main.isDetached=()=>true;if(kind==='removed-main')g.s.mainDetached=true;if(kind==='null-parent')frame.parentFrame=()=>null;if(kind==='cross-page')frame.page=()=>({});
  if(kind==='changed-parent'){g.cb.terminalPlaywrightNavigation(frame);frame.parentFrame=()=>g.main;}if(kind==='proxy')frame=new Proxy(frame,{getPrototypeOf(){hooks++;throw Error();}});if(kind==='getter')Object.defineProperty(frame,'isDetached',{get(){hooks++;throw Error();}});
  assert.throws(()=>g.cb.terminalPlaywrightNavigation(frame));assert.equal(hooks,0);assert.equal(g.sent.length,0);g.coordinator.dispose();
 }
});

test('ADR195 terminal descendant count/byte/event and independent PW caps cannot release more work',()=>{
 const f=terminalFrameFixture();for(let n=0;n<16;n++){f.cb.frameAttached({frameId:'child-'+n,parentFrameId:'frame'});f.cb.frameDetached({frameId:'child-'+n,reason:'remove'});}assert.equal(f.s.childFrames.size,16);f.cb.frameAttached({frameId:'overflow',parentFrameId:'frame'});assert.equal(f.errors[0].code,'child-frame-capacity');assert.equal(f.sent.length,0);f.coordinator.dispose();
 let events=0;const e=terminalFrameFixture({countEvent(){if(++events>1)throw Error('invented event limit');}});e.cb.frameAttached({frameId:'one',parentFrameId:'frame'});e.cb.frameAttached({frameId:'two',parentFrameId:'one'});assert.equal(e.s.childFrames.size,1);assert.ok(e.errors.length);assert.equal(e.sent.length,0);e.coordinator.dispose();
 let observed;const bytes=terminalFrameFixture({guard(){if(observed&&31808+observed.retainedTerminalBytes()>32768)throw Error('invented aggregate cap');}});observed=bytes.cb;bytes.cb.frameAttached({frameId:'child',parentFrameId:'frame'});assert.equal(bytes.s.childFrames.size,1);assert.ok(bytes.errors.length);assert.equal(bytes.sent.length,0);bytes.coordinator.dispose();
 const p=terminalFrameFixture();for(let n=0;n<16;n++)p.cb.terminalPlaywrightNavigation(p.child());assert.throws(()=>p.cb.terminalPlaywrightNavigation(p.child()),{code:'pw-child-capacity'});assert.equal(p.sent.length,0);p.coordinator.dispose();
});

test('ADR195 new targets and rejected child-denial originals despite destruction prevent normal completion',async()=>{
 for(const kind of ['new-target','rejected']){const api=await import('./browser-capture.mjs?descendant-fatal-'+kind),f=fixture(),fake=fakeBrowser(f,{terminalDescendants:{pwFirst:true,parentFirst:true,document:true,stack:true},terminalNewTarget:kind==='new-target',retirementDestroyFirst:kind==='rejected',retirementOriginalFactory:kind==='rejected'?()=>Promise.reject(Error('invented rejected descendant denial')):null});try{await assert.rejects(api.captureNativeSpecificityBatch(captureArgs(f,fake)));assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});}finally{fake.restore();}}
});

const terminalEvent=(patch={})=>({frameId:'frame',loaderId:'loader',name:'DOMContentLoaded',timestamp:1,...patch});

test('ADR194 joined close accepts verified/initial-blank DCL and known-live-child lifecycle after private revocation',async()=>{
 for(const [i,mode]of ['main-verified','main-blank','known-child'].entries()){
  const api=await import('./browser-capture.mjs?terminal-positive-'+i),f=fixture(),fake=fakeBrowser(f,{causalResponse:true,terminalLifecycle:mode,childMode:mode==='known-child'?'silent':null,childLifecycle:mode==='known-child',retirementErrorText:'net::ERR_BLOCKED_BY_CLIENT.Inspector'}),rows=[];
  try{const summary=await api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)}));assert.equal(rows.length,4);assert.ok(summary.cases.every(r=>r.teardownLifecycle===1));assert.equal(summary.available,mode==='known-child'?0:4);assert.equal(summary.unavailable,mode==='known-child'?4:0);assert.equal(fake.observation().retiredCount,4);assert.equal(fake.observation().transport.filter(x=>x==='Fetch.failRequest').length,4);api.releaseCapturedBatch(summary);}finally{fake.restore();}
 }
});

test('ADR194 genuine retire plus gate-close privately latch proof; booleans/failed revocation/session swaps cannot grant it',()=>{
 const missing=callbackFixture();missing.s.retiring=true;missing.s.closeIssued=true;missing.s.readsRevoked=true;missing.s.verifiedLoader='loader';missing.cb.lifecycle(terminalEvent());assert.equal(missing.errors[0].code,'terminal-lifecycle-state');missing.coordinator.dispose();
 const failedJourney=callbackFixture();assert.throws(()=>failedJourney.cb.revokeForRetirement(),{code:'missing-facts'});assert.equal(describeNativeArticleNetworkGate(failedJourney.s.gate).closed,false);failedJourney.s.retiring=true;failedJourney.s.closeIssued=true;failedJourney.cb.lifecycle(terminalEvent());assert.equal(failedJourney.errors[0].code,'terminal-lifecycle-state');failedJourney.coordinator.dispose();
 const failedGate=callbackFixture();failedGate.s.journey.abort();failedGate.s.gate={};assert.throws(()=>failedGate.cb.revokeForRetirement());failedGate.s.retiring=true;failedGate.s.closeIssued=true;failedGate.cb.lifecycle(terminalEvent());assert.equal(failedGate.errors[0].code,'terminal-lifecycle-state');failedGate.coordinator.dispose();
 for(const kind of ['session','token','page','close-not-issued']){const f=terminalFixture();if(kind==='session')f.s.session={send(){throw Error('must never dispatch');}};if(kind==='token')f.s.token={};if(kind==='page')f.s.page={};if(kind==='close-not-issued')f.s.closeIssued=false;f.cb.lifecycle(terminalEvent());assert.equal(f.errors[0].code,'terminal-lifecycle-state');f.coordinator.dispose();}
});

test('ADR194 terminal lifecycle contributes no facts/work and normal release clears captured blank/proof',()=>{
 const f=terminalFixture(),before=f.s.journey.snapshot(),calls=f.sent.length;assert.equal(describeNativeArticleNetworkGate(f.s.gate).closed,true);
 const charged=f.cb.retainedTerminalBytes();assert.equal(charged,384+512+5+8);
 for(const loaderId of ['blank','loader'])for(const name of ['DOMContentLoaded','networkIdle','init'])f.cb.lifecycle(terminalEvent({loaderId,name}));
 assert.equal(f.errors.length,0);assert.equal(f.s.teardownLifecycle,6);assert.deepEqual(f.s.journey.snapshot(),before);assert.equal(f.sent.length,calls);f.coordinator.assertDrained();
 f.s.retired=true;f.cb.releaseRetired();assert.equal(f.cb.retainedTerminalBytes(),384+8);f.cb.lifecycle(terminalEvent({loaderId:'blank'}));assert.equal(f.errors[0].code,'late-article-callback');f.coordinator.dispose();
});

test('ADR194 accepted terminal lifecycle cannot settle an original denial or release its physical slot',async()=>{
 const timers=[],f=terminalFixture({schedule:fn=>{timers.push(fn);return timers.length;},cancel(){}});let reject;f.s.mainNetworkId='net';f.s.session.send=()=>new Promise((_,no)=>{reject=no;});
 f.cb.paused({requestId:'terminal-pending-fetch',networkId:'terminal-pending-network',frameId:'frame',resourceType:'Image',request:{url:f.url,method:'GET',headers:{}}});f.cb.lifecycle(terminalEvent({loaderId:'blank'}));
 assert.equal(f.errors.length,0);assert.equal(f.s.teardownLifecycle,1);assert.equal(f.s.retirementDenials.get('terminal-pending-network').fulfilled,false);assert.equal(f.coordinator.snapshot().physical,1);assert.throws(()=>f.cb.assertRetirementDenials(),{code:'retirement-denial-unsettled'});
 timers.at(-1)();await Promise.resolve();assert.equal(f.coordinator.snapshot().physical,1);reject(Error('invented denied native original'));await f.cb.drain().catch(()=>{});assert.ok(f.errors.length);assert.equal(f.s.retirementDenials.get('terminal-pending-network').fulfilled,false);f.coordinator.dispose();
});

test('ADR194 terminal malformed/name/time/loader/frame cases have closed finite codes and zero hooks',()=>{
 const inputs=[['terminal-lifecycle-loader',terminalEvent({loaderId:'unknown'})],['terminal-lifecycle-loader',terminalEvent({loaderId:''})],['terminal-lifecycle-frame',terminalEvent({frameId:'unknown'})],['terminal-lifecycle-name',terminalEvent({name:'commit'})],['terminal-lifecycle-name',terminalEvent({name:'unknown'})],
  ...[-0,-1,Infinity,NaN,'1'].map(timestamp=>['terminal-lifecycle-timestamp',terminalEvent({timestamp})]),['terminal-lifecycle-descriptor',{...terminalEvent(),extra:1}],['terminal-lifecycle-descriptor',{frameId:'frame',loaderId:'loader',name:'DOMContentLoaded'}]];
 for(const [code,input]of inputs){const f=terminalFixture();f.cb.lifecycle(input);assert.equal(f.errors[0].code,code);assert.equal(f.s.teardownLifecycle,undefined);assert.equal(f.sent.length,0);f.coordinator.dispose();}
 let hooks=0;const getter=terminalEvent();Object.defineProperty(getter,'name',{enumerable:true,get(){hooks++;throw Error();}});const hidden=terminalEvent();Object.defineProperty(hidden,'timestamp',{value:1,enumerable:false});const proxy=new Proxy(terminalEvent(),{getPrototypeOf(){hooks++;throw Error();},ownKeys(){hooks++;throw Error();}});
 for(const value of [getter,hidden,proxy]){const f=terminalFixture();f.cb.lifecycle(value);assert.equal(f.errors[0].code,'terminal-lifecycle-descriptor');assert.equal(f.sent.length,0);f.coordinator.dispose();}assert.equal(hooks,0);
});

test('ADR194 terminal child still requires live registration/refusal; detached main and old callbacks stay fatal',async()=>{
 const ok=terminalFixture();ok.s.childFrames.set('child',{parentId:'frame',status:'live'});ok.s.refusal='restricted-rendering';ok.cb.lifecycle(terminalEvent({frameId:'child',loaderId:'bounded-child-loader'}));assert.equal(ok.errors.length,0);assert.equal(ok.s.teardownLifecycle,1);ok.coordinator.dispose();
 for(const kind of ['unknown','removed','no-refusal','main-detached']){const f=terminalFixture();if(kind!=='unknown')f.s.childFrames.set('child',{parentId:'frame',status:kind==='removed'?'removed':'live'});if(kind!=='no-refusal')f.s.refusal='restricted-rendering';if(kind==='main-detached')f.s.mainDetached=true;f.cb.lifecycle(terminalEvent({frameId:kind==='main-detached'?'frame':'child'}));assert.equal(f.errors[0].code,'terminal-lifecycle-frame');f.coordinator.dispose();}
 for(const [i,mode]of ['unknown-loader','unknown-child','removed-child','detached-main'].entries()){const api=await import('./browser-capture.mjs?terminal-negative-'+i),f=fixture(),fake=fakeBrowser(f,{terminalLifecycle:mode,childMode:mode==='removed-child'?'removed':null});try{await assert.rejects(api.captureNativeSpecificityBatch(captureArgs(f,fake)),{code:mode==='unknown-loader'?'terminal-lifecycle-loader':'terminal-lifecycle-frame'});}finally{fake.restore();}}
 const api=await import('./browser-capture.mjs?terminal-old-article'),f=fixture(),fake=fakeBrowser(f,{terminalLifecycle:'main-blank',lateOldLifecycle:true});try{await assert.rejects(api.captureNativeSpecificityBatch(captureArgs(f,fake)),{code:'late-article-callback'});}finally{fake.restore();}
});

function retirementFixture(options={}){const f=terminalFixture(options);f.s.mainNetworkId='net';
 f.late=(suffix='one')=>({requestId:'late-fetch-'+suffix,networkId:'late-network-'+suffix,frameId:'frame',resourceType:'Image',request:{url:f.url,method:'GET',headers:{}}});return f;}

test('ADR193 page.close waits for ORIGINAL retirement denial before destruction and full normal drain',async()=>{
 for(const [i,errorText]of ['net::ERR_BLOCKED_BY_CLIENT','net::ERR_BLOCKED_BY_CLIENT.Inspector'].entries()){
  const api=await import('./browser-capture.mjs?retirement-positive-'+i),f=fixture(),fake=fakeBrowser(f,{causalResponse:true,retirementErrorText:errorText}),rows=[];
  try{const summary=await api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)}));assert.equal(summary.available,4);assert.equal(rows.length,4);assert.equal(fake.observation().retiredCount,4);assert.equal(fake.observation().transport.filter(x=>x==='Fetch.failRequest').length,4);api.releaseCapturedBatch(summary);}finally{fake.restore();}
 }
});

test('ADR193 LoadingFailed and destruction cannot substitute for original fulfillment or rescue rejection',async()=>{
 const timers=[],f=retirementFixture({schedule:fn=>{timers.push(fn);return timers.length;},cancel(){}});let resolve;
 const original=new Promise(yes=>{resolve=yes;});f.s.session.send=(method,args)=>{f.sent.push({method,args});f.cb.loadingFailed({requestId:'late-network-one',errorText:'net::ERR_BLOCKED_BY_CLIENT.Inspector'});return original;};
 f.cb.paused(f.late());const row=f.s.retirementDenials.get('late-network-one');assert.equal(row.fulfilled,false);assert.throws(()=>f.cb.assertRetirementDenials(),{code:'retirement-denial-unsettled'});assert.equal(f.coordinator.snapshot().physical,1);
 resolve();await f.cb.drain();assert.equal(row.fulfilled,true);f.cb.assertRetirementDenials();f.coordinator.assertDrained();f.s.retired=true;f.cb.releaseRetired();assert.equal(f.s.retirementDenials.size,0);f.coordinator.dispose();
 for(const timeout of [false,true]){const ts=[],g=retirementFixture({schedule:fn=>{ts.push(fn);return ts.length;},cancel(){}});let reject;g.s.session.send=()=>new Promise((_,no)=>{reject=no;});g.cb.paused(g.late());g.s.targetDestroyed=true;g.cb.loadingFailed({requestId:'late-network-one',canceled:true,errorText:'net::ERR_ABORTED'});assert.equal(g.errors.length,0);assert.equal(g.s.retirementDenials.get('late-network-one').fulfilled,false);if(timeout){ts.at(-1)();await Promise.resolve();assert.equal(g.coordinator.snapshot().physical,1);}reject(Error('invented native denial rejection'));await g.cb.drain().catch(()=>{});assert.ok(g.errors.length);assert.equal(g.s.retirementDenials.get('late-network-one').fulfilled,false);assert.throws(()=>g.cb.assertRetirementDenials());g.coordinator.dispose();}
 const api=await import('./browser-capture.mjs?retirement-reject-destroy'),g=fixture(),fake=fakeBrowser(g,{retirementErrorText:'net::ERR_BLOCKED_BY_CLIENT',retirementDestroyFirst:true,retirementOriginalFactory:()=>Promise.reject(Error('invented rejection'))});
 try{await assert.rejects(api.captureNativeSpecificityBatch(captureArgs(g,fake)));assert.equal(fake.observation().retiredCount,1);assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});}finally{fake.restore();}
});

test('ADR193 retirement denies known live child only, rejects stage/frame/type/identity and hostile metadata',async()=>{
 const g=retirementFixture();g.s.childFrames.set('child',{parentId:'frame',status:'live'});g.s.refusal='restricted-rendering';g.cb.paused({...g.late(),frameId:'child'});await g.cb.drain();assert.equal(g.errors.length,0);g.cb.assertRetirementDenials();assert.deepEqual(Object.keys(g.s.retirementDenials.get('late-network-one')).sort(),['fetchId','frameId','fulfilled']);g.coordinator.dispose();
 const patches=[{frameId:'unknown'},{resourceType:'Document'},{resourceType:'Unknown'},{networkId:'net'},{responseStatusCode:200},{responseErrorReason:'Failed'},{redirectedRequestId:'old'},
  {request:{url:'file:///private',method:'GET',headers:{}}},{request:{url:'https://user:secret@example.org/',method:'GET',headers:{}}},{request:{url:'https://example.org/',method:'bad method',headers:{}}}];
 for(const patch of patches){const f=retirementFixture();f.cb.paused({...f.late(),...patch});await f.cb.drain().catch(()=>{});assert.ok(f.errors.length);assert.equal(f.sent.length,0);f.coordinator.dispose();}
 for(const state of ['before-close','removed-child','child-no-refusal','retired']){const f=retirementFixture();let pause=f.late();if(state==='before-close')f.s.closeIssued=false;if(state==='retired')f.s.retired=true;if(state.includes('child')){f.s.childFrames.set('child',{parentId:'frame',status:state==='removed-child'?'removed':'live'});pause.frameId='child';}f.cb.paused(pause);await f.cb.drain().catch(()=>{});assert.ok(f.errors.length);assert.equal(f.sent.length,0);f.coordinator.dispose();}
 let hooks=0;for(const type of ['outer-proxy','request-proxy','method-getter','headers-getter']){const f=retirementFixture();let p=f.late();if(type==='outer-proxy')p=new Proxy(p,{getPrototypeOf(){hooks++;throw Error();}});if(type==='request-proxy')p.request=new Proxy(p.request,{getPrototypeOf(){hooks++;throw Error();}});if(type==='method-getter')Object.defineProperty(p.request,'method',{enumerable:true,get(){hooks++;throw Error();}});if(type==='headers-getter')Object.defineProperty(p.request,'headers',{enumerable:true,get(){hooks++;throw Error();}});f.cb.paused(p);assert.ok(f.errors.length);assert.equal(f.sent.length,0);f.coordinator.dispose();}assert.equal(hooks,0);
});

test('ADR193 ledger reserves before reentry, remains disjoint and refuses contradictory resource events',async()=>{
 for(const kind of ['response','dataReceived','loadingFinished','wrong-failure','network-duplicate','fetch-duplicate']){const f=retirementFixture();f.cb.paused(f.late());
  if(kind==='wrong-failure')f.cb.loadingFailed({requestId:'late-network-one',errorText:'net::ERR_FAILED'});
  else if(kind==='network-duplicate')f.cb.paused({...f.late('two'),networkId:'late-network-one'});
  else if(kind==='fetch-duplicate')f.cb.paused({...f.late('two'),requestId:'late-fetch-one'});
  else f.cb[kind]({requestId:'late-network-one',encodedDataLength:0,timestamp:1});
  await f.cb.drain().catch(()=>{});assert.ok(f.errors.length);assert.equal(f.sent.length,1);f.coordinator.dispose();}
 const f=retirementFixture();let reentered=false;f.s.session.send=(method,args)=>{f.sent.push({method,args});assert.equal(f.s.retirementDenials.size,1);assert.equal(f.s.retirementDenials.get('late-network-one').fulfilled,false);if(!reentered){reentered=true;f.cb.paused({...f.late('two'),networkId:'late-network-one'});}return Promise.resolve();};f.cb.paused(f.late());await f.cb.drain().catch(()=>{});assert.equal(f.errors[0].code,'retirement-denial-identity');assert.equal(f.sent.length,1);f.coordinator.dispose();
 const active=retirementFixture();active.s.retiring=false;active.s.closeIssued=false;active.cb.loadingFailed({requestId:'late-network-one',errorText:'net::ERR_BLOCKED_BY_CLIENT'});assert.equal(active.errors[0].code,'unknown-network-failure');active.coordinator.dispose();
});

test('ADR193 32-record and aggregate byte checks run before another native dispatch',async()=>{
 const f=retirementFixture();for(let n=0;n<32;n++)f.cb.paused(f.late(String(n)));await f.cb.drain();assert.equal(f.s.retirementDenials.size,32);assert.equal(f.sent.length,32);f.cb.paused(f.late('overflow'));assert.equal(f.errors[0].code,'retirement-denial-capacity');assert.equal(f.sent.length,32);f.coordinator.dispose();
 const g=callbackFixture({},{},true);const cb=createPublicArticleCallbacks({state:g.s,coordinator:g.coordinator,owner:{commit(){}},guard(){let bytes=32600+128;for(const [networkId,row]of g.s.retirementDenials)bytes+=192+networkId.length+row.fetchId.length+row.frameId.length+8;if(bytes>32768)throw Error('invented aggregate registry capacity');},clock:()=>0,countEvent(){},onFatal:e=>g.errors.push(e)});g.s.journey.abort();cb.revokeForRetirement();g.s.retiring=true;g.s.closeIssued=true;g.s.mainNetworkId='net';cb.paused({requestId:'late-fetch-one',networkId:'late-network-one',frameId:'frame',resourceType:'Image',request:{url:g.url,method:'GET',headers:{}}});assert.equal(g.s.retirementDenials.size,1);assert.equal(g.sent.length,0);assert.ok(g.errors.length);g.coordinator.dispose();
});

test('ADR193 unsafe native originals have no hook access and old article cannot acquire a new ledger',async()=>{
 let hooks=0;for(const kind of ['then-getter','constructor-getter','proxy','plain']){const timers=[],f=retirementFixture({schedule:fn=>{timers.push(fn);return timers.length;},cancel(){}});let original=Promise.resolve();if(kind==='then-getter'||kind==='constructor-getter')Object.defineProperty(original,kind==='then-getter'?'then':'constructor',{get(){hooks++;throw Error();}});if(kind==='proxy')original=new Proxy(original,{getPrototypeOf(){hooks++;throw Error();}});if(kind==='plain')original={};f.s.session.send=()=>original;f.cb.paused(f.late());assert.equal(f.errors[0].code,'retirement-denial-original');await Promise.resolve();assert.equal(f.coordinator.snapshot().physical,1);assert.throws(()=>f.coordinator.assertDrained(),{code:'unsettled-operations'});timers.at(-1)();await f.cb.drain().catch(()=>{});assert.equal(f.coordinator.snapshot().physical,1);assert.equal(f.s.retirementDenials.get('late-network-one').fulfilled,false);f.coordinator.dispose();}
 for(const rejected of [false,true]){const timers=[],f=retirementFixture({schedule:fn=>{timers.push(fn);return timers.length;},cancel(){}});let yes,no;const original=new Promise((resolve,reject)=>{yes=resolve;no=reject;});Promise.prototype.then.call(original,()=>{},()=>{});Object.defineProperty(original,'constructor',{get(){hooks++;throw Error();}});f.s.session.send=()=>original;f.cb.paused(f.late());if(rejected)no(Error('invented late unsafe rejection'));else yes();await Promise.resolve();await Promise.resolve();assert.equal(f.errors[0].code,'retirement-denial-original');assert.equal(f.coordinator.snapshot().physical,1);assert.equal(f.s.retirementDenials.get('late-network-one').fulfilled,false);assert.throws(()=>f.cb.assertRetirementDenials());timers.at(-1)();await f.cb.drain().catch(()=>{});assert.throws(()=>f.coordinator.assertDrained());f.coordinator.dispose();}assert.equal(hooks,0);
 const api=await import('./browser-capture.mjs?retirement-old-article'),f=fixture(),fake=fakeBrowser(f,{retirementErrorText:'net::ERR_BLOCKED_BY_CLIENT.Inspector',lateOldRetirement:true});try{await assert.rejects(api.captureNativeSpecificityBatch(captureArgs(f,fake)),{code:'late-article-callback'});}finally{fake.restore();}
});

test('ADR193 retirement-only headers use exact token and wellformed HTAB/C1 grammar under original caps',async()=>{
 const malformed=[{'':'x'},{'bad name':'x'},{':bad':'x'},{'x':'\u0000'},{'x':'\u000b'},{'x':'\r\n'},{'x':'\ud800'},{['x'.repeat(257)]:'v'},{x:'v'.repeat(8193)},Object.fromEntries(Array.from({length:65},(_,i)=>['x-'+i,'v'])),{a:'v'.repeat(8192),b:'v'.repeat(8192)}];
 for(const headers of malformed){const f=retirementFixture();f.cb.paused({...f.late(),request:{url:f.url,method:'GET',headers}});assert.equal(f.errors[0].code,'retirement-denial-metadata');assert.equal(f.sent.length,0);assert.equal(f.s.retirementDenials.size,0);f.coordinator.dispose();}
 let hooks=0;const getter={};Object.defineProperty(getter,'x',{enumerable:true,get(){hooks++;throw Error();}});const proxy=new Proxy({x:'v'},{getPrototypeOf(){hooks++;throw Error();}});for(const headers of [getter,proxy]){const f=retirementFixture();f.cb.paused({...f.late(),request:{url:f.url,method:'GET',headers}});assert.ok(f.errors.length);assert.equal(f.sent.length,0);f.coordinator.dispose();}assert.equal(hooks,0);
 const f=retirementFixture();f.cb.paused({...f.late(),request:{url:f.url,method:'GET',headers:{'x-test':'\tvalid\u0080'}}});await f.cb.drain();assert.equal(f.errors.length,0);f.cb.assertRetirementDenials();f.coordinator.dispose();
});

test('ADR192 causal denied secondary resource accepts both exact native spellings and drains',async()=>{
 for(const [i,errorText]of ['net::ERR_BLOCKED_BY_CLIENT','net::ERR_BLOCKED_BY_CLIENT.Inspector'].entries()){
  const api=await import('./browser-capture.mjs?owned-denial-'+i),f=fixture(),fake=fakeBrowser(f,{causalResponse:true,deniedResourceErrorText:errorText}),rows=[];
  try{const summary=await api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)}));assert.equal(summary.available,4);assert.equal(rows.length,4);assert.ok(fake.observation().transport.includes('Fetch.failRequest'));api.releaseCapturedBatch(summary);assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});}finally{fake.restore();}
 }
});

test('ADR192 blocked spelling never rescues unknown/main IDs, suffixes, errors or unsafe reason fields',async()=>{
 const deny=f=>({...f.request('denied-fetch'),networkId:'denied-net',resourceType:'Image',request:{url:f.url,method:'POST',headers:{}}});
 for(const errorText of ['net::ERR_BLOCKED_BY_CLIENT.Inspector.extra','net::ERR_BLOCKED_BY_CLIENT.CSP','net::ERR_FAILED','ERR_BLOCKED_BY_CLIENT','net::ERR_BLOCKED_BY_CLIENT\n']){
  const f=callbackFixture();f.cb.paused(deny(f));f.cb.loadingFailed({requestId:'denied-net',errorText,blockedReason:'inspector'});await f.cb.drain().catch(()=>{});assert.equal(f.errors[0].code,'blocked-failure-contradiction');f.coordinator.dispose();
 }
 for(const requestId of ['net','unknown']){const f=callbackFixture();f.cb.paused(f.request());f.cb.loadingFailed({requestId,errorText:'net::ERR_BLOCKED_BY_CLIENT.Inspector'});await f.cb.drain().catch(()=>{});assert.ok(f.errors.length);assert.throws(()=>f.s.journey.assertComplete(f.token));f.coordinator.dispose();}
 const reused=callbackFixture();reused.cb.paused(reused.request());reused.cb.paused({...deny(reused),networkId:'net'});await reused.cb.drain().catch(()=>{});assert.equal(reused.errors[0].code,'admitted-main-id-reuse');reused.coordinator.dispose();
 let hooks=0;const f=callbackFixture(),value={requestId:'denied-net',errorText:'net::ERR_BLOCKED_BY_CLIENT.Inspector'};Object.defineProperty(value,'blockedReason',{enumerable:true,get(){hooks++;throw Error();}});f.cb.paused(deny(f));f.cb.loadingFailed(value);await f.cb.drain().catch(()=>{});assert.equal(hooks,0);assert.ok(f.errors.length);f.coordinator.dispose();
});

test('ADR192 accepted blocked callback cannot release a failed or nonsettling original rejection',async()=>{
 for(const timed of [false,true]){const timers=[],f=callbackFixture({schedule:fn=>{timers.push(fn);return timers.length;},cancel(){}});let reject;
  f.s.session.send=()=>new Promise((_,no)=>{reject=no;});f.cb.paused({...f.request('denied-fetch'),networkId:'denied-net',resourceType:'Image',request:{url:f.url,method:'POST',headers:{}}});
  f.cb.loadingFailed({requestId:'denied-net',errorText:'net::ERR_BLOCKED_BY_CLIENT.Inspector'});assert.equal(f.errors.length,0);assert.equal(f.cb.pending(),1);assert.equal(f.coordinator.snapshot().physical,1);assert.throws(()=>f.coordinator.assertDrained(),{code:'unsettled-operations'});
  if(timed){timers.at(-1)();await Promise.resolve();assert.equal(f.coordinator.snapshot().physical,1);assert.throws(()=>f.coordinator.assertDrained());}
  reject(Error('invented rejection failure'));await f.cb.drain().catch(()=>{});assert.ok(f.errors.length);assert.throws(()=>f.s.journey.assertComplete(f.token));f.coordinator.dispose();
 }
});

test('ADR192 nested child lifecycle before commit stays isolated from all main facts and drains unavailable',async()=>{
 const api=await import('./browser-capture.mjs?child-lifecycle-joined'),f=fixture(),fake=fakeBrowser(f,{causalResponse:true,childMode:'silent',childLifecycle:true}),rows=[];
 try{const summary=await api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)}));assert.equal(summary.unavailable,4);assert.ok(rows.every(r=>r.reason==='restricted-rendering'));api.releaseCapturedBatch(summary);assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});}finally{fake.restore();}
 const direct=callbackFixture();direct.cb.frameAttached({frameId:'child',parentFrameId:'frame'});direct.cb.frameAttached({frameId:'nested',parentFrameId:'child'});const before=direct.s.journey.snapshot();
 for(const frameId of ['child','nested'])for(const name of ['init','DOMContentLoaded','networkIdle'])direct.cb.lifecycle({frameId,loaderId:'child-loader',name,timestamp:0});assert.deepEqual(direct.s.journey.snapshot(),before);assert.equal(direct.errors.length,0);assert.equal(direct.s.refusal,'restricted-rendering');direct.coordinator.dispose();
});

test('ADR192 child lifecycle rejects unknown removed retired late malformed and hostile envelopes without hooks',()=>{
 const base={frameId:'child',loaderId:'child-loader',name:'init',timestamp:1};let hooks=0;
 const getter={...base};Object.defineProperty(getter,'name',{enumerable:true,get(){hooks++;throw Error();}});
 const hidden={...base};Object.defineProperty(hidden,'name',{value:'init',enumerable:false});
 const proxy=new Proxy(base,{ownKeys(){hooks++;throw Error();},getPrototypeOf(){hooks++;throw Error();}});
 const inputs=[getter,hidden,proxy,{...base,extra:true},{...base,loaderId:''},{...base,name:'commit'},{...base,name:'unknown'},{...base,timestamp:-0},{...base,timestamp:-1},{...base,timestamp:NaN},{...base,timestamp:Infinity},{frameId:'child',loaderId:'child-loader',name:'init'}];
 for(const input of inputs){const f=callbackFixture();f.cb.frameAttached({frameId:'child',parentFrameId:'frame'});f.cb.lifecycle(input);assert.ok(f.errors.length);f.coordinator.dispose();}assert.equal(hooks,0);
 for(const state of ['unknown','removed','retired','retiring','no-refusal']){const f=callbackFixture();if(state!=='unknown')f.cb.frameAttached({frameId:'child',parentFrameId:'frame'});if(state==='removed')f.s.childFrames.get('child').status='removed';if(state==='retired')f.s.retired=true;if(state==='retiring'){f.s.retiring=true;f.s.closeIssued=true;f.s.verifiedLoader='child-loader';}if(state==='no-refusal')f.s.refusal=null;f.cb.lifecycle(base);assert.ok(f.errors.length);f.coordinator.dispose();}
 const main=callbackFixture();main.cb.frameAttached({frameId:'child',parentFrameId:'frame'});main.cb.lifecycle({...base,frameId:'frame',loaderId:'blank',name:'DOMContentLoaded'});assert.equal(main.errors[0].code,'blank-loader');main.coordinator.dispose();
});

test('known iframe removes or whole-parent destruction produce only unavailable rows',async()=>{
 for(const mode of ['removed','silent']){
  const api=await import('./browser-capture.mjs?children-'+mode),f=fixture(),fake=fakeBrowser(f,{childMode:mode,pwChildMode:'same-parent'}),rows=[];
  try{const summary=await api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)}));assert.equal(summary.unavailable,4);assert.equal(summary.available,0);assert.ok(rows.every(r=>r.reason==='restricted-rendering'));assert.equal(JSON.stringify(summary).includes('child-'),false);api.releaseCapturedBatch(summary);
  }finally{fake.restore();}
 }
});

test('unknown duplicate swap child detach, missing parent receipt or lingering census cannot release',async()=>{
 for(const kind of ['unknown','duplicate','swap','missing-parent','lingering']){
  let now=0;const api=await import('./browser-capture.mjs?children-negative-'+kind),f=fixture(),fake=fakeBrowser(f,{childMode:['unknown','duplicate','swap'].includes(kind)?kind:'silent',missingParentDestroy:kind==='missing-parent',lingerParent:kind==='lingering',afterPageClose(){if(kind==='missing-parent')now=30000;}});
  try{await assert.rejects(api.captureNativeSpecificityBatch(captureArgs(f,fake,{clock:()=>now})));assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});assert.throws(()=>api.releaseCapturedBatch({}));
  }finally{fake.restore();}
 }
});

test('child registry authenticates parents, bounded historical IDs and observed removal tombstones',()=>{
 const f=callbackFixture();f.cb.frameAttached({frameId:'child',parentFrameId:'frame'});assert.equal(f.s.refusal,'restricted-rendering');assert.equal(f.s.childFrames.get('child').status,'live');
 f.s.journey.abort();f.cb.revokeForRetirement();f.s.retiring=true;f.s.closeIssued=true;f.cb.frameDetached({frameId:'child',reason:'remove'});assert.equal(f.s.childFrames.get('child').status,'removed');f.cb.frameDetached({frameId:'child',reason:'remove'});assert.ok(f.errors.length);f.coordinator.dispose();
 for(const kind of ['parent','duplicate','capacity']){const x=callbackFixture();if(kind==='capacity')for(let n=0;n<16;n++)x.cb.frameAttached({frameId:'child-'+n,parentFrameId:'frame'});else if(kind==='duplicate')x.cb.frameAttached({frameId:'child',parentFrameId:'frame'});x.cb.frameAttached({frameId:kind==='capacity'?'child-16':'child',parentFrameId:kind==='parent'?'unknown':'frame'});assert.ok(x.errors.length);x.coordinator.dispose();}
 const x=terminalFixture();x.cb.frameDetached({frameId:'frame',reason:'remove'});assert.equal(x.errors.length,0);x.cb.frameDetached({frameId:'frame',reason:'remove'});assert.equal(x.errors[0].code,'main-frame-detached');x.coordinator.dispose();
});

test('unsettled original transport cannot establish child physical retirement',async()=>{
 const f=callbackFixture();let settle;f.cb.frameAttached({frameId:'child',parentFrameId:'frame'});
 const original=new Promise(resolve=>{settle=resolve;});const owned=f.coordinator.rpc(()=>original);assert.throws(()=>f.coordinator.assertDrained(),{code:'unsettled-operations'});
 assert.equal(f.s.childFrames.get('child').status,'live');settle();await owned;f.coordinator.assertDrained();assert.equal(f.s.childFrames.get('child').status,'live');f.coordinator.dispose();
});

test('independent PW object graph validates prototype methods without URLs or ID correlation',()=>{
 const page={},main={page(){return page;}},parent={page(){return page;},parentFrame(){return main;}},proto={page(){return page;},parentFrame(){return parent;},url(){throw Error('no URL read');}},child=Object.create(proto),g=createPlaywrightChildFrameGraph(page,main);
 g.observe(child);g.observe(child);assert.equal(g.retainedBytes(),384);g.retire();assert.throws(()=>g.observe(child),{code:'pw-child-lifecycle'});
 let hooks=0;
 for(const kind of ['crosspage','cycle','root-mismatch','depth','parent-change','proxy','getter','method-proxy','prototype-proxy']){
  const graph=createPlaywrightChildFrameGraph(page,main);let value={page(){return page;},parentFrame(){return main;}};
  if(kind==='crosspage')value.page=()=>({});
  if(kind==='cycle')value.parentFrame=()=>value;
  if(kind==='root-mismatch')value.parentFrame=()=>({page(){return page;},parentFrame(){return null;}});
  if(kind==='depth'){let end=main;for(let i=0;i<17;i++){const parent=end;end={page(){return page;},parentFrame(){return parent;}};}value=end;}
  if(kind==='parent-change'){graph.observe(value);value.parentFrame=()=>parent;}
  if(kind==='proxy')value=new Proxy(value,{getPrototypeOf(){hooks++;throw Error('no');}});
  if(kind==='getter')Object.defineProperty(value,'page',{get(){hooks++;throw Error('no');}});
  if(kind==='method-proxy')value.page=new Proxy(value.page,{apply(){hooks++;throw Error('no');}});
  if(kind==='prototype-proxy')value=Object.create(new Proxy(proto,{getOwnPropertyDescriptor(){hooks++;throw Error('no');}}));
  assert.throws(()=>graph.observe(value));
 }
 assert.equal(hooks,0);
 const bounded=createPlaywrightChildFrameGraph(page,main);for(let i=0;i<16;i++)bounded.observe({page(){return page;},parentFrame(){return main;}});assert.throws(()=>bounded.observe({page(){return page;},parentFrame(){return main;}}),{code:'pw-child-capacity'});
});

test('joined PW child cross-page or late old article event remains whole-fatal',async()=>{
 for(const kind of ['crosspage','late']){const api=await import('./browser-capture.mjs?pw-child-'+kind),f=fixture(),fake=fakeBrowser(f,{childMode:'silent',pwChildMode:kind==='crosspage'?'crosspage':'same-parent',lateOldChild:kind==='late'});
  try{await assert.rejects(api.captureNativeSpecificityBatch(captureArgs(f,fake)));assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});}finally{fake.restore();}
 }
});

test('ADR200 two complete invented extension batches then pending third discovery retain exact197 witness through driver',async()=>{
 const api=await import('./browser-capture.mjs?adr200-third-discovery');
 for(let index=0;index<2;index++){
  const f=fixture(index),fake=fakeBrowser(f);
  try{const summary=await api.captureNativeSpecificityBatch(captureArgs(f,fake));assert.equal(summary.available,4);api.releaseCapturedBatch(summary);}finally{fake.restore();}
 }
 const f=fixture(2),fake=fakeBrowser(f);let settle,original;
 const send=fake.root.send;
 fake.root.send=(method,args)=>{
  if(method!=='Target.setDiscoverTargets')return send(method,args);
  fake.root.emit('Target.targetCreated',{targetInfo:{targetId:'anchor',type:'page',url:'about:blank',attached:true,browserContextId:'context'}});
  fake.root.emit('Target.targetCreated',{targetInfo:{targetId:'ui',type:'browser_ui',url:'chrome://omnibox-popup.top-chrome/',attached:true,browserContextId:'context'}});
  return new Promise(resolve=>{settle=resolve;});
 };
 try{
  const running=api.captureNativeSpecificityBatch(captureArgs(f,fake)).then(value=>({value}),error=>({error}));
  for(let i=0;i<200&&api.captureFailureDiagnostic()===null;i++)await Promise.resolve();
  const before=api.captureFailureDiagnostic();assert.deepEqual(before.infrastructureWitness,{schema:'native-infrastructure-identity-witness/v1',site:'created',role:'ui-root',predicate:'attached'});
  assert.equal(fake.observation().nativeReads,0);settle({});const result=await running;original=result.error;
  assert.equal(Object.getPrototypeOf(original),StartupFatal.prototype);assert.equal(original.code,'infrastructure-identity');
  assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});assert.deepEqual(api.captureFailureDiagnostic().infrastructureWitness,before.infrastructureWitness);
  let emitted;
  const boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:bytes=>{emitted=bytes;},captureDiagnostic:()=>JSON.stringify(api.projectSpecificityCaptureDiagnostic(api.captureFailureDiagnostic()))});
  boundary.mark('browser-capture');assert.equal(await thrown(()=>boundary.run(()=>Promise.reject(original))),original);
  const line=JSON.parse(emitted);assert.deepEqual(line.capture.infrastructureWitness,before.infrastructureWitness);assert.ok(emitted.length<=900);
  assert.equal(await thrown(()=>api.assertCaptureHealthy()),original);assert.ok(!emitted.toString().includes('chrome://'));
 }finally{settle?.({});fake.restore();}
});

test('ADR200 infrastructure projection is closed/zero-hook and cannot borrow a primary family',()=>{
 const witness={schema:'native-infrastructure-identity-witness/v1',site:'census',role:'ui-root',predicate:'duplicate-created'};
 const value={schema:'native-specificity-capture-failure/v1',stage:'target-discovery',rpc:'Target.setDiscoverTargets',primary:{family:'startup',code:'infrastructure-identity'},cleanup:{family:'control-unavailable',code:'origin-representation-unavailable'},journeyWitness:null,timerWitness:null,infrastructureWitness:witness,networkWitness:null,operationWitness:null,ownerNavigationWitness:null,navigationAccountingWitness:null};
 const result=projectSpecificityCaptureDiagnostic(value);assert.ok(Object.isFrozen(result.infrastructureWitness));assert.ok(Buffer.byteLength(JSON.stringify(result))<=700);
 let hooks=0;const getter={...witness};Object.defineProperty(getter,'predicate',{get(){hooks++;throw 0;}});
 for(const infrastructureWitness of [getter,new Proxy(witness,{getPrototypeOf(){hooks++;throw 0;}}),{...witness,site:'unknown'},{...witness,role:'secret'},{...witness,predicate:'secret'},{...witness,extra:1}])assert.throws(()=>projectSpecificityCaptureDiagnostic({...value,infrastructureWitness}),{code:'diagnostic-contract'});
 for(const primary of [{family:'startup',code:'infrastructure-census'},{family:'capture',code:'contract'}])assert.throws(()=>projectSpecificityCaptureDiagnostic({...value,primary}),{code:'diagnostic-contract'});
 assert.equal(hooks,0);
});


test('ADR212 actual aggregate sees building7168 and control/hook charges before notification allocation',async()=>{
 const source=await readFile(new URL('./browser-capture.mjs',import.meta.url),'utf8'),start=source.indexOf('function checkRetained(){'),end=source.indexOf('\n const infrastructure=',start),body=source.slice(start,end),rows=fixture().batch.cases,slots=rows.map(c=>1024+2*(c.url.length+320)+320),pool=slots.reduce((n,x)=>n+x,0);
 assert.ok(!body.includes('guard(')&&!body.includes('clock(')&&!body.includes('failureReport('));
 for(const over of [0,1]){let j,checkRetained,notifications=0,preflights=0,view,base,ownerBytes;
  j=createPublicJourney({incarnation:{},frameId:'frame',blankLoaderId:'blank',url:rows[0].url,until:20000,clock:()=>0,guard(){},reportPreflight(){preflights++;assert.equal(j.retainedBytes()-base,7168);checkRetained();},onFailure(error){notifications++;if(over)assert.equal(caughtValue(()=>j.failureReport()),error);else view=j.failureReport();}});
  base=j.retainedBytes();ownerBytes=32768-768-pool-base-7168+over;
  const env={phase:0,Buffer,articleSummaries:[],articlePackets:[],summaryScratch:0,PACKED_SUMMARY_BYTES:308,childRegistries:[],retirementRegistries:[],terminalRegistries:[],pwChildGraphs:[],journeyStates:[j],navigationSlots:slots,navigationLedgers:[null,null,null,null],diagnosticReservation:768,owner:{snapshot:()=>({retainedBytes:ownerBytes})},retainedStatePeak:0,bad:code=>{throw new NativeCaptureError(code);}};
  checkRetained=runInNewContext('('+body+')',env);const error=caughtValue(()=>j.begin({}));assert.equal(error.code,'wrong-incarnation');assert.equal(preflights,1);assert.equal(notifications,1);assert.equal(env.retainedStatePeak,32768+over);
  if(over)assert.equal(caughtValue(()=>j.failureReport()),error);else{assert.equal(j.failureReport(),view);checkRetained();assert.equal(env.retainedStatePeak,32768);}
 }
 function caughtValue(fn){let present=false,value;try{fn();}catch(e){present=true;value=e;}assert.equal(present,true);return value;}
});


test('ADR212 actual aggregate charges absent, compact, steady and unavailable states at32768/32769',async()=>{
 const source=await readFile(new URL('./browser-capture.mjs',import.meta.url),'utf8'),start=source.indexOf('function checkRetained(){'),body=source.slice(start,source.indexOf('\n const infrastructure=',start)),rows=fixture().batch.cases,slots=rows.map(c=>1024+2*(c.url.length+320)+320),pool=slots.reduce((n,x)=>n+x,0);
 for(const mode of ['absent','compact','materialized','unavailable']){
  let component,initial,notified=false,original;component=createPublicJourney({incarnation:{},frameId:'frame',blankLoaderId:'blank',url:rows[0].url,until:20000,clock:()=>0,guard(){},reportPreflight(){if(mode==='unavailable')throw false;assert.equal(component.retainedBytes()-initial,7168);},onFailure(){notified=true;}});
  initial=component.retainedBytes();if(mode!=='absent'){try{component.begin({});}catch(e){original=e;}assert.equal(notified,true);}if(mode==='materialized')component.failureReport();
  const charge=mode==='absent'?0:mode==='compact'?208:mode==='materialized'?4096:8192;assert.equal(component.retainedBytes()-initial,charge);if(mode==='unavailable')assert.throws(()=>component.failureReport(),e=>e===original);
  let ownerBytes=32768-768-pool-component.retainedBytes();const env={phase:0,Buffer,articleSummaries:[],articlePackets:[],summaryScratch:0,PACKED_SUMMARY_BYTES:308,childRegistries:[],retirementRegistries:[],terminalRegistries:[],pwChildGraphs:[],journeyStates:[component],navigationSlots:slots,navigationLedgers:[null,null,null,null],diagnosticReservation:768,owner:{snapshot:()=>({retainedBytes:ownerBytes})},retainedStatePeak:0,bad:code=>{throw new NativeCaptureError(code);}};
  const check=runInNewContext('('+body+')',env);check();assert.equal(env.retainedStatePeak,32768);ownerBytes++;assert.throws(check,{code:'registry-capacity'});assert.equal(env.retainedStatePeak,32769);
 }
});

test('ADR211 actual retained-state check reserves all four slots, packets and real overlap at32768/32769',async()=>{
 const source=await readFile(new URL('./browser-capture.mjs',import.meta.url),'utf8');
 const start=source.indexOf('function checkRetained(){'),end=source.indexOf('\n const infrastructure=',start);
 const text=source.slice(start,end);assert.ok(text.includes('const retained=navigationPool+diagnosticReservation+(phase&8?256:0)+(phase&512?256:0)+(phase&2048?3072:0)+(phase&4096?2560:0)+owner.snapshot().retainedBytes'));
 const initialization=source.slice(end,source.indexOf('\n const owner=',end)),{createInfrastructurePolicy:actualPolicy}=await import('../infrastructure-identity-witness-v1/policy.mjs');
 const actualReservation=Function('createInfrastructurePolicy','bad',initialization+';return diagnosticReservation;')(actualPolicy,code=>{throw new NativeCaptureError(code);});assert.equal(actualReservation,768);
 const rows=fixture().batch.cases,slots=rows.map(c=>1024+2*(c.url.length+160+160)+320);
 for(const mode of ['all-uncreated','one-live','all-live','all-released','all-dropped','mixed-dropped']){
 const ledgers=rows.map((c,i)=>mode==='all-uncreated'||mode==='one-live'&&i!==0?null:createMainNavigationAccounting({page:{},mainFrame:{},session:{},token:{},frameId:'f'+i,blankLoaderId:'b'+i,caseUrl:c.url,until:1,clock:()=>0,guard(){},owner:{commit(){},pageNavigation(){},assertReading(){}},journey:{commit(){},assertComplete(){return true;}},journeyCall:(_s,_p,action)=>action()}));
 if(mode==='all-released')for(const h of ledgers)h.release();
 if(mode==='all-dropped'||mode==='mixed-dropped')for(let i=0;i<4;i++){ledgers[i].release();ledgers[i]=mode==='mixed-dropped'&&i>0?null:0;}
 const pool=ledgers.reduce((n,h,i)=>n+(h===null?slots[i]:h===0?8:h.retainedBytes()),0);
 for(const stage of ['initial','pack-scratch','packet+fullrow','decode-overlap','null-pair','live-pair','mixed-pairs']){
 const packets=stage==='initial'||stage==='pack-scratch'?[]:[new Uint32Array(45)],expanded=stage==='decode-overlap'?[{invented:'finite-metadata'}]:[],scratch=stage==='initial'?0:nativeArticleSummaryBound(rows[0].id,1)+(stage==='pack-scratch'?308:0),summaryBytes=scratch+packets.length*308+expanded.reduce((n,r)=>n+128+Buffer.byteLength(JSON.stringify(r)),0),boundary=32768-actualReservation-pool-summaryBytes;
 const childMaps=stage==='null-pair'?[null]:stage==='live-pair'?[new Map()]:stage==='mixed-pairs'?[null,new Map()]:[],denialMaps=stage==='null-pair'?[null]:stage==='live-pair'?[new Map()]:stage==='mixed-pairs'?[null,new Map()]:[],mapBytes=childMaps.reduce((n,m)=>n+(m===null?8:64),0)+denialMaps.reduce((n,m)=>n+(m===null?8:128),0),actualBoundary=boundary-mapBytes;
 if(stage==='null-pair')assert.equal(mapBytes,16);if(stage==='live-pair')assert.equal(mapBytes,192);if(stage==='mixed-pairs')assert.equal(mapBytes,208);
 for(const ownerBytes of [actualBoundary,actualBoundary+1]){
  // Financial geometry is invented; the private live-binding verifier is tested
  // separately below, not represented as capture provenance by these budgets.
  let dispatches=0;const environment={phase:0,Buffer,guard(){},assertCaptureHealthy(){},verifyNavigationBinding(){},signal:null,fatalLatched:false,lifecycle:{closed:false},articleSummaries:expanded,articlePackets:packets,summaryScratch:scratch,PACKED_SUMMARY_BYTES:308,childRegistries:childMaps,retirementRegistries:denialMaps,terminalRegistries:[],pwChildGraphs:[],journeyStates:[],navigationSlots:slots,navigationLedgers:ledgers,diagnosticReservation:actualReservation,owner:{snapshot:()=>({retainedBytes:ownerBytes})},retainedStatePeak:0,clock:()=>0,wholeUntil:1,until:1,bad:code=>{throw new Error(code);}};
  const check=runInNewContext('('+text+')',environment);
  if(ownerBytes===actualBoundary){check();dispatches++;assert.equal(environment.retainedStatePeak,32768);}else assert.throws(()=>{check();dispatches++;},/registry-capacity/u);
  assert.equal(dispatches,ownerBytes===actualBoundary?1:0);
 }
 }
 }
});

test('ADR200 falsy first values and same-class other/released-policy errors cannot borrow the private witness',async()=>{
 const {createInfrastructurePolicy:diagnosticPolicy}=await import('../infrastructure-identity-witness-v1/policy.mjs');
 const external=diagnosticPolicy(),anchor={targetId:'external-anchor',type:'page',url:'about:blank',attached:true,browserContextId:'external-context'};
 external.seal({targetInfo:anchor});
 const other=await thrown(()=>external.created(external.targetPayload({targetInfo:{...anchor,targetId:'external-ui',type:'browser_ui',url:'chrome://omnibox-popup.top-chrome/'}})));
 assert.notEqual(external.readFailureWitness(other),null);external.release();assert.equal(external.readFailureWitness(other),null);
 let index=0;
 for(const original of [undefined,null,false,0,other]){
  const api=await import('./browser-capture.mjs?adr200-first-value-'+index++),f=fixture(),fake=fakeBrowser(f);
  try{
   const actual=await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow(){throw original;}})));assert.equal(actual,original);
   const d=api.captureFailureDiagnostic();assert.equal(d.infrastructureWitness,null);assert.equal(d.journeyWitness,null);assert.equal(d.timerWitness,null);
   assert.equal(d.primary.family,original===other?'startup':'unclassified');assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});
  }finally{fake.restore();}
 }
});

const OWNER_NAV_FALSY=[undefined,null,false,0,-0,NaN,''];
const navWitness=(predicate,state='unexamined',urlRelation='unexamined')=>({schema:'native-article-navigation-witness/v1',predicate,state,urlRelation});
function navOwner(phase='absent',cases=Array.from({length:4},(_,i)=>({id:'owned-'+i,ordinal:i+1,nativeOrdinal:i+1,url:'https://fixture.invalid/'+i})),factory=createArticleOwner){
 let now=0,clockThrows=false,clockError;const frame={},page={};
 const owner=factory({infrastructure:{seal(){},release(){}},cases,clock:()=>{if(clockThrows)throw clockError;return now;}});
 const target={targetId:'article',type:'page',url:'about:blank',attached:false,browserContextId:'context'};
 owner.seal({targetInfo:{...target,targetId:'anchor',attached:true}});
 const f={owner,frame,page,cases,time:x=>{now=x;},throwClock:x=>{clockThrows=true;clockError=x;},clearClock:()=>{clockThrows=false;}};
 if(phase==='absent')return f;owner.reserve(cases[0],1000);if(phase==='pending')return f;
 owner.created({targetInfo:target});if(phase==='provisional')return f;
 owner.page(page);owner.returned(page);owner.authenticate({targetInfo:{...target,attached:true}});if(phase==='authenticated')return f;
 owner.navigate('frame','blank');if(phase==='navigating')return f;
 owner.commit({frame:{id:'frame',url:cases[0].url,loaderId:'loader'}});owner.verifyNavigation({frameId:'frame',loaderId:'loader'});
 if(phase==='retiring'||phase==='terminal')owner.retire();if(phase==='terminal')owner.lifecycle('target-destroyed',{targetId:'article'});
 return f;
}
function caughtNav(action){try{action();return {failed:false};}catch(error){return {failed:true,error};}}
test('ADR209 actual local owner covers six ordered predicates, skipped facts, sticky guards and release',()=>{
 for(const [phase,nonMain,url,expected]of [
  ['absent',true,'about:blank',navWitness('pending')],['pending',true,'about:blank',navWitness('frame')],
  ['pending',false,'https://other.invalid/',navWitness('target','absent','other')],
  ['provisional',false,'https://other.invalid/',navWitness('state','provisional')],
  ['authenticated',false,'https://other.invalid/',navWitness('state','authenticated')],
  ['retiring',false,'about:blank',navWitness('state','retiring')],['terminal',false,'about:blank',navWitness('state','terminal')],
  ['navigating',false,'about:blank',navWitness('url','navigating','blank')],['reading',false,undefined,navWitness('url','reading','unavailable')]]){
  const f=navOwner(phase),error=caughtNav(()=>f.owner.pageNavigation(nonMain?{}:f.frame,f.frame,url)).error;
  assert.equal(error.constructor,ArticleOwnerError);assert.equal(error.code,'article-navigation');
  const witness=f.owner.navigationWitnessFor(error);assert.deepEqual(witness,expected);assert.ok(Object.isFrozen(witness));
  assert.equal(f.owner.navigationWitnessFor(error,error),null);f.owner.release();assert.equal(f.owner.navigationWitnessFor(error),null);
 }
 for(const phase of ['pending','provisional','authenticated']){
  const f=navOwner(phase);f.owner.pageNavigation(f.frame,f.frame,'about:blank');
  const error=caughtNav(()=>f.owner.pageNavigation(f.frame,f.frame,'about:blank')).error;
  assert.deepEqual(f.owner.navigationWitnessFor(error),phase==='pending'?navWitness('target','absent','blank'):navWitness('state',phase));
 }
 for(const phase of ['navigating','reading']){
  const f=navOwner(phase);f.owner.pageNavigation(f.frame,f.frame,f.cases[0].url);
  const error=caughtNav(()=>f.owner.pageNavigation(f.frame,f.frame,f.cases[0].url)).error;
  assert.deepEqual(f.owner.navigationWitnessFor(error),navWitness('repeat',phase));
  const other=navOwner();assert.equal(other.owner.navigationWitnessFor(error),null);
 }
 for(const value of OWNER_NAV_FALSY){
  const f=navOwner('pending');f.throwClock(value);const first=caughtNav(()=>f.owner.pageNavigation(f.frame,f.frame,'about:blank'));
  assert.equal(first.failed,true);assert.ok(Object.is(first.error,value));assert.equal(f.owner.navigationWitnessFor(value),null);f.clearClock();
  assert.equal(f.owner.navigationWitnessFor(caughtNav(()=>f.owner.pageNavigation({},f.frame,'about:blank')).error),null);
 }
});
test('ADR209 actual local owner reserves512 once and retains null witness on32769 bounded failure',()=>{
 const f=navOwner('navigating'),before=f.owner.snapshot().retainedBytes;f.owner.pageNavigation(f.frame,f.frame,f.cases[0].url);
 const extra=f.owner.snapshot().retainedBytes-before;
 for(const over of [0,1]){
  const cases=f.cases.map((c,i)=>({...c,url:c.url+(i===0?'x'.repeat(32768+over-before-extra):'')}));
  const g=navOwner('navigating',cases),result=caughtNav(()=>g.owner.pageNavigation(g.frame,g.frame,cases[0].url));
  assert.equal(result.failed,over===1);assert.equal(g.owner.snapshot().retainedBytes,32768+over);
  if(over){assert.equal(result.error.code,'registry-capacity');assert.equal(g.owner.navigationWitnessFor(result.error),null);}
 }
 const empty=createArticleOwner({infrastructure:{release(){}},cases:f.cases,clock:()=>0});
 assert.equal(empty.snapshot().retainedBytes,128+8192+512+8);empty.release();assert.equal(empty.snapshot().retainedBytes,128+8192+512+8);
});
test('ADR209 local exact owner body projection failure and reentrant throwing release cannot replace/revive first error',()=>{
 for(const projectionFault of [undefined,false,Error('invented projection')]){
  const originals=[];let canProject=false;
  const facade={entries:Object.entries,hasOwn:Object.hasOwn,is:Object.is,freeze(value){
   if(Object.getOwnPropertyDescriptor(value,'schema')?.value==='native-article-navigation-witness/v1'&&!canProject)throw projectionFault;
   return Object.freeze(value);
  }};
  const factory=Function('fail','fields','dense','identity','Object','ownedMapForEach','ownedSetForEach',"'use strict'; return ("+createArticleOwner.toString()+');')(
   code=>{const e=new ArticleOwnerError(code);originals.push(e);throw e;},localOwnerModule.fields,localOwnerModule.dense,localOwnerModule.identity,facade,Map.prototype.forEach,Set.prototype.forEach);
  assert.equal(factory.toString(),createArticleOwner.toString());const f=navOwner('pending',undefined,factory);
  const first=caughtNav(()=>f.owner.pageNavigation({},f.frame,'about:blank')).error;assert.equal(first,originals[0]);assert.equal(f.owner.navigationWitnessFor(first),null);
  canProject=true;const second=caughtNav(()=>f.owner.pageNavigation(f.frame,f.frame,'https://other.invalid/')).error;
  assert.equal(second,originals[1]);assert.equal(f.owner.navigationWitnessFor(second),null);
 }
 let owner,first;const infrastructure={release(){assert.equal(owner.navigationWitnessFor(first),null);const later=caughtNav(()=>owner.pageNavigation({},{} ,'about:blank')).error;assert.equal(later.code,'released');assert.equal(owner.navigationWitnessFor(later),null);throw false;}};
 owner=createArticleOwner({infrastructure,cases:navOwner().cases,clock:()=>0});first=caughtNav(()=>owner.pageNavigation({},{} ,'about:blank')).error;
 assert.ok(owner.navigationWitnessFor(first));assert.equal(caughtNav(()=>owner.release()).error,false);assert.equal(owner.navigationWitnessFor(first),null);
});
test('ADR209 actual local corrected observer preserves every falsy action/emission combination and overflow',()=>{
 const choices=[{failed:false},...OWNER_NAV_FALSY.map(error=>({failed:true,error}))];
 for(const emission of choices)for(const action of choices){
  let actions=0;const received=[],o=createCallbackObservation({emit(){if(emission.failed)throw emission.error;}});
  o.callback('article-navigation',{},()=>{actions++;if(action.failed)throw action.error;},e=>received.push(e));
  assert.equal(actions,1);assert.equal(received.length,action.failed||emission.failed?1:0);
  if(received.length)assert.ok(Object.is(received[0],action.failed?action.error:emission.error));
 }
 const received=[],o=createCallbackObservation();let actions=0;
 for(let i=0;i<4096;i++)o.callback('article-navigation',{},()=>{actions++;},e=>received.push(e));
 o.callback('article-navigation',{},()=>{actions++;throw false;},e=>received.push(e));
 assert.equal(actions,4097);assert.deepEqual(received,[false]);assert.equal(o.snapshot().invalidCallbacks,1);assert.equal(o.snapshot().retained,32);
});
test('ADR209 real typed commit callback calls both actions once in order and preserves SAME first including all falsy values',async()=>{
 const choices=[{failed:false},...OWNER_NAV_FALSY.map(error=>({failed:true,error})),{failed:true,error:new ArticleOwnerError('navigation-journey')}];
 for(const ownerResult of choices)for(const journeyResult of choices){
  const order=[],failures=[],token={},url=fixture().batch.cases[0].url,s={token,page:{},session:{},frameId:'frame',url,retiring:false,retired:false,encodedBytes:0};
  const witness=createJourneyFailureWitness('blank'),later=journeyResult.error;
  s.journey={abort(){},commit(){order.push('journey');if(journeyResult.failed){witness.capture(later,{phase:'dispatched',seen:Object.fromEntries(FACTS.map(k=>[k,false]))});throw later;}}};
  const c=createNativeCaptureCoordinator({guard(){},clock:()=>0,onFailure:e=>failures.push(e)});
  const cb=createPublicArticleCallbacks({state:s,coordinator:c,owner:{commit(){order.push('owner');if(ownerResult.failed)throw ownerResult.error;}},guard(){},clock:()=>0,countEvent(){},onFatal:e=>failures.push(e),
   journeyCall(site,input,action,suppress){assert.equal(suppress,ownerResult.failed);return witness.call(site,input,action,suppress);}});
  cb.frameNavigated(typedNavigation({id:'frame',loaderId:'loader',url}));
  assert.deepEqual(order,['owner','journey']);
  if(ownerResult.failed||journeyResult.failed){
   const expected=ownerResult.failed?ownerResult.error:journeyResult.error;assert.equal(failures.length,1);assert.ok(Object.is(failures[0],expected));
   if(ownerResult.failed)assert.equal(witness.candidateFor(later),null);
  }else assert.equal(failures.length,0);
  c.dispose();
 }
});
test('ADR211 public changed URL fails the actual helper and joins only finite accounting observation',async()=>{
 const api=await import('./browser-capture.mjs?adr211-public-url'),f=fixture(),fake=fakeBrowser(f,{pwNavigation({page,frame}){
  const original=frame.url;frame.url=()=> 'https://different.invalid/private';try{page.emit('framenavigated',frame);}finally{frame.url=original;}
 }});
 try{
  const error=await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake))),d=api.captureFailureDiagnostic();
  assert.deepEqual(d.primary,{family:'unclassified',code:'unclassified'});assert.equal(d.ownerNavigationWitness,null);
  assert.deepEqual(d.navigationAccountingWitness,{schema:'native-main-navigation-observation/v1',site:'public',state:'active',balance:'unmatched',urlRelation:'different'});
  assert.equal(d.journeyWitness,null);assert.equal(d.operationWitness,null);assert.equal(fake.observation().nativeReads,0);
  let wire;const boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:b=>{wire=b;},captureDiagnostic:()=>JSON.stringify(d)});boundary.mark('browser-capture');
  assert.equal(await thrown(()=>boundary.run(()=>Promise.reject(error))),error);
  const line=Buffer.isBuffer(wire)?wire.toString('utf8'):String(wire);assert.deepEqual(JSON.parse(line).capture.navigationAccountingWitness,d.navigationAccountingWitness);
  assert.ok(Buffer.byteLength(line)<=900);assert.ok(Buffer.byteLength(line)+31<=1024);assert.equal(line.includes('different.invalid'),false);
 }finally{fake.restore();}
});
test('ADR211 actual independent stream orders match without owner repeat or new facts',async()=>{
 for(const order of ['public-before-fresh','public-then-within','within-then-public'])for(const navigationType of ['fragment','historyApi','other']){
  const api=await import('./browser-capture.mjs?adr211-order-'+order+'-'+navigationType),f=fixture(),fake=fakeBrowser(f,{
   pwNavigation:order==='public-before-fresh'?({normal})=>{normal();normal();}:null,
   onFresh({normal,session,n,url}){const same=()=>session.emit('Page.navigatedWithinDocument',{frameId:'frame-'+n,url,navigationType});if(order==='public-before-fresh')same();else if(order==='public-then-within'){normal();same();}else{same();normal();}}
  });let rows=0;
  try{const summary=await api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow(){rows++;}}));assert.equal(rows,4);assert.equal(summary.available,4);assert.equal(fake.observation().nativeReads,4);assert.ok(summary.cases.every(c=>Object.values(c.journey.seen).every(Boolean)));assert.ok(summary.peakRetainedRegistryBytes<=32768);api.releaseCapturedBatch(summary);}finally{fake.restore();}
 }
});

test('ADR211 pending public debt waits only initial original lease, with no native read or close renewal',async()=>{
 const api=await import('./browser-capture.mjs?adr211-pending'),f=fixture(),fake=fakeBrowser(f,{pwNavigation({normal}){normal();normal();}});let now=0;
 try{const error=await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake,{clock:()=>now,pause:async()=>{now=20001;}})));assert.equal(error.code,'article-deadline');assert.equal(fake.observation().nativeReads,0);assert.equal(fake.observation().pageCloseCalls,0);assert.equal(api.captureFailureDiagnostic().navigationAccountingWitness,null);}finally{fake.restore();}
});

test('ADR211 same-document before fresh and pending postawait reads fail without invented readiness',async()=>{
 for(const mode of ['before-fresh','postawait']){
  const api=await import('./browser-capture.mjs?adr211-fence-'+mode),f=fixture(),fake=fakeBrowser(f,mode==='before-fresh'?{pwNavigation({normal,session,n,url}){normal();session.emit('Page.navigatedWithinDocument',{frameId:'frame-'+n,url,navigationType:'historyApi'});}}:{lateOperations:{start({page}){page.emit('framenavigated',page.mainFrame());}}});let rows=0;
  try{await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow(){rows++;}})));const d=api.captureFailureDiagnostic();assert.deepEqual(d.primary,{family:'unclassified',code:'unclassified'});assert.deepEqual(d.navigationAccountingWitness,{schema:'native-main-navigation-observation/v1',site:mode==='before-fresh'?'within':'read',state:'active',balance:'unmatched',urlRelation:mode==='before-fresh'?'exact':'not-examined'});assert.equal(rows,0);assert.equal(fake.observation().nativeReads,mode==='before-fresh'?0:1);assert.equal(fake.observation().pageCloseCalls,0);}finally{fake.restore();}
 }
});

test('ADR211 actual sealed onRow main/child/socket events invalidate whole phase without rewriting row',async()=>{
 for(const mode of ['within','public','child','socket']){
  const api=await import('./browser-capture.mjs?adr211-sealed-'+mode),f=fixture();let active;const fake=fakeBrowser(f,{onFresh(value){active=value;}}),rows=[];
  try{await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow(row){rows.push(row);const {page,frame,session,n,url}=active;if(mode==='within')session.emit('Page.navigatedWithinDocument',{frameId:'frame-'+n,url,navigationType:'fragment'});else if(mode==='public')page.emit('framenavigated',frame);else if(mode==='child')session.emit('Page.frameAttached',{frameId:'onrow-child',parentFrameId:'frame-'+n});else page.socketHandler({close:()=>Promise.resolve()});}})));assert.equal(rows.length,1);assert.equal(rows[0].status,'collected');assert.equal(fake.observation().nativeReads,1);assert.equal(fake.observation().pageCloseCalls,0);assert.equal(fake.observation().retiredCount,0);const d=api.captureFailureDiagnostic();if(mode==='within'||mode==='public')assert.deepEqual(d.navigationAccountingWitness,{schema:'native-main-navigation-observation/v1',site:mode,state:'sealed',balance:'matched',urlRelation:'exact'});else{assert.equal(d.primary.code,'late-article-callback');assert.equal(d.navigationAccountingWitness,null);}}finally{fake.restore();}
 }
});

test('ADR211 known rooted child same-document never grants main credits, terminal child uses existing proof',()=>{
 const active=callbackFixture();active.cb.frameAttached({frameId:'child',parentFrameId:'frame'});active.cb.withinDocument({frameId:'child',url:active.url,navigationType:'other'});assert.equal(active.s.refusal,'restricted-rendering');assert.equal(active.errors.length,0);active.coordinator.dispose();
 const terminal=terminalFrameFixture();terminal.cb.frameAttached({frameId:'child',parentFrameId:'frame'});const before=terminal.s.journey.snapshot();terminal.cb.withinDocument({frameId:'child',url:terminal.url,navigationType:'fragment'});assert.equal(terminal.errors.length,0);assert.deepEqual(terminal.s.journey.snapshot(),before);terminal.coordinator.dispose();
 for(const frameId of ['unknown','frame']){const f=terminalFrameFixture();f.cb.withinDocument({frameId,url:'https://publisher0.org/',navigationType:'historyApi'});assert.ok(f.errors.length);f.coordinator.dispose();}
});

test('ADR211 actual callsite observer keeps Object.is first identity and never inspects thrown values',async()=>{
 const source=await readFile(new URL('../native-specificity-study-v19/browser-capture.mjs',import.meta.url),'utf8'),start=source.indexOf('function navigationCall(site,helper,method,args,url){'),end=source.indexOf('\n const fail=',start),body=source.slice(start,end);
 const projection=source.slice(source.indexOf('function projectNavigationAccountingWitness(value){'),source.indexOf('\nexport function projectSpecificityCaptureDiagnostic',source.indexOf('function projectNavigationAccountingWitness(value){')));
 for(const original of [...OWNER_NAV_FALSY,Error('invented')])for(const prior of [false,true]){
  let hooks=0,calls=0;const hostile=new Proxy({},{get(){hooks++;throw 0;},getPrototypeOf(){hooks++;throw 0;},ownKeys(){hooks++;throw 0;}}),error=original instanceof Error?hostile:original;
  const helper={call(){calls++;throw error;},status(){return {state:'active',failed:true,publicCount:0,freshCount:0,sameDocumentCount:0,matched:false};}};
  const env={types,navigationAttempted:false,navigationOriginal:undefined,navigationBinding:null,navigationCandidate:null,diagnosticLatched:prior,rememberedLatched:false,fatalLatched:false,phaseFailureLatched:false,navigationLedgers:[helper,null,null,null],rows:[{url:'https://publisher0.org/'}],rec(value,keys){const out={};assert.equal(Reflect.ownKeys(value).length,keys.length);for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);assert.ok(d&&Object.hasOwn(d,'value'));out[k]=d.value;}return out;},frozen:Object.freeze,bad(){throw Error('projection');}};
  const invoke=runInNewContext('('+body+')',Object.assign(env,{projectNavigationAccountingWitness:runInNewContext('('+projection+')',env)}));
  let present=false,thrownValue;try{invoke('public',helper,'call',[],'https://publisher0.org/');}catch(e){present=true;thrownValue=e;}assert.equal(present,true);assert.ok(Object.is(thrownValue,error));assert.equal(calls,1);assert.equal(hooks,0);assert.equal(env.navigationAttempted,!prior);if(!prior){assert.ok(Object.is(env.navigationOriginal,error));assert.equal(env.navigationCandidate.urlRelation,'exact');}
 }
});

test('ADR211 actual unavailable revocation branch retains every first value across postrelease guard/finally faults',async()=>{
 const source=await readFile(new URL('./browser-capture.mjs',import.meta.url),'utf8'),start=source.indexOf('    try{check();',source.indexOf('}catch(error){if(publicationBegun)')),end=source.indexOf('\n   }finally{',start),body=source.slice(start,end);
 assert.ok(body.includes('releaseNavigation(s,c.ordinal);}check();'));assert.ok(body.includes('}catch(error){fail(error);throw fatal;}'));
 for(const original of [...OWNER_NAV_FALSY,Error('first')]){
  const order=[],page={},mainFrame={},session={},token={},s={allowFailureCleanup:false},journey={commit(){},assertComplete(){return true;},snapshot:()=>({phase:'dispatched'}),failureReport:()=>null,abort(){order.push('abort');}};
  s.journey=journey;s.mainNavigation=createMainNavigationAccounting({page,mainFrame,session,token,frameId:'frame',blankLoaderId:'blank',caseUrl:fixture().batch.cases[0].url,until:20000,clock:()=>0,guard(){},owner:{commit(){},pageNavigation(){},assertReading(){}},journey,journeyCall:(_site,_input,action)=>action()});
  const env={types,s,current:s,navigationLedgers:[s.mainNavigation,null,null,null],phase:0,c:{id:'case',ordinal:1},nonce:'nonce',unavailableReason:'article-unavailable',consumed:false,deferredUnavailable:null,articleCallbacks:{async drain(){order.push('drain');},pending:()=>0},socketJobs:new Set(),coordinator:{assertDrained(){order.push('physical');}},async skip(){order.push('skip');},navigationCall(_site,h,m,args){return Reflect.apply(h[m],h,args);},bad(){throw Error('bad');},fatal:undefined,present:false,check(){if(s.mainNavigation===0)throw original;},fail(e){if(!env.present){env.present=true;env.fatal=e;}}};
  env.releaseNavigation=runInNewContext('('+source.slice(source.indexOf('function releaseNavigation(s,ordinal){'),source.indexOf('\n function fence(s){'))+')',env);
  const invoke=runInNewContext('(async function(){try{'+body+'}finally{mandatoryFinally();}})',Object.assign(env,{mandatoryFinally(){order.push('finally');throw Error('later-finally');}}));
  try{await invoke();assert.fail('expected fault');}catch(e){env.fail(e);assert.ok(Object.is(env.fatal,original));}
  assert.equal(s.mainNavigation,0);assert.equal(env.navigationLedgers[0],0);assert.deepEqual(order,['drain','physical','skip','drain','physical','finally']);assert.equal(env.present,true);assert.equal(env.deferredUnavailable,null);
 }
});

test('ADR211 optional helper constructor refuses zero, null, proxies and rebinding before Map ownership',()=>{
 let hooks=0;const proxy=new Proxy({},{getPrototypeOf(){hooks++;throw 0;}}),first={},second={};
 for(const [provided,bound]of [[0,undefined],[-0,undefined],[null,undefined],[proxy,undefined],[first,0],[first,null],[first,second],[undefined,0],[undefined,-0],[undefined,null]]){
  const state={mainNavigation:bound};Object.defineProperty(state,'childFrames',{get(){hooks++;throw 0;}});
  assert.throws(()=>actualCreatePublicArticleCallbacks({state,mainNavigation:provided}),{code:'late-article-callback'});
 }assert.equal(hooks,0);
});

test('ADR211 actual private binding and released-object transition retain failures and reject every forged slot',async()=>{
 const source=await readFile(new URL('./browser-capture.mjs',import.meta.url),'utf8'),releaseBody=source.slice(source.indexOf('function releaseNavigation(s,ordinal){'),source.indexOf('\n function fence(s){')),bindingBody=source.slice(source.indexOf('function verifyNavigationBinding(){'),source.indexOf('\n function check(){guard();assertCaptureHealthy();'));
 assert.ok(source.includes('mainNavigation=undefined;'));const callbackBody=source.slice(source.indexOf('export function createPublicArticleCallbacks('),source.indexOf(' const navigationSlots='));assert.equal(/\bmainNavigation\.(?:status|freshCommit|sameDocument)/u.test(callbackBody.replaceAll('s.mainNavigation.','stateBinding.')),false);
 const fresh=()=>createMainNavigationAccounting({page:{},mainFrame:{},session:{},token:{},frameId:'frame',blankLoaderId:'blank',caseUrl:fixture().batch.cases[0].url,until:1,clock:()=>0,guard(){},owner:{commit(){},pageNavigation(){},assertReading(){}},journey:{commit(){},assertComplete(){return true;}},journeyCall:(_s,_p,action)=>action()});
 for(const mode of ['normal','association','candidate','duplicate','wrong-slot','foreign-state','cleared-state']){
  const helper=fresh(),s={mainNavigation:helper},ledgers=[helper,null,null,null];let checks=0;
  const env={types,current:s,navigationLedgers:ledgers,phase:mode==='association'||mode==='candidate'?1:0,bad:code=>{throw new NativeCaptureError(code);},check(){checks++;if(checks===1)assert.equal(s.mainNavigation,helper);else{assert.equal(s.mainNavigation,0);assert.equal(ledgers[0],0);}}};
  if(mode==='duplicate')ledgers[1]=helper;if(mode==='wrong-slot'){ledgers[0]=null;ledgers[1]=helper;}if(mode==='foreign-state')s.mainNavigation=fresh();if(mode==='cleared-state')s.mainNavigation=undefined;
  const release=runInNewContext('('+releaseBody+')',env),verify=runInNewContext('('+bindingBody+')',env);
  if(mode==='normal'){verify();release(s,1);assert.equal(helper.status().state,'released');assert.equal(helper.retainedBytes(),1024);assert.equal(s.mainNavigation,0);assert.equal(ledgers[0],0);verify();assert.throws(()=>release(s,1));}
  else{env.check=()=>{checks++;};assert.throws(()=>release(s,1));assert.equal(helper.status().state,'active');assert.notEqual(ledgers[0],0);if(['duplicate','foreign-state','cleared-state'].includes(mode))assert.throws(verify,{code:'late-article-callback'});}
 }
});

test('ADR211 actual callbacks have no parameter alias and zero main work fails finitely',()=>{
 for(const method of ['frameNavigated','withinDocument']){
  const f=terminalFrameFixture();f.s.retiring=false;f.s.closeIssued=false;f.s.mainNavigation=0;
  if(method==='frameNavigated')f.cb[method]({frame:{id:'frame',loaderId:'loader',url:'https://publisher0.org/'},type:'Navigation'});
  else f.cb[method]({frameId:'frame',url:'https://publisher0.org/',navigationType:'historyApi'});
  assert.equal(f.errors[0].code,'late-article-callback');f.coordinator.dispose();
 }
});

test('ADR211 deferred callback fixture binds exactly once; a second actual constructor refuses a different helper',()=>{
 const f=callbackFixture({},{},true);assert.equal(f.cb,null);assert.equal(f.s.mainNavigation,undefined);
 const options={state:f.s,coordinator:f.coordinator,owner:{commit(){}},guard(){},clock:()=>0,countEvent(){},onFatal:e=>f.errors.push(e)};
 const cb=createPublicArticleCallbacks(options),bound=f.s.mainNavigation;assert.equal(typeof bound,'object');assert.ok(cb);
 assert.throws(()=>createPublicArticleCallbacks(options),{code:'late-article-callback'});assert.equal(f.s.mainNavigation,bound);f.coordinator.dispose();
});

test('ADR211 private zero cannot acquire callsite diagnostics or touch replaced status operators',async()=>{
 const source=await readFile(new URL('../native-specificity-study-v19/browser-capture.mjs',import.meta.url),'utf8'),call=source.slice(source.indexOf('function navigationCall(site,helper,method,args,url){'),source.indexOf('\n const fail=')),binding=source.slice(source.indexOf('function verifyNavigationBinding(){'),source.indexOf('\n function check(){guard();assertCaptureHealthy();'));
 let hooks=0;const real={},foreign=new Proxy({},{get(){hooks++;throw 0;},getPrototypeOf(){hooks++;throw 0;}}),env={types,navigationLedgers:[real,null,null,null],current:{mainNavigation:foreign},navigationAttempted:false,navigationBinding:null,navigationCandidate:null,bad:code=>{throw new NativeCaptureError(code);}};
 const verify=runInNewContext('('+binding+')',env);assert.throws(verify,{code:'late-article-callback'});assert.equal(hooks,0);
 const invoke=runInNewContext('('+call+')',env);env.navigationLedgers=[0,null,null,null];for(const value of [0,-0,null,undefined,foreign])assert.throws(()=>invoke('public',value,'pageNavigation',[],'https://publisher0.org/'),{code:'late-article-callback'});
 assert.equal(env.navigationAttempted,false);assert.equal(env.navigationBinding,null);assert.equal(env.navigationCandidate,null);assert.equal(hooks,0);
});

function codecRow({caseId='case',ordinal=1,phase='retired',code=null,count=0,truth=null,seenMask=0,journeyNull=false}={}){
 return {caseId,ordinal,events:count?1024:0,encodedBytes:count?33554432:0,teardownLifecycle:count?1024:0,teardownAborts:count?1024:0,journey:journeyNull?null:{schema:'public-article-journey-report/v1',phase,code,events:count?4096:0,
  seen:Object.fromEntries(FACTS.map((k,i)=>[k,Boolean(seenMask&(1<<i))])),arrivals:Object.fromEntries(FACTS.map(k=>[k,count?4096:0])),ignored:Object.fromEntries(IGNORED_LIFECYCLE.map(k=>[k,count?4096:0])),initialReplay:Object.fromEntries(REPLAY_CATEGORIES.map(k=>[k,count?4096:0])),
  blankLoaderMatch:truth,frameAgreement:truth,loaderAgreement:truth,freshLoaders:truth,quarantinedLifecyclePresent:truth===true,quarantinedLifecycleAgreement:truth}};
}

test('ADR214 authenticated reference: SOURCE-only first-refused8192 preserves required witness fixture inputs',async()=>{
 const path=new URL('../native-capture-context-integration-v1/browser-capture.mjs',import.meta.url),before=await readFile(path),text=before.toString('utf8');
 const branch='if(!Number.isSafeInteger(packed)||-packed+8192>32768)return false;';assert.equal(text.split(branch).length,2);
 let shadow=text.replace(branch,"if(!Number.isSafeInteger(packed)||-packed+8192>32768){if(globalThis.__adr214Numeric===undefined)globalThis.__adr214Numeric={current:-packed,requested:8192,total:-packed+8192,limit:32768};return false;}");
 shadow=shadow.replace(/^import ([^\n]+) from '([^']+)';/gm,(_line,what,key)=>{
  const local=key.startsWith('../native-specificity-study-v19/')?'./'+key.slice('../native-specificity-study-v19/'.length):key==='../native-capture-context-integration-v1/article-owner.mjs'?'./article-owner.mjs':key.replace('native-specificity-public-journey-v3/','native-specificity-public-journey-v4/');
  return 'import '+what+" from '"+new URL(local,import.meta.url).href+"';";
 });
 delete globalThis.__adr214Numeric;
 const api=await import('data:text/javascript;base64,'+Buffer.from(shadow,'utf8').toString('base64')),f=fixture(),fake=fakeBrowser(f,{journeyFaultSite:'reply'}),close=fake.context.close;
 fake.context.close=async()=>{await close();throw new Error('private cleanup');};
 try{
  const original=await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake)));assert.equal(original.code,'blank-loader');
  const measured=globalThis.__adr214Numeric;
  console.log('ADR214 INSTRUMENTED SOURCE arithmetic required=journey-reply-nonnull',measured??null);
  assert.ok(measured);assert.equal(measured.total,measured.current+8192);assert.ok(measured.total>32768);
  assert.equal(api.captureFailureDiagnostic(),null);
 }finally{fake.restore();delete globalThis.__adr214Numeric;assert.equal(sourceSha(await readFile(path)),sourceSha(before));}
});

async function contextHarness({ownerBytes=9000,candidate=false}={}){
 const text=await readFile(new URL(candidate?'./browser-capture.mjs':'../native-capture-context-integration-v1/browser-capture.mjs',import.meta.url),'utf8');
 const helper={run(){throw false;},status(){return {state:'active',failed:true,publicCount:0,freshCount:0,sameDocumentCount:0,matched:false};},retainedBytes:()=>1024};
 const rows=fixture().batch.cases,env={Buffer,types,Reflect,lifecycle:{closed:false,released:false},activeBatch:{},diagnosticGetOwn:Object.getOwnPropertyDescriptor,diagnosticFreeze:Object.freeze,diagnosticObjectPrototype:Object.prototype,diagnosticIsProxy:types.isProxy,diagnosticStringify:JSON.stringify,diagnosticByteLength:Buffer.byteLength,diagnosticBufferAlloc:Buffer.alloc,diagnosticBufferWrite:Buffer.prototype.write,diagnosticApply:Reflect.apply,diagnosticSafeInteger:Number.isSafeInteger,RETAINED_BYTES:256,phase:0,first:undefined,bound:undefined,packed:0,view:null,
  currentContextSymbol:Symbol('actual-test-incarnation'),currentContextOrdinal:0,current:{mainNavigation:helper,retiring:true,closeIssued:true,retired:false},
  diagnosticLatched:false,rememberedLatched:false,fatalLatched:false,phaseFailureLatched:false,contextBridge:null,navigationLedgers:[helper,null,null,null],rows,
  navigationSlots:rows.map(c=>1024+2*(c.url.length+320)+320),diagnosticReservation:768,owner:{retainedBytes:()=>ownerBytes},
  journeyStates:[],summaryScratch:0,articlePackets:[],articleSummaries:[],childRegistries:[],retirementRegistries:[],terminalRegistries:[],pwChildGraphs:[],
  SPECIFICITY_DRIVER_FAILURE_STAGES:['browser-capture'],diagnosticValue:Object.freeze({schema:'native-specificity-capture-failure/v1',stage:'launch',rpc:'context.launch',primary:Object.freeze({family:'unclassified',code:'unclassified'}),cleanup:null,journeyWitness:null,timerWitness:null,infrastructureWitness:null,networkWitness:null,operationWitness:null,ownerNavigationWitness:null,navigationAccountingWitness:null}),
  NativeCaptureError,ownedCaptureMapForEach:Map.prototype.forEach,summaryJsonBytes:()=>{throw Error('not needed');},observeSafeRejectedRowPromise(){},
  rec(value,keys){const out={};assert.equal(Reflect.ownKeys(value).length,keys.length);for(const k of keys){const d=Object.getOwnPropertyDescriptor(value,k);assert.ok(d&&Object.hasOwn(d,'value'));out[k]=d.value;}return out;},
  bad:code=>{throw new NativeCaptureError(code);}};
 const helpers=text.slice(text.indexOf('function navigationSite'),text.indexOf('// Cleanup only:'));
 const body=text.slice(text.indexOf('function navigationCall(command,original,binding,a,b,c,d){'),text.indexOf('\n contextBridge=navigationCall;'));
 const label=candidate?text.slice(text.indexOf('function diagnosticLabelIndex('),text.indexOf('function diagnosticNominal(')):'';
 const call=runInNewContext(label+'\n'+helpers+'\n('+body+')',env);env.contextBridge=call;
 return {env,call,helper,setOwner:n=>{ownerBytes=n;}};
}

test('ADR214 actual single callable binds original current helper and consumes all falsy originals without hooks',async()=>{
 for(const original of [...OWNER_NAV_FALSY,Error('invented')])for(const prior of [false,true]){
  const h=await contextHarness({candidate:true});let calls=0;h.helper.run=()=>{calls++;throw original;};h.env.diagnosticLatched=prior;
  const result=caughtNav(()=>h.call('public',h.helper,'run',[],'https://different.invalid/'));
  assert.equal(result.failed,true);assert.ok(Object.is(result.error,original));assert.equal(calls,1);
  const view=h.call('selectPrimary',original,h.env.currentContextSymbol);assert.equal(view!==null,!prior);
  if(view)assert.deepEqual(JSON.parse(JSON.stringify(view)),{schema:'native-main-navigation-observation/v1',site:'public',state:'active',balance:'unmatched',urlRelation:'different'});
  assert.equal(h.call('selectPrimary',original,h.env.currentContextSymbol),null);
 }
});
test('ADR214 actual terminal dispatcher binds six literal branches, pairedzero and private ordinal',async()=>{
 const tuples=[['cdp-frame','main','main',null],['cdp-frame','parent-absent','nonmain',null],['cdp-frame','parent-mismatch','child',null],['cdp-within','main','main',null],['playwright','main-detached','unexamined',true],['playwright','main','main',false]];
 for(const t of tuples)for(const zero of [false,true]){
  const h=await contextHarness({candidate:true}),original={};if(zero){h.env.current.mainNavigation=0;h.env.navigationLedgers[0]=0;}
  h.call('terminal-observation',h.env.current,original,...t);const view=h.call('selectPrimary',original,h.env.currentContextSymbol);
  assert.deepEqual(JSON.parse(JSON.stringify(view)),{schema:'native-terminal-navigation-observation/v1',site:t[0],predicate:t[1],frameRelation:t[2],mainDetached:t[3]});
 }
 for(const mode of ['stale-state','wrong-ordinal','duplicate','foreign-helper','retired','not-closing','retiring-false']){
  const h=await contextHarness({candidate:true}),original={},state=h.env.current;
  if(mode==='wrong-ordinal')h.env.currentContextOrdinal=1;if(mode==='duplicate')h.env.navigationLedgers[1]=h.helper;
  if(mode==='foreign-helper')state.mainNavigation={};if(mode==='retired')state.retired=true;if(mode==='not-closing')state.closeIssued=false;if(mode==='retiring-false')state.retiring=false;
  h.call('terminal-observation',mode==='stale-state'?{}:state,original,...tuples[0]);assert.equal(h.call('selectPrimary',original,h.env.currentContextSymbol),null);
 }
});
test('ADR214 held-reference: funding8192 exact32768 boundary, permanent denial and sticky charge through release/emission',async()=>{
 for(const over of [0,1]){
  const h=await contextHarness(),pool=1024+h.env.navigationSlots.slice(1).reduce((n,x)=>n+x,0),original={};
  h.setOwner(32768-768-pool-8192+over);h.call('terminal',original,h.env.currentContextSymbol,'cdp-frame','main','main',null);h.call('selectPrimary',original,h.env.currentContextSymbol);
  assert.equal(h.call('fund'),over===0);assert.equal(h.env.packed,0);assert.equal(h.env.bound,undefined);
  if(over){assert.equal(h.env.phase&16,16);h.setOwner(0);assert.equal(h.call('fund'),false);assert.equal(h.call('emit','train-cal','browser-capture',()=>assert.fail('denied emitter')),false);}
  else{let firstBuffer;assert.equal(h.call('emit','train-cal','browser-capture',bytes=>{firstBuffer=bytes;assert.equal(h.env.phase&8,8);assert.equal(h.call('emit','train-cal','browser-capture',()=>assert.fail('reentry')),false);return false;}),true);
   assert.ok(Buffer.isBuffer(firstBuffer));const saved=Buffer.from(firstBuffer);h.call('release');assert.equal(h.env.phase&8,8);assert.equal(h.call('fund'),true);assert.deepEqual(firstBuffer,saved);assert.equal(h.call('emit','train-cal','browser-capture',()=>assert.fail('retry')),false);
  }
 }
});
test('ADR214 held-reference: funding cannot resurrect a released fold or retain a partial sum',async()=>{
 const h=await contextHarness(),original={};
 h.call('terminal',original,h.env.currentContextSymbol,'cdp-frame','main','main',null);
 h.call('selectPrimary',original,h.env.currentContextSymbol);
 h.env.owner.retainedBytes=()=>{h.call('release');return 0;};
 assert.equal(h.call('fund'),false);assert.equal(h.env.phase&3,3);assert.equal(h.env.phase&8,0);
 assert.equal(h.env.packed,0);assert.equal(h.env.bound,undefined);
 assert.equal(h.call('fund'),false);assert.equal(h.call('emit','train-cal','browser-capture',()=>assert.fail('revoked emitter')),false);
});
test('ADR214 numeric owner reader equals authenticated old field charges plus8 and rejects foreign args zero-hooks',async()=>{
 const source=await readFile(new URL(oldSource+'article-owner.mjs',sourceRepo),'utf8');
 const reference=Function('types','assert',"'use strict';\n"+source.replace(/^import [^\n]+;\n/gm,'').replace(/\bexport /g,'')+'\nreturn createArticleOwner;')(types,assert);
 for(const phase of ['absent','pending','provisional','authenticated','navigating','reading','retiring','terminal']){
  const old=navOwner(phase,undefined,reference),fresh=navOwner(phase);
  assert.equal(fresh.owner.retainedBytes(),old.owner.snapshot().retainedBytes+8);assert.equal(fresh.owner.snapshot().retainedBytes,fresh.owner.retainedBytes());
  fresh.owner.release();old.owner.release();assert.equal(fresh.owner.retainedBytes(),old.owner.snapshot().retainedBytes+8);
 }
 const f=navOwner();let hooks=0;const evil=new Proxy({},{get(){hooks++;throw false;},getPrototypeOf(){hooks++;throw false;}});
 for(const args of [[evil],[evil,'key',new Map()],['id','id',new Set()]])assert.throws(()=>f.owner.retainedBytes(...args),{code:'contract'});
 assert.equal(hooks,0);assert.equal(f.owner.retainedBytes(),f.owner.snapshot().retainedBytes);
});
test('ADR214 scalar private-summary counter equals actual JSON bytes for every phase/code and decimal boundary',async()=>{
 const text=await readFile(new URL('./browser-capture.mjs',import.meta.url),'utf8'),body=text.slice(text.indexOf('const SUMMARY_KEYS='),text.indexOf('function orderedRecord('));
 const count=Function('FACTS','IGNORED_LIFECYCLE','REPLAY_CATEGORIES',"'use strict';"+body+';return summaryJsonBytes;')(FACTS,IGNORED_LIFECYCLE,REPLAY_CATEGORIES);
 for(const phase of ['prepared','dispatched','resolved','retired'])for(const code of [null,...actualJourneyCodes])for(const truth of [null,false,true])for(const n of [0,1,9,10,99,100,999,1000,4096]){
  const row=codecRow({caseId:'ASCII.id-_:9',phase,code,truth,count:n?1:0});row.events=n;row.journey.events=n;row.journey.arrivals[FACTS[0]]=n;
  assert.equal(count(row),Buffer.byteLength(JSON.stringify(row)));
 }
 const row=codecRow({journeyNull:true});assert.equal(count(row),Buffer.byteLength(JSON.stringify(row)));
});
test('ADR214 actual funded authored DTO emission attempts once, preserves original and never invokes hostile return hooks',async()=>{
 for(const kind of ['false','throw','thenable','retained']){
  const api=await import('./browser-capture.mjs?adr214-emit-'+kind),f=fixture(),fake=fakeBrowser(f),original=false;let calls=0,hooks=0,kept;
  try{assert.ok(Object.is(await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake,{collectPolicies:async()=>{throw original;}}))),original));const first=api.captureFailureDiagnostic();assert.ok(first);assert.equal(api.captureFailureDiagnostic(),first);
   const boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',captureDiagnostic:()=>assert.fail('legacy clone path'),emitCaptureDiagnostic:api.emitCaptureFailureDiagnostic,
    emitFailure:bytes=>{calls++;kept=bytes;if(kind==='throw')throw undefined;if(kind==='thenable')return {get then(){hooks++;throw false;}};return false;}});boundary.mark('browser-capture');
   assert.ok(Object.is(await thrown(()=>boundary.run(()=>{throw original;})),original));assert.equal(calls,1);assert.equal(hooks,0);assert.deepEqual(JSON.parse(kept),{schema:'native-specificity-execution-failure/v1',phase:'train-cal',stage:'browser-capture',capture:first});
   assert.equal(api.emitCaptureFailureDiagnostic('train-cal','browser-capture',()=>assert.fail('retry')),false);assert.ok(kept.length<=900);
  }finally{fake.restore();}
 }
});

test('ADR211 fixed45-cell codec preserves exact JSON/hash for every phase/code/tristate, masks, null and gaps',()=>{
 for(const phase of ['prepared','dispatched','resolved','retired'])for(const code of [null,...actualJourneyCodes])for(const truth of [null,false,true])for(const count of [0,1]){
  const row=codecRow({phase,code,truth,count,ordinal:4,caseId:'sealed-four'}),packet=packNativeArticleSummary(row,row.caseId,4),copy=unpackNativeArticleSummary(packet,row.caseId,4);
  assert.equal(packet.length,45);assert.equal(packet.byteLength,180);assert.equal(packet.buffer.resizable,false);assert.equal(JSON.stringify(copy),JSON.stringify(row));assert.equal(digest(copy),digest(row));assert.ok(128+Buffer.byteLength(JSON.stringify(row))<=nativeArticleSummaryBound(row.caseId,4));
 }
 for(let seenMask=0;seenMask<128;seenMask++){const r=codecRow({seenMask}),p=packNativeArticleSummary(r,r.caseId,1);assert.equal(p[8],seenMask);assert.equal(JSON.stringify(unpackNativeArticleSummary(p,r.caseId,1)),JSON.stringify(r));}
 for(const ordinal of [1,3,4]){const r=codecRow({ordinal,journeyNull:true}),p=packNativeArticleSummary(r,r.caseId,ordinal);assert.ok([...p.slice(5)].every(v=>v===0));assert.equal(JSON.stringify(unpackNativeArticleSummary(p,r.caseId,ordinal)),JSON.stringify(r));p[6]=1;assert.throws(()=>unpackNativeArticleSummary(p,r.caseId,ordinal));}
 const maxCode=actualJourneyCodes.reduce((a,b)=>a.length>=b.length?a:b);for(const caseId of ['a','a'.repeat(160)]){const r=codecRow({caseId,ordinal:4,phase:'dispatched',code:maxCode,count:1,truth:false});assert.equal(nativeArticleSummaryBound(caseId,4),128+Buffer.byteLength(JSON.stringify(r)));}
});

test('ADR211 codec rejects unsafe source and coercion before storage, with descriptor-safe zero hooks',()=>{
 const original=codecRow(),badNumbers=[-1,-0,NaN,Infinity,1.5,'1',true,undefined];let hooks=0;
 for(const value of badNumbers)for(const key of ['events','encodedBytes','teardownLifecycle','teardownAborts'])assert.throws(()=>packNativeArticleSummary({...original,[key]:value},original.caseId,1));
 for(const value of badNumbers)for(const key of ['events'])assert.throws(()=>packNativeArticleSummary({...original,journey:{...original.journey,[key]:value}},original.caseId,1));
 for(const value of [4097,-0,'0',true])for(const bucket of ['arrivals','ignored','initialReplay']){const r=codecRow();r.journey[bucket][Object.keys(r.journey[bucket])[0]]=value;assert.throws(()=>packNativeArticleSummary(r,r.caseId,1));}
 const getter={...original};Object.defineProperty(getter,'events',{get(){hooks++;throw 0;}});
 const proxy=new Proxy(original,{get(){hooks++;throw 0;},getPrototypeOf(){hooks++;throw 0;},ownKeys(){hooks++;throw 0;}});
 for(const r of [getter,proxy,{...original,extra:true},{...original,journey:{...original.journey,schema:'wrong'}},{...original,journey:{...original.journey,phase:'failed'}},{...original,journey:{...original.journey,code:'secret'}},{...original,journey:{...original.journey,quarantinedLifecyclePresent:null}},{ordinal:1,caseId:'case',events:0,encodedBytes:0,teardownLifecycle:0,teardownAborts:0,journey:null}])assert.throws(()=>packNativeArticleSummary(r,'case',1));
 const r=codecRow();r.journey.seen=Object.fromEntries([...Object.entries(r.journey.seen)].reverse());assert.throws(()=>packNativeArticleSummary(r,'case',1));
 assert.equal(hooks,0);
});

test('ADR211 codec refuses nominal forged/proxy/shared/resizable/offset/extra views without hooks',()=>{
 const row=codecRow(),good=packNativeArticleSummary(row,'case',1);let hooks=0;
 const extra=new Uint32Array(good);Object.defineProperty(extra,'buffer',{get(){hooks++;throw 0;}});
 const ownBuffer=new Uint32Array(good);Object.defineProperty(ownBuffer.buffer,'resizable',{get(){hooks++;throw 0;}});
 class Foreign extends Uint32Array{}
 for(const p of [new Proxy(good,{get(){hooks++;throw 0;},getPrototypeOf(){hooks++;throw 0;},ownKeys(){hooks++;throw 0;}}),Object.create(Uint32Array.prototype),new Uint32Array(new SharedArrayBuffer(180)),new Uint32Array(new ArrayBuffer(180,{maxByteLength:360})),new Uint32Array(new ArrayBuffer(184),4,45),new Uint32Array(46),new Foreign(45),extra,ownBuffer])assert.throws(()=>unpackNativeArticleSummary(p,'case',1));
 for(const [index,value]of [[0,0],[1,1025],[2,33554433],[3,1025],[4,1025],[5,5],[6,actualJourneyCodes.length+1],[7,4097],[8,128],[9,4097],[16,4097],[26,4097],[39,3],[43,0],[44,3]]){const p=new Uint32Array(good);p[index]=value;assert.throws(()=>unpackNativeArticleSummary(p,'case',1));}
 assert.equal(hooks,0);assert.equal(JSON.stringify(unpackNativeArticleSummary(new Uint32Array(good),'case',1)),JSON.stringify(row)); // untrusted data, no private-proof claim
});

test('ADR211 skip await creates held and queued originals that must settle before helper revocation/normal close',async()=>{
 for(const rejected of [false,true]){
  const api=await import('./browser-capture.mjs?adr211-skip-drain-'+rejected),f=fixture(),late=lateDenials();let active;const fake=fakeBrowser(f,{status:503,lateOperations:late,onFresh(value){active=value;}}),rows=[],oldWorkers=fake.context.serviceWorkers;
  fake.context.serviceWorkers=()=>oldWorkers().map(worker=>{if(!worker.inventedSkipHook){worker.inventedSkipHook=true;const evaluate=worker.evaluate;worker.evaluate=async(fn,arg)=>{const result=await evaluate(fn,arg);if(arg?.method==='skip')late.start(active);return result;};}return worker;});
  const outcome=api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow:r=>rows.push(r)})).then(value=>({value}),error=>({error}));
  try{
   for(let n=0;n<(rejected?1:4);n++){await waitInvented(()=>late.articles.length===n+1);const row=late.articles[n];assert.equal(rows.length,n);assert.equal(fake.observation().pageCloseCalls,n);assert.equal(row.originals[0].dispatched,true);assert.equal(row.originals[1].dispatched,false);if(rejected){row.originals[0].reject(false);break;}row.originals[0].resolve();await waitInvented(()=>row.originals[1].dispatched);assert.equal(rows.length,n);assert.equal(fake.observation().pageCloseCalls,n);row.originals[1].resolve();}
   const result=await outcome;if(rejected){assert.ok(result.error);assert.equal(rows.length,0);assert.equal(fake.observation().pageCloseCalls,0);}else{assert.equal(rows.length,4);assert.equal(result.value.unavailable,4);assert.ok(rows.every(r=>r.reason==='article-unavailable'));api.releaseCapturedBatch(result.value);}
  }finally{late.release();fake.restore();}
 }
});

test('ADR211 every old CDP/PW/socket callback rejects after actual registry release and during next article without hooks',async()=>{
 const kinds=['Page.frameNavigated','Page.navigatedWithinDocument','Page.frameAttached','Page.frameDetached','Page.lifecycleEvent','Fetch.requestPaused','Network.responseReceived','Network.loadingFinished','Network.loadingFailed','Network.dataReceived','public','socket'];
 for(const when of ['released-row','next-article'])for(const kind of kinds){
  const api=await import('./browser-capture.mjs?adr211-stale-'+when+'-'+kind),f=fixture();let old,hooks=0,fired=false;const hostile=new Proxy({},{get(){hooks++;throw 0;},getPrototypeOf(){hooks++;throw 0;},ownKeys(){hooks++;throw 0;}});
  const fire=()=>{fired=true;if(kind==='public')old.page.emit('framenavigated',hostile);else if(kind==='socket')old.page.socketHandler(hostile);else old.session.emit(kind,hostile);};
  const fake=fakeBrowser(f,{status:503,onFresh(value){if(!old)old=value;else if(when==='next-article'&&!fired)fire();}}),rows=[];
  try{await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow(row){rows.push(row);if(when==='released-row'&&!fired)fire();}})));assert.equal(fired,true);assert.equal(hooks,0);assert.equal(rows.length,1);assert.equal(rows[0].status,'unavailable');assert.equal(fake.observation().nativeReads,0);assert.equal(fake.observation().retiredCount,1);assert.equal(api.captureFailureDiagnostic().primary.code,kind==='socket'?'late-websocket':kind==='Page.frameAttached'?'late-frame-attach':'late-article-callback');assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});}finally{fake.restore();}
 }
});

test('ADR211 trusted cleanup repetitions refuse finitely before nulled registry access',()=>{
 const f=terminalFrameFixture();f.s.retired=true;f.cb.retireChildPayload();f.cb.releaseRetired();f.s.childFrames=null;f.s.retirementDenials=null;
 assert.throws(()=>f.cb.retireChildPayload(),{code:'child-retirement'});assert.throws(()=>f.cb.releaseRetired(),{code:'retired-payload-live'});assert.equal(f.cb.retainedTerminalBytes(),392);f.coordinator.dispose();
});

test('ADR211 accounting DTO is closed, finite, mutually exclusive and below every unchanged envelope',async()=>{
 const base={schema:'native-specificity-capture-failure/v1',stage:'article-retirement',rpc:'Page.setLifecycleEventsEnabled',primary:{family:'unclassified',code:'unclassified'},cleanup:{family:'control-unavailable',code:'origin-representation-unavailable'},journeyWitness:null,timerWitness:null,infrastructureWitness:null,networkWitness:null,operationWitness:null,ownerNavigationWitness:null,navigationAccountingWitness:null};let max=0,valid=0;
 for(const site of ['fresh','within','public','read','seal','retire'])for(const state of ['active','sealed','retiring','released','unavailable'])for(const balance of ['matched','unmatched','unavailable'])for(const urlRelation of ['exact','different','blank','unavailable','not-examined']){
  const w={schema:'native-main-navigation-observation/v1',site,state,balance,urlRelation},allowed=((state==='unavailable')===(balance==='unavailable'))&&(state!=='released'||balance==='unmatched')&&(['within','public'].includes(site)?urlRelation!=='not-examined':urlRelation==='not-examined');
  if(allowed){const d=projectSpecificityCaptureDiagnostic({...base,navigationAccountingWitness:w});valid++;max=Math.max(max,Buffer.byteLength(JSON.stringify(d)));assert.ok(Object.isFrozen(d.navigationAccountingWitness));}else assert.throws(()=>projectSpecificityCaptureDiagnostic({...base,navigationAccountingWitness:w}),{code:'diagnostic-contract'});
 }
 assert.equal(valid,96);assert.ok(max<=700);let hooks=0;const w={schema:'native-main-navigation-observation/v1',site:'read',state:'active',balance:'unmatched',urlRelation:'not-examined'},getter={...w};Object.defineProperty(getter,'state',{get(){hooks++;throw 0;}});
 for(const value of [getter,new Proxy(w,{get(){hooks++;throw 0;},getPrototypeOf(){hooks++;throw 0;},ownKeys(){hooks++;throw 0;}}),{...w,extra:true},{...w,state:'unknown'}])assert.throws(()=>projectSpecificityCaptureDiagnostic({...base,navigationAccountingWitness:value}),{code:'diagnostic-contract'});
 assert.equal(hooks,0);assert.throws(()=>projectSpecificityCaptureDiagnostic({...base,primary:{family:'capture',code:'contract'},navigationAccountingWitness:w}),{code:'diagnostic-contract'});
 let wire;const dto=projectSpecificityCaptureDiagnostic({...base,navigationAccountingWitness:w}),boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:value=>{wire=value;},captureDiagnostic:()=>JSON.stringify(dto)});boundary.mark('browser-capture');await thrown(()=>boundary.run(()=>Promise.reject(false)));assert.ok(Buffer.byteLength(wire)<=900);assert.ok(Buffer.byteLength(wire)+31<=1024);
});

test('ADR209 earlier falsy/unrelated/other-owner/released originals and cleanup-first cannot borrow owner navigation witness',async()=>{
 const other=navOwner(),external=caughtNav(()=>other.owner.pageNavigation({},{} ,'about:blank')).error;assert.ok(other.owner.navigationWitnessFor(external));
 const released=navOwner(),releasedError=caughtNav(()=>released.owner.pageNavigation({},{} ,'about:blank')).error;released.owner.release();
 let index=0;
 for(const original of [...OWNER_NAV_FALSY,Error('unrelated'),external,releasedError]){
  const api=await import('./browser-capture.mjs?adr209-primary-'+index++),f=fixture(),fake=fakeBrowser(f);
  const close=fake.context.close;fake.context.close=async()=>{fake.fireMainNavigation();await close();};
  try{const actual=await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake,{onRow(){throw original;}})));assert.ok(Object.is(actual,original));assert.equal(api.captureFailureDiagnostic().ownerNavigationWitness,null);}
  finally{fake.restore();}
 }
 const api=await import('./browser-capture.mjs?adr209-cleanup-first'),f=fixture(),fake=fakeBrowser(f),close=fake.context.close;
 fake.context.close=async()=>{await close();throw external;};
 try{await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake)));assert.equal(api.captureFailureDiagnostic().ownerNavigationWitness,null);assert.equal(api.captureFailureDiagnostic().primary.code,'client-operation');}
 finally{fake.restore();other.owner.release();}
});
test('ADR209 owner DTO enforces exact correlations, zero hooks and maximal capture/driver bounds',async()=>{
 const base={schema:'native-specificity-capture-failure/v1',stage:'article-retirement',rpc:'Page.setLifecycleEventsEnabled',primary:{family:'article-owner',code:'article-navigation'},cleanup:{family:'control-unavailable',code:'origin-representation-unavailable'},journeyWitness:null,timerWitness:null,infrastructureWitness:null,networkWitness:null,operationWitness:null,ownerNavigationWitness:null,navigationAccountingWitness:null};
 const states=['unexamined','absent','provisional','authenticated','navigating','reading','retiring','terminal'],relations=['unexamined','blank','other','unavailable'];let valid=0,max=0;
 for(const predicate of ['pending','frame','target','state','repeat','url'])for(const state of states)for(const urlRelation of relations){
  const w=navWitness(predicate,state,urlRelation),allowed=['pending','frame'].includes(predicate)?state==='unexamined'&&urlRelation==='unexamined':
   predicate==='target'?state==='absent'&&relations.slice(1).includes(urlRelation):predicate==='state'?['provisional','authenticated','retiring','terminal'].includes(state)&&urlRelation==='unexamined':
    predicate==='repeat'?['navigating','reading'].includes(state)&&urlRelation==='unexamined':['navigating','reading'].includes(state)&&relations.slice(1).includes(urlRelation);
  if(allowed){const d=projectSpecificityCaptureDiagnostic({...base,ownerNavigationWitness:w});valid++;max=Math.max(max,Buffer.byteLength(JSON.stringify(d)));assert.ok(Object.isFrozen(d.ownerNavigationWitness));}
  else assert.throws(()=>projectSpecificityCaptureDiagnostic({...base,ownerNavigationWitness:w}),{code:'diagnostic-contract'});
 }
 assert.equal(valid,17);assert.ok(max<=700);let hooks=0;const w=navWitness('state','authenticated'),getter={...w};Object.defineProperty(getter,'state',{get(){hooks++;throw 0;}});
 for(const ownerNavigationWitness of [getter,new Proxy(w,{getPrototypeOf(){hooks++;throw 0;},ownKeys(){hooks++;throw 0;}}),{...w,extra:1},{...w,predicate:'secret'}])assert.throws(()=>projectSpecificityCaptureDiagnostic({...base,ownerNavigationWitness}),{code:'diagnostic-contract'});
 for(const primary of [{family:'capture',code:'contract'},{family:'article-owner',code:'navigation-journey'}])assert.throws(()=>projectSpecificityCaptureDiagnostic({...base,primary,ownerNavigationWitness:w}),{code:'diagnostic-contract'});
 assert.equal(hooks,0);let wire;
 const d=projectSpecificityCaptureDiagnostic({...base,ownerNavigationWitness:w}),boundary=createSpecificityDriverFailureBoundary({phase:'train-cal',emitFailure:b=>{wire=b;},captureDiagnostic:()=>JSON.stringify(d)});
 boundary.mark('browser-capture');await thrown(()=>boundary.run(()=>Promise.reject(new ArticleOwnerError('article-navigation'))));
 assert.ok(Buffer.byteLength(wire)<=900);assert.ok(Buffer.byteLength(wire)+31<=1024);
});

// Actual production bodies with invented private capabilities, not native proof.
async function graphHarness(){
 const h=await contextHarness({candidate:true});
 const text=await readFile(new URL('./browser-capture.mjs',import.meta.url),'utf8');
 const {NativeNetworkError}=await import('./network-policy.js');
 const {ControlFatal,ControlUnavailable}=await import('../../current-producer-final-v2/policy.js');
 Object.assign(h.env,{diagnosticLatched:false,diagnosticValue:null,diagnosticGetProto:Object.getPrototypeOf,diagnosticHasOwn:Object.hasOwn,
  diagnosticIsNativeError:types.isNativeError,diagnosticFloor:Math.floor,NativeNetworkError,ControlFatal,ControlUnavailable,PublicJourneyError,ArticleOwnerError,StartupFatal,
  diagnosticLabelIndex(value,labels,fallback){for(let i=0;i<labels.length;i++)if(value===labels[i])return i;return fallback;},
  UNKNOWN_NETWORK_EVENTS:Object.freeze({'unknown-network-response':'response','unknown-network-data':'data','unknown-loading-finished':'finished','unknown-network-failure':'failed'})});
 const tables=text.slice(text.indexOf('const NOMINAL_FAMILIES='),text.indexOf('const UNKNOWN_NETWORK_EVENTS='));
 const body=text.slice(text.indexOf('export function captureFailureDiagnostic(){'),text.indexOf('\nconst SUMMARY_KEYS=')).replaceAll('export ','');
 const api=runInNewContext("'use strict';\n"+tables+'\n'+body+'\n({record:recordFailure,get:captureFailureDiagnostic,index:diagnosticIndex,families:NOMINAL_FAMILIES,ends:NOMINAL_ENDS,names:NOMINAL_NAMES,prototypes:NOMINAL_PROTOTYPES})',h.env);
 return {...h,api};
}
function graphBegin(h,e,stage='article-read',rpc='worker.observe',cleanup=false){h.api.record(e,stage,rpc,cleanup,null,null,null,null,null,null,null,'begin');}
function graphFinish(h,e,cleanup=false,j=null,t=null,i=null,n=null,o=null,w=null,v=null){h.api.record(e,'ignored','ignored',cleanup,j,t,i,n,o,w,v,'finish');}
function graphCleanup(h,e){h.api.record(e,'ignored','ignored',true,null,null,null,null,null,null,null,'cleanup');}
function graphPool(h){return 1024+h.env.navigationSlots.slice(1).reduce((n,x)=>n+x,0);}
test('ADR215 actual word preserves closed dimensions and nominal before context and observers',async()=>{
 const h=await graphHarness();assert.equal(1+((206*22+21)*40+39)+182160*207,37889280);
 for(const p of [0,1,79,180,206])for(const s of [0,21])for(const r of [0,39])for(const c of [0,207]){
  const word=1+((p*22+s)*40+r)+182160*c;assert.ok(Number.isSafeInteger(word)&&word>0&&word<2**26);
  assert.equal(Math.floor(((word-1)%182160)/880),p);assert.equal(Math.floor(((word-1)%880)/40),s);assert.equal((word-1)%40,r);assert.equal(Math.floor((word-1)/182160),c);
 }
 const original=new NativeCaptureError('contract');graphBegin(h,original);assert.equal(typeof h.env.diagnosticValue,'number');assert.equal(h.api.get(),null);
 original.code='secret';h.call('selectPrimary',original,h.env.currentContextSymbol);assert.equal(h.call('fund','graph'),true);graphFinish(h,original);
 const dto=h.api.get();assert.deepEqual(JSON.parse(JSON.stringify(dto.primary)),{family:'capture',code:'contract'});assert.equal(dto.stage,'article-read');assert.equal(dto.rpc,'worker.observe');assert.ok(Object.isFrozen(dto)&&Object.isFrozen(dto.primary));assert.equal(h.api.get(),dto);
 const source=await readFile(new URL('./browser-capture.mjs',import.meta.url),'utf8'),remember=source.slice(source.indexOf(' function remember('),source.indexOf('\n function navigationCall('));
 assert.ok(remember.indexOf("'begin'")<remember.indexOf("'selectPrimary'"));assert.ok(remember.indexOf("'begin'")<remember.indexOf('readFailureWitness('));
});
test('ADR215 nominal index is descriptor-safe for falsy proxy getter subclass and forged errors',async()=>{
 const h=await graphHarness();let hooks=0;const error=new NativeCaptureError('contract'),hostile=new Proxy(error,{get(){hooks++;throw false;},getPrototypeOf(){hooks++;throw false;}});
 const getter=new NativeCaptureError('contract');Object.defineProperty(getter,'code',{get(){hooks++;throw false;}});class Sub extends NativeCaptureError{}
 for(const original of [...OWNER_NAV_FALSY,hostile,getter,new Sub('contract'),Object.assign(new Error('x'),{code:'contract'})])assert.equal(h.api.index(original),206);
 assert.equal(hooks,0);const source=await readFile(new URL('./browser-capture.mjs',import.meta.url),'utf8'),projection=source.slice(source.indexOf('function diagnosticIndex('),source.indexOf('function diagnosticFamily('));
 assert.equal(projection.includes('unknown='),false);assert.equal(projection.includes('Object.getOwnPropertyDescriptors'),false);
});
test('ADR215 cleanup before first funding owns total512 and preserves queued primary and cleanup',async()=>{
 const h=await graphHarness(),original=new NativeCaptureError('contract'),cleanup=new ArticleOwnerError('released');graphBegin(h,original,'launch','context.launch');graphCleanup(h,cleanup);
 assert.equal(h.env.phase&(8|512),8|512);assert.equal(Math.floor((h.env.diagnosticValue-1)/182160),h.api.index(cleanup)+1);
 const queued=h.env.diagnosticValue;graphCleanup(h,new Error('later'));assert.equal(h.env.diagnosticValue,queued);
 h.call('selectPrimary',original,h.env.currentContextSymbol);graphFinish(h,original);const dto=h.api.get();
 assert.equal(dto.primary.code,'contract');assert.equal(dto.cleanup.code,'released');assert.equal(dto.stage,'launch');assert.equal(dto.rpc,'context.launch');
 const old=dto;graphCleanup(h,new Error('cannot replace'));assert.equal(h.api.get(),old);
});
test('ADR215 ready cleanup preserves issued immutable graph and denied upgrade never retries',async()=>{
 for(const denied of [false,true]){
  const h=await graphHarness(),original=new NativeCaptureError('contract');graphBegin(h,original);h.call('selectPrimary',original,h.env.currentContextSymbol);graphFinish(h,original);
  const first=h.api.get();assert.equal(first.cleanup,null);if(denied)h.setOwner(32768-768-graphPool(h)-256);
  graphCleanup(h,new Error('cleanup'));const next=h.api.get();assert.ok(Object.isFrozen(first));assert.equal(first.cleanup,null);
  if(denied){assert.equal(next,first);h.setOwner(0);graphCleanup(h,new Error('retry'));assert.equal(h.api.get(),first);assert.equal(h.env.phase&512,0);}
  else{assert.notEqual(next,first);assert.equal(next.primary,first.primary);assert.equal(next.cleanup.code,'unclassified');assert.ok(Object.isFrozen(next.cleanup));assert.equal(h.env.phase&512,512);}
 }
});
test('ADR215 actual graph256 cleanup512 and transport leases have exact32768 boundaries and sticky attempts',async()=>{
 for(const requested of ['graph','cleanup'])for(const over of [0,1]){
  const h=await contextHarness({candidate:true}),bytes=requested==='graph'?256:512;h.call('selectPrimary',{},h.env.currentContextSymbol);h.setOwner(32768-768-graphPool(h)-bytes+over);
  assert.equal(h.call('fund',requested),over===0);assert.equal(h.env.packed,0);assert.equal(h.env.bound,undefined);assert.equal(h.env.phase&16384,0);
  if(over){h.setOwner(0);assert.equal(h.call('fund',requested),false);if(requested==='graph')assert.equal(h.call('fund','cleanup'),false);}else{assert.equal(h.env.phase&8,8);if(requested==='cleanup')assert.equal(h.env.phase&512,512);}
 }
 for(const family of ['unclassified','public-journey'])for(const over of [0,1]){
  const h=await contextHarness({candidate:true}),wire=family==='public-journey'?2560:3072;
  h.env.diagnosticValue=Object.freeze({...h.env.diagnosticValue,primary:Object.freeze({family,code:family==='public-journey'?'blank-loader':'unclassified'})});
  h.call('selectPrimary',{},h.env.currentContextSymbol);assert.equal(h.call('fund','cleanup'),true);h.setOwner(32768-768-graphPool(h)-512-wire+over);
  assert.equal(h.call('emit','train-cal','browser-capture',()=>false),over===0);assert.equal(h.env.phase&8192,8192);
  assert.equal(h.env.phase&(2048|4096),over?0:family==='public-journey'?4096:2048);h.call('release');assert.equal(h.env.phase&512,512);
  assert.equal(h.call('emit','train-cal','browser-capture',()=>assert.fail('retry')),false);
 }
});
test('ADR215 fold refuses recursion and revoked partial sum with no foreign map hooks',async()=>{
 const h=await contextHarness({candidate:true});h.call('selectPrimary',{},h.env.currentContextSymbol);
 h.env.owner.retainedBytes=()=>{assert.equal(h.call('fund','cleanup'),false);h.call('release');return 0;};
 assert.equal(h.call('fund','graph'),false);assert.equal(h.env.phase&8,0);assert.equal(h.env.packed,0);assert.equal(h.env.bound,undefined);assert.equal(h.env.phase&16384,0);
 const clean=await contextHarness({candidate:true});let hooks=0;const hostile=new Proxy({},{get(){hooks++;throw false;},getPrototypeOf(){hooks++;throw false;}});
 assert.throws(()=>clean.call(hostile,'key',new Map()));assert.equal(hooks,0);
});
test('ADR215 captured prototype refuses inherited serializer despite replacement globalObject',async()=>{
 const h=await contextHarness({candidate:true});h.call('selectPrimary',{},h.env.currentContextSymbol);assert.equal(h.call('fund','graph'),true);
 const fakePrototype={};Object.defineProperty(fakePrototype,'toJSON',{get(){assert.fail('prototype getter');}});
 // Isolated native-descriptor seam; no mutation of global prototypes.
 h.env.diagnosticObjectPrototype=fakePrototype;h.env.Object={prototype:{}};
 let calls=0;assert.equal(h.call('emit','train-cal','browser-capture',()=>{calls++;}),false);assert.equal(calls,0);assert.equal(h.env.phase&2048,2048);
});
test('ADR215 direct adoption avoids clones and actual network failure retains callback backing through cleanup',async()=>{
 const source=await readFile(new URL('./browser-capture.mjs',import.meta.url),'utf8'),body=source.slice(source.indexOf('function recordFailure('),source.indexOf('\nconst SUMMARY_KEYS='));
 for(const name of ['projectSpecificityCaptureDiagnostic(','projectJourneyWitness(','projectNetworkWitness(','projectInfrastructureWitness(','Object.values(','...diagnosticValue'])assert.equal(body.includes(name),false,name);
 const api=await import('./browser-capture.mjs?adr215-network-backing'),f=fixture(),fake=fakeBrowser(f,{causalResponse:true,localImageEvents(session,n){
  session.emit('Network.responseReceived',dataImageResponse({requestId:'unknown-'+n,frameId:'frame-'+n,loaderId:'loader-'+n},{url:'https://unowned.invalid/private-content'}));
 }});
 try{const original=await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(f,fake)));assert.equal(original.code,'unknown-network-response');const dto=api.captureFailureDiagnostic();
  assert.ok(dto.networkWitness&&Object.isFrozen(dto.networkWitness));assert.equal(fake.observation().retiredCount,0);assert.equal(api.captureFailureDiagnostic(),dto);assert.deepEqual(fake.counts(),{contextCloses:1,browserCloses:1});
 }finally{fake.restore();}
});
test('ADR215 construction projection failure is sticky-null and cannot erase an issued ready graph',async()=>{
 const h=await graphHarness(),original=new NativeCaptureError('contract');graphBegin(h,original);h.call('selectPrimary',original,h.env.currentContextSymbol);
 h.env.diagnosticFreeze=()=>{throw false;};graphFinish(h,original);assert.equal(h.api.get(),null);assert.equal(h.env.diagnosticValue,null);assert.equal(h.env.phase&8,8);
 h.env.diagnosticFreeze=Object.freeze;graphFinish(h,original);assert.equal(h.api.get(),null);
 const r=await graphHarness();graphBegin(r,original);r.call('selectPrimary',original,r.env.currentContextSymbol);graphFinish(r,original);const ready=r.api.get();
 r.env.diagnosticFreeze=()=>{throw undefined;};graphCleanup(r,new Error('cleanup'));assert.equal(r.api.get(),ready);assert.equal(r.env.phase&512,512);
});

async function rememberHarness(h){
 const source=await readFile(new URL('./browser-capture.mjs',import.meta.url),'utf8');
 const body=source.slice(source.indexOf(' function remember('),source.indexOf('\n function navigationCall('));
 Object.assign(h.env,{navigationCall:h.call,rememberedLatched:false,rememberedError:undefined,diagnosticStage:'article-read',diagnosticRpc:'worker.observe',
  infrastructureCandidate:null,networkCandidate:null,operationCandidate:null,ownerNavigationCandidate:null,journeyCandidate:null,networkWitnessReader:null,
  infrastructure:{readFailureWitness(){return null;}},coordinator:{operationWitnessFor(){return null;},timerWitnessFor(){return null;}}});
 h.env.owner.navigationWitnessFor=()=>null;
 const remember=runInNewContext("'use strict';\n("+body+")",h.env);h.env.remember=remember;return remember;
}
test('ADR215 all207 nominal entries and exact v4 prototypes match actual allowlists without copied-roster drift',async()=>{
 const h=await graphHarness(),source=await readFile(new URL('./browser-capture.mjs',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('const FAILURE_CODES='),source.indexOf('const NOMINAL_FAMILIES='));
 const actual=runInNewContext("'use strict';\n(()=>{"+body+";return FAILURE_CODES;})()",{JOURNEY_CODES:actualJourneyCodes});
 const constructors=[StartupFatal,NativeCaptureError,ArticleOwnerError,PublicJourneyError,h.env.NativeNetworkError,h.env.ControlFatal,h.env.ControlUnavailable];
 let index=0,family=0;for(const name of Object.keys(actual)){
  assert.equal(h.api.families[family],name);if(family<7)assert.equal(h.api.prototypes[family],constructors[family].prototype);
  for(const code of actual[name]){assert.equal(h.api.names[index],code);const error=family===7?new Error('unknown'):new constructors[family](code);assert.equal(h.api.index(error),index);index++;}
  assert.equal(h.api.ends[family],index);family++;
 }
 assert.equal(index,207);assert.equal(family,8);
});
test('ADR215 actual observer reentry preserves nominal stage RPC and queues cleanup before final word read',async()=>{
 const h=await graphHarness(),remember=await rememberHarness(h),original=new NativeCaptureError('contract'),cleanup=new ArticleOwnerError('released');
 h.env.infrastructure.readFailureWitness=()=>{assert.equal(h.api.get(),null);original.code='late-main-response';h.env.diagnosticStage='cleanup-browser';h.env.diagnosticRpc='browser.close';remember(cleanup,true);remember(new Error('later'),false);return null;};
 remember(original);const dto=h.api.get();assert.equal(dto.primary.code,'contract');assert.equal(dto.stage,'article-read');assert.equal(dto.rpc,'worker.observe');assert.equal(dto.cleanup.code,'released');
 assert.equal(h.env.rememberedError,original);assert.equal(h.env.phase&(8|512),8|512);
});
test('ADR215 released old callable restores only absent bridge and invalidates active binding for equal falsy originals',async()=>{
 const old=await graphHarness(),remember=await rememberHarness(old);old.env.lifecycle.closed=true;old.env.lifecycle.released=true;old.env.activeBatch=null;old.env.current=null;old.env.contextBridge=null;
 const original=false;remember(original);assert.equal(old.env.contextBridge,old.call);assert.ok(old.api.get());assert.equal(old.api.get().navigationAccountingWitness,null);
 for(const value of [false,NaN,-0,undefined]){
  const previous=await graphHarness(),rememberOld=await rememberHarness(previous),current=await contextHarness({candidate:true});
  current.call('navigation',value,current.env.currentContextSymbol,'public','active','unmatched','exact');
  previous.env.lifecycle.closed=true;previous.env.lifecycle.released=true;previous.env.activeBatch={};previous.env.current=null;previous.env.contextBridge=current.call;
  rememberOld(value);assert.equal(previous.env.contextBridge,current.call);assert.equal(current.env.view,null);assert.equal(current.env.phase&3,2);assert.equal(current.env.phase&8,8);
  assert.equal(previous.api.get().navigationAccountingWitness,null);
 }
 const inconsistent=await graphHarness(),rememberBad=await rememberHarness(inconsistent);inconsistent.env.contextBridge=null;rememberBad(new Error('inconsistent'));
 assert.equal(inconsistent.env.contextBridge,null);assert.equal(inconsistent.api.get(),null);assert.equal(inconsistent.env.diagnosticLatched,true);
});
test('ADR215 actual older released batch cannot replace a newer active collector bridge or lend its context',async()=>{
 const api=await import('./browser-capture.mjs?adr215-active-bridge'),first=fixture(),old=fakeBrowser(first);let next;
 try{const prior=await api.captureNativeSpecificityBatch(captureArgs(first,old));api.releaseCapturedBatch(prior);
  const second=fixture(1);next=fakeBrowser(second,{onFresh(){old.fireLateAttach();}});
  const original=await thrown(()=>api.captureNativeSpecificityBatch(captureArgs(second,next)));assert.equal(original.code,'late-frame-attach');
  const dto=api.captureFailureDiagnostic();assert.equal(dto.stage,'late-callback');assert.equal(dto.primary.code,'late-frame-attach');assert.equal(dto.navigationAccountingWitness,null);
  assert.equal(await thrown(()=>api.assertCaptureHealthy()),original);assert.equal(next.observation().nativeReads,0);assert.deepEqual(next.counts(),{contextCloses:1,browserCloses:1});
 }finally{next?.restore();old.restore();}
});
test('ADR215 actual local terminal failure revokes without secondary report and real flags precede special abort',async()=>{
 const api=await import('./browser-capture.mjs?adr215-no-secondary'),f=fixture(),fake=fakeBrowser(f,{causalResponse:true,localImageEvents(session,n){session.emit('Network.responseReceived',dataImageResponse({requestId:'local-'+n,frameId:'frame-'+n,loaderId:'loader-'+n}));}});
 try{await assert.rejects(api.captureNativeSpecificityBatch(captureArgs(f,fake)),{code:'local-image-unsettled'});const dto=api.captureFailureDiagnostic();assert.ok(dto);assert.equal(dto.primary.code,'local-image-unsettled');
  let emitted;assert.equal(api.emitCaptureFailureDiagnostic('train-cal','browser-capture',b=>{emitted=b;}),true);assert.ok(emitted.length<=900);assert.equal(JSON.parse(emitted).capture.primary.code,'local-image-unsettled');
 }finally{fake.restore();}
 const source=await readFile(new URL('./browser-capture.mjs',import.meta.url),'utf8'),line=source.split('\n').find(s=>s.includes('const fail=(e,cleanup=false)'));
 assert.ok(line.indexOf('fatalLatched=true')<line.indexOf("abort('phase-failed')"));assert.ok(line.indexOf('phaseFailureLatched=true')<line.indexOf("abort('phase-failed')"));
});
test('ADR215 pre-observed Promise and hostile returns have zero new hooks and retained buffers never refund',async()=>{
 for(const kind of ['promise','thenable','throw']){
  const h=await contextHarness({candidate:true});h.call('selectPrimary',{},h.env.currentContextSymbol);assert.equal(h.call('fund','graph'),true);let hooks=0,first;
  const promise=Promise.reject(false);promise.catch(()=>{});
  assert.equal(h.call('emit','train-cal','browser-capture',bytes=>{first=bytes;assert.equal(h.call('emit','train-cal','browser-capture',()=>assert.fail('nested')),false);if(kind==='promise')return promise;if(kind==='throw')throw NaN;return {get then(){hooks++;throw false;}};}),true);
  assert.ok(Buffer.isBuffer(first));const bytes=Buffer.from(first);h.call('release');assert.deepEqual(first,bytes);assert.equal(h.env.phase&2048,2048);assert.equal(hooks,0);
 }
});
