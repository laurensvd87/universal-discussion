// Invented axes/metadata only. No artifacts, E5, retained inputs or IO.
import test from 'node:test';
import assert from 'node:assert/strict';
import {VECTOR_SCHEMA,MAX_VECTOR_BYTES,validateVectorPacket,serializeVectorPacket,parseVectorPacket} from './vector-packet.js';
import {vectorBitHash} from '../hierarchical-e5-current-producer-transfer-evaluation-v1/contracts.js';
const H='a'.repeat(64),axis=i=>Array.from({length:384},(_,j)=>j===i?1:0);
function row(n=1){const bodyVector=axis(0),titleVector=axis(1);bodyVector[2]=-0;bodyVector[3]=Number.MIN_VALUE;
 return {id:'producer-transfer-'+String(n).padStart(3,'0'),producerId:'browser-current',sourceInputHash:H,bodySha256:H,titleSha256:H,
 bodyVector,titleVector,bodyVectorHash:vectorBitHash(bodyVector),titleVectorHash:vectorBitHash(titleVector)};}
function packet(){return {schema:VECTOR_SCHEMA,freezeHash:H,encoderHash:H,batch:1,inputPacketSha256:H,rows:[row()]};}
test('binary64/-0/subnormal grammar roundtrip privately copies and freezes without normalization',()=>{
 const p=packet(),original=[...p.rows[0].bodyVector],b=serializeVectorPacket(p),q=parseVectorPacket(b);
 assert.ok(b.toString().includes(',-0,5e-324,'));assert.deepEqual(q.rows[0].bodyVector,original);
 assert.ok(Object.is(q.rows[0].bodyVector[2],-0));assert.equal(q.rows[0].bodyVector[3],Number.MIN_VALUE);
 assert.ok(Object.isFrozen(q.rows[0].bodyVector)&&Object.isFrozen(q.rows));
 assert.notEqual(vectorBitHash(axis(0)),q.rows[0].bodyVectorHash);
 p.rows[0].bodyVector.fill(0);b.fill(0);assert.deepEqual(q.rows[0].bodyVector,original);
 assert.deepEqual(Object.keys(q),['schema','freezeHash','encoderHash','batch','inputPacketSha256','rows']);
});
test('one truthful browser packet supports zero to four ordered rows in each of eight fixed batches',()=>{
 for(let batch=1;batch<=8;batch++)for(let count=0;count<=4;count++){
  const p=packet();p.batch=batch;p.rows=Array.from({length:count},(_,i)=>row((batch-1)*4+i+1));
  const b=serializeVectorPacket(p);assert.ok(b.length<=MAX_VECTOR_BYTES);assert.equal(parseVectorPacket(b).rows.length,count);
 }
 const p=packet();p.rows=[row(1),row(4)];assert.equal(validateVectorPacket(p).rows.length,2);
});
test('unknown producers/order/duplicates/batch/capacity/schema/header and row extensions fail closed',()=>{
 for(const change of [p=>p.rows[0].producerId='current-static',p=>p.rows[0].producerId='other',p=>p.rows=[row(2),row(1)],
  p=>p.rows.push(row(1)),p=>p.rows.push(row(5)),p=>p.rows=Array.from({length:5},(_,i)=>row(i+1)),
  p=>p.batch=0,p=>p.batch=9,p=>p.batch=1.5,p=>p.batch='1',p=>p.schema='current-producer-transfer-raw-e5-vectors/v1',
  p=>p.inputPacketHashes={static:H,browser:H},p=>delete p.inputPacketSha256,p=>p.extra=true,p=>p.rows[0].extra=true,
  p=>p.inputPacketSha256=H.toUpperCase(),p=>p.freezeHash='x',p=>p.encoderHash=null]){
  const p=packet();change(p);assert.throws(()=>validateVectorPacket(p));
 }
});
test('finite384D sequential unit guard and exact vector-bit bindings reject distortion',()=>{
 for(const change of [v=>v[0]=.5,v=>v[0]=NaN,v=>v[0]=Infinity,v=>v[0]=-Infinity,v=>v[0]=1.01,
  v=>v[0]='1',v=>v[0]=null,v=>v.pop(),v=>v.push(0),v=>delete v[20]]){
  const p=packet();change(p.rows[0].bodyVector);assert.throws(()=>validateVectorPacket(p));
 }
 for(const field of ['bodyVectorHash','titleVectorHash']){const p=packet();p.rows[0][field]='b'.repeat(64);assert.throws(()=>validateVectorPacket(p));}
 const p=packet();p.rows[0].bodyVector[2]=0;assert.throws(()=>validateVectorPacket(p),'signedzero bit tamper');
 const close=packet();close.rows[0].bodyVector[0]=Math.sqrt(1+5e-6); // component >1 independently prohibited
 assert.throws(()=>validateVectorPacket(close));
 const accepted=packet();accepted.rows[0].bodyVector[0]=Math.sqrt(1-5e-6);accepted.rows[0].bodyVectorHash=vectorBitHash(accepted.rows[0].bodyVector);
 assert.equal(validateVectorPacket(accepted).rows[0].bodyVector[0],accepted.rows[0].bodyVector[0]);
 const rejected=packet();rejected.rows[0].bodyVector[0]=Math.sqrt(1-2e-5);rejected.rows[0].bodyVectorHash=vectorBitHash(rejected.rows[0].bodyVector);
 assert.throws(()=>validateVectorPacket(rejected));
});
test('parser bounds/fatal UTF8/JSON/plain Buffer checks and API arity are explicit',()=>{
 for(const b of [Buffer.alloc(0),Buffer.alloc(MAX_VECTOR_BYTES+1),Buffer.from([0xff]),Buffer.from('{'),new Uint8Array([123,125])])assert.throws(()=>parseVectorPacket(b));
 const extended=serializeVectorPacket(packet());extended.extra=true;assert.throws(()=>parseVectorPacket(extended));
 const extendedLength=serializeVectorPacket(packet());Object.defineProperty(extendedLength,'length',{get(){throw Error('must not run');}});assert.throws(()=>parseVectorPacket(extendedLength));
 for(const fn of [validateVectorPacket,serializeVectorPacket,parseVectorPacket])assert.throws(()=>fn(packet(),'extra'));
 const exact=serializeVectorPacket(packet()),padded=Buffer.concat([exact,Buffer.alloc(MAX_VECTOR_BYTES-exact.length,32)]);
 assert.equal(parseVectorPacket(padded).rows.length,1);
});
test('proxy/accessor/custom-prototype/array extensions never call hostile hooks',()=>{
 let calls=0;const getter={enumerable:true,get(){calls++;throw Error('hook');}};
 for(const change of [p=>Object.defineProperty(p,'schema',getter),p=>Object.defineProperty(p.rows,'0',getter),
  p=>Object.defineProperty(p.rows[0],'bodyVector',getter),p=>Object.defineProperty(p.rows[0].bodyVector,'3',getter),
  p=>p.rows.extra=true,p=>p.rows[0].bodyVector.extra=true,p=>Object.setPrototypeOf(p,null),p=>Object.setPrototypeOf(p.rows[0],null),
  p=>Object.setPrototypeOf(p.rows[0].bodyVector,null)]){
  const p=packet();change(p);assert.throws(()=>validateVectorPacket(p));
 }
 const proxy=new Proxy({}, {get(){calls++;throw Error();},ownKeys(){calls++;throw Error();},getPrototypeOf(){calls++;throw Error();}});
 assert.throws(()=>validateVectorPacket(proxy));assert.throws(()=>parseVectorPacket(proxy));
 const p=packet();p.rows[0].bodyVector=new Proxy(p.rows[0].bodyVector,{get(){calls++;throw Error();}});assert.throws(()=>validateVectorPacket(p));
 assert.equal(calls,0);
});
