// Unregistered SOURCE-only record binding. No IO, registry, issuance or admission.
import {createHash} from 'node:crypto';
import {types,TextDecoder} from 'node:util';
import {compileNativeOwnerPreparation,prepareNativeOwnerObservation,compileNativeOwnerGrouping,
 describeNativeOwnerGrouping,groupNativeOwnerObservation} from '../native-owner-grouping-v1/grouping.js';
import {describeNativeScopedObservation} from '../native-scoped-preparation-v1/preparation.js';
import {compileNativeCanonicalMapping,mapNativeCanonicalObservation,
 describeNativeCanonicalMapping} from '../native-canonical-mapping-v1/mapping.js';

const RECORD_BYTES=256*1024,BUNDLE_BYTES=16*1024*1024,JOB_BYTES=16*1024;
const IDENTITY=['semanticTransferHash','rootTransferHash','rootModelJsonHash','rootPolicyHash',
 'rootTrainingInputConstructionHash','rootRepresentationHash','encoderHash','nativeTargetProducerProfileHash',
 'nativeTargetInputConstructionHash','detailArtifactHash','localBuilderHash','detailRepresentationHash',
 'detailInputConstructionHash','topologyHash'];
const ACCEPTANCE=['studyFreezeFileSha256','sourceMapFileSha256','producerRecipeHash',
 'trainResultFileSha256','trainSupervisorFileSha256','selectionFileSha256','testResultFileSha256',
 'testSupervisorFileSha256','independentQualityAuditFileSha256'];
const PUBLICATION=['builderHash','encoderHash','representationHash','modelHash','policyHash','modelId'];
const HEAD=['schema','publicationId','incarnation','publicationRevision','headRevision','recordFileSha256','status'];
const typed=Object.getPrototypeOf(Uint8Array.prototype);
const byteLength=Object.getOwnPropertyDescriptor(typed,'byteLength').get;
const buffer=Object.getOwnPropertyDescriptor(typed,'buffer').get;
const arrayBufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
const resizable=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'resizable')?.get;
const set=Uint8Array.prototype.set;
const invalid=()=>{throw new TypeError('Invalid native canonical publication');};
function need(ok){if(!ok)invalid();}
function record(value,keys){
 need(value!==null&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype);
 need(Reflect.ownKeys(value).length===keys.length);
 const result={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);
  need(d?.enumerable&&Object.hasOwn(d,'value'));result[key]=d.value;}return result;
}
function list(value,max){
 need(!types.isProxy(value)&&Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype);
 const length=Object.getOwnPropertyDescriptor(value,'length').value;
 need(length<=max&&Reflect.ownKeys(value).length===length+1);
 const result=[];for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));
  need(d?.enumerable&&Object.hasOwn(d,'value'));result.push(d.value);}return result;
}
function id(value,max=160){need(typeof value==='string'&&value.length>0&&value.length<=max&&value.isWellFormed()&&
 value.trim()===value&&!/[\p{Cc}\p{Cf}]/u.test(value));return value;}
function hash(value){need(typeof value==='string'&&/^[0-9a-f]{64}$/u.test(value));return value;}
function revision(value){need(Number.isSafeInteger(value)&&value>0&&!Object.is(value,-0));return value;}
function sha(value){return createHash('sha256').update(value).digest('hex');}
function digest(value){return sha(JSON.stringify(value));}
// Internal detached metadata only; never called on provider/request objects.
function copy(value){if(Array.isArray(value))return value.map(copy);
 if(value&&typeof value==='object'){const result={};for(const key of Object.keys(value))result[key]=copy(value[key]);return result;}return value;}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function bytes(value,maximum){
 need(value!==null&&typeof value==='object'&&!types.isProxy(value)&&types.isUint8Array(value));
 const prototype=Object.getPrototypeOf(value);need(prototype===Uint8Array.prototype||prototype===Buffer.prototype);
 // Reject thenable-shaped port results without reading then or walking a
 // provider-controlled prototype. Only these fixed intrinsic prototypes exist.
 need(!Object.getOwnPropertyDescriptor(value,'then'));
 for(const p of [Buffer.prototype,Uint8Array.prototype,typed,Object.prototype]){
  const d=Object.getOwnPropertyDescriptor(p,'then');need(!d||(Object.hasOwn(d,'value')&&typeof d.value!=='function'));}
 const length=byteLength.call(value),backing=buffer.call(value);
 need(types.isArrayBuffer(backing)&&!types.isSharedArrayBuffer(backing));
 need(!resizable||!resizable.call(backing));arrayBufferLength.call(backing);
 need(length>0&&length<=maximum);
 const result=new Uint8Array(length);set.call(result,value);return result;
}

