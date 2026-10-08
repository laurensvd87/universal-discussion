import { test } from 'node:test';
import assert from 'node:assert/strict';
import artifact from './model.generated.json' with { type:'json' };
import { DIM, RANK, SCHEMA, encodeRealPage, trainRealEncoder } from './model.js';

const vector=(a,b)=>Float32Array.from({length:DIM},(_,i)=>i===0?a:i===1?b:0);
const source={title:'Public article',body:'A bounded public article lead.'};

test('frozen real-language artifact maps one page to a 384D unit vector',()=>{
  assert.equal(artifact.schema,SCHEMA);
  assert.equal(artifact.rank,RANK);
  assert.equal(artifact.factors.length,2*DIM*RANK);
  assert.equal(artifact.archiveSha256.length,64);
  const result=encodeRealPage(source,vector(1,0),vector(.9,.1),artifact);
  assert.equal(result.length,DIM);
  assert.ok([...result].every(Number.isFinite));
  assert.ok(Math.abs(result.reduce((sum,value)=>sum+value*value,0)-1)<1e-5);
});

test('invalid vectors and artifacts fail closed',()=>{
  assert.throws(()=>encodeRealPage(source,[],vector(1,0),artifact));
  assert.throws(()=>encodeRealPage(source,vector(1,0),vector(1,0),
    {...artifact,factors:[]}));
  assert.throws(()=>encodeRealPage(source,vector(1,0),vector(1,0),
    {...artifact,titleLeadShare:2}));
});

test('trainer rejects family overlap before fitting',()=>{
  const docs=Array.from({length:8},(_,i)=>({id:`d${i}`,family:'shared',
    topicLabel:i<4?'a':'b'}));
  const map=new Map(docs.map((doc,i)=>[doc.id,vector(i<4?1:0,i<4?0:1)]));
  assert.throws(()=>trainRealEncoder(docs,map,map,docs,map,map),/leakage/);
});
