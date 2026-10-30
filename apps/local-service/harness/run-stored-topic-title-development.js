// Post-hoc DEV only after the45-page quality failure. The old V3, captures,
// gold/scorer, vectors and outcomes remain unchanged. No live publication.
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {benchmarkNeed as need,benchmarkSourcePins as pins,checkBenchmarkPins as endPins,createBenchmarkOutput as directory,
 saveBenchmarkJson as save,readBenchmarkJson as json} from './hierarchy-benchmark-files.js';
import {prepareStoredValidation,evaluateStoredValidation} from './stored-topic-validation-v2.js';
import {isolatePublisherTitleEvidence} from '../experiments/automatic-topic-discovery-v4/title-evidence.js';
const ROOT='apps/local-service/data/canonical-migration-backups/',BASE=ROOT+'automatic18-new-domain-validation-20261030',
 PREVIOUS=ROOT+'automatic18-new-topic-validation-v2-20261030',OUTPUT=ROOT+'automatic18-title-evidence-development-20261030';
const FILES=['apps/local-service/harness/run-stored-topic-title-development.js',
 'apps/local-service/experiments/automatic-topic-discovery-v4/title-evidence.js','apps/local-service/experiments/automatic-topic-discovery-v4/title-evidence.test.js'];
let used=false;
export async function comparePublisherTitleEvidenceDevelopment(){
 need(arguments.length===0&&!used);used=true;const newPins=await pins(FILES),ledger=[];
 const cohort=await json(BASE+'/cohort.json',{sha256:'9c44028aec78038ccec0c0e9a9baa8e3167f987153e69df180ad6f66be23d350'},ledger),
  annotations=await json(BASE+'/annotations.json',{sha256:'f5418127816b5bbed01808fa327aac01286af45096e95c4cf23af116a4fbeb72'},ledger),
  previous=await json(PREVIOUS+'/evaluation-result.json',{sha256:'4ceeff0a90c0e43837189c42ae60566f3b173306104c89c2fb3b8712df13fb0b'},ledger),
  definition=await json('apps/local-service/assets/hierarchy/input-definition.json',{sha256:'2ec96c1244761b9688e5fea2a2dec168df1ac961aa2d440fcd42bdb085e6096c'},ledger);
 need(previous.status==='completed'&&previous.sourceEndPinsPassed&&cohort.rows.length===45&&annotations.beforeProposals);
 const sourcePins=[...previous.sourcePins,...newPins],files=sourcePins.map(p=>p.file);need(new Set(files).size===files.length);
 await endPins(ledger,files,sourcePins);await directory(OUTPUT);
 await save(OUTPUT,'inputs.json',{sourcePins,inputPins:ledger,method:'Hostname-supported publisher suffix exclusion; literal normalized prefix and original offsets preserved',
  scope:'Post-hoc development on same45 pages and unchanged Root title annotations, not prospective quality, no homonym fix claimed',
  policyUnchanged:true,newEncoder:false,databaseOpened:false,networkOpened:false,publication:false,liveChanged:false});
 const input=prepareStoredValidation({rows:cohort.rows,inputDefinition:definition,matcherHash:cohort.metadata.matcher_hash}),changes=[];
 for(const row of input.observations){const evidence=isolatePublisherTitleEvidence(row.title,row.publisherKey);
  if(evidence.removedPublisherSuffix)changes.push({sourceId:row.sourceId,prefixEnd:evidence.prefixEnd});row.title=evidence.title;}
 let evaluation=null,failure=null,sourceEndPinsPassed=false;
 try{evaluation=evaluateStoredValidation({input,annotations:annotations.rows});}catch{failure={stage:'proposal-or-score',detailsRetained:false};}
 try{await endPins(ledger,files,sourcePins);sourceEndPinsPassed=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'stored-topic-title-evidence-development/v1',status:failure?'failed':'completed',failure,
  baseline:previous.evaluation.counts,evaluation,changes,sourcePins,inputPins:ledger,sourceEndPinsPassed,
  scope:{postHocDevelopment:true,prospectiveValidation:false,representativeAccuracy:false,all45PagesWikipedia:true,
   newEncoder:false,databaseOpened:false,networkOpened:false,publication:false,liveChanged:false,publicationPolicyIntegrated:false}};
 return {status:result.status,baseline:result.baseline,counts:evaluation?.counts??null,changed:changes.length,
  proposalElapsedMs:evaluation?.proposalElapsedMs??null,sourceEndPinsPassed,result:await save(OUTPUT,'evaluation-result.json',result)};
}
export async function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length!==1||args[0]!=='--compare-publisher-title-development')return 2;
 try{const r=await comparePublisherTitleEvidenceDevelopment();process.stdout.write(JSON.stringify(r)+'\n');return r.status==='completed'?0:1;}
 catch{process.stderr.write('Publisher-title development unavailable; no live changes.\n');return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(exitCode=>{process.exitCode=exitCode;});
