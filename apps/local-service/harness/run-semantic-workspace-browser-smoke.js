import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchChromiumPipe} from '../../../spikes/topic-resolution/harness/chromium-pipe.js';

const CHROME='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SELF=fileURLToPath(import.meta.url);
const REPO=fileURLToPath(new URL('../../../',import.meta.url));
const INTENDED_REPO='D:\\GITProjekts\\universal-discussion-bootstrap';
const DATA=path.join(REPO,'apps/local-service/data');
const OUTPUT=path.join(DATA,'semantic-workspace-browser-qa-20261027');
const EXTENSION=path.join(REPO,'spikes/topic-resolution/browser');
const PIN_FILES=[SELF,path.join(REPO,'spikes/topic-resolution/harness/chromium-pipe.js'),
  ...['manifest.json','chromium/popup.js','chromium/popup.css','chromium/semantic-topic-workspace.js','chromium/semantic-topic-panel.js',
    'chromium/discussion-panel.js','core/local-discussion-controller.js','core/local-service-client.js','core/local-service-contract.js',
    'core/discussion-target.js','core/topic-view-mode.js','core/insight-controller.js','core/local-ai-client.js',
    'core/insight-context.js','core/insight-citations.js','core/insight-preferences.js','core/insight-voices.js',
    'core/account-auth-response.js','core/page-content-policy.js','core/discussion-readiness.js','core/discussion-mentions.js',
    'core/active-tab-policy.js','core/page-resolution-contract.js','core/indicator-contract.js',
    'chromium/assistant-voice-picker.js','chromium/popup-shell.js','fixtures/indicator-fixtures.js','fixtures/local-service-fixture-bridge.js','locales/en.js'].map(file=>path.join(EXTENSION,file))];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function pins(){return PIN_FILES.map(file=>{const bytes=readFileSync(file);return {path:path.relative(REPO,file).replaceAll('\\','/'),bytes:bytes.length,sha256:hash(bytes)};});}
function contained(root,target){const relative=path.relative(root,target);return Boolean(relative)&&!relative.startsWith('..')&&!path.isAbsolute(relative);}
function workspaceRoot(){const expected=path.resolve(INTENDED_REPO),actual=path.resolve(REPO),resolved=realpathSync(REPO);
  assert.equal(actual.toLowerCase(),expected.toLowerCase());assert.equal(resolved.toLowerCase(),expected.toLowerCase());return resolved;}
function checkedPath(target){const root=workspaceRoot(),absolute=path.resolve(target);assert.ok(contained(root,absolute));
  let ancestor=absolute;while(!existsSync(ancestor)){const parent=path.dirname(ancestor);assert.notEqual(parent,ancestor);ancestor=parent;}
  const resolved=realpathSync(ancestor);assert.ok(resolved.toLowerCase()===root.toLowerCase()||contained(root,resolved));
  if(existsSync(absolute))assert.ok(contained(root,realpathSync(absolute)));return absolute;}
const ELIGIBLE_TARGETS=new Set(['page','iframe','other','service_worker','worker','shared_worker']);
const AUTO_ATTACH={autoAttach:true,waitForDebuggerOnStart:true,flatten:true,
  filter:[...ELIGIBLE_TARGETS].map(type=>({type,exclude:false})).concat({exclude:true})};
const BOUNDARY_METHODS=new Set(['Target.setAutoAttach','Network.enable','Network.emulateNetworkConditions','Fetch.enable',
  'Runtime.enable','Page.enable','Runtime.runIfWaitingForDebugger','Target.getTargetInfo']);
export async function quarantinePausedSemanticTarget(entry,{verifyIdentity}={}){
  const eligible=()=>entry.waiting===true&&entry.originClass==='extension'&&!entry.resumeIssued&&!entry.ready&&
    entry.recursiveAttachInstalled&&entry.offlineInstalled&&entry.fetchInstalled;
  if(!eligible())throw new Error('Quarantine precondition refused');
  entry.stage='quarantine-identity';if(await verifyIdentity()!==true)throw new Error('Quarantine identity refused');
  if(!eligible())throw new Error('Quarantine precondition refused');
  // No Runtime resume or close command is issued. Exact owned-browser exit is
  // required later before this quarantine can count as retired or QA can pass.
  entry.quarantined=true;entry.stage='quarantined-paused';return true;
}
export async function bindContainedSemanticAlias(entry,owner,{ownedOrigin,verifyIdentity}={}){
  const eligible=()=>owner&&entry.waiting===false&&entry.targetId===owner.targetId&&entry.type===owner.type&&entry.ordinal!==owner.ordinal&&
    entry.originClass==='extension'&&owner.originClass==='extension'&&owner.active===true&&owner.ready===true&&!owner.aliased&&!owner.firstFailure&&
    owner.recursiveAttachInstalled&&owner.offlineInstalled&&owner.fetchInstalled&&typeof ownedOrigin==='string'&&/^chrome-extension:\/\/[a-p]{32}$/u.test(ownedOrigin)&&
    owner.ownedOrigin===ownedOrigin&&entry.targetUrl===owner.targetUrl&&entry.targetUrl.startsWith(ownedOrigin+'/');
  if(!eligible())throw new Error('Alias precondition refused');entry.stage='alias-identity';
  if(await verifyIdentity()!==true)throw new Error('Alias identity refused');if(!eligible())throw new Error('Alias precondition refused');
  // Keep the original active session's Fetch/offline/recursive ownership. The
  // duplicate is merely an alias and receives no Runtime resume command.
  entry.aliased=true;entry.boundTo=owner.ordinal;entry.stage='alias-contained';return true;
}
export function markSemanticSessionDetached(entry,{shutdown=false}={}){
  if(!entry)return false;entry.active=false;
  if(!shutdown&&entry.ownsNetworkBoundaries&&!entry.aliased){entry.unexpectedDetach=true;return true;}return false;
}
export function describeSemanticBoundaryFailure(error){
  if(error===null||typeof error!=='object'||types.isProxy(error))return {code:'boundary-failure'};
  let message;try{message=Object.getOwnPropertyDescriptor(error,'message')?.value;}catch{return {code:'boundary-failure'};}
  if(typeof message!=='string'||message.length>256)return {code:'boundary-failure'};
  const known={'Target cap':'target-cap','Unexpected target type':'unexpected-target-type',
    'Executable target already running':'target-already-executing','Unexpected executable target':'unexpected-target-origin',
    'Foreign extension target':'foreign-extension-target','Quarantine precondition refused':'quarantine-precondition',
    'Quarantine identity refused':'quarantine-identity','Alias precondition refused':'alias-precondition','Alias identity refused':'alias-identity'};
  if(Object.hasOwn(known,message))return {code:known[message]};
  const rejected=/^Chromium protocol rejected ([A-Za-z]+\.[A-Za-z]+) \(code (-?[0-9]{1,10})\)$/u.exec(message);
  if(rejected&&BOUNDARY_METHODS.has(rejected[1])){const numericCode=Number(rejected[2]);if(Number.isInteger(numericCode)&&numericCode>=-2147483648&&numericCode<=2147483647)
    return {code:'protocol-rejected',method:rejected[1],numericCode};}
  for(const [prefix,code] of [['Chromium protocol timeout: ','protocol-timeout'],['Chromium pipe ended during ','pipe-ended'],['Chromium pipe unavailable for ','pipe-unavailable']]){
    if(message.startsWith(prefix)&&BOUNDARY_METHODS.has(message.slice(prefix.length)))return {code,method:message.slice(prefix.length)};
  }
  return {code:'boundary-failure'};
}
const UI_ASSERT_CODES=new Set(['composer-heading-mismatch','horizontal-overflow','composer-content-clipped','topic-button-unreadable']);
export function describeSemanticUiFailure(error){
  if(error===null||typeof error!=='object'||types.isProxy(error))return {code:'ui-step-failed'};
  let code,nativeCode,message;try{
    code=Object.getOwnPropertyDescriptor(error,'smokeCode')?.value;
    nativeCode=Object.getOwnPropertyDescriptor(error,'code')?.value;
    message=Object.getOwnPropertyDescriptor(error,'message')?.value;
  }catch{return {code:'ui-step-failed'};}
  if(UI_ASSERT_CODES.has(code))return {code};
  if(nativeCode==='ERR_ASSERTION')return {code:'assertion-failed'};
  const known={'Browser fixture evaluation failed':'evaluation-failed','Browser fixture state timeout':'state-timeout','Browser boundary failed':'boundary-failed'};
  return {code:typeof message==='string'&&Object.hasOwn(known,message)?known[message]:'ui-step-failed'};
}
function checkUi(condition,code){if(condition)return;const error=new Error('Semantic browser assertion failed');Object.defineProperty(error,'smokeCode',{value:code});throw error;}

