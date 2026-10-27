import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadPrivateModelTrainingInputs,projectPrivateModelTrainingInputsForTest,PRIVATE_MODEL_INPUT_PINS,PRIVATE_MODEL_INPUT_SCOPE} from './private-model-training-inputs.js';

const root=new URL('../../../../',import.meta.url),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixtures(){return PRIVATE_MODEL_INPUT_PINS.map(pin=>{const raw=readFileSync(new URL(pin.path,root));assert.equal(raw.length,pin.bytes);assert.equal(hash(raw),pin.sha256);return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));});}
const get=(packet,id)=>packet.capture.outcomes.find(r=>r.id===id);
test('actual noarg bounded reader authenticates only three fixed artifacts and returns exact two TRAIN body/title inputs',async()=>{
 const rows=await loadPrivateModelTrainingInputs();assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.id),['real-train-01','real-train-04']);
 assert.deepEqual(rows.map(r=>r.title),['Tetris - Wikipedia','Octopoda \u2014 Wikip\u00e9dia']);
 for(const row of rows){assert.deepEqual(Object.keys(row),['id','url','title','text','extractorVersion','sourceInputHash']);assert.equal(row.text.length,4096);assert.equal(row.extractorVersion,'crawler-static-html-prefix/v1');assert.ok(Object.isFrozen(row));assert.equal(Object.hasOwn(row,'vector'),false);}
 assert.ok(Object.isFrozen(rows));await assert.rejects(loadPrivateModelTrainingInputs('foreign-path'));
 assert.equal(PRIVATE_MODEL_INPUT_PINS.length,3);assert.ok(PRIVATE_MODEL_INPUT_PINS.every(p=>!p.path.toLowerCase().includes('test')));
 assert.equal(PRIVATE_MODEL_INPUT_SCOPE.performanceValidated,undefined);assert.equal(PRIVATE_MODEL_INPUT_SCOPE.purpose,'performance-only');assert.equal(PRIVATE_MODEL_INPUT_SCOPE.experimentallyPrunedStatic,true);assert.equal(PRIVATE_MODEL_INPUT_SCOPE.freshCapture,false);assert.equal(PRIVATE_MODEL_INPUT_SCOPE.nativeObservation,false);assert.equal(PRIVATE_MODEL_INPUT_SCOPE.qualityValidation,false);
});
test('pure projector exactly matches actual authenticated reader without returning archived vectors or other rows',async()=>{
 const projected=projectPrivateModelTrainingInputsForTest(...fixtures());assert.deepEqual(projected,await loadPrivateModelTrainingInputs());
});
test('body bytes, declared length, extractor and title are bound independently of stored source hash',()=>{
 for(const change of [o=>{o.current.text='x'+o.current.text.slice(1);},o=>{o.current.characters=4095;},o=>{o.current.extractorVersion='invented';},o=>{o.title='Tetris';},o=>{o.current.sha256='a'.repeat(64);},o=>{o.url='https://example.test/foreign';}]){
  const values=fixtures();change(get(values[0],'real-train-01'));assert.throws(()=>projectPrivateModelTrainingInputsForTest(...values),/Fixed retained training input refused/);
 }
});
test('gold and eligibility must retain original TRAIN split, URL, group, root and input identity',()=>{
 for(const change of [v=>{v[2].cases.find(r=>r.id==='real-train-01').split='test';},v=>{v[2].cases.find(r=>r.id==='real-train-04').publicUrl='https://example.test/foreign';},v=>{v[1].eligibleTraining.find(r=>r.id==='real-train-01').sourceInputHash='a'.repeat(64);},v=>{v[1].eligibleTraining.find(r=>r.id==='real-train-04').groupId='foreign';},v=>{v[0].cases.find(r=>r.id==='real-train-01').split='calibration';},v=>{v[1].reusedInputHashes['../../../data/hierarchy-real-root-capture-adr138.traincal.json']='a'.repeat(64);}]){
  const values=fixtures();change(values);assert.throws(()=>projectPrivateModelTrainingInputsForTest(...values));
 }
});
test('original eight-field hash includes lead, decoded HTML identity and exact prune receipt',()=>{
 for(const change of [o=>{o.leadCandidate.sha256='b'.repeat(64);},o=>{o.htmlSha256='c'.repeat(64);},o=>{o.metadataPrune.removedAttributes++;},o=>{o.metadataPrune.experimental=false;},o=>{o.metadataPrune.productionValidated=true;},o=>{o.decodedHtmlSha256='d'.repeat(64);}]){
  const values=fixtures();change(get(values[0],'real-train-04'));assert.throws(()=>projectPrivateModelTrainingInputsForTest(...values));
 }
});
test('duplicate selected identities, missing outcomes and foreign packet phase refuse',()=>{
 for(const change of [v=>{v[0].capture.outcomes.push(get(v[0],'real-train-01'));},v=>{v[1].eligibleTraining=v[1].eligibleTraining.filter(r=>r.id!=='real-train-04');},v=>{v[0].phase='test';},v=>{v[0].currentOwnerDataRead=true;}]){const values=fixtures();change(values);assert.throws(()=>projectPrivateModelTrainingInputsForTest(...values));}
});
