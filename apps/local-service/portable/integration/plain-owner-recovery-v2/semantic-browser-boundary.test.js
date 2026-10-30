import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import vm from 'node:vm';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {describeSemanticBoundaryFailure,validateSemanticBrowserSmokeSource,quarantinePausedSemanticTarget,
  bindContainedSemanticAlias,markSemanticSessionDetached,describeSemanticUiFailure,createSemanticSmokeAiPort,createSemanticFirstPageSmokeState,
  validatePrivateApplicationBrowserPaths,openPrivateApplicationBrowser,PRIVATE_BROWSER_ROOT_BODY,PRIVATE_BROWSER_REPLY_BODY,semanticSmokeCapabilityResponse,SEMANTIC_SMOKE_CAPABILITY_DEFAULT,semanticSmokeNamedSearchPage} from './run-semantic-workspace-browser-smoke.js';
import {createLocalDiscussionController} from '../../../../../spikes/topic-resolution/browser/core/local-discussion-controller.js';
import {createLocalServiceClient,isMissingSemanticCapabilities} from '../../../../../spikes/topic-resolution/browser/core/local-service-client.js';
import {readSemanticSearch} from '../../../../../spikes/topic-resolution/browser/core/local-service-contract.js';

test('the browser fixture negotiates v2 absence through the actual client and never falls back after authentication failure',async()=>{
 assert.equal(SEMANTIC_SMOKE_CAPABILITY_DEFAULT,'available');
 for(const mode of [SEMANTIC_SMOKE_CAPABILITY_DEFAULT,'legacy','unauthorized','modern']){
  const calls=[],client=createLocalServiceClient({getToken:()=> 'a'.repeat(43),fetchImpl:async url=>{
   const route=new URL(url).pathname;calls.push(route);const response=semanticSmokeCapabilityResponse(route,mode);assert(response);
   return new Response(JSON.stringify(response.body),{status:response.status,headers:{'content-type':'application/json; charset=utf-8'}});
  }});
  if(mode===SEMANTIC_SMOKE_CAPABILITY_DEFAULT)assert.deepEqual(await client.semanticCapabilities(),{protocol:'semantic-topics/v1'});
  else if(mode==='modern')assert.deepEqual(await client.semanticCapabilities(),{protocol:'semantic-topics/v2',authorContext:'authored-topics/v2',topicSearch:'named-topics/v2'});
  else await assert.rejects(client.semanticCapabilities(),error=>mode==='legacy'?isMissingSemanticCapabilities(error):error.code==='unauthorized'&&!isMissingSemanticCapabilities(error));
  assert.deepEqual(calls,['unauthorized','modern'].includes(mode)?['/v1/semantic/capabilities/v2']:['/v1/semantic/capabilities/v2','/v1/semantic/capabilities']);
 }
 assert.equal(semanticSmokeCapabilityResponse('/v1/semantic/context',SEMANTIC_SMOKE_CAPABILITY_DEFAULT),null);
 assert.throws(()=>semanticSmokeCapabilityResponse('/v1/semantic/capabilities','unrecognized'));
});

test('modern browser fixtures pass the exact public search contract with complete independent mixed hierarchy captions',()=>{
 const version={generation:'synthetic-search',revision:7};
 const all=readSemanticSearch(semanticSmokeNamedSearchPage('',version),{limit:20});assert.equal(all.topics.length,3);
 assert.deepEqual(all.topics.slice(0,2).map(t=>[...t.breadcrumbs.fixed,...t.breadcrumbs.topic].map(v=>v.label).join(' / ')),['Food / Recipes / Kapsalon','Nature / Animals / Koalas']);
 const filtered=readSemanticSearch(semanticSmokeNamedSearchPage('Koalas',version),{limit:20});assert.equal(filtered.topics.length,1);assert.equal(filtered.topics[0].label,'Koalas');
 assert.equal(all.topics[2].label,'<New topic>');assert.throws(()=>semanticSmokeNamedSearchPage(null,version));
});

