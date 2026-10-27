import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runHierarchyChildCaptureForTest,checkHierarchyChildCaptureSource} from '../harness/run-hierarchy-child-capture.js';
const corpus=JSON.parse(readFileSync(new URL('../harness/hierarchy-child-corpus.json',import.meta.url),'utf8'));
const probes=corpus.freshCandidates.filter(r=>r.split!=='test');
const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture({captureFailure=-1,outputFailure=null,endChanged=false}={}){
 const saved=new Map(),calls=[];let index=0,pinReads=0,created=false;
 const ports={now:()=>1,sourcePins:async()=>({source:{bytes:1,sha256:++pinReads>1&&endChanged?'b'.repeat(64):'a'.repeat(64)}}),readCorpus:async()=>corpus,
 createOutput:async()=>{assert.equal(created,false);created=true;},
 save:async(name,value)=>{if(name===outputFailure)throw false;assert.equal(saved.has(name),false);saved.set(name,structuredClone(value));const raw=JSON.stringify(value);return {file:name,bytes:Buffer.byteLength(raw),sha256:hash(raw)};},
 createCapture:()=>({capture:async id=>{calls.push(id);const row=probes[index++];assert.equal(id,row.id);if(index-1===captureFailure)throw false;if(index===2)return {id,url:row.url,status:'unavailable',reason:'robots-denied'};return {id,url:row.url,status:'available',title:'Public title',text:'Public body',extractorVersion:'crawler-static-html-prefix/v1',responseSha256:'a'.repeat(64),htmlTextSha256:'b'.repeat(64),titleSha256:hash('Public title'),bodySha256:hash('Public body'),rightsEvidenceHash:'c'.repeat(64),sourceInputHash:'d'.repeat(64),provenance:'fresh-public-crawler-static-html-paired-observation/v1',nativeObservation:false,productionValidated:false,assignmentAuthority:false,html:'MUST NOT RETAIN'};},snapshot:()=>({attempted:calls.length,requests:21,maxRequests:34,deadline:240000})})};
 return {ports,saved,calls};
}
test('inert source check reads fixed12 files and no TEST/output or network is opened',async()=>{
 const result=await checkHierarchyChildCaptureSource();assert.deepEqual(result,{sourceFiles:12,declared:11,testPermitted:false,outputCreated:false});
});
test('capture-only command retains all11 exact TRAIN/CAL outcomes and writes manifest last',async()=>{
 const f=fixture(),result=await runHierarchyChildCaptureForTest(f.ports),proof=f.saved.get('result.json');
 assert.equal(result.status,'completed');assert.deepEqual(f.calls,probes.map(p=>p.id));assert.equal(proof.rows.length,11);assert.equal(proof.counts.available,10);assert.equal(proof.counts.unavailable,1);assert.equal(proof.counts.attempted,11);assert.equal(proof.endPinsChecked,true);
 assert.equal([...f.saved.keys()].at(-1),'result.json');assert.equal(f.saved.size,13);
 for(const row of proof.rows){assert.equal(row.split==='training'||row.split==='calibration',true);assert.equal(Object.hasOwn(row,'html'),false);}
 assert.equal(proof.scope.encoderUsed,false);assert.equal(proof.scope.fittingExecuted,false);assert.equal(proof.scope.testCaptured,false);assert.equal(proof.scope.assignmentAuthority,false);
});
test('falsy current failure and suffix output failure preserve original stage and full11 roster',async()=>{
 const f=fixture({captureFailure:2,outputFailure:'child-cal-03.json'}),result=await runHierarchyChildCaptureForTest(f.ports),proof=f.saved.get('result.json');
 assert.equal(result.status,'failed');assert.deepEqual(proof.failure,{stage:'capture',currentId:'child-cal-01'});assert.equal(f.calls.length,3);assert.equal(proof.rows.length,11);assert.equal(proof.rows[2].status,'failed');assert.ok(proof.rows.slice(3).every(r=>r.status==='not-attempted'));assert.equal(proof.counts.notAttempted,8);
 assert.equal(new Set(proof.rows.map(r=>r.id)).size,11);assert.equal(proof.endPinsChecked,true);
});
test('case persistence failure stops new captures and changed source pins cannot yield completed',async()=>{
 const f=fixture({outputFailure:'child-train-01.json'});await runHierarchyChildCaptureForTest(f.ports);assert.equal(f.calls.length,1);assert.equal(f.saved.get('result.json').failure.stage,'case-output');assert.equal(f.saved.get('result.json').rows.length,11);
 const g=fixture({endChanged:true});await runHierarchyChildCaptureForTest(g.ports);assert.equal(g.saved.get('result.json').status,'failed');assert.equal(g.saved.get('result.json').failure.stage,'end-pins');assert.equal(g.saved.get('result.json').endPinsChecked,false);
});
test('existing fixed output refuses before collector construction or capture',async()=>{
 const f=fixture();f.ports.createOutput=async()=>{throw false;};let constructed=false;f.ports.createCapture=()=>{constructed=true;throw false;};await assert.rejects(runHierarchyChildCaptureForTest(f.ports));assert.equal(constructed,false);assert.equal(f.calls.length,0);assert.equal(f.saved.size,0);
});
