// Default inert. NO Playwright import, browser, public request or app access here.
import { readFile,lstat,realpath,readdir,mkdir,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname,resolve,relative,sep } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { CONTROLS,createDocumentGate,reserveDocument,verifyResponse,bindDocument,assertDocument,summarizeSnapshot,closeDocumentGate,
 collectOriginPolicies,requestHeaders,ControlFatal,ControlUnavailable } from './policy.js';
const HERE=dirname(fileURLToPath(import.meta.url)),REPO=resolve(HERE,'../../../../..'),OUTPUT=resolve(HERE,'output');
const READER='spikes/topic-resolution/browser/chromium/page-content-reader.js';
const READER_SHA='c7946a7e19adb3fd9c14b2304101dbd3bf8b7c92fd1ab7c3ba679104b55e428f';
const PACKAGE='node_modules/playwright-core/';
let operationFailure=null;
export const PACKAGE_INTEGRITY='sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ==';
export const SOURCE_FILES=Object.freeze({
 'run.mjs':resolve(HERE,'run.mjs'),'policy.js':resolve(HERE,'policy.js'),'supervise.py':resolve(HERE,'supervise.py'),
 'run.test.mjs':resolve(HERE,'run.test.mjs'),'policy.test.mjs':resolve(HERE,'policy.test.mjs'),'protocol.json':resolve(HERE,'protocol.json'),
 'README.md':resolve(HERE,'README.md'),'package.json':resolve(HERE,'package.json'),'package-lock.json':resolve(HERE,'package-lock.json'),
 '.npmrc':resolve(HERE,'.npmrc'),'install-user.npmrc':resolve(HERE,'install-user.npmrc'),'install-global.npmrc':resolve(HERE,'install-global.npmrc'),
 'page-content-reader.js':resolve(REPO,READER),'page-content-policy.js':resolve(REPO,'spikes/topic-resolution/browser/core/page-content-policy.js'),
 'controls-policy.js':resolve(REPO,'spikes/topic-resolution/harness/current-producer-controls-v1/policy.js'),
 'public-fetch.js':resolve(REPO,'apps/local-service/src/crawler/public-fetch.js'),'robots.js':resolve(REPO,'apps/local-service/src/crawler/robots.js'),
 'static-capture.js':resolve(REPO,'apps/local-service/src/crawler/static-capture.js'),
 'robots-deny-space-repair.js':resolve(REPO,'apps/local-service/experiments/topic-encoder/hierarchical-public-capture-v2/robots-deny-space-repair.js')
 ,'ADR147.md':resolve(REPO,'decisions/ADR-147-maintained-browser-client-dev-proof.md')
});
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
 const paths={...SOURCE_FILES},root=resolve(HERE,'node_modules/playwright-core');let files=0,total=0;
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
 await walk(root);const hashes={},buffers={};for(const [key,path]of Object.entries(paths)){const b=await checked(path);hashes[key]=sha(b);buffers[key]=b;}
 if(hashes['page-content-reader.js']!==READER_SHA)fatal();
 const pkg=JSON.parse(buffers[PACKAGE+'package.json']);const lock=JSON.parse(buffers['package-lock.json']);
 if(pkg.name!=='playwright-core'||pkg.version!=='1.64.1'||lock.packages?.['node_modules/playwright-core']?.integrity!==PACKAGE_INTEGRITY)fatal();
 const freezeBytes=await checked(resolve(HERE,'freeze.json')),f=JSON.parse(freezeBytes);const {freezeHash,...body}=f;
 if(f.schema!=='playwright-current-reader-dev-freeze/v1'||sha(JSON.stringify(body))!==freezeHash||JSON.stringify(f.sourceHashes)!==JSON.stringify(hashes)||f.protocolSha256!==hashes['protocol.json'])fatal();
 return {paths,hashes,buffers,freezeHash,freezeSha256:sha(freezeBytes)};
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
  requestFailed:guarded(request=>{if(request===article.request)throw new ControlFatal('unhandled-transport');})
 });
}
export function projectError(error){return {kind:error instanceof ControlUnavailable?'unavailable':'fatal',
 reason:error instanceof ControlUnavailable?error.code:error instanceof ControlFatal?error.code:'client-or-validation-failure',operationFailure};}
