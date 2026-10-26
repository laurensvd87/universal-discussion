import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {FIXED_CASES} from './native-adapter.js';
import {compileNativeDnsPins,NATIVE_DNS_HOSTS,createNativeArticleNetworkGate} from './network-policy.js';
import {captureNativeBrowserStudy,createNativeCaptureCoordinator,createNativeArticleCallbacks,projectNativeDomPolicy,validateNativeRightsEvidence} from './browser-capture.mjs';
const H='a'.repeat(64),hash=x=>createHash('sha256').update(x).digest('hex'),copy=x=>JSON.parse(JSON.stringify(x));
const tick=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
function eventSource(){const map=new Map();return {on(name,callback){if(!map.has(name))map.set(name,[]);map.get(name).push(callback);},emit(name,value){for(const fn of map.get(name)??[])fn(value);}};}
const dns=()=>compileNativeDnsPins({rows:NATIVE_DNS_HOSTS.map(host=>({host,status:'pinned',answers:[{address:'1.1.1.1',family:4}]}))});
function callbacksFixture(){
 let fatal=null;const calls=[],url=FIXED_CASES[0].url,state={url,frameId:'f',blankLoaderId:'initial-blank-loader',session:{send:async(method,args)=>{calls.push({method,args});}},
  gate:createNativeArticleNetworkGate({dnsPins:dns(),caseUrl:url,frameId:'f'}),until:20000,stopping:false,fatal:null,refusal:null,mainNetworkId:null,
  pausedMain:null,networkMain:null,responseStarted:false,responseContinued:false,provisional:null,journey:null,committed:null,dcl:null,resourceFailures:0,encodedBytes:0};
 const fail=e=>{fatal??=e;state.fatal??=e;},guard=()=>{if(fatal)throw fatal;};
 const coordinator=createNativeCaptureCoordinator({guard,clock:()=>0,until:()=>state.until,onFailure:fail});
 const cb=createNativeArticleCallbacks({state,coordinator,guard,clock:()=>0,countEvent:()=>{},onFatal:fail});
 const request=()=>({requestId:'fetch-request',networkId:'network',frameId:'f',resourceType:'Document',request:{url,method:'GET',headers:{}}});
 const response=()=>({requestId:'fetch-response',networkId:'network',frameId:'f',resourceType:'Document',request:{url,method:'GET',headers:{}},responseStatusCode:200,responseHeaders:[{name:'content-type',value:'text/html'}]});
 const network=()=>({requestId:'network',frameId:'f',loaderId:'l',response:{url,status:200,remoteIPAddress:'1.1.1.1',securityState:'secure',mimeType:'text/html'}});
 return {state,coordinator,cb,calls,request,response,network,fatal:()=>fatal};
}
test('actual callbacks continue validated response BEFORE navigation RPC settles, then require independent loader',async()=>{
 const f=callbacksFixture();let resolveNav;
 const nav=f.coordinator.rpc(()=>new Promise(yes=>{resolveNav=yes;}));
 const original=f.state.session.send;f.state.session.send=async(method,args)=>{await original(method,args);if(method==='Fetch.continueResponse')resolveNav({frameId:'f',loaderId:'l'});};
 f.cb.paused(f.request());f.cb.paused(f.response());f.cb.response(f.network());
 const result=await nav;await f.cb.drain();
 assert.equal(f.state.provisional.navigationLoaderVerified,false);assert.equal(f.fatal(),null);
 f.cb.frameNavigated({frame:{id:'f',url:f.state.url,loaderId:'l'}});f.cb.lifecycle({name:'DOMContentLoaded',frameId:'f',loaderId:'l'});
 assert.equal(f.cb.verifyNavigation(result).navigationLoaderVerified,true);f.coordinator.assertDrained();
});
test('same-shaped response loader cannot certify mismatched actual navigation or lifecycle',async()=>{
 for(const wrong of ['navigate','lifecycle']){
  const f=callbacksFixture();f.cb.paused(f.request());f.cb.response(f.network());f.cb.paused(f.response());await f.cb.drain();
  f.cb.frameNavigated({frame:{id:'f',url:f.state.url,loaderId:'l'}});f.cb.lifecycle({name:'DOMContentLoaded',frameId:'f',loaderId:wrong==='lifecycle'?'other':'l'});
  assert.throws(()=>f.cb.verifyNavigation({frameId:'f',loaderId:wrong==='navigate'?'other':'l'}));
 }
});
test('only independently known initial blank loader DCL is ignored; real matching DCL still verifies and foreign loader rejects',async()=>{
 const f=callbacksFixture();f.cb.lifecycle({name:'DOMContentLoaded',frameId:'f',loaderId:'initial-blank-loader'});assert.equal(f.state.dcl,null);
 f.cb.paused(f.request());f.cb.response(f.network());f.cb.paused(f.response());await f.cb.drain();
 f.cb.frameNavigated({frame:{id:'f',url:f.state.url,loaderId:'l'}});f.cb.lifecycle({name:'DOMContentLoaded',frameId:'f',loaderId:'l'});
 assert.equal(f.cb.verifyNavigation({frameId:'f',loaderId:'l'}).navigationLoaderVerified,true);assert.equal(f.fatal(),null);
 const g=callbacksFixture();g.cb.lifecycle({name:'DOMContentLoaded',frameId:'f',loaderId:'unrelated-loader'});assert.equal(g.state.dcl.loaderId,'unrelated-loader');
 g.cb.lifecycle({name:'DOMContentLoaded',frameId:'f',loaderId:'l'});assert.ok(g.fatal());
});
test('redirect/header refusal never continues main response; coarse error and same-network duplicate stay fatal',async()=>{
 for(const mutate of [p=>p.responseStatusCode=302,p=>p.responseHeaders.push({name:'x-robots-tag',value:'noindex'})]){
  const f=callbacksFixture();f.cb.paused(f.request());f.cb.response(f.network());const p=f.response();mutate(p);f.cb.paused(p);await f.cb.drain();
  assert.ok(f.state.refusal);assert.equal(f.calls.some(c=>c.method==='Fetch.continueResponse'),false);
 }
 for(const kind of ['coarse','duplicate']){
  const f=callbacksFixture();f.cb.paused(f.request());await tick();const p=kind==='duplicate'?{...f.request(),requestId:'different-fetch'}:f.response();
  if(kind==='coarse')p.responseErrorReason='Failed';f.cb.paused(p);await f.cb.drain();assert.ok(f.fatal());
 }
});
test('serial Fetch burst preserves return values and actual pending capacity after wrapper deadline',async()=>{
 let active=0,peak=0;const failures=[];
 const c=createNativeCaptureCoordinator({guard:()=>{},clock:()=>0,onFailure:e=>failures.push(e)});
 const value={same:true};assert.equal(await c.rpc(()=>value),value);
 await Promise.all(Array.from({length:200},()=>c.resolveFetch(async()=>{active++;peak=Math.max(peak,active);await Promise.resolve();active--;})));
 assert.equal(peak,1);c.assertDrained();
 const timers=[];let settle;const held=createNativeCaptureCoordinator({guard:()=>{},clock:()=>0,onFailure:()=>{},schedule:fn=>{timers.push(fn);return fn;},cancel:()=>{}});
 const waiting=held.rpc(()=>new Promise(yes=>{settle=yes;}));timers[0]();await assert.rejects(waiting);assert.equal(held.snapshot().physical,1);
 await held.cleanup(()=>Promise.resolve());settle();await tick();held.assertDrained();
});
test('normal event budget cannot consume either reserved cleanup ordinal',async()=>{
 const c=createNativeCaptureCoordinator({guard:()=>{},clock:()=>0,onFailure:()=>{}});for(let i=0;i<4096;i++)await c.resolveFetch(()=>Promise.resolve());
 assert.throws(()=>c.rpc(()=>Promise.resolve()));let closes=0;await c.cleanup(async()=>{closes++;});await c.cleanup(async()=>{closes++;});assert.equal(closes,2);c.assertDrained();
});
function rightsFixture(){
 const url=FIXED_CASES[0].url,w={schema:'chrome-scripting-native-reader/v1',studyId:'invented-study-id',studyRevision:'invented-study-revision',caseId:FIXED_CASES[0].id,ordinal:1,
  observationNonce:'invented-observation-nonce',eventEpoch:0,documentId:'native-doc',tabId:7,windowId:8,frameId:0,sourceUrl:url,documentUrl:url};
 const snapshot={schema:'native-document-policy-snapshot/v1',tabId:7,frameId:0,documentId:'native-doc',sourceUrl:url,documentUrl:url,
  document:{url,canonicalUrl:url,robots:['index'],tdm:['0'],complete:true}};
 const projected=projectNativeDomPolicy({snapshot,tabId:7,documentId:'native-doc',sourceUrl:url,documentUrl:url});
 const main={schema:'native-main-response-journey/v1',finalUrlHash:hash(url),status:200,frameId:'cdp-frame',loaderId:'cdp-loader',fetchRequestId:'fetch-request',fetchResponseId:'fetch-response',networkRequestId:'network',
  requestUrlExact:true,ordinaryTlsSecure:true,selectedPublicPinMatched:true,pinHash:H,headerPolicyHash:H,navigationLoaderVerified:true,domPolicyRequiredSeparately:true,nativeDocumentIdDirectlyCorrelated:false};
 const r={schema:'native-reader-bracketed-rights/v1',caseId:w.caseId,ordinal:1,studyId:w.studyId,studyRevision:w.studyRevision,observationNonce:w.observationNonce,eventEpoch:0,
  documentId:w.documentId,tabId:7,windowId:8,sourceUrlHash:hash(url),documentUrlHash:hash(url),originPolicyHash:H,mainResponseJourney:main,documentBefore:projected,documentAfter:projected,
  sameNativeDocument:true,httpNativeIdDirectlyCorrelated:false};return {w,r,snapshot};
}
test('rights projection omits all directive values and binds both native snapshots plus independently verified HTTP journey',()=>{
 const {w,r,snapshot}=rightsFixture(),out=validateNativeRightsEvidence({caseId:w.caseId,ordinal:1,nativeWitness:w,rightsEvidence:r});
 assert.ok(Object.isFrozen(out.documentBefore));assert.equal(JSON.stringify(out).includes('robots'),false);assert.equal(JSON.stringify(out).includes('index'),false);
 assert.equal(JSON.stringify(out).includes(w.documentUrl),false);assert.equal(out.mainResponseJourney.nativeDocumentIdDirectlyCorrelated,false);
 for(const change of [s=>s.document.robots=['noindex'],s=>s.document.tdm=['1']]){const s=copy(snapshot);change(s);assert.throws(()=>projectNativeDomPolicy({snapshot:s,tabId:7,documentId:'native-doc',sourceUrl:w.sourceUrl,documentUrl:w.documentUrl}));}
});
test('case/native/revision/nonce/epoch/hash/loader flags cannot be forged through rights cross-binding',()=>{
 const {w,r}=rightsFixture();for(const mutate of [x=>x.caseId='other',x=>x.ordinal=2,x=>x.studyRevision='other',x=>x.observationNonce='other',x=>x.eventEpoch=-0,
  x=>x.documentId='other',x=>x.tabId=99,x=>x.documentBefore.documentId='other',x=>x.documentAfter.documentUrlHash=H,
  x=>x.mainResponseJourney.navigationLoaderVerified=false,x=>x.mainResponseJourney.nativeDocumentIdDirectlyCorrelated=true,x=>x.httpNativeIdDirectlyCorrelated=true]){
  const x=copy(r);mutate(x);assert.throws(()=>validateNativeRightsEvidence({caseId:w.caseId,ordinal:1,nativeWitness:w,rightsEvidence:x}));
 }
 let calls=0;const x={...r};Object.defineProperty(x,'caseId',{enumerable:true,get(){calls++;throw 0;}});assert.throws(()=>validateNativeRightsEvidence({caseId:w.caseId,ordinal:1,nativeWitness:w,rightsEvidence:x}));assert.equal(calls,0);
});

