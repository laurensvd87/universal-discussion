// Browser-only experimental raw-E5 transport. No IO, encoding or normalization.
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {record,dense,hash,freeze,BATCHES} from '../../../../../spikes/topic-resolution/harness/current-producer-final-v1/manifest.js';
import {vectorBitHash} from '../hierarchical-e5-current-producer-transfer-evaluation-v1/contracts.js';
export const VECTOR_SCHEMA='browser-root-transfer-raw-e5-vectors/v1';
export const MAX_VECTOR_BYTES=262144;
const ROW_FIELDS=['id','producerId','sourceInputHash','bodySha256','titleSha256','bodyVector','titleVector','bodyVectorHash','titleVectorHash'];
const byteLengthGetter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'length').get;
function unit(input){
 const vector=dense(input,384);assert.equal(vector.length,384);let norm=0;
 for(const n of vector){assert.equal(typeof n,'number');assert.ok(Number.isFinite(n)&&Math.abs(n)<=1);norm+=n*n;}
 assert.ok(Math.abs(norm-1)<=1e-5);return Object.freeze(vector);
}
export function validateVectorPacket(input){
 assert.equal(arguments.length,1);
 const a=record(input,['schema','freezeHash','encoderHash','batch','inputPacketSha256','rows']);
 assert.equal(a.schema,VECTOR_SCHEMA);hash(a.freezeHash);hash(a.encoderHash);hash(a.inputPacketSha256);
 assert.ok(Number.isInteger(a.batch)&&a.batch>=1&&a.batch<=8);
 let previous=-1;const rows=dense(a.rows,4).map(raw=>{
  const r=record(raw,ROW_FIELDS);assert.equal(r.producerId,'browser-current');
  const index=BATCHES[a.batch-1].indexOf(r.id);assert.ok(index>=0&&index>previous);previous=index;
  for(const k of ['sourceInputHash','bodySha256','titleSha256','bodyVectorHash','titleVectorHash'])hash(r[k]);
  const bodyVector=unit(r.bodyVector),titleVector=unit(r.titleVector);
  assert.equal(vectorBitHash(bodyVector),r.bodyVectorHash);assert.equal(vectorBitHash(titleVector),r.titleVectorHash);
  return freeze({...r,bodyVector,titleVector});
 });
 return freeze({...a,rows});
}
export function serializeVectorPacket(input){
 assert.equal(arguments.length,1);
 const p=validateVectorPacket(input),number=n=>Object.is(n,-0)?'-0':JSON.stringify(n),vec=v=>'['+v.map(number).join(',')+']';
 const rows=p.rows.map(r=>{
  const {bodyVector,titleVector,...rest}=r;
  return JSON.stringify(rest).slice(0,-1)+',"bodyVector":'+vec(bodyVector)+',"titleVector":'+vec(titleVector)+'}';
 });
 const {rows:_,...header}=p;
 const bytes=Buffer.from(JSON.stringify(header).slice(0,-1)+',"rows":['+rows.join(',')+']}');
 assert.ok(bytes.length<=MAX_VECTOR_BYTES);return bytes;
}
export function parseVectorPacket(input){
 assert.equal(arguments.length,1);
 assert.ok(input&&typeof input==='object'&&!types.isProxy(input)&&Buffer.isBuffer(input)&&Object.getPrototypeOf(input)===Buffer.prototype);
 const length=Reflect.apply(byteLengthGetter,input,[]);
 assert.ok(length>0&&length<=MAX_VECTOR_BYTES&&Reflect.ownKeys(input).length===length,'Invalid or extended byte buffer');
 const bytes=Buffer.from(input);
 return validateVectorPacket(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
}