// Evaluate the ACTUAL launcher with an in-memory child and pipes. No subprocess,
// network, native API, profile or filesystem write occurs in these tests.
function fakeLauncher(){
  const raw=readFileSync(new URL('../../../../../spikes/topic-resolution/harness/chromium-pipe.js',import.meta.url),'utf8');
  assert.ok(raw.includes('import { spawn } from "node:child_process";'));
  const instrumented=raw.replace('import { spawn } from "node:child_process";','const spawn=globalThis.fakeSpawn;')
    .replace('export function launchChromiumPipe','function launchChromiumPipe')+'\nglobalThis.launch=launchChromiumPipe;';
  const child=new EventEmitter();child.stdio=[null,null,null,new PassThrough(),new PassThrough()];child.kills=0;
  child.kill=()=>{child.kills++;return true;};
  const context={Buffer,fakeSpawn:()=>child,setTimeout:fn=>{queueMicrotask(fn);return 0;},clearTimeout:()=>{}};
  vm.runInNewContext(instrumented,context);
  return {child,client:context.launch({executable:'fixture-only',profileDirectory:'fixture-only'})};
}
test('owned exit getter changes only on the exact child exit event, never a pipe error',async()=>{
  const {child,client}=fakeLauncher();assert.equal(client.hasExited,false);child.emit('error',Error('synthetic pipe failure'));assert.equal(client.hasExited,false);
  child.emit('exit',0);assert.equal(client.hasExited,true);await client.close();assert.equal(client.hasExited,true);assert.equal(child.kills,0);
});
test('close returning after an unsuccessful owned kill still exposes hasExited false',async()=>{
  const {child,client}=fakeLauncher();child.emit('error',Error('synthetic pipe failure'));await client.close();assert.equal(child.kills,1);assert.equal(client.hasExited,false);
});