// Pre-parse grammar pass: bounded lexical work, decoded duplicate keys and Unicode.
// It builds no candidate tree. JSON.parse runs only after FILE authentication and
// this pass; individual string tokens are parsed only as inert JSON primitives.
function decode(snapshot,compact){
 need(!(snapshot[0]===0xef&&snapshot[1]===0xbb&&snapshot[2]===0xbf));
 const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(snapshot);
 let position=0,tokens=0;
 function token(){need(++tokens<=1000000);}
 function whitespace(){while(position<text.length&&/[\x20\t\r\n]/u.test(text[position]))position++;}
 function string(){
  token();const start=position++;let escaped=false,done=false;
  while(position<text.length){const c=text[position++];need(position-start<=24578);
   if(escaped){escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c==='"'){done=true;break;}}
  need(done);const value=JSON.parse(text.slice(start,position));need(value.length<=4096&&value.isWellFormed());return value;
 }
 function value(depth){
  need(depth<=16);whitespace();const c=text[position];
  if(c==='"'){string();return;}
  token();
  if(c==='{'){
   position++;whitespace();const keys=new Set();if(text[position]==='}'){position++;token();return;}
   for(;;){need(text[position]==='"');const key=string();need(!keys.has(key)&&keys.size<32);keys.add(key);
    whitespace();need(text[position++]===':');token();value(depth+1);whitespace();const end=text[position++];token();
    if(end==='}')return;need(end===',');whitespace();}
  }
  if(c==='['){
   position++;whitespace();if(text[position]===']'){position++;token();return;}let count=0;
   for(;;){need(++count<=512);value(depth+1);whitespace();const end=text[position++];token();if(end===']')return;need(end===',');}
  }
  for(const literal of ['true','false','null'])if(text.startsWith(literal,position)){position+=literal.length;return;}
  const start=position;while(position<text.length&&!/[\x20\t\r\n,}\]]/u.test(text[position])){position++;need(position-start<=64);}
  const number=text.slice(start,position);need(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/u.test(number)&&Number.isFinite(Number(number)));
 }
 value(0);whitespace();need(position===text.length);
 const result=JSON.parse(text);if(compact)need(JSON.stringify(result)===text);return result;
}
function protectedRecord(input,head){
 const r=record(input,['schema','publicationId','incarnation','publicationRevision','acceptance','bundleFileSha256','nativeIdentity','mapping']);
 need(r.schema==='native-canonical-publication-record/v1');id(r.publicationId);id(r.incarnation);revision(r.publicationRevision);
 need(r.publicationId===head.publicationId&&r.incarnation===head.incarnation&&r.publicationRevision===head.publicationRevision);
 r.acceptance=record(r.acceptance,ACCEPTANCE);for(const key of ACCEPTANCE)hash(r.acceptance[key]);hash(r.bundleFileSha256);
 r.nativeIdentity=record(r.nativeIdentity,IDENTITY);for(const key of IDENTITY)hash(r.nativeIdentity[key]);
 r.mapping=record(r.mapping,['nodes','declaredCanonicalPublication']);
 r.mapping.nodes=list(r.mapping.nodes,144).map(value=>{const n=record(value,['nativeNodeId','nativeParentId','canonicalNodeId']);
  id(n.nativeNodeId);if(n.nativeParentId!==null)id(n.nativeParentId);id(n.canonicalNodeId,128);return n;});
 r.mapping.declaredCanonicalPublication=record(r.mapping.declaredCanonicalPublication,PUBLICATION);
 for(const key of PUBLICATION.slice(0,5))hash(r.mapping.declaredCanonicalPublication[key]);
 need(r.mapping.declaredCanonicalPublication.modelId==='e5-small-q8-browser-main-prefix-v1');return freeze(r);
}
function headSnapshot(input,anchor){
 const h=record(input,HEAD);need(h.schema==='native-canonical-publication-head/v1');id(h.publicationId);id(h.incarnation);
 revision(h.publicationRevision);revision(h.headRevision);hash(h.recordFileSha256);
 need(h.publicationId===anchor.publicationId&&h.recordFileSha256===anchor.recordFileSha256&&h.status==='accepted');return freeze(h);
}
function nativeIdentity(prepared,group){
 const i=describeNativeScopedObservation(prepared).classifierIdentity,r=i.rootTransferIdentity;
 need(i.rootTransferHash===r.transferHash&&r.encoderHash===i.detailFusionDefinition.encoderHash);
 return {semanticTransferHash:i.transferHash,rootTransferHash:i.rootTransferHash,rootModelJsonHash:r.modelJsonHash,
  rootPolicyHash:r.policyHash,rootTrainingInputConstructionHash:r.trainingInputConstructionHash,rootRepresentationHash:r.representationHash,
  encoderHash:r.encoderHash,nativeTargetProducerProfileHash:i.actualNativeTargetProfile.producerProfileHash,
  nativeTargetInputConstructionHash:i.actualNativeTargetProfile.inputConstructionHash,detailArtifactHash:i.originalDetailArtifactHash,
  localBuilderHash:i.localBuilderHash,detailRepresentationHash:i.detailRepresentationHash,
  detailInputConstructionHash:i.originalNumericalPolicyNamespace.originalArtifactInputConstructionHash,topologyHash:group.topologyHash};
}

