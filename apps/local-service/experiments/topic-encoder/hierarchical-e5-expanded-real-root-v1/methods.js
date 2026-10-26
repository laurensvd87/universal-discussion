// Pure experimental TRUSTED-RUNNER composition, not a classifier or canonical proof.
// Paths must come from the separately compiled scorers inside run.js; hashes only
// fence identity, never attest caller-supplied scores/paths or source existence.
// No model, cohort, capture or filesystem imports.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
export const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const CANDIDATE_ORDER=Object.freeze([['wikipedia-prose-lead',.5],['wikipedia-prose-lead',.75],['wikipedia-prose-lead',.25],['current-static',.5],['current-static',.75],['current-static',.25]].map(Object.freeze));
export function selectCandidate(candidates){
 assert.equal(candidates.length,6);
 for(let i=0;i<6;i++){assert.equal(candidates[i].inputView,CANDIDATE_ORDER[i][0]);assert.equal(candidates[i].bodyWeight,CANDIDATE_ORDER[i][1]);}
 return [...candidates].sort((a,b)=>b.acceptedCorrect-a.acceptedCorrect||b.rawCorrect-a.rawCorrect||
 CANDIDATE_ORDER.findIndex(c=>c[0]===a.inputView&&c[1]===a.bodyWeight)-CANDIDATE_ORDER.findIndex(c=>c[0]===b.inputView&&c[1]===b.bodyWeight))[0];
}
export function workPreflight(training=128,calibration=48,nodes=16){
 assert.equal(training,128);assert.equal(calibration,48);assert.equal(nodes,16);
 const n=training,d=384,h=nodes;
 // Fitter's charged terms, conservatively allowing depth8 even for root-only labels.
 const perFit=4*n*d+d+n*(n+1)/2*d+n+n*(n+1)*(n-1)/6+n*(n+1)/2+
 h*(9*n+n+1+2*n*n+2*n*d+4*d+16);
 const trainingWork=Math.ceil(6*perFit),fusionCoordinateVisits=6*(training+calibration)*384*8+32*384*16,
 scoringCoordinateProducts=(6*calibration*nodes+32*(nodes+63))*384,
 rankWork=6*(calibration*nodes*4+calibration*calibration*4+calibration*64+256)+6*calibration*nodes*4+32*nodes*8;
 assert.ok(trainingWork<=80000000);assert.ok(fusionCoordinateVisits<=5000000);
 assert.ok(scoringCoordinateProducts<=4000000);assert.ok(rankWork<=1000000);
 return {trainingWork,fusionCoordinateVisits,scoringCoordinateProducts,rankWork,scope:'separate-algorithmic-bounds-not-walltime-or-all-CPU'};
}
export function inputConstructionIdentity(f,inputView,bodyWeight,rootRepresentationHash){
 assert.ok(CANDIDATE_ORDER.some(c=>c[0]===inputView&&c[1]===bodyWeight));
 return digest({schema:'expanded-root-dual-input-construction/v1',inputView,bodyWeight,titleWeight:1-bodyWeight,
 rootRepresentationHash,detailRepresentationHash:f.detailRepresentationHash,encoderHash:f.encoderHash,
 protocolSha256:f.protocolSha256,captureSourceHashes:f.captureSourceHashes,reusedInputHashes:f.reusedInputHashes,
 pairedAdapterSha256:f.sourceHashes['../../../src/domain/hierarchical-e5-paired-input.js'],
 embeddingContractSha256:f.sourceHashes['../../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js'],
 assetManifestSha256:f.sourceHashes['../../../../../spikes/topic-resolution/browser/embedding/.assets/manifest.json']});
}
function record(value,keys){
 assert.ok(value&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype);
 assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort());
 const copy={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);assert.ok(d.enumerable&&Object.hasOwn(d,'value'));copy[key]=d.value;}return copy;
}
const fields=['inputConstructionHash','inputView','rootModelSha256','rootPolicySha256','rootRepresentationHash','detailModelSha256','detailPolicySha256','detailRepresentationHash'];
const handles=new WeakMap(),HEX=/^[a-f0-9]{64}$/u;
export function compileDualRepresentationGate(input){
 const a=record(input,fields);for(const key of fields.filter(k=>k!=='inputView'))assert.match(a[key],HEX);
 assert.ok(['current-static','wikipedia-prose-lead'].includes(a.inputView));
 const handle=Object.freeze({});handles.set(handle,Object.freeze({...a,dualGateHash:digest({schema:'separate-representation-root-detail-gate/v1',...a})}));return handle;
}
export function describeDualRepresentationGate(h){assert.ok(handles.has(h));return Object.freeze({...handles.get(h)});}
function path(value){
 assert.ok(Array.isArray(value)&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=8);
 assert.equal(Reflect.ownKeys(value).length,value.length+1);const out=[];
 for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));assert.ok(d?.enumerable&&Object.hasOwn(d,'value'));
 assert.ok(typeof d.value==='string'&&d.value.length>0&&d.value.length<=160);out.push(d.value);}
 assert.equal(new Set(out).size,out.length);return out;
}
export function applyDualRepresentationGate(handle,input){
 const definition=handles.get(handle);assert.ok(definition);
 const a=record(input,['root','detail']);
 const keys=['sourceId','sourceVersion','sourceInputHash','inputView','inputConstructionHash','modelSha256','policySha256','representationHash','path'];
 const root=record(a.root,keys),detail=record(a.detail,keys);
 for(const k of ['sourceId','sourceVersion'])assert.ok(typeof root[k]==='string'&&root[k].length>0&&root[k].length<=160);
 assert.match(root.sourceInputHash,HEX);
 for(const k of ['sourceId','sourceVersion','sourceInputHash','inputView','inputConstructionHash'])assert.equal(root[k],detail[k]);
 for(const part of ['root','detail']){const row=part==='root'?root:detail;
 for(const [key,suffix]of [['modelSha256','ModelSha256'],['policySha256','PolicySha256'],['representationHash','RepresentationHash']])assert.equal(row[key],definition[part+suffix]);
 assert.equal(row.inputView,definition.inputView);assert.equal(row.inputConstructionHash,definition.inputConstructionHash);}
 const rp=path(root.path),dp=path(detail.path);assert.ok(rp.length<=1);
 const selected=rp.length===0?[]:dp.length>1&&dp[0]===rp[0]?dp:rp;
 return Object.freeze({sourceId:root.sourceId,sourceVersion:root.sourceVersion,sourceInputHash:root.sourceInputHash,
 selectedPath:Object.freeze([...selected]),dualGateHash:definition.dualGateHash,
 reason:!rp.length?'root-unresolved':selected.length>1?'same-root-detail-supported':'independently-supported-root-only',
 experimental:true,productionValidated:false,assignmentAuthority:false});
}
// Positive-prefix labels constrain known branches but do not create unknown
// descendant negatives. Terminal exactness remains the old assessor's separate job.
export function partialPrefixAgreement(input){
 const a=record(input,['supportedPathPrefix','maximumSpecificityKnown','selectedPath']);
 const gold=path(a.supportedPathPrefix),predicted=path(a.selectedPath);
 assert.ok(gold.length>0&&typeof a.maximumSpecificityKnown==='boolean');
 let outcome;
 if(!predicted.length)outcome='unresolved';
 else if(predicted.length<gold.length&&predicted.every((id,i)=>gold[i]===id))outcome='safe-broader';
 else if(gold.every((id,i)=>predicted[i]===id))outcome='known-prefix-satisfied';
 else outcome='incompatible-known-prefix';
 const unscoredDescendants=outcome==='known-prefix-satisfied'&&!a.maximumSpecificityKnown?predicted.slice(gold.length):[];
 return Object.freeze({outcome,unscoredDescendants:Object.freeze(unscoredDescendants),
  terminalSpecificityScoredHere:false,assignmentAuthority:false});
}
export function requireCompleteExpansion(input){
 const a=record(input,['captureStatus','availability']);
 assert.equal(a.captureStatus,'complete','Incomplete TRAIN expansion stops before encoder initialization');
 assert.ok(Array.isArray(a.availability)&&!types.isProxy(a.availability));assert.equal(a.availability.length,80);
 for(const row of a.availability)assert.ok(row['current-static']===true&&row['wikipedia-prose-lead']===true,
  'Every TRAIN title/body view is required before encoder initialization');
}
export function encodingViews(phase,selectedView=null){
 if(phase==='training-expansion'){assert.equal(selectedView,null);return Object.freeze(['current-static','wikipedia-prose-lead']);}
 assert.equal(phase,'test');assert.ok(['current-static','wikipedia-prose-lead'].includes(selectedView));
 return Object.freeze([selectedView]);
}
