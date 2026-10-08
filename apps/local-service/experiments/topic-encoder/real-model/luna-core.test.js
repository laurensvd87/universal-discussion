import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLunaSplits } from './luna-core.js';

const make=(split)=>Array.from({length:8},(_,i)=>({id:`${split}-${i}`,
  family:`${split}-family`,topicLabel:`${split}-${Math.floor(i/2)}`,
  title:`Public article ${i}`,body:'An invented bounded article lead about one decision and differing views.'}));

test('Luna split validator keeps whole families disjoint',()=>{
  const splits={train:make('train'),validation:make('validation'),test:make('test')};
  assert.deepEqual(validateLunaSplits(splits),['train','validation','test']);
  assert.throws(()=>validateLunaSplits({...splits,test:[
    {...splits.test[0],family:splits.train[0].family},...splits.test.slice(1)]}),/leakage/);
});

test('Luna split validator rejects duplicate IDs and missing text',()=>{
  const splits={train:make('train'),validation:make('validation'),test:make('test')};
  assert.throws(()=>validateLunaSplits({...splits,test:[
    {...splits.test[0],id:splits.train[0].id},...splits.test.slice(1)]}));
  assert.throws(()=>validateLunaSplits({...splits,validation:[
    {...splits.validation[0],body:''},...splits.validation.slice(1)]}));
});
