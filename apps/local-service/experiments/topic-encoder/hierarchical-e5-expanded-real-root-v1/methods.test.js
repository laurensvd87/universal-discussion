import test from 'node:test';
import assert from 'node:assert/strict';
import {CANDIDATE_ORDER,workPreflight,selectCandidate,compileDualRepresentationGate,describeDualRepresentationGate,applyDualRepresentationGate,inputConstructionIdentity,partialPrefixAgreement,requireCompleteExpansion,encodingViews} from './methods.js';
const H='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64);
const definition=()=>({inputConstructionHash:H,inputView:'current-static',rootModelSha256:H,rootPolicySha256:B,rootRepresentationHash:B,
 detailModelSha256:C,detailPolicySha256:C,detailRepresentationHash:C});
const decision=(path,side,overrides={})=>({sourceId:'synthetic',sourceVersion:'version-1',sourceInputHash:H,inputView:'current-static',inputConstructionHash:H,
 modelSha256:side==='root'?H:C,policySha256:side==='root'?B:C,representationHash:side==='root'?B:C,path,...overrides});
test('separately represented root and detail agree, without inventing descendants',()=>{
 const h=compileDualRepresentationGate(definition()),r=applyDualRepresentationGate(h,{root:decision(['games'],'root'),detail:decision(['games','gta'],'detail')});
 assert.deepEqual(r.selectedPath,['games','gta']);assert.equal(r.assignmentAuthority,false);assert.ok(Object.isFrozen(r.selectedPath));
});
test('wrong detail root, absent detail, and absent root retain only independently supported root',()=>{
 const h=compileDualRepresentationGate(definition());
 for(const dp of [[],['nature','animals']])assert.deepEqual(applyDualRepresentationGate(h,{root:decision(['games'],'root'),detail:decision(dp,'detail')}).selectedPath,['games']);
 assert.deepEqual(applyDualRepresentationGate(h,{root:decision([],'root'),detail:decision(['games','gta'],'detail')}).selectedPath,[]);
});
test('full source, construction, body view, representation and artifact witnesses fence composition',()=>{
 const h=compileDualRepresentationGate(definition());
 for(const [key,value]of [['sourceId','different'],['sourceVersion','v2'],['sourceInputHash',B],['inputView','wikipedia-prose-lead'],['inputConstructionHash',B],
 ['representationHash',B],['modelSha256',B],['policySha256',B]]){
 assert.throws(()=>applyDualRepresentationGate(h,{root:decision(['games'],'root'),detail:decision(['games','gta'],'detail',{[key]:value})}));}
});
test('private definition copies, accessor/proxy refusal and malformed paths',()=>{
 const d=definition(),h=compileDualRepresentationGate(d);d.rootModelSha256=B;
 assert.equal(describeDualRepresentationGate(h).rootModelSha256,H);
 let calls=0;const bad=definition();Object.defineProperty(bad,'inputView',{enumerable:true,get(){calls++;throw Error('getter');}});
 assert.throws(()=>compileDualRepresentationGate(bad));assert.equal(calls,0);
 assert.throws(()=>compileDualRepresentationGate(new Proxy(definition(),{})));
 for(const path of [['games','games'],Array(9).fill('x'),[''],new Proxy(['games'],{})]){
 assert.throws(()=>applyDualRepresentationGate(h,{root:decision(['games'],'root'),detail:decision(path,'detail')}));}
 assert.throws(()=>applyDualRepresentationGate(h,{root:decision(['games','gta'],'root'),detail:decision(['games'],'detail')}));
});
test('six-candidate selection prioritizes accepted correct then raw discrimination then declared order',()=>{
 const rows=CANDIDATE_ORDER.map(([inputView,bodyWeight])=>({inputView,bodyWeight,acceptedCorrect:20,rawCorrect:30}));
 assert.equal(selectCandidate(rows),rows[0]);rows[5].rawCorrect=31;assert.equal(selectCandidate(rows),rows[5]);
 rows[1].acceptedCorrect=21;assert.equal(selectCandidate(rows),rows[1]);assert.throws(()=>selectCandidate(rows.slice(1)));
});
test('aggregate preflight includes six training runs, all CAL score products and both final representations',()=>{
 const p=workPreflight();assert.ok(p.trainingWork<80000000);assert.equal(p.scoringCoordinateProducts,(6*48*16+32*(16+63))*384);
 assert.equal(p.fusionCoordinateVisits,6*176*384*8+32*384*16);assert.ok(p.rankWork>=6*48*16*8+32*16*8);
 assert.throws(()=>workPreflight(129));assert.throws(()=>workPreflight(128,49));
});
test('construction identity changes for view, weight, actual root representation and reused packet identity',()=>{
 const f={detailRepresentationHash:C,encoderHash:H,protocolSha256:H,captureSourceHashes:{a:H},reusedInputHashes:{b:B},
 sourceHashes:{'../../../src/domain/hierarchical-e5-paired-input.js':H,'../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js':H,'../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json':H}};
 const first=inputConstructionIdentity(f,'current-static',.75,B);
 assert.notEqual(first,inputConstructionIdentity(f,'wikipedia-prose-lead',.75,B));
 assert.notEqual(first,inputConstructionIdentity(f,'current-static',.5,C));
 assert.notEqual(first,inputConstructionIdentity({...f,reusedInputHashes:{b:C}},'current-static',.75,B));
});
test('partial positive prefixes reject known sibling divergence, not invent child negatives',()=>{
 const scope={supportedPathPrefix:['technology','engineering'],maximumSpecificityKnown:false};
 assert.equal(partialPrefixAgreement({...scope,selectedPath:[]}).outcome,'unresolved');
 assert.equal(partialPrefixAgreement({...scope,selectedPath:['technology']}).outcome,'safe-broader');
 assert.equal(partialPrefixAgreement({...scope,selectedPath:['technology','engineering']}).outcome,'known-prefix-satisfied');
 assert.equal(partialPrefixAgreement({...scope,selectedPath:['technology','computing']}).outcome,'incompatible-known-prefix');
 const deeper=partialPrefixAgreement({...scope,selectedPath:['technology','engineering','bridges']});
 assert.equal(deeper.outcome,'known-prefix-satisfied');assert.deepEqual(deeper.unscoredDescendants,['bridges']);
 assert.deepEqual(partialPrefixAgreement({...scope,maximumSpecificityKnown:true,selectedPath:['technology','engineering','bridges']}).unscoredDescendants,[]);
});
test('complete eighty TRAIN rows and both views are mandatory before any encoder initialization',()=>{
 const availability=Array.from({length:80},()=>({'current-static':true,'wikipedia-prose-lead':true}));
 requireCompleteExpansion({captureStatus:'complete',availability});
 assert.throws(()=>requireCompleteExpansion({captureStatus:'partial-failure',availability}));
 assert.throws(()=>requireCompleteExpansion({captureStatus:'complete',availability:availability.slice(1)}));
 for(const view of ['current-static','wikipedia-prose-lead']){
  const missing=availability.map(r=>({...r}));missing[79][view]=false;
  assert.throws(()=>requireCompleteExpansion({captureStatus:'complete',availability:missing}));
 }
});
test('TRAIN encodes both views but TEST only the selected view, with no other-view rescue',()=>{
 assert.deepEqual(encodingViews('training-expansion'),['current-static','wikipedia-prose-lead']);
 assert.deepEqual(encodingViews('test','wikipedia-prose-lead'),['wikipedia-prose-lead']);
 const flags={'current-static':true,'wikipedia-prose-lead':false};
 assert.equal(encodingViews('test','wikipedia-prose-lead').some(v=>flags[v]),false);
 assert.throws(()=>encodingViews('test'));assert.throws(()=>encodingViews('training-expansion','current-static'));
});
