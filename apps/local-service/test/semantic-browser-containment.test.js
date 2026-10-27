// In-memory CDP, HTTP and lifecycle ports only; no browser, socket or SQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {AUTO_ATTACH,installSemanticBrowserContainment,createPrivateBrowserRequestProxy,readPrivateBrowserCredentials,createOneShotBrowserExercise} from '../harness/semantic-browser-containment.js';
const origin='chrome-extension://'+'a'.repeat(32),other='chrome-extension://'+'b'.repeat(32),token='p'.repeat(43),session='s'.repeat(43);
const gate=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function boundary(){
 const browser=new EventEmitter(),commands=[],tasks=new Set(),targets=new Map(),groups=new Map(),failures=[],infos=new Map();let closing=false;
 browser.close=async()=>{commands.push(['close']);};
 const protocol=async(method,args,id)=>{commands.push([method,args,id]);return method==='Target.getTargetInfo'?{targetInfo:infos.get(args.targetId)}:{};};
 const track=promise=>{tasks.add(promise);promise.finally(()=>tasks.delete(promise)).catch(()=>{});return promise;};
 const state=installSemanticBrowserContainment({browser,targets,targetGroups:groups,track,protocol,getOrigin:()=>origin,waitOrigin:async()=>origin,isClosing:()=>closing,isExtensionLoadStarted:()=>true,onFailure:(code,detail)=>failures.push({code,detail})});
 return {browser,commands,targets,groups,failures,state,
  emit(id,url=origin+'/chromium/background.js',waiting=true,targetId='owned'){const info={targetId,type:'service_worker',url,attached:true};infos.set(targetId,info);browser.emit('Target.attachedToTarget',{sessionId:id,targetInfo:info,waitingForDebugger:waiting});},
  settle:async()=>{while(tasks.size)await Promise.allSettled([...tasks]);},shutdown:()=>{closing=true;}};
}
test('shared attachment code installs recursive offline and Fetch gates before any owned target resumes',async()=>{
 assert.ok(Object.isFrozen(AUTO_ATTACH)&&Object.isFrozen(AUTO_ATTACH.filter)&&AUTO_ATTACH.filter.every(Object.isFrozen));
 const b=boundary();b.emit('first');await b.settle();const row=b.targets.get('first');
 assert.equal(row.ready,true);assert.equal(row.ownedOrigin,origin);assert.deepEqual(b.failures,[]);
 const methods=b.commands.map(row=>row[0]);for(const method of ['Target.setAutoAttach','Network.emulateNetworkConditions','Fetch.enable'])assert.ok(methods.indexOf(method)<methods.indexOf('Runtime.runIfWaitingForDebugger'));
 assert.equal(b.commands.find(row=>row[0]==='Network.emulateNetworkConditions')[1].offline,true);
});
test('shared foreign quarantine and duplicate alias behavior never invents an additional resume',async()=>{
 const b=boundary();b.emit('foreign',other+'/chromium/background.js',true,'foreign');await b.settle();
 assert.equal(b.targets.get('foreign').quarantined,true);assert.equal(b.targets.get('foreign').resumeIssued,false);
 assert.equal(b.commands.some(row=>row[0]==='Runtime.runIfWaitingForDebugger'),false);
 b.emit('owner');await b.settle();b.emit('alias',origin+'/chromium/background.js',false);await b.settle();
 assert.equal(b.targets.get('alias').aliased,true);assert.equal(b.targets.get('alias').boundTo,b.targets.get('owner').ordinal);
 assert.equal(b.commands.filter(row=>row[0]==='Runtime.runIfWaitingForDebugger').length,1);
 b.browser.emit('Target.detachedFromTarget',{sessionId:'owner'});assert.equal(b.state.failed(),true);assert.equal(b.failures.at(-1).code,'contained-owner-detached');
});
function request(overrides={}){return {method:'POST',url:'http://127.0.0.1:4174/v1/commands',headers:{Origin:origin,Authorization:'Bearer '+token,'X-Account-Session':session,'Content-Type':'application/json'},postData:'{"body":"café"}',...overrides};}
function response(status=200,body=Buffer.from('{"actual":true}')){return {status,headers:{'content-type':'application/json; charset=utf-8','access-control-allow-origin':origin},body};}
test('private proxy preserves original request UTF8 and response status/header/body bytes without exposing credentials',async()=>{
 let received;const raw=response(403),proxy=createPrivateBrowserRequestProxy({origin,checkDeadline:()=>{},isOpen:()=>true,request:async value=>{received={...value,body:Buffer.from(value.body)};return raw;}});
 const result=await proxy.forward(request());assert.equal(received.url,'/v1/commands');assert.equal(received.headers.Origin,origin);assert.equal(received.headers.Host,'127.0.0.1:4174');
 assert.equal(received.headers.Authorization,'Bearer '+token);assert.equal(received.headers['X-Account-Session'],session);assert.deepEqual(received.body,Buffer.from('{"body":"café"}'));
 assert.equal(result.status,403);assert.deepEqual(result.headers,raw.headers);assert.equal(result.body,raw.body);
 const diagnostic=JSON.stringify(proxy.describe());for(const secret of [token,session,'café','actual'])assert.equal(diagnostic.includes(secret),false);await proxy.close();
});
test('external URLs, origins, demo principals, selectors and preflight credentials fail before HTTP work',async()=>{
 let calls=0;const proxy=createPrivateBrowserRequestProxy({origin,checkDeadline:()=>{},isOpen:()=>true,request:async()=>{calls++;return response();}});
 for(const input of [request({url:'http://127.0.0.1:4185/v1/commands'}),request({url:'https://external.example/v1/commands'}),request({url:'http://127.0.0.1:4174/v1/ai/insights'}),
  request({url:'http://127.0.0.1:4174/v1/commands?token=secret'}),request({headers:{Authorization:'Bearer '+token}}),request({headers:{Origin:other,Authorization:'Bearer '+token}}),
  request({headers:{Origin:origin,Authorization:'Bearer '+token,'X-Demo-Actor':'demo-alex'}}),request({method:'DELETE'}),request({method:'OPTIONS'})])await assert.rejects(proxy.forward(input));
 assert.equal(calls,0);await proxy.close();
});
test('genuine preflight is forwarded without credentials or a synthetic CORS response',async()=>{
 let seen;const actual=response(204,Buffer.alloc(0)),proxy=createPrivateBrowserRequestProxy({origin,checkDeadline:()=>{},isOpen:()=>true,request:async value=>{seen=value;return actual;}});
 const result=await proxy.forward(request({method:'OPTIONS',postData:undefined,headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,x-account-session,content-type'}}));
 assert.equal(seen.method,'OPTIONS');assert.equal(seen.body,null);assert.equal(seen.headers.Authorization,undefined);assert.equal(result.status,204);assert.equal(result.body,actual.body);await proxy.close();
});
test('closing waits original HTTP callbacks and suppresses late delivery without cancellation, refund or retry',async()=>{
 const held=gate();let calls=0,closed=false;const proxy=createPrivateBrowserRequestProxy({origin,checkDeadline:()=>{},isOpen:()=>true,request:()=>{calls++;return held.promise;}});
 const work=proxy.forward(request()),refused=assert.rejects(work);await tick();const closing=proxy.close().then(()=>{closed=true;});await tick();assert.equal(closed,false);
 await assert.rejects(proxy.forward(request()));held.resolve(response());await refused;await closing;assert.equal(calls,1);assert.equal(proxy.describe().pending,0);
});
test('credential snapshots refuse getters/proxies and duplicate principals without returning secrets in lifecycle metadata',async()=>{
 const credentials={actors:[{actorId:'account-first',sessionToken:'a'.repeat(43)},{actorId:'account-second',sessionToken:'b'.repeat(43)}],capability:token,canonicalTopicId:'canonical-private-topic'};
 const copy=readPrivateBrowserCredentials(credentials);credentials.actors[0].sessionToken='c'.repeat(43);assert.equal(copy.actors[0].sessionToken,'a'.repeat(43));assert.ok(Object.isFrozen(copy.actors[0]));
 const held=gate(),events=[];const owner=createOneShotBrowserExercise({perform:async value=>{assert.equal(value.actors[0].actorId,'account-first');events.push('perform');await held.promise;throw false;},retire:async()=>{events.push('retire');return {closed:true};}});
 const original=owner.exercise(copy),failed=assert.rejects(original,value=>value===false);assert.throws(()=>owner.exercise(copy));let closed=false;const closing=owner.close().then(()=>{closed=true;});await tick();assert.equal(closed,false);assert.deepEqual(events,['perform']);
 assert.equal(JSON.stringify(owner.describe()).includes(token),false);held.resolve();await failed;await closing;assert.deepEqual(events,['perform','retire']);
 let hooks=0;const getter={...copy};Object.defineProperty(getter,'capability',{enumerable:true,get(){hooks++;return token;}});assert.throws(()=>readPrivateBrowserCredentials(getter));
 assert.throws(()=>readPrivateBrowserCredentials(new Proxy(copy,{get(){hooks++;}})));assert.equal(hooks,0);
 assert.throws(()=>readPrivateBrowserCredentials({...copy,actors:[copy.actors[0],copy.actors[0]]}));
});
