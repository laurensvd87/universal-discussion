import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevelopmentEmbeddingQuery} from './development-v2.js';
test('120-source development transport uses the existing strict numbered IN wire contract',()=>{
  const ids=Array.from({length:120},(_,i)=>`analytic-source-${i}`),query=createDevelopmentEmbeddingQuery(ids);
  assert.equal(query.values.length,120);assert.deepEqual(query.values,ids);
  assert.match(query.text,/array_send\(values_double\)/u);
  assert.match(query.text,/IN \(\$1,\$2,/u);assert.match(query.text,/,\$120\)$/u);
  ids[0]='mutated';assert.equal(query.values[0],'analytic-source-0');
  assert.throws(()=>createDevelopmentEmbeddingQuery(['short']));
});