const root='D:\\GITProjekts\\universal-discussion-bootstrap',data=path.win32.join(root,'apps/local-service/data');
function pathFixture({dataReal=data,rootReal=root,extra=[]}={}){
  const runner=readFileSync(new URL('./run-semantic-workspace-browser-smoke.js',import.meta.url),'utf8');
  const begin=runner.indexOf('function contained('),end=runner.indexOf('const UI_ASSERT_CODES=');assert.ok(begin>=0&&end>begin);
  const source=runner.slice(begin,end)+'\nglobalThis.checked=checkedPath;';
  const entries=new Map([[path.win32.resolve(root),rootReal],[path.win32.resolve(data),dataReal],...extra]);
  const context={assert,path:path.win32,REPO:root,INTENDED_REPO:root,existsSync:value=>entries.has(path.win32.resolve(value)),
    realpathSync:value=>{const found=entries.get(path.win32.resolve(value));assert.ok(found);return found;}};
  vm.runInNewContext(source,context);return context.checked;
}
test('contained metadata permits a fresh owned path under the fixed D workspace',()=>{
  const profile=path.win32.join(data,'semantic-workspace-browser-owned-test');assert.equal(pathFixture()(profile),profile);
});
test('DATA redirected outside the D workspace is refused before writes',()=>{
  assert.throws(()=>pathFixture({dataReal:'E:\\outside-workspace'})(data));
});
test('repository redirected away from the intended D workspace is refused',()=>{
  assert.throws(()=>pathFixture({rootReal:'C:\\outside-workspace'})(data));
});
test('lexically external output or profile targets are refused',()=>{
  assert.throws(()=>pathFixture()('D:\\outside-workspace\\profile'));
});
test('an owned-looking profile redirected to another user directory is refused',()=>{
  const profile=path.win32.join(data,'semantic-workspace-browser-owned-test');
  assert.throws(()=>pathFixture({extra:[[profile,'C:\\Users\\owner']]})(profile));
});
test('closed CDP diagnostic retains only an allowed method and bounded numeric code',()=>{
  assert.deepEqual(describeSemanticBoundaryFailure(Error('Chromium protocol rejected Target.setAutoAttach (code -32601)')),
    {code:'protocol-rejected',method:'Target.setAutoAttach',numericCode:-32601});
  assert.deepEqual(describeSemanticBoundaryFailure(Error('Chromium pipe ended during Network.enable')),{code:'pipe-ended',method:'Network.enable'});
  assert.deepEqual(describeSemanticBoundaryFailure(Error('Executable target already running')),{code:'target-already-executing'});
});
test('unknown diagnostic text, URLs, tokens, methods and accessor messages never enter output',()=>{
  for(const text of ['https://owner.example/private?token=secret','Chromium protocol rejected Secrets.dump (code -32601)',
    'Chromium protocol rejected Target.setAutoAttach (code 9999999999999999999)'])assert.deepEqual(describeSemanticBoundaryFailure(Error(text)),{code:'boundary-failure'});
  const accessor={};Object.defineProperty(accessor,'message',{get(){assert.fail('message getter invoked');}});
  assert.deepEqual(describeSemanticBoundaryFailure(accessor),{code:'boundary-failure'});
  let hooks=0;const proxy=new Proxy({}, {getOwnPropertyDescriptor(){hooks++;throw Error('Do not invoke');}});
  assert.deepEqual(describeSemanticBoundaryFailure(proxy),{code:'boundary-failure'});assert.equal(hooks,0);
  const revoked=Proxy.revocable({},{});revoked.revoke();assert.deepEqual(describeSemanticBoundaryFailure(revoked.proxy),{code:'boundary-failure'});
  for(const value of [null,undefined,'message',1,true])assert.deepEqual(describeSemanticBoundaryFailure(value),{code:'boundary-failure'});
});
test('runner source-check compiles the browser fixture and stays import-inert',()=>{
  assert.deepEqual(validateSemanticBrowserSmokeSource(),{schema:'semantic-workspace-browser-source-check/v1',browserLaunched:false,fixtureCompiles:true});
});
test('private browser paths bind one exact parent run and short fresh profile with no cross-run selectors',async()=>{
 const root='C:\\Users\\Laurens\\AppData\\Local\\MurmingleRecovery\\plain-automatic18-v2',nonce='a'.repeat(48),run=root+'\\run-'+nonce,
  profile=run+'\\cluster\\nhpg-aBc123\\app\\c-'+nonce.slice(0,8),output=run+'\\output';
 assert.deepEqual(validatePrivateApplicationBrowserPaths(profile,output),{profileDirectory:profile,outputDirectory:output});
 for(const pair of [[profile,root+'\\run-'+'b'.repeat(48)+'\\output'],[profile.replace('c-aaaaaaaa','c-bbbbbbbb'),output],
  [profile.replace('\\app\\','\\app\\..\\app\\'),output],[profile.replace('C:', 'E:'),output],['\\\\server\\share\\profile',output]])assert.throws(()=>validatePrivateApplicationBrowserPaths(...pair));
 await assert.rejects(openPrivateApplicationBrowser({profileDirectory:profile,outputDirectory:output,deadline:1,checkDeadline:()=>{},request:()=>{},port:4185}));
 assert.equal(PRIVATE_BROWSER_ROOT_BODY,'Private browser root: actual canonical storage.');assert.equal(PRIVATE_BROWSER_REPLY_BODY,'Private browser reply: original canonical destination.');
});
function firstPageController(){
  const fixture=createSemanticFirstPageSmokeState(),commands=[];
  const controller=createLocalDiscussionController({
    client:{health:async()=>({}),catalog:async()=>structuredClone(fixture.catalog),discussion:async()=>structuredClone(fixture.discussion),
      related:async()=>({version:fixture.catalog.version,model:fixture.catalog.model,results:[]}),
      priorDiscussions:async sourceId=>({version:fixture.catalog.version,sourceId,currentTopicId:fixture.topic.id,topics:[]}),
      command:async(...args)=>{commands.push(args);assert.fail('No first-page fixture publication expected');}},
    session:{isPaired:async()=>true},readPostingActor:()=>fixture.current.actor,readPostingSessionRevision:()=>fixture.current.sessionRevision,
    readPageResolution:async()=>fixture.current.resolution,
    readActiveTab:async()=>({tabId:fixture.current.tabId,windowId:fixture.current.windowId,url:fixture.current.url}),
    observeTabLifecycle:()=>()=>{},lookupByNormalizedUrl:async()=>{assert.fail('No URL fixture bridge expected');},
  });
  return {fixture,controller,commands};
}
test('exact browser first-page fixture stages through the real controller before invented promotion without publishing',async t=>{
  const qa=firstPageController();t.after(()=>qa.controller.dispose());await qa.controller.open();
  assert.equal(qa.fixture.catalog.sources.length,0);assert.equal(qa.controller.currentState().sourceId,null);
  assert.equal(qa.controller.currentState().localRootDraftReady,true);assert.equal(qa.controller.currentState().humanPostingReady,false);
  qa.controller.setDraft('Invented browser draft before model completion');assert.equal(await qa.controller.submitDraft(),false);assert.deepEqual(qa.commands,[]);
  const documentId=qa.fixture.current.resolution.documentId;qa.fixture.promote();
  await qa.controller.updatePageResolution(qa.fixture.current.resolution);const state=qa.controller.currentState();
  assert.equal(state.phase,'ready');assert.equal(state.sourceId,'first-page-source');assert.equal(state.topicId,'first-page-topic');
  assert.equal(state.resolution.documentId,documentId);assert.equal(state.draft.detached,false);assert.equal(state.draft.body,'Invented browser draft before model completion');
  assert.deepEqual(qa.commands,[]);assert.throws(()=>qa.fixture.promote(),/already promoted/);
});
test('exact browser fixture session and replacement-document controls detach text with no command or invented authority',async t=>{
  for(const change of [qa=>{qa.fixture.current.sessionRevision++;qa.controller.accountChanged();},
    qa=>{qa.fixture.current.resolution={...qa.fixture.current.resolution,documentId:'first-page-document-2',sequence:2};return qa.controller.updatePageResolution(qa.fixture.current.resolution);}]){
    const qa=firstPageController();t.after(()=>qa.controller.dispose());await qa.controller.open();qa.controller.setDraft('Keep browser first-page draft');await change(qa);
    const state=qa.controller.currentState();assert.equal(state.draft.body,'Keep browser first-page draft');assert.equal(state.draft.detached,true);
    assert.equal(state.localRootDraftReady,false);assert.equal(await qa.controller.submitDraft(),false);assert.deepEqual(qa.commands,[]);
  }
});

