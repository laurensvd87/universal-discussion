import test from 'node:test';
import assert from 'node:assert/strict';
import {parentConditionedChildTrainingArguments} from '../harness/retained-hierarchy-child-inputs.js';
const row=(id,split,expectedRootId,animals,koalas,video=false)=>({id,groupId:id,split,expectedRootId,labels:{animals,koalas,'video-games':video},vector:[id],language:'en'});
const fixture=()=>({representation:{representation:'paired-raw-e5-body-title-v1',representationHash:'a'.repeat(64)},rows:[
 row('animal','training','nature',true,false),row('plant','training','nature',false,false),row('unknown-animal','training','nature',null,null),
 row('koala','training','nature',true,true),row('software','training','technology',false,false),row('video','training','games',false,false,true),
 row('board','training','games',false,false),row('cal-animal','calibration','nature',true,false),row('cal-plant','calibration','nature',false,false),row('cal-software','calibration','technology',false,false)]});
test('parent training drops off-branch negatives but preserves CAL and every unknown label',()=>{
 const f=fixture(),out=parentConditionedChildTrainingArguments(f,'animals','parent-training');
 assert.deepEqual(out.trainingRows.map(r=>r.id),['animal','plant','unknown-animal','koala']);assert.deepEqual(out.calibrationRows.map(r=>r.id),['cal-animal','cal-plant','cal-software']);
 assert.equal(out.trainingRows.find(r=>r.id==='unknown-animal').label,null);assert.equal(out.trainingRows[0].vector,f.rows[0].vector);
});
test('fully parent-conditioned calibration cannot borrow an outside software negative',()=>{
 const out=parentConditionedChildTrainingArguments(fixture(),'animals','parent-training-and-calibration');
 assert.deepEqual(out.calibrationRows.map(r=>r.id),['cal-animal','cal-plant']);assert.equal(out.calibrationRows.filter(r=>r.label===false).length,1);
});
test('Koalas requires a known Animals parent; Games children retain both video and board games',()=>{
 const f=fixture(),koalas=parentConditionedChildTrainingArguments(f,'koalas','parent-training-and-calibration');
 assert.deepEqual(koalas.trainingRows.map(r=>r.id),['animal','koala']);assert.deepEqual(koalas.calibrationRows.map(r=>r.id),['cal-animal']);
 assert.deepEqual(parentConditionedChildTrainingArguments(f,'video-games','parent-training').trainingRows.map(r=>r.id),['video','board']);
 assert.throws(()=>parentConditionedChildTrainingArguments(f,'animals','root-predictions'));
 assert.throws(()=>parentConditionedChildTrainingArguments(f,'unknown','parent-training'));
});
