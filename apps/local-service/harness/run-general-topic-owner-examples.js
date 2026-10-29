// Frozen general-web candidate on the two owner-specified real recipe/video
// Sources. Offline stored paired vectors, no Wikipedia/provider/model/SQL use.
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {benchmarkNeed as need,benchmarkSha as sha,readBenchmarkJson as json,benchmarkSourcePins as pins,
 checkBenchmarkPins as endPins,createBenchmarkOutput as directory,saveBenchmarkJson as save} from './hierarchy-benchmark-files.js';
import {compilePairedE5Input,applyPairedE5Input,describePairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';
import {loadInstalledHierarchyMatcher} from '../src/application/installed-hierarchy-matcher.js';
import {classifyRootedHierarchyMatcher} from '../src/domain/hierarchy-rooted-matcher.js';
import {proposeFocusedSubjects} from '../experiments/automatic-topic-discovery-v1/focus-subjects.js';
const ROOT='apps/local-service/',D=ROOT+'data/',OUTPUT=D+'general-topic-owner-focus-20261029';
const SOURCES=['harness/run-general-topic-owner-examples.js','harness/hierarchy-benchmark-files.js',
 'src/domain/hierarchical-e5-paired-input.js','src/application/installed-hierarchy-matcher.js',
 'src/domain/hierarchy-rooted-matcher.js','experiments/automatic-topic-discovery-v1/focus-subjects.js'].map(p=>ROOT+p);
const flags={developmentOnly:true,liveChanged:false,assignmentAuthority:false,registryChanged:false,independentValidation:false,
 encoderOpened:false,providerUsed:false,wikipediaRequired:false,sourceCaptureProven:false,eventIdentityAsserted:false};
let used=false;
export async function runSpecifiedGeneralTopicExamples(){
 need(arguments.length===0&&!used);used=true;const ledger=[],sources=await pins(SOURCES);
 const policy=await json(ROOT+'experiments/automatic-topic-discovery-v1/focus-policy.json',null,ledger),
  snapshot=await json(D+'general-topic-owner-examples-20261029.json',{sha256:'752cecd836bb5ed0d66cb08430104a056eb6fc181d9ee858cad4f818786e3e2b'},ledger),
  definition=await json(ROOT+'assets/hierarchy/input-definition.json',null,ledger);
 need(snapshot.rows.length===2&&snapshot.missing.length===0&&snapshot.readOnly&&snapshot.liveChanged===false);
 const source=sources.find(p=>p.file===policy.algorithm.file);need(source.sha256===policy.algorithm.sha256&&source.bytes===policy.algorithm.bytes);
 const fusion=compilePairedE5Input(definition),representation=describePairedE5Input(fusion),installed=await loadInstalledHierarchyMatcher();
 need(representation.representationHash===policy.representationHash&&installed.descriptor.matcherIdentityHash===policy.matcherHash);
 const observations=[],classification=[];
 for(const row of snapshot.rows){
  need(row.postable===true&&row.matcher_hash===policy.matcherHash&&Array.isArray(row.title_vector)&&row.title_vector.length===384);
  const inputHash=sha(JSON.stringify([row.id,row.source_version,row.operation_id,row.operation_digest,row.stamp]));
  const paired=applyPairedE5Input(fusion,{sourceId:row.id,sourceVersion:inputHash,bodyVector:row.body_vector,titleVector:row.title_vector});
  const match=classifyRootedHierarchyMatcher(installed.matcher,{sourceId:row.id,sourceVersion:inputHash,bodyVector:row.body_vector,titleVector:row.title_vector});
  observations.push({sourceId:row.id,inputHash,materialHash:sha(JSON.stringify([row.title,row.body_vector])),title:row.title,
   publisherKey:new URL(row.url).hostname.replace(/^www\./u,''),acceptedPath:match.semanticPath,vector:paired.vector});
  classification.push({sourceId:row.id,title:row.title,acceptedPath:match.semanticPath,reason:match.reason,sourceVersion:row.source_version});
 }
 await directory(OUTPUT);
 const raw=JSON.stringify({representationHash:policy.representationHash,matcherHash:policy.matcherHash,minimumSimilarity:policy.parameters.minimumSimilarity,observations});
 const output=proposeFocusedSubjects(raw),timings=[];for(let i=0;i<100;i++){const at=performance.now();proposeFocusedSubjects(raw);timings.push(performance.now()-at);}timings.sort((a,b)=>a-b);
 const proposed=output.proposals.filter(p=>p.focusTokens.join(' ')==='kapsalon'&&p.members.length===2);
 const covered=output.selections.filter(s=>proposed.some(p=>p.proposalKey===s.preferredProposalKey));
 const accepted=output.status==='completed'&&proposed.length===1&&covered.length===2;
 await endPins(ledger,SOURCES,sources);
 const result={schema:'specified-general-topic-owner-focus/v1',status:'completed',candidateSucceeded:accepted,
  protocol:{expectedCommonSubject:'Kapsalon',basis:'Owner-supplied real recipe/video example, revisited inspected DEV; not fresh final validation.',
   specificRecipeEqualityExpected:false,requiredDomains:['leukerecepten.nl','youtube.com'],minimumSimilarity:policy.parameters.minimumSimilarity},
  classification,output,timing:{repetitions:100,p50Ms:timings[49],p95Ms:timings[94],maximumMs:timings[99]},
  sourcePins:sources,inputPins:ledger,endPinsChecked:true,...flags};
 return {status:result.status,candidateSucceeded:accepted,names:proposed.map(p=>p.label),covered:covered.length,timing:result.timing,result:await save(OUTPUT,'result.json',result)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||process.argv[2]!=='--test-specified-general-examples'){console.error('Explicit offline specified-example test required');process.exitCode=2;}
 else try{const result=await runSpecifiedGeneralTopicExamples();console.log(JSON.stringify(result));if(!result.candidateSucceeded)process.exitCode=1;}catch{console.error('Specified general topic diagnostic refused; no live change');process.exitCode=1;}
}
