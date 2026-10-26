import test from 'node:test';
import assert from 'node:assert/strict';
import {FIXED_CASES} from './native-adapter.js';
import {NATIVE_DNS_HOSTS,selectNativeDnsPin,compileNativeDnsPins,describeNativeDnsPins,nativeHostResolverArgument,
 nativeHostPinned,verifyNativeSelectedPeer,createNativeArticleNetworkGate,admitNativePageRequest,admitNativeMainResponse,
 describeNativeArticleNetworkGate,closeNativeArticleNetworkGate,verifyNativeNavigationLoader} from './network-policy.js';

const answers=()=>[{address:'8.8.8.8',family:4}],rows=()=>NATIVE_DNS_HOSTS.map(host=>({host,status:'pinned',answers:answers()}));
const pins=()=>compileNativeDnsPins({rows:rows()}),url=FIXED_CASES[0].url;
const request=(changes={})=>({requestId:'fetch-1',networkId:'network-1',frameId:'frame-1',url,method:'GET',resourceType:'Document',authorizationPresent:false,...changes});
function response(changes={}){return {paused:{url,status:200,headers:[{name:'content-type',value:'text/html'}],networkId:'network-1',frameId:'frame-1',requestId:'response-1'},
 network:{url,status:200,requestId:'network-1',frameId:'frame-1',loaderId:'loader-1',remoteAddress:'8.8.8.8',securityState:'secure',mimeType:'text/html'},...changes};}
const gate=()=>createNativeArticleNetworkGate({dnsPins:pins(),caseUrl:url,frameId:'frame-1'});

