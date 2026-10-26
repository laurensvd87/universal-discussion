// ADR207: synchronous metadata consistency only, never publication or queue authority.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {describeNativeOwnerGroupedObservation} from '../native-owner-grouping-v1/grouping.js';
import {inspectPageUrl} from '../../../../../../spikes/topic-resolution/browser/core/page-content-policy.js';

const handles=new WeakMap(),jobs=new WeakMap();
const MODEL='e5-small-q8-browser-main-prefix-v1';
const invalid=()=>{throw new TypeError('Invalid pure native canonical mapping');};
const need=value=>{if(!value)invalid();};
const sha=value=>createHash('sha256').update(value).digest('hex');
const digest=value=>sha(JSON.stringify(value));
const lex=(a,b)=>a<b?-1:a>b?1:0;
function record(value,keys){
 need(value!==null&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype);
 need(Reflect.ownKeys(value).length===keys.length);
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);need(d?.enumerable&&Object.hasOwn(d,'value'));out[key]=d.value;}return out;
}
function array(value,maximum){
 need(!types.isProxy(value)&&Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype);
 const length=Object.getOwnPropertyDescriptor(value,'length').value;
 need(length<=maximum&&Reflect.ownKeys(value).length===length+1);
 return Array.from({length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));need(d?.enumerable&&Object.hasOwn(d,'value'));return d.value;});
}
function string(value,maximum,nonempty=true){need(typeof value==='string'&&value.isWellFormed()&&value.length<=maximum&&(!nonempty||value.length>0));return value;}
function canonicalId(value,maximum=128){string(value,maximum);need(!/[\p{Cc}\p{Cf}]/u.test(value));return value;}
function nativeId(value){canonicalId(value,160);need(value.trim()===value);return value;}
function hash(value){need(typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value));return value;}
function nativeText(value,maximum,nonblank){
 string(value,maximum,false);need((!nonblank||value.trim().length>0)&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value));return value;
}
function vector(value){return array(value,384).map(v=>{need(typeof v==='number'&&Number.isFinite(v));return v;});}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
// Only trusted, already detached internal data reaches this copier. Preserve -0.
function copy(value){if(Array.isArray(value))return value.map(copy);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,copy(v)]));return value;}
function nativeVectorHash(values){
 const bytes=Buffer.alloc(384*8);values.forEach((v,i)=>bytes.writeDoubleLE(v,i*8));
 return createHash('sha256').update('builder-root-input-vector/binary64-le/384/v1\0').update(bytes).digest('hex');
}
function wireHash(values){
 const bytes=Buffer.alloc(20+384*12);[1,0,701,384,1].forEach((v,i)=>bytes.writeInt32BE(v,i*4));
 values.forEach((v,i)=>{bytes.writeInt32BE(8,20+i*12);bytes.writeDoubleBE(v,24+i*12);});return sha(bytes);
}

export function compileNativeCanonicalMapping(input){
 need(arguments.length===1);
 const a=record(input,['schema','semanticTransferHash','topologyHash','nodes','publication']);
 need(a.schema==='native-canonical-mapping-template/v1');hash(a.semanticTransferHash);hash(a.topologyHash);
 const pub=record(a.publication,['builderHash','encoderHash','representationHash','modelHash','policyHash','modelId']);
 for(const k of ['builderHash','encoderHash','representationHash','modelHash','policyHash'])hash(pub[k]);need(pub.modelId===MODEL);
 const nodes=array(a.nodes,144).map(value=>{const n=record(value,['nativeNodeId','nativeParentId','canonicalNodeId']);
  nativeId(n.nativeNodeId);if(n.nativeParentId!==null)nativeId(n.nativeParentId);canonicalId(n.canonicalNodeId);return n;}).sort((x,y)=>lex(x.nativeNodeId,y.nativeNodeId));
 need(nodes.length>0);const byId=new Map(),canonical=new Set();
 for(const node of nodes){need(!byId.has(node.nativeNodeId)&&!canonical.has(node.canonicalNodeId));byId.set(node.nativeNodeId,node);canonical.add(node.canonicalNodeId);}
 for(const node of nodes){const seen=new Set();let cursor=node;
  while(cursor){need(!seen.has(cursor.nativeNodeId)&&seen.size<8);seen.add(cursor.nativeNodeId);
   if(cursor.nativeParentId===null)break;need(byId.has(cursor.nativeParentId));cursor=byId.get(cursor.nativeParentId);}}
 const topology={schema:'native-owner-topology/v1',nodes:nodes.map(n=>({id:n.nativeNodeId,parentId:n.nativeParentId}))};need(digest(topology)===a.topologyHash);
 const template=freeze({schema:a.schema,semanticTransferHash:a.semanticTransferHash,topologyHash:a.topologyHash,nodes,publication:pub});
 const handle=Object.freeze({});handles.set(handle,{template,byId,templateHash:digest(template),rootOnly:nodes.every(n=>n.nativeParentId===null)});return handle;
}

