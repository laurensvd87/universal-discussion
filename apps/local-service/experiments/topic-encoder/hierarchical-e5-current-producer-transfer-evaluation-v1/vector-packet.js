// Public experimental input transport. Same binary64/-0 JSON grammar as the
// reviewed synthetic codec; this is a distinct schema and not a Ridge embedding.
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {record,dense,hash,freeze,BATCHES} from '../../../../../spikes/topic-resolution/harness/current-producer-final-v1/manifest.js';
import {vectorBitHash} from './contracts.js';
export const VECTOR_SCHEMA='current-producer-transfer-raw-e5-vectors/v1';
export const MAX_VECTOR_BYTES=262144;
const ROW_FIELDS=['id','producerId','sourceInputHash','bodySha256','titleSha256','bodyVector','titleVector','bodyVectorHash','titleVectorHash'];
function unit(input){
 const vector=dense(input,384);assert.equal(vector.length,384);let norm=0;
 for(const n of vector){assert.equal(typeof n,'number');assert.ok(Number.isFinite(n)&&Math.abs(n)<=1);norm+=n*n;}
 assert.ok(Math.abs(norm-1)<=1e-5);return Object.freeze(vector);
}
export function validateVectorPacket(input){
 const a=record(input,['schema','freezeHash','encoderHash','batch','inputPacketHashes','rows']);
 assert.equal(a.schema,VECTOR_SCHEMA);hash(a.freezeHash);hash(a.encoderHash);assert.ok(Number.isInteger(a.batch)&&a.batch>=1&&a.batch<=8);
 const inputPacketHashes=record(a.inputPacketHashes,['static','browser']);hash(inputPacketHashes.static);hash(inputPacketHashes.browser);
 let previous=-1;const rows=dense(a.rows,8).map(raw=>{
  const r=record(raw,ROW_FIELDS);assert.ok(['current-static','browser-current'].includes(r.producerId));
  const index=BATCHES[a.batch-1].indexOf(r.id)*2+(r.producerId==='browser-current'?1:0);
  assert.ok(BATCHES[a.batch-1].includes(r.id)&&index>previous);previous=index;
  for(const k of ['sourceInputHash','bodySha256','titleSha256','bodyVectorHash','titleVectorHash'])hash(r[k]);
  const bodyVector=unit(r.bodyVector),titleVector=unit(r.titleVector);
  assert.equal(vectorBitHash(bodyVector),r.bodyVectorHash);assert.equal(vectorBitHash(titleVector),r.titleVectorHash);
  return freeze({...r,bodyVector,titleVector});
 });
 return freeze({...a,inputPacketHashes,rows});
}
export function serializeVectorPacket(input){
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
 assert.ok(!types.isProxy(input)&&Buffer.isBuffer(input)&&input.length>0&&input.length<=MAX_VECTOR_BYTES);
 return validateVectorPacket(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(input)));
}
