import test from 'node:test';
import assert from 'node:assert/strict';
import {VECTOR_SCHEMA,validateVectorPacket,serializeVectorPacket,parseVectorPacket} from './vector-packet.js';
import {vectorBitHash} from './contracts.js';
const H='a'.repeat(64),axis=i=>Array.from({length:384},(_,j)=>j===i?1:0);
function packet(){const bodyVector=axis(0),titleVector=axis(1);bodyVector[2]=-0;return {schema:VECTOR_SCHEMA,freezeHash:H,encoderHash:H,batch:1,
 inputPacketHashes:{static:H,browser:H},rows:[{id:'producer-transfer-001',producerId:'current-static',sourceInputHash:H,bodySha256:H,titleSha256:H,
 bodyVector,titleVector,bodyVectorHash:vectorBitHash(bodyVector),titleVectorHash:vectorBitHash(titleVector)}]};}
test('exact binary64 vectors including signedzero roundtrip under truthful public namespace',()=>{
 const p=packet(),b=serializeVectorPacket(p),q=parseVectorPacket(b);assert.ok(Object.is(q.rows[0].bodyVector[2],-0));
 assert.equal(q.rows[0].bodyVectorHash,p.rows[0].bodyVectorHash);assert.ok(Object.isFrozen(q.rows[0].bodyVector));
 p.rows[0].bodyVector[0]=0;assert.equal(q.rows[0].bodyVector[0],1);
 const positive=axis(0);assert.notEqual(vectorBitHash(positive),q.rows[0].bodyVectorHash);
});
test('unit/hash/order/namespace/extra-field/size constraints reject tampering',()=>{
 for(const change of [p=>p.rows[0].bodyVector[0]=.5,p=>p.rows[0].bodyVector[0]=NaN,p=>p.rows[0].bodyVectorHash='b'.repeat(64),
 p=>p.rows.push(p.rows[0]),p=>p.schema='hierarchy-synthetic-raw-e5-body-title-vectors/v1',p=>p.extra=true,p=>p.rows[0].id='producer-transfer-005']){
  const p=packet();change(p);assert.throws(()=>validateVectorPacket(p));
 }
 assert.throws(()=>parseVectorPacket(Buffer.alloc(262145)));
 const p=packet();p.rows=[];assert.equal(parseVectorPacket(serializeVectorPacket(p)).rows.length,0);
});
test('proxy/getter/sparse inputs never execute caller traps',()=>{
 let calls=0;const p=packet();Object.defineProperty(p.rows[0].bodyVector,'3',{enumerable:true,get(){calls++;throw Error();}});
 assert.throws(()=>validateVectorPacket(p));assert.equal(calls,0);
 const proxy=new Proxy({}, {get(){calls++;throw Error();},ownKeys(){calls++;throw Error();}});
 assert.throws(()=>validateVectorPacket(proxy));assert.throws(()=>parseVectorPacket(proxy));assert.equal(calls,0);
 const sparse=packet();delete sparse.rows[0].titleVector[3];assert.throws(()=>validateVectorPacket(sparse));
});
