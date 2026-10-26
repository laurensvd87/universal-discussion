import assert from 'node:assert/strict';
import test from 'node:test';
import {partialNodeTruth,fitPartialHierarchyLocalCuts,PARTIAL_LOCAL_LIMITS} from '../src/domain/hierarchy-partial-local-calibration.js';
import {compileHierarchyLocalEvidence,scoreHierarchyLocalEvidence} from '../src/domain/hierarchical-e5-local-evidence.js';

// Invented geometry only. Actual unchanged local scorer supplies every feature.
const nodes=[{id:'games',parentId:null},{id:'video-games',parentId:'games'},{id:'gta',parentId:'video-games'},
 {id:'nature',parentId:null},{id:'animals',parentId:'nature'}];
const axis=i=>Array.from({length:384},(_,j)=>j===i?1:0);
const mixture=x=>{const v=axis(0);v[0]=x;v[2]=Math.sqrt(1-x*x);return v;};
const annotation=(positivePathPrefix=[],completeEndpoint=false,excludedSubtrees=[])=>({positivePathPrefix,completeEndpoint,excludedSubtrees});
function truth(a,nodeId){return partialNodeTruth({nodes,annotation:a,nodeId});}
function fixture({positiveCount=3,negativeCount=3,unknownCount=0,trainSupport=2,positiveVector=axis(0),negativeVector=axis(1)}={}){
 const examples=[];
 for(let i=0;i<trainSupport;i++)examples.push({id:'train-game-'+i,groupId:'train-game-'+i,nodeId:'gta',kind:'member',vector:axis(0)});
 for(let i=0;i<2;i++)examples.push({id:'train-nature-'+i,groupId:'train-nature-'+i,nodeId:'animals',kind:'member',vector:axis(1)});
 const handle=compileHierarchyLocalEvidence({schema:'hierarchical-e5-local-evidence/v1',representation:'paired-raw-e5-body-title-v1',representationHash:'a'.repeat(64),inputConstructionHash:'b'.repeat(64),
  taxonomyVersion:'invented/v1',evidenceVersion:'invented/v1',calibrationVersion:'invented/v1',calibrationStatus:'experimental',nodes:structuredClone(nodes),examples,
  nodePolicies:nodes.map(n=>({nodeId:n.id,enabled:false,minSupport:2,minSimilarity:1,minNegativeMargin:0,minRivalMargin:0}))});
 const rows=[];
 function add(kind,count,gold,vector){for(let i=0;i<count;i++){
  const id='cal-'+kind+'-'+i;
  const features=scoreHierarchyLocalEvidence(handle,{sourceId:id,sourceVersion:'invented-cal/v1',representation:'paired-raw-e5-body-title-v1',representationHash:'a'.repeat(64),inputConstructionHash:'b'.repeat(64),vector}).nodes;
  rows.push({id,groupId:id,split:'calibration',annotation:gold,features});
 }}
 add('positive',positiveCount,annotation(['games','video-games','gta'],false,['nature']),positiveVector);
 add('negative',negativeCount,annotation(['nature','animals'],false,['games']),negativeVector);
 add('unknown',unknownCount,annotation(['games']),axis(0));
 return {nodes:structuredClone(nodes),rows};
}
const rule=(fit,id='gta')=>fit.policies.find(p=>p.nodeId===id),audit=(fit,id='gta')=>fit.audit.find(p=>p.nodeId===id);

test('partial prefixes support ancestors and preserve descendant, sibling and other-root unknowns',()=>{
 assert.equal(truth(annotation(['games']),'games'),true);assert.equal(truth(annotation(['games']),'video-games'),null);
 assert.equal(truth(annotation(['games','video-games']),'games'),true);assert.equal(truth(annotation(['games','video-games']),'video-games'),true);
 assert.equal(truth(annotation(['games','video-games']),'gta'),null);assert.equal(truth(annotation(['games','video-games']),'nature'),null);
 assert.equal(truth(annotation(),'gta'),null);
});

test('explicit STOP and outside exclusions are scoped; contradictory or malformed annotations refuse',()=>{
 assert.equal(truth(annotation(['games','video-games'],true),'gta'),false);assert.equal(truth(annotation(['games','video-games'],true),'video-games'),true);
 assert.equal(truth(annotation(['games','video-games'],true),'nature'),null);
 assert.equal(truth(annotation([],false,['video-games']),'gta'),false);assert.equal(truth(annotation([],false,['video-games']),'games'),null);
 assert.equal(truth(annotation(['games'],false,['gta']),'gta'),false);
 for(const a of [annotation([],true),annotation(['video-games']),annotation(['games','gta']),annotation(['nature','video-games']),annotation(['games'],false,['games']),annotation(['games','video-games'],false,['games']),annotation([],false,['missing']),annotation([],false,['gta','gta'])])assert.throws(()=>truth(a,'gta'));
});

