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
    'core/discussion-target.js','core/topic-view-mode.js','locales/en.js'].map(file=>path.join(EXTENSION,file))];
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
export function describeSemanticBoundaryFailure(error){
  if(error===null||typeof error!=='object'||types.isProxy(error))return {code:'boundary-failure'};
  let message;try{message=Object.getOwnPropertyDescriptor(error,'message')?.value;}catch{return {code:'boundary-failure'};}
  if(typeof message!=='string'||message.length>256)return {code:'boundary-failure'};
  const known={'Target cap':'target-cap','Unexpected target type':'unexpected-target-type',
    'Executable target already running':'target-already-executing','Unexpected executable target':'unexpected-target-origin',
    'Foreign extension target':'foreign-extension-target','Quarantine precondition refused':'quarantine-precondition',
    'Quarantine identity refused':'quarantine-identity'};
  if(Object.hasOwn(known,message))return {code:known[message]};
  const rejected=/^Chromium protocol rejected ([A-Za-z]+\.[A-Za-z]+) \(code (-?[0-9]{1,10})\)$/u.exec(message);
  if(rejected&&BOUNDARY_METHODS.has(rejected[1])){const numericCode=Number(rejected[2]);if(Number.isInteger(numericCode)&&numericCode>=-2147483648&&numericCode<=2147483647)
    return {code:'protocol-rejected',method:rejected[1],numericCode};}
  for(const [prefix,code] of [['Chromium protocol timeout: ','protocol-timeout'],['Chromium pipe ended during ','pipe-ended'],['Chromium pipe unavailable for ','pipe-unavailable']]){
    if(message.startsWith(prefix)&&BOUNDARY_METHODS.has(message.slice(prefix.length)))return {code,method:message.slice(prefix.length)};
  }
  return {code:'boundary-failure'};
}

// Serialized into the isolated extension page only. All document observations,
// account identity, service state and attestations below are invented fixtures.
async function bootstrapFixture(){
  window.dispatchEvent(new Event('pagehide'));
  const [{mountDiscussionPanel},{mountSemanticTopicWorkspace},{createLocalDiscussionController},{createLocalServiceClient},{lookupIndicatorFixtureByNormalizedUrl}]=await Promise.all([
    import('./discussion-panel.js'),import('./semantic-topic-workspace.js'),import('../core/local-discussion-controller.js'),
    import('../core/local-service-client.js'),import('../fixtures/indicator-fixtures.js')]);
  window.semanticQA={providerCalls:0,mount:async()=>{
    const prior=window.semanticQA.current;prior?.workspace.dispose();prior?.controller.dispose();prior?.panel.dispose();
    document.body.replaceChildren();document.body.dataset.uiMode='user';
    const title=document.createElement('h1');title.textContent='Synthetic discussion browser QA';
    const main=document.createElement('main'),discover=document.createElement('section'),semantic=document.createElement('section'),canonical=document.createElement('section');
    main.append(title,discover,semantic,canonical);document.body.append(main);
    let workspace;const current={actor:'demo-alex',tabId:7,url:'https://example.com/',windowId:2,availability:null,navigation:[]};
    const version={generation:'semantic-browser-generation',revision:7},topic={id:'reserved-domain-demo',title:'Foreground Page B topic',kind:'general'};
    const catalog={version,model:{id:'hand-authored-demo-vectors/1',status:'fixture-only'},actors:[{id:'demo-alex',displayName:'Alex',type:'human'},
      {id:'demo-blair',displayName:'Blair',type:'human'}],topics:[topic],sources:[
      {id:'reserved-example-com',url:'https://example.com/',title:'Foreground Page B',provenance:'project-created-reserved-domain-bridge/1',topicId:topic.id},
      {id:'reserved-example-org',url:'https://example.org/',title:'Manual fixture C',provenance:'project-created-reserved-domain-bridge/1',topicId:topic.id}]};
    const discussion={version,topic,discussionId:'foreground-discussion-b',roots:[]};
    const transport=createLocalServiceClient({fetchImpl:globalThis.fetch.bind(globalThis),getToken:()=> 'synthetic-semantic-browser-pairing-only'});
    const client={semanticCapabilities:transport.semanticCapabilities,semanticTopics:transport.semanticTopics,semanticContext:transport.semanticContext,
      semanticFeed:transport.semanticFeed,semanticThread:transport.semanticThread,semanticTarget:transport.semanticTarget,command:transport.command,
      health:async()=>({}),catalog:async()=>structuredClone(catalog),discussion:async()=>structuredClone(discussion),
      related:async()=>({version,model:catalog.model,results:[]}),priorDiscussions:async sourceId=>({version,sourceId,currentTopicId:topic.id,topics:[]})};
    const panel=mountDiscussionPanel(document,canonical);
    const controller=createLocalDiscussionController({client,session:{isPaired:async()=>true},readPostingActor:()=>current.actor,
      readActiveTab:async()=>({tabId:current.tabId,url:current.url,windowId:current.windowId}),observeTabLifecycle:()=>()=>{},
      lookupByNormalizedUrl:lookupIndicatorFixtureByNormalizedUrl,
      attestActiveContext:async witness=>witness.tabId===current.tabId&&witness.url===current.url&&witness.windowId===current.windowId,
      onStateChange:state=>{panel.render(state);workspace?.observePage(state);}});
    panel.bind(controller);panel.bindInsight({currentState:()=>({ai:{planEnabled:true,model:'synthetic-never-called',status:'idle'},
      context:{topic,currentSource:catalog.sources[0]}}),createFollowup:async()=>{window.semanticQA.providerCalls++;return false;},
      createInsights:async()=>{window.semanticQA.providerCalls++;return false;}});
    workspace=mountSemanticTopicWorkspace(document,{discoverRoot:discover,discussionRoot:semantic,client,controller,discussionPanel:panel,
      navigate:value=>{current.navigation.push(value);if(value==='discussion')workspace.setActive(false);},onAvailability:value=>{current.availability=value;}});
    Object.assign(current,{workspace,controller,panel,discover,semantic,canonical});window.semanticQA.current=current;
    await controller.setTopicViewMode('classic');await controller.open();workspace.observePage(controller.currentState());workspace.setActive(true);workspace.setConnection(true);
    return true;
  }};
  await window.semanticQA.mount();return true;
}

