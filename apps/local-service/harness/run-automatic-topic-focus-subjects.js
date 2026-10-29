// Offline named SUBJECT proposal screen over the retained real DEV inputs.
// No network, provider, model inference, registry/canonical write or live change.
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {benchmarkNeed as need,benchmarkSha as sha,readBenchmarkJson as json,benchmarkSourcePins as pins,
 checkBenchmarkPins as endPins,createBenchmarkOutput as directory,saveBenchmarkJson as save} from './hierarchy-benchmark-files.js';
import {checkAutomaticTopicDevelopmentSource} from './run-automatic-topic-development.js';
import {loadInstalledHierarchyMatcher} from '../src/application/installed-hierarchy-matcher.js';
import {classifyRootedHierarchyMatcher} from '../src/domain/hierarchy-rooted-matcher.js';
import {proposeFocusedSubjects} from '../experiments/automatic-topic-discovery-v1/focus-subjects.js';

const D='apps/local-service/data/';
const MORE=['apps/local-service/harness/run-automatic-topic-focus-subjects.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/focus-subjects.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/focus-subjects.test.js'];
const flags={developmentOnly:true,liveChanged:false,assignmentAuthority:false,productionValidated:false,
 independentValidation:false,encoderOpened:false,eventIdentityAsserted:false,providerUsed:false};
