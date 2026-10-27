import {types} from 'node:util';

const ELIGIBLE_TARGETS=new Set(['page','iframe','other','service_worker','worker','shared_worker']);
export const AUTO_ATTACH=Object.freeze({autoAttach:true,waitForDebuggerOnStart:true,flatten:true,
  filter:Object.freeze([...ELIGIBLE_TARGETS].map(type=>Object.freeze({type,exclude:false})).concat(Object.freeze({exclude:true})))});
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

// One target-boundary implementation shared by synthetic and real-private
// browser exercises. Callers own their fixed launch/path and response policy.
export function installSemanticBrowserContainment({browser,targets,targetGroups,track,protocol,getOrigin,waitOrigin,isClosing,isExtensionLoadStarted,onFailure}){
 let initialBlankAccepted=false,failed=false,firstBoundaryFailure=null;
    browser.on('Target.detachedFromTarget',({sessionId:detached})=>{const entry=targets.get(detached);
      if(markSemanticSessionDetached(entry,{shutdown:isClosing()||failed})){
        entry.firstFailure??={stage:'session-detached',code:'contained-owner-detached'};
        firstBoundaryFailure??={ordinal:entry.ordinal,type:entry.type,waiting:entry.waiting,originClass:entry.originClass,...entry.firstFailure};
        failed=true;onFailure('contained-owner-detached',firstBoundaryFailure);void browser.close();
      }});
    browser.on('Target.attachedToTarget',({sessionId:attached,targetInfo,waitingForDebugger})=>{
      if(targets.size>=32){failed=true;onFailure('target-cap',firstBoundaryFailure);void browser.close();return;}
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
        const initialBlank=!waitingForDebugger&&!isExtensionLoadStarted()&&!initialBlankAccepted&&targetInfo.type==='page'&&
          targetInfo.url==='about:blank'&&!targetInfo.openerId&&!targetInfo.openerFrameId;
        if(initialBlank)initialBlankAccepted=true;
        if(!waitingForDebugger&&!initialBlank){const owner=group.owner;if(!owner)throw new Error('Executable target already running');
          entry.stage='bind-contained-alias';if(!owner.ready&&owner.setup)await owner.setup;
          await bindContainedSemanticAlias(entry,owner,{ownedOrigin:getOrigin(),verifyIdentity:async()=>{
            const current=await protocol('Target.getTargetInfo',{targetId:entry.targetId});const info=current?.targetInfo;
            return !isClosing()&&!failed&&owner.active&&info?.attached===true&&info?.targetId===owner.targetId&&info?.type===targetInfo.type&&info?.url===entry.targetUrl;
          }});return;
        }
        entry.stage='validate-origin';
        const extensionUrl=/^chrome-extension:\/\/[a-p]{32}\//u.test(targetInfo.url);
        if(!initialBlank&&!(targetInfo.url==='about:blank'&&['page','iframe'].includes(targetInfo.type))&&
          !(extensionUrl&&isExtensionLoadStarted()))throw new Error('Unexpected executable target');
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
        if(extensionUrl){entry.stage='await-owned-origin';const ownedOrigin=getOrigin()??await waitOrigin();if(isClosing()||!ownedOrigin)throw new Error('Foreign extension target');
          if(!targetInfo.url.startsWith(ownedOrigin+'/')){
            group.quarantineStarted=true;await quarantinePausedSemanticTarget(entry,{
              verifyIdentity:async()=>{const current=await protocol('Target.getTargetInfo',{targetId:entry.targetId});const info=current?.targetInfo;
                return !isClosing()&&!group.resumeIssued&&info?.targetId===entry.targetId&&info?.type===targetInfo.type&&info?.url===targetInfo.url&&
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
        failed=true;onFailure('target-boundary-installation',firstBoundaryFailure);void browser.close();}));
    });

 return Object.freeze({failure:()=>firstBoundaryFailure,failed:()=>failed});
}

const PRIVATE_ROUTES=new Map([
 ['GET',new Set(['/v1/health','/v1/version'])],
 ['POST',new Set(['/v1/account/me','/v1/semantic/capabilities','/v1/semantic/topics','/v1/semantic/feed','/v1/semantic/thread','/v1/semantic/target',
  '/v1/catalog/context','/v1/catalog/selection','/v1/commands'])],
]);
const privateFailure=()=>new Error('Private browser transport refused');
function needPrivate(value){if(!value)throw privateFailure();}
function plain(value){needPrivate(value&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype);
 const out={};for(const key of Reflect.ownKeys(value)){needPrivate(typeof key==='string');const d=Object.getOwnPropertyDescriptor(value,key);needPrivate(d?.enumerable&&Object.hasOwn(d,'value'));out[key]=d.value;}return out;}
/** Trusted Node bridge only: fixed URL/Origin validation, original byte bodies,
 * no credentials or response data in the returned finite description. */
export function createPrivateBrowserRequestProxy({origin,request,checkDeadline,isOpen}){
 needPrivate(typeof origin==='string'&&/^chrome-extension:\/\/[a-p]{32}$/u.test(origin)&&[request,checkDeadline,isOpen].every(value=>typeof value==='function'));
 let closed=false,total=0,maximumPending=0;const pending=new Set(),observations=[];
 function check(){checkDeadline();needPrivate(!closed&&isOpen());}
 return Object.freeze({async forward(value){
  check();const input=plain(value);needPrivate(Object.keys(input).sort().join() === 'headers,method,postData,url');
  const url=new URL(input.url);needPrivate(url.origin==='http://127.0.0.1:4174'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.href===input.url);
  const allowed=input.method==='OPTIONS'?[...PRIVATE_ROUTES.values()].some(routes=>routes.has(url.pathname)):PRIVATE_ROUTES.get(input.method)?.has(url.pathname);
  needPrivate(allowed);const headers=plain(input.headers),lower=new Map();let headerBytes=0;
  for(const [name,value]of Object.entries(headers)){needPrivate(/^[A-Za-z0-9-]{1,64}$/u.test(name)&&typeof value==='string'&&!/[\r\n\u0000]/u.test(value)&&!lower.has(name.toLowerCase()));
   lower.set(name.toLowerCase(),value);headerBytes+=name.length+value.length;}
  needPrivate(lower.size<=64&&headerBytes<=16384&&lower.get('origin')===origin&&!lower.has('x-demo-actor')&&!lower.has('cookie'));
  if(lower.has('host'))needPrivate(lower.get('host')==='127.0.0.1:4174');
  else headers.Host='127.0.0.1:4174'; // Exact validated browser URL authority.
  if(input.method==='OPTIONS')needPrivate(!lower.has('authorization')&&!lower.has('x-account-session'));
  if(input.method!=='OPTIONS')needPrivate(/^Bearer [A-Za-z0-9_-]{32,512}$/u.test(lower.get('authorization')??''));
  if(lower.has('x-account-session'))needPrivate(/^[A-Za-z0-9_-]{43}$/u.test(lower.get('x-account-session')));
  needPrivate(input.postData===undefined||typeof input.postData==='string');const body=input.postData===undefined?null:Buffer.from(input.postData,'utf8');
  needPrivate(body===null||body.length<=65536);needPrivate(total<64&&pending.size<4);total++;
  const original=Promise.resolve().then(()=>request({method:input.method,url:url.pathname,headers,body}));pending.add(original);maximumPending=Math.max(maximumPending,pending.size);
  try{const value=await original;check();const response=plain(value);needPrivate(Object.keys(response).sort().join()==='body,headers,status');
   needPrivate(Number.isInteger(response.status)&&response.status>=100&&response.status<=599&&Buffer.isBuffer(response.body)&&response.body.length<=1048576);
   const responseHeaders=plain(response.headers);needPrivate(Object.keys(responseHeaders).length<=64);
   for(const [name,value]of Object.entries(responseHeaders))needPrivate(/^[A-Za-z0-9-]{1,64}$/u.test(name)&&typeof value==='string'&&value.length<=8192&&!/[\r\n\u0000]/u.test(value));
   const observedOrigin=Object.entries(responseHeaders).find(([name])=>name.toLowerCase()==='access-control-allow-origin');needPrivate(observedOrigin?.[1]===origin);
   observations.push({method:input.method,path:url.pathname,status:response.status});return {status:response.status,headers:responseHeaders,body:response.body};
  }finally{pending.delete(original);body?.fill(0);}
 },async close(){closed=true;await Promise.allSettled([...pending]);},
 describe:()=>Object.freeze({requests:total,maximumPending,pending:pending.size,closed,observations:observations.map(row=>({...row}))})});
}

export function readPrivateBrowserCredentials(value){
 const input=plain(value);needPrivate(Object.keys(input).sort().join()==='actors,canonicalTopicId,capability');
 needPrivate(typeof input.capability==='string'&&/^[A-Za-z0-9_-]{32,512}$/u.test(input.capability)&&typeof input.canonicalTopicId==='string'&&/^[A-Za-z0-9._:-]{1,128}$/u.test(input.canonicalTopicId));
 needPrivate(Array.isArray(input.actors)&&!types.isProxy(input.actors)&&Object.getPrototypeOf(input.actors)===Array.prototype&&input.actors.length===2&&Reflect.ownKeys(input.actors).length===3);
 const actors=Array.from({length:2},(_,i)=>{const d=Object.getOwnPropertyDescriptor(input.actors,String(i));needPrivate(d?.enumerable&&Object.hasOwn(d,'value'));const row=plain(d.value);
  needPrivate(Object.keys(row).sort().join()==='actorId,sessionToken'&&typeof row.actorId==='string'&&row.actorId.length<=128&&/^account-[A-Za-z0-9_-]+$/u.test(row.actorId)&&typeof row.sessionToken==='string'&&/^[A-Za-z0-9_-]{43}$/u.test(row.sessionToken));return Object.freeze(row);});
 needPrivate(actors[0].actorId!==actors[1].actorId&&actors[0].sessionToken!==actors[1].sessionToken);
 return Object.freeze({actors:Object.freeze(actors),capability:input.capability,canonicalTopicId:input.canonicalTopicId});
}
// Shared original-promise ownership for private exercise/retirement. No retry,
// callback replacement, refund or success merely from a timeout/close request.
export function createOneShotBrowserExercise({perform,retire}){
 let used=false,closed=false,pending=false,original=null,closing=null;
 return Object.freeze({exercise(value){needPrivate(!used&&!closed);used=true;const credentials=readPrivateBrowserCredentials(value);
  pending=true;original=Promise.resolve().then(()=>perform(credentials)).finally(()=>{pending=false;});return original;
 },close(){if(!closing){closed=true;closing=(async()=>{await Promise.allSettled(original?[original]:[]);return retire();})();}return closing;},
 describe:()=>Object.freeze({used,closed,pending})});
}