test('real local-scorer features fit only with three known positives, three known negatives and two TRAIN support groups',()=>{
 const input=fixture(),before=structuredClone(input),fit=fitPartialHierarchyLocalCuts(input);
 assert.equal(rule(fit).enabled,true);assert.equal(rule(fit).minSupport,2);assert.equal(audit(fit).acceptedKnownPositiveGroups,3);assert.equal(audit(fit).knownNegativeGroups,3);
 assert.equal(audit(fit).acceptedKnownNegativeGroups,0);assert.equal(audit(fit).minimumKnownNegativeGroups,3);
 assert.equal(fit.productionValidated,false);assert.equal(fit.assignmentAuthority,false);assert.equal(fit.independentValidation,false);assert.equal(fit.developmentOptimizationOnly,true);assert.equal(audit(fit).validatedPrecision,null);
 assert.ok(Object.isFrozen(fit.policies));assert.deepEqual(input,before);assert.ok(input.rows[0].features.every(f=>f.accepted===false),'seed acceptance is deliberately disabled and must not be trusted');
 assert.ok(fit.countedGridWork<=fit.preflightGridWork&&fit.preflightGridWork<=PARTIAL_LOCAL_LIMITS.gridWork);
 for(const options of [{positiveCount:2},{negativeCount:2},{negativeCount:0},{trainSupport:1}])assert.equal(rule(fitPartialHierarchyLocalCuts(fixture(options))).enabled,false);
});

test('accepted unknown CAL groups are reported separately and never count as positive support or negatives',()=>{
 const fit=fitPartialHierarchyLocalCuts(fixture({unknownCount:2}));assert.equal(rule(fit).enabled,true);assert.equal(audit(fit).acceptedKnownPositiveGroups,3);assert.equal(audit(fit).acceptedUnknownGroups,2);assert.equal(audit(fit).acceptedGroups,5);assert.equal(audit(fit).unknownGroups,2);assert.equal(audit(fit).knownNegativeGroups,3);
 const sparse=fitPartialHierarchyLocalCuts(fixture({positiveCount:2,unknownCount:5}));assert.equal(rule(sparse).enabled,false);assert.equal(audit(sparse).knownPositiveGroups,2);assert.equal(audit(sparse).unknownGroups,5);
 const unknownNegatives=fixture();for(const r of unknownNegatives.rows.filter(r=>r.id.includes('negative')))r.annotation=annotation(['nature','animals']);
 const noNegatives=fitPartialHierarchyLocalCuts(unknownNegatives);assert.equal(rule(noNegatives).enabled,false);assert.equal(audit(noNegatives).knownNegativeGroups,0);assert.equal(audit(noNegatives).unknownGroups,3);
});

test('known wrong acceptance disables an inseparable branch or selects a conservative separating cut',()=>{
 const inseparable=fitPartialHierarchyLocalCuts(fixture({negativeVector:axis(0)}));assert.equal(rule(inseparable).enabled,false);
 const separated=fitPartialHierarchyLocalCuts(fixture({positiveVector:mixture(.95),negativeVector:mixture(.8)}));assert.equal(rule(separated).enabled,true);assert.ok(rule(separated).minSimilarity>.8);assert.equal(audit(separated).acceptedKnownPositiveGroups,3);assert.equal(audit(separated).acceptedKnownNegativeGroups,0);
});

test('taxonomy cycles, missing parents, excessive depth and preflight budget fail before cut evaluation',()=>{
 assert.throws(()=>partialNodeTruth({nodes:[{id:'a',parentId:'b'},{id:'b',parentId:'a'}],annotation:annotation(),nodeId:'a'}));
 assert.throws(()=>partialNodeTruth({nodes:[{id:'a',parentId:'missing'}],annotation:annotation(),nodeId:'a'}));
 const deep=Array.from({length:9},(_,i)=>({id:'deep-'+i,parentId:i?'deep-'+(i-1):null}));assert.throws(()=>partialNodeTruth({nodes:deep,annotation:annotation(),nodeId:'deep-8'}),{code:'capacity'});
 let hooks=0;const hostile=new Proxy({},{getOwnPropertyDescriptor(){hooks++;throw new Error('must not inspect feature rows');}});
 assert.throws(()=>fitPartialHierarchyLocalCuts({nodes:Array.from({length:128},(_,i)=>({id:'root-'+i,parentId:null})),rows:Array(64).fill(hostile)}),{code:'capacity'});assert.equal(hooks,0);
 assert.throws(()=>fitPartialHierarchyLocalCuts({nodes,rows:Array(129).fill({})}),{code:'capacity'});
});

test('closed feature records, unique CAL groups, split and finite coherent numbers are required without hooks',()=>{
 const duplicate=fixture();duplicate.rows[1].groupId=duplicate.rows[0].groupId;assert.throws(()=>fitPartialHierarchyLocalCuts(duplicate));
 const leakage=structuredClone(fixture());leakage.rows[0].features.find(f=>f.nodeId==='gta').positiveSimilarities[0].groupId=leakage.rows[0].groupId;assert.throws(()=>fitPartialHierarchyLocalCuts(leakage));
 const wrongSplit=fixture();wrongSplit.rows[0].split='test';assert.throws(()=>fitPartialHierarchyLocalCuts(wrongSplit));
 const changes=[f=>{f.bestSimilarity=NaN;},f=>{f.negativeMargin=Infinity;},f=>{f.bestSimilarity=1.1;},f=>{f.extra=true;},f=>{f.support=-1;},f=>{f.positiveSimilarities[1].groupId=f.positiveSimilarities[0].groupId;}];
 for(const change of changes){const input=structuredClone(fixture());change(input.rows[0].features.find(f=>f.nodeId==='gta'));assert.throws(()=>fitPartialHierarchyLocalCuts(input));}
 const missing=structuredClone(fixture());missing.rows[0].features.pop();assert.throws(()=>fitPartialHierarchyLocalCuts(missing));
 let hooks=0;const input=fixture(),row={...input.rows[0]};Object.defineProperty(row,'features',{enumerable:true,get(){hooks++;throw new Error('must not get');}});input.rows[0]=row;assert.throws(()=>fitPartialHierarchyLocalCuts(input));assert.equal(hooks,0);
});