test('all34 exact hosts and all DNS answers are validated; deterministic one public pin, no address rescue',()=>{
 assert.equal(NATIVE_DNS_HOSTS.length,34);const host=NATIVE_DNS_HOSTS[0];
 const a=selectNativeDnsPin({host,answers:[{address:'2606:4700:4700::1111',family:6},{address:'9.9.9.9',family:4},...answers()]});
 const b=selectNativeDnsPin({host,answers:[...answers(),{address:'9.9.9.9',family:4},{address:'2606:4700:4700:0:0:0:0:1111',family:6}]});
 assert.deepEqual(a,b);assert.equal(a.address,'8.8.8.8');
 for(const address of ['127.0.0.1','10.0.0.1','192.168.1.1','203.0.113.1','::1','::ffff:8.8.8.8','2001:db8::1']){
  assert.throws(()=>selectNativeDnsPin({host,answers:[...answers(),{address,family:address.includes(':')?6:4}]}));
 }
 assert.throws(()=>selectNativeDnsPin({host:'private.invalid',answers:answers()}));assert.throws(()=>selectNativeDnsPin({host,answers:[]}));
});
test('fixed resolver map has exact pins before deny-all; unavailable and unknown hosts never use normal DNS',()=>{
 const input=rows();input[1]={host:input[1].host,status:'unavailable',answers:[]};const h=compileNativeDnsPins({rows:input}),arg=nativeHostResolverArgument(h);
 assert.ok(arg.endsWith('MAP * ~NOTFOUND'));assert.ok(arg.startsWith('--host-resolver-rules=MAP '+NATIVE_DNS_HOSTS[0]+' 8.8.8.8, '));
 assert.equal(arg.includes('EXCLUDE'),false);assert.equal(arg.includes('MAP '+NATIVE_DNS_HOSTS[1]+' '),false);assert.equal(nativeHostPinned(h,NATIVE_DNS_HOSTS[1]),false);
 assert.equal(describeNativeDnsPins(h).pinned,33);assert.equal(JSON.stringify(describeNativeDnsPins(h)).includes('8.8.8.8'),false);
 assert.throws(()=>compileNativeDnsPins({rows:input.slice(1)}));assert.throws(()=>compileNativeDnsPins({rows:[...input].reverse()}));
 assert.throws(()=>nativeHostPinned(h,'unknown.invalid'));
});
test('actual peer must equal selected public pin, not merely another public address; IPv6 canonical equality is exact',()=>{
 const h=pins();assert.equal(verifyNativeSelectedPeer(h,NATIVE_DNS_HOSTS[0],'8.8.8.8').selectedPublicPinMatched,true);
 assert.throws(()=>verifyNativeSelectedPeer(h,NATIVE_DNS_HOSTS[0],'1.1.1.1'));assert.throws(()=>verifyNativeSelectedPeer(h,NATIVE_DNS_HOSTS[0],'127.0.0.1'));
 const r=rows();r[0].answers=[{address:'2606:4700:4700::1111',family:6}];const ipv6=compileNativeDnsPins({rows:r});
 assert.ok(nativeHostResolverArgument(ipv6).includes('['+'2606:4700:4700::1111'+']'));
 assert.equal(verifyNativeSelectedPeer(ipv6,NATIVE_DNS_HOSTS[0],'2606:4700:4700:0:0:0:0:1111').selectedPublicPinMatched,true);
});
test('only exact one-use main document and allowed current-origin/CDN GET resources continue',()=>{
 const h=gate();assert.equal(admitNativePageRequest(h,request()).mainDocument,true);
 assert.equal(admitNativePageRequest(h,request({requestId:'f2',networkId:'n2'})).reason,'main-navigation');
 for(const [i,type]of ['Script','Stylesheet','Image','Font','XHR','Fetch'].entries()){
  const r=admitNativePageRequest(h,request({requestId:'resource-'+i,networkId:null,resourceType:type,url:new URL('/resource-'+i,url).href}));assert.equal(r.action,'continue');
 }
 assert.equal(admitNativePageRequest(h,request({requestId:'cdn',networkId:null,resourceType:'Script',url:'https://cdn.jsdelivr.net/npm/package/file.js'})).action,'continue');
 assert.equal(describeNativeArticleNetworkGate(h).restrictedNetworkRendering,true);
});
test('wrong origin, credentials/private/auth URL, method, frame, socket/worker/media and unpinned resource are blocked',()=>{
 const changes=[{url:FIXED_CASES[1].url,resourceType:'Script'},{url:'http://127.0.0.1:4174/v1/catalog',resourceType:'Fetch'},
  {url:'https://www.stardewvalley.net/account/',resourceType:'Fetch'},{url:'https://www.stardewvalley.net/api?token=secret',resourceType:'Fetch'},
  {method:'POST'},{frameId:'other-frame'},{authorizationPresent:true},{resourceType:'WebSocket'},{resourceType:'Worker'},{resourceType:'Media'}];
 for(const value of changes){assert.equal(admitNativePageRequest(gate(),request(value)).action,'abort');}
 const r=rows();r[0]={host:r[0].host,status:'unavailable',answers:[]};const h=createNativeArticleNetworkGate({dnsPins:compileNativeDnsPins({rows:r}),caseUrl:url,frameId:'f'});
 assert.equal(admitNativePageRequest(h,request({frameId:'f'})).reason,'unpinned-host');
});
test('main HTTP witness reserves observed response loader and binds exact Request/Network/frame/TLS/pin/headers without native-ID fiction',()=>{
 const h=gate();admitNativePageRequest(h,request());const proof=admitNativeMainResponse(h,response());
 assert.equal(proof.networkRequestId,'network-1');assert.equal(proof.fetchRequestId,'fetch-1');assert.equal(proof.fetchResponseId,'response-1');
 assert.equal(proof.nativeDocumentIdDirectlyCorrelated,false);assert.equal(proof.domPolicyRequiredSeparately,true);
 assert.equal(proof.navigationLoaderVerified,false);
 for(const forbidden of ['8.8.8.8','content-type','https://','"headers":'])assert.equal(JSON.stringify(proof).includes(forbidden),false);
 assert.throws(()=>admitNativeMainResponse(h,response()));
 for(const mutate of [r=>r.network.requestId='wrong',r=>r.network.frameId='wrong',r=>r.paused.networkId='wrong',r=>r.network.url+='x',
  r=>r.network.securityState='insecure',r=>r.network.remoteAddress='1.1.1.1',r=>r.network.loaderId='',
  r=>{r.paused.status=302;r.network.status=302;},r=>r.paused.headers.push({name:'x-robots-tag',value:'noindex'}),
  r=>r.paused.headers.push({name:'tdm-reservation',value:'1'})]){
  const g=gate();admitNativePageRequest(g,request());const r=response();mutate(r);assert.throws(()=>admitNativeMainResponse(g,r));
 }
});
test('independently observed current navigation loader must match the reserved response loader before final proof',()=>{
 const h=gate();admitNativePageRequest(h,request());admitNativeMainResponse(h,response());
 assert.throws(()=>verifyNativeNavigationLoader(h,{url,frameId:'frame-1',loaderId:'different-navigation-loader'}),{code:'navigation-loader-mismatch'});
 assert.equal(describeNativeArticleNetworkGate(h).navigationLoaderVerified,false);
 const proof=verifyNativeNavigationLoader(h,{url,frameId:'frame-1',loaderId:'loader-1'});assert.equal(proof.navigationLoaderVerified,true);
 assert.throws(()=>verifyNativeNavigationLoader(h,{url,frameId:'frame-1',loaderId:'loader-1'}));
 const g=gate();assert.throws(()=>verifyNativeNavigationLoader(g,{url,frameId:'frame-1',loaderId:'loader-1'}));
});
test('request identity, lifetime bound and retirement fail closed; inputs and snapshots are detached',()=>{
 const h=gate(),r=request();admitNativePageRequest(h,r);r.requestId='modified';assert.throws(()=>admitNativePageRequest(h,request()));
 const s=describeNativeArticleNetworkGate(h);assert.ok(Object.isFrozen(s.blocked));closeNativeArticleNetworkGate(h);assert.throws(()=>admitNativePageRequest(h,request({requestId:'other'})));
 const g=gate();for(let i=0;i<1024;i++)admitNativePageRequest(g,request({requestId:'r'+i,resourceType:'Script',networkId:null,url:new URL('/x',url).href}));
 assert.throws(()=>admitNativePageRequest(g,request({requestId:'overflow'})),{code:'article-event-capacity'});
});
test('nested proxy/accessor inputs reject without caller hooks or URL/secret error output',()=>{
 let reads=0;const getter=()=>{reads++;throw Error('secret');};
 const a=answers();Object.defineProperty(a[0],'address',{get:getter,enumerable:true});assert.throws(()=>selectNativeDnsPin({host:NATIVE_DNS_HOSTS[0],answers:a}));
 assert.throws(()=>compileNativeDnsPins(new Proxy({},{getPrototypeOf:getter})));const r=request();Object.defineProperty(r,'url',{get:getter,enumerable:true});assert.throws(()=>admitNativePageRequest(gate(),r));
 assert.equal(reads,0);
});
