import test from 'node:test';
import assert from 'node:assert/strict';
import {extendChildCalibration} from '../harness/hierarchy-child-calibration-extension.js';
const vector=[1,...Array(383).fill(0)];
// Use the installed fixed representation definition, without a model or state.
import {readFileSync} from 'node:fs';
const definition=JSON.parse(readFileSync(new URL('../assets/hierarchy/input-definition.json',import.meta.url),'utf8'));
const fixture=()=>({projected:{rows:[{id:'train',groupId:'train-group',split:'training'}]},probes:[{id:'cal',groupId:'cal-group',split:'calibration',url:'https://example.com/cal',language:'en',expectedRootId:'nature',labels:{'video-games':false,animals:true,koalas:false}}],
 features:[{id:'cal',url:'https://example.com/cal',split:'calibration',status:'encoded',sourceInputHash:'a'.repeat(64),modelId:'e5-small-q8-browser-main-prefix-v1',bodyVector:vector,titleVector:vector}],inputDefinition:definition});
test('fresh observations append only CAL and preserve the exact original TRAIN objects',()=>{
 const f=fixture(),out=extendChildCalibration(f);assert.equal(out.rows.length,2);assert.equal(out.rows[0],f.projected.rows[0]);assert.equal(out.rows[1].split,'calibration');assert.deepEqual(out.rows[1].labels,f.probes[0].labels);assert.equal(out.rows[1].vector.length,384);
});
test('split leakage, cross-observation swaps, duplicate groups and malformed vectors cannot supply support',()=>{
 for(const mutate of [f=>{f.probes[0].split='training';},f=>{f.features[0].split='test';},f=>{f.features[0].url='https://example.com/other';},f=>{f.probes[0].groupId='train-group';},f=>{f.features[0].titleVector=[1];},f=>{f.features[0].sourceInputHash=null;},f=>{f.probes[0].labels.koalas=true;f.probes[0].labels.animals=false;}]){
  const f=fixture();mutate(f);assert.throws(()=>extendChildCalibration(f));
 }
});
test('an unavailable declared case stays reported and cannot turn into a negative observation',()=>{
 const f=fixture();f.features[0]={id:'cal',url:f.probes[0].url,split:'calibration',status:'unavailable',reason:'robots-denied'};
 const out=extendChildCalibration(f);assert.equal(out.rows.length,1);assert.deepEqual(out.extensionUnavailable,[{id:'cal',reason:'robots-denied'}]);
});
