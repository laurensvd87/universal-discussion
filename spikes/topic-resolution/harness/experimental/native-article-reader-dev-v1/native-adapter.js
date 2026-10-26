// Inert factory with explicit trusted capabilities. The separate MV3 worker
// statically wires byte-identical staged production modules and actual Chrome.
const URLS=Object.freeze([1,2,3,4].map(i=>'http://127.0.0.1:4173/background-fixture/adr168-article-'+i));
export const FIXED_CASES=Object.freeze(URLS.map((url,i)=>Object.freeze({id:'native-article-dev-'+String(i+1).padStart(3,'0'),ordinal:i+1,url})));
const BAD_TEXT=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const IDENTIFIER=/^[A-Za-z0-9._:-]{1,160}$/u;
const READ_REASONS=new Set(['document-mismatch','missing-region','capture-budget','rights-restricted','invalid-content','capture-time-budget',
 'capture-node-budget','capture-head-budget','capture-attribute-budget','capture-failed']);
const SKIP_REASONS=new Set(['origin-policy-unavailable','origin-policy-refused','article-unavailable','document-policy-unavailable','restricted-rendering']);
export class NativeReaderTransferError extends Error{
 constructor(code){super('Native reader transfer refused');this.name='NativeReaderTransferError';this.code=code;}
}
// Diagnostic-only trusted-module seam. The staged worker supplies the actual
// unchanged rights object and exact NativeDocumentRightsError prototype.
// This is evidence of that helper's targeted-execution refusal, not a claim
// about the particular Chrome error hidden by its native-execution boundary.
export function createTargetedSnapshotProbe({rights,errorPrototype}){
 if(!rights||typeof rights.snapshot!=='function'||!errorPrototype)throw new TypeError('Diagnostic probe dependencies unavailable');
 return async input=>{
  try{await rights.snapshot(input);return Object.freeze({refused:false});}
  catch(error){
   if(!error||Object.getPrototypeOf(error)!==errorPrototype)throw error;
   const d=Object.getOwnPropertyDescriptor(error,'code');
   if(!d||!Object.hasOwn(d,'value')||d.value!=='native-execution')throw error;
   return Object.freeze({refused:true,rightsHelperCode:'native-execution'});
  }
 };
}
class Unavailable extends Error{constructor(code){super('Native reader unavailable');this.code=code;}}
function invalid(code='command-contract'){throw new NativeReaderTransferError(code);}
function record(value,keys){
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();
 const descriptors=Object.getOwnPropertyDescriptors(value),actual=Reflect.ownKeys(descriptors);
 if(actual.length!==keys.length||actual.some(k=>!keys.includes(k)||!descriptors[k].enumerable||!Object.hasOwn(descriptors[k],'value')))invalid();
 return Object.fromEntries(keys.map(k=>[k,descriptors[k].value]));
}
function id(value,min=1){if(typeof value!=='string'||value.length<min||!IDENTIFIER.test(value))invalid();return value;}
function integer(value){if(!Number.isSafeInteger(value)||value<0||Object.is(value,-0))invalid();return value;}
function freeze(value){if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
function text(value,limit,empty=false){
 if(typeof value!=='string'||value.length>limit||!empty&&!value.trim()||BAD_TEXT.test(value))invalid('native-contract');
 // Preserve exact UTF16 rather than laundering malformed units through UTF8 hashes.
 for(let i=0;i<value.length;i++){
  const unit=value.charCodeAt(i);
  if(unit>=0xd800&&unit<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))invalid('native-contract');}
  else if(unit>=0xdc00&&unit<=0xdfff)invalid('native-contract');
 }return value;
}

