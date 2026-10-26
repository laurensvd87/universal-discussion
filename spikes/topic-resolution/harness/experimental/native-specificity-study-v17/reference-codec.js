// Pure selected TRAIN-reference transport. No loading, scoring or authority.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {compileHierarchyLocalEvidence,describeHierarchyLocalEvidence} from '../../../../../apps/local-service/src/domain/hierarchical-e5-local-evidence.js';

export const TRAIN_REFERENCE_CODEC_LIMITS=Object.freeze({examples:48,nodes:12,dimensions:384,vectorBytes:3072,base64Units:4096,packetBytes:1048576,jsonDepth:16,jsonContainers:2048});
const A=['schema','representation','representationHash','inputConstructionHash','taxonomyVersion','evidenceVersion','calibrationVersion','calibrationStatus','nodes','examples','nodePolicies'];
const NODES=Object.freeze({games:null,'video-games':'games',gta:'video-games',minecraft:'video-games',nature:null,animals:'nature',koalas:'animals',dolphins:'animals',cooking:null,recipes:'cooking',kapsalon:'recipes',pasta:'recipes'});
const POLICIES=['nodeId','enabled','minSupport','minSimilarity','minNegativeMargin','minRivalMargin'];
const sha=v=>createHash('sha256').update(v).digest('hex');
const digest=v=>sha(JSON.stringify(v));
const bitHash=b=>createHash('sha256').update('native-specificity-train-reference/binary64-le/384/v1\0').update(b).digest('hex');
export class TrainReferenceCodecError extends TypeError{constructor(){super('Selected TRAIN reference packet refused');this.code='TRAIN_REFERENCE_PACKET';}}
const bad=()=>{throw new TrainReferenceCodecError();};
function rec(v,keys){
 if(!v||typeof v!=='object'||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype)bad();
 const names=Reflect.ownKeys(v);if(names.length!==keys.length||names.some(k=>!keys.includes(k)))bad();
 const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();out[k]=d.value;}return out;
}
function arr(v,max){
 if(types.isProxy(v)||!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype)bad();
 const n=Object.getOwnPropertyDescriptor(v,'length').value;
 if(n>max||Reflect.ownKeys(v).length!==n+1)bad();
 return Array.from({length:n},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();return d.value;});
}
function id(v){if(typeof v!=='string'||!v.length||v.length>160||!v.isWellFormed()||v.trim()!==v||/[\u0000-\u001f\u007f-\u009f]/u.test(v))bad();return v;}
function hash(v){if(typeof v!=='string'||!/^[a-f0-9]{64}$/u.test(v))bad();return v;}
function frozen(v){if(v&&typeof v==='object'){for(const item of Object.values(v))frozen(item);Object.freeze(v);}return v;}
function unit(v){const a=arr(v,384);if(a.length!==384)bad();let norm=0;
 for(const n of a){if(typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1)bad();norm+=n*n;}
 if(Math.abs(norm-1)>1e-5)bad();return a;
}
function bytes(v){const b=Buffer.alloc(3072);for(let i=0;i<384;i++)b.writeDoubleLE(v[i],i*8);return b;}
function readVector(encoded,pin){
 if(typeof encoded!=='string'||encoded.length!==4096||!/^[A-Za-z0-9+/]{4096}$/u.test(encoded))bad();hash(pin);
 const b=Buffer.from(encoded,'base64');if(b.length!==3072||b.toString('base64')!==encoded||bitHash(b)!==pin)bad();
 const a=Array.from({length:384},(_,i)=>b.readDoubleLE(i*8));unit(a);
 if(!bytes(a).equals(b))bad();return a;
}
function boundedJson(text){
 if(typeof text!=='string'||!text.length||text.length>1048576||!text.isWellFormed()||Buffer.byteLength(text)>1048576)bad();
 // Preflight container depth/count outside strings before JSON materialization.
 let quoted=false,escape=false,depth=0,containers=0;
 for(const c of text){if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue;}
  if(c==='"')quoted=true;else if(c==='{'||c==='['){if(++depth>16||++containers>2048)bad();}else if(c==='}'||c===']'){if(--depth<0)bad();}}
 if(quoted||depth!==0)bad();let p;try{p=JSON.parse(text);}catch{bad();}
 // Our codec has one canonical lexical form. This also rejects duplicate keys,
 // alternative numeric/escape spellings and whitespace instead of accepting a
 // JSON parser's last-key-wins interpretation.
 if(JSON.stringify(p)!==text)bad();return p;
}

/** Config is supplied separately by the reviewed manifest/TRAIN builder. Its
 * hashes/joins bind supplied data, not actual Chrome, rights or training truth. */