const paused=()=>({waiting:true,originClass:'extension',ready:false,resumeIssued:false,recursiveAttachInstalled:true,offlineInstalled:true,fetchInstalled:true});
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {resolve,promise};};
test('foreign target remains paused and unready after containment and exact identity verification',async()=>{
  const entry=paused(),gate=deferred(),calls=[];let settled=false;
  const pending=quarantinePausedSemanticTarget(entry,{verifyIdentity:async()=>{calls.push('identity');return gate.promise;},
    closeTarget:async()=>{assert.fail('quarantine must not close a target');},resume:async()=>{assert.fail('quarantine must not resume a target');}}).then(()=>{settled=true;});
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls,['identity']);assert.equal(settled,false);assert.equal(entry.quarantined,undefined);
  gate.resolve(true);await pending;assert.equal(entry.quarantined,true);assert.equal(entry.stage,'quarantined-paused');assert.equal(entry.resumeIssued,false);assert.equal(entry.ready,false);
});
test('quarantine refuses executing, resumed, non-extension or incompletely contained targets without closing',async()=>{
  for(const patch of [{waiting:false},{resumeIssued:true},{ready:true},{originClass:'blank'},{recursiveAttachInstalled:false},{offlineInstalled:false},{fetchInstalled:false}]){
    let calls=0;await assert.rejects(quarantinePausedSemanticTarget({...paused(),...patch},{verifyIdentity:async()=>{calls++;return true;}}),/Quarantine precondition refused/);
    assert.equal(calls,0);
  }
});
test('identity mismatch never qualifies a paused target as quarantined',async()=>{
  const entry=paused();await assert.rejects(quarantinePausedSemanticTarget(entry,{verifyIdentity:async()=>false}),/Quarantine identity refused/);
  assert.equal(entry.quarantined,undefined);assert.equal(entry.resumeIssued,false);assert.equal(entry.ready,false);
});
test('a late resume or boundary loss during identity verification prevents quarantine qualification',async()=>{
  for(const patch of [{resumeIssued:true},{offlineInstalled:false}]){const gate=deferred(),entry=paused();
    const pending=quarantinePausedSemanticTarget(entry,{verifyIdentity:()=>gate.promise});Object.assign(entry,patch);gate.resolve(true);
    await assert.rejects(pending,/Quarantine precondition refused/);assert.equal(entry.quarantined,undefined);
  }
});

const ownedOrigin='chrome-extension://'+'a'.repeat(32),ownedUrl=ownedOrigin+'/chromium/background.js';
function aliasFixture(){const owner={ordinal:4,type:'service_worker',targetId:'private-synthetic-target',targetUrl:ownedUrl,ownedOrigin,originClass:'extension',
  active:true,ready:true,aliased:false,firstFailure:null,recursiveAttachInstalled:true,offlineInstalled:true,fetchInstalled:true,ownsNetworkBoundaries:true};
  return {owner,entry:{ordinal:5,type:owner.type,targetId:owner.targetId,targetUrl:ownedUrl,originClass:'extension',waiting:false,ready:false,resumeIssued:false}};}