export function mapNativeCanonicalObservation(handle,groupedJob,input){
 need(arguments.length===3&&handles.has(handle));const s=handles.get(handle);
 // Invoke the actual private-job accessor: equivalent JSON is not an alternate route.
 const grouped=describeNativeOwnerGroupedObservation(groupedJob),prepared=grouped.preparedObservation,decision=prepared.decision,group=grouped.groupingIdentity;
 need(group.semanticTransferHash===s.template.semanticTransferHash&&group.topologyHash===s.template.topologyHash&&
  prepared.classifierIdentity.transferHash===s.template.semanticTransferHash&&decision.transferHash===s.template.semanticTransferHash);
 const supported=[...decision.supportedPath],selected=[...grouped.projection.selectedPath];
 need(supported.length<=8&&selected.length<=supported.length&&supported.every((v,i)=>v===grouped.projection.supportedPath[i])&&grouped.projection.supportedPath.length===supported.length);
 for(let i=0;i<supported.length;i++){need(s.byId.has(supported[i]));need(s.byId.get(supported[i]).nativeParentId===(i?supported[i-1]:null));}
 need(selected.every((v,i)=>v===supported[i]));
 need((decision.status==='candidate'&&supported.length>0&&selected.length>0)||(decision.status==='unresolved'&&supported.length===0&&selected.length===0));
 const a=record(input,['schema','canonicalSource','fields','pair']);need(a.schema==='native-canonical-mapping-input/v1');
 const target=record(a.canonicalSource,['expected','sourceId','documentHash','prior']),expected=record(target.expected,['generation','revision']);
 canonicalId(expected.generation);need(Number.isSafeInteger(expected.revision)&&expected.revision>=0);canonicalId(target.sourceId);hash(target.documentHash);
 let prior=null,priorCompatible=true;
 if(target.prior!==null){prior=record(target.prior,['sourceVersion','witnessHash','decisionHash']);canonicalId(prior.sourceVersion,16);hash(prior.witnessHash);hash(prior.decisionHash);
  priorCompatible=/^[1-9][0-9]{0,15}$/u.test(prior.sourceVersion)&&BigInt(prior.sourceVersion)<=9007199254740991n;}
 const f=record(a.fields,['url','rawTitle','effectiveTitle','body','extractorVersion']);string(f.url,2048);string(f.extractorVersion,160);
 nativeText(f.rawTitle,200,false);nativeText(f.effectiveTitle,200,true);nativeText(f.body,4096,true);
 const fieldBindings={bodySha256:sha(f.body),bodyCharacters:f.body.length,rawTitleSha256:sha(f.rawTitle),rawTitleCharacters:f.rawTitle.length,
  effectiveTitleSha256:sha(f.effectiveTitle),effectiveTitleCharacters:f.effectiveTitle.length};
 const identity=prepared.nativeObservationIdentity,witness=decision.witness;
 need(Object.keys(fieldBindings).every(k=>fieldBindings[k]===identity.fieldBindings[k]));
 need(sha(f.url)===witness.nativeDocumentIdentity.sourceUrlHash&&f.extractorVersion===witness.extractorVersion);
 need(f.effectiveTitle===(f.rawTitle.trim()||new URL(f.url).hostname));
 const pair=record(a.pair,['bodyVector','titleVector']),body=vector(pair.bodyVector),title=vector(pair.titleVector);need(body.length===384&&title.length===384);
 const bindings=decision.vectorBindings,bodyVectorHash=nativeVectorHash(body),titleVectorHash=nativeVectorHash(title);
 need(bindings.encoding==='ieee754-binary64-little-endian/384/v1'&&bodyVectorHash===bindings.bodyVectorHash&&titleVectorHash===bindings.titleVectorHash);
 const urlPolicy=inspectPageUrl(f.url),urlCompatible=!/[\p{Cc}\p{Cf}]/u.test(f.url)&&f.url.startsWith('https://')&&urlPolicy.supported&&urlPolicy.url===f.url;
 const titleCompatible=!/[\p{Cc}\p{Cf}]/u.test(f.effectiveTitle);
 const extractorCompatible=['main-text-prefix/v1','article-container-prefix/v1','crawler-static-html-prefix/v1'].includes(f.extractorVersion);
 const bodyNormCompatible=Math.abs(Math.hypot(...body)-1)<=1e-9,titleNormCompatible=Math.abs(Math.hypot(...title)-1)<=1e-9;
 const materialCompatible=Boolean(urlCompatible&&titleCompatible&&extractorCompatible&&bodyNormCompatible&&titleNormCompatible);
 let bodyWireHash=null,titleWireHash=null,materialHash=null;const publication=s.template.publication;
 if(materialCompatible){bodyWireHash=wireHash(body);titleWireHash=wireHash(title);
  const material={url:f.url,title:f.effectiveTitle,extractorVersion:f.extractorVersion,modelId:publication.modelId,bodyHash:fieldBindings.bodySha256,titleHash:fieldBindings.effectiveTitleSha256,
   builderHash:publication.builderHash,encoderHash:publication.encoderHash,representationHash:publication.representationHash,documentHash:target.documentHash,bodyWireHash,titleWireHash};materialHash=digest(material);}
 const semantic={transferHash:decision.transferHash,semanticWitnessHash:decision.semanticWitnessHash,status:decision.status,reason:decision.reason,supportedPath:supported};
 const mappedSupportedPath=supported.map(n=>s.byId.get(n).canonicalNodeId),mappedSelectedPath=selected.map(n=>s.byId.get(n).canonicalNodeId);
 const grouping={groupIdentityHash:group.groupIdentityHash,ownerGroupingHash:group.ownerGroupingHash,selectedPath:selected,mappedSupportedPath,mappedSelectedPath,
  deepestSupportedCanonicalNodeId:mappedSupportedPath.at(-1)??null,primaryCanonicalNodeId:mappedSelectedPath.at(-1)??null};
 const declaredCanonicalSource={claimScope:'declared-not-current-state',expected,sourceId:target.sourceId,documentHash:target.documentHash,prior};
 const declaredPublication={claimScope:'declared-unverified-unbound',...publication};
 const commitments={sourceInputHash:identity.sourceInputHash,nativeWitnessHash:identity.nativeWitnessHash,rightsEvidenceHash:identity.rightsEvidenceHash,
  sourceUrlHash:witness.nativeDocumentIdentity.sourceUrlHash,documentUrlHash:witness.nativeDocumentIdentity.documentUrlHash,
  fieldBindings,bodyVectorHash,titleVectorHash,bodyWireHash,titleWireHash,materialHash};
 const compatibility={urlCompatible:Boolean(urlCompatible),titleCompatible,extractorCompatible,bodyNormCompatible,titleNormCompatible,materialCompatible,priorCompatible,
  currentRootOnlySchema:s.rootOnly,currentQueueShapeCompatible:materialCompatible&&priorCompatible&&s.rootOnly,scope:'shape-only-not-publication-identity-or-serving'};
 const description=freeze({schema:'native-canonical-mapping/v1',templateHash:s.templateHash,
  semantic,grouping,declaredCanonicalSource,declaredPublication,commitments,compatibility,
  registryArtifactHash:null,nativeAttested:false,publicationIdentityChecked:false,publicationVerified:false,canonicalAuthority:false,queueAuthority:false,assignmentAuthority:false,productionValidated:false});
 const result=freeze({...description,mappingHash:digest(description)}),job=Object.freeze({});jobs.set(job,result);return job;
}

export function describeNativeCanonicalMapping(job){need(arguments.length===1&&jobs.has(job));return freeze(copy(jobs.get(job)));}
