import test from 'node:test';
import assert from 'node:assert/strict';
import { wholeEvents, evaluationCandidates, fitCandidates, fitHead, headScore, calibrationGate, ranking } from './core.js';
import { pairTokenInput } from './infer.js';
import { exposeJointCls } from './onnx-output.js';
const row = (id, eventKey, duplicateKey = id) => ({ id, eventKey, duplicateKey });
test('whole-event selection excludes entire events and exact reused input keys', () => {
  const rows = [row('a','A'),row('b','A'),row('c','B'),row('d','B'),row('e','C','reused'),row('f','C')];
  const excluded = [row('old','A'),row('another','D','reused')];
  assert.deepEqual(wholeEvents(rows,4,'test',excluded).map(item=>item.id),['c','d']);
  assert.deepEqual(wholeEvents([...rows].reverse(),4,'test',excluded).map(item=>item.id),['c','d']);
});
test('evaluation retrieval never consults gold labels and includes either cosine channel', () => {
  const pairs = [{key:'b',raw:.89,adapted:.92,same:false},{key:'a',raw:.91,adapted:.7,same:true},{key:'c',raw:.89,adapted:.89,same:true}];
  const keys = input => evaluationCandidates(input).map(pair=>pair.key);
  assert.deepEqual(keys(pairs),['a','b']);
  assert.deepEqual(keys(pairs.map(pair=>({...pair,same:!pair.same}))),['a','b']);
});
test('fit mining includes hard positives and favors candidate hard negatives', () => {
  const anchor=row('a','A'),positive=row('b','A'),negative=row('c','B');
  const pairs=[{a:anchor,b:positive,key:'a\0b',same:true,raw:.7,adapted:.7},
    {a:anchor,b:negative,key:'a\0c',same:false,raw:.95,adapted:.96,sameCategory:true}];
  assert.equal(fitCandidates([anchor],pairs).length,2);
});
test('task head learns discriminative evidence and calibration without negatives abstains', () => {
  const pairs=[{raw:.9,adapted:.95,same:true},{raw:.88,adapted:.94,same:true},
    {raw:.7,adapted:.72,same:false},{raw:.72,adapted:.74,same:false}];
  const head=fitHead(pairs,'vectors');
  assert.ok(headScore(head,pairs[0])>headScore(head,pairs[2]));
  assert.ok(calibrationGate(pairs,pair=>headScore(head,pair),.1).threshold>headScore(head,pairs[2]));
  assert.equal(calibrationGate(pairs.filter(pair=>pair.same),pair=>headScore(head,pair),.1).threshold,Infinity);
  assert.equal(ranking(pairs,pair=>headScore(head,pair)).averagePrecision,1);
});
test('pair tokenizer preserves both sides under independent truncation', () => {
  const tokenizer={encode(text){return {ids:Array(text==='A'?600:300).fill(text==='A'?5:7)};}};
  const encoded=pairTokenInput(tokenizer,{title:'A'},{title:'B'});
  assert.equal(encoded.ids.length,512);
  assert.equal(encoded.ids.filter(id=>id===5).length,254);
  assert.equal(encoded.ids.filter(id=>id===7).length,254);
  assert.deepEqual(encoded.ids.slice(254,258),[5,2,2,7]);
  assert.equal(encoded.sampled,true);
});
test('protobuf output adaptation rejects absent graph and truncated data', () => {
  assert.throws(()=>exposeJointCls(Buffer.from([0x3a,0x05,0x01])),/ONNX_GRAPH/u);
  assert.throws(()=>exposeJointCls(Buffer.from([0x08,0x01])),/ONNX_GRAPH/u);
});
