import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Resolver} from 'node:dns/promises';
import {PublicFetchError} from '../../../../../apps/local-service/src/crawler/public-fetch.js';
import {buildSpecificityManifest,deriveBatchNetworkScope,digest} from './manifest.js';
import {compileSpecificityNetworkScope,compileNativeDnsPins,describeNativeDnsPins,selectNativeDnsPin,createNativeArticleNetworkGate,admitNativePageRequest,admitNativeMainResponse,verifyNativeNavigationLoader,NATIVE_RESOURCE_ORIGINS} from './network-policy.js';
import {resolveNativeStudyDns} from './dns-resolver.js';
import {collectOriginPolicies} from './origin-policy.js';
import {createNativeReaderTransfer} from './native-adapter.js';
import * as urlPolicy from '../../../browser/core/page-content-policy.js';
import {createPageContentReader} from '../../../browser/chromium/page-content-reader.js';
import {createInfrastructurePolicy,StartupFatal} from '../exact-browser-infrastructure-v1/compatibility-variant.mjs';
import {createArticleOwner} from './article-owner.mjs';
import {createPublicJourney,FACTS,REPLAY_CATEGORIES} from '../native-specificity-public-journey-v2/journey.mjs';
import {captureNativeSpecificityBatch,releaseCapturedBatch,createNativeCaptureCoordinator,createPublicArticleCallbacks,projectNativeDomPolicy,projectSpecificityCaptureDiagnostic,createPlaywrightChildFrameGraph,createJourneyFailureWitness} from './browser-capture.mjs';
import {createSpecificityDriverFailureBoundary} from './driver.mjs';
// The shared offline guard does not patch Resolver.prototype. Explicitly deny
// ALL real resolver methods in this test realm; every DNS seam below is fake.
const realResolverMethods=Object.fromEntries(['resolve4','resolve6','cancel'].map(k=>[k,Resolver.prototype[k]]));
for(const k of Object.keys(realResolverMethods))Resolver.prototype[k]=()=>{throw new Error('Real DNS forbidden by invented test');};
after(()=>{for(const [k,v]of Object.entries(realResolverMethods))Resolver.prototype[k]=v;});

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
function fakeBrowser(f,{unsupportedOrdinal=null,missingHeadOrdinal=null,nativeThrowOrdinal=null,status=200,peer='8.8.8.8',security='secure',responseFirst=false,causalResponse=false,causalMissingNetwork=false,responseOriginal=null,deniedResourceErrorText=null,retirementErrorText=null,retirementOriginalFactory=null,retirementDestroyFirst=false,lateOldRetirement=false,childLifecycle=false,teardownEvents=false,lateOldAttach=false,lateOldSocket=false,responseHeaders=[],longIds=false,childMode=null,pwChildMode=null,lateOldChild=false,missingParentDestroy=false,lingerParent=false,journeyFaultSite=null,initialBlankIdle=null,frameEvent=value=>value,afterPageClose=()=>{}}={}){
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
 const oldPages=[],transport=[];let retiredCount=0;
 ctx.newPage=async()=>{const n=++next,id=pad('article-'+n),page=new EventEmitter(),frame={};let url='about:blank';frame.url=()=>url;frame.page=()=>page;page.mainFrame=()=>frame;page.url=()=>url;page.bringToFront=async()=>{c.state.tabId=10+n;};page.routeWebSocket=async(_,handler)=>{page.socketHandler=handler;};
  const t=info(id,'page',url,false);targets.set(id,t);ctx.emit('page',page);root.emit('Target.targetCreated',{targetInfo:t});
  let navigateResolve,retirementOriginal,retirementFulfilled=false;
  const session=new EventEmitter();
  function response(){session.emit('Network.responseReceived',{requestId:pad('net-'+n),frameId:pad('frame-'+n),loaderId:pad((journeyFaultSite==='response'?'blank-':'loader-')+n),type:'Document',response:{url,status,remoteIPAddress:peer,securityState:security,mimeType:'text/html'}});}
  function fresh(){session.emit('Page.frameNavigated',frameEvent(typedNavigation({id:pad('frame-'+n),url,loaderId:pad((journeyFaultSite==='commit'?'blank-':'loader-')+n)})));}
  function dcl(){session.emit('Page.lifecycleEvent',{frameId:pad('frame-'+n),loaderId:pad((journeyFaultSite==='lifecycle'?'blank-':'loader-')+n),name:'DOMContentLoaded',timestamp:1});}
  session.send=(method,args)=>{
   transport.push(method);
   if(method==='Target.getTargetInfo'){t.attached=true;return {targetInfo:{...t}};}
   if(method==='Page.getFrameTree')return {frameTree:{frame:{id:pad('frame-'+n),loaderId:url==='about:blank'?pad('blank-'+n):pad('loader-'+n),url}}};
   if(method==='Page.navigate'){
    const held=causalResponse?new Promise(resolve=>{navigateResolve=resolve;}):null;
    url=args.url;t.url=url;c.state.url=url;root.emit('Target.targetInfoChanged',{targetInfo:{...t}});page.emit('framenavigated',frame);
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
   if(method==='Fetch.continueResponse'){if(causalResponse){if(!causalMissingNetwork)response();fresh();dcl();navigateResolve({frameId:pad('frame-'+n),loaderId:pad('loader-'+n)});}
    session.emit('Network.loadingFinished',{requestId:pad('net-'+n),timestamp:1,encodedDataLength:128});if(childMode){session.emit('Page.frameAttached',{frameId:pad('child-'+n),parentFrameId:pad('frame-'+n)});
     if(childLifecycle)session.emit('Page.lifecycleEvent',{frameId:pad('child-'+n),loaderId:pad('child-loader-'+n),name:'init',timestamp:1});
     session.emit('Page.frameNavigated',typedNavigation({id:pad('child-'+n),parentId:pad('frame-'+n),url,loaderId:pad('child-loader-'+n)}));
     if(childLifecycle){session.emit('Page.frameAttached',{frameId:pad('nested-'+n),parentFrameId:pad('child-'+n)});session.emit('Page.lifecycleEvent',{frameId:pad('nested-'+n),loaderId:pad('nested-loader-'+n),name:'init',timestamp:1});session.emit('Page.frameNavigated',typedNavigation({id:pad('nested-'+n),parentId:pad('child-'+n),url,loaderId:pad('nested-loader-'+n)}));session.emit('Page.lifecycleEvent',{frameId:pad('nested-'+n),loaderId:pad('nested-loader-'+n),name:'DOMContentLoaded',timestamp:1});}}
    if(pwChildMode){const child={page(){return pwChildMode==='crosspage'?{}:page;},parentFrame(){return frame;},url(){throw Error('child URL must never be read');}};page.child=child;page.emit('framenavigated',child);if(pwChildMode==='same-parent')page.emit('framenavigated',child);}
    if(responseOriginal!==null)return responseOriginal;
   }
   if(method==='Fetch.failRequest'){
    if(args.requestId===pad('retiring-fetch-'+n)){
     retirementOriginal=retirementOriginalFactory?retirementOriginalFactory():new Promise(resolve=>queueMicrotask(resolve));
     retirementOriginal.then(()=>{retirementFulfilled=true;},()=>{});
     session.emit('Network.loadingFailed',{requestId:pad('retiring-net-'+n),errorText:retirementErrorText,canceled:false,blockedReason:'inspector'});return retirementOriginal;
    }
    session.emit('Network.loadingFailed',{requestId:pad(args.requestId===pad('denied-fetch-'+n)?'denied-net-'+n:'net-'+n),errorText:deniedResourceErrorText??'net::ERR_BLOCKED_BY_CLIENT',canceled:false,blockedReason:'inspector'});
   }return Promise.resolve({});
  };
  page.session=session;page.close=async()=>{
   if(retirementErrorText!==null){session.emit('Fetch.requestPaused',{requestId:pad('retiring-fetch-'+n),networkId:pad('retiring-net-'+n),frameId:pad('frame-'+n),resourceType:'Image',request:{url,method:'GET',headers:{}}});assert.ok(retirementOriginal,'close must dispatch the actual denial');
    if(retirementDestroyFirst){targets.delete(id);root.emit('Target.targetDestroyed',{targetId:id});retiredCount++;}await retirementOriginal;assert.equal(retirementFulfilled,true);}
   if(childMode==='removed'||childMode==='duplicate'||childMode==='swap'||childMode==='unknown')session.emit('Page.frameDetached',{frameId:pad((childMode==='unknown'?'unknown-child-':'child-')+n),reason:childMode==='swap'?'swap':'remove'});
   if(childMode==='duplicate')session.emit('Page.frameDetached',{frameId:pad('child-'+n),reason:'remove'});
   if(teardownEvents){session.emit('Page.lifecycleEvent',{frameId:pad('frame-'+n),loaderId:pad('loader-'+n),name:'networkIdle',timestamp:1});session.emit('Network.loadingFailed',{requestId:pad('net-'+n),errorText:'net::ERR_ABORTED',canceled:true});session.emit('Page.frameDetached',{frameId:pad('frame-'+n),reason:'remove'});}
   if(n>1&&lateOldAttach)oldPages[0].session.emit('Page.frameAttached',{frameId:'late-child',parentFrameId:'frame-1'});
   if(n>1&&lateOldChild)oldPages[0].emit('framenavigated',oldPages[0].child);
   if(n>1&&lateOldSocket)oldPages[0].socketHandler({close(){throw Error('must not attribute old socket to new article');}});
   if(n>1&&lateOldRetirement)oldPages[0].session.emit('Fetch.requestPaused',{requestId:'old-retirement-fetch',networkId:'old-retirement-net',frameId:'frame-1',resourceType:'Image',request:{url,method:'GET',headers:{}}});
   if(!lingerParent)targets.delete(id);if(!missingParentDestroy&&!retirementDestroyFirst){root.emit('Target.targetDestroyed',{targetId:id});retiredCount++;}afterPageClose();};oldPages.push(page);return page;
 };
 ctx.newCDPSession=async page=>page===anchor?{async send(){return {targetInfo:anchorInfo};}}:page.session;
 return {context:ctx,root,chromium:{async launchPersistentContext(_,options){assert.equal(options.serviceWorkers,'block');return ctx;}},counts:()=>({contextCloses,browserCloses}),
  observation:()=>({nativeReads:c.state.read,retiredCount,transport:[...transport]}),
  fireLateAttach(){oldPages[0].session.emit('Page.frameAttached',{frameId:'late-child',parentFrameId:'frame-1'});},
  restore(){for(const [k,v]of Object.entries(previous)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}};
}
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
function callbackFixture(coordinatorOptions={}){const f=fixture(),url=f.batch.cases[0].url,token={},errors=[],sent=[],s={token,url,frameId:'frame',retiring:false,retired:false,refusal:null,encodedBytes:0,paused:null,network:null,responseStarted:false,mainNetworkId:null};
 s.gate=createNativeArticleNetworkGate({dnsPins:f.dnsPins,caseUrl:url,frameId:'frame'});s.journey=createPublicJourney({incarnation:token,url,frameId:'frame',blankLoaderId:'blank',until:20000,clock:()=>0,guard:()=>{},onFailure(){}});
 s.session={send(method,args){sent.push({method,args});return Promise.resolve();}};
 const coordinator=createNativeCaptureCoordinator({guard:()=>{},clock:()=>0,onFailure:e=>errors.push(e),...coordinatorOptions}),cb=createPublicArticleCallbacks({state:s,coordinator,owner:{commit(){}},guard:()=>{},clock:()=>0,countEvent(){},onFatal:e=>errors.push(e)});
 s.journey.begin(token);const request=(requestId='request')=>({requestId,networkId:'net',frameId:'frame',resourceType:'Document',request:{url,method:'GET',headers:{}}});
 const paused=(status=200)=>({...request('response'),responseStatusCode:status,responseHeaders:[]}),network=(status=200,patch={})=>({requestId:'net',frameId:'frame',loaderId:'loader',type:'Document',response:{url,status,remoteIPAddress:'8.8.8.8',securityState:'secure',mimeType:'text/html',...patch}});
 return {s,cb,errors,sent,coordinator,request,paused,network,token,url};}
test('typed metadata-rich Navigation projects ONE whole detached frame to owner/journey/witness',()=>{
 const f=callbackFixture(),raw=typedNavigation({id:'frame',loaderId:'loader',url:f.url}),actual=f.s.journey;let owned,witnessed,committed;
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
 for(const input of inputs){const f=callbackFixture();let calls=0;const cb=createPublicArticleCallbacks({state:f.s,coordinator:f.coordinator,owner:{commit(){calls++;}},guard(){},clock:()=>0,countEvent(){},onFatal:e=>f.errors.push(e)});
  cb.frameNavigated(input);assert.equal(calls,0);assert.equal(f.errors[0].code,'descriptor');assert.equal(f.s.journey.snapshot().seen.commit,false);f.coordinator.dispose();}
 assert.equal(hooks,0);
});

test('typed child retains parent restrictions; wrong frame/loader/URL/late/duplicate stay fatal and owner ordering is unchanged',()=>{
 const child=callbackFixture();child.cb.frameAttached({frameId:'child',parentFrameId:'frame'});child.cb.frameNavigated(typedNavigation({id:'child',parentId:'frame',loaderId:'child-loader',url:child.url}));
 assert.equal(child.errors.length,0);assert.equal(child.s.refusal,'restricted-rendering');assert.equal(child.s.journey.snapshot().seen.commit,false);child.coordinator.dispose();
 for(const patch of [{id:'wrong'},{loaderId:'blank'},{url:'https://other.org/invented'},{parentId:'unknown'}]){const f=callbackFixture();f.cb.frameNavigated(typedNavigation({id:'frame',loaderId:'loader',url:f.url,...patch}));assert.ok(f.errors.length);assert.equal(f.s.journey.snapshot().seen.commit,false);f.coordinator.dispose();}
 for(const state of ['retiring','retired']){const f=callbackFixture();f.s[state]=true;f.cb.frameNavigated(typedNavigation({id:'frame',loaderId:'loader',url:f.url}));assert.ok(f.errors.length);assert.equal(f.s.journey.snapshot().seen.commit,false);f.coordinator.dispose();}
 const duplicate=callbackFixture();duplicate.cb.frameNavigated(typedNavigation({id:'frame',loaderId:'loader',url:duplicate.url}));duplicate.cb.frameNavigated(typedNavigation({id:'frame',loaderId:'loader',url:duplicate.url}));assert.equal(duplicate.errors[0].code,'duplicate');duplicate.coordinator.dispose();
 const f=callbackFixture(),ownerError=new Error('invented owner fault'),journeyError=new Error('invented journey fault'),order=[];let ownerValue,journeyValue;
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

test('timer witness projection is closed/zero hooks, under700B, with no attribution to earlier faults',()=>{
 const base={schema:'native-specificity-capture-failure/v1',stage:'article-retirement',rpc:'Page.setLifecycleEventsEnabled',primary:{family:'capture',code:'article-deadline'},cleanup:{family:'control-unavailable',code:'origin-representation-unavailable'},journeyWitness:null};
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
 const value={schema:'native-specificity-capture-failure/v1',stage:'article-read',rpc:'worker.observe',primary:{family:'capture',code:'contract'},cleanup:null,journeyWitness:null,timerWitness:null};
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
 const d={schema:'native-specificity-capture-failure/v1',stage:'article-retirement',rpc:'Page.setLifecycleEventsEnabled',primary:{family:'public-journey',code:'continuation-rejected'},cleanup:{family:'control-unavailable',code:'origin-representation-unavailable'},journeyWitness:witness,timerWitness:null};
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

function retirementFixture(options={}){const f=callbackFixture(options);f.s.retiring=true;f.s.closeIssued=true;f.s.mainNetworkId='net';
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
 const g=retirementFixture();const cb=createPublicArticleCallbacks({state:g.s,coordinator:g.coordinator,owner:{commit(){}},guard(){let bytes=32600+128;for(const [networkId,row]of g.s.retirementDenials)bytes+=192+networkId.length+row.fetchId.length+row.frameId.length+8;if(bytes>32768)throw Error('invented aggregate registry capacity');},clock:()=>0,countEvent(){},onFatal:e=>g.errors.push(e)});cb.paused(g.late());assert.equal(g.s.retirementDenials.size,1);assert.equal(g.sent.length,0);assert.ok(g.errors.length);g.coordinator.dispose();
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
 f.s.retiring=true;f.s.closeIssued=true;f.cb.frameDetached({frameId:'child',reason:'remove'});assert.equal(f.s.childFrames.get('child').status,'removed');f.cb.frameDetached({frameId:'child',reason:'remove'});assert.ok(f.errors.length);f.coordinator.dispose();
 for(const kind of ['parent','duplicate','capacity']){const x=callbackFixture();if(kind==='capacity')for(let n=0;n<16;n++)x.cb.frameAttached({frameId:'child-'+n,parentFrameId:'frame'});else if(kind==='duplicate')x.cb.frameAttached({frameId:'child',parentFrameId:'frame'});x.cb.frameAttached({frameId:kind==='capacity'?'child-16':'child',parentFrameId:kind==='parent'?'unknown':'frame'});assert.ok(x.errors.length);x.coordinator.dispose();}
 const x=callbackFixture();x.s.retiring=true;x.s.closeIssued=true;x.cb.frameDetached({frameId:'frame',reason:'remove'});assert.equal(x.errors.length,0);x.cb.frameDetached({frameId:'frame',reason:'remove'});assert.equal(x.errors[0].code,'main-frame-detached');x.coordinator.dispose();
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
