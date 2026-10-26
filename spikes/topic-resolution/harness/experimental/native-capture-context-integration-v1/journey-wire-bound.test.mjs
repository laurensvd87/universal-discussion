// SOURCE-only closed-family byte maximum. Not a constructor/ownership proof,
// native event observation, split-funding implementation or execution grant.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const previous=new URL('./wire-equivalence.test.mjs',import.meta.url);
assert.equal(sha(fs.readFileSync(previous)),'ee60635dc7a7f802eac03cab5db8279defba73bef503471d962b02ddd76abe73');
// This exact entry authenticates all128 frozen CODE before following imports.
// Its three reports remain separate byte-parity evidence, not this family proof.
await import('./wire-equivalence.test.mjs');
const prefix='../native-specificity-study-v19/';
const source=fs.readFileSync(new URL(prefix+'browser-capture.mjs',import.meta.url),'utf8');
assert.equal(sha(Buffer.from(source)),'beca0ad789a040dc206614f0795baca84c32d7f7b3eaf3244d20501a053b4501');
const {CODES:JOURNEY_CODES,REPLAY_CATEGORIES}=await import('../native-specificity-public-journey-v3/journey.mjs');
const {projectSpecificityCaptureDiagnostic}=await import('../native-specificity-study-v19/browser-capture.mjs');
const {SPECIFICITY_DRIVER_FAILURE_STAGES,createSpecificityDriverFailureBoundary}=await import('../native-specificity-study-v19/driver.mjs');
const start=source.indexOf('const FAILURE_CODES=Object.freeze({'),end=source.indexOf('const UNKNOWN_NETWORK_EVENTS=',start);
assert.ok(start>0&&end>start);
// Execute only authenticated fixed constant declarations and their literal Set
// additions. No model/data/capture/IO entry, arbitrary input or import is evaluated.
const failureCodes=Function('JOURNEY_CODES',"'use strict';\n"+source.slice(start,end)+'\nreturn FAILURE_CODES;')(JOURNEY_CODES);
function literalSet(name){
 const match=source.match(new RegExp('const '+name+'=new Set\\((\\[[^\\n]+\\])\\);'));assert.ok(match,name);
 return Function("'use strict';return "+match[1])();
}
const captureStages=literalSet('FAILURE_STAGES'),captureRpcs=literalSet('FAILURE_RPCS');
const phases=['prepare','train-cal','test'],sites=['reply','commit','response','lifecycle'],journeyPhases=['prepared','dispatched','resolved','retired'];
const lifecycleNames=[...REPLAY_CATEGORIES,'non-lifecycle','unavailable'];
const nominalPairs=Object.entries(failureCodes).flatMap(([family,codes])=>[...codes].map(code=>({family,code})));
const bytes=v=>Buffer.byteLength(JSON.stringify(v),'utf8');
const largest=(values,measure=bytes)=>values.reduce((a,b)=>measure(b)>measure(a)?b:a);
const worst={
 stage:largest(captureStages),rpc:largest(captureRpcs),primary:{family:'public-journey',code:largest(JOURNEY_CODES)},cleanup:largest(nominalPairs),
 journeyWitness:{site:largest(sites),phase:largest(journeyPhases),blankLoaderMatch:false,lifecycleName:largest(lifecycleNames),seenFactsMask:127}
};
function record(changes={}){return {schema:'native-specificity-capture-failure/v1',...worst,timerWitness:null,infrastructureWitness:null,networkWitness:null,operationWitness:null,ownerNavigationWitness:null,navigationAccountingWitness:null,...changes};}
function checked(changes={}){return projectSpecificityCaptureDiagnostic(record(changes));}

