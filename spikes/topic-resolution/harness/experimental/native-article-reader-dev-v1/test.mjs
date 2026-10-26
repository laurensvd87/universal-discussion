import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {win32} from 'node:path';
import {createArticleOwner,createFixtureTransport,createCallbackObservation,ArticleOwnerError,CALLBACK_KINDS} from './article-owner.mjs';
import {FIXTURES,FIXED_CASES,hash,BAD_DOCUMENT_ID} from './fixtures.js';
import {createNativeReaderTransfer,createTargetedSnapshotProbe,FIXED_CASES as ADAPTER_CASES} from './native-adapter.js';
import {runArticleDiagnostic,rightsDenied,validateFixtureCapture,validateNativeStudyBegin,validateNativeStudyEnd,checkStageLayout,resolveFixedBrowser,awaitMetadata,admitStartup,validateStartupAck,drainRequest,validateDrainAck} from './run.mjs';
import {ADDITIONS,BASE,OWN,INFRASTRUCTURE_SOURCE,INFRASTRUCTURE_PIN,sha,digest,inspectSources} from './source-ledger.js';
import {collectPageContent,attestContentDocument,createPageContentReader} from '../../../browser/chromium/page-content-reader.js';
import * as urlPolicy from '../../../browser/core/page-content-policy.js';
import {createNativeDocumentRights,collectNativeDocumentPolicy,NativeDocumentRightsError} from '../native-reader-transfer-v1/native-rights.js';
import {createNativeCaptureCoordinator,NATIVE_LAUNCH_ARGUMENTS} from '../native-reader-transfer-v1/browser-capture.mjs';
// Explicit approved immutable pure CODE dependency, pinned BEFORE evaluation.
const infraBytes=await readFile(new URL('../exact-browser-infrastructure-v1/compatibility-variant.mjs',import.meta.url));assert.equal(sha(infraBytes),INFRASTRUCTURE_PIN);
const {createInfrastructurePolicy}=await import('../exact-browser-infrastructure-v1/compatibility-variant.mjs');
const infrastructureModule={createInfrastructurePolicy,createNativeCaptureCoordinator,NATIVE_LAUNCH_ARGUMENTS};
const target=(id,url='about:blank',type='page')=>({targetId:id,type,url,attached:true,browserContextId:'owned'});
const ui=[target('ui-a','chrome://omnibox-popup.top-chrome/','browser_ui'),target('ui-b','chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html','browser_ui')].map(v=>({...v,attached:false}));
const anchor=target('anchor'),workerTarget=target('worker','chrome-extension://'+'a'.repeat(32)+'/worker.js','service_worker');
function ownerFixture(){let now=0;const owner=createArticleOwner({infrastructure:createInfrastructurePolicy(),clock:()=>now});owner.seal({targetInfo:anchor});for(const t of [...ui,anchor])owner.created({targetInfo:t});owner.worker({targetInfo:workerTarget});return {owner,setTime:v=>{now=v;}};}
function authenticate(owner,fixture=FIXTURES[0]){owner.reserve(fixture,20);const page={};owner.created({targetInfo:{...target('article'),attached:false}});owner.page(page);owner.returned(page);owner.authenticate({targetInfo:target('article')});return page;}
function reachRead(owner){owner.navigate('frame','blank-loader');owner.lifecycle('target-info-changed',{targetInfo:target('article',FIXTURES[0].url)});owner.commit({frame:{id:'frame',loaderId:'article-loader',url:FIXTURES[0].url}});owner.verifyNavigation({frameId:'frame',loaderId:'article-loader'});owner.assertReading();}
test('four roster and fixture scope are truthful; actual policy unchanged',()=>{assert.deepEqual(ADAPTER_CASES,FIXED_CASES);for(const f of FIXTURES){assert.equal(urlPolicy.inspectPageUrl(f.url).supported,true);assert.equal(hash(f.html),f.htmlSha256);}assert.equal(urlPolicy.inspectPageUrl('https://invented.invalid/article').supported,false);});
test('begin/end exact native identity and strictly advancing finite epochs, zero getter calls',()=>{
 const begin={schema:'native-article-dev-study/v1',studyId:'invented-study-168',studyRevision:'revision-1',eventEpoch:0,caseCount:4};
 const valid=validateNativeStudyBegin(begin,begin.studyId),end={schema:'native-article-dev-study-ended/v1',studyId:begin.studyId,studyRevision:begin.studyRevision,eventEpoch:1};assert.equal(validateNativeStudyEnd(end,valid).eventEpoch,1);
 const epochs=[-1,-0,NaN,Infinity,'0',true,undefined];
 for(const bad of [null,{}, {...begin,studyId:'other'}, {...begin,studyRevision:''}, {...begin,schema:'native-reader-study/v1'}, {...begin,extra:true}, {...begin,caseCount:32},...epochs.map(eventEpoch=>({...begin,eventEpoch}))])assert.throws(()=>validateNativeStudyBegin(bad,begin.studyId));
 for(const bad of [null,{}, {...end,studyId:'other'}, {...end,studyRevision:'other'}, {...end,schema:'wrong'}, {...end,extra:true}, {...end,eventEpoch:0},...epochs.map(eventEpoch=>({...end,eventEpoch}))])assert.throws(()=>validateNativeStudyEnd(bad,valid));
 let hits=0;const getter={...begin};Object.defineProperty(getter,'eventEpoch',{enumerable:true,get(){hits++;return 0;}});assert.throws(()=>validateNativeStudyBegin(getter,begin.studyId));assert.throws(()=>validateNativeStudyBegin(new Proxy(begin,{get(){hits++;}}),begin.studyId));assert.equal(hits,0);
});
test('targeted probe accepts only exact nominal native-execution; unrelated/forged/accessor errors fatal',async()=>{
 const errorPrototype=NativeDocumentRightsError.prototype,input={tabId:12,documentId:BAD_DOCUMENT_ID,sourceUrl:FIXTURES[3].url,documentUrl:FIXTURES[3].url};let calls=0;
 const expected=createTargetedSnapshotProbe({rights:{snapshot:async a=>{calls++;assert.equal(a,input);throw new NativeDocumentRightsError('native-execution');}},errorPrototype});assert.deepEqual(await expected(input),{refused:true,rightsHelperCode:'native-execution'});assert.equal(calls,1);
 const malformed=new NativeDocumentRightsError('native-execution');let hits=0;Object.defineProperty(malformed,'code',{get(){hits++;return 'native-execution';}});
 for(const error of [new TypeError('invented programmer error'),Object.assign(new Error('forged'),{code:'native-execution'}),new NativeDocumentRightsError('document-mismatch'),malformed]){const probe=createTargetedSnapshotProbe({rights:{snapshot:async()=>{throw error;}},errorPrototype});await assert.rejects(probe(input),e=>e===error);}
 assert.equal(hits,0);assert.throws(()=>createTargetedSnapshotProbe({rights:{},errorPrototype}));assert.deepEqual(await createTargetedSnapshotProbe({rights:{snapshot:async()=>{}},errorPrototype})(input),{refused:false});
});
test('pending target may precede returned Page but is not reading authority',()=>{const {owner}=ownerFixture();authenticate(owner);assert.throws(()=>owner.assertReading());reachRead(owner);assert.equal(owner.snapshot().articles,1);owner.release();});
test('rendezvous also accepts authenticated Page reply before target/Page callbacks, never before all agree',async()=>{const {owner}=ownerFixture(),page={},frame={};owner.reserve(FIXTURES[0],20);owner.returned(page);let settled=false;const waiting=owner.awaitAuthentication({targetInfo:target('article')}).then(id=>{settled=true;return id;});assert.equal(settled,false);owner.page(page);owner.pageNavigation(frame,frame,'about:blank');assert.equal(settled,false);owner.created({targetInfo:{...target('article'),attached:false}});assert.equal(await waiting,'article');assert.throws(()=>owner.assertReading());owner.release();});
test('unsettled native operation stays physically charged after timeout',async()=>{const timers=[];let release;const coordinator=createNativeCaptureCoordinator({guard:()=>{},clock:()=>0,until:()=>20,schedule:fn=>{timers.push(fn);return fn;},cancel:()=>{},onFailure:()=>{}});const operation=coordinator.rpc(()=>new Promise(resolve=>{release=resolve;}));assert.equal(coordinator.snapshot().physical,1);timers[0]();await assert.rejects(operation);assert.equal(coordinator.snapshot().physical,1);assert.throws(()=>coordinator.assertDrained());release();for(let i=0;i<12;i++)await Promise.resolve();assert.equal(coordinator.snapshot().physical,0);coordinator.assertDrained();coordinator.dispose();});
test('only the initial blank main-frame event is allowed before declared article navigation',()=>{const {owner}=ownerFixture();authenticate(owner);const f={};owner.pageNavigation(f,f,'about:blank');assert.throws(()=>owner.pageNavigation(f,f,'about:blank'));owner.navigate('frame','blank-loader');assert.throws(()=>owner.pageNavigation(f,f,'about:blank'));owner.pageNavigation(f,f,FIXTURES[0].url);assert.throws(()=>owner.pageNavigation(f,f,FIXTURES[0].url));owner.release();});
test('wrong context, unmatched Page, duplicate creation and late deadline refuse',()=>{
 for(const action of [o=>o.created({targetInfo:{...target('x'),browserContextId:'other'}}),o=>{o.created({targetInfo:target('x')});o.created({targetInfo:target('y')});},o=>{o.page({});o.returned({});o.created({targetInfo:target('x')});o.authenticate({targetInfo:target('x')});}]){const {owner}=ownerFixture();owner.reserve(FIXTURES[0],20);assert.throws(()=>action(owner));owner.release();}
 const {owner,setTime}=ownerFixture();owner.reserve(FIXTURES[0],20);setTime(20);assert.throws(()=>owner.page({}));owner.release();
});
test('wrong loader and extra frame reject without generic navigation permission',()=>{for(const bad of [{frame:{id:'other',loaderId:'load',url:FIXTURES[0].url}},{frame:{id:'frame',loaderId:'blank-loader',url:FIXTURES[0].url}},{frame:{id:'frame',loaderId:'load',url:FIXTURES[0].url,parentId:'p'}}]){const {owner}=ownerFixture();authenticate(owner);owner.navigate('frame','blank-loader');assert.throws(()=>owner.commit(bad));owner.release();}});
test('complete census disjoint partition cannot hide unexpected pages or omitted/retired articles',async()=>{
 const {owner}=ownerFixture();authenticate(owner);const census=rows=>owner.census({targetInfos:rows},'post-load',workerTarget.url),infra=[...ui,anchor,workerTarget];
 assert.equal(census([...infra,target('article')]).articleTargets,1);
 for(const rows of [infra,[...infra,target('article'),target('unknown')],[...infra,target('article'),{...ui[0]}]])assert.throws(()=>census(rows));
 reachRead(owner);const ended=owner.retire();assert.throws(()=>owner.assertReading());owner.lifecycle('target-destroyed',{targetId:'article'});await ended;owner.retired();assert.throws(()=>census([...infra,target('article')]));assert.throws(()=>owner.created({targetInfo:target('article')}));owner.release();
});
test('unknown destruction, worker premature death and malformed proxy/accessor never admit',()=>{const {owner}=ownerFixture();for(const [event,p]of [['target-destroyed',{targetId:'unknown'}],['target-destroyed',{targetId:'worker'}]])assert.throws(()=>owner.lifecycle(event,p));let hits=0;assert.throws(()=>owner.created({get targetInfo(){hits++;return anchor;}}));assert.throws(()=>owner.created(new Proxy({},{get(){hits++;throw Error();}})));assert.equal(hits,0);owner.release();});
test('summary row33 retains action/validation; malformed callback is firstfault not a drop',()=>{let actions=0,failures=0,hits=0;const observer=createCallbackObservation();for(let i=0;i<33;i++)observer.callback('page',{},()=>actions++,()=>failures++);let s=observer.snapshot();assert.equal(actions,33);assert.equal(s.retained,32);assert.equal(s.dropped,1);assert.equal(s.retained+s.dropped,s.totalObserved);assert.equal(s.firstFault,null);
 observer.callback('target-created',{get targetInfo(){hits++;throw Error('Never called');}},()=>actions++,()=>failures++);s=observer.snapshot();assert.equal(hits,0);assert.equal(actions,34);assert.equal(failures,1);assert.equal(s.invalidCallbacks,1);assert.equal(s.callbackCalls,34);assert.equal(s.totalObserved,33);assert.equal(s.firstFault.code,'descriptor');assert.equal(s.dropped,1);
 observer.callback('page',{},()=>{throw new ArticleOwnerError('unexpected-page');},()=>failures++);assert.equal(observer.snapshot().firstFault.code,'descriptor');
});
test('all4096 valid callback actions execute,4097fatal; original failure wins emission failure',()=>{let actions=0,failures=0;const observer=createCallbackObservation();for(let i=0;i<4096;i++)observer.callback('page',{},()=>actions++,()=>failures++);let s=observer.snapshot();assert.equal(s.totalObserved,4096);assert.equal(s.retained+s.dropped,4096);assert.equal(Object.values(s.counts).reduce((a,b)=>a+b,0),4096);assert.equal(failures,0);observer.callback('page',{},()=>actions++,()=>failures++);assert.equal(actions,4097);assert.equal(failures,1);assert.equal(observer.snapshot().firstFault.code,'event-capacity');assert.ok(Buffer.byteLength(JSON.stringify(observer.snapshot()))<2048);
 const failed=createCallbackObservation({emit:()=>{throw Error('invented sink');},onFault:()=>{throw Error('invented fault sink');}});failed.callback('page',{},()=>{throw new ArticleOwnerError('unexpected-page');},()=>{});assert.equal(failed.snapshot().firstFault.code,'unexpected-page');
});
test('full census/tombstones still enforced after summary storage is full',async()=>{const {owner}=ownerFixture(),observer=createCallbackObservation();for(let i=0;i<32;i++)observer.callback('page',{},()=>{},e=>{throw e;});authenticate(owner);reachRead(owner);const done=owner.retire();observer.callback('target-destroyed',{targetId:'article'},()=>owner.lifecycle('target-destroyed',{targetId:'article'}),e=>{throw e;});await done;owner.retired();assert.equal(observer.snapshot().dropped,1);const rows=[...ui,anchor,workerTarget];assert.equal(owner.census({targetInfos:rows},'post-load',workerTarget.url).articleTombstones,1);assert.throws(()=>owner.census({targetInfos:[...rows,target('article')]},'post-load',workerTarget.url));owner.release();});
test('fixture delivery consumes token before await; redirect/subframe/duplicate abort and fail',async()=>{
 const fixture=FIXTURES[0],page={},frame={page:()=>page};let fulfill=0,abort=0,errors=0,release;
 const transport=createFixtureTransport({fixture,page,mainFrame:frame,dispatch:f=>f(),guard:()=>{},onFatal:()=>errors++});
 const request=()=>({url:()=>fixture.url,method:()=> 'GET',frame:()=>frame,resourceType:()=> 'document',isNavigationRequest:()=>true,redirectedFrom:()=>null});
 const r=request(),route={request:()=>r,fulfill:async args=>{fulfill++;assert.equal(args.body.toString(),fixture.html);await new Promise(resolve=>{release=resolve;});},abort:async()=>{abort++;}};
 const first=transport.route(route);assert.equal(fulfill,1);transport.route(route);assert.equal(fulfill,1);assert.equal(abort,1);assert.equal(errors,1);release();await first;await transport.drain();
 assert.throws(()=>transport.verify());transport.response({requestId:'r',frameId:'f',loaderId:'l',type:'Document',response:{url:fixture.url,status:200,mimeType:'text/html'}},'f','l');assert.equal(transport.verify().syntheticFulfilled,1);
 for(const change of [{frame:()=>({page:()=>page})},{method:()=> 'POST'},{redirectedFrom:()=>({})},{url:()=>fixture.url+'?extra=1'}]){const t=createFixtureTransport({fixture,page,mainFrame:frame,dispatch:f=>f(),guard:()=>{},onFatal:()=>errors++});await t.route({request:()=>({...request(),...change}),abort:async()=>abort++,fulfill:async()=>{throw Error('Must not fulfill');}});assert.throws(()=>t.verify());}
});
// Tiny invented DOM, not a production HTML parser. Production serialized reader
// and rights functions execute on these exact manually declared fixture trees.
function element(tag,attrs={},children=[]){const n={nodeType:1,tagName:tag,hidden:Object.hasOwn(attrs,'hidden'),inert:false,isContentEditable:false,getAttribute:k=>Object.hasOwn(attrs,k)?attrs[k]:null,append(c){children.push(c);wireChildren();},set name(v){attrs.name=v;},set content(v){attrs.content=v;}};function wireChildren(){n.firstChild=children[0]??null;for(let i=0;i<children.length;i++)children[i].nextSibling=children[i+1]??null;const es=children.filter(c=>c.nodeType===1);n.firstElementChild=es[0]??null;for(let i=0;i<es.length;i++)es[i].nextElementSibling=es[i+1]??null;}wireChildren();return n;}
const text=s=>({nodeType:3,length:s.length,substringData:(start,len)=>s.slice(start,start+len)});
function dom(index){const title=index===0?'Invented Moon Workshop':index===1?'':index===2?'Denied invented article':'Mutable Invented Head';
 const head=element('HEAD',{},[element('META',{charset:'utf-8'}),...(index===2?[element('META',{name:'robots',content:'noindex'}),element('META',{name:'tdm-reservation',content:'1'})]:[]),element('TITLE',{},[text(title)])]);
 let body;if(index===0)body=element('BODY',{},[element('NAV',{},[text('EXCLUDED NAV')]),element('MAIN',{},[element('H1',{},[text('Moon workshop')]),element('P',{},[text('Wooden moons turn slowly.')]),element('DIV',{hidden:''},[text('EXCLUDED HIDDEN')]),element('FORM',{},[text('EXCLUDED FORM')]),element('P',{},[text('Paper stars remain still.')])])]);
 else if(index===1){const p=FIXTURES[1].html.match(/<p>(.*?)<\/p>/gu).map(x=>x.slice(3,-4));body=element('BODY',{},[element('DIV',{class:'article-content'},p.map(s=>element('P',{},[text(s)])))]);}
 else body=element('BODY',{},[element('MAIN',{},[element('P',{},[text(index===2?'THIS DENIED BODY MUST NOT BE READ.':'An invented compass points toward a paper island.')])])]);
 return {head,documentElement:element('HTML',{},[head,body]),createElement:tag=>element(tag.toUpperCase())};
}
function installDom(index){globalThis.top=globalThis;globalThis.location={href:FIXTURES[index].url};globalThis.document=dom(index);globalThis.getComputedStyle=()=>({display:'block',visibility:'visible',contentVisibility:'visible',fontSize:'16px',opacity:'1'});}
const globalKeys=['top','location','document','getComputedStyle','chrome','nativeReaderTransfer','nativeDocumentRights','nativeArticleBadDocumentProbe'];
async function globals(action){const previous=Object.fromEntries(globalKeys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));try{return await action();}finally{for(const k of globalKeys){if(previous[k])Object.defineProperty(globalThis,k,previous[k]);else delete globalThis[k];}}}
test('actual production reader output hashes, fallback and native policy are exercised on invented DOM only',()=>globals(async()=>{for(const i of [0,1,3]){installDom(i);const result=collectPageContent(FIXTURES[i].url);assert.equal(result.status,'collected');assert.equal(hash(result.title),FIXTURES[i].rawTitleSha256);assert.equal(hash(result.text),FIXTURES[i].bodySha256);assert.equal(result.extractorVersion,FIXTURES[i].extractorVersion);}installDom(2);const snapshot={schema:'native-document-policy-snapshot/v1',document:collectNativeDocumentPolicy(FIXTURES[2].url).document};assert.equal(rightsDenied(snapshot),true);}));

