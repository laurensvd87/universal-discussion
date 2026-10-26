// Default inert. Client import and browser work require an owned-Job handshake.
import {readFile,lstat,realpath,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {types} from 'node:util';
import {createRouteCoordinator} from '../playwright-route-coordinator-v1/coordinator.mjs';
const HERE=dirname(fileURLToPath(import.meta.url)),REPO=resolve(HERE,'../../../../..'),OUTPUT=resolve(HERE,'output');
const DEV='spikes/topic-resolution/harness/experimental/playwright-dev-v1';
const OWN='spikes/topic-resolution/harness/experimental/playwright-route-burst-dev-v1';
const CORE='spikes/topic-resolution/harness/experimental/playwright-route-coordinator-v1';
export const SOURCE_FILES=Object.freeze(Object.fromEntries([
 ...['run.mjs','run.test.mjs','supervise.py','protocol.json','README.md'].map(n=>OWN+'/'+n),
 ...['coordinator.mjs','coordinator.test.mjs','README.md'].map(n=>CORE+'/'+n),
 'decisions/ADR-149-serialized-browser-denials-and-reserved-cleanup.md',
 'spikes/topic-resolution/harness/deny-external-capabilities.js',DEV+'/package.json',DEV+'/package-lock.json'
].map(k=>[k,resolve(REPO,k)])));
export const PACKAGE_INTEGRITY='sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ==';
export const LAUNCH_ARGUMENTS=Object.freeze(['--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update',
 '--disable-domain-reliability','--disable-sync','--disable-quic','--disable-client-side-phishing-detection','--safebrowsing-disable-auto-update',
 '--disable-default-apps','--autoplay-policy=user-gesture-required']);
const sha=value=>createHash('sha256').update(value).digest('hex');
const sleep=ms=>new Promise(yes=>setTimeout(yes,ms));
function fault(code){const e=new Error(code);e.code=code;return e;}
const CAUSES=new Set(['operation-rejected','rpc-deadline','burst-deadline','absolute-deadline','invalid-route','unexpected-event','capacity','unsettled','integrity']);
export function projectFailure(e){const d=e&&typeof e==='object'&&!types.isProxy(e)&&Object.getPrototypeOf(e)===Error.prototype?Object.getOwnPropertyDescriptor(e,'code'):null;
 return {status:'failed',reason:d&&Object.hasOwn(d,'value')&&CAUSES.has(d.value)?d.value:'integrity'};}
function deferred(){let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};}