test('an already executing duplicate binds only to its exact active contained owned session without resume',async()=>{
  const {entry,owner}=aliasFixture();let identities=0;
  assert.equal(await bindContainedSemanticAlias(entry,owner,{ownedOrigin,verifyIdentity:async()=>{identities++;return true;},resume:()=>assert.fail('alias resumed')}),true);
  assert.equal(identities,1);assert.equal(entry.boundTo,4);assert.equal(entry.aliased,true);assert.equal(entry.ready,false);assert.equal(entry.resumeIssued,false);
  assert.equal(entry.offlineInstalled,undefined,'alias does not claim a second independent network owner');assert.equal(owner.active,true);
});
test('unknown, detached, foreign, mismatched, failed or partially contained alias owners are refused',async()=>{
  const changes=[value=>{value.owner=null;},value=>{value.owner.active=false;},value=>{value.owner.ready=false;},
    value=>{value.owner.ownedOrigin='chrome-extension://'+'b'.repeat(32);},value=>{value.owner.targetUrl=ownedOrigin+'/other.js';},
    value=>{value.owner.targetId='another-target';},value=>{value.owner.type='page';},value=>{value.owner.firstFailure={code:'failed'};},
    value=>{value.owner.recursiveAttachInstalled=false;},value=>{value.owner.offlineInstalled=false;},value=>{value.owner.fetchInstalled=false;}];
  for(const change of changes){const value=aliasFixture();change(value);let calls=0;
    await assert.rejects(bindContainedSemanticAlias(value.entry,value.owner,{ownedOrigin,verifyIdentity:async()=>{calls++;return true;}}),/Alias precondition refused/);
    assert.equal(calls,0);assert.equal(value.entry.aliased,undefined);
  }
  const {entry,owner}=aliasFixture();await assert.rejects(bindContainedSemanticAlias(entry,owner,{ownedOrigin,verifyIdentity:async()=>false}),/Alias identity refused/);assert.equal(entry.boundTo,undefined);
});
test('unexpected original-session detach during alias verification revokes acceptance and is distinguished from shutdown',async()=>{
  const {entry,owner}=aliasFixture(),gate=deferred();const pending=bindContainedSemanticAlias(entry,owner,{ownedOrigin,verifyIdentity:()=>gate.promise});
  assert.equal(markSemanticSessionDetached(owner),true);assert.equal(owner.unexpectedDetach,true);gate.resolve(true);await assert.rejects(pending,/Alias precondition refused/);
  assert.equal(entry.boundTo,undefined);
  const shutdown=aliasFixture().owner;assert.equal(markSemanticSessionDetached(shutdown,{shutdown:true}),false);assert.equal(shutdown.active,false);assert.equal(shutdown.unexpectedDetach,undefined);
  assert.equal(markSemanticSessionDetached({active:true,ownsNetworkBoundaries:true,aliased:true}),false);
});
test('UI diagnostics preserve only closed assertion and evaluation codes',()=>{
  const overflow=Error('private body must never be retained');Object.defineProperty(overflow,'smokeCode',{value:'horizontal-overflow'});
  assert.deepEqual(describeSemanticUiFailure(overflow),{code:'horizontal-overflow'});
  assert.deepEqual(describeSemanticUiFailure(Error('Browser fixture evaluation failed')),{code:'evaluation-failed'});
  const assertion=Error('private expected and actual values');assertion.code='ERR_ASSERTION';assert.deepEqual(describeSemanticUiFailure(assertion),{code:'assertion-failed'});
});
test('UI diagnostic projection discards arbitrary messages, body values and accessor properties',()=>{
  const custom=Error('https://owner.example/?token=secret');custom.smokeCode='private-body';assert.deepEqual(describeSemanticUiFailure(custom),{code:'ui-step-failed'});
  const accessor={};for(const key of ['message','code','smokeCode'])Object.defineProperty(accessor,key,{get(){assert.fail('diagnostic accessor invoked');}});
  assert.deepEqual(describeSemanticUiFailure(accessor),{code:'ui-step-failed'});
  let hooks=0;const proxy=new Proxy({}, {getOwnPropertyDescriptor(){hooks++;throw Error('Do not invoke');}});
  assert.deepEqual(describeSemanticUiFailure(proxy),{code:'ui-step-failed'});assert.equal(hooks,0);
  const revoked=Proxy.revocable({},{});revoked.revoke();assert.deepEqual(describeSemanticUiFailure(revoked.proxy),{code:'ui-step-failed'});
  for(const value of [null,undefined,'message',1,true])assert.deepEqual(describeSemanticUiFailure(value),{code:'ui-step-failed'});
});
function inventedAiFixture(){
 const starts=[],reads=[],digest=async value=>createHash('sha256').update(value).digest('hex');let guards=0;
 const port=createSemanticSmokeAiPort({expiresAt:4102444800000,digest,onStart:value=>starts.push(value),
  readTarget:async value=>{reads.push(value);return {rootRevision:3,targetRevision:2,targetId:'reply-a',root:{id:'root-a',body:'Original opener',replies:[{id:'reply-a',body:'Public selected question'}]}};}});
 const request={operationId:'synthetic-op',followupQuestionId:'reply-a',semanticTarget:{nodeId:'music',topicId:'canonical-a',rootRevision:3,targetRevision:2},
  articleText:port.articleText,context:{topic:{id:'reserved-domain-demo'},currentSource:{id:'reserved-example-com'},discussion:[]}};
 return {port,request,starts,reads,digest,options:{beforeDispatch:async()=>{guards++;return true;}},guards:()=>guards};
}

