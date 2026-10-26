// ADR220: opt-in server composition, never a registered route or native issuer.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {createNativeCanonicalPublicationFacade} from '../native-canonical-publication-v1/publication.js';
import {prepareFastAdmission} from '../../../../portable/canonical-v4/experimental/hierarchy-native-scoped-ingestion-v2/repository.js';

const bad=()=>{throw new TypeError('Invalid native scoped ingress');};
const need=x=>{if(!x)bad();};
function record(v,keys){need(v!==null&&typeof v==='object'&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Object.prototype);
 need(Reflect.ownKeys(v).length===keys.length);const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);need(d?.enumerable&&Object.hasOwn(d,'value'));out[k]=d.value;}return out;}
function id(v,max=128){need(typeof v==='string'&&v.length>0&&v.length<=max&&v.isWellFormed()&&v.trim()===v&&!/[\p{Cc}\p{Cf}]/u.test(v));return v;}
function hash(v){need(typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v));return v;}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
// Bounded descriptor-only ordinary DTO copy. Numeric bit identity includes -0;
// no JSON hooks, property reads, provider callbacks or classifier arithmetic.
function detached(v){let nodes=0,utf8=0;
 function copy(x,depth){need(++nodes<=4096&&depth<=16);
  if(x===null||typeof x==='boolean')return x;
  if(typeof x==='number'){need(Number.isFinite(x));return x;}
  if(typeof x==='string'){need(x.length<=4096&&x.isWellFormed());utf8+=Buffer.byteLength(x);need(utf8<=131072);return x;}
  need(x!==null&&typeof x==='object'&&!types.isProxy(x));
  if(Array.isArray(x)){need(Object.getPrototypeOf(x)===Array.prototype);const n=Object.getOwnPropertyDescriptor(x,'length').value;need(n<=512&&Reflect.ownKeys(x).length===n+1);
   const out=[];for(let i=0;i<n;i++){const d=Object.getOwnPropertyDescriptor(x,String(i));need(d?.enumerable&&Object.hasOwn(d,'value'));out.push(copy(d.value,depth+1));}return out;}
  need(Object.getPrototypeOf(x)===Object.prototype);const keys=Reflect.ownKeys(x);need(keys.length<=32);const out={};
  for(const k of keys){need(typeof k==='string'&&k.length<=160&&k.isWellFormed()&&k!=='__proto__');const d=Object.getOwnPropertyDescriptor(x,k);need(d?.enumerable&&Object.hasOwn(d,'value'));out[k]=copy(d.value,depth+1);}return out;
 }
 return copy(v,0);
}
function requestDigest(value){
 function encoded(v){if(typeof v==='number')return Object.is(v,-0)?'-0':JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(encoded).join(',')+']';
  if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+encoded(v[k])).join(',')+'}';return JSON.stringify(v);}
 return createHash('sha256').update('native-scoped-original-request/v1\0').update(encoded(value)).digest('hex');
}
function ordinary(input){const r=record(input,['publicationId','operationId','observation']);id(r.publicationId,160);id(r.operationId);
 record(r.observation,['schema','rawTitle','effectiveTitle','body','extractorVersion','nativeWitness','rightsEvidenceHash','bodyVector','titleVector']);
 const result=detached(r);need(result.observation.schema==='native-scoped-observation/v1');return freeze(result);}
function authResult(value){const a=record(value,['principal','originKind','generation']);id(a.principal);id(a.generation);
 need(a.originKind==='actor'&&/^account-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(a.principal));return freeze(a);}
function sourceResult(value,generation){const s=record(value,['expected','sourceId','sourceIncarnation','topicId','discussionId','createdAt','documentHash','prior','sourceAbsent']);
 s.expected=record(s.expected,['generation','revision']);need(s.expected.generation===generation&&Number.isSafeInteger(s.expected.revision)&&s.expected.revision>=0);
 for(const k of ['sourceId','topicId','discussionId'])id(s[k]);id(s.createdAt,64);hash(s.documentHash);need(typeof s.sourceAbsent==='boolean');
 if(s.sourceAbsent)need(s.sourceIncarnation===null&&s.prior===null);
 else{id(s.sourceIncarnation);s.prior=record(s.prior,['sourceVersion','witnessHash','decisionHash']);need(typeof s.prior.sourceVersion==='string'&&/^[1-9][0-9]{0,15}$/u.test(s.prior.sourceVersion)&&BigInt(s.prior.sourceVersion)<=9007199254740991n);hash(s.prior.witnessHash);hash(s.prior.decisionHash);}return freeze(s);}