// Trusted injected actions live in a private one-use registry, never in core tasks.
// The cell preserves RPC return values; coordinator completion is not its result.
export function createBurstAdapter({clock=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,absoluteUntil=Infinity}={}){
 let next=0,nextCleanup=0,unexpected=null,expected=null;
 const expectedToken=Object.freeze({}),registry=new Map(),physical=new Set();
 let nativeStarted=0,nativeSettled=0,peakPhysical=0,callerRejectedDenials=0,callerRejectedOrdinary=0,callerRejectedQueuedDenials=0;
 const note=code=>{unexpected??=fault(CAUSES.has(code)?code:'integrity');core.fail('external-fatal');};
 const core=createRouteCoordinator((task,lane)=>{
  const key=lane+':'+task.ordinal,entry=registry.get(key);if(!entry){note('integrity');throw fault('integrity');}registry.delete(key);entry.started=true;entry.arm();
  let operation;
  try{operation=entry.action();}catch{note('operation-rejected');throw fault('operation-rejected');}
  const actual=Promise.resolve(operation).then(value=>{entry.value=value;entry.done=true;},()=>{note('operation-rejected');throw fault('operation-rejected');});
  physical.add(actual);peakPhysical=Math.max(peakPhysical,physical.size);
  actual.then(()=>physical.delete(actual),()=>physical.delete(actual));return actual;
 });
 function guard(){if(clock()>=absoluteUntil)note('absolute-deadline');if(unexpected)throw unexpected;}
 function submit(lane,action,ms){
  if(typeof action!=='function'||types.isProxy(action))throw fault('integrity');
  if(lane!=='cleanup'){
   guard();if(next>=4096){note('capacity');throw unexpected;}
  }else if(nextCleanup>=2){note('capacity');throw unexpected;}
  let timer,deadlineReject;const timeout=new Promise((_,no)=>{deadlineReject=no;});
  const ordinal=lane==='cleanup'?nextCleanup++:next++,entry={action,value:undefined,done:false,arm(){
   timer=schedule(()=>{note('rpc-deadline');deadlineReject(unexpected);},Math.max(1,lane==='cleanup'?ms:Math.min(ms,absoluteUntil-clock())));
  }},key=lane+':'+ordinal;registry.set(key,entry);
  const method=lane==='denial'?'route-abort':lane==='cleanup'?'cleanup-rpc':'coordinator-rpc';
  const caller=lane==='denial'?core.deny({method,ordinal}):lane==='cleanup'?core.cleanup({method,ordinal}):core.rpc({method,ordinal});
  const wait=new Promise((yes,no)=>{
   caller.then(()=>{if(!entry.done){note('integrity');no(unexpected);}else yes(entry.value);},e=>{
    if(unexpected)no(unexpected);else if(expected&&e?.code==='external-fatal'&&lane!=='cleanup'){
     if(lane==='denial'){if(entry.started)callerRejectedDenials++;else callerRejectedQueuedDenials++;}else callerRejectedOrdinary++;
     no(expectedToken);
    }else{note('capacity');no(unexpected);}
   });
  });
  return Promise.race([wait,timeout]).finally(()=>{if(timer!==undefined)cancel(timer);registry.delete(key);});
 }
 return Object.freeze({
  rpc:action=>submit('ordinary',action,10000),deny:action=>submit('denial',action,10000),cleanup:action=>submit('cleanup',action,2000),
  nativeAbortStarted(){nativeStarted++;},nativeAbortSettled(){nativeSettled++;},
  expectedFatal(){guard();if(expected)throw fault('integrity');expected=expectedToken;core.fail('external-fatal');return expectedToken;},
  isExpected:e=>e===expectedToken&&expected===expectedToken&&!unexpected,
  fail:code=>note(code),guard,
  dispose(){core.dispose();registry.clear();},
  snapshot(){return Object.freeze({...core.snapshot(),nativeStarted,nativeSettled,physical:physical.size,peakPhysical,
   unexpected:unexpected?.code??null,expectedFatal:expected!==null,registered:registry.size,callerRejectedDenials,callerRejectedOrdinary,callerRejectedQueuedDenials});}
 });
}