export function createNativeCanonicalPublicationFacade(serverDeps){
 need(arguments.length<=1);
 let anchor=null,ports=null;
 if(serverDeps!==undefined&&serverDeps!==null){
  const d=record(serverDeps,['anchor','readHead','readRecord','readBundle','guard']);
  anchor=record(d.anchor,['publicationId','recordFileSha256']);id(anchor.publicationId);hash(anchor.recordFileSha256);freeze(anchor);
  ports={};for(const key of ['readHead','readRecord','readBundle','guard']){
   need(typeof d[key]==='function'&&!types.isProxy(d[key]));ports[key]=d[key];}
 }
 // Do not keep a constructor-parameter alias to provider composition after close.
 serverDeps=undefined;
 // A bounded strong Map permits actual deletion/clearing, unlike GC-only credit.
 const jobs=new Map();let closed=false,busy=false,reserved=0,cache=null,boundHead=null;
 function invalidate(){closed=true;cache=null;boundHead=null;jobs.clear();reserved=0;ports=null;anchor=null;}
 function open(){need(!closed);}
 function enter(){if(busy){invalidate();invalid();}open();busy=true;}
 function trusted(action){try{const value=action();open();return value;}catch(error){invalidate();throw error;}}
 function port(name,args){return trusted(()=>Reflect.apply(ports[name],undefined,args));}
 function fence(){
  trusted(()=>need(port('guard',[])===true));
  const current=trusted(()=>headSnapshot(port('readHead',[anchor.publicationId]),anchor));
  trusted(()=>need(port('guard',[])===true));
  if(boundHead===null)boundHead=current;
  else trusted(()=>need(HEAD.every(key=>current[key]===boundHead[key])));
 }
 function read(name,limit,pin,compact){
  fence();const snapshot=trusted(()=>bytes(port(name,[anchor.publicationId,limit]),limit));fence();
  return trusted(()=>{need(sha(snapshot)===pin);return decode(snapshot,compact);});
 }
 function load(){
  fence();const r=trusted(()=>protectedRecord(read('readRecord',RECORD_BYTES,anchor.recordFileSha256,true),boundHead));
  const candidate=read('readBundle',BUNDLE_BYTES,r.bundleFileSha256,false);
  const context=trusted(()=>compileNativeOwnerPreparation({schema:'native-owner-preparation/v1',candidate}));
  const identity=trusted(()=>describeNativeOwnerGrouping(compileNativeOwnerGrouping(context,{revision:'internal-topology',defaultMaxDepth:8,overrides:[]})));
  trusted(()=>need(identity.semanticTransferHash===r.nativeIdentity.semanticTransferHash&&identity.topologyHash===r.nativeIdentity.topologyHash));
  const mapping=trusted(()=>compileNativeCanonicalMapping({schema:'native-canonical-mapping-template/v1',
   semanticTransferHash:r.nativeIdentity.semanticTransferHash,topologyHash:r.nativeIdentity.topologyHash,
   nodes:r.mapping.nodes,publication:r.mapping.declaredCanonicalPublication}));
  return {context,record:r,mapping,identity};
 }
 function prepare(input){
  enter();let slot=false;
  try{
   need(arguments.length===1);const request=record(input,['publicationId','observation','ownerGrouping','mapping']);id(request.publicationId);
   need(anchor!==null&&request.publicationId===anchor.publicationId);need(jobs.size+reserved<32);reserved++;slot=true;
   const state=cache??load();fence();
   // Only these actual ordinary-input consumers have request-local failures.
   // No error class, error truthiness or message influences trust classification.
   const prepared=prepareNativeOwnerObservation(state.context,request.observation);
   const actual=trusted(()=>nativeIdentity(prepared,state.identity));
   trusted(()=>need(IDENTITY.every(key=>actual[key]===state.record.nativeIdentity[key])));
   const grouping=compileNativeOwnerGrouping(state.context,request.ownerGrouping);
   const grouped=groupNativeOwnerObservation(grouping,prepared);
   const mapping=describeNativeCanonicalMapping(mapNativeCanonicalObservation(state.mapping,grouped,request.mapping));
   fence();
   const preceding={schema:'native-canonical-publication-job/v1',publicationBinding:{publicationId:boundHead.publicationId,
    incarnation:boundHead.incarnation,publicationRevision:boundHead.publicationRevision,headRevisionAtIssuance:boundHead.headRevision,
    recordFileSha256:boundHead.recordFileSha256,bundleFileSha256:state.record.bundleFileSha256},nativeIdentity:actual,mapping};
   const description=freeze({...preceding,recordBindingHash:digest(preceding),evidenceScope:'unregistered-source-only-record-binding',
    publicationVerified:false,canonicalAuthority:false,queueAuthority:false,assignmentAuthority:false,productionValidated:false});
   need(Buffer.byteLength(JSON.stringify(description),'utf8')<=JOB_BYTES);
   fence();open();const job=Object.freeze({});jobs.set(job,description);cache=state;return job;
  }finally{if(slot&&!closed)reserved--;busy=false;}
 }
 function describe(job){enter();try{need(arguments.length===1&&jobs.has(job));return freeze(copy(jobs.get(job)));}finally{busy=false;}}
 function release(job){enter();try{need(arguments.length===1&&jobs.has(job));jobs.delete(job);}finally{busy=false;}}
 function close(){need(arguments.length===0);invalidate();}
 return Object.freeze({prepare,describe,release,close});
}
