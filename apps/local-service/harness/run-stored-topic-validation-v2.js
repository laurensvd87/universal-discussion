// Offline evaluation of the successful45-row capture, not a recapture or an
// adoption of its failed positive-only evaluator. All original bytes are held.
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {benchmarkNeed as need,benchmarkSourcePins as pins,checkBenchmarkPins as endPins,createBenchmarkOutput as directory,
 saveBenchmarkJson as save,readBenchmarkJson as json} from './hierarchy-benchmark-files.js';
import {prepareStoredValidation,evaluateStoredValidation} from './stored-topic-validation-v2.js';
const BASE='apps/local-service/data/canonical-migration-backups/automatic18-new-domain-validation-20261030';
const OUTPUT='apps/local-service/data/canonical-migration-backups/automatic18-new-topic-validation-v2-20261030';
const SHA={cohort:'9c44028aec78038ccec0c0e9a9baa8e3167f987153e69df180ad6f66be23d350',
 annotations:'f5418127816b5bbed01808fa327aac01286af45096e95c4cf23af116a4fbeb72',
 capture:'2cbfa5110e3b68ceab21a6bb00689a647daef45ae7966a18173b0806eddfc8b5'};
const FILES=['apps/local-service/harness/run-stored-topic-validation-v2.js','apps/local-service/harness/stored-topic-validation-v2.js',
 'apps/local-service/harness/stored-topic-validation-v2.test.js'];
let used=false;
export async function compareRetainedStoredTopicValidation(){
 need(arguments.length===0&&!used);used=true;const newPins=await pins(FILES),inputPins=[];
 const cohort=await json(BASE+'/cohort.json',{sha256:SHA.cohort},inputPins),annotations=await json(BASE+'/annotations.json',{sha256:SHA.annotations},inputPins),
  capture=await json(BASE+'/capture-result.json',{sha256:SHA.capture},inputPins),definition=await json('apps/local-service/assets/hierarchy/input-definition.json',
   {sha256:'2ec96c1244761b9688e5fea2a2dec168df1ac961aa2d440fcd42bdb085e6096c'},inputPins);
 need(cohort.schema==='stored-topic-prospective-cohort/v1'&&cohort.sourceEndPinsPassed&&cohort.annotationBeforeProposalsRequired&&cohort.rows.length===45);
 need(capture.status==='completed'&&capture.cohortPin.sha256===SHA.cohort&&capture.sourceEndPinsPassed&&capture.cleanup.connectionClosed&&capture.cleanup.transactionClosed);
 need(annotations.schema==='stored-topic-title-annotations/v1'&&annotations.cohortSha256===SHA.cohort&&annotations.beforeProposals===true&&
  Date.parse(annotations.annotatedAt)>=Date.parse(cohort.capturedAt));
 need(JSON.stringify(cohort.sourcePins)===JSON.stringify(await pins(cohort.sourcePins.map(p=>p.file))));
 const sourcePins=[...cohort.sourcePins,...newPins],files=sourcePins.map(p=>p.file);need(new Set(files).size===files.length);
 await directory(OUTPUT);await save(OUTPUT,'inputs.json',{sourcePins,inputPins,correction:'Diagnostic Source version0 is valid; no V3/scorer/annotation/material/policy/threshold change',
  failedFirstEvaluationRetained:true,successfulCaptureReused:true,rootOnly:true,nonWikipediaValidation:false});
 let evaluation=null,failure=null,sourceEndPinsPassed=false;
 try{evaluation=evaluateStoredValidation({input:prepareStoredValidation({rows:cohort.rows,inputDefinition:definition,matcherHash:cohort.metadata.matcher_hash}),annotations:annotations.rows});}
 catch{failure={stage:'decode-or-proposal-or-scoring',detailsRetained:false};}
 try{await endPins(inputPins,files,sourcePins);sourceEndPinsPassed=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'stored-topic-prospective-evaluation-run/v2',status:failure?'failed':'completed',failure,evaluation,sourcePins,inputPins,sourceEndPinsPassed,
  scope:{rootOnlyTitleReview:true,all45PagesWikipedia:true,representativeAccuracy:false,newEncoder:false,databaseOpened:false,networkOpened:false,publication:false,liveChanged:false}};
 return {status:result.status,counts:evaluation?.counts??null,proposalElapsedMs:evaluation?.proposalElapsedMs??null,sourceEndPinsPassed,
  result:await save(OUTPUT,'evaluation-result.json',result)};
}
export async function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length!==1||args[0]!=='--compare-retained-cohort')return 2;
 try{const r=await compareRetainedStoredTopicValidation();process.stdout.write(JSON.stringify(r)+'\n');return r.status==='completed'?0:1;}
 catch{process.stderr.write('Retained stored-topic validation unavailable; no live changes.\n');return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(exitCode=>{process.exitCode=exitCode;});