export function validateSemanticBrowserSmokeSource(){
  // Compilation and module import are inert: no profile, process, browser or IO.
  new Function(`return (${bootstrapFixture.toString()});`);
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
  const started=Date.now(),failures=[],exceptions=[],screenshots=[],cases=[],interceptions=[],commands=[],pendingTasks=new Set(),targets=new Map(),held=[];
  const targetGroups=new Map();
  let remoteResponses=0,retiredInterceptions=0,protocolFailure=false,browserVersion=null,initialBlankAccepted=false,extensionLoadStarted=false,firstBoundaryFailure=null;
  let publishOrigin;const originKnown=new Promise(resolve=>{publishOrigin=resolve;});
  const mode={capability:'available',context:'classified',holdTarget:false,command:'ok'};
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
      assert.ok(['reserved-example-com','reserved-example-org'].includes(input.sourceId));const pending=mode.context==='pending';
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
      const command=input.command;assert.equal(command.type,'reply');assert.equal(command.discussionId,'discussion-a');assert.equal(command.rootId,'root-a');assert.equal(command.replyToId,'reply-a');
      assert.equal(command.originSourceId,null);assert.deepEqual(command.semanticTarget,{nodeId:'music',topicId:'canonical-a',rootRevision:3,targetRevision:2});
      commands.push(structuredClone(input));state.revision++;state.replies.push(post('accepted-'+commands.length,'root-a','demo-alex',command.body));
      if(mode.command==='ambiguous'){await abortRequest(requestId,incoming);return;}
      await fulfill(requestId,incoming,200,{version:version(),result:{contributionId:'accepted-'+commands.length}});return;
    }
    fail(route.startsWith('/v1/ai')?'provider-request':'unexpected-fixture-route');await abortRequest(requestId,incoming);
  }
  async function evaluate(expression){const value=await browser.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);
    if(value.exceptionDetails)throw new Error('Browser fixture evaluation failed');return value.result.value;}
  async function waitFor(expression){const limit=Date.now()+9000;while(Date.now()<limit){if(timedOut||protocolFailure)throw new Error('Browser boundary failed');if(await evaluate(expression))return;await pause(40);}throw new Error('Browser fixture state timeout');}
  async function capture(width){await browser.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},sessionId);await pause(100);
    const layout=await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth})`);assert.equal(layout.overflow,false);
    const result=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId),name='semantic-'+width+'.png';checkedPath(attempt);writeFileSync(checkedPath(path.join(attempt,name)),Buffer.from(result.data,'base64'),{flag:'wx'});screenshots.push({name,...layout});}
  const timer=setTimeout(()=>{timedOut=true;void browser?.close();},120000);
  let outcome='failed';
  try{
    checkedPath(profile);checkedPath(attempt);workspaceRoot();
    browser=launchChromiumPipe({executable:CHROME,profileDirectory:profile});const detected=await browser.send('Browser.getVersion');
    browserVersion={product:detected.product,protocolVersion:detected.protocolVersion};
    browser.on('Runtime.exceptionThrown',(_event,incoming)=>{if(exceptions.length<64)exceptions.push({phase,target:targets.get(incoming)?.type??'unknown'});});
    browser.on('Network.responseReceived',({response})=>{if(/^https?:/u.test(response.url)){remoteResponses++;const headers=Object.fromEntries(Object.entries(response.headers??{}).map(([k,v])=>[k.toLowerCase(),v]));if(headers['x-murmingle-qa-intercepted']!=='1')fail('unintercepted-response');}});
    browser.on('Fetch.requestPaused',(event,incoming)=>{track(intercept(event,incoming).catch(async()=>{fail('interception-failed');await abortRequest(event.requestId,incoming);}));});
    browser.on('Target.attachedToTarget',({sessionId:attached,targetInfo,waitingForDebugger})=>{
      if(targets.size>=32){protocolFailure=true;fail('target-cap');void browser.close();return;}
      let group=targetGroups.get(targetInfo.targetId);
      if(!group){group={firstOrdinal:targets.size+1,resumeIssued:false,quarantineStarted:false};targetGroups.set(targetInfo.targetId,group);}
      const entry={ordinal:targets.size+1,type:ELIGIBLE_TARGETS.has(targetInfo.type)?targetInfo.type:'unexpected',targetId:targetInfo.targetId,
        waiting:waitingForDebugger===true,originClass:targetInfo.url==='about:blank'?'blank':/^chrome-extension:\/\//u.test(targetInfo.url)?'extension':'other',
        stage:'validate-target-count',ready:false,resumeIssued:false,quarantined:false,duplicateOf:group.firstOrdinal===targets.size+1?null:group.firstOrdinal,firstFailure:null};targets.set(attached,entry);
      entry.setup=track((async()=>{
        if(targets.size>32)throw new Error('Target cap');
        entry.stage='validate-target-type';
        if(!ELIGIBLE_TARGETS.has(targetInfo.type))throw new Error('Unexpected target type');
        entry.stage='validate-waiting';
        const initialBlank=!waitingForDebugger&&!extensionLoadStarted&&!initialBlankAccepted&&targetInfo.type==='page'&&
          targetInfo.url==='about:blank'&&!targetInfo.openerId&&!targetInfo.openerFrameId;
        if(initialBlank)initialBlankAccepted=true;
        if(!waitingForDebugger&&!initialBlank)throw new Error('Executable target already running');
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
          }
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
    assert.ok(sessionId);await browser.send('Page.navigate',{url:origin+'/chromium/popup.html'},sessionId);
    await waitFor(`document.readyState==='complete'&&Boolean(document.querySelector('#discussion-composer'))`);await pause(300);
    assert.equal(exceptions.length,0);cases.push('actual-packaged-popup-unpaired-no-runtime-exceptions');
    phase='fixture';await evaluate(`(${bootstrapFixture.toString()})()`);
    await waitFor(`window.semanticQA.current.availability==='available'&&Boolean(document.querySelector('#semantic-discover-open-music'))&&Boolean(document.querySelector('#semantic-context-thread-root-a'))`);
    const topicsBefore=interceptions.filter(item=>item.path==='/v1/semantic/topics').length;
    await evaluate(`semanticQA.current.controller.selectSource('reserved-example-org')`);await evaluate(`semanticQA.current.controller.selectSource('reserved-example-com')`);await pause(100);
    assert.equal(interceptions.filter(item=>item.path==='/v1/semantic/topics').length,topicsBefore);cases.push('global-directory-independent-of-source-selection');
    await evaluate(`document.querySelector('#semantic-discover-open-music').click()`);await waitFor(`Boolean(document.querySelector('#semantic-discover-thread-root-a'))`);
    await evaluate(`document.querySelector('#semantic-discover-thread-root-a').click()`);await waitFor(`Boolean(document.querySelector('#semantic-discover-reply-reply-a'))`);
    const flat=await evaluate(`(()=>{const p=document.querySelector('#semantic-discover-results'),replies=p.children[1];return {count:replies.children.length,flat:[...replies.children].every(n=>!n.querySelector('article')),inset:replies.style.marginInlineStart,deleted:replies.children[2].textContent};})()`);
    assert.ok(flat.count>=3);assert.equal(flat.flat,true);assert.equal(flat.inset,'1rem');assert.equal(flat.deleted,'Deleted by user');cases.push('real-dom-flat-replies-minimal-tombstone');
    await evaluate(`document.querySelector('#semantic-discover-reply-reply-a').click()`);await waitFor(`semanticQA.current.controller.currentState().draft.semantic===true&&Boolean(document.querySelector('#semantic-context-reply-reply-a'))`);
    await evaluate(`(()=>{const body=document.querySelector('#discussion-body');body.value='Browser QA human reply from Page B @AI stays text';body.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    assert.equal(await evaluate(`document.querySelector('.discussion-new-thread-heading').textContent.includes('Original discussion A')`),true);
    for(const width of [320,400,520])await capture(width);
    await evaluate(`document.querySelector('#discussion-composer').requestSubmit()`);await waitFor(`semanticQA.current.controller.currentState().draft.body===''&&Boolean(document.querySelector('[data-post-id="accepted-1"]'))`);
    assert.equal(commands.length,1);assert.equal(await evaluate(`semanticQA.providerCalls`),0);
    const foreground=await evaluate(`(()=>{const s=semanticQA.current.controller.currentState();return {sourceId:s.sourceId,topicId:s.topicId,rootAInPageB:s.discussion.roots.some(r=>r.id==='root-a')};})()`);
    assert.deepEqual(foreground,{sourceId:'reserved-example-com',topicId:'reserved-domain-demo',rootAInPageB:false});cases.push('human-original-target-null-origin-revision-witness-no-ai');
    mode.command='ambiguous';await evaluate(`document.querySelector('#semantic-context-reply-reply-a').click()`);await waitFor(`semanticQA.current.controller.currentState().draft.semantic===true`);
    await evaluate(`(()=>{const body=document.querySelector('#discussion-body');body.value='Synthetic possibly committed reply';body.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#discussion-composer').requestSubmit();})()`);
    await waitFor(`semanticQA.current.controller.currentState().semanticWritePending===true`);assert.equal(commands.length,2);
    await evaluate(`document.querySelector('#semantic-context-refresh').click()`);await waitFor(`Boolean(document.querySelector('[data-post-id="accepted-2"]'))`);
    await evaluate(`(()=>{const check=document.querySelector('#discussion-semantic-checked');check.checked=true;check.dispatchEvent(new Event('change'));document.querySelector('#discussion-semantic-continue').click();})()`);
    await waitFor(`!semanticQA.current.controller.currentState().semanticWritePending&&!semanticQA.current.controller.currentState().needsFreshRead`);assert.equal(commands.length,2);cases.push('uncertainty-checked-acknowledgement-no-repost');mode.command='ok';
    for(const value of ['legacy','unauthorized']){mode.capability=value;await evaluate(`semanticQA.mount()`);await waitFor(`semanticQA.current.availability===${JSON.stringify(value==='legacy'?'legacy':'error')}`);cases.push('capability-'+value);}
    mode.capability='available';
    for(const value of ['pending','error']){mode.context=value;await evaluate(`semanticQA.mount()`);await waitFor(`semanticQA.current.availability==='available'&&Boolean(document.querySelector('#semantic-discover-open-music'))`);await pause(120);
      assert.equal(await evaluate(`semanticQA.current.semantic.hidden`),value!=='error');assert.equal(await evaluate(`document.querySelector('#discussion-feed .discussion-thread').hidden`),false);cases.push('context-'+value+'-canonical-fallback');}
    mode.context='classified';
    for(const value of ['navigation','account']){await evaluate(`semanticQA.mount()`);await waitFor(`Boolean(document.querySelector('#semantic-discover-open-music'))`);
      await evaluate(`document.querySelector('#semantic-discover-open-music').click()`);await waitFor(`Boolean(document.querySelector('#semantic-discover-reply-root-a'))`);mode.holdTarget=true;
      await evaluate(`document.querySelector('#semantic-discover-reply-root-a').click()`);const end=Date.now()+5000;while(!held.length&&Date.now()<end)await pause(25);assert.ok(held.length);
      await evaluate(value==='navigation'?`(()=>{semanticQA.current.tabId=99;semanticQA.current.controller.invalidateContext();})()`:
        `(()=>{semanticQA.current.actor='demo-blair';semanticQA.current.controller.accountChanged();})()`);
      mode.holdTarget=false;while(held.length){const item=held.shift();await abortRequest(item.requestId,item.incoming);}await pause(100);
      assert.equal(await evaluate(`semanticQA.current.navigation.length`),0);assert.equal(commands.length,2);cases.push('stale-'+value+'-handoff-refused');}
    assert.equal(await evaluate(`semanticQA.providerCalls`),0);assert.equal(exceptions.length,0);assert.deepEqual(failures,[]);assert.equal(protocolFailure,false);assert.deepEqual(pins(),startPins);
    outcome='passed';
  }catch{fail('browser-smoke-incomplete');}
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
    const allExecutableTargetsContained=targets.size>0&&[...targets.values()].every(entry=>entry.recursiveAttachInstalled&&entry.offlineInstalled&&entry.fetchInstalled&&
      (entry.ready||entry.quarantined&&entry.waiting&&!entry.resumeIssued&&ownedProcessExited));
    if(!allExecutableTargetsContained)fail('target-containment-unverified');
    const result={schema:'semantic-workspace-browser-qa/v1',outcome:failures.length?'failed':outcome,scope:'Synthetic browser composition; no SQL, actual document attestation, provider, quality, load or live posting authority.',
      elapsedMs:Date.now()-started,timedOut,closing,closeReturned,ownedProcessExited,profileRemoved,ownedProfileRetained:!profileRemoved,
      attempt:path.relative(REPO,attempt).replaceAll('\\','/'),continuedHttpRequests:0,
      offlineAllTargets:targets.size>0&&[...targets.values()].every(entry=>entry.offlineInstalled&&entry.fetchInstalled&&entry.recursiveAttachInstalled),targets:targets.size,httpResponsesObserved:remoteResponses,browserVersion,
      physicalTargets:targetGroups.size,quarantinedTargets:new Set([...targets.values()].filter(entry=>entry.quarantined).map(entry=>entry.targetId)).size,
      quarantinedTargetsRetired:ownedProcessExited,quarantineMode:'paused-until-owned-exit',
      quarantineScope:'Foreign extension targets verified debugger-paused after network containment, never resumed; retirement requires the exact owned-browser exit event. No identity or cause attribution.',
      allExecutableTargetsContained,
      firstBoundaryFailure,targetStates:[...targets.values()].map(entry=>({ordinal:entry.ordinal,type:entry.type,waiting:entry.waiting,originClass:entry.originClass,
        stage:entry.stage,ready:entry.ready,recursiveAttachInstalled:entry.recursiveAttachInstalled===true,offlineInstalled:entry.offlineInstalled===true,
        fetchInstalled:entry.fetchInstalled===true,resumeIssued:entry.resumeIssued,quarantined:entry.quarantined,duplicateOf:entry.duplicateOf,
        firstFailure:entry.firstFailure})),
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