function method(target,key){
 if(!target||(typeof target!=='object'&&typeof target!=='function')||types.isProxy(target))throw fault('invalid-route');
 let at=target;
 for(let depth=0;at&&depth<8;depth++,at=Object.getPrototypeOf(at)){
  if(types.isProxy(at))throw fault('invalid-route');const d=Object.getOwnPropertyDescriptor(at,key);
  if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function'||types.isProxy(d.value))throw fault('invalid-route');return d.value;}
 }throw fault('invalid-route');
}
function invoke(target,key,...args){return Reflect.apply(method(target,key),target,args);}
export function createRouteOwner({page,frame,count,adapter,holdFirst,active=()=>true,onQueued=()=>{}}){
 if(!Number.isSafeInteger(count)||![256,1000].includes(count))throw fault('integrity');
 const requests=new WeakSet(),routes=new WeakSet(),ordinals=new Set(),retiredOrdinals=new Set(),pending=new Set();
 let callbacks=0,aborted=0,retired=0,stopped=false;
 function callback(route){
  let work;
  try{
   if(++callbacks>4096)throw fault('capacity');
   if(!route||types.isProxy(route)||routes.has(route))throw fault('invalid-route');routes.add(route);
   const request=invoke(route,'request');if(!request||typeof request!=='object'||types.isProxy(request)||requests.has(request))throw fault('invalid-route');requests.add(request);
   if(invoke(request,'frame')!==frame||invoke(request,'method')!=='GET'||invoke(request,'resourceType')!=='image')throw fault('invalid-route');
   const url=invoke(request,'url');if(typeof url!=='string'||url.length>128)throw fault('invalid-route');
   const match=/^https:\/\/route-burst\.invalid\/image\/([0-9]{1,4})$/u.exec(url);
   if(!match||String(Number(match[1]))!==match[1])throw fault('invalid-route');
   const ordinal=Number(match[1]);if(ordinal>=count||ordinals.has(ordinal)||retiredOrdinals.has(ordinal))throw fault('invalid-route');
   const abort=method(route,'abort');
   if(stopped||!active()){retiredOrdinals.add(ordinal);retired++;return;}
   ordinals.add(ordinal);
   work=adapter.deny(async()=>{
    adapter.nativeAbortStarted();await Reflect.apply(abort,route,['blockedbyclient']);adapter.nativeAbortSettled();aborted++;
    if(holdFirst&&aborted===1)await holdFirst.promise;
   });
   onQueued();
  }catch{adapter.fail('invalid-route');if(!work)return;}
  const observed=work.catch(e=>{if(!adapter.isExpected(e))adapter.fail('operation-rejected');}).finally(()=>pending.delete(observed));
  pending.add(observed);return observed;
 }
 return Object.freeze({callback,retire(){stopped=true;},snapshot:()=>Object.freeze({callbacks,uniqueOrdinals:ordinals.size,aborted,retired,pending:pending.size}),
  async drain(){await Promise.all([...pending]);}});
}
export function fixture(count){if(![1000,256].includes(count))throw fault('integrity');
 return '<!doctype html><meta charset="utf-8"><title>Invented denial fixture</title>'+Array.from({length:count},(_,i)=>'<img src="https://route-burst.invalid/image/'+i+'">').join('');}
export async function closeOwnedPair(adapter,context,browser,beforeBrowserClose=()=>{}){
 let contextCompleted=false,browserCompleted=false,contextAttempts=0,browserAttempts=0;
 try{await adapter.cleanup(()=>{contextAttempts++;return context.close();});contextCompleted=true;}catch{}
 try{beforeBrowserClose();}catch{adapter.fail('unexpected-event');}
 try{await adapter.cleanup(()=>{browserAttempts++;return browser.close();});browserCompleted=true;}catch{}
 return Object.freeze({contextAttempts,browserAttempts,contextCompleted,browserCompleted});
}
export function createLifecycleCallbacks(state,adapter){
 return Object.freeze({
  pageCreated(page){
   if(!state.retired&&state.expectingPage&&state.page===null){state.page=page;return;}
   if(state.retired&&page===state.page)return;
   adapter.fail('unexpected-event');
  },
  frameNavigated(frame){try{
   if(frame!==state.mainFrame||invoke(frame,'url')!=='about:blank')adapter.fail('unexpected-event');
  }catch{adapter.fail('unexpected-event');}}
 });
}