test('invented smoke AI port awaits dispatch guards and retains one exact publication with real digests',async()=>{
 const qa=inventedAiFixture();assert.equal(qa.starts.length,0);assert.equal(await qa.port.resumable(),null);
 await qa.port.start(qa.request,'demo-alex',qa.options);assert.equal(qa.guards(),2);
 assert.deepEqual(qa.reads,[{nodeId:'music',topicId:'canonical-a',discussionId:'discussion-a',rootId:'root-a',targetId:'reply-a'}]);
 const completed=await qa.port.result('synthetic-op');assert.equal(completed.state,'completed');
 assert.deepEqual(completed.semanticPublication,{semanticTarget:qa.request.semanticTarget,
  evidence:{sourceId:'reserved-example-com',sourceVersion:'0',operationId:'synthetic-page-b-operation',
   operationDigest:await qa.digest('invented-page-b-operation'),sourceStamp:await qa.digest('invented-page-b-stamp')},
  articleDigest:await qa.digest(qa.port.articleText),rootDigest:await qa.digest('Original opener'),targetDigest:await qa.digest('Public selected question'),expiresAt:4102444800000});
 await assert.rejects(qa.port.start({...qa.request,operationId:'second-op'},'demo-alex',qa.options),/Synthetic job unavailable/);
 assert.equal(qa.starts.length,1);qa.port.release('other-operation');assert.equal((await qa.port.result('synthetic-op')).state,'completed');
 qa.port.release('synthetic-op');await assert.rejects(qa.port.result('synthetic-op'),/Synthetic job missing/);
 assert.equal(qa.starts.length,1);
});

test('invented smoke AI port refuses aborted or credential-revoked starts before any target or provider work',async()=>{
 for(const aborted of [false,true]){const qa=inventedAiFixture(),abort=new AbortController();if(aborted)abort.abort();
  await assert.rejects(qa.port.start(qa.request,'demo-alex',{signal:abort.signal,beforeDispatch:async()=>false}));
  assert.deepEqual(qa.reads,[]);assert.deepEqual(qa.starts,[]);assert.equal(await qa.port.resumable(),null);
 }
 const qa=inventedAiFixture(),gate=deferred();const first=qa.port.start(qa.request,'demo-alex',{beforeDispatch:()=>gate.promise});
 await assert.rejects(qa.port.start(qa.request,'demo-alex',qa.options),/Synthetic job unavailable/);gate.resolve(false);await assert.rejects(first,/Synthetic dispatch refused/);
 assert.deepEqual(qa.starts,[]);
});

test('invented smoke AI port cannot rebase a changed revision or include a foreground discussion',async()=>{
 for(const change of [request=>{request.semanticTarget.targetRevision=99;},request=>{request.context.discussion=[{body:'Unsent text must never be included'}];},
  request=>{request.context.currentSource.id='source-a';}]){
  const qa=inventedAiFixture();change(qa.request);await assert.rejects(qa.port.start(qa.request,'demo-alex',qa.options));
  assert.deepEqual(qa.starts,[]);await assert.rejects(qa.port.result('synthetic-op'),/Synthetic job missing/);
 }
});