export function createNativeReaderTransfer({chromeApi,reader,urlPolicy}={}){
 // API objects and optional dependencies are trusted infrastructure. They confer
 // no account, pairing, rights, model, canonical or production-session authority.
 let begun=false,initializing=false,initialized=false,ended=false,busy=false,studyId=null,studyRevision=null,windowId=null,epoch=0,next=1,events=0,eventFailure=false;
 const nonces=new Set(),listeners=[];
 const touch=()=>{if(events>=4096||epoch>=Number.MAX_SAFE_INTEGER){eventFailure=true;return;}events++;epoch++;};
 function event(fn){return (...args)=>{if(ended)return;try{fn(...args);touch();}catch{eventFailure=true;touch();}};}
 function attach(emitter,callback){
  if(ended)invalid('study-initialization');
  if(typeof emitter?.addListener!=='function'||typeof emitter?.removeListener!=='function')invalid('native-api');
  listeners.push([emitter,callback]);emitter.addListener(callback);
  if(ended){detach();invalid('study-initialization');}
 }
 function detach(){for(const [emitter,callback]of listeners.splice(0))try{emitter.removeListener(callback);}catch{eventFailure=true;}}
 function subscribe(){
  attach(chromeApi.tabs.onActivated,event(info=>{const r=record(info,['tabId','windowId']);integer(r.tabId);integer(r.windowId);}));
  attach(chromeApi.tabs.onUpdated,event((tabId,changes)=>{
   integer(tabId);if(!changes||typeof changes!=='object')invalid('native-event');
   for(const key of ['status','url']){const d=Object.getOwnPropertyDescriptor(changes,key);if(d&&!Object.hasOwn(d,'value'))invalid('native-event');
    if(d&&typeof d.value!=='string')invalid('native-event');}
  }));
  attach(chromeApi.tabs.onRemoved,event(tabId=>integer(tabId)));
  attach(chromeApi.tabs.onReplaced,event((added,removed)=>{integer(added);integer(removed);}));
  attach(chromeApi.windows.onFocusChanged,event(value=>{if(value!==-1)integer(value);}));
  attach(chromeApi.windows.onRemoved,event(value=>integer(value)));
  attach(chromeApi.permissions.onRemoved,event(()=>{}));
 }
 async function dependencies(){
  if(typeof urlPolicy?.inspectPageNavigationUrl!=='function'||typeof urlPolicy?.inspectPageUrl!=='function'||typeof reader?.read!=='function'||typeof reader?.attest!=='function')invalid('native-api');
 }
 function guard(ownEpoch){
  if(eventFailure)invalid('native-event');
  if(ended||epoch!==ownEpoch)throw new Unavailable('context-changed');
 }
 async function foreground(c,ownEpoch){
  guard(ownEpoch);
  let w,tabs,permission,last;
  try{
   w=await chromeApi.windows.getLastFocused({populate:false});guard(ownEpoch);
   if(w?.id!==windowId||w?.type!=='normal'||w?.incognito!==false||w?.focused!==true)throw new Unavailable('foreground-unavailable');
   tabs=await chromeApi.tabs.query({active:true,windowId});guard(ownEpoch);
   if(!Array.isArray(tabs)||tabs.length!==1)throw new Unavailable('foreground-unavailable');
   const t=tabs[0];
   if(!Number.isSafeInteger(t?.id)||t.id<0||t.windowId!==windowId||t.active!==true||t.incognito!==false||t.status!=='complete'||t.pendingUrl||t.url!==c.url)throw new Unavailable('foreground-unavailable');
   const navigation=urlPolicy.inspectPageNavigationUrl(t.url);
   if(!navigation.supported||navigation.documentUrl!==c.url)throw new Unavailable('url-unavailable');
   permission=await chromeApi.permissions.contains({origins:[navigation.origin+'/*']});guard(ownEpoch);
   if(permission!==true)throw new Unavailable('permission-unavailable');
   last=await chromeApi.windows.getLastFocused({populate:false});guard(ownEpoch);
   if(last?.id!==windowId||last?.type!=='normal'||last?.incognito!==false||last?.focused!==true)throw new Unavailable('foreground-unavailable');
   return {windowId,tabId:t.id,focused:true,windowType:'normal',incognito:false,active:true,tabStatus:'complete',sourceUrl:navigation.url,documentUrl:navigation.documentUrl,permissionGranted:true};
  }catch(e){if(e instanceof Unavailable||e instanceof NativeReaderTransferError)throw e;throw new Unavailable('native-api-unavailable');}
 }
 function identity(command){
  if(!begun||ended||command.studyId!==studyId||command.studyRevision!==studyRevision)invalid('study-identity');
 }
 function admitObservation(command){
  identity(command);
  if(initializing||!initialized)invalid('study-initializing');
  if(eventFailure)invalid('native-event');
  if(busy)invalid('single-flight');id(command.observationNonce,16);
  if(command.ordinal!==next||command.caseId!==FIXED_CASES[next-1]?.id||nonces.has(command.observationNonce))invalid('observation-replay');
  const c=FIXED_CASES[next-1];next++;nonces.add(command.observationNonce);return c;
 }
 return Object.freeze({
  async beginStudy(input){
   if(begun)invalid('study-replay');begun=true;initializing=true;
   try{
    const r=record(input,['studyId','windowId','cases']);id(r.studyId,16);integer(r.windowId);
    if(!Array.isArray(r.cases)||r.cases.length!==4||Reflect.ownKeys(r.cases).length!==5)invalid();
    for(let i=0;i<4;i++){const d=Object.getOwnPropertyDescriptor(r.cases,String(i));if(!d||!Object.hasOwn(d,'value'))invalid();
     const c=record(d.value,['id','ordinal','url']),expected=FIXED_CASES[i];if(c.id!==expected.id||c.ordinal!==expected.ordinal||c.url!==expected.url)invalid();}
    studyId=r.studyId;windowId=r.windowId;studyRevision=crypto.randomUUID();
    await dependencies();if(ended||eventFailure)invalid('study-initialization');subscribe();if(ended||eventFailure)invalid('study-initialization');
    initialized=true;
    return freeze({schema:'native-article-dev-study/v1',studyId,studyRevision,eventEpoch:epoch,caseCount:4});
   }catch{ended=true;detach();invalid('study-initialization');}finally{initializing=false;}
  },
  async observe(input){
   const r=record(input,['studyId','studyRevision','caseId','ordinal','observationNonce']);
   const c=admitObservation(r);busy=true;const ownEpoch=epoch;
   try{
    const before=await foreground(c,ownEpoch);guard(ownEpoch);
    let captured;
    try{captured=await reader.read(before.tabId,before.sourceUrl,before.documentUrl);}catch{guard(ownEpoch);throw new Unavailable('native-read-unavailable');}
    guard(ownEpoch);const capture=record(captured,['documentId','result']);id(capture.documentId);if(capture.documentId.length>128)invalid('native-contract');
    const status=Object.getOwnPropertyDescriptor(capture.result??{},'status');
    if(status&&Object.hasOwn(status,'value')&&status.value==='unsupported'){
     const unsupported=record(capture.result,['contractVersion','status','reason']);
     if(unsupported.contractVersion!=='page-content/1'||!READ_REASONS.has(unsupported.reason))invalid('native-contract');
     throw new Unavailable('reader-'+unsupported.reason);
    }
    const content=record(capture.result,['contractVersion','status','url','title','text','extractorVersion']);
    if(content.contractVersion!=='page-content/1'||content.status!=='collected'||content.url!==before.sourceUrl||
     !['main-text-prefix/v1','article-container-prefix/v1'].includes(content.extractorVersion))invalid('native-contract');
    const rawTitle=text(content.title,200,true),body=text(content.text,4096),effectiveTitle=text(rawTitle.trim()||new URL(before.sourceUrl).hostname,200);
    const after=await foreground(c,ownEpoch);guard(ownEpoch);
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Unavailable('context-changed');
    let proof;try{proof=await reader.attest(before.tabId,capture.documentId,before.sourceUrl,before.documentUrl);}catch{guard(ownEpoch);throw new Unavailable('native-attestation-unavailable');}
    guard(ownEpoch);
    const proofStatus=Object.getOwnPropertyDescriptor(proof??{},'status');
    if(proofStatus&&Object.hasOwn(proofStatus,'value')&&proofStatus.value==='unsupported'){
     const unsupported=record(proof,['contractVersion','status','reason']);
     if(unsupported.contractVersion!=='page-content-attestation/1'||!READ_REASONS.has(unsupported.reason))invalid('native-contract');
     throw new Unavailable('native-document-changed');
    }
    const attestation=record(proof,['contractVersion','status','url']);
    if(attestation.contractVersion!=='page-content-attestation/1'||attestation.status!=='attested'||attestation.url!==before.sourceUrl)invalid('native-contract');
    const final=await foreground(c,ownEpoch);guard(ownEpoch);
    if(JSON.stringify(before)!==JSON.stringify(final))throw new Unavailable('context-changed');
    const nativeWitness={schema:'chrome-scripting-native-reader/v1',studyId,studyRevision,caseId:c.id,ordinal:c.ordinal,observationNonce:r.observationNonce,eventEpoch:ownEpoch,
     tabId:before.tabId,windowId,frameId:0,documentId:capture.documentId,sourceUrl:before.sourceUrl,documentUrl:before.documentUrl,
     foregroundChecks:[before,after,final],read:{contractVersion:'page-content/1',status:'collected',documentId:capture.documentId},attestation,
     effectiveTitleRule:'trim-or-hostname/v1',nativeDocumentContinuityOnly:true,canonicalAuthority:false};
    guard(ownEpoch);return freeze({status:'collected',nativeWitness,rawTitle,effectiveTitle,body,extractorVersion:content.extractorVersion});
   }catch(e){if(e instanceof Unavailable)return freeze({status:'unavailable',caseId:c.id,ordinal:c.ordinal,reason:e.code});
    ended=true;touch();detach();throw e instanceof NativeReaderTransferError?e:new NativeReaderTransferError('native-contract');}
   finally{busy=false;}
  },
  skipUnavailable(input){
   const r=record(input,['studyId','studyRevision','caseId','ordinal','observationNonce','reason']);
   if(typeof r.reason!=='string'||!SKIP_REASONS.has(r.reason))invalid('skip-reason');
   const c=admitObservation(r);
   // Caller-declared preflight accounting only. No native API/read/attest,
   // foreground observation, document witness, or rights approval is created.
   return freeze({status:'unavailable',caseId:c.id,ordinal:c.ordinal,reason:r.reason});
  },
  endStudy(input){const r=record(input,['studyId','studyRevision']);identity(r);ended=true;touch();detach();if(eventFailure)invalid('native-event');return freeze({schema:'native-article-dev-study-ended/v1',studyId,studyRevision,eventEpoch:epoch});}
 });
}