let used=false;
export async function compareFocusedSubjectDevelopment(){
 need(arguments.length===0);return compareDevelopment(false);
}
export async function compareFocusedSubjectContextDevelopment(){
 need(arguments.length===0);return compareDevelopment(true);
}
async function compareDevelopment(contextRefinement){
 need(!used);used=true;const ledger=[],OUTPUT=D+(contextRefinement?'automatic-topic-focus-subject-context-development-20261029':'automatic-topic-focus-subject-development-20261029');
 const first=await json(D+'automatic-topic-development-capture-20261029/result.json',{sha256:'b979b37197ba0cb231e04862e601ab174c09a9b1358139aa1afe499601297de0'},ledger),
  extra=await json(D+'automatic-topic-development-additional-capture-20261029/result.json',{sha256:'e3972b02513a973362d5ba92cc99ce7c5e83e0f5062d623c8d8a1e856cddd2f9'},ledger),
  hard=await json(D+'automatic-topic-comparison-development-capture-20261029/result.json',{sha256:'26b065a8dfdb384cccb078862f348291523b41c18bc9be556609307911f5999e'},ledger),
  baseline=await json(D+'automatic-topic-comparison-features-20261029/result.json',{sha256:'104491a7a48afb7979cceefa2dec95ce15e92e8332f3cd3f251457241c78c39c'},ledger);
 need([first,extra,hard,baseline].every(r=>r.status==='completed'&&r.endPinsChecked)&&baseline.encoderClosed);
 if(contextRefinement){
  const prior=await json(D+'automatic-topic-focus-subject-development-20261029/result.json',{sha256:'f0a948cc717bf7f3a3860e10c006829df1d0ade0c5c04a94847ab1c372dce8c5'},ledger);
  need(prior.status==='completed'&&prior.endPinsChecked&&prior.counts.prepared===12);
 }
 const base=await checkAutomaticTopicDevelopmentSource(),sources=[...base.sourcePins,...await pins(MORE)],files=sources.map(p=>p.file);need(new Set(files).size===files.length);
 const rows=[...first.rows,...extra.rows,...hard.rows],available=rows.filter(r=>r.status==='available'),installed=await loadInstalledHierarchyMatcher();
 need(rows.length===22&&available.length===12&&baseline.casePins.length===12);
 const protocol={kind:'named-subjects',similarityGrid:[.8,.88,.9],
  phase:contextRefinement?'Post-hoc DEV source refinement of unknown/known context handling and label prefixes; previous result retained, not a fresh validation cohort.':'Initial named-subject DEV screen.',
  naming:'Shared literal headline focus, bounded one-to-eight-word spans; two independent inputs/publishers and vector cohesion. No predefined topic names.',
  hierarchy:'Strict focus containment plus member subset; longest common accepted model path retained separately. Unknown roots can corroborate one known sense, never bridge conflicting known senses; no invented classifier path.',
  selection:'Most-specific descendant along supported branches; earlier headline focus selects among unrelated subject axes, which remain explicit alternatives.',
  separation:'These are subject scopes, including annual prizes, not proof of one identical news event. Old false-event results remain false.',
  limits:'64 observations,12288 patterns,131072 cohesion checks,128 temporary proposals. Limits bound this batch, not the global topic directory.',
  validation:'Root-only DEV; source-title traces and semantic scope review required. No prospective or population-quality claim.'};
 await directory(OUTPUT);await save(OUTPUT,'inputs.json',{protocol,sourcePins:sources,inputPins:ledger,matcher:installed.descriptor,...flags});
 const started=performance.now(),observations=[],classifications=[],comparisons=[];let failure=null,endPinsChecked=false;
 try{
  for(const row of available){
   const pin=baseline.casePins.find(p=>p.file===row.id+'.json');need(pin);
   const f=await json(D+'automatic-topic-comparison-features-20261029/'+pin.file,pin,ledger);
   need(f.id===row.id&&f.sourceInputHash===row.sourceInputHash&&f.bodySha256===row.bodySha256&&f.titleSha256===row.titleSha256&&f.representationHash===baseline.representation.representationHash);
   const match=classifyRootedHierarchyMatcher(installed.matcher,{sourceId:row.id,sourceVersion:row.sourceInputHash,bodyVector:f.bodyVector,titleVector:f.titleVector});
   observations.push({sourceId:row.id,inputHash:row.sourceInputHash,materialHash:sha(JSON.stringify([row.bodySha256,row.titleSha256])),
    title:row.title,publisherKey:row.publisherKey,acceptedPath:match.semanticPath,vector:f.pairedVector});
   classifications.push({sourceId:row.id,acceptedPath:match.semanticPath,reason:match.reason});
  }
  for(const minimumSimilarity of protocol.similarityGrid){
   const raw=JSON.stringify({representationHash:baseline.representation.representationHash,matcherHash:installed.descriptor.matcherIdentityHash,minimumSimilarity,observations});
   const output=proposeFocusedSubjects(raw),timings=[];
   for(let i=0;i<100;i++){const at=performance.now();proposeFocusedSubjects(raw);timings.push(performance.now()-at);}timings.sort((a,b)=>a-b);
   comparisons.push({minimumSimilarity,output,timing:{repetitions:100,p50Ms:timings[49],p95Ms:timings[94],maximumMs:timings[99]}});
  }
 }catch{failure={stage:'features-classification-or-focus',completed:observations.length};}
 try{await endPins(ledger,files,sources);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'automatic-topic-focus-subject-development/v1',contextRefinement,status:failure?'failed':'completed',failure,
  counts:{declared:rows.length,usable:available.length,unavailable:rows.length-available.length,prepared:observations.length},
  protocol,comparisons,classifications,sourcePins:sources,inputPins:ledger,endPinsChecked,elapsedMs:performance.now()-started,
  note:'Named subject scopes can cover different events. No event precision score is inferred from literal overlap; no current Source context, topic registry, posts, model or crawler changed.',...flags};
 return {status:result.status,counts:result.counts,endPinsChecked,
  comparisons:comparisons.map(c=>({minimumSimilarity:c.minimumSimilarity,status:c.output.status,
   proposals:c.output.proposals.map(p=>({key:p.proposalKey,label:p.label,members:p.members.length,parent:p.parentProposalKey,acceptedPath:p.acceptedAncestorPath})),
   covered:c.output.selections.filter(s=>s.preferredProposalKey!==null).length,work:c.output.work,timing:c.timing})),result:await save(OUTPUT,'result.json',result)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||!['--compare-development','--compare-context-development'].includes(process.argv[2])){process.stderr.write('Explicit offline focused-subject comparison required; no action.\n');process.exitCode=2;}
 else try{const r=await(process.argv[2]==='--compare-development'?compareFocusedSubjectDevelopment():compareFocusedSubjectContextDevelopment());process.stdout.write(JSON.stringify(r)+'\n');if(r.status!=='completed')process.exitCode=1;}
 catch{process.stderr.write('Focused subject comparison refused; no live state changed.\n');process.exitCode=1;}
}
