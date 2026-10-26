// Transient ADR150 orchestration only. No model, browser, filesystem or app IO.
import {createHash} from 'node:crypto';
import {types} from 'node:util';

const HEX=/^[a-f0-9]{64}$/u;
const EXTRACTORS=new Set(['main-text-prefix/v1','article-container-prefix/v1']);
export const TRANSIENT_LIMITS=Object.freeze({cases:32,dimensions:384,encoderCalls:64,
 rawTitleUnits:200,effectiveTitleUnits:200,bodyUnits:4096,totalTextUnits:143872,evidenceBytesPerRow:16384});
const unavailable=new Set(['origin-policy-unavailable','origin-policy-refused','article-unavailable',
 'document-policy-unavailable','reader-unavailable','foreground-changed','encoding-input-unavailable','restricted-rendering']);
const sha=value=>createHash('sha256').update(value).digest('hex');
const digest=value=>sha(JSON.stringify(value));
function bad(){throw new TypeError('Invalid transient native study');}
function record(v,keys){
 if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)bad();
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();out[k]=d.value;}return out;
}
function array(v,length){
 if(types.isProxy(v)||!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length!==length||Reflect.ownKeys(v).length!==length+1)bad();
 return Array.from({length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();return d.value;});
}
function text(v,max,empty=false){if(typeof v!=='string'||v.length>max||!v.isWellFormed()||(!empty&&!v.trim())||/[\u0000-\u001f\u007f-\u009f]/u.test(v))bad();return v;}
function id(v){text(v,160);if(v.trim()!==v)bad();return v;}
function hash(v){if(typeof v!=='string'||!HEX.test(v))bad();return v;}
function fn(v){if(typeof v!=='function'||types.isProxy(v))bad();return v;}
function synchronous(v){
 // Trusted infrastructure may accidentally be async. Reject that contract, but
 // observe a genuine native Promise rejection without reading arbitrary .then.
 if(types.isPromise(v)){Reflect.apply(Promise.prototype.then,v,[undefined,()=>{}]);bad();}return v;
}
function freeze(v){if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;}
function copy(v,budget={items:4096,units:16384},depth=0){
 if(--budget.items<0||depth>12)bad();
 if(v===null||typeof v!=='object'){
  if(v!==null&&!['string','boolean','number'].includes(typeof v))bad();
  if(typeof v==='number'&&!Number.isFinite(v))bad();
  if(typeof v==='string'){text(v,4096,true);budget.units-=v.length;if(budget.units<0)bad();}return v;
 }
 if(types.isProxy(v))bad();
 if(Array.isArray(v)){if(v.length>128)bad();return array(v,v.length).map(x=>copy(x,budget,depth+1));}
 if(Object.getPrototypeOf(v)!==Object.prototype)bad();
 const keys=Reflect.ownKeys(v);if(keys.length>64)bad();const out={};
 for(const k of keys){if(typeof k!=='string'||k.length>160)bad();const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();
  Object.defineProperty(out,k,{value:copy(d.value,budget,depth+1),enumerable:true,writable:true,configurable:true});}return out;
}
function vector(v){const a=array(v,384);let norm=0;for(const n of a){if(typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1)bad();norm+=n*n;}
 if(Math.abs(norm-1)>1e-5)bad();return a;}
function vectorHash(v){const b=Buffer.alloc(384*8);for(let i=0;i<384;i++)b.writeDoubleLE(v[i],i*8);
 return createHash('sha256').update('builder-root-input-vector/binary64-le/384/v1\0').update(b).digest('hex');}

/** admitAvailable is trusted reviewed infrastructure, NOT webpage code. It must
 * validate full native/rights/field binding and return {inputIdentity,evidence}.
 * This state machine never authenticates browser observations or model assets.
 * JavaScript strings cannot be securely zeroed: references are dropped on failure.
 */