function fakeBrowser({eligible=true,lateFailure=null,afterRightsWrongDocument=false}={}){
 let now=0,index=0,contextClosed=0,browserClosed=0;const context=eventSource(),browser=eventSource(),root=eventSource(),published=[],nativeCommands=[];
 const anchor={url:()=> 'about:blank'},pages=[anchor],workerUrl='chrome-extension://'+'a'.repeat(32)+'/worker.js';
 const worker={url:()=>workerUrl,evaluate:async(fn,args)=>{
  if(args?.handle){nativeCommands.push(args);const {method,input}=args;
   if(method==='beginStudy')return {schema:'native-reader-study/v1',studyId:input.studyId,studyRevision:'synthetic-study-revision',caseCount:32,eventEpoch:0};
   if(method==='endStudy')return {};
   if(method==='skipUnavailable')return {status:'unavailable',caseId:input.caseId,ordinal:input.ordinal,reason:input.reason};
   if(method==='locate')return {schema:'native-document-locator/v1',...input,frameId:0,documentId:'native-'+index,attestation:{contractVersion:'page-content-attestation/1',status:'attested',url:input.sourceUrl}};
   if(method==='snapshot')return {schema:'native-document-policy-snapshot/v1',...input,documentId:afterRightsWrongDocument&&nativeCommands.filter(c=>c.method==='snapshot').length===2?'foreign-doc':input.documentId,
    frameId:0,document:{url:input.documentUrl,canonicalUrl:input.sourceUrl,robots:[],tdm:[],complete:true}};
   if(method==='observe'){
    const c=FIXED_CASES[index-1],foreground={windowId:8,tabId:index+100,focused:true,windowType:'normal',incognito:false,active:true,tabStatus:'complete',sourceUrl:c.url,documentUrl:c.url,permissionGranted:true};
    return {status:'collected',rawTitle:'Invented title',effectiveTitle:'Invented title',body:'Invented synthetic body; not a real article.',extractorVersion:'main-text-prefix/v1',nativeWitness:{schema:'chrome-scripting-native-reader/v1',
     studyId:input.studyId,studyRevision:input.studyRevision,caseId:input.caseId,ordinal:input.ordinal,observationNonce:input.observationNonce,eventEpoch:0,tabId:index+100,windowId:8,frameId:0,documentId:'native-'+index,sourceUrl:c.url,documentUrl:c.url,
     foregroundChecks:[foreground,foreground,foreground],read:{contractVersion:'page-content/1',status:'collected',documentId:'native-'+index},attestation:{contractVersion:'page-content-attestation/1',status:'attested',url:c.url},effectiveTitleRule:'trim-or-hostname/v1',nativeDocumentContinuityOnly:true,canonicalAuthority:false}};
   }throw new Error('unexpected synthetic command');
  }
  if(args?.documentId)return {tabId:args.tabId,windowId:8,documentId:args.documentId};
  if(args?.url)return {tabId:index+100,windowId:8};return {id:8,type:'normal',incognito:false};
 }};
 root.send=async(method)=>method==='Extensions.loadUnpacked'?{id:'a'.repeat(32)}:method==='Target.getTargets'?{targetInfos:[{type:'service_worker',url:workerUrl}]}:{};
 browser.newBrowserCDPSession=async()=>root;browser.close=async()=>{browserClosed++;};
 Object.assign(context,{browser:()=>browser,pages:()=>pages,serviceWorkers:()=>[worker],routeWebSocket:async()=>{},close:async()=>{contextClosed++;browser.emit('disconnected');},newCDPSession:async page=>page.session,
  newPage:async()=>{
   const ordinal=++index,url=FIXED_CASES[ordinal-1].url,page=eventSource(),session=eventSource();let currentUrl='about:blank',loader='blank',resolveNavigation,frameReads=0;
   page.session=session;page.url=()=>currentUrl;page.bringToFront=async()=>{};page.close=async()=>{pages.splice(pages.indexOf(page),1);};session.detach=async()=>{};
   session.send=async(method,args)=>{
    if(method==='Target.getTargetInfo')return {targetInfo:{targetId:'target-'+ordinal}};
    if(method==='Page.getFrameTree'){
     frameReads++;if(ordinal===1&&frameReads===3&&lateFailure)session.emit('Network.loadingFailed',{requestId:'network-'+ordinal,errorText:lateFailure});
     return {frameTree:{frame:{id:'frame-'+ordinal,url:currentUrl,loaderId:loader}}};
    }
    if(method==='Page.navigate'){
     const promise=new Promise(yes=>{resolveNavigation=yes;});
     session.emit('Fetch.requestPaused',{requestId:'fetch-'+ordinal,networkId:'network-'+ordinal,frameId:'frame-'+ordinal,resourceType:'Document',request:{url,method:'GET',headers:{}}});
     session.emit('Network.responseReceived',{requestId:'network-'+ordinal,frameId:'frame-'+ordinal,loaderId:'loader-'+ordinal,response:{url,status:200,remoteIPAddress:'1.1.1.1',securityState:'secure',mimeType:'text/html'}});
     session.emit('Fetch.requestPaused',{requestId:'response-'+ordinal,networkId:'network-'+ordinal,frameId:'frame-'+ordinal,resourceType:'Document',request:{url,method:'GET',headers:{}},responseStatusCode:200,responseHeaders:[{name:'content-type',value:'text/html'}]});return promise;
    }
    if(method==='Fetch.continueResponse'){
     currentUrl=url;loader='loader-'+ordinal;session.emit('Page.frameNavigated',{frame:{id:'frame-'+ordinal,url,loaderId:loader}});
     session.emit('Page.lifecycleEvent',{name:'DOMContentLoaded',frameId:'frame-'+ordinal,loaderId:loader});resolveNavigation({frameId:'frame-'+ordinal,loaderId:loader});
    }return {};
   };
   pages.push(page);context.emit('page',page);return page;
  }});
 let launch;
 return {published,nativeCommands,context,counts:()=>({contextClosed,browserClosed}),launch:()=>launch,
  options:{chromium:{launchPersistentContext:async(dir,options)=>{launch={dir,options};return context;}},dnsPins:dns(),
   stagedExtensionPath:'D:/GITProjekts/universal-discussion-bootstrap/spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/output/staged-extension',
   executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',cases:FIXED_CASES.map(c=>({...c,groupId:'invented-'+c.ordinal,language:'en'})),studyId:'invented-study-identity',
   onRow:row=>published.push(row),guard:()=>{},clock:()=>now,pause:async ms=>{now+=ms;},collectPolicies:async({cases})=>({requests:[],elapsedMs:0,beforePage:async()=>{},
    entries:new Map(cases.map(c=>[c.url,eligible?{status:'eligible',receiptSha256:H}:{status:'unavailable',reason:'origin-robots-denied'}]))})}};
}
test('injected complete32 traversal brackets native read and emits transient ledger rows only after independent navigation proof',async()=>{
 const f=fakeBrowser(),summary=await captureNativeBrowserStudy(f.options);assert.equal(summary.accounted,32);assert.equal(summary.available,32);assert.equal(f.published.length,32);
 assert.deepEqual(f.counts(),{contextClosed:1,browserClosed:1});assert.equal(f.launch().dir,'');assert.deepEqual(f.launch().options.ignoreDefaultArgs,['--disable-extensions']);assert.equal(f.launch().options.chromiumSandbox,true);
 for(const row of f.published){assert.equal(row.status,'collected');assert.equal(row.rightsEvidence.documentBefore.documentId,row.nativeWitness.documentId);assert.equal(row.rightsEvidence.mainResponseJourney.navigationLoaderVerified,true);}
 assert.equal(JSON.stringify(summary).includes('Invented title'),false);assert.equal(JSON.stringify(summary).includes('https://'),false);
 assert.equal(f.nativeCommands.filter(c=>c.method==='observe').length,32);assert.equal(f.nativeCommands.filter(c=>c.method==='snapshot').length,64);
});
test('all32 preflight refusals consume skip ordinals without any article page/read/snapshot and retain full denominator',async()=>{
 const f=fakeBrowser({eligible:false}),summary=await captureNativeBrowserStudy(f.options);assert.equal(summary.accounted,32);assert.equal(summary.available,0);
 assert.equal(f.nativeCommands.filter(c=>c.method==='skipUnavailable').length,32);assert.equal(f.nativeCommands.filter(c=>c.method==='observe'||c.method==='snapshot').length,0);
 assert.equal(f.context.pages().length,1);assert.deepEqual(f.counts(),{contextClosed:1,browserClosed:1});
});
test('actual callbacks at final awaited frame boundary block retention: finite own-network failure unavailable, TLS/unknown fatal',async()=>{
 for(const lateFailure of ['net::ERR_NAME_NOT_RESOLVED','net::ERR_CONNECTION_RESET','net::ERR_CONNECTION_REFUSED','net::ERR_CONNECTION_CLOSED',
  'net::ERR_CONNECTION_TIMED_OUT','net::ERR_TIMED_OUT','net::ERR_ADDRESS_UNREACHABLE']){
  const f=fakeBrowser({lateFailure}),summary=await captureNativeBrowserStudy(f.options);
  assert.equal(summary.accounted,32);assert.equal(f.published[0].status,'unavailable');assert.equal(summary.available,31);
  assert.equal(Object.hasOwn(f.published[0],'body'),false);assert.equal(f.nativeCommands.filter(c=>c.method==='observe').length,32);
 }
 for(const lateFailure of ['net::ERR_CERT_AUTHORITY_INVALID','net::ERR_ABORTED','net::ERR_CONNECTION_RESET suffix','unknown']){
  const f=fakeBrowser({lateFailure});await assert.rejects(captureNativeBrowserStudy(f.options));assert.equal(f.published.length,0);assert.deepEqual(f.counts(),{contextClosed:1,browserClosed:1});
 }
});
test('same URL with different post-read native document cannot enter onRow; both owned fatal closes still complete',async()=>{
 const f=fakeBrowser({afterRightsWrongDocument:true});await assert.rejects(captureNativeBrowserStudy(f.options));assert.equal(f.published.length,0);
 assert.deepEqual(f.counts(),{contextClosed:1,browserClosed:1});
});
test('permitted DOM declarations need not be identical across brackets, but each hash/doc binding must validate',()=>{
 const {w,r,snapshot}=rightsFixture(),changed=copy(snapshot);changed.document.robots=['index,follow'];
 r.documentAfter=projectNativeDomPolicy({snapshot:changed,tabId:w.tabId,documentId:w.documentId,sourceUrl:w.sourceUrl,documentUrl:w.documentUrl});
 assert.notEqual(r.documentAfter.domPolicyHash,r.documentBefore.domPolicyHash);
 assert.equal(validateNativeRightsEvidence({caseId:w.caseId,ordinal:1,nativeWitness:w,rightsEvidence:r}).sameNativeDocument,true);
});
test('source has one CDP Fetch owner, static no-client-import default, real final native queries, no packet/log/body persistence',()=>{
 const source=readFileSync(new URL('./browser-capture.mjs',import.meta.url),'utf8');
 for(const forbidden of ['context.route(','page.goto(','writeFile','readFile','connectToServer','from \'playwright','import(\'playwright'])assert.equal(source.includes(forbidden),false);
 assert.ok(source.includes("context.routeWebSocket('**/*'"));assert.ok(source.includes("session.send('Fetch.enable'"));assert.ok(source.includes("session.send('Page.navigate'"));
 assert.ok(source.includes('finalTabs[0].id!==expected.tabId'));assert.ok(source.includes('nativeDocumentRights.locate'));
});
