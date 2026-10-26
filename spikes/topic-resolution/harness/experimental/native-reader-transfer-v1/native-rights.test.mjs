import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {createNativeDocumentRights,collectNativeDocumentPolicy,NativeDocumentRightsError} from './native-rights.js';
import {attestContentDocument} from '../../../browser/chromium/page-content-reader.js';
import * as urlPolicy from '../../../browser/core/page-content-policy.js';
const URL_VALUE='https://www.stardewvalley.net/about/';
function fixture(){
 const calls=[],command={tabId:4,sourceUrl:URL_VALUE,documentUrl:URL_VALUE};let mutate=()=>{},last;
 const chromeApi={scripting:{executeScript:async options=>{
  calls.push(options);const result=options.func===attestContentDocument?{contractVersion:'page-content-attestation/1',status:'attested',url:URL_VALUE}:
   {contractVersion:'native-document-policy/1',status:'collected',url:URL_VALUE,document:{url:URL_VALUE,canonicalUrl:URL_VALUE,robots:['index'],tdm:['0'],complete:true}};
  last=[{frameId:0,documentId:'actual-native-document',result}];mutate(last);return last;
 }}};
 return {rights:createNativeDocumentRights({chromeApi,attestDocument:attestContentDocument,urlPolicy}),calls,command,
  mutate:fn=>{mutate=fn;},last:()=>last};
}
function node(tagName,attributes={}){return {tagName,getAttribute:name=>Object.hasOwn(attributes,name)?attributes[name]:null,nextElementSibling:null};}
function sample(nodes,{url=URL_VALUE,topLevel=true}={}){
 for(let i=0;i<nodes.length;i++)nodes[i].nextElementSibling=nodes[i+1]??null;
 const document={head:{firstElementChild:nodes[0]??null}};Object.defineProperty(document,'body',{get(){throw new Error('article access forbidden');}});
 const context={URL,document,location:{href:url},expected:URL_VALUE};
 return runInNewContext('globalThis.top='+(topLevel?'globalThis':'{}')+';('+collectNativeDocumentPolicy.toString()+')(expected)',context);
}
test('native locator does no text collection; before/after snapshots target exact native documentId/frame0 in isolated world',async()=>{
 const f=fixture(),located=await f.rights.locate(f.command);
 assert.equal(f.calls[0].func,attestContentDocument);assert.deepEqual(f.calls[0].target,{tabId:4,frameIds:[0]});assert.equal(f.calls[0].world,'ISOLATED');
 assert.equal(located.documentId,'actual-native-document');
 const input={tabId:4,documentId:located.documentId,sourceUrl:URL_VALUE,documentUrl:URL_VALUE};
 const before=await f.rights.snapshot(input),after=await f.rights.snapshot(input);
 for(const call of f.calls.slice(1)){assert.equal(call.func,collectNativeDocumentPolicy);assert.deepEqual(call.target,{tabId:4,documentIds:['actual-native-document']});assert.equal(call.world,'ISOLATED');}
 assert.equal(before.documentId,after.documentId);assert.equal(before.document.complete,true);assert.ok(Object.isFrozen(before.document.robots));
 f.last()[0].result.document.robots[0]='changed';assert.equal(before.document.robots[0],'index');
});
test('native wrong-frame/wrong-document/multiple-result/overlong-ID cannot become same-document rights evidence',async()=>{
 for(const alter of [r=>r[0].frameId=1,r=>r[0].documentId='different',r=>r.push(r[0]),r=>r[0].documentId='x'.repeat(129),r=>r[0].frameId=-0]){
  const f=fixture();f.mutate(alter);await assert.rejects(f.rights.snapshot({...f.command,documentId:'actual-native-document'}),NativeDocumentRightsError);
 }
});
test('exact input identity/shape rejects before native call, including credentials and incorrect minimized URLs',async()=>{
 for(const change of [{tabId:-1},{documentUrl:URL_VALUE+'?token=secret'},{sourceUrl:URL_VALUE+'?utm_source=x'},{sourceUrl:'https://private.local/'},{extra:true}]){
  const f=fixture();await assert.rejects(f.rights.locate({...f.command,...change}));assert.equal(f.calls.length,0);
 }
 const f=fixture(),input={...f.command};let calls=0;Object.defineProperty(input,'tabId',{get(){calls++;throw 0;},enumerable:true});
 await assert.rejects(f.rights.locate(input));assert.equal(calls,0);assert.equal(f.calls.length,0);
});
test('native execution failure is finite and does not echo arbitrary errors or stacks',async()=>{
 const rights=createNativeDocumentRights({chromeApi:{scripting:{executeScript:async()=>{throw new Error('secret raw browser failure');}}},attestDocument:attestContentDocument,urlPolicy});
 await assert.rejects(rights.locate({tabId:4,sourceUrl:URL_VALUE,documentUrl:URL_VALUE}),e=>e.code==='native-execution'&&!e.message.includes('secret'));
});
test('head-only snapshot returns bounded declarations without interpreting noindex/TDM as permission',()=>{
 const result=sample([node('META',{name:'robots',content:'noindex,nofollow'}),node('META',{'http-equiv':'x-robots-tag',content:'noai'}),
  node('META',{name:'tdm-reservation',content:'1'}),node('LINK',{rel:'canonical',href:URL_VALUE})]);
 assert.equal(result.status,'collected');assert.equal(result.document.robots[0],'noindex,nofollow');assert.equal(result.document.tdm[0],'1');
 assert.equal(result.document.complete,true);assert.equal(Object.hasOwn(result,'rightsAllowed'),false);assert.equal(Object.hasOwn(result,'body'),false);
});
test('exact head128 limit succeeds; head129 fails without scanning the extra node attributes',()=>{
 assert.equal(sample(Array.from({length:128},()=>node('STYLE'))).status,'collected');
 let reads=0;const extra={tagName:'META',getAttribute(){reads++;throw 0;},nextElementSibling:null};
 const result=sample([...Array.from({length:128},()=>node('STYLE')),extra]);assert.equal(result.reason,'head-budget');assert.equal(reads,0);
});
test('bounded attributes/canonical/directive counts refuse malformed metadata and never truncate',()=>{
 for(const nodes of [[node('META',{name:'robots',content:'x'.repeat(4097)})],[node('LINK',{rel:'canonical',href:'x'.repeat(2049)})],
  Array.from({length:33},()=>node('META',{name:'robots',content:'index'})),Array.from({length:33},()=>node('META',{name:'tdm-reservation',content:'0'}))]){
  const result=sample(nodes);assert.equal(result.status,'unsupported');assert.ok(['attribute-budget','directive-budget'].includes(result.reason));
 }
 assert.equal(sample([node('META',{name:'robots',content:'x'.repeat(4096)})]).status,'collected');
});
test('different URL/subframe and malformed native result fail without article metadata rescue',async()=>{
 assert.equal(sample([],{url:URL_VALUE+'?different=1'}).reason,'document-mismatch');assert.equal(sample([],{topLevel:false}).reason,'document-mismatch');
 for(const alter of [r=>r[0].result.document.url=URL_VALUE+'?changed=1',r=>r[0].result.document.complete=false,r=>r[0].result.document.robots=['x'.repeat(4097)],
  r=>r[0].result.document.tdm=new Array(2),r=>r[0].result.document.extra=true]){
  const f=fixture();f.mutate(alter);await assert.rejects(f.rights.snapshot({...f.command,documentId:'actual-native-document'}));
 }
});
test('native unsupported snapshots preserve only finite known reasons; locator result must be actual attestation',async()=>{
 const f=fixture();f.mutate(r=>r[0].result={contractVersion:'native-document-policy/1',status:'unsupported',reason:'head-budget'});
 await assert.rejects(f.rights.snapshot({...f.command,documentId:'actual-native-document'}),{code:'head-budget'});
 const g=fixture();g.mutate(r=>r[0].result={contractVersion:'page-content-attestation/1',status:'attested',url:URL_VALUE,forged:true});await assert.rejects(g.rights.locate(g.command));
});
