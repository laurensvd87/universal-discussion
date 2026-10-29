// Actual stored owner recipe/video observations through the general registry
// planner. No Wikipedia, inference, provider, SQL write or live assignment.
import {benchmarkNeed as need,benchmarkSha as sha,readBenchmarkJson as json,benchmarkSourcePins as pins,
 checkBenchmarkPins as endPins,createBenchmarkOutput as directory,saveBenchmarkJson as save} from './hierarchy-benchmark-files.js';
import {compilePairedE5Input,applyPairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';
import {planAutomaticNamedSubjects} from '../src/application/automatic-named-subject-plan.js';
const D='apps/local-service/data/',OUTPUT=D+'general-topic-registry-plan-20261029';
if(process.argv.length!==3||process.argv[2]!=='--test-real-general-plan')throw Error('Explicit general registry diagnostic required');
const files=['apps/local-service/harness/run-general-topic-registry-plan.js','apps/local-service/harness/hierarchy-benchmark-files.js',
 'apps/local-service/src/application/automatic-named-subject-plan.js','apps/local-service/experiments/automatic-topic-discovery-v1/focus-subjects.js',
 'apps/local-service/src/domain/hierarchical-e5-paired-input.js'];
const sources=await pins(files),ledger=[];
const snapshot=await json(D+'general-topic-owner-examples-20261029.json',{sha256:'752cecd836bb5ed0d66cb08430104a056eb6fc181d9ee858cad4f818786e3e2b'},ledger),
 previous=await json(D+'general-topic-owner-focus-verified-20261029/result.json',{sha256:'1b27e07387a0d10608091bff764d5a2dacaad6799cba49753f8c374f501d2674'},ledger),
 policy=await json('apps/local-service/experiments/automatic-topic-discovery-v1/focus-policy.json',null,ledger),
 definition=await json('apps/local-service/assets/hierarchy/input-definition.json',null,ledger);
need(previous.candidateSucceeded&&previous.endPinsChecked&&snapshot.rows.length===2);
const fusion=compilePairedE5Input(definition),observations=[],sourceWitnesses=[];
for(const r of snapshot.rows){
 need(r.postable&&r.generation===snapshot.rows[0].generation&&r.matcher_hash===policy.matcherHash);
 const inputHash=sha(JSON.stringify([r.id,r.source_version,r.operation_id,r.operation_digest,r.stamp]));
 observations.push({sourceId:r.id,inputHash,materialHash:sha(JSON.stringify([r.title,r.body_vector])),title:r.title,
  publisherKey:new URL(r.url).hostname.replace(/^www\./u,''),acceptedPath:previous.classification.find(c=>c.sourceId===r.id).acceptedPath,
  vector:applyPairedE5Input(fusion,{sourceId:r.id,sourceVersion:inputHash,bodyVector:r.body_vector,titleVector:r.title_vector}).vector});
 sourceWitnesses.push({sourceId:r.id,sourceVersion:r.source_version,operationId:r.operation_id,operationDigest:r.operation_digest,sourceStamp:r.stamp});
}
const input={generation:snapshot.rows[0].generation,policyHash:sha(JSON.stringify(policy)),representationHash:policy.representationHash,matcherHash:policy.matcherHash,
 minimumSimilarity:policy.parameters.minimumSimilarity,observations,sourceWitnesses,candidates:[]};
const first=planAutomaticNamedSubjects(JSON.stringify(input));need(first.updates.length===1&&first.updates[0].label.toLowerCase()==='kapsalon');
input.candidates=first.updates.map(u=>({subjectId:u.subjectId,revision:'1',focusKey:u.focusKey,contextRootId:u.contextRootId,
 prototypeValues:u.prototypeValues,representationHash:policy.representationHash,parentId:u.parentId}));
const second=planAutomaticNamedSubjects(JSON.stringify(input));need(second.updates.length===1&&second.updates[0].subjectId===first.updates[0].subjectId&&second.updates[0].expectedRevision==='1');
need(second.selections.length===2&&second.selections.every(s=>s.subjectId===first.updates[0].subjectId)&&second.commitWitnesses.length===2);
await endPins(ledger,files,sources);await directory(OUTPUT);
const result={schema:'general-subject-registry-real-plan-diagnostic/v1',status:'completed',first,second,sourcePins:sources,inputPins:ledger,endPinsChecked:true,
 note:'Two planning passes with actual stored recipe/video vectors and an invented candidate revision1. No SQL persistence, restart continuity, production approval, fresh independent quality or live Source assignment is asserted.',
 sourceCaptureProven:false,registryChanged:false,liveChanged:false,wikipediaRequired:false,encoderOpened:false,providerUsed:false,independentValidation:false};
console.log(JSON.stringify({status:result.status,subjects:second.updates.length,stableIdsReused:true,covered:second.selections.length,sourceFences:second.commitWitnesses.length,
 result:await save(OUTPUT,'result.json',result)}));