async function checked(path,max=4194304){
 const p=resolve(path),rel=relative(REPO,p);if(rel.startsWith('..')||resolve(REPO,rel)!==p)throw fault('integrity');
 let at=REPO;for(const segment of rel.split(sep)){at=resolve(at,segment);if((await lstat(at)).isSymbolicLink())throw fault('integrity');}
 const s=await lstat(p);if(!s.isFile()||s.size>max||(await realpath(p)).toLowerCase()!==p.toLowerCase())throw fault('integrity');
 const bytes=await readFile(p);if(bytes.length!==s.size||bytes.length>max)throw fault('integrity');return bytes;
}
async function sources(){
 const paths={...SOURCE_FILES},packageRoot=resolve(REPO,DEV,'node_modules/playwright-core');let files=0,total=0;
 async function walk(dir,depth=0){
  if(depth>8||(await lstat(dir)).isSymbolicLink()||(await realpath(dir)).toLowerCase()!==dir.toLowerCase())throw fault('integrity');
  const entries=await readdir(dir,{withFileTypes:true});if(entries.length>128)throw fault('integrity');
  for(const e of entries.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
   const p=resolve(dir,e.name);if(e.isSymbolicLink())throw fault('integrity');
   if(e.isDirectory())await walk(p,depth+1);else if(e.isFile()){
    if(++files>128)throw fault('integrity');const b=await checked(p);total+=b.length;if(total>16777216)throw fault('integrity');
    paths['node_modules/playwright-core/'+relative(packageRoot,p).split(sep).join('/')]=p;
   }else throw fault('integrity');
  }
 }
 await walk(packageRoot);if(files!==115||total!==13656167)throw fault('integrity');
 const hashes={},buffers={};for(const [key,p]of Object.entries(paths)){const b=await checked(p);hashes[key]=sha(b);buffers[key]=b;}
 const pkg=JSON.parse(buffers['node_modules/playwright-core/package.json']),lock=JSON.parse(buffers[DEV+'/package-lock.json']);
 if(pkg.name!=='playwright-core'||pkg.version!=='1.64.1'||lock.packages?.['node_modules/playwright-core']?.integrity!==PACKAGE_INTEGRITY)throw fault('integrity');
 const freezeBytes=await checked(resolve(HERE,'freeze.json')),f=JSON.parse(freezeBytes),{freezeHash,...body}=f;
 if(Object.keys(f).join('|')!=='schema|sourceHashes|protocolSha256|freezeHash'||f.schema!=='playwright-route-burst-dev-freeze/v1'||sha(JSON.stringify(body))!==freezeHash||
  JSON.stringify(f.sourceHashes)!==JSON.stringify(hashes)||f.protocolSha256!==hashes[OWN+'/protocol.json'])throw fault('integrity');
 return {hashes,freezeHash,freezeSha256:sha(freezeBytes)};
}
async function handshake(){
 if(process.env.MURMINGLE_PLAYWRIGHT_ROUTE_BURST_DEV_V1_SUPERVISED!=='1')throw fault('integrity');
 await new Promise((yes,no)=>{let wire='';const timer=setTimeout(()=>no(fault('integrity')),5000);
  const data=b=>{wire+=b.toString('ascii');if(wire.length>128||wire.includes('\n')){clearTimeout(timer);process.stdin.off('data',data);
   wire==='PLAYWRIGHT_ROUTE_BURST_JOB_ASSIGNED_V1\n'?yes():no(fault('integrity'));}};
  process.stdin.on('data',data);process.stdin.once('end',()=>{clearTimeout(timer);if(wire!=='PLAYWRIGHT_ROUTE_BURST_JOB_ASSIGNED_V1\n')no(fault('integrity'));});});
}
async function executable(){for(const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']){
 try{const s=await lstat(p);if(s.isFile()&&!s.isSymbolicLink()&&(await realpath(p)).toLowerCase()===resolve(p).toLowerCase())return p;}catch(e){if(e.code!=='ENOENT')throw e;}
 }throw fault('integrity');}