function queueResult(value){const q=record(value,['state','commandHash','receipt','code']);
 need(['issued','pending','leased','complete','failed','cancelled','expired','erased'].includes(q.state));
 if(q.state==='issued')need(q.commandHash===null);
 else if(q.commandHash===null)need(['expired','cancelled','erased'].includes(q.state));else hash(q.commandHash);
 need(q.code===null||typeof q.code==='string'&&/^[a-z-]{1,64}$/u.test(q.code));
 // A provider cannot smuggle raw fields through the result channel. Complete
 // receipts are the existing bounded canonical receipt, not arbitrary output.
 need((q.state==='complete')===(q.receipt!==null));
 if(q.receipt!==null){const keys=['schema','policyVersion','version','sourceId','sourceVersion','topicId','discussionId','inputHash','witnessHash','decisionHash','semanticNodeId','artifactHash','experimental','productionValidated','assignmentAuthority','observationId'];
  need(q.receipt&&typeof q.receipt==='object'&&!types.isProxy(q.receipt));
  const optional=Object.getOwnPropertyDescriptor(q.receipt,'renewed');q.receipt=record(q.receipt,optional?[...keys,'renewed']:keys);
  const r=q.receipt;need(r.schema==='source-local-scoped-receipt/v1'&&r.policyVersion==='source-local-scoped-container/v1');
  r.version=record(r.version,['generation','revision']);id(r.version.generation);need(Number.isSafeInteger(r.version.revision)&&r.version.revision>=0&&!Object.is(r.version.revision,-0));
  for(const k of ['sourceId','topicId','discussionId'])id(r[k]);id(r.observationId,160);
  need(typeof r.sourceVersion==='string'&&/^[1-9][0-9]{0,15}$/u.test(r.sourceVersion)&&BigInt(r.sourceVersion)<=9007199254740991n);
  for(const k of ['inputHash','witnessHash','decisionHash','artifactHash'])hash(r[k]);if(r.semanticNodeId!==null)id(r.semanticNodeId);
  need(r.experimental===true&&r.productionValidated===false&&r.assignmentAuthority===false);if(optional)need(r.renewed===true);
 }
 const safe=detached(q);
 need(Buffer.byteLength(JSON.stringify(safe))<=16384);return freeze(safe);}

