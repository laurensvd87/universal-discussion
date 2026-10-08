import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SINGLE_SCHEMA, encodeSinglePage, trainSingleEncoder } from './single.js';

const dim=384;
const unit=Float32Array.from({length:dim},(_,i)=>i===0?1:0);
const identity={schema:SINGLE_SCHEMA,dimensions:dim,rank:8,
  factors:Array(dim*8*2).fill(0)};

test('single-pass encoder returns one 384D unit vector',()=>{
  const result=encodeSinglePage({title:'Example'},unit,identity);
  assert.equal(result.length,dim);
  assert.equal(result[0],1);
  assert.ok(result.slice(1).every(value=>value===0));
});

test('single-pass encoder rejects missing or non-finite vectors',()=>{
  assert.throws(()=>encodeSinglePage({},[],identity));
  assert.throws(()=>encodeSinglePage({},Float32Array.from(unit,(_,i)=>i===0?NaN:0),identity));
  assert.throws(()=>encodeSinglePage({},unit,{...identity,factors:[]}));
});

test('single-pass trainer rejects train/validation family leakage',()=>{
  const docs=Array.from({length:8},(_,i)=>({id:`id${i}`,family:'same',topicLabel:i<4?'a':'b'}));
  const vectors=new Map(docs.map(doc=>[doc.id,unit]));
  assert.throws(()=>trainSingleEncoder(docs,vectors,[
    {documents:docs,vectors},{documents:docs,vectors}]),/leakage/);
});