export function createTransientNativeCohort(input){
 const a=record(input,['cases','producerProfileHash','admitAvailable']);hash(a.producerProfileHash);fn(a.admitAvailable);
 const cases=array(a.cases,32).map((value,index)=>{const c=record(value,['id','ordinal','url']);id(c.id);if(c.ordinal!==index+1)bad();
  text(c.url,2048);const u=new URL(c.url);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.href!==c.url)bad();return freeze(c);});
 if(new Set(cases.map(c=>c.id)).size!==32||new Set(cases.map(c=>c.url)).size!==32)bad();
 let phase='capture',revision=0,captureBusy=false,rows=[],next=0,textUnits=0,calls=0,vectors=[],captureHash=null,assessment=null;
 const wipe=()=>{for(const r of rows){delete r.rawTitle;delete r.effectiveTitle;delete r.body;}textUnits=0;vectors=[];};
 function fail(){revision++;phase='failed';wipe();}
 function guard(expected){if(phase!==expected)bad();}
 function captureWork(action){if(captureBusy){fail();bad();}guard('capture');captureBusy=true;
  try{return action();}catch{fail();bad();}finally{captureBusy=false;}}
 function nextCase(idValue,ordinal){const c=cases[next];if(!c||c.id!==idValue||c.ordinal!==ordinal)bad();return c;}
 function available(input){return captureWork(()=>{
  const r=record(input,['caseId','ordinal','rawTitle','effectiveTitle','body','extractorVersion','nativeWitness','rightsEvidence']);
  const c=nextCase(r.caseId,r.ordinal);text(r.rawTitle,200,true);text(r.effectiveTitle,200);text(r.body,4096);
  if(r.effectiveTitle!==(r.rawTitle.trim()||new URL(c.url).hostname)||!EXTRACTORS.has(r.extractorVersion))bad();
  const fields=freeze({bodySha256:sha(r.body),bodyCharacters:r.body.length,rawTitleSha256:sha(r.rawTitle),rawTitleCharacters:r.rawTitle.length,
   effectiveTitleSha256:sha(r.effectiveTitle),effectiveTitleCharacters:r.effectiveTitle.length});
  // Both fields, every native witness and rights checks precede retention/encoding.
  const admitted=record(synchronous(a.admitAvailable(freeze({case:c,producerProfileHash:a.producerProfileHash,fieldBindings:fields,
   extractorVersion:r.extractorVersion,nativeWitness:freeze(copy(r.nativeWitness)),rightsEvidence:freeze(copy(r.rightsEvidence))}))),['inputIdentity','evidence']);
  guard('capture');hash(admitted.inputIdentity);const evidence=freeze(copy(admitted.evidence));if(Buffer.byteLength(JSON.stringify(evidence))>16384)bad();
  const units=r.rawTitle.length+r.effectiveTitle.length+r.body.length;if(textUnits+units>143872)bad();textUnits+=units;
  rows.push({id:c.id,ordinal:c.ordinal,status:'available',inputIdentity:admitted.inputIdentity,evidence,fieldBindings:fields,
   rawTitle:r.rawTitle,effectiveTitle:r.effectiveTitle,body:r.body,extractorVersion:r.extractorVersion});next++;
  return freeze({id:c.id,ordinal:c.ordinal,status:'available',inputIdentity:admitted.inputIdentity});
 });}
 function unavailableRow(input){return captureWork(()=>{
  const r=record(input,['caseId','ordinal','reason','inputIdentity']);const c=nextCase(r.caseId,r.ordinal);
  if(!unavailable.has(r.reason))bad();hash(r.inputIdentity);rows.push({id:c.id,ordinal:c.ordinal,status:'unavailable',reason:r.reason,inputIdentity:r.inputIdentity});next++;
  return freeze({id:c.id,ordinal:c.ordinal,status:'unavailable',reason:r.reason});
 });}
 function finishCapture(){if(captureBusy){fail();bad();}guard('capture');if(next!==32)bad();
  captureHash=digest({schema:'native-transient-capture-ledger/v1',producerProfileHash:a.producerProfileHash,rows:rows.map(({rawTitle,effectiveTitle,body,...metadata})=>metadata)});
  phase='captured';return freeze({captureHash,accounted:32,available:rows.filter(r=>r.status==='available').length,rawTextPersisted:false});}
 async function encodeAfterBrowserDrain(input){
  guard('captured');const f=record(input,['assertBrowserDrained','embed','closeEncoder','recheckAssetsAndSources']);for(const v of Object.values(f))fn(v);
  phase='encoding';const ownRevision=revision;let encodingFailure=false;
  const current=()=>{guard('encoding');if(revision!==ownRevision)bad();};
  try{
   if(await f.assertBrowserDrained()!==true)bad();current();
   for(const row of rows){
    if(row.status==='unavailable')continue;
    // Validate BOTH immediately before the first call, as well as at admission.
    text(row.effectiveTitle,200);text(row.body,4096);
    if(++calls>64)bad();const bodyResult=await f.embed(row.body);current();const bodyVector=vector(bodyResult);
    if(++calls>64)bad();const titleResult=await f.embed(row.effectiveTitle);current();const titleVector=vector(titleResult);
    vectors.push({id:row.id,bodyVector,titleVector,bodyVectorHash:vectorHash(bodyVector),titleVectorHash:vectorHash(titleVector)});
    textUnits-=row.rawTitle.length+row.effectiveTitle.length+row.body.length;delete row.rawTitle;delete row.effectiveTitle;delete row.body;
   }
  }catch{encodingFailure=true;}
  // No partial vectors, assessment or retry if any encoding/drain/close/check fails.
  try{if(await f.closeEncoder()!==true)encodingFailure=true;current();}catch{encodingFailure=true;}
  try{if(await f.recheckAssetsAndSources()!==true)encodingFailure=true;current();}catch{encodingFailure=true;}
  if(encodingFailure){fail();bad();}
  phase='encoded';return freeze({captureHash,encoderCalls:calls,available:vectors.length,rawTextRetained:false,
   vectorBindings:vectors.map(({id,bodyVectorHash,titleVectorHash})=>({id,bodyVectorHash,titleVectorHash}))});
 }
 function assess(classify){guard('encoded');fn(classify);phase='assessing';
  try{
   const results=rows.map(row=>{
    if(row.status==='unavailable')return freeze({...row});
    const v=vectors.find(v=>v.id===row.id);if(!v)bad();
    const decision=freeze(copy(synchronous(classify(freeze({...row,bodyVector:[...v.bodyVector],titleVector:[...v.titleVector]})))));guard('assessing');
    if(Buffer.byteLength(JSON.stringify(decision))>16384)bad();
    return freeze({id:row.id,ordinal:row.ordinal,status:'classified',inputIdentity:row.inputIdentity,decision,
     bodyVectorHash:v.bodyVectorHash,titleVectorHash:v.titleVectorHash});
   });
   assessment=freeze({schema:'native-transient-classification-ledger/v1',producerProfileHash:a.producerProfileHash,captureHash,
    accounted:32,encoderCalls:calls,results,rawTextPersisted:false,rawTextRetained:false,semanticTextIndependentlyReconstructable:false,
    nativeWriteAuthority:false,productionValidated:false,assignmentAuthority:false});
   wipe();phase='complete';return assessment;
  }catch{fail();bad();}
 }
 return Object.freeze({available,unavailable:unavailableRow,finishCapture,encodeAfterBrowserDrain,assess,
  abandon(){if(phase==='complete')bad();fail();},snapshot(){return freeze({phase,accounted:next,retainedTextUnits:textUnits,encoderCalls:calls,privateVectorRows:vectors.length});}});
}
