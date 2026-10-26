// ADR214 test-only proposed single-envelope wire oracle. No production emitter,
// lease, authority or all-live allocation proof is supplied by this fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const old='spikes/topic-resolution/harness/experimental/native-specificity-study-v19/';
const sha=b=>createHash('sha256').update(b).digest('hex');
const list=fs.readFileSync(old+'source-paths.js'),map=fs.readFileSync(old+'reviewed-sources-r3.json');
assert.equal(sha(list),'f806aafcb5e41e83853e09b4efe930737d068d6a6cca86401cafc97390354c29');
assert.equal(sha(map),'9da490a224e59feaca9a959ff1a8d68684ca2f49930fbb2125fb68a90adff1c0');
const paths=JSON.parse(list.toString().match(/export const SOURCE_PATHS=Object\.freeze\((\[[\s\S]*?\])\);/)[1]),hashes=JSON.parse(map).sourceHashes;
assert.equal(paths.length,128);assert.deepEqual(paths,[...new Set(paths)].sort());assert.deepEqual(paths,Object.keys(hashes));
for(const p of paths){assert.match(p,/^(?!.*(?:\.\.|\\|\/\.))[A-Za-z0-9_./-]+$/);assert.equal(sha(fs.readFileSync(p)),hashes[p],p);}
const {projectSpecificityCaptureDiagnostic}=await import('../native-specificity-study-v19/browser-capture.mjs');
const {createSpecificityDriverFailureBoundary,SPECIFICITY_DRIVER_FAILURE_STAGES}=await import('../native-specificity-study-v19/driver.mjs');
const stringify=JSON.stringify,alloc=Buffer.alloc,write=Buffer.prototype.write,byteLength=Buffer.byteLength;
const schema='native-specificity-execution-failure/v1',phases=['prepare','train-cal','test'];
let allocations=0;
function proposedSingleEnvelope(capture,phase,stage){
 assert.ok(phases.includes(phase)&&SPECIFICITY_DRIVER_FAILURE_STAGES.includes(stage));
 // One authored envelope, one JSON text and one exact unpooled output Buffer.
 // This function is ONLY a byte-equivalence experiment, not capture provenance.
 const envelope={schema,phase,stage,capture};
 const text=stringify(envelope),size=byteLength(text,'utf8');
 const captureBytes=size-85-phase.length-stage.length;
 assert.ok(captureBytes>=4&&captureBytes<=700);assert.ok(size+1<=900);
 allocations++;const packet=alloc(size+1);
 assert.equal(write.call(packet,text,0,size,'utf8'),size);packet[size]=10;
 return packet;
}
function diagnostic(fields={}){return {schema:'native-specificity-capture-failure/v1',stage:'article-retirement',rpc:'Page.setLifecycleEventsEnabled',
 primary:{family:'unclassified',code:'unclassified'},cleanup:{family:'control-unavailable',code:'origin-representation-unavailable'},journeyWitness:null,timerWitness:null,infrastructureWitness:null,networkWitness:null,operationWitness:null,ownerNavigationWitness:null,navigationAccountingWitness:null,...fields};}