export function createNativeScopedIngress(dependencies){
 need(arguments.length<=1);let ports=null,facade=null,publicationId=null,closed=false,active=0;
 if(dependencies!==undefined&&dependencies!==null){const d=record(dependencies,['publication','authenticate','lookupOperation','resolveSource','resolveOwnerPolicy','attest','issue','enqueue']);
  facade=createNativeCanonicalPublicationFacade(d.publication);
  if(d.publication!==null&&d.publication!==undefined){const p=record(d.publication,['anchor','readHead','readRecord','readBundle','guard']);publicationId=record(p.anchor,['publicationId','recordFileSha256']).publicationId;}
  ports={};for(const k of ['authenticate','lookupOperation','resolveSource','resolveOwnerPolicy','attest','issue','enqueue']){need(typeof d[k]==='function'&&!types.isProxy(d[k]));ports[k]=d[k];}}
 dependencies=undefined;
 function open(){need(!closed&&ports!==null);}
 function serviceValue(raw){
  need(raw===null||typeof raw!=='object'||!types.isProxy(raw));
  if(raw&&typeof raw==='object'){need(Object.getPrototypeOf(raw)===Object.prototype);need(!Object.getOwnPropertyDescriptor(raw,'then'));need(!Object.getOwnPropertyDescriptor(Object.prototype,'then'));}
  return raw;
 }
 async function call(name,...args){open();const raw=Reflect.apply(ports[name],undefined,args);
  // Ordinary service ports may be asynchronous. Only a genuine ordinary
  // Promise is awaited, never a foreign thenable or provider-controlled hooks.
  if(types.isPromise(raw)){need(!types.isProxy(raw)&&Object.getPrototypeOf(raw)===Promise.prototype&&!Object.getOwnPropertyDescriptor(raw,'constructor')&&!Object.getOwnPropertyDescriptor(raw,'then'));
   const value=await raw;open();return serviceValue(value);}
  open();return serviceValue(raw);
 }
 async function ingest(input){
  need(arguments.length===1);
  const request=ordinary(input),requestHash=requestDigest(request);open();need(publicationId!==null&&request.publicationId===publicationId);need(active<32);active++;
  let job=null;
  try{
   const auth=authResult(await call('authenticate',request.observation));
   const lookup=await call('lookupOperation',freeze({...auth,operationId:request.operationId,requestHash}));
   if(lookup!==null){
    need(lookup&&typeof lookup==='object'&&!types.isProxy(lookup));const continuation=Object.getOwnPropertyDescriptor(lookup,'issuedId');
    const prior=record(lookup,continuation?['requestHash','issuedId','result']:['requestHash','result']);need(prior.requestHash===requestHash);
    let result=queueResult(prior.result);
    if(result.state==='issued'){
     need(continuation);id(prior.issuedId);
     // ONLY a new explicit SAME-request invocation reaches this branch. Reuse
     // the trusted stored reference/deadline exactly once, not new issuance.
     result=queueResult(await call('enqueue',freeze({generation:auth.generation,operationId:request.operationId,principal:auth.principal,issuedId:prior.issuedId})));
    }else need(!continuation);
    return freeze({schema:'native-scoped-ingress-result/v1',operationId:request.operationId,requestHash,replayed:true,result,publicationVerified:false,assignmentAuthority:false});}
   const source=sourceResult(await call('resolveSource',auth,request),auth.generation);
   const policy=record(await call('resolveOwnerPolicy',auth,request.publicationId),['revision','settings']);need(Number.isSafeInteger(policy.revision)&&policy.revision>0);
   const ownerGrouping=freeze(detached(policy.settings)),o=request.observation;
   const mapping={schema:'native-canonical-mapping-input/v1',canonicalSource:{expected:source.expected,sourceId:source.sourceId,documentHash:source.documentHash,prior:source.prior},
    fields:{url:o.nativeWitness.sourceUrl,rawTitle:o.rawTitle,effectiveTitle:o.effectiveTitle,body:o.body,extractorVersion:o.extractorVersion},pair:{bodyVector:o.bodyVector,titleVector:o.titleVector}};
   open();job=facade.prepare({publicationId:request.publicationId,observation:o,ownerGrouping,mapping});const description=facade.describe(job),m=description.mapping;
   const c=m.compatibility;need(c.urlCompatible&&c.titleCompatible&&c.extractorCompatible&&c.bodyNormCompatible&&c.titleNormCompatible&&c.materialCompatible&&c.priorCompatible);
   // Root-only shape false is retained; the NEW SQL schema proves its own tree.
   need(description.publicationVerified===false&&m.publicationIdentityChecked===false&&m.registryArtifactHash===null);
   const p=m.declaredPublication;
   const admission={expected:source.expected,operationId:request.operationId,sourceId:source.sourceId,topicId:source.topicId,discussionId:source.discussionId,createdAt:source.createdAt,
    url:o.nativeWitness.sourceUrl,title:o.effectiveTitle,extractorVersion:o.extractorVersion,modelId:p.modelId,bodyHash:m.commitments.fieldBindings.bodySha256,
    builderHash:p.builderHash,encoderHash:p.encoderHash,representationHash:p.representationHash,documentHash:source.documentHash,bodyVector:o.bodyVector,titleVector:o.titleVector,nodeId:m.grouping.deepestSupportedCanonicalNodeId};
   const prepared=prepareFastAdmission(admission);need(prepared.inputHash===m.commitments.materialHash);
   const parameters=source.sourceAbsent?prepared.parameters:[...prepared.parameters,source.prior.sourceVersion,source.prior.witnessHash,source.prior.decisionHash];
   const context=freeze({requestHash,operationId:request.operationId,auth,source,ownerPolicyRevision:policy.revision,description});
   const attestation=record(await call('attest',context,o),['id']);id(attestation.id);
   const issued=record(await call('issue',freeze({...context,attestationId:attestation.id,parameters})),['generation','operationId','principal','issuedId']);
   need(issued.generation===auth.generation&&issued.operationId===request.operationId&&issued.principal===auth.principal);id(issued.issuedId);
   const result=queueResult(await call('enqueue',freeze(issued)));
   return freeze({schema:'native-scoped-ingress-result/v1',operationId:request.operationId,requestHash,replayed:false,result,publicationVerified:false,assignmentAuthority:false});
  }finally{if(job!==null&&!closed){try{facade.release(job);}catch{close();}}active--;}
 }
 function close(){need(arguments.length===0);closed=true;if(facade!==null)facade.close();ports=null;publicationId=null;}
 return Object.freeze({ingest,close});
}