export function createTrainReferenceCodec(config){
 const c=rec(config,['expectedManifestHash','expectedInputConstructionHash','trainingCases']);
 hash(c.expectedManifestHash);hash(c.expectedInputConstructionHash);
 const mapping=arr(c.trainingCases,48);if(mapping.length!==48)bad();const byId=new Map(),groups=new Set(),counts={member:0,stop:0,outside:0};
 const cases=mapping.map(raw=>{const r=rec(raw,['id','groupId','referenceAnnotation']),a=rec(r.referenceAnnotation,['nodeId','kind']);id(r.id);id(r.groupId);
  id(a.nodeId);if(typeof a.kind!=='string'||!Object.hasOwn(NODES,a.nodeId)||!Object.hasOwn(counts,a.kind)||byId.has(r.id)||groups.has(r.groupId))bad();
  const value={id:r.id,groupId:r.groupId,referenceAnnotation:{nodeId:a.nodeId,kind:a.kind}};byId.set(r.id,value);groups.add(r.groupId);counts[a.kind]++;return value;});
 if(counts.member!==24||counts.stop!==12||counts.outside!==12)bad();
 const trainingCasesHash=digest(cases);
 function artifact(raw,decode){
  const a=rec(raw,A);if(a.schema!=='hierarchical-e5-local-evidence/v1'||a.representation!=='paired-raw-e5-body-title-v1'||a.calibrationStatus!=='experimental')bad();
  hash(a.representationHash);hash(a.inputConstructionHash);if(a.inputConstructionHash!==c.expectedInputConstructionHash)bad();
  for(const k of ['taxonomyVersion','evidenceVersion','calibrationVersion'])id(a[k]);
  const nodes=arr(a.nodes,12).map(r=>rec(r,['id','parentId']));
  if(nodes.length!==12||new Set(nodes.map(n=>n.id)).size!==12)bad();
  for(const n of nodes){id(n.id);if(n.parentId!==null)id(n.parentId);if(!Object.hasOwn(NODES,n.id)||n.parentId!==NODES[n.id])bad();}
  const policies=arr(a.nodePolicies,12).map(r=>rec(r,POLICIES));
  if(policies.length!==12||new Set(policies.map(p=>p.nodeId)).size!==12)bad();
  for(const p of policies){id(p.nodeId);if(!Object.hasOwn(NODES,p.nodeId)||typeof p.enabled!=='boolean'||!Number.isInteger(p.minSupport)||p.minSupport<1||p.minSupport>8)bad();
   for(const k of ['minSimilarity','minNegativeMargin','minRivalMargin'])if(typeof p[k]!=='number'||!Number.isFinite(p[k]))bad();
   if(p.minSimilarity< -1||p.minSimilarity>1||p.minNegativeMargin<0||p.minNegativeMargin>2||p.minRivalMargin<0||p.minRivalMargin>2)bad();}
  const seen=new Set(),examples=arr(a.examples,48).map(raw=>{
   const r=rec(raw,decode?['id','groupId','nodeId','kind','vectorBase64','vectorBitHash']:['id','groupId','nodeId','kind','vector']);
   id(r.id);id(r.groupId);const expected=byId.get(r.id);
   if(!expected||seen.has(r.id)||r.groupId!==expected.groupId||r.nodeId!==expected.referenceAnnotation.nodeId||r.kind!==expected.referenceAnnotation.kind)bad();seen.add(r.id);
   return {id:r.id,groupId:r.groupId,nodeId:r.nodeId,kind:r.kind,vector:decode?readVector(r.vectorBase64,r.vectorBitHash):unit(r.vector)};
  });
  if(!examples.length)bad();return {...a,nodes,examples,nodePolicies:policies};
 }
 function compile(a){try{return describeHierarchyLocalEvidence(compileHierarchyLocalEvidence(a)).artifactHash;}catch{bad();}}
 function packet(a,artifactHash){return {schema:'native-specificity-selected-train-references/v1',manifestHash:c.expectedManifestHash,
  inputConstructionHash:c.expectedInputConstructionHash,trainingCasesHash,artifactHash,
  artifact:{...a,examples:a.examples.map(r=>{const b=bytes(r.vector);return {id:r.id,groupId:r.groupId,nodeId:r.nodeId,kind:r.kind,vectorBase64:b.toString('base64'),vectorBitHash:bitHash(b)};})}};}
 return Object.freeze({
  encode(raw){const a=artifact(raw,false),artifactHash=compile(a),p=packet(a,artifactHash),text=JSON.stringify(p);
   if(Buffer.byteLength(text)>1048576)bad();return Object.freeze({text,packetHash:sha(text),artifactHash,trainingCasesHash,examples:a.examples.length,vectorOccurrences:a.examples.length,assignmentAuthority:false});},
  decode(text,expectedPacketHash){hash(expectedPacketHash);if(typeof text!=='string'||text.length>1048576)bad();
   // Bound before hashing or parsing; the expected pin is independent config.
   if(!text.isWellFormed()||Buffer.byteLength(text)>1048576||sha(text)!==expectedPacketHash)bad();
   const p=rec(boundedJson(text),['schema','manifestHash','inputConstructionHash','trainingCasesHash','artifactHash','artifact']);
   if(p.schema!=='native-specificity-selected-train-references/v1'||p.manifestHash!==c.expectedManifestHash||p.inputConstructionHash!==c.expectedInputConstructionHash||p.trainingCasesHash!==trainingCasesHash)bad();hash(p.artifactHash);
   const a=artifact(p.artifact,true),actual=compile(a);if(actual!==p.artifactHash)bad();
   if(JSON.stringify(packet(a,actual))!==text)bad();return frozen({artifact:a,artifactHash:actual,packetHash:expectedPacketHash,trainingCasesHash,examples:a.examples.length,vectorOccurrences:a.examples.length,assignmentAuthority:false});}
 });
}
