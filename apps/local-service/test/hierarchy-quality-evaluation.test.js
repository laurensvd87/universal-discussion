import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {evaluateHierarchyPublicProbe} from '../harness/hierarchy-quality-evaluation.js';

const modelId='e5-small-q8-browser-main-prefix-v1',axis=i=>Array.from({length:384},(_,j)=>i===j?1:0),sha=s=>createHash('sha256').update(s).digest('hex');
const probes=Array.from({length:32},(_,i)=>({id:'invented-'+i,groupId:'invented-group-'+i,url:'https://example.org/invented/'+i,rootId:'games',labelScope:'root-only'}));
const text='Invented public observation text used only for this pure orchestration test. '.repeat(4);
function fixture(probe,{failureStage,modelMismatch}={}){
 let time=0,embedCalls=0;const calls={capture:0,initialize:0,embed:[],score:0};
 const page={id:probe.id,url:probe.url,status:'available',title:'Invented title',text,extractorVersion:'crawler-static-html-prefix/v1',
  responseSha256:'a'.repeat(64),htmlTextSha256:'b'.repeat(64),rightsEvidenceHash:'c'.repeat(64),sourceInputHash:'d'.repeat(64),provenance:'invented-observation-for-pure-test'};
 const capture={async capture(id){calls.capture++;assert.equal(id,probe.id);if(failureStage==='capture')throw false;return page;}};
 const getEmbedder=async()=>{calls.initialize++;if(failureStage==='encoder-initialization')throw new Error('PRIVATE initialization failure');return {async embed(input){
  calls.embed.push(input);const stage=embedCalls++===0?'body-encoding':'title-encoding';if(failureStage===stage)throw new Error('PRIVATE '+stage);
  return {modelId:modelMismatch===stage?'wrong-model':modelId,values:axis(stage==='body-encoding'?0:1)};
 }};};
 const methods={classify(input){calls.score++;assert.equal(input.sourceVersion,page.sourceInputHash);assert.deepEqual(input.bodyVector,axis(0));assert.deepEqual(input.titleVector,axis(1));if(failureStage==='scoring')throw null;return {invented:true};}};
 return {options:{probe,capture,getEmbedder,methods,now:()=>time++},calls,page};
}
function assertObservation(row,f){
 assert.equal(row.captureStatus,'available');assert.equal(row.title,f.page.title);assert.equal(row.titleCharacters,f.page.title.length);assert.equal(row.bodyCharacters,text.length);
 assert.equal(row.bodyHash,sha(text));assert.equal(row.titleHash,sha(f.page.title));assert.equal(row.observation.sourceInputHash,f.page.sourceInputHash);
 assert.equal(row.sourceVersion,f.page.sourceInputHash);assert.equal(row.observation.nativeObservation,false);
 assert.equal(Object.hasOwn(row,'text'),false);assert.equal(Object.hasOwn(row,'body'),false);assert.equal(JSON.stringify(row).includes('PRIVATE'),false);
}

test('successful orchestration retains the same observation and numeric vectors with stage timings',async()=>{
 const f=fixture(probes[0]),result=await evaluateHierarchyPublicProbe(f.options);assert.equal(result.fatal,false);assert.equal(result.row.evaluationStatus,'scored');assertObservation(result.row,f);
 assert.deepEqual(result.row.bodyVector,axis(0));assert.deepEqual(result.row.titleVector,axis(1));assert.equal(result.row.modelId,modelId);
 for(const field of ['captureMilliseconds','initializationMilliseconds','bodyMilliseconds','titleMilliseconds','matchingMilliseconds'])assert.equal(result.row[field],1);
 assert.deepEqual(f.calls,{capture:1,initialize:1,embed:[text,f.page.title],score:1});
});

test('every fatal stage preserves the attempted current row and leaves exactly the later cohort rows untouched',async()=>{
 for(const failureStage of ['encoder-initialization','body-encoding','title-encoding','scoring']){
  const rows=[],fixtures=[];let stopped=false;
  for(const [index,probe] of probes.entries()){
   if(stopped){rows.push({id:probe.id,captureStatus:'not-attempted'});continue;}
   const f=fixture(probe,{failureStage:index===2?failureStage:undefined});fixtures.push(f);
   const result=await evaluateHierarchyPublicProbe(f.options);rows.push(result.row);if(result.fatal)stopped=true;
  }
  assert.equal(rows.length,32);assert.equal(new Set(rows.map(r=>r.id)).size,32);assert.equal(fixtures.length,3);
  const current=rows[2],f=fixtures[2];assertObservation(current,f);assert.equal(current.attempted,true);assert.equal(current.evaluationStatus,'failed');assert.equal(current.failureStage,failureStage);
  assert.ok(rows.slice(3).every(r=>r.captureStatus==='not-attempted'));assert.ok(fixtures.every(x=>x.calls.capture===1&&x.calls.initialize===1));
  assert.equal(current.initializationMilliseconds,1);
  if(failureStage!=='encoder-initialization')assert.equal(current.bodyMilliseconds,1);
  if(['title-encoding','scoring'].includes(failureStage)){assert.deepEqual(current.bodyVector,axis(0));assert.equal(current.titleMilliseconds,1);}
  if(failureStage==='scoring'){assert.deepEqual(current.titleVector,axis(1));assert.equal(current.matchingMilliseconds,1);}
 }
});

test('body and title model mismatch fail at their exact stage without scoring or retry',async()=>{
 for(const stage of ['body-encoding','title-encoding']){
  const f=fixture(probes[0],{modelMismatch:stage}),result=await evaluateHierarchyPublicProbe(f.options);assertObservation(result.row,f);
  assert.equal(result.fatal,true);assert.equal(result.row.failureStage,stage);assert.equal(f.calls.capture,1);assert.equal(f.calls.initialize,1);assert.equal(f.calls.score,0);
  assert.equal(f.calls.embed.length,stage==='body-encoding'?1:2);if(stage==='title-encoding')assert.deepEqual(result.row.bodyVector,axis(0));
 }
});

test('capture unavailability is not fatal and a thrown capture remains attempted',async()=>{
 const f=fixture(probes[0]);f.options.capture={async capture(){return {...f.page,status:'unavailable',reason:'robots-denied'};}};
 const absent=await evaluateHierarchyPublicProbe(f.options);assert.equal(absent.fatal,false);assert.equal(absent.row.captureStatus,'unavailable');assert.equal(absent.row.captureReason,'robots-denied');assert.equal(absent.row.evaluationStatus,'capture-unavailable');assert.equal(f.calls.initialize,0);
 const g=fixture(probes[1],{failureStage:'capture'}),failed=await evaluateHierarchyPublicProbe(g.options);assert.equal(failed.fatal,true);assert.equal(failed.row.captureStatus,'attempted');assert.equal(failed.row.failureStage,'capture');assert.equal(failed.row.captureMilliseconds,1);assert.equal(g.calls.initialize,0);
});

test('invalid returned numeric vectors fail before title encoding or scoring without normalization',async()=>{
 for(const values of [Array(384).fill(0),axis(0).slice(1),[NaN,...axis(0).slice(1)],axis(0).map(x=>x*2)]){
  const f=fixture(probes[0]);f.options.getEmbedder=async()=>({async embed(){return {modelId,values};}});
  const result=await evaluateHierarchyPublicProbe(f.options);assert.equal(result.fatal,true);assert.equal(result.row.failureStage,'body-encoding');assertObservation(result.row,f);assert.equal(f.calls.score,0);assert.equal(Object.hasOwn(result.row,'bodyVector'),false);
 }
});