async function handshake(){
 if(process.env.MURMINGLE_PLAYWRIGHT_DEV_V1_SUPERVISED!=='1')fatal();let wire='';
 await new Promise((yes,no)=>{const timer=setTimeout(()=>no(new ControlFatal('aborted')),5000);
  const onData=chunk=>{wire+=chunk.toString('ascii');if(wire.length>128||wire.includes('\n')){clearTimeout(timer);process.stdin.off('data',onData);wire==='PLAYWRIGHT_DEV_JOB_ASSIGNED_V1\n'?yes():no(new ControlFatal('aborted'));}};
  process.stdin.on('data',onData);process.stdin.once('end',()=>{clearTimeout(timer);if(wire!=='PLAYWRIGHT_DEV_JOB_ASSIGNED_V1\n')no(new ControlFatal('aborted'));});});
}
async function executable(){
 for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']){
  try{const s=await lstat(p);if(s.isFile()&&!s.isSymbolicLink()&&(await realpath(p)).toLowerCase()===resolve(p).toLowerCase())return p;}catch(e){if(e.code!=='ENOENT')throw e;}
 }fatal();
}
export async function run(){
 await handshake(); // Before client dynamic import AND all public work/browser spawn.
 const started=performance.now(),deadline=started+165000;
 const guard=()=>{if(performance.now()>=deadline)throw new ControlFatal('absolute-job-deadline');};
 if(!/^D:/iu.test(HERE))fatal();await absent(resolve(OUTPUT,'node.started.json'));await absent(resolve(OUTPUT,'result.json'));
 const initial=await sources();await writeFile(resolve(OUTPUT,'node.started.json'),JSON.stringify({schema:'playwright-current-reader-dev-started/v1',sourceHashes:initial.hashes,freezeSha256:initial.freezeSha256}),{flag:'wx'});
 const policy=await collectOriginPolicies({browser:true,guard});guard();if(policy.elapsedMs>60000)throw new ControlFatal('absolute-job-deadline');
 const {chromium}=await import('playwright-core');guard();await recheck(initial);
 const {collectPageContent}=await import(pathToFileURL(resolve(REPO,READER)).href);await recheck(initial);guard();
 let browser,context,current=null,failure=null,finishing=false,pending=0,peakPending=0,eventCount=0,navigationMs=0,expectingPage=false,openingPage=null;
 const operations=new Set(),rows=[];const fail=e=>{failure??=e instanceof ControlFatal?e:new ControlFatal('callback-failed');};
 const track=promise=>{const p=promise.catch(fail).finally(()=>operations.delete(p));operations.add(p);};
 const fence=createCompletionFence({clock:()=>performance.now(),guard,current:()=>current,failure:()=>failure,finishing:()=>finishing});
 async function rpc(operation,ms=10000,cleanup=false,stage='coordinator'){
  if(!cleanup){guard();if(failure)throw failure;}
  const scope=!cleanup&&current&&!current.stopping?current:null,wait=Math.min(ms,scope?scope.until-performance.now():ms);
  if(wait<=0)throw new ControlUnavailable('article-timeout');
  if(++pending>128){pending--;operationFailure??={stage,category:'coordinator-capacity'};throw new ControlFatal('request-capacity');}peakPending=Math.max(peakPending,pending);
  let timer;const p=Promise.resolve().then(operation);p.catch(()=>{});p.then(()=>pending--,()=>pending--);
  try{return await Promise.race([p,new Promise((_,no)=>{timer=setTimeout(()=>{
   operationFailure??={stage,category:'coordinator-rpc-deadline'};no(scope&&performance.now()>=scope.until?new ControlUnavailable('article-timeout'):new ControlFatal('protocol-failed'));
  },Math.max(1,wait));})]);}catch(e){operationFailure??={stage,category:'client-operation-rejected'};throw e;}finally{clearTimeout(timer);}
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
   if(!admitted){await rpc(()=>route.abort('blockedbyclient'),10000,false,'request-deny');return;}
   current.request=req;const headers=Object.fromEntries(requestHeaders(req.headers()).map(h=>[h.name,h.value]));
   await rpc(()=>route.continue({headers}),10000,false,'request-continue');
  })())));
  await rpc(()=>own.routeWebSocket('**/*',socket=>track((async()=>{resource();await rpc(()=>socket.close());})())));
  own.on('page',page=>{if(expectingPage&&openingPage===null){openingPage=page;return;}if(current?.page!==page)track(rpc(()=>page.close({runBeforeUnload:false})));});
  return own;
  }
  const rootSession=await rpc(()=>browser.newBrowserCDPSession());await rpc(()=>rootSession.send('Browser.setDownloadBehavior',{behavior:'deny'}));
  for(const [index,c]of CONTROLS.entries()){
   guard();if(failure)throw failure;const origin=policy.entries.get(new URL(c.url).origin);
   if(origin?.status!=='eligible'){rows.push({id:c.id,status:'unavailable',reason:origin?.reason??'origin-policy-unavailable'});continue;}
   let page,session,article,outcome;const navStarted=performance.now();
   try{
    context=await openContext();
    // Page event uses this exact pending creation slot, never an owner tab.
    expectingPage=true;openingPage=null;page=await rpc(()=>context.newPage());expectingPage=false;
    if(openingPage!==page)fatal();
    session=await rpc(()=>context.newCDPSession(page));
    await rpc(()=>session.send('Page.enable'));await rpc(()=>session.send('Page.setLifecycleEventsEnabled',{enabled:true}));await rpc(()=>session.send('Runtime.enable'));
    await rpc(()=>session.send('Network.enable'));await rpc(()=>session.send('Network.setBypassServiceWorker',{bypass:true}));
    await rpc(()=>session.send('Network.setCacheDisabled',{cacheDisabled:true}));
    const blank=(await rpc(()=>session.send('Page.getFrameTree'))).frameTree?.frame;
    if(!blank||blank.parentId||blank.url!=='about:blank'||!blank.id)fatal();
    article={page,url:c.url,request:null,gate:createDocumentGate({url:c.url,mainFrame:page.mainFrame(),frameId:blank.id}),until:performance.now()+20000,
     stopping:false,refusal:null,committed:null,dcl:null};current=article;
    page.on('dialog',dialog=>track(rpc(()=>dialog.dismiss())));
    page.on('crash',()=>fail(new ControlFatal('response-integrity')));
    const callbacks=createArticleCallbacks({article,frameId:blank.id,current:()=>current,resource,fail,clock:()=>performance.now()});
    session.on('Page.frameDetached',callbacks.frameDetached);session.on('Runtime.executionContextsCleared',callbacks.contextsCleared);
    session.on('Runtime.executionContextDestroyed',callbacks.contextDestroyed);session.on('Page.frameNavigated',callbacks.frameNavigated);
    session.on('Page.lifecycleEvent',callbacks.lifecycle);page.on('requestfailed',callbacks.requestFailed);
    const response=await rpc(()=>page.goto(c.url,{waitUntil:'commit',timeout:Math.max(1,Math.floor(article.until-performance.now()))}),10000,false,'navigate');fence(article);
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
    const summary=summarizeSnapshot(article.gate,{...snapshot.result.value,navigationId:'playwright-dev-'+index});
    tree=(await frame()).frameTree?.frame;fence(article);assertDocument(article.gate,{frameId:tree?.id,loaderId:tree?.loaderId,url:tree?.url});
    fence(article);outcome={id:c.id,...summary};rows.push(outcome); // synchronous metadata only
   }catch(e){if(e instanceof ControlUnavailable){if(failure)throw failure;rows.push({id:c.id,status:'unavailable',reason:e.code});}else throw e;}
   finally{expectingPage=false;if(article){article.stopping=true;closeDocumentGate(article.gate);}
    try{if(context)await rpc(()=>context.close(),2000,true);}finally{current=null;context=null;navigationMs+=performance.now()-navStarted;}}
   if(navigationMs>80000||performance.now()-started-policy.elapsedMs-navigationMs>40000)throw new ControlFatal('absolute-job-deadline');
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
 const result={schema:'playwright-current-reader-dev-result/v1',phase:'dev-controls',status:'complete',denominator:4,cases:rows,
  collected:rows.filter(r=>r.status==='collected').length,policyRequests:policy.requests.length,policyElapsedMs:policy.elapsedMs,navigationMs,
  sourceHashes:initial.hashes,freezeHash:initial.freezeHash,freezeSha256:initial.freezeSha256,sourceHashesRechecked:true,protocolCallbacksDrained:true,
  peakCoordinatorPending:peakPending,resourceEvents:eventCount,elapsedMs:performance.now()-started,
  witnessSchema:'playwright-owned-document/v1',networkRequestIdCorrelated:false,rawPlaywrightIpcFourMiBAndInternalPending128Enforced:false,
  browserProducerScope:'restricted-single-document-dom-reader/v1',ordinaryDynamicBrowserProducerValidated:false,noNativeAttestation:true,
  noModelCalls:true,noCanonicalWrites:true,productionValidated:false,assignmentAuthority:false};
 const wire=JSON.stringify(result);if(Buffer.byteLength(wire)>65536)fatal();await writeFile(resolve(OUTPUT,'result.json'),wire,{flag:'wx'});
 console.log(JSON.stringify({status:'complete',denominator:4,collected:result.collected,resultSha256:sha(wire)}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length===2)console.log('No action. Explicit supervised DEV-only approval and reviewed freeze required.');
 else if(process.argv.length===3&&process.argv[2]==='--run-dev')run().catch(e=>{console.error(JSON.stringify({status:'failed',...projectError(e)}));process.exitCode=1;});
 else{console.error('Unsupported DEV mode');process.exitCode=1;}
}
