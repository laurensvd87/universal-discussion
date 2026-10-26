import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {serializeVectorPacket,parseVectorPacket,validateVectorPacket,VECTOR_PACKET_SCHEMA,MAX_VECTOR_PACKET_BYTES} from './vector-packet.js';
const axis=()=>[1,-0,...Array(382).fill(0)];
const packet=()=>({schema:VECTOR_PACKET_SCHEMA,freezeHash:'a'.repeat(64),encoderHash:'b'.repeat(64),vectors:[{id:'new-geometric',bodyVector:axis(),titleVector:axis()}]});

test('roundtrip preserves binary64 and signed zero with explicit raw body/title identity',()=>{
  const p=packet();p.vectors[0].titleVector=[Math.SQRT1_2,Math.SQRT1_2,...Array(382).fill(0)];
  const bytes=serializeVectorPacket(p),out=parseVectorPacket(bytes);
  assert.ok(bytes.length<MAX_VECTOR_PACKET_BYTES);assert.deepEqual(out,p);assert.ok(Object.is(out.vectors[0].bodyVector[1],-0));
  assert.ok(Object.isFrozen(out.vectors[0].bodyVector));p.vectors[0].bodyVector[0]=0;assert.equal(out.vectors[0].bodyVector[0],1);
});
test('duplicate IDs, invalid hashes, wrong namespaces, extra fields and capacities reject',()=>{
  for(const change of [p=>{p.vectors.push(p.vectors[0]);},p=>{p.schema='raw-e5';},p=>{p.freezeHash='A'.repeat(64);},
    p=>{p.encoderHash='';},p=>{p.extra=1;},p=>{p.vectors=[];},p=>{p.vectors=Array(513).fill(p.vectors[0]);},
    p=>{p.vectors[0].ridge=axis();},p=>{p.vectors[0].bodyVector=Array(385).fill(0);},p=>{p.vectors[0].id='x'.repeat(161);}]){
    const p=packet();change(p);assert.throws(()=>serializeVectorPacket(p));
  }
  assert.throws(()=>parseVectorPacket(Buffer.alloc(MAX_VECTOR_PACKET_BYTES+1)));
});
test('distortion, sparse data, accessors, proxies and nonfinite coordinates fail without user code',()=>{
  let called=0;
  for(const change of [p=>{p.vectors[0].bodyVector[0]=2;},p=>{p.vectors[0].bodyVector[0]=NaN;},
    p=>{delete p.vectors[0].bodyVector[1];},p=>{p.vectors[0].titleVector=new Float32Array(axis());},
    p=>{Object.defineProperty(p.vectors[0].bodyVector,'0',{enumerable:true,get(){called++;throw Error('private');}});},
    p=>{p.vectors=new Proxy([],{get(){called++;throw Error('private');}});}]){
    const p=packet();change(p);assert.throws(()=>validateVectorPacket(p));
  }
  assert.equal(called,0);assert.throws(()=>parseVectorPacket(Buffer.from([0xff])));
});
test('512 dense unit rows fit compact transport; numeric-looking IDs remain strings',()=>{
  const p=packet();p.vectors=Array.from({length:512},(_,i)=>({id:String(i),bodyVector:axis(),titleVector:axis()}));
  const bytes=serializeVectorPacket(p),out=parseVectorPacket(bytes);assert.equal(out.vectors.length,512);assert.equal(out.vectors[0].id,'0');
});
test('experiment default is inert and fitter preflight is bounded without model/corpus access',async()=>{
  const {maximumTrainingWork,runCli}=await import('./run.js');
  const before=process.env.MURMINGLE_BROAD_HEADS_SUPERVISED;delete process.env.MURMINGLE_BROAD_HEADS_SUPERVISED;
  try{assert.equal(await runCli([]),'inert');await assert.rejects(runCli(['--encode']),/supervisor/);}
  finally{if(before!==undefined)process.env.MURMINGLE_BROAD_HEADS_SUPERVISED=before;}
  assert.ok(maximumTrainingWork(130,63)*9<=128000000);
  assert.throws(()=>maximumTrainingWork(385,63));assert.throws(()=>maximumTrainingWork(130,129));
  // Syntax only: inspecting the supervisor cannot start a child.
  assert.ok((await readFile(new URL('supervise.py',import.meta.url),'utf8')).includes('CREATE_NO_WINDOW'));
});
