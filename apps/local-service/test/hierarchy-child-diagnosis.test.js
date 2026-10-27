import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseStaticHtml} from '../src/crawler/static-capture.js';
import {runHierarchyChildDiagnosisForTest,checkHierarchyChildDiagnosisSource,projectHierarchyChildDiagnosisRow,main} from '../harness/run-hierarchy-child-diagnosis.js';
const IDS=['child-train-01','child-cal-01'];
function fixture({captureFailure=-1,saveFailure=null,endChanged=false}={}){
 const saved=new Map(),calls=[];let pinReads=0,created=false;
 const ports={sourcePins:async()=>({source:{bytes:1,sha256:++pinReads>1&&endChanged?'b'.repeat(64):'a'.repeat(64)}}),now:()=>0,
  createOutput:async()=>{assert.equal(created,false);created=true;},
  save:async(name,value)=>{if(name===saveFailure)throw false;assert.equal(saved.has(name),false);saved.set(name,structuredClone(value));return {file:name,bytes:1,sha256:'c'.repeat(64)};},
  createCapture:()=>({capture:async id=>{const index=calls.length;calls.push(id);if(index===captureFailure)throw false;
   return {id,status:'diagnosed',reason:index===0?'insufficient-text':'document-invalid',parserDiagnostic:diagnoseStaticHtml(index===0?'<main>short</main>':'<article a="','https://public.example/')};},
   snapshot:()=>({attempted:calls.length,requests:6,maxRequests:6})})};
 return {ports,saved,calls};
}
test('source check is inert and pins the fixed two-subject six-request diagnosis',async()=>{
 assert.deepEqual(await checkHierarchyChildDiagnosisSource(),{sourceFiles:13,declared:2,maxRequests:6,testPermitted:false,outputCreated:false});
 assert.equal(await main(['--run','--url','https://foreign.example/']),2);assert.equal(await main([]),2);
});
test('both finite diagnostic rows persist with separate start/end pins and a result-last complete roster',async()=>{
 const f=fixture(),result=await runHierarchyChildDiagnosisForTest(f.ports),proof=f.saved.get('result.json');assert.equal(result.status,'completed');
 assert.deepEqual(f.calls,IDS);assert.deepEqual(proof.rows.map(row=>row.id),IDS);assert.equal(f.saved.size,5);assert.equal([...f.saved.keys()].at(-1),'result.json');
 assert.equal(proof.counts.diagnosed,2);assert.equal(proof.endPinsChecked,true);assert.equal(proof.scope.testComposition,true);assert.equal(proof.scope.availabilityAdoption,false);
 for(const key of ['encoderUsed','fittingExecuted','testCaptured','ingestionExecuted','assignmentAuthority'])assert.equal(proof.scope[key],false);
 for(const value of ['https://public.example','<article','<main>','short'])assert.equal(JSON.stringify(proof).includes(value),false);
});
test('current falsy capture failure retains the full two-row roster and never retries the remaining subject',async()=>{
 const f=fixture({captureFailure:0}),result=await runHierarchyChildDiagnosisForTest(f.ports),proof=f.saved.get('result.json');assert.equal(result.status,'failed');
 assert.deepEqual(proof.failure,{stage:'capture',currentId:IDS[0]});assert.equal(f.calls.length,1);assert.equal(proof.rows.length,2);
 assert.equal(proof.rows[0].status,'failed');assert.equal(proof.rows[1].status,'not-attempted');assert.equal(proof.counts.notAttempted,1);assert.equal(proof.endPinsChecked,true);
});
test('case write or end-pin failure cannot count as completed and preserves the first failure',async()=>{
 const f=fixture({saveFailure:'child-train-01.json',endChanged:true});await runHierarchyChildDiagnosisForTest(f.ports);
 const proof=f.saved.get('result.json');assert.equal(proof.status,'failed');assert.deepEqual(proof.failure,{stage:'case-output',currentId:IDS[0]});assert.equal(proof.endPinsChecked,false);
 assert.equal(proof.rows.length,2);assert.equal(f.calls.length,1);assert.equal(f.saved.get('end-pins.json').endPinsChecked,false);
});
test('reused fixed output refuses before collector construction or network work',async()=>{
 const f=fixture();f.ports.createOutput=async()=>{throw false;};f.ports.createCapture=()=>assert.fail('No network constructor');
 await assert.rejects(runHierarchyChildDiagnosisForTest(f.ports));assert.equal(f.saved.size,0);assert.equal(f.calls.length,0);
});
test('strict finite projection rejects content fields, unknown codes, getters and proxy hooks',()=>{
 const row={id:IDS[0],status:'diagnosed',reason:'insufficient-text',parserDiagnostic:diagnoseStaticHtml('short','https://public.example/')};
 assert.equal(projectHierarchyChildDiagnosisRow(row,IDS[0]).reason,'insufficient-text');
 for(const changed of [{...row,text:'secret'},{...row,url:'https://private.example/'},{...row,reason:'secret'},
  {...row,parserDiagnostic:{...row.parserDiagnostic,summary:{...row.parserDiagnostic.summary,text:'secret'}}}])assert.throws(()=>projectHierarchyChildDiagnosisRow(changed,IDS[0]));
 const invalid=structuredClone(row);invalid.parserDiagnostic.summary.tokens=100002;assert.throws(()=>projectHierarchyChildDiagnosisRow(invalid,IDS[0]));
 assert.throws(()=>projectHierarchyChildDiagnosisRow(row,'child-test-01'));
 let hooks=0;const getter={...row};Object.defineProperty(getter,'parserDiagnostic',{enumerable:true,get(){hooks++;return row.parserDiagnostic;}});
 assert.throws(()=>projectHierarchyChildDiagnosisRow(getter,IDS[0]));assert.equal(hooks,0);
 assert.throws(()=>projectHierarchyChildDiagnosisRow(new Proxy(row,{get(){hooks++;}}),IDS[0]));assert.equal(hooks,0);
});
