// Metadata only, not a publisher-permission decision or native write authority.
export class NativeDocumentRightsError extends Error{constructor(code){super('Native document policy unavailable');this.name='NativeDocumentRightsError';this.code=code;}}
function fail(code='contract'){throw new NativeDocumentRightsError(code);}
function exact(value,keys){
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail();
 const ds=Object.getOwnPropertyDescriptors(value),actual=Reflect.ownKeys(ds);
 if(actual.length!==keys.length||actual.some(k=>!keys.includes(k)||!ds[k].enumerable||!Object.hasOwn(ds[k],'value')))fail();
 return Object.fromEntries(keys.map(k=>[k,ds[k].value]));
}
function docId(v){if(typeof v!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/u.test(v))fail();}
function str(v,max){if(typeof v!=='string'||v.length>max)fail();return v;}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
const REASONS=new Set(['document-mismatch','missing-head','head-budget','attribute-budget','directive-budget','capture-failed']);

// Serialized by native scripting: self-contained and head-only, never article text.
export function collectNativeDocumentPolicy(expectedUrl,expectedDocumentUrl=expectedUrl){
 const contractVersion='native-document-policy/1',unsupported=reason=>({contractVersion,status:'unsupported',reason});
 try{
  if(globalThis.top!==globalThis||typeof expectedUrl!=='string'||expectedUrl.length>2048||typeof expectedDocumentUrl!=='string'||expectedDocumentUrl.length>2048)return unsupported('document-mismatch');
  const current=new URL(globalThis.location.href);current.hash='';
  if(current.username||current.password||current.toString()!==expectedDocumentUrl)return unsupported('document-mismatch');
  const head=globalThis.document.head;if(!head)return unsupported('missing-head');
  const robots=[],tdm=[];let canonicalUrl='',child=head.firstElementChild,count=0;
  const attribute=(node,name,max=4096)=>{const v=node.getAttribute(name);if(v!==null&&(typeof v!=='string'||v.length>max))throw 'attribute-budget';return v??'';};
  for(;child&&count<128;child=child.nextElementSibling,count++){
   if(child.tagName==='META'){
    const name=(attribute(child,'name')||attribute(child,'http-equiv')).toLowerCase(),v=attribute(child,'content');
    if(['robots','x-robots-tag','murmingletopiccrawler'].includes(name)){if(robots.length>=32)return unsupported('directive-budget');robots.push(v);}
    if(name==='tdm-reservation'){if(tdm.length>=32)return unsupported('directive-budget');tdm.push(v);}
   }else if(child.tagName==='LINK'&&attribute(child,'rel').toLowerCase()==='canonical')canonicalUrl=attribute(child,'href',2048);
  }
  if(child)return unsupported('head-budget');
  return {contractVersion,status:'collected',url:expectedUrl,document:{url:expectedDocumentUrl,canonicalUrl,robots,tdm,complete:true}};
 }catch(e){return unsupported(e==='attribute-budget'?'attribute-budget':'capture-failed');}
}

export function createNativeDocumentRights({chromeApi,attestDocument,urlPolicy}){
 if(typeof chromeApi?.scripting?.executeScript!=='function'||typeof attestDocument!=='function'||typeof urlPolicy?.inspectPageUrl!=='function'||typeof urlPolicy?.inspectPageNavigationUrl!=='function')fail();
 function command(input,pinned){
  const a=exact(input,pinned?['tabId','documentId','sourceUrl','documentUrl']:['tabId','sourceUrl','documentUrl']);
  if(!Number.isSafeInteger(a.tabId)||a.tabId<0||Object.is(a.tabId,-0))fail();
  const s=urlPolicy.inspectPageUrl(a.sourceUrl),n=urlPolicy.inspectPageNavigationUrl(a.documentUrl);
  if(!s.supported||s.url!==a.sourceUrl||!n.supported||n.documentUrl!==a.documentUrl||n.url!==a.sourceUrl)fail();
  if(pinned)docId(a.documentId);return a;
 }
 async function execute(a,func,pinned){
  let raw;try{raw=await chromeApi.scripting.executeScript({args:a.sourceUrl===a.documentUrl?[a.sourceUrl]:[a.sourceUrl,a.documentUrl],func,
   target:pinned?{tabId:a.tabId,documentIds:[a.documentId]}:{tabId:a.tabId,frameIds:[0]},world:'ISOLATED'});}catch{fail('native-execution');}
  if(!Array.isArray(raw)||raw.length!==1||Reflect.ownKeys(raw).length!==2)fail();
  const first=Object.getOwnPropertyDescriptor(raw,'0');if(!first||!Object.hasOwn(first,'value'))fail();
  const r={};for(const k of ['frameId','documentId','result']){const d=first.value&&Object.getOwnPropertyDescriptor(first.value,k);if(!d||!Object.hasOwn(d,'value'))fail();r[k]=d.value;}
  if(r.frameId!==0||Object.is(r.frameId,-0))fail();docId(r.documentId);if(pinned&&r.documentId!==a.documentId)fail('document-mismatch');return r;
 }
 function unsupported(value,version,allowed){
  const d=value&&Object.getOwnPropertyDescriptor(value,'status');if(d&&Object.hasOwn(d,'value')&&d.value==='unsupported'){
   const r=exact(value,['contractVersion','status','reason']);if(r.contractVersion!==version||!allowed.has(r.reason))fail();fail(r.reason);
  }
 }
 return Object.freeze({
  async locate(input){
   const a=command(input,false),r=await execute(a,attestDocument,false);unsupported(r.result,'page-content-attestation/1',new Set(['document-mismatch']));
   const attestation=exact(r.result,['contractVersion','status','url']);if(attestation.contractVersion!=='page-content-attestation/1'||attestation.status!=='attested'||attestation.url!==a.sourceUrl)fail();
   return freeze({schema:'native-document-locator/v1',tabId:a.tabId,frameId:0,documentId:r.documentId,sourceUrl:a.sourceUrl,documentUrl:a.documentUrl,attestation});
  },
  async snapshot(input){
   const a=command(input,true),r=await execute(a,collectNativeDocumentPolicy,true);unsupported(r.result,'native-document-policy/1',REASONS);
   const result=exact(r.result,['contractVersion','status','url','document']);if(result.contractVersion!=='native-document-policy/1'||result.status!=='collected'||result.url!==a.sourceUrl)fail();
   const d=exact(result.document,['url','canonicalUrl','robots','tdm','complete']);if(d.url!==a.documentUrl||d.complete!==true)fail('document-mismatch');str(d.canonicalUrl,2048);
   function directives(array){
    if(!Array.isArray(array)||array.length>32||Reflect.ownKeys(array).length!==array.length+1)fail();const values=[];
    for(let i=0;i<array.length;i++){const x=Object.getOwnPropertyDescriptor(array,String(i));if(!x||!Object.hasOwn(x,'value'))fail();values.push(str(x.value,4096));}return values;
   }
   const document={url:d.url,canonicalUrl:d.canonicalUrl,robots:directives(d.robots),tdm:directives(d.tdm),complete:true};
   return freeze({schema:'native-document-policy-snapshot/v1',tabId:a.tabId,frameId:0,documentId:r.documentId,sourceUrl:a.sourceUrl,documentUrl:a.documentUrl,document});
  }
 });
}
