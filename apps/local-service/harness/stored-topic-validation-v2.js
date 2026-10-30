// Correct the diagnostic reader's positive-only version check. Canonical Source
// versions start at0 (migration002). The actual V3/scorer and all old files stay
// unchanged; gold annotations never enter preparation or proposal generation.
import {createHash} from 'node:crypto';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';
import {decodeEmbeddingBase64Array} from '../portable/canonical-v4/embedding-binary-wire.js';
import {STORED_VALIDATION_PROBES} from './stored-topic-validation.js';
export {evaluateStoredValidation} from './stored-topic-validation.js';
const need=v=>{if(!v)throw new TypeError('Invalid fixed stored-topic validation');};
const sha=v=>createHash('sha256').update(v).digest('hex');
const HASH=/^[a-f0-9]{64}$/u,ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
export function prepareStoredValidation({rows,inputDefinition,matcherHash}){
 need(Array.isArray(rows)&&rows.length<=64&&HASH.test(matcherHash)&&Buffer.byteLength(JSON.stringify(rows))<=1048576);
 const seen=new Set(),paired=compilePairedE5Input(inputDefinition),representationHash=describePairedE5Input(paired).representationHash;
 const observations=rows.map(r=>{
  need(r&&ID.test(r.sourceId)&&!seen.has(r.sourceId)&&STORED_VALIDATION_PROBES.some(p=>p.id===r.probe));seen.add(r.sourceId);
  need(typeof r.title==='string'&&r.title.length>0&&r.title.length<=200&&Array.isArray(r.acceptedPath));
  need(typeof r.sourceVersion==='string'&&/^(0|[1-9][0-9]{0,18})$/u.test(r.sourceVersion)&&ID.test(r.operationId)&&HASH.test(r.operationDigest)&&HASH.test(r.sourceStamp));
  const url=new URL(r.url);need(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password);
  const decode=(wire,hash)=>{need(typeof wire==='string'&&wire.length<=8192&&HASH.test(hash)&&sha(Buffer.from(wire,'base64'))===hash);return decodeEmbeddingBase64Array(wire);};
  const inputHash=sha(JSON.stringify([r.sourceId,r.sourceVersion,r.operationId,r.operationDigest,r.sourceStamp]));
  const fused=applyPairedE5Input(paired,{sourceId:r.sourceId,sourceVersion:inputHash,bodyVector:decode(r.bodyBase64,r.bodyWireHash),titleVector:decode(r.titleBase64,r.titleWireHash)});need(fused.status==='available');
  return {sourceId:r.sourceId,inputHash,materialHash:sha(JSON.stringify([r.bodyWireHash,r.titleWireHash])),title:r.title,
   publisherKey:url.hostname.replace(/^www\./u,''),acceptedPath:r.acceptedPath,vector:fused.vector};
 });
 return {representationHash,matcherHash,minimumSimilarity:.8,observations};
}