test('proposed split public-journey maximum factors actual closed primary cleanup stage and RPC domains',()=>{
 assert.equal(JOURNEY_CODES.length,27);assert.equal(nominalPairs.length,207);assert.equal(captureStages.length,22);assert.equal(captureRpcs.length,39);
 const maximum=bytes(checked());assert.equal(maximum,585);
 // Each independent field's entire authenticated finite domain is bounded by
 // its selected maximizer. This is additive JSON byte accounting, not sampling
 // of the enormous Cartesian product of unrelated fields.
 for(const code of JOURNEY_CODES)assert.ok(bytes(checked({primary:{family:'public-journey',code}}))<=maximum);
 for(const cleanup of [null,...nominalPairs])assert.ok(bytes(checked({cleanup}))<=maximum);
 for(const stage of captureStages)assert.ok(bytes(checked({stage}))<=maximum);
 for(const rpc of [null,...captureRpcs])assert.ok(bytes(checked({rpc}))<=maximum);
 for(const value of [...JOURNEY_CODES,...captureStages,...captureRpcs,...sites,...journeyPhases,...lifecycleNames])assert.match(value,/^[A-Za-z0-9_.:-]+$/u);
 // Only the journey witness can coexist with this first-primary family. The
 // other six fields cannot enlarge the family by borrowing incompatible data.
 const incompatible={
  timerWitness:{lane:'ordinary',rpc:'Page.navigate'},
  infrastructureWitness:{schema:'native-infrastructure-identity-witness/v1',site:'created',role:'ui-root',predicate:'attached'},
  networkWitness:{schema:'native-network-observation-witness/v1',event:'response',scheme:'https',resourceType:'Image',frameRelation:'main',loaderRelation:'main'},
  operationWitness:{lane:'ordinary',rpc:'Page.navigate',kind:'sync-throw',cause:{family:'unclassified',code:'unclassified'}},
  ownerNavigationWitness:{schema:'native-article-navigation-witness/v1',predicate:'pending',state:'unexamined',urlRelation:'unexamined'},
  navigationAccountingWitness:{schema:'native-main-navigation-observation/v1',site:'read',state:'active',balance:'matched',urlRelation:'not-examined'}
 };
 for(const [key,value]of Object.entries(incompatible))assert.throws(()=>checked({[key]:value}),{code:'diagnostic-contract'});
});

test('proposed split public-journey maximum exhausts every legal witness combination including all128 masks',()=>{
 let maximum=0,count=0;
 for(const site of sites)for(const phase of journeyPhases)for(const blankLoaderMatch of [null,true,false])for(const lifecycleName of lifecycleNames)
 for(let seenFactsMask=0;seenFactsMask<=127;seenFactsMask++){
  const size=bytes(checked({journeyWitness:{site,phase,blankLoaderMatch,lifecycleName,seenFactsMask}}));assert.ok(size<=585);maximum=Math.max(maximum,size);count++;
 }
 assert.equal(bytes(checked({journeyWitness:null}))<=maximum,true);
 assert.equal(maximum,585);assert.equal(count,92160);
 process.stdout.write(JSON.stringify({scope:'closed-public-journey-byte-bound-only',allWitnessCombinations:count,primaryCodes:27,cleanupNominals:207,maximumCaptureBytes:maximum,constructorOwnershipProved:false})+'\n');
});

test('proposed split public-journey exact wire max695 supports2560 arithmetic but not a transport ownership claim',async()=>{
 const capture=checked(),original=Object.freeze({invented:true});let maximum=0,count=0;
 for(const phase of phases)for(const stage of SPECIFICITY_DRIVER_FAILURE_STAGES){
  let reference;const boundary=createSpecificityDriverFailureBoundary({phase,emitFailure:line=>{reference=line;},captureDiagnostic:()=>JSON.stringify(capture)});boundary.mark(stage);
  await assert.rejects(boundary.run(()=>Promise.reject(original)),error=>error===original);
  const text=JSON.stringify({schema:'native-specificity-execution-failure/v1',phase,stage,capture}),size=Buffer.byteLength(text,'utf8');
  assert.equal(size-85-phase.length-stage.length,585);const packet=Buffer.alloc(size+1);
  assert.equal(packet.write(text,0,size,'utf8'),size);packet[size]=10;assert.deepEqual(packet,reference);
  assert.equal(packet.buffer.byteLength,packet.length);assert.equal(packet.byteOffset,0);maximum=Math.max(maximum,packet.length);count++;
 }
 assert.equal(count,72);assert.equal(maximum,695);
 // Conservative logical arithmetic: all text remains live at write; wire
 // includes LF. Graph512 and context holder256 are ADDITIONAL reservations.
 assert.equal(3*maximum+288,2373);assert.ok(3*maximum+288<=2560);
 process.stdout.write(JSON.stringify({maximumPublicJourneyWireBytes:maximum,conservativeTextEnvelopeBufferScratchBytes:2373,proposedTransportCharge:2560,graphAndHolderAreAdditional:true,allLiveProof:false})+'\n');
});
