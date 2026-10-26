import test from 'node:test';import assert from 'node:assert/strict';
import { createDocumentGate,reserveDocument,verifyResponse,bindDocument,assertDocument,retainPairedSnapshot,closeDocumentGate,requestHeaders } from './policy.js';
const CONTROLS=Array.from({length:4},(_,i)=>({id:'producer-transfer-'+String(i+1).padStart(3,'0'),groupId:'invented-'+i,url:'https://invented.example/article-'+i,language:'en'}));
const frame=()=>({}),request=()=>({});
function fixture(){const main=frame(),r=request(),h=createDocumentGate({url:CONTROLS[0].url,mainFrame:main,frameId:'frame-main',scope:CONTROLS});
 const reserve=(extra={})=>reserveDocument(h,{request:r,url:CONTROLS[0].url,method:'GET',resourceType:'document',frame:main,...extra});
 const response=(extra={})=>verifyResponse(h,{request:r,url:CONTROLS[0].url,status:200,headers:[],serverIp:'8.8.8.8',tlsVerified:true,mimeType:'text/html',...extra});
 return {h,main,r,reserve,response};}
test('fixed consumed TRAIN controls exact order; document gate synchronously reserves only one matching main GET/HEAD',()=>{
 assert.equal(CONTROLS.length,4);
 for(const method of ['GET','HEAD']){const f=fixture();assert.equal(f.reserve({method}),true);assert.equal(f.reserve(),false);}
 for(const change of [{frame:frame()},{method:'POST'},{url:CONTROLS[1].url},...['script','stylesheet','xhr','fetch','image','font','media','other','websocket'].map(resourceType=>({resourceType}))]){const f=fixture();assert.equal(f.reserve(change),false);assert.equal(f.reserve(),true);}
});
test('response must be same admitted request before headers/TLS/public peer/current document may qualify',()=>{
 const f=fixture();assert.throws(()=>f.response());f.reserve();
 for(const change of [{request:request()},{url:CONTROLS[1].url},{serverIp:null},{serverIp:'127.0.0.1'},{serverIp:'10.0.0.1'},{tlsVerified:false},{status:302},{mimeType:'text/plain'},
  {headers:[{name:'TDM-Reservation',value:'1'}]},{headers:[{name:'X-Robots-Tag',value:'noindex'}]},
  {headers:[{name:'TDM-Reservation',value:'0'},{name:'tdm-reservation',value:'0'}]}])assert.throws(()=>f.response(change));
 const response=f.response();assert.equal(response.networkRequestIdCorrelated,false);assert.equal(response.requestIdentityScope,'same-playwright-request-object/v1');assert.throws(()=>f.response());
 bindDocument(f.h,{frameId:'frame-main',loaderId:'loader-one',url:CONTROLS[0].url});assert.equal(assertDocument(f.h,{frameId:'frame-main',loaderId:'loader-one',url:CONTROLS[0].url}),true);
 for(const change of [{loaderId:'stale'},{frameId:'other'},{url:CONTROLS[1].url}])assert.throws(()=>assertDocument(f.h,{frameId:'frame-main',loaderId:'loader-one',url:CONTROLS[0].url,...change}));
 closeDocumentGate(f.h);assert.throws(()=>assertDocument(f.h,{frameId:'frame-main',loaderId:'loader-one',url:CONTROLS[0].url}));
});
test('response and DOM policy precede bounded reader metadata plus a separately paired checked input',()=>{
 const f=fixture(),value={capture:{contractVersion:'page-content/1',status:'collected',url:CONTROLS[0].url,title:'Invented title',text:'Invented bounded reader body. '.repeat(10),extractorVersion:'main-text-prefix/v1'},
  document:{url:CONTROLS[0].url,canonicalUrl:CONTROLS[0].url,robots:[],tdm:[],complete:true},navigationId:'invented-navigation',documentId:'invented-document'};
 assert.throws(()=>retainPairedSnapshot(f.h,value));f.reserve();f.response();bindDocument(f.h,{frameId:'frame-main',loaderId:'loader-one',url:CONTROLS[0].url});
 const r=retainPairedSnapshot(f.h,value);assert.equal(r.status,'collected');assert.equal(Object.hasOwn(r.capture,'bodyPrefix'),false);assert.equal(Object.hasOwn(r.capture,'text'),false);assert.equal(r.pairedInput.body,value.capture.text);assert.equal(r.documentWitness.schema,'playwright-owned-document/v1');
 assert.throws(()=>retainPairedSnapshot(f.h,{...value,document:{...value.document,tdm:['1']}}));assert.throws(()=>retainPairedSnapshot(f.h,{...value,document:{...value.document,robots:['noindex']}}));
});
test('credentials stripped and hostile records reject without callbacks',()=>{
 const h=requestHeaders({Cookie:'private',Authorization:'private',Accept:'text/html'});assert.equal(JSON.stringify(h).includes('private'),false);
 let calls=0;assert.throws(()=>createDocumentGate(new Proxy({},{get(){calls++;throw 0},ownKeys(){calls++;throw 0}})));assert.equal(calls,0);
});


