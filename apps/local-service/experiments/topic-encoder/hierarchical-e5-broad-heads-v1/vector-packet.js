// Synthetic raw E5 body/title transport only; never Ridge or owner page data.
import { types } from 'node:util';
export const MAX_VECTOR_PACKET_BYTES = 12 * 1024 * 1024;
export const VECTOR_PACKET_SCHEMA = 'hierarchy-synthetic-raw-e5-body-title-vectors/v1';
const invalid = () => { throw new TypeError('Invalid bounded synthetic body/title vector packet'); };
function record(value, fields) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).length !== fields.length) invalid();
  const out = {};
  for (const key of fields) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) invalid();out[key] = d.value;
  }
  return out;
}
function array(value, max) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const n = Object.getOwnPropertyDescriptor(value, 'length').value;
  if (n > max || Reflect.ownKeys(value).length !== n + 1) invalid();
  return Array.from({length:n}, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) invalid();return d.value;
  });
}
function vector(value) {
  const out = array(value,384);if(out.length!==384)invalid();let norm=0;
  for(const n of out){if(typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1)invalid();norm+=n*n;}
  if(Math.abs(norm-1)>1e-5)invalid();return Object.freeze(out);
}
export function validateVectorPacket(input) {
  const p=record(input,['schema','freezeHash','encoderHash','vectors']);
  if(p.schema!==VECTOR_PACKET_SCHEMA || typeof p.freezeHash!=='string' || !/^[a-f0-9]{64}$/u.test(p.freezeHash) ||
      typeof p.encoderHash!=='string'||!/^[a-f0-9]{64}$/u.test(p.encoderHash))invalid();
  const ids=new Set();
  const vectors=array(p.vectors,512).map(value=>{
    const r=record(value,['id','bodyVector','titleVector']);
    if(typeof r.id!=='string'||!r.id.length||r.id.length>160||r.id.trim()!==r.id||/[\u0000-\u001f\u007f]/u.test(r.id)||ids.has(r.id))invalid();
    ids.add(r.id);return Object.freeze({id:r.id,bodyVector:vector(r.bodyVector),titleVector:vector(r.titleVector)});
  });
  if(!vectors.length)invalid();return Object.freeze({...p,vectors:Object.freeze(vectors)});
}
export function serializeVectorPacket(input) {
  const p=validateVectorPacket(input);
  const number=n=>Object.is(n,-0)?'-0':JSON.stringify(n);
  const vec=v=>'['+v.map(number).join(',')+']';
  const rows=p.vectors.map(r=>'{'+'"id":'+JSON.stringify(r.id)+',"bodyVector":'+vec(r.bodyVector)+',"titleVector":'+vec(r.titleVector)+'}');
  const text='{"schema":'+JSON.stringify(p.schema)+',"freezeHash":'+JSON.stringify(p.freezeHash)+',"encoderHash":'+JSON.stringify(p.encoderHash)+',"vectors":['+rows.join(',')+']}';
  if(Buffer.byteLength(text)>MAX_VECTOR_PACKET_BYTES)invalid();return Buffer.from(text);
}
export function parseVectorPacket(input) {
  if(types.isProxy(input)||!(typeof input==='string'||Buffer.isBuffer(input)))invalid();
  if((typeof input==='string'?Buffer.byteLength(input):input.length)>MAX_VECTOR_PACKET_BYTES)invalid();
  const text=typeof input==='string'?input:new TextDecoder('utf-8',{fatal:true}).decode(input);
  return validateVectorPacket(JSON.parse(text));
}