export async function run(){
 await handshake();
 const started=performance.now(),absoluteUntil=started+165000,adapter=createBurstAdapter({absoluteUntil});
 if(!/^D:/iu.test(HERE))throw fault('integrity');
 const initial=await sources();await writeFile(resolve(OUTPUT,'node.started.json'),JSON.stringify({schema:'playwright-route-burst-dev-started/v1',freezeSha256:initial.freezeSha256}),{flag:'wx'});
 const {chromium}=await import(pathToFileURL(resolve(REPO,DEV,'node_modules/playwright-core/index.mjs')).href);
 adapter.guard();let browser,context,stopping=false,normalResult=null,controlledResult=null,cleanupFailure=false,browserClosing=false,controlledOwner=null,normalOwner=null,ordinaryClosingContext=null,currentLifecycle=null;
 async function waitFor(predicate,until){while(!predicate()){adapter.guard();if(performance.now()>=until){adapter.fail('burst-deadline');adapter.guard();}await sleep(5);}adapter.guard();}
 async function open(count,holdFirst){
  stopping=false;context=await adapter.rpc(()=>browser.newContext({serviceWorkers:'block',ignoreHTTPSErrors:false,acceptDownloads:false,permissions:[]}));
  let owner,page;const lifecycle={expectingPage:false,page:null,mainFrame:null,retired:false};currentLifecycle=lifecycle;
  const callbacks=createLifecycleCallbacks(lifecycle,adapter);
  await adapter.rpc(()=>context.route('**/*',route=>{if(!owner){adapter.fail('unexpected-event');return;}return owner.callback(route);}));
  await adapter.rpc(()=>context.routeWebSocket('**/*',()=>adapter.fail('unexpected-event')));
  context.on('page',callbacks.pageCreated);
  lifecycle.expectingPage=true;page=await adapter.rpc(()=>context.newPage());lifecycle.expectingPage=false;
  if(lifecycle.page!==page||page.url()!=='about:blank')throw fault('integrity');lifecycle.mainFrame=page.mainFrame();
  page.on('dialog',()=>adapter.fail('unexpected-event'));page.on('crash',()=>adapter.fail('unexpected-event'));
  page.on('framenavigated',callbacks.frameNavigated);
  owner=createRouteOwner({page,frame:page.mainFrame(),count,adapter,holdFirst,active:()=>!stopping});
  const until=performance.now()+45000;
  await adapter.rpc(()=>page.setContent(fixture(count),{waitUntil:'domcontentloaded',timeout:0}));
  return {owner,until};
 }
 try{
  browser=await adapter.rpc(async()=>chromium.launch({executablePath:await executable(),headless:true,chromiumSandbox:true,args:[...LAUNCH_ARGUMENTS],timeout:10000}));
  browser.on('disconnected',()=>{if(!browserClosing)adapter.fail('unexpected-event');});
  const session=await adapter.rpc(()=>browser.newBrowserCDPSession());await adapter.rpc(()=>session.send('Browser.setDownloadBehavior',{behavior:'deny'}));
  const normal=await open(1000,null);normalOwner=normal.owner;
  await waitFor(()=>normal.owner.snapshot().aborted===1000&&normal.owner.snapshot().pending===0,normal.until);
  await normal.owner.drain();adapter.guard();
  if(normal.owner.snapshot().uniqueOrdinals!==1000||adapter.snapshot().nativeSettled!==1000||adapter.snapshot().peakDenials!==1)throw fault('integrity');
  stopping=true;currentLifecycle.retired=true;normal.owner.retire();ordinaryClosingContext=context;await adapter.rpc(()=>context.close());context=null;ordinaryClosingContext=null;
  normalResult={references:1000,...normal.owner.snapshot(),coordinator:adapter.snapshot(),fixtureSha256:sha(fixture(1000)),status:'complete'};
  const barrier=deferred(),ordinaryBarrier=deferred(),held=[];
  try{
   const controlled=await open(256,barrier);controlledOwner=controlled.owner;
   await waitFor(()=>controlled.owner.snapshot().aborted===1&&adapter.snapshot().backlog>=1,controlled.until);
   for(let i=0;i<125;i++)held.push(adapter.rpc(()=>ordinaryBarrier.promise).catch(e=>{if(!adapter.isExpected(e))adapter.fail('operation-rejected');}));
   const full=adapter.snapshot();if(full.normalActive!==126||full.denialActive!==1||full.cleanupIssued!==0)throw fault('integrity');
   adapter.expectedFatal();stopping=true;currentLifecycle.retired=true;controlled.owner.retire();
   await Promise.all(held);await controlled.owner.drain();adapter.guard();
   const afterFatal=adapter.snapshot(),callerRejected={physicalDenials:afterFatal.callerRejectedDenials,physicalOrdinary:afterFatal.callerRejectedOrdinary,
    queuedDenials:afterFatal.callerRejectedQueuedDenials,total:afterFatal.callerRejectedDenials+afterFatal.callerRejectedOrdinary+afterFatal.callerRejectedQueuedDenials};
   if(callerRejected.physicalDenials!==1||callerRejected.physicalOrdinary!==125||callerRejected.queuedDenials!==full.backlog||callerRejected.total!==126+full.backlog||
    afterFatal.normalActive!==126||afterFatal.physical!==126)throw fault('integrity');
   // Both submissions are attempted exactly once even if the first fails.
   const cleanup=await closeOwnedPair(adapter,context,browser,()=>{browserClosing=true;});
   cleanupFailure=!cleanup.contextCompleted||!cleanup.browserCompleted;
   context=null;browser=null;
   controlledResult={references:256,observed:controlled.owner.snapshot(),atFatal:full,afterFatal,callerRejected,cleanup,fixtureSha256:sha(fixture(256)),status:'expected-controlled-fatal',expectedFatalStage:'adapter-quota-full'};
  }finally{barrier.resolve();ordinaryBarrier.resolve();await Promise.allSettled(held);}
  await waitFor(()=>adapter.snapshot().physical===0&&adapter.snapshot().normalActive===0&&adapter.snapshot().cleanupActive===0&&controlledOwner.snapshot().pending===0,Math.min(absoluteUntil,performance.now()+2000));
  adapter.guard();if(cleanupFailure||adapter.snapshot().cleanupIssued!==2)throw fault('unsettled');
 }catch(e){adapter.fail(projectFailure(e).reason);throw e;}finally{
  stopping=true;
  if(currentLifecycle)currentLifecycle.retired=true;
  normalOwner?.retire();controlledOwner?.retire();
  // On unexpected setup/normal failure, use the same two reserved owned slots.
  if(context&&context!==ordinaryClosingContext)try{await adapter.cleanup(()=>context.close());}catch{cleanupFailure=true;}
  if(browser){browserClosing=true;try{await adapter.cleanup(()=>browser.close());}catch{cleanupFailure=true;}}
 }
 adapter.guard();if(cleanupFailure||!normalResult||!controlledResult)throw fault('unsettled');
 const final=adapter.snapshot();if(final.physical||final.normalActive||final.cleanupActive||final.backlog||final.registered)throw fault('unsettled');
 controlledResult.finalObserved=controlledOwner.snapshot();
 const rechecked=await sources();adapter.guard();if(JSON.stringify(rechecked)!==JSON.stringify(initial))throw fault('integrity');
 const result={schema:'playwright-route-burst-dev-result/v1',phase:'dev-bursts',status:'complete',normal:normalResult,controlled:controlledResult,final,
  sourceHashes:initial.hashes,freezeHash:initial.freezeHash,freezeSha256:initial.freezeSha256,sourceHashesRechecked:true,protocolCallbacksDrained:true,
  elapsedMs:performance.now()-started,noPublicNavigation:true,noNativeAttestation:true,noModelCalls:true,noCanonicalWrites:true,
  playwrightInternalPendingOrIpcCapsEnforced:false,completeOsEgressIsolation:false,productionValidated:false,assignmentAuthority:false};
 const wire=JSON.stringify(result);if(Buffer.byteLength(wire)>65536)throw fault('integrity');await writeFile(resolve(OUTPUT,'result.json'),wire,{flag:'wx'});
 console.log(JSON.stringify({status:'complete',resultSha256:sha(wire),normalAborted:1000,controlledFatal:true}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length===2)console.log('No action. Explicit reviewed supervised DEV command required.');
 else if(process.argv.length===3&&process.argv[2]==='--run-dev')run().catch(e=>{console.error(JSON.stringify(projectFailure(e)));process.exitCode=1;});
 else{console.error('Unsupported mode');process.exitCode=1;}
}