function examples(){
 const cases=[diagnostic(),
  diagnostic({primary:{family:'public-journey',code:'continuation-rejected'},journeyWitness:{site:'lifecycle',phase:'dispatched',blankLoaderMatch:false,lifecycleName:'firstMeaningfulPaintCandidate',seenFactsMask:127}}),
  diagnostic({primary:{family:'capture',code:'rpc-deadline'},timerWitness:{lane:'cleanup',rpc:'Page.setLifecycleEventsEnabled'}}),
  diagnostic({primary:{family:'startup',code:'infrastructure-identity'},infrastructureWitness:{schema:'native-infrastructure-identity-witness/v1',site:'created',role:'ui-root',predicate:'duplicate-created'}}),
  diagnostic({primary:{family:'capture',code:'unknown-network-response'},networkWitness:{schema:'native-network-observation-witness/v1',event:'response',scheme:'unavailable',resourceType:'CSPViolationReport',frameRelation:'unavailable',loaderRelation:'unavailable'}}),
  diagnostic({primary:{family:'capture',code:'client-operation'},operationWitness:{lane:'cleanup',rpc:'Page.setLifecycleEventsEnabled',kind:'promise-rejection',cause:{family:'control-unavailable',code:'origin-representation-unavailable'}}}),
  diagnostic({primary:{family:'article-owner',code:'article-navigation'},ownerNavigationWitness:{schema:'native-article-navigation-witness/v1',predicate:'target',state:'absent',urlRelation:'unavailable'}})];
 for(const site of ['fresh','within','public','read','seal','retire'])for(const state of ['active','sealed','retiring','released','unavailable'])
 for(const balance of ['matched','unmatched','unavailable'])for(const urlRelation of ['not-examined','exact','different','blank','unavailable']){
  try{cases.push(projectSpecificityCaptureDiagnostic(diagnostic({navigationAccountingWitness:{schema:'native-main-navigation-observation/v1',site,state,balance,urlRelation}})));}catch{}
 }
 // The frozen capture validator intentionally does NOT admit these six views.
 // They are ADR213 modeled data for byte transport only, not candidate coverage.
 const tuples=[['cdp-frame','main','main',null],['cdp-frame','parent-absent','nonmain',null],['cdp-frame','parent-mismatch','child',null],['cdp-within','main','main',null],['playwright','main-detached','unexamined',true],['playwright','main','main',false]];
 const legal=cases.map(projectSpecificityCaptureDiagnostic);
 for(const [site,predicate,frameRelation,mainDetached]of tuples)legal.push(diagnostic({primary:{family:'capture',code:'terminal-frame-navigation'},navigationAccountingWitness:{schema:'native-terminal-navigation-observation/v1',site,predicate,frameRelation,mainDetached}}));
 assert.equal(legal.length,109);return legal;
}

test('ADR214 proposed single-envelope bytes equal the unchanged legacy boundary for109 DTOs and every driver phase/stage',async()=>{
 const original=Object.freeze({invented:true});let count=0,maximum=0;
 for(const capture of examples())for(const phase of phases)for(const stage of SPECIFICITY_DRIVER_FAILURE_STAGES){
  let reference;const boundary=createSpecificityDriverFailureBoundary({phase,emitFailure:bytes=>{reference=bytes;},captureDiagnostic:()=>stringify(capture)});boundary.mark(stage);
  await assert.rejects(boundary.run(()=>Promise.reject(original)),error=>error===original);
  const proposed=proposedSingleEnvelope(capture,phase,stage);assert.deepEqual(proposed,reference);
  assert.equal(proposed.buffer.byteLength,proposed.length);assert.equal(proposed.byteOffset,0);
  assert.ok(proposed.length<=900);assert.ok(proposed.length+31<=1024);maximum=Math.max(maximum,proposed.length);count++;
 }
 assert.equal(count,109*3*SPECIFICITY_DRIVER_FAILURE_STAGES.length);
 process.stdout.write(JSON.stringify({oracle:'ADR214-single-envelope-wire',comparisons:count,maximumWireBytes:maximum,allocationOwnershipProved:false})+'\n');
});

test('ADR214 scalar85-byte overhead derives exact capture UTF8 even for escaped Unicode modeled data',()=>{
 assert.equal(byteLength(stringify({schema,phase:'',stage:'',capture:null}))-4,85);
 // These are intentionally NOT legal capture DTOs. They test JSON arithmetic,
 // escaping and UTF8 handling only, never validation or publication authority.
 for(const capture of [null,{note:'漢字😀'},{note:'quote" slash\\ newline\n lone\ud800'},{number:-0,list:[null,true,false,0,1.5]}])
 for(const phase of phases)for(const stage of SPECIFICITY_DRIVER_FAILURE_STAGES){
  const output=proposedSingleEnvelope(capture,phase,stage),text=stringify({schema,phase,stage,capture});
  assert.equal(byteLength(text)-85-phase.length-stage.length,byteLength(stringify(capture)));
  assert.deepEqual(output,Buffer.from(text+'\n','utf8'));
 }
});

test('ADR214 proposed oversize refusal precedes Buffer allocation',()=>{
 const before=allocations;assert.throws(()=>proposedSingleEnvelope({note:'x'.repeat(701)},'train-cal','browser-capture'));assert.equal(allocations,before);
});