// One invented local job only; this port never contacts a provider or service.
// Serialized unchanged into the synthetic page and exercised by pure tests.
export function createSemanticSmokeAiPort({readTarget,digest,expiresAt,onStart=()=>{}}) {
  let job=null,starting=false;
  const articleText='Synthetic foreground Page B article; no native capture authority.';
  return Object.freeze({articleText,
    status:async()=>({connected:true,planEnabled:true,pending:false,account:{clientId:'synthetic-ai-owner',label:'Invented QA account'}}),
    models:async()=>[{slug:'synthetic-model',displayName:'Invented QA model'}],
    async start(request,_actor,{beforeDispatch,signal}={}) {
      if(job||starting||signal?.aborted)throw new Error('Synthetic job unavailable');starting=true;
      try {
        if(typeof beforeDispatch!=='function'||!await beforeDispatch()||signal?.aborted)throw new Error('Synthetic dispatch refused');
        if(request.context?.currentSource?.id!=='reserved-example-com'||request.context.topic.id!=='reserved-domain-demo'||
          request.articleText!==articleText||request.context.discussion.length||!request.semanticTarget)throw new Error('Synthetic evidence refused');
        const target=await readTarget({nodeId:request.semanticTarget.nodeId,topicId:request.semanticTarget.topicId,
          discussionId:'discussion-a',rootId:'root-a',targetId:request.followupQuestionId});
        if(!target||target.rootRevision!==request.semanticTarget.rootRevision||target.targetRevision!==request.semanticTarget.targetRevision)throw new Error('Synthetic target refused');
        const question=target.targetId===target.root.id?target.root:target.root.replies[0];
        const publication={semanticTarget:{...request.semanticTarget},evidence:{sourceId:'reserved-example-com',sourceVersion:'0',operationId:'synthetic-page-b-operation',
          operationDigest:await digest('invented-page-b-operation'),sourceStamp:await digest('invented-page-b-stamp')},
          articleDigest:await digest(articleText),rootDigest:await digest(target.root.body),targetDigest:await digest(question.body),expiresAt};
        if(signal?.aborted||!await beforeDispatch())throw new Error('Synthetic dispatch refused');
        job={operationId:request.operationId,publication};onStart({targetId:request.followupQuestionId,semanticTarget:{...request.semanticTarget}});
        return {operationId:job.operationId,state:'running'};
      }finally{starting=false;}
    },
    async result(operationId){if(job?.operationId!==operationId)throw new Error('Synthetic job missing');
      return {operationId,state:'completed',result:{body:'Invented semantic AI reply to the exact public question.',model:'synthetic-model',citations:[]},semanticPublication:structuredClone(job.publication)};},
    resumable:async()=>null,
    async cancel(operationId){if(job?.operationId===operationId)job=null;return true;},
    release(operationId){if(job?.operationId===operationId)job=null;}
  });
}

// Serialized into the isolated extension page only. All document observations,
// Invented first-page material only. No capture, embedding, backend or native
// authority is issued by these controls; the actual controller owns readiness.
export function createSemanticFirstPageSmokeState(){
  const version={generation:'semantic-browser-generation',revision:7},topic={id:'first-page-topic',title:'First page discussion',kind:'general'};
  const current={actor:'demo-alex',tabId:7,url:'https://example.com/first-page',windowId:2,sessionRevision:1,availability:null,navigation:[]};
  const catalog={version,model:{id:'hand-authored-demo-vectors/1',status:'fixture-only'},
    actors:[{id:'demo-alex',displayName:'Alex',type:'human'},{id:'demo-blair',displayName:'Blair',type:'human'}],topics:[],sources:[]};
  const discussion={version,topic,discussionId:'first-page-discussion',roots:[]};
  current.resolution={phase:'processing',reason:'embedding',tabId:7,url:current.url,documentId:'first-page-document-1',sourceId:null,topicId:null,assignment:null,sequence:1,
    enabled:true,blockedOrigins:[],sessionWindowId:2,currentWindowId:2,sessionRevision:'first-page-capture-1',hostAccess:true,currentOrigin:'https://example.com',
    currentTabId:7,currentUrl:current.url,contextReason:null};
  return {current,catalog,topic,discussion,promote(){
    if(catalog.sources.length)throw new Error('First page already promoted');
    catalog.topics.push(topic);catalog.sources.push({id:'first-page-source',url:current.url,title:'Invented first public page',provenance:'owner-local-page-embedding/v1',topicId:topic.id});
    current.resolution={...current.resolution,phase:'ready',reason:null,sourceId:'first-page-source',topicId:topic.id,assignment:'provisional',sequence:2};
  }};
}
// account identity, service state and attestations below are invented fixtures.
async function bootstrapFixture(createAiPort,createFirstPage,fixtureConfig){
  window.dispatchEvent(new Event('pagehide'));
  const [{mountDiscussionPanel},{mountSemanticTopicWorkspace},{createLocalDiscussionController},{createLocalServiceClient},{lookupIndicatorFixtureByNormalizedUrl},{createInsightController}]=await Promise.all([
    import('./discussion-panel.js'),import('./semantic-topic-workspace.js'),import('../core/local-discussion-controller.js'),
    import('../core/local-service-client.js'),import('../fixtures/indicator-fixtures.js'),import('../core/insight-controller.js')]);
  window.semanticQA={providerCalls:0,providerStarts:[],mount:async(firstPage=false)=>{
    const prior=window.semanticQA.current;prior?.workspace.dispose();prior?.insight.dispose();prior?.controller.dispose();prior?.panel.dispose();
    document.body.replaceChildren();document.body.dataset.uiMode='user';document.body.dataset.uiSurface='sidepanel';document.body.dataset.extensionSurface='sidepanel';
    // Match production host IDs/classes and nesting without CSS overrides. This
    // is a synthetic responsive surface, not a native SidePanel binding claim.
    const main=document.createElement('main'),discoverView=document.createElement('section'),discussionView=document.createElement('section');
    discoverView.id='app-view-discover';discoverView.className='app-view community-view user-only';discussionView.id='app-view-discussion';discussionView.className='app-view';discussionView.hidden=true;
    const discover=document.createElement('section'),semantic=document.createElement('section'),canonical=document.createElement('section');
    semantic.className='semantic-discussion-panel';canonical.id='local-discussion';canonical.className='action-panel';
    const insightsHost=document.createElement('div');insightsHost.id='app-discussion-insights-host';canonical.append(insightsHost);
    const nav=document.createElement('nav');nav.id='app-navigation';nav.className='user-only app-navigation';
    for(const [name,label,hidden] of [['discussion','Discussion',false],['pages','Pages',true],['discover','Discover',false],['private','My chats',false]]){
      const action=document.createElement('button');action.id='app-tab-'+name;action.type='button';action.textContent=label;action.hidden=hidden;action.setAttribute('aria-controls','app-view-'+name);
      if(name==='discover')action.setAttribute('aria-current','page');nav.append(action);
    }
    discoverView.append(discover);discussionView.append(canonical);main.append(nav,discussionView,discoverView);document.body.append(main);
    const first=firstPage?createFirstPage():null;
    let workspace,insight;const current=first?first.current:{actor:'demo-alex',tabId:7,url:'https://example.com/',windowId:2,availability:null,navigation:[]};
    const version={generation:'semantic-browser-generation',revision:7},topic=first?first.topic:{id:'reserved-domain-demo',title:'Foreground Page B topic',kind:'general'};
    const catalog=first?first.catalog:{version,model:{id:'hand-authored-demo-vectors/1',status:'fixture-only'},actors:[{id:'demo-alex',displayName:'Alex',type:'human'},
      {id:'demo-blair',displayName:'Blair',type:'human'}],topics:[topic],sources:[
      {id:'reserved-example-com',url:'https://example.com/',title:'Foreground Page B',provenance:'project-created-reserved-domain-bridge/1',topicId:topic.id},
      {id:'reserved-example-org',url:'https://example.org/',title:'Manual fixture C',provenance:'project-created-reserved-domain-bridge/1',topicId:topic.id}]};
    const discussion=first?first.discussion:{version,topic,discussionId:'foreground-discussion-b',roots:[]};
    const transport=createLocalServiceClient({fetchImpl:globalThis.fetch.bind(globalThis),getToken:()=> 'synthetic-semantic-browser-pairing-only'});
    const client={semanticCapabilities:transport.semanticCapabilities,semanticTopics:transport.semanticTopics,semanticContext:transport.semanticContext,
      semanticFeed:transport.semanticFeed,semanticThread:transport.semanticThread,semanticTarget:transport.semanticTarget,command:transport.command,
      health:async()=>({}),catalog:async()=>structuredClone(catalog),discussion:async()=>structuredClone(discussion),
      related:async()=>({version,model:catalog.model,results:[]}),priorDiscussions:async sourceId=>({version,sourceId,currentTopicId:topic.id,topics:[]})};
    const panel=mountDiscussionPanel(document,canonical);
    const controller=createLocalDiscussionController({client,session:{isPaired:async()=>true},readPostingActor:()=>current.actor,
      ...(first?{readPageResolution:async()=>current.resolution,readPostingSessionRevision:()=>current.sessionRevision}:{}),
      readActiveTab:async()=>({tabId:current.tabId,url:current.url,windowId:current.windowId}),observeTabLifecycle:()=>()=>{},
      lookupByNormalizedUrl:lookupIndicatorFixtureByNormalizedUrl,
      attestActiveContext:async witness=>witness.tabId===current.tabId&&witness.url===current.url&&witness.windowId===current.windowId,
      onStateChange:state=>{panel.render(state);insight?.observe(state);workspace?.observePage(state);}});
    const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
    const aiClient=createAiPort({readTarget:controller.readSemanticFollowupTarget,digest,expiresAt:fixtureConfig.expiresAt,
      onStart:value=>{if(window.semanticQA.providerCalls>=2)throw new Error('Synthetic start cap');window.semanticQA.providerCalls++;window.semanticQA.providerStarts.push(value);}});
    insight=createInsightController({aiClient,shareOnCompletion:true,randomId:()=> 'synthetic-ai-'+(window.semanticQA.providerCalls+1),
      readSemanticFollowupTarget:controller.readSemanticFollowupTarget,
      readArticle:async()=>({url:'https://example.com/',documentId:'invented-document-b',text:aiClient.articleText}),
      attestArticle:async snapshot=>snapshot.sourceId==='reserved-example-com'&&current.actor===snapshot.actorId&&current.tabId===7&&current.url==='https://example.com/',
      shareInsight:async review=>{const accepted=await controller.shareInsight(review);if(accepted)aiClient.release(review.operationId);return accepted;},
      onStateChange:state=>panel.renderInsightState(state)});
    panel.bind(controller);panel.bindInsight(insight);
    const feed=document.querySelector('#discussion-feed');feed.insertBefore(semantic,feed.firstChild);
    const showDiscussion=()=>{discoverView.hidden=true;discussionView.hidden=false;document.querySelector('#app-tab-discover').removeAttribute('aria-current');
      document.querySelector('#app-tab-discussion').setAttribute('aria-current','page');workspace.setActive(false);};
    workspace=mountSemanticTopicWorkspace(document,{discoverRoot:discover,discussionRoot:semantic,client,controller,discussionPanel:panel,
      navigate:value=>{current.navigation.push(value);if(value==='discussion')showDiscussion();},onAvailability:value=>{current.availability=value;}});
    Object.assign(current,{workspace,controller,panel,insight,discover,semantic,canonical,showDiscussion});window.semanticQA.current=current;
    if(first)current.promoteFirstPage=async()=>{first.promote();await controller.updatePageResolution(current.resolution);};
    await controller.setTopicViewMode('classic');await controller.open();workspace.observePage(controller.currentState());workspace.setActive(true);workspace.setConnection(true);
    await insight.checkConnection();await insight.loadModels();
    return true;
  }};
  await window.semanticQA.mount();return true;
}