function emitter(){const listeners=new Set();return {addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f),emit:(...args)=>{for(const f of listeners)f(...args);}};}
function diagnosticFixture({wrongLoader=false,closeFailure=false,rogueBeforePage=false,deadlineDuringSetup=false,lateOldNavigation=false,lateOldDetachDuringRetire=false,probeProgrammingFailure=false,deadScriptingAfterBad=false,mutateBegin=null,mutateEnd=null}={}){
 const calls=[],history=[],scriptingTargets=[],context=new EventEmitter(),browser=new EventEmitter(),session=new EventEmitter(),anchorPage=new EventEmitter();let active=null,http=null,loaded=false,now=0,scriptingDead=false;
 const alive=new Map([...ui,anchor].map(t=>[t.targetId,{...t}]));
 const anchorFrame={url:()=> 'about:blank'};anchorPage.url=()=> 'about:blank';anchorPage.mainFrame=()=>anchorFrame;
 const ev=()=>emitter(),chrome={tabs:{onActivated:ev(),onUpdated:ev(),onRemoved:ev(),onReplaced:ev(),query:async()=>[{id:12,windowId:7,active:true,incognito:false,status:'complete',url:active.fixture.url}]},windows:{onFocusChanged:ev(),onRemoved:ev(),getLastFocused:async()=>({id:7,type:'normal',incognito:false,focused:true})},permissions:{onRemoved:ev(),contains:async()=>true},scripting:{executeScript:async input=>{
  calls.push('scripting:'+input.func.name);assert.equal(input.world,'ISOLATED');scriptingTargets.push({target:structuredClone(input.target),func:input.func.name});if(scriptingDead)throw Error('Invented dead scripting');if(input.target.documentIds&&input.target.documentIds[0]!==active.documentId){assert.deepEqual(input.target,{tabId:12,documentIds:[BAD_DOCUMENT_ID]});if(deadScriptingAfterBad)scriptingDead=true;throw Error('Invented wrong document');}
  const result=await input.func(...input.args);return [{frameId:0,documentId:active.documentId,result}];}}};
 const reader=createPageContentReader(chrome.scripting),native=createNativeReaderTransfer({chromeApi:chrome,reader,urlPolicy}),rights=createNativeDocumentRights({chromeApi:chrome,attestDocument:attestContentDocument,urlPolicy});
 globalThis.chrome=chrome;globalThis.nativeReaderTransfer=native;globalThis.nativeDocumentRights=rights;
 globalThis.nativeArticleBadDocumentProbe=createTargetedSnapshotProbe({rights:probeProgrammingFailure?{snapshot:async()=>{throw new TypeError('Invented programmer failure');}}:rights,errorPrototype:NativeDocumentRightsError.prototype});
 const worker={url:()=>workerTarget.url,evaluate:async(fn,arg)=>{calls.push(arg?.method??'native-operation');const result=await fn(arg);if(arg?.method==='begin'&&mutateBegin)return mutateBegin(result);if(arg?.method==='end'&&mutateEnd)return mutateEnd(result);return result;}};
 browser.newBrowserCDPSession=async()=>session;browser.close=async()=>{calls.push('browser-close');browser.emit('disconnected');};
 context.browser=()=>browser;context.pages=()=>[anchorPage];context.serviceWorkers=()=>loaded?[worker]:[];
 context.route=async(_pattern,handler)=>{assert.equal(http,null);http=handler;};context.routeWebSocket=async()=>{};
 context.close=async()=>{calls.push('context-close');for(const id of [...alive.keys()]){session.emit('Target.targetDestroyed',{targetId:id});alive.delete(id);}if(closeFailure)throw Error('Invented cleanup failure');};
 context.newPage=async()=>{
  calls.push('new-page');if(deadlineDuringSetup)now+=20000;
  const index=calls.filter(c=>c==='new-page').length-1,fixture=FIXTURES[index],page=new EventEmitter(),id='article-'+index,info={...target(id),attached:false};
  active={fixture,page,id,documentId:'native-doc-'+index,frame:null,info,frameUrl:'about:blank'};const article=active;history.push(article);
  const frame={url:()=>article.frameUrl,page:()=>page};article.frame=frame;page.mainFrame=()=>frame;page.url=()=>article.frameUrl;
  page.bringToFront=async()=>{};page.waitForLoadState=async()=>{};page.close=async()=>{calls.push('page-close');if(index===1&&lateOldDetachDuringRetire)history[0].cdp.emit('Page.frameDetached',{frameId:'frame-'+history[0].id,reason:'remove'});article.frameUrl='about:blank';session.emit('Target.targetDestroyed',{targetId:id});alive.delete(id);};
  alive.set(id,info);session.emit('Target.targetCreated',{targetInfo:{...info}});context.emit('page',page);if(index===1&&lateOldNavigation)history[0].page.emit('framenavigated',history[0].frame);if(rogueBeforePage)context.emit('page',{});return page;
 };
 context.newCDPSession=async page=>{
  if(page===anchorPage)return {send:async()=>({targetInfo:{...anchor}})};
  assert.equal(page,active.page);const a=active,cdp=new EventEmitter();a.cdp=cdp;
  cdp.detach=async()=>{calls.push('detach');};
  cdp.send=async(method,args)=>{
   calls.push(method);if(method==='Target.getTargetInfo'){a.info.attached=true;session.emit('Target.targetInfoChanged',{targetInfo:{...a.info}});return {targetInfo:{...a.info}};}
   if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'frame-'+a.id,loaderId:'blank-'+a.id,url:'about:blank'}}};
   if(method==='Page.navigate'){
    assert.equal(args.url,a.fixture.url);installDom(a.fixture.ordinal-1);
    const request={url:()=>args.url,method:()=> 'GET',frame:()=>a.frame,resourceType:()=> 'document',isNavigationRequest:()=>true,redirectedFrom:()=>null};
    await http({request:()=>request,fulfill:async options=>{calls.push('actual-fulfill');assert.deepEqual(options.body,Buffer.from(a.fixture.html));},abort:async()=>{throw Error('Unexpected fixture abort');}});
    a.info.url=args.url;a.frameUrl=args.url;session.emit('Target.targetInfoChanged',{targetInfo:{...a.info}});
    const loaderId='load-'+a.id;cdp.emit('Page.frameNavigated',{frame:{id:'frame-'+a.id,loaderId,url:args.url}});page.emit('framenavigated',a.frame);
    cdp.emit('Network.responseReceived',{requestId:'request-'+a.id,frameId:'frame-'+a.id,loaderId,type:'Document',response:{url:args.url,status:200,mimeType:'text/html'}});
    return {frameId:'frame-'+a.id,loaderId:wrongLoader?'wrong':loaderId};
   }return {};
  };return cdp;
 };
 session.send=async(method)=>{
  if(method==='Target.setDiscoverTargets')for(const t of [...ui,anchor])session.emit('Target.targetCreated',{targetInfo:{...t}});
  if(method==='Extensions.loadUnpacked'){loaded=true;alive.set('worker',{...workerTarget});session.emit('Target.targetCreated',{targetInfo:{...workerTarget}});return {id:'a'.repeat(32)};}
  if(method==='Target.getTargets')return {targetInfos:[...alive.values()].map(t=>({...t}))};return {};
 };
 const chromium={launchPersistentContext:async(_profile,options)=>{assert.equal(options.chromiumSandbox,true);assert.equal(options.ignoreHTTPSErrors,false);assert.ok(options.args.includes('--host-resolver-rules=MAP * ~NOTFOUND'));return context;}};
 return {args:{chromium,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',stagedExtensionPath:'D:/invented/stage',infrastructureModule,guard:()=>{},clock:()=>now},calls,scriptingTargets};
}
test('actual joined diagnostic: four invented articles; real reader+rights funcs, no Chrome',()=>globals(async()=>{const f=diagnosticFixture(),r=await runArticleDiagnostic(f.args);assert.equal(r.cases.length,4);assert.deepEqual(r.cases.map(x=>x.successfulPublications),[1,1,0,0]);assert.equal(r.cases[2].bodyRead,false);assert.equal(r.cases[3].badDocumentRefused,true);assert.equal(r.finalCensus.articleTombstones,4);assert.equal(f.calls.filter(c=>c==='actual-fulfill').length,4);assert.equal(f.calls.filter(c=>c==='context-close').length,1);assert.equal(f.calls.filter(c=>c==='browser-close').length,1);assert.equal(f.calls.filter(c=>c==='scripting:collectPageContent').length,3);assert.ok(!JSON.stringify(r).includes('127.0.0.1'));assert.ok(Buffer.byteLength(JSON.stringify(r))<16384);}));
test('actual joined bad UUID is targeted exactly once, then explicit valid denied-head recheck, no frame fallback',()=>globals(async()=>{const f=diagnosticFixture(),r=await runArticleDiagnostic(f.args),bad=f.scriptingTargets.map((v,i)=>({v,i})).filter(({v})=>v.target.documentIds?.includes(BAD_DOCUMENT_ID));assert.equal(bad.length,1);assert.deepEqual(bad[0].v,{target:{tabId:12,documentIds:[BAD_DOCUMENT_ID]},func:'collectNativeDocumentPolicy'});assert.deepEqual(f.scriptingTargets.slice(bad[0].i+1),[{target:{tabId:12,documentIds:['native-doc-3']},func:'collectNativeDocumentPolicy'}]);assert.equal(r.cases[3].validTargetRecheck,true);assert.equal(r.cases[3].badDocumentRefusalCode,'native-execution');assert.equal(r.cases[3].successfulPublications,0);}));
test('actual joined programmer failure or dead scripting after bad UUID is fatal, not refusal success',()=>globals(async()=>{for(const options of [{probeProgrammingFailure:true},{deadScriptingAfterBad:true}]){const f=diagnosticFixture(options);await assert.rejects(runArticleDiagnostic(f.args));assert.equal(f.calls.filter(c=>c==='context-close').length,1);assert.equal(f.calls.filter(c=>c==='browser-close').length,1);}}));
test('actual driver requires valid begin and ended proofs before success',()=>globals(async()=>{for(const options of [{mutateBegin:()=>undefined},{mutateBegin:r=>({...r,studyId:'wrong'})},{mutateBegin:r=>({...r,eventEpoch:-1})},{mutateEnd:()=>undefined},{mutateEnd:r=>({...r,studyRevision:'wrong'})},{mutateEnd:r=>({...r,eventEpoch:0})}]){const f=diagnosticFixture(options);await assert.rejects(runArticleDiagnostic(f.args));assert.equal(f.calls.filter(c=>c==='context-close').length,1);assert.equal(f.calls.filter(c=>c==='browser-close').length,1);if(options.mutateBegin)assert.equal(f.calls.filter(c=>c==='scripting:collectPageContent').length,0);}}));
test('actual driver rejects wrong loader, extra Page, setup deadline and cleanup failure, closes both once',()=>globals(async()=>{for(const options of [{wrongLoader:true},{rogueBeforePage:true},{deadlineDuringSetup:true},{closeFailure:true}]){const f=diagnosticFixture(options);await assert.rejects(runArticleDiagnostic(f.args));assert.equal(f.calls.filter(c=>c==='context-close').length,1);assert.equal(f.calls.filter(c=>c==='browser-close').length,1);if(!options.closeFailure)assert.equal(f.calls.filter(c=>c==='scripting:collectPageContent').length,0);}}));
test('actual driver rejects old Page navigation in next slot and old detach in next retirement',()=>globals(async()=>{for(const options of [{lateOldNavigation:true},{lateOldDetachDuringRetire:true}]){const f=diagnosticFixture(options),faults=[];await assert.rejects(runArticleDiagnostic({...f.args,onFault:row=>faults.push(row)}),e=>e.code==='late-article-callback');assert.equal(faults[0].code,'late-article-callback');assert.equal(f.calls.filter(c=>c==='context-close').length,1);assert.equal(f.calls.filter(c=>c==='browser-close').length,1);assert.equal(f.calls.filter(c=>c==='scripting:collectPageContent').length,options.lateOldNavigation?1:2);}}));

const DEV='spikes/topic-resolution/harness/experimental/playwright-dev-v1/',PREFIX='node_modules/playwright-core/';
function sourceFixture(){const names=[BASE+'source-paths.js',DEV+'package-lock.json',...Array.from({length:70},(_,i)=>'code/fixture-'+String(i).padStart(2,'0')+'.js')].sort(),packages=[PREFIX+'package.json',...Array.from({length:114},(_,i)=>PREFIX+'fixture-'+i+'.js')].sort();const buffers=Object.fromEntries([...names,...packages].map(k=>[k,Buffer.from('invented CODE')]));buffers[BASE+'source-paths.js']=Buffer.from('export const SOURCE_PATHS=Object.freeze('+JSON.stringify(names)+');');buffers[PREFIX+'package.json']=Buffer.from(JSON.stringify({name:'playwright-core',version:'1.64.1'}));buffers[DEV+'package-lock.json']=Buffer.from(JSON.stringify({packages:{[PREFIX.slice(0,-1)]:{integrity:'sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ=='}}}));const base=Object.fromEntries([...names,...packages].map(k=>[k,sha(buffers[k])]));buffers[BASE+'freeze.json']=Buffer.from(JSON.stringify({sourceHashes:base}));for(const key of ADDITIONS)buffers[key]??=Buffer.from('invented addition');buffers[INFRASTRUCTURE_SOURCE]=infraBytes;const seen=[];return {buffers,base,names,packages,seen,read:async path=>{const p=path.replaceAll('\\','/'),key=p.includes(PREFIX)?PREFIX+p.split(PREFIX)[1]:Object.keys(buffers).find(k=>p.endsWith(k));assert.ok(key);seen.push(key);return buffers[key];}};}
test('209 exact source composition; authenticate fixed literal before following any path',async()=>{const f=sourceFixture(),options={read:f.read,listPackage:async()=>f.packages,basePin:sha(f.buffers[BASE+'freeze.json']),authenticateSources:()=>{}};const got=await inspectSources(options);assert.equal(Object.keys(got.sourceHashes).length,209);assert.equal(ADDITIONS.length,22);assert.deepEqual(Object.keys(got.sourceHashes),[...Object.keys(f.base),...ADDITIONS]);f.seen.length=0;f.buffers[BASE+'source-paths.js']=Buffer.from('export const SOURCE_PATHS=Object.freeze(["apps/local-service/data/forbidden.json"]);');await assert.rejects(inspectSources(options));assert.deepEqual(f.seen,[BASE+'freeze.json',BASE+'source-paths.js']);});
test('source pins infrastructure bytes before import; invented change rejects',async()=>{const f=sourceFixture();f.buffers[INFRASTRUCTURE_SOURCE]=Buffer.from('export const hidden=true;');await assert.rejects(inspectSources({read:f.read,listPackage:async()=>f.packages,basePin:sha(f.buffers[BASE+'freeze.json']),authenticateSources:()=>{}}));});
test('fixed browser resolver normalizes separators; exact six stage files required',async()=>{const literal='C:/Program Files/Google/Chrome/Application/chrome.exe';assert.equal(await resolveFixedBrowser({resolvePath:win32.resolve,inspect:async()=>({isFile:()=>true,isSymbolicLink:()=>false}),real:async()=>win32.resolve(literal)}),win32.resolve(literal));const stage=win32.resolve('D:/invented-stage'),layout={'':['chromium','core','manifest.json','native-adapter.js','native-rights.js','worker.js'],chromium:['page-content-reader.js'],core:['page-content-policy.js']},sub=p=>p===stage?'':p.slice(stage.length+1);await checkStageLayout(stage,{list:async p=>layout[sub(p)],metadata:async p=>({directory:p===stage||['chromium','core'].includes(sub(p)),file:!(p===stage||['chromium','core'].includes(sub(p))),symbolic:false,resolved:p})});await assert.rejects(checkStageLayout(stage,{list:async()=>['extra'],metadata:async p=>({directory:true,file:false,symbolic:false,resolved:p})}));});
test('ACK absolute deadline tested on delayed successful read, not only ENOENT',async()=>{let now=0;await assert.rejects(awaitMetadata(async()=>{now=6;return Buffer.from('late');},5,{clock:()=>now}));});

export const PYTHON_AST_TEST=String.raw`
import ast,types,json,hashlib,math,re,ctypes,os,stat,time
from pathlib import Path
here=Path('spikes/topic-resolution/harness/experimental/native-article-reader-dev-v1').resolve()
tree=ast.parse((here/'supervise.py').read_text())
allowed=(ast.FunctionDef,ast.ClassDef,ast.Assign)
body=[n for n in tree.body if isinstance(n,allowed) and not isinstance(n,ast.Assign) or isinstance(n,ast.Assign) and all(isinstance(t,ast.Name) and t.id in ('HERE','REPO','OWN','BASE','V151','V158','V153','V155','V157','ADDITIONS','PINS','RUN158_PIN','DEV','PREFIX','PACKAGE','INTEGRITY','OUTPUT','STAGE_FILES','FIXTURE_EXPECTED','OPERATION_STAGES') for t in n.targets)]
ns=dict(ctypes=ctypes,Path=Path,__file__=str(here/'supervise.py'),json=json,hashlib=hashlib,math=math,re=re,os=os,stat=stat,time=time,types=types)
exec(compile(ast.Module(body=body,type_ignores=[]),'actual-adr168-ast','exec'),ns)
r=types.SimpleNamespace(**ns)
def reject(f):
 try:f()
 except Exception:return
 raise AssertionError('expected refusal')
assert len(r.ADDITIONS)==22 and r.OWN.endswith('/native-article-reader-dev-v1/')
assert all('exact-browser-infrastructure-v1/' not in key or key.endswith('/compatibility-variant.mjs') for key in r.ADDITIONS)
v=r.JobAccounting();v.TotalUserTime=500000000;v.TotalKernelTime=100000000;assert r.cpu_seconds(v)==60
v.TotalKernelTime+=1;reject(lambda:r.cpu_seconds(v));v.TotalUserTime=-1;reject(lambda:r.cpu_seconds(v))
reject(lambda:r.job_cpu(types.SimpleNamespace(QueryInformationJobObject=lambda *a:0),object()))
r.reserve_receipt(0,0,0,65536);reject(lambda:r.reserve_receipt(512*1048576-1,0,0,1));reject(lambda:r.reserve_receipt(0,1048576-1,0,1))
calls=[]
reject(lambda:r.bootstrap_initialize(0,{}, {},loader=lambda *a:calls.append('DLL'),clock=lambda:30));assert calls==[]
now=[0];calls=[]
def sample():calls.append('sample');return [10]
def recheck():calls.append('source');now[0]=16
reject(lambda:r.barrier(15,10,{10},lambda:None,lambda:[10],sample,recheck,lambda before:before(),lambda:None,clock=lambda:now[0],pause=lambda _:None));assert calls==['sample','source']
now[0]=0;calls=[]
def replacement():calls.append('identity');
def last_sample():
 calls.append('sample')
 if calls.count('sample')==2:raise RuntimeError('replacement')
 return [10]
reject(lambda:r.barrier(15,10,{10},lambda:None,lambda:[10],last_sample,lambda:None,lambda before:before(),lambda:None,clock=lambda:0,pause=lambda _:None));assert calls==['sample','sample']
# Full invented inventory; literal pinned before any73rd-path/body traversal.
names=sorted([r.BASE+'source-paths.js',r.DEV+'package-lock.json']+['code/f%02d.js'%i for i in range(70)])
packages=sorted([r.PREFIX+'package.json']+[r.PREFIX+'f%03d.js'%i for i in range(114)])
buffers={k:b'invented code' for k in names+packages}
buffers[r.BASE+'source-paths.js']=('export const SOURCE_PATHS=Object.freeze('+json.dumps(names,separators=(',',':'))+');').encode()
buffers[r.PREFIX+'package.json']=r.wire({'name':'playwright-core','version':'1.64.1'})
buffers[r.DEV+'package-lock.json']=r.wire({'packages':{r.PREFIX[:-1]:{'integrity':r.INTEGRITY}}})
base={k:r.sha(buffers[k]) for k in names+packages};buffers[r.BASE+'freeze.json']=r.wire({'sourceHashes':base})
for k in r.ADDITIONS:buffers.setdefault(k,b'invented addition')
infra='spikes/topic-resolution/harness/experimental/exact-browser-infrastructure-v1/compatibility-variant.mjs'
buffers[infra]=Path(infra).read_bytes();assert r.sha(buffers[infra])=='2d0309b15a7a74fe7a440c041a3c7592c7369b67258cb2f46db4c2723e71c07d'
seen=[]
def read(path,max=4194304):
 p=str(path).replace('\\','/');k=next(k for k in buffers if p.endswith(k));seen.append(k);return buffers[k]
pin=r.sha(buffers[r.BASE+'freeze.json']);got,_=r.inventory(read,lambda:packages,pin,lambda _:None);assert len(got)==209
assert list(got)==list(base)+r.ADDITIONS
seen.clear();buffers[r.BASE+'source-paths.js']=b'export const SOURCE_PATHS=Object.freeze(["apps/local-service/data/forbidden.json"]);'
reject(lambda:r.inventory(read,lambda:packages,pin,lambda _:None));assert seen==[r.BASE+'freeze.json',r.BASE+'source-paths.js']
text=(here/'supervise.py').read_text()
assert '0x1000|0x0100|0x0001' in text and 'child_started+350' in text and '>=360' in text and 'started>420' in text
assert "QueryInformationJobObject(job,1," in text and "helper.output_bounds" not in text and "helper.normal_job_drain" not in text
# Actual own result validators, not only helper names/source regexes.
import copy
keys=['disconnected','page','worker','anchor-navigation','anchor-dialog','anchor-download','anchor-crash','anchor-worker','article-dialog','article-download','article-crash','article-worker','article-navigation','target-created','target-info-changed','target-destroyed','target-crashed','frame-committed']
cases=[]
for i in (1,2):
 f=r.FIXTURE_EXPECTED[i-1];cases.append(dict(caseId=f['id'],ordinal=i,status='collected',htmlSha256=f['htmlSha256'],rawTitleSha256=f['rawTitleSha256'],effectiveTitleSha256=f['effectiveTitleSha256'],bodySha256=f['bodySha256'],extractorVersion=f['extractorVersion'],successfulPublications=1))
cases.append(dict(caseId='native-article-dev-003',ordinal=3,status='head-denied',bodyRead=False,successfulPublications=0))
cases.append(dict(caseId='native-article-dev-004',ordinal=4,status='mutation-and-bad-document-refused',baselineBodySha256=r.FIXTURE_EXPECTED[3]['bodySha256'],sameNativeDocument=True,mutationDenied=True,badDocumentRefused=True,badDocumentRefusalCode='native-execution',validTargetRecheck=True,successfulPublications=0))
def census(phase):return dict(phase=phase,targets=3 if phase=='pre-load' else 4,blankPages=1,ownExtensionWorkers=0 if phase=='pre-load' else 1,otherTargets=0,ownExtensionEquality=True,infrastructureTargets=2,infrastructureEquality=True,anchorEquality=True,browserTargets=0,articleTargets=0,articleTombstones=4 if phase=='final' else 0)
counts={k:4096 if k=='target-info-changed' else 0 for k in keys}
variant=dict(schema='native-article-diagnostic/v1',status='complete',cases=cases,preLoadCensus=census('pre-load'),postLoadCensus=census('post-load'),finalCensus=census('final'),events=4096,callbackRows=32,callbackSummary=dict(callbackCalls=4096,totalObserved=4096,invalidCallbacks=0,retained=32,dropped=4064,counts=counts,firstFault=None),operationRows=256,contextCloseAttempts=1,browserCloseAttempts=1,contextClosed=True,browserClosed=True,physicalOperationsDrained=True,callbacksDrained=True,pending=0,elapsedMs=349999,publicRequests=0,modelCalls=0,rawInputPersisted=False,syntheticTransportOnly=True,nativeWriteAuthority=False,productionValidated=False,assignmentAuthority=False)
r.validate_variant(variant,'article');assert len(r.wire(variant))<16384
for change in [('pending',1),('physicalOperationsDrained',False),('contextCloseAttempts',0),('events',4097),('elapsedMs',350001)]:
 bad=copy.deepcopy(variant);bad[change[0]]=change[1];reject(lambda:r.validate_variant(bad,'article'))
bad=copy.deepcopy(variant);bad['cases'][0]['bodySha256']='a'*64;reject(lambda:r.validate_variant(bad,'article'))
bad=copy.deepcopy(variant);bad['callbackSummary']['dropped']-=1;reject(lambda:r.validate_variant(bad,'article'))
bad=copy.deepcopy(variant);bad['cases'][3]['badDocumentRefused']=False;reject(lambda:r.validate_variant(bad,'article'))
bad=copy.deepcopy(variant);bad['cases'][3]['validTargetRecheck']=False;reject(lambda:r.validate_variant(bad,'article'))
bad=copy.deepcopy(variant);bad['cases'][3]['badDocumentRefusalCode']='document-mismatch';reject(lambda:r.validate_variant(bad,'article'))
assert list(r.OPERATION_STAGES) and 'fixture-route' in r.OPERATION_STAGES and 'fetch-enable' not in r.OPERATION_STAGES
print('actual ADR168 pure Python AST suite passed')
`;
test('actual own Python AST inventory/CPU/deadline/barrier tests; no Win DLL',t=>{let out;try{out=spawnSync('python',['-c',PYTHON_AST_TEST],{encoding:'utf8'});}catch(e){if(e.code==='OFFLINE_CAPABILITY_DENIED'){t.skip('Guard blocks child; same AST suite run separately.');return;}throw e;}assert.equal(out.status,0,out.stderr);assert.match(out.stdout,/actual ADR168 pure Python AST suite passed/);});
