// Unregistered synchronous consistency boundary. No IO, encoding or queue grant.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {compileNativeRootLocalDetailTransfer,describeNativeRootLocalDetailTransfer,
 prepareNativeRootLocalDetailInput,classifyNativeRootLocalDetailTransfer} from '../../../domain/experimental/native-root-local-detail-transfer-v1/adapter.js';

const handles=new WeakMap(),jobs=new WeakMap();
const invalid=()=>{throw new TypeError('Invalid pure native observation preparation');};
const sha=value=>createHash('sha256').update(value,'utf8').digest('hex');
function record(value,keys){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)invalid();
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[key]=d.value;}return out;
}
function own(value,key){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)invalid();
 const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();return d.value;
}
function text(value,maximum,nonblank){
 if(typeof value!=='string'||!value.isWellFormed()||value.length>maximum||nonblank&&!value.trim()||
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value))invalid();return value;
}
function vector(value){
 if(types.isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)invalid();
 const n=Object.getOwnPropertyDescriptor(value,'length').value;if(n!==384||Reflect.ownKeys(value).length!==385)invalid();
 return Array.from({length:384},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));
  if(!d?.enumerable||!Object.hasOwn(d,'value')||typeof d.value!=='number'||!Number.isFinite(d.value))invalid();return d.value;});
}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}

export function compileNativeScopedPreparation(input){
 if(arguments.length!==1)invalid();const a=record(input,['schema','candidate']);if(a.schema!=='native-scoped-preparation/v1')invalid();
 // Existing numerical owners validate/copy their complete artifacts. No renamed
 // five-hash registry publication is invented by this application boundary.
 const classifier=compileNativeRootLocalDetailTransfer(a.candidate),identity=describeNativeRootLocalDetailTransfer(classifier);
 const handle=Object.freeze({});handles.set(handle,{classifier,identity});return handle;
}

export function describeNativeScopedPreparation(handle){if(arguments.length!==1||!handles.has(handle))invalid();return handles.get(handle).identity;}

export function prepareNativeScopedObservation(handle,input){
 if(arguments.length!==2||!handles.has(handle))invalid();const state=handles.get(handle);
 const a=record(input,['schema','rawTitle','effectiveTitle','body','extractorVersion','nativeWitness','rightsEvidenceHash','bodyVector','titleVector']);
 if(a.schema!=='native-scoped-observation/v1')invalid();
 const rawTitle=text(a.rawTitle,200,false),effectiveTitle=text(a.effectiveTitle,200,true),body=text(a.body,4096,true);
 const fieldBindings={bodySha256:sha(body),bodyCharacters:body.length,rawTitleSha256:sha(rawTitle),rawTitleCharacters:rawTitle.length,
  effectiveTitleSha256:sha(effectiveTitle),effectiveTitleCharacters:effectiveTitle.length};
 const profile=state.identity.actualNativeTargetProfile;
 // These IDs remain declared observation identities, never canonical IDs.
 // The real native owner validates and detaches ALL nested witness metadata.
 const metadata=prepareNativeRootLocalDetailInput(state.classifier,{
  sourceId:own(a.nativeWitness,'caseId'),sourceVersion:own(a.nativeWitness,'observationNonce'),
  producerId:profile.producerId,producerProfileHash:profile.producerProfileHash,inputConstructionHash:profile.inputConstructionHash,
  extractorVersion:a.extractorVersion,fieldBindings,nativeWitness:a.nativeWitness,rightsEvidenceHash:a.rightsEvidenceHash});
 if(effectiveTitle!==(rawTitle.trim()||new URL(metadata.nativeWitness.sourceUrl).hostname))invalid();
 const bodyVector=vector(a.bodyVector),titleVector=vector(a.titleVector);
 const decision=classifyNativeRootLocalDetailTransfer(state.classifier,{...metadata,bodyVector,titleVector});
 // This deliberately does NOT reproduce SQL wires, text constraints, admission
 // eligibility, or authentication. No normalization or bit rewriting occurs.
 const bodyCompatible=Math.abs(Math.hypot(...bodyVector)-1)<=1e-9,titleCompatible=Math.abs(Math.hypot(...titleVector)-1)<=1e-9;
 const description=freeze({schema:'native-scoped-prepared-observation/v1',classifierIdentity:state.identity,
  nativeObservationIdentity:{caseId:decision.witness.sourceId,observationNonce:decision.witness.sourceVersion,
   sourceInputHash:decision.witness.sourceInputHash,nativeWitnessHash:decision.witness.nativeWitnessHash,
   rightsEvidenceHash:decision.witness.rightsEvidenceHash,fieldBindings:decision.witness.fieldBindings},
  decision,queueNormCompatibility:{schema:'scoped-repository-vector-norm-compatibility/v1',bodyCompatible,titleCompatible,
   compatible:bodyCompatible&&titleCompatible,scope:'repository-vector-norm-only',noNormalization:true},
  registryMapping:null,nativeAttested:false,canonicalAuthority:false,queueAuthority:false,productionValidated:false});
 // Job value is ONLY this frozen description: no input, pair, full witness,
 // classifier handle, capabilities, or closure over transient fields survives.
 const job=Object.freeze({});jobs.set(job,description);return job;
}

export function describeNativeScopedObservation(job){if(arguments.length!==1||!jobs.has(job))invalid();return jobs.get(job);}