export function validateSemanticBrowserSmokeSource(){
  // Compilation and module import are inert: no profile, process, browser or IO.
  new Function(`return (${bootstrapFixture.toString()});`);
  new Function(`return (${createSemanticSmokeAiPort.toString()});`);
  new Function(`return (${createSemanticFirstPageSmokeState.toString()});`);
  assert.equal(path.basename(CHROME),'chrome.exe');assert.ok(OUTPUT.startsWith(path.join(REPO,'apps/local-service/data')));
  assert.equal(AUTO_ATTACH.waitForDebuggerOnStart,true);assert.equal(AUTO_ATTACH.flatten,true);
  assert.ok(AUTO_ATTACH.filter.some(row=>row.type==='shared_worker'&&row.exclude===false));
  return {schema:'semantic-workspace-browser-source-check/v1',browserLaunched:false,fixtureCompiles:true};
}

export async function runSemanticWorkspaceBrowserSmoke(){
  // Check the intended D: workspace and existing ancestor chains BEFORE writes.
  checkedPath(DATA);mkdirSync(DATA,{recursive:true});checkedPath(DATA);checkedPath(OUTPUT);mkdirSync(OUTPUT,{recursive:true});checkedPath(OUTPUT);
  const attempt=mkdtempSync(path.join(OUTPUT,'attempt-'));checkedPath(attempt);const startPins=pins();
  checkedPath(path.join(DATA,'semantic-workspace-browser-owned-'));
  const profile=mkdtempSync(path.join(DATA,'semantic-workspace-browser-owned-'));checkedPath(profile);
  const profileResolved=realpathSync(profile),dataResolved=realpathSync(DATA);assert.ok(contained(workspaceRoot(),dataResolved));assert.ok(contained(workspaceRoot(),profileResolved));
  let browser=null,sessionId=null,origin=null,phase='initial',closing=false,timedOut=false,profileRemoved=false;
  const started=Date.now(),failures=[],exceptions=[],screenshots=[],layoutChecks=[],cases=[],interceptions=[],commands=[],pendingTasks=new Set(),targets=new Map(),held=[];
  let uiStep='browser-startup',firstUiFailure=null,syntheticAiEvidence=null;
  const targetGroups=new Map();
  let remoteResponses=0,retiredInterceptions=0,protocolFailure=false,browserVersion=null,initialBlankAccepted=false,extensionLoadStarted=false,firstBoundaryFailure=null;
  let publishOrigin;const originKnown=new Promise(resolve=>{publishOrigin=resolve;});
  const fixtureExpiresAt=Date.now()+120000;
  const mode={capability:'available',context:'classified',holdTarget:false,command:'ok',aiQuestion:null};
  const state={revision:7,replies:[]};
  const version=()=>({generation:'semantic-browser-generation',revision:state.revision});
  const actors=[{id:'demo-alex',displayName:'Alex',type:'human'},{id:'demo-blair',displayName:'Blair',type:'human'}];
  const post=(id,rootId=null,actor='demo-blair',body='Public '+id)=>({id,rootId,replyToId:rootId,state:'visible',actorType:'human',authorId:actor,body,
    createdAt:'2026-10-27T12:00:00.000Z',edited:false});
  const root=()=>({...post('root-a',null,'demo-blair','Original Topic A root\nSecond line stays readable.'),replies:[
    {...post('reply-a','root-a','demo-alex','A real reply page can omit my parent.\nSecond line.'),replyToId:'off-page-parent'},
    {...post('reply-ai','root-a','demo-imported-ai','Long AI text\n'+('Narrow wrapping remains readable. '.repeat(12))),actorType:'agent',insight:{kind:'generated',operatorId:'demo-blair'}},
    {id:'deleted-a',rootId:'root-a',replyToId:'off-page-parent',state:'deleted',label:'Deleted by user'},...state.replies]});
  const topic={id:'canonical-a',title:'Original discussion A',kind:'general'};
  const track=work=>{pendingTasks.add(work);work.finally(()=>pendingTasks.delete(work)).catch(()=>{});return work;};
  const fail=(code)=>{if(failures.length<32)failures.push(code);};
  async function protocol(method,value,session){return browser.send(method,value,session);}
  async function abortRequest(id,session){try{await protocol('Fetch.failRequest',{requestId:id,errorReason:'BlockedByClient'},session);}catch{retiredInterceptions++;}}
  async function fulfill(id,session,status,value){const body=status===204?'':JSON.stringify(value);
    await protocol('Fetch.fulfillRequest',{requestId:id,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json; charset=utf-8'},
      {name:'Access-Control-Allow-Origin',value:origin??'*'},{name:'Access-Control-Allow-Headers',value:'Authorization, Content-Type, X-Demo-Actor, X-Account-Session'},
      {name:'Access-Control-Allow-Methods',value:'POST, GET, OPTIONS'},{name:'Cache-Control',value:'no-store'},
      {name:'X-Murmingle-QA-Intercepted',value:'1'}],body:Buffer.from(body).toString('base64')},session);
  }
  async function intercept({requestId,request},incoming){
    if(interceptions.length>=250){fail('interception-cap');await abortRequest(requestId,incoming);return;}
    const url=new URL(request.url),allowed=url.origin==='http://127.0.0.1:4174'&&url.pathname.startsWith('/v1/');
    const route=allowed?url.pathname:'blocked-external';interceptions.push({phase,method:request.method,path:route});
    if(!allowed||phase!=='fixture'){await abortRequest(requestId,incoming);return;}
    if(request.method==='OPTIONS'){await fulfill(requestId,incoming,204,null);return;}
    if(request.method!=='POST'||(request.postData?.length??0)>16384){fail('unexpected-request-shape');await abortRequest(requestId,incoming);return;}
    const input=JSON.parse(request.postData??'{}');
    if(route==='/v1/semantic/capabilities'){
      await fulfill(requestId,incoming,mode.capability==='legacy'?404:mode.capability==='unauthorized'?401:200,
        mode.capability==='legacy'?{error:'not-found'}:mode.capability==='unauthorized'?{error:'unauthorized'}:{protocol:'semantic-topics/v1'});return;
    }
    if(route==='/v1/semantic/topics'){assert.deepEqual(input,{});await fulfill(requestId,incoming,200,{version:version(),policyRevision:2,
      topics:[{id:'games',title:'Games',path:['games']},{id:'music',title:'Music',path:['music']}]});return;}
    if(route==='/v1/semantic/context'){
      if(mode.context==='error'){await fulfill(requestId,incoming,503,{error:'alternate-unavailable'});return;}
      assert.ok(['reserved-example-com','reserved-example-org','first-page-source'].includes(input.sourceId));const pending=mode.context==='pending'||input.sourceId==='first-page-source';
      await fulfill(requestId,incoming,200,{version:version(),policyRevision:2,sourceId:input.sourceId,sourceVersion:'0',status:pending?'pending':'classified',
        supportedPath:pending?[]:['games'],selectedPath:pending?[]:['games'],topic:pending?null:{id:'games',title:'Games',path:['games']}});return;
    }
    if(route==='/v1/semantic/feed'){
      assert.equal(input.limit,20);assert.equal(input.cursor,null);const value=root();delete value.replies;
      await fulfill(requestId,incoming,200,{version:version(),policyRevision:2,nodeId:input.nodeId,roots:[{topic,discussionId:'discussion-a',root:value}],nextCursor:null,actors:[actors[1]]});return;
    }
    if(route==='/v1/semantic/thread'){
      assert.equal(input.rootId,'root-a');await fulfill(requestId,incoming,200,{version:version(),policyRevision:2,nodeId:input.nodeId,topic,discussionId:'discussion-a',root:root(),nextCursor:null,actors});return;
    }
    if(route==='/v1/semantic/target'){
      if(mode.holdTarget){held.push({requestId,incoming});return;}
      const full=root(),selected=input.targetId==='root-a'?full:full.replies.find(p=>p.id===input.targetId);assert.equal(input.rootId,'root-a');assert.equal(selected.state,'visible');
      const needed=new Set(['demo-blair',selected.actorType==='agent'?selected.insight.operatorId:selected.authorId]);
      await fulfill(requestId,incoming,200,{version:version(),policyRevision:2,nodeId:input.nodeId,topic,discussionId:'discussion-a',
        root:{...full,replies:input.targetId==='root-a'?[]:[selected]},targetId:input.targetId,rootRevision:3,targetRevision:input.targetId==='root-a'?3:input.targetId==='reply-a'?2:1,
        actors:actors.filter(actor=>needed.has(actor.id))});return;
    }
    if(route==='/v1/commands'){
      const command=input.command;assert.equal(command.discussionId,'discussion-a');assert.equal(command.rootId,'root-a');
      assert.equal(command.originSourceId,null);
      if(command.type==='reply'){
        assert.equal(command.replyToId,'reply-a');assert.deepEqual(command.semanticTarget,{nodeId:'music',topicId:'canonical-a',rootRevision:3,targetRevision:2});
      }else{
        assert.equal(command.type,'share-insight-reply');assert.equal(command.topicId,'canonical-a');assert.equal(command.replyToId,mode.aiQuestion);
        assert.equal(command.body,'Invented semantic AI reply to the exact public question.');
        const target=root().replies.find(reply=>reply.id===command.replyToId);assert.ok(target);
        assert.deepEqual(command.semanticPublication,{semanticTarget:{nodeId:'music',topicId:'canonical-a',rootRevision:3,targetRevision:command.replyToId==='reply-a'?2:1},
          evidence:{sourceId:'reserved-example-com',sourceVersion:'0',operationId:'synthetic-page-b-operation',
            operationDigest:hash('invented-page-b-operation'),sourceStamp:hash('invented-page-b-stamp')},
          articleDigest:hash('Synthetic foreground Page B article; no native capture authority.'),rootDigest:hash(root().body),targetDigest:hash(target.body),expiresAt:fixtureExpiresAt});
      }
      commands.push(structuredClone(input));state.revision++;
      const accepted=post('accepted-'+commands.length,'root-a',command.type==='reply'?'demo-alex':'demo-imported-ai',command.body);
      if(command.type==='share-insight-reply'){accepted.actorType='agent';accepted.insight={kind:'generated',operatorId:'demo-alex'};}
      accepted.replyToId=command.replyToId;state.replies.push(accepted);
      if(mode.command==='ambiguous'){await abortRequest(requestId,incoming);return;}
      await fulfill(requestId,incoming,200,{version:version(),result:{contributionId:'accepted-'+commands.length}});return;
    }
    fail(route.startsWith('/v1/ai')?'provider-request':'unexpected-fixture-route');await abortRequest(requestId,incoming);
  }
  async function evaluate(expression){const value=await browser.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);
    if(value.exceptionDetails)throw new Error('Browser fixture evaluation failed');return value.result.value;}
  async function waitFor(expression){const limit=Date.now()+9000;while(Date.now()<limit){if(timedOut||protocolFailure)throw new Error('Browser boundary failed');if(await evaluate(expression))return;await pause(40);}throw new Error('Browser fixture state timeout');}
  async function capture(width){uiStep='layout-'+width;await browser.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},sessionId);await pause(100);
    const layout=await evaluate(`(()=>{const ids=['app-view-discussion','local-discussion','discussion-feed','discussion-root-dock','discussion-composer','discussion-body','discussion-reply-context','discussion-submit','discussion-mention-status','discussion-origin-disclosure','discussion-ai-insights','semantic-context-results'];
      const luminance=color=>{const rgb=color.match(/[0-9.]+/g)?.map(Number);if(!rgb||rgb.length<3||rgb.length>3&&rgb[3]!==1)return null;
        const linear=rgb.slice(0,3).map(value=>{const v=value/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];};
      return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.getBoundingClientRect().width,
        overflow:document.documentElement.scrollWidth>innerWidth,surface:document.body.dataset.uiSurface==='sidepanel'?'sidepanel':document.body.dataset.uiSurface==='popup'?'popup':'other',
        elements:ids.map(id=>{const node=document.getElementById(id);if(!node)return {id,present:false};const r=node.getBoundingClientRect();return {id,present:true,hidden:node.hidden,
          visible:r.width>0&&r.height>0&&getComputedStyle(node).visibility==='visible',
          left:Math.round(r.left*100)/100,right:Math.round(r.right*100)/100,width:Math.round(r.width*100)/100,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth};}),
        semanticHostInsideFeed:document.querySelector('.semantic-discussion-panel')?.parentElement?.id==='discussion-feed',
        composerDocked:document.querySelector('#discussion-composer')?.parentElement?.id==='discussion-root-dock',
        replyHeadingVisible:(()=>{const n=document.querySelector('.discussion-new-thread-heading');if(!n)return false;const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(n).visibility==='visible';})(),
        buttonContrast:['semantic-workspace-saved-toggle','semantic-context-back','semantic-context-refresh','discussion-ai-insights'].map(id=>{const node=document.getElementById(id);
          if(!node)return {id,present:false};const style=getComputedStyle(node),r=node.getBoundingClientRect(),fg=luminance(style.color),bg=luminance(style.backgroundColor);
          return {id,present:true,visible:r.width>0&&r.height>0&&style.visibility==='visible',disabled:node.disabled,
            ratio:fg===null||bg===null?null:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)};})};})()`);
    layoutChecks.push(layout);
    // Preserve the failing image and metrics BEFORE asserting overflow.
    const result=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId),name='semantic-'+width+'.png';checkedPath(attempt);writeFileSync(checkedPath(path.join(attempt,name)),Buffer.from(result.data,'base64'),{flag:'wx'});screenshots.push({name,...layout});
    checkUi(!layout.overflow,'horizontal-overflow');
    const byId=Object.fromEntries(layout.elements.map(item=>[item.id,item])),composer=byId['discussion-composer'];
    const context=byId['discussion-reply-context'],body=byId['discussion-body'],dock=byId['discussion-root-dock'];
    checkUi(layout.replyHeadingVisible&&composer.visible&&context.visible&&body.visible&&byId['discussion-submit'].visible&&context.width>=composer.clientWidth*.8&&
      composer.scrollWidth<=composer.clientWidth+1&&context.scrollWidth<=context.clientWidth+1&&dock.scrollWidth<=dock.clientWidth+1&&
      ['discussion-body','discussion-reply-context','discussion-submit','discussion-mention-status','discussion-origin-disclosure'].every(id=>{
        const item=byId[id];return item.hidden||item.visible&&item.left>=composer.left&&item.right<=composer.right;
      }),'composer-content-clipped');
    checkUi(byId['discussion-ai-insights'].visible&&byId['discussion-ai-insights'].left>=composer.left&&byId['discussion-ai-insights'].right<=composer.right,'composer-content-clipped');
    checkUi(layout.buttonContrast.every(item=>item.present&&item.visible&&!item.disabled&&item.ratio>=4.5),'topic-button-unreadable');}
  const timer=setTimeout(()=>{timedOut=true;void browser?.close();},120000);
  let outcome='failed';
  try{
    checkedPath(profile);checkedPath(attempt);workspaceRoot();
    browser=launchChromiumPipe({executable:CHROME,profileDirectory:profile});const detected=await browser.send('Browser.getVersion');
    browserVersion={product:detected.product,protocolVersion:detected.protocolVersion};
    browser.on('Runtime.exceptionThrown',(_event,incoming)=>{if(exceptions.length<64)exceptions.push({phase,target:targets.get(incoming)?.type??'unknown'});});
    browser.on('Network.responseReceived',({response})=>{if(/^https?:/u.test(response.url)){remoteResponses++;const headers=Object.fromEntries(Object.entries(response.headers??{}).map(([k,v])=>[k.toLowerCase(),v]));if(headers['x-murmingle-qa-intercepted']!=='1')fail('unintercepted-response');}});
    browser.on('Fetch.requestPaused',(event,incoming)=>{track(intercept(event,incoming).catch(async()=>{fail('interception-failed');await abortRequest(event.requestId,incoming);}));});
    browser.on('Target.detachedFromTarget',({sessionId:detached})=>{const entry=targets.get(detached);
      if(markSemanticSessionDetached(entry,{shutdown:closing||protocolFailure||timedOut})){
        entry.firstFailure??={stage:'session-detached',code:'contained-owner-detached'};
        firstBoundaryFailure??={ordinal:entry.ordinal,type:entry.type,waiting:entry.waiting,originClass:entry.originClass,...entry.firstFailure};
        protocolFailure=true;fail('contained-owner-detached');void browser.close();
      }});
    browser.on('Target.attachedToTarget',({sessionId:attached,targetInfo,waitingForDebugger})=>{
      if(targets.size>=32){protocolFailure=true;fail('target-cap');void browser.close();return;}
      let group=targetGroups.get(targetInfo.targetId);
      if(!group){group={firstOrdinal:targets.size+1,resumeIssued:false,quarantineStarted:false,owner:null};targetGroups.set(targetInfo.targetId,group);}
      const entry={ordinal:targets.size+1,type:ELIGIBLE_TARGETS.has(targetInfo.type)?targetInfo.type:'unexpected',targetId:targetInfo.targetId,
        waiting:waitingForDebugger===true,originClass:targetInfo.url==='about:blank'?'blank':/^chrome-extension:\/\//u.test(targetInfo.url)?'extension':'other',
        targetUrl:targetInfo.url,active:true,ownedOrigin:null,ownsNetworkBoundaries:false,unexpectedDetach:false,aliased:false,boundTo:null,
        stage:'validate-target-count',ready:false,resumeIssued:false,quarantined:false,duplicateOf:group.firstOrdinal===targets.size+1?null:group.firstOrdinal,firstFailure:null};targets.set(attached,entry);
      entry.setup=track((async()=>{
        if(targets.size>32)throw new Error('Target cap');
        entry.stage='validate-target-type';
        if(!ELIGIBLE_TARGETS.has(targetInfo.type))throw new Error('Unexpected target type');
        entry.stage='validate-waiting';
        const initialBlank=!waitingForDebugger&&!extensionLoadStarted&&!initialBlankAccepted&&targetInfo.type==='page'&&
          targetInfo.url==='about:blank'&&!targetInfo.openerId&&!targetInfo.openerFrameId;
        if(initialBlank)initialBlankAccepted=true;
        if(!waitingForDebugger&&!initialBlank){const owner=group.owner;if(!owner)throw new Error('Executable target already running');
          entry.stage='bind-contained-alias';if(!owner.ready&&owner.setup)await owner.setup;
          await bindContainedSemanticAlias(entry,owner,{ownedOrigin:origin,verifyIdentity:async()=>{
            const current=await protocol('Target.getTargetInfo',{targetId:entry.targetId});const info=current?.targetInfo;
            return !closing&&!protocolFailure&&owner.active&&info?.attached===true&&info?.targetId===owner.targetId&&info?.type===targetInfo.type&&info?.url===entry.targetUrl;
          }});return;
        }
        entry.stage='validate-origin';
        const extensionUrl=/^chrome-extension:\/\/[a-p]{32}\//u.test(targetInfo.url);
        if(!initialBlank&&!(targetInfo.url==='about:blank'&&['page','iframe'].includes(targetInfo.type))&&
          !(extensionUrl&&extensionLoadStarted))throw new Error('Unexpected executable target');
        // A paused foreign extension may proceed only to containment/quarantine.
        // It still cannot pass the exact owned-origin execution gate below.
        // Browser-scope attachment does not cover every descendant. Install the
        // same paused recursive policy on EACH eligible attached target first.
        entry.stage='recursive-auto-attach';await protocol('Target.setAutoAttach',AUTO_ATTACH,attached);entry.recursiveAttachInstalled=true;
        // Install both boundaries before any new extension target executes.
        entry.stage='network-enable';await protocol('Network.enable',{},attached);
        entry.stage='network-offline';await protocol('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0},attached);
        entry.offlineInstalled=true;
        entry.stage='fetch-enable';await protocol('Fetch.enable',{patterns:[{urlPattern:'http://*',requestStage:'Request'},{urlPattern:'https://*',requestStage:'Request'}]},attached);
        entry.fetchInstalled=true;
        // Extension workers can attach before loadUnpacked returns its ID. They
        // stay paused until that exact owned origin is known and checked.
        if(extensionUrl){entry.stage='await-owned-origin';const ownedOrigin=origin??await originKnown;if(closing||!ownedOrigin)throw new Error('Foreign extension target');
          if(!targetInfo.url.startsWith(ownedOrigin+'/')){
            group.quarantineStarted=true;await quarantinePausedSemanticTarget(entry,{
              verifyIdentity:async()=>{const current=await protocol('Target.getTargetInfo',{targetId:entry.targetId});const info=current?.targetInfo;
                return !closing&&!group.resumeIssued&&info?.targetId===entry.targetId&&info?.type===targetInfo.type&&info?.url===targetInfo.url&&
                  /^chrome-extension:\/\/[a-p]{32}\//u.test(info.url)&&!info.url.startsWith(ownedOrigin+'/');}});return;
          }entry.ownedOrigin=ownedOrigin;entry.ownsNetworkBoundaries=true;group.owner??=entry;
        }
        if(group.quarantineStarted)throw new Error('Foreign extension target');
        entry.stage='runtime-enable';await protocol('Runtime.enable',{},attached);
        if(targetInfo.type==='page'){entry.stage='page-enable';await protocol('Page.enable',{},attached);}
        if(group.quarantineStarted)throw new Error('Foreign extension target');
        if(waitingForDebugger){entry.stage='resume';entry.resumeIssued=true;group.resumeIssued=true;await protocol('Runtime.runIfWaitingForDebugger',{},attached);}
        entry.ready=true;entry.stage='ready';
      })().catch(error=>{
        entry.firstFailure??={stage:entry.stage,...describeSemanticBoundaryFailure(error)};
        firstBoundaryFailure??={ordinal:entry.ordinal,type:entry.type,waiting:entry.waiting,originClass:entry.originClass,...entry.firstFailure};
        protocolFailure=true;fail('target-boundary-installation');void browser.close();}));
    });
    await browser.send('Target.setDiscoverTargets',{discover:true});
    await browser.send('Target.setAutoAttach',AUTO_ATTACH);
    extensionLoadStarted=true;const loaded=await browser.send('Extensions.loadUnpacked',{path:EXTENSION});origin='chrome-extension://'+loaded.id;publishOrigin(origin);
    const target=await browser.send('Target.createTarget',{url:'about:blank'}),deadline=Date.now()+9000;
    while(!sessionId&&Date.now()<deadline){sessionId=[...targets.entries()].find(([,entry])=>entry.targetId===target.targetId&&entry.ready)?.[0];if(!sessionId)await pause(25);}
    assert.ok(sessionId);uiStep='packaged-popup-unpaired';await browser.send('Page.navigate',{url:origin+'/chromium/popup.html'},sessionId);
    await waitFor(`document.readyState==='complete'&&Boolean(document.querySelector('#discussion-composer'))`);await pause(300);
    assert.equal(exceptions.length,0);cases.push('actual-packaged-popup-unpaired-no-runtime-exceptions');
    phase='fixture';uiStep='fixture-bootstrap';await evaluate(`(${bootstrapFixture.toString()})((${createSemanticSmokeAiPort.toString()}),(${createSemanticFirstPageSmokeState.toString()}),${JSON.stringify({expiresAt:fixtureExpiresAt})})`);
    uiStep='fixture-ready';
    await waitFor(`window.semanticQA.current.availability==='available'&&Boolean(document.querySelector('#semantic-discover-open-music'))&&Boolean(document.querySelector('#semantic-context-thread-root-a'))`);
    uiStep='global-source-independence';const topicsBefore=interceptions.filter(item=>item.path==='/v1/semantic/topics').length;
    await evaluate(`semanticQA.current.controller.selectSource('reserved-example-org')`);await evaluate(`semanticQA.current.controller.selectSource('reserved-example-com')`);await pause(100);
    assert.equal(interceptions.filter(item=>item.path==='/v1/semantic/topics').length,topicsBefore);cases.push('global-directory-independent-of-source-selection');
    uiStep='global-feed';await evaluate(`document.querySelector('#semantic-discover-open-music').click()`);await waitFor(`Boolean(document.querySelector('#semantic-discover-thread-root-a'))`);
    uiStep='global-thread';await evaluate(`document.querySelector('#semantic-discover-thread-root-a').click()`);await waitFor(`Boolean(document.querySelector('#semantic-discover-reply-reply-a'))`);
    uiStep='flat-replies';
    const flat=await evaluate(`(()=>{const p=document.querySelector('#semantic-discover-results'),replies=p.children[1];return {count:replies.children.length,flat:[...replies.children].every(n=>!n.querySelector('article')),inset:replies.style.marginInlineStart,deleted:replies.children[2].textContent};})()`);
    assert.ok(flat.count>=3);assert.equal(flat.flat,true);assert.equal(flat.inset,'1rem');assert.equal(flat.deleted,'Deleted by user');cases.push('real-dom-flat-replies-minimal-tombstone');assert.equal(await evaluate(`semanticQA.providerCalls`),0);
    uiStep='reply-handoff';await evaluate(`document.querySelector('#semantic-discover-reply-reply-a').click()`);await waitFor(`semanticQA.current.controller.currentState().draft.semantic===true&&Boolean(document.querySelector('#semantic-context-reply-reply-a'))`);
    uiStep='composer-body';
    await evaluate(`(()=>{const body=document.querySelector('#discussion-body');body.value='Browser QA plain human reply from Page B';body.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    for(const width of [320,400,520])await capture(width);
    uiStep='composer-heading';checkUi(await evaluate(`document.querySelector('.discussion-new-thread-heading').textContent.includes('Original discussion A')`),'composer-heading-mismatch');
    uiStep='human-submit';await evaluate(`document.querySelector('#discussion-composer').requestSubmit()`);await waitFor(`semanticQA.current.controller.currentState().draft.body===''&&Boolean(document.querySelector('[data-post-id="accepted-1"]'))`);
    uiStep='human-destination';
    assert.equal(commands.length,1);assert.equal(await evaluate(`semanticQA.providerCalls`),0);
    const foreground=await evaluate(`(()=>{const s=semanticQA.current.controller.currentState();return {sourceId:s.sourceId,topicId:s.topicId,rootAInPageB:s.discussion.roots.some(r=>r.id==='root-a')};})()`);
    assert.deepEqual(foreground,{sourceId:'reserved-example-com',topicId:'reserved-domain-demo',rootAInPageB:false});cases.push('human-original-target-null-origin-revision-witness-no-ai');
    uiStep='uncertainty-reply';mode.command='ambiguous';await evaluate(`document.querySelector('#semantic-context-reply-reply-a').click()`);await waitFor(`semanticQA.current.controller.currentState().draft.semantic===true`);
    uiStep='uncertainty-submit';
    await evaluate(`(()=>{const body=document.querySelector('#discussion-body');body.value='Synthetic possibly committed reply';body.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#discussion-composer').requestSubmit();})()`);
    await waitFor(`semanticQA.current.controller.currentState().semanticWritePending===true`);assert.equal(commands.length,2);
    uiStep='uncertainty-refresh';await evaluate(`document.querySelector('#semantic-context-refresh').click()`);await waitFor(`Boolean(document.querySelector('[data-post-id="accepted-2"]'))`);
    uiStep='uncertainty-ack';
    await evaluate(`(()=>{const check=document.querySelector('#discussion-semantic-checked');check.checked=true;check.dispatchEvent(new Event('change'));document.querySelector('#discussion-semantic-continue').click();})()`);
    await waitFor(`!semanticQA.current.controller.currentState().semanticWritePending&&!semanticQA.current.controller.currentState().needsFreshRead`);assert.equal(commands.length,2);cases.push('uncertainty-checked-acknowledgement-no-repost');mode.command='ok';
    uiStep='semantic-ai-button-mount';await evaluate(`semanticQA.mount()`);await waitFor(`Boolean(document.querySelector('#semantic-discover-open-music'))`);
    await evaluate(`document.querySelector('#semantic-discover-open-music').click()`);await waitFor(`Boolean(document.querySelector('#semantic-discover-thread-root-a'))`);
    await evaluate(`document.querySelector('#semantic-discover-thread-root-a').click()`);await waitFor(`Boolean(document.querySelector('#semantic-discover-reply-reply-a'))`);
    await evaluate(`document.querySelector('#semantic-discover-reply-reply-a').click()`);await waitFor(`semanticQA.current.controller.currentState().draft.semantic===true`);
    uiStep='semantic-ai-button';mode.aiQuestion='reply-a';
    await evaluate(`(()=>{const body=document.querySelector('#discussion-body');body.value='Keep this unsent human draft private';body.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#discussion-ai-insights').click();})()`);
    await waitFor(`semanticQA.providerCalls===1&&semanticQA.current.insight.currentState().status==='shared'`);
    assert.equal(commands.length,3);assert.equal(commands[2].command.type,'share-insight-reply');assert.equal(commands[2].command.replyToId,'reply-a');
    assert.equal(await evaluate(`semanticQA.current.controller.currentState().draft.body`),'Keep this unsent human draft private');
    assert.equal(JSON.stringify(commands[2]).includes('Keep this unsent human draft private'),false);
    syntheticAiEvidence=await evaluate(`({starts:semanticQA.providerCalls,targetIds:semanticQA.providerStarts.map(item=>item.targetId)})`);
    assert.deepEqual(syntheticAiEvidence,{starts:1,targetIds:['reply-a']});
    assert.equal(await evaluate(`semanticQA.current.controller.currentState().discussion.roots.some(root=>root.id==='root-a')`),false);
    cases.push('released-selected-ai-button-exact-target-preserves-unsent-human-draft');
    uiStep='semantic-ai-mention';mode.aiQuestion='accepted-4';
    await evaluate(`(()=>{const body=document.querySelector('#discussion-body');body.value='New accepted human question @AI';body.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#discussion-composer').requestSubmit();})()`);
    await waitFor(`semanticQA.providerCalls===2&&semanticQA.current.insight.currentState().status==='shared'`);
    assert.equal(commands.length,5);assert.equal(commands[3].command.type,'reply');assert.equal(commands[4].command.type,'share-insight-reply');
    assert.equal(commands[4].command.replyToId,'accepted-4');assert.equal(commands[4].command.rootId,'root-a');assert.equal(commands[4].command.originSourceId,null);
    syntheticAiEvidence=await evaluate(`({starts:semanticQA.providerCalls,targetIds:semanticQA.providerStarts.map(item=>item.targetId)})`);
    assert.deepEqual(syntheticAiEvidence,{starts:2,targetIds:['reply-a','accepted-4']});
    assert.deepEqual(await evaluate(`(()=>{const s=semanticQA.current.controller.currentState();return {sourceId:s.sourceId,topicId:s.topicId,rootAInPageB:s.discussion.roots.some(root=>root.id==='root-a')};})()`),
      {sourceId:'reserved-example-com',topicId:'reserved-domain-demo',rootAInPageB:false});
    cases.push('released-human-ai-mention-new-accepted-question-one-generated-same-thread-reply');
    for(const value of ['legacy','unauthorized']){uiStep='capability-'+value;mode.capability=value;await evaluate(`semanticQA.mount()`);await waitFor(`semanticQA.current.availability===${JSON.stringify(value==='legacy'?'legacy':'error')}`);cases.push('capability-'+value);}
    mode.capability='available';
    for(const value of ['pending','error']){uiStep='context-'+value;mode.context=value;await evaluate(`semanticQA.mount()`);await waitFor(`semanticQA.current.availability==='available'&&Boolean(document.querySelector('#semantic-discover-open-music'))`);await evaluate('semanticQA.current.showDiscussion()');await pause(120);
      assert.equal(await evaluate(`semanticQA.current.semantic.hidden`),value!=='error');assert.equal(await evaluate(`document.querySelector('#discussion-feed .discussion-thread').hidden`),false);cases.push('context-'+value+'-canonical-fallback');}
    mode.context='classified';
    for(const value of ['navigation','account']){uiStep='stale-'+value;await evaluate(`semanticQA.mount()`);await waitFor(`Boolean(document.querySelector('#semantic-discover-open-music'))`);
      await evaluate(`document.querySelector('#semantic-discover-open-music').click()`);await waitFor(`Boolean(document.querySelector('#semantic-discover-reply-root-a'))`);mode.holdTarget=true;
      await evaluate(`document.querySelector('#semantic-discover-reply-root-a').click()`);const end=Date.now()+5000;while(!held.length&&Date.now()<end)await pause(25);assert.ok(held.length);
      await evaluate(value==='navigation'?`(()=>{semanticQA.current.tabId=99;semanticQA.current.controller.invalidateContext();})()`:
        `(()=>{semanticQA.current.actor='demo-blair';semanticQA.current.controller.accountChanged();})()`);
      mode.holdTarget=false;while(held.length){const item=held.shift();await abortRequest(item.requestId,item.incoming);}await pause(100);
      assert.equal(await evaluate(`semanticQA.current.navigation.length`),0);assert.equal(commands.length,5);cases.push('stale-'+value+'-handoff-refused');}
    uiStep='first-page-local-typing';await evaluate(`semanticQA.mount(true)`);await evaluate(`semanticQA.current.showDiscussion()`);
    await waitFor(`semanticQA.current.controller.currentState().localRootDraftReady===true`);
    assert.deepEqual(await evaluate(`(()=>{const s=semanticQA.current.controller.currentState(),body=document.querySelector('#discussion-body'),composer=document.querySelector('#discussion-composer');
      body.focus();return {sourceId:s.sourceId,topicId:s.topicId,rootMode:s.draft.mode,posting:s.humanPostingReady,shown:!composer.hidden&&body.getBoundingClientRect().width>0,
        enabled:!body.disabled,submit:document.querySelector('#discussion-submit').disabled,ai:document.querySelector('#discussion-ai-insights').disabled,private:document.querySelector('#discussion-private-toggle').disabled};})()`),
      {sourceId:null,topicId:null,rootMode:'root',posting:false,shown:true,enabled:true,submit:true,ai:true,private:true});
    await browser.send('Input.insertText',{text:'First page text before invented model completion'},sessionId);
    await waitFor(`semanticQA.current.controller.currentState().draft.body==='First page text before invented model completion'`);
    await evaluate(`document.querySelector('#discussion-composer').requestSubmit()`);assert.equal(commands.length,5);assert.equal(await evaluate(`semanticQA.providerCalls`),2);
    cases.push('first-seen-local-root-draft-no-delivery');
    uiStep='first-page-canonical-promotion-ime';
    await evaluate(`(()=>{const body=document.querySelector('#discussion-body');body.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));
      body.value+=' 未完';body.setSelectionRange(6,11,'backward');semanticQA.firstPageSelection={start:body.selectionStart,end:body.selectionEnd,direction:body.selectionDirection};})()`);
    await evaluate(`semanticQA.current.promoteFirstPage()`);await waitFor(`semanticQA.current.controller.currentState().phase==='ready'`);
    assert.deepEqual(await evaluate(`(()=>{const body=document.querySelector('#discussion-body'),s=semanticQA.current.controller.currentState();
      return {text:body.value,stored:s.draft.body,focused:document.activeElement===body,selection:{start:body.selectionStart,end:body.selectionEnd,direction:body.selectionDirection},
        sourceId:s.sourceId,topicId:s.topicId,detached:s.draft.detached};})()`),
      {text:'First page text before invented model completion 未完',stored:'First page text before invented model completion',focused:true,
        selection:{start:6,end:11,direction:'backward'},sourceId:'first-page-source',topicId:'first-page-topic',detached:false});
    await evaluate(`(()=>{const body=document.querySelector('#discussion-body');body.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'未完'}));})()`);
    await waitFor(`semanticQA.current.controller.currentState().draft.body==='First page text before invented model completion 未完'`);
    assert.equal(commands.length,5);assert.equal(await evaluate(`semanticQA.providerCalls`),2);cases.push('first-seen-same-document-canonical-promotion-preserves-ime-selection');
    uiStep='first-page-session-detach';await evaluate(`semanticQA.mount(true)`);await evaluate(`semanticQA.current.showDiscussion()`);
    await waitFor(`semanticQA.current.controller.currentState().localRootDraftReady===true`);
    await evaluate(`(()=>{const body=document.querySelector('#discussion-body');body.focus();body.value='Keep this same-account session draft';body.dispatchEvent(new Event('input',{bubbles:true}));
      semanticQA.current.sessionRevision++;semanticQA.current.controller.accountChanged();})()`);
    await waitFor(`semanticQA.current.controller.currentState().draft.detached===true`);
    assert.deepEqual(await evaluate(`(()=>{const s=semanticQA.current.controller.currentState();return {actor:semanticQA.current.actor,text:s.draft.body,detached:s.draft.detached,
      staging:s.localRootDraftReady,submit:document.querySelector('#discussion-submit').disabled};})()`),
      {actor:'demo-alex',text:'Keep this same-account session draft',detached:true,staging:false,submit:true});
    await evaluate(`document.querySelector('#discussion-composer').requestSubmit()`);assert.equal(commands.length,5);cases.push('first-seen-same-account-session-change-detaches');
    uiStep='first-page-document-detach';await evaluate(`semanticQA.mount(true)`);await evaluate(`semanticQA.current.showDiscussion()`);
    await waitFor(`semanticQA.current.controller.currentState().localRootDraftReady===true`);
    await evaluate(`(async()=>{const body=document.querySelector('#discussion-body');body.value='Keep the original document draft';body.dispatchEvent(new Event('input',{bubbles:true}));
      semanticQA.current.resolution={...semanticQA.current.resolution,documentId:'first-page-document-2',sequence:2};await semanticQA.current.controller.updatePageResolution(semanticQA.current.resolution);})()`);
    assert.deepEqual(await evaluate(`(()=>{const s=semanticQA.current.controller.currentState();return {text:s.draft.body,detached:s.draft.detached,staging:s.localRootDraftReady,
      submit:document.querySelector('#discussion-submit').disabled};})()`),{text:'Keep the original document draft',detached:true,staging:false,submit:true});
    await evaluate(`document.querySelector('#discussion-composer').requestSubmit()`);assert.equal(commands.length,5);cases.push('first-seen-replacement-document-detaches');
    uiStep='final-guards';assert.equal(cases.length,17);assert.equal(await evaluate(`semanticQA.providerCalls`),2);assert.equal(exceptions.length,0);assert.deepEqual(failures,[]);assert.equal(protocolFailure,false);assert.deepEqual(pins(),startPins);
    outcome='passed';
  }catch(error){firstUiFailure={step:uiStep,...describeSemanticUiFailure(error)};fail('browser-smoke-incomplete');}
  finally{
    clearTimeout(timer);closing=true;publishOrigin(null);let closeReturned=false,ownedProcessExited=false;
    if(browser){try{await browser.close();closeReturned=true;}catch{fail('browser-close-failed');}ownedProcessExited=browser.hasExited===true;}
    await Promise.allSettled([...pendingTasks]);if(!ownedProcessExited)fail('owned-browser-retirement-unverified');
    // Delete only the fresh profile we created, after browser retirement and a
    // second resolved-path containment check. Artifacts remain immutable.
    try{assert.equal(ownedProcessExited,true);checkedPath(profile);checkedPath(DATA);assert.ok(contained(workspaceRoot(),profileResolved));assert.ok(contained(workspaceRoot(),dataResolved));
      assert.equal(realpathSync(profile),profileResolved);assert.equal(realpathSync(DATA),dataResolved);
      const relative=path.relative(dataResolved,profileResolved);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
      assert.ok(path.basename(profileResolved).startsWith('semantic-workspace-browser-owned-'));assert.equal(lstatSync(profileResolved).isSymbolicLink(),false);
      rmSync(profileResolved,{recursive:true,force:false,maxRetries:3,retryDelay:100});profileRemoved=true;
    }catch{if(ownedProcessExited)fail('owned-profile-cleanup-unverified');}
    let endPins=null;try{endPins=pins();if(JSON.stringify(endPins)!==JSON.stringify(startPins))fail('source-pins-changed');}catch{fail('source-end-pins-unreadable');}
    const allExecutableTargetsContained=targets.size>0&&[...targets.values()].every(entry=>{
      if(entry.unexpectedDetach)return false;
      if(entry.aliased){const owner=targetGroups.get(entry.targetId)?.owner;return owner?.ordinal===entry.boundTo&&owner.ready&&!owner.firstFailure&&!owner.unexpectedDetach&&
        (owner.active||ownedProcessExited)&&owner.recursiveAttachInstalled&&owner.offlineInstalled&&owner.fetchInstalled;}
      return entry.recursiveAttachInstalled&&entry.offlineInstalled&&entry.fetchInstalled&&
        (entry.ready||entry.quarantined&&entry.waiting&&!entry.resumeIssued&&ownedProcessExited);});
    if(!allExecutableTargetsContained)fail('target-containment-unverified');
    const result={schema:'semantic-workspace-browser-qa/v1',outcome:failures.length?'failed':outcome,scope:'Synthetic browser composition; no SQL, E5, cold-start latency, actual document attestation, provider, quality, load or live posting authority.',
      elapsedMs:Date.now()-started,timedOut,closing,closeReturned,ownedProcessExited,profileRemoved,ownedProfileRetained:!profileRemoved,
      uiStep,firstUiFailure,layoutChecks,syntheticAiEvidence,fixtureSurface:'synthetic-sidepanel-production-hosts-no-native-binding',
      attempt:path.relative(REPO,attempt).replaceAll('\\','/'),continuedHttpRequests:0,
      offlineAllTargets:targets.size>0&&[...targets.values()].every(entry=>entry.offlineInstalled&&entry.fetchInstalled&&entry.recursiveAttachInstalled),targets:targets.size,httpResponsesObserved:remoteResponses,browserVersion,syntheticAiPublications:commands.filter(item=>item.command.type==='share-insight-reply').length,
      physicalTargets:targetGroups.size,quarantinedTargets:new Set([...targets.values()].filter(entry=>entry.quarantined).map(entry=>entry.targetId)).size,
      quarantinedTargetsRetired:ownedProcessExited,quarantineMode:'paused-until-owned-exit',
      quarantineScope:'Foreign extension targets verified debugger-paused after network containment, never resumed; retirement requires the exact owned-browser exit event. No identity or cause attribution.',
      aliasAttachments:[...targets.values()].filter(entry=>entry.aliased).length,
      aliasScope:'Duplicate CDP attachments only, bound to the same exact owned physical target and original active contained session. No additional resume; unexpected owner detach fails closed.',
      allExecutableTargetsContained,
      firstBoundaryFailure,targetStates:[...targets.values()].map(entry=>({ordinal:entry.ordinal,type:entry.type,waiting:entry.waiting,originClass:entry.originClass,
        stage:entry.stage,ready:entry.ready,recursiveAttachInstalled:entry.recursiveAttachInstalled===true,offlineInstalled:entry.offlineInstalled===true,
        fetchInstalled:entry.fetchInstalled===true,resumeIssued:entry.resumeIssued,quarantined:entry.quarantined,duplicateOf:entry.duplicateOf,
        active:entry.active,aliased:entry.aliased,boundTo:entry.boundTo,unexpectedDetach:entry.unexpectedDetach,firstFailure:entry.firstFailure})),
      interceptions,retiredInterceptions,commands,cases,exceptions,failures,screenshots,sourcePins:startPins,endPins};
    checkedPath(attempt);writeFileSync(checkedPath(path.join(attempt,'result.json')),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    if(result.outcome!=='passed')throw new Error('Semantic browser QA failed; preserved result.json');
    return result;
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===SELF){
  if(process.argv.length===3&&process.argv[2]==='--source-check')process.stdout.write(JSON.stringify(validateSemanticBrowserSmokeSource())+'\n');
  else if(process.argv.length===3&&process.argv[2]==='--run')runSemanticWorkspaceBrowserSmoke().then(result=>process.stdout.write(JSON.stringify({outcome:result.outcome,cases:result.cases.length,screenshots:result.screenshots.length})+'\n')).catch(()=>{process.stderr.write('Semantic browser QA failed; inspect preserved result.\n');process.exitCode=1;});
  else{process.stderr.write('Use --source-check; --run requires the separate reviewed browser launch decision.\n');process.exitCode=1;}
}
