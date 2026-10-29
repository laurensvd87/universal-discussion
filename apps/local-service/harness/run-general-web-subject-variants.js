// New DEV comparison: unchanged frozen v1 versus explicit general-subject v2.
// Reuse the five existing features; encode only four successfully repaired pages.
// No publisher fabrication, unavailable replacement, Wikipedia or live writes.
import {benchmarkNeed as need,benchmarkSha as sha,readBenchmarkJson as json,benchmarkSourcePins as pins,
 checkBenchmarkPins as endPins,createBenchmarkOutput as directory,saveBenchmarkJson as save} from './hierarchy-benchmark-files.js';
import {checkAutomaticTopicDevelopmentSource} from './run-automatic-topic-development.js';
import {createPackagedCrawlerEmbedder} from '../src/crawler/packaged-e5.js';
import {compilePairedE5Input,applyPairedE5Input,describePairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';
import {loadInstalledHierarchyMatcher} from '../src/application/installed-hierarchy-matcher.js';
import {classifyRootedHierarchyMatcher} from '../src/domain/hierarchy-rooted-matcher.js';
import {proposeFocusedSubjects as v1} from '../experiments/automatic-topic-discovery-v1/focus-subjects.js';
import {proposeFocusedSubjects as v2} from '../experiments/automatic-topic-discovery-v2/focus-subjects.js';
const D='apps/local-service/data/',OUTPUT=D+'general-web-subject-variants-20261029';
if(process.argv.length!==3||process.argv[2]!=='--compare-general-subject-policies')throw Error('Explicit general subject comparison required');
const base=await checkAutomaticTopicDevelopmentSource(),sourcePins=[...base.sourcePins,...await pins([
 'apps/local-service/harness/run-general-web-subject-variants.js','apps/local-service/harness/general-web-subject-corpus.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/focus-subjects.js','apps/local-service/experiments/automatic-topic-discovery-v2/focus-subjects.js',
 'apps/local-service/experiments/automatic-topic-discovery-v2/focus-subjects.test.js'])],files=sourcePins.map(p=>p.file),ledger=[];
need(new Set(files).size===files.length);
const original=await json(D+'general-web-subject-screen-capture-20261029/result.json',{sha256:'a464fc8d95c266e94d2ae50f6f3997e7f71e61311699b1d55ff35b39ef132d47'},ledger),
 oldFeatures=await json(D+'general-web-subject-screen-features-20261029/result.json',{sha256:'0ac97b6560ca5208f49667cb97a583d094ff3ed03e67db37d84f69e1fe670a06'},ledger),
 repair=await json(D+'general-web-subject-repair-capture-20261029/result.json',{sha256:'f1563c82dccb453f88ad8f9f835ec9e3538ab6910cebbb9fe71b2ab57436c41e'},ledger),
 policy=await json('apps/local-service/experiments/automatic-topic-discovery-v1/focus-policy.json',null,ledger),
 definition=await json('apps/local-service/assets/hierarchy/input-definition.json',null,ledger);
need([original,oldFeatures,repair].every(r=>r.status==='completed'&&r.endPinsChecked)&&oldFeatures.encoderClosed);
need(sourcePins.find(p=>p.file===policy.algorithm.file).sha256===policy.algorithm.sha256);
const fusion=compilePairedE5Input(definition),representation=describePairedE5Input(fusion),installed=await loadInstalledHierarchyMatcher();
need(representation.representationHash===policy.representationHash&&installed.descriptor.matcherIdentityHash===policy.matcherHash);
const available=[...original.rows.filter(r=>r.status==='available'),...repair.rows.filter(r=>r.status==='available')];
need(available.length===9&&new Set(available.map(r=>r.url)).size===9);
await directory(OUTPUT);await save(OUTPUT,'inputs.json',{sourcePins,inputPins:ledger,
 protocol:{originalDeclared:12,repairObservations:6,originalUnavailable:7,repairUnavailable:2,
  v1:'Unchanged frozen independent-publisher policy.',v2:'Two distinct material inputs may share one publisher; explicit instructional prefix exclusion; all original vector/dedup/context bounds retained.',
  review:'Post-hoc development candidate following observed coverage gaps; not fresh final validation or proof of independent reporting.'}});
const features=[],observations=[],classification=[],casePins=[];let encoder=null,encoderClosed=false,endPinsChecked=false,failure=null;const started=performance.now();
try{
 for(const r of original.rows.filter(r=>r.status==='available')){
  const pin=oldFeatures.casePins.find(p=>p.file===r.id+'.json');need(pin);const f=await json(D+'general-web-subject-screen-features-20261029/'+pin.file,pin,ledger);need(f.inputHash===r.sourceInputHash);features.push(f);
 }
 encoder=await createPackagedCrawlerEmbedder({expectedManifestSha256:'5766e675660a8fbe74842a69b670a84ce5f9eb457b77032337e4a69d6180b984'});
 for(const r of repair.rows.filter(r=>r.status==='available')){
  need(sha(r.text)===r.bodySha256&&sha(r.title)===r.titleSha256);const at=performance.now(),body=await encoder.embed(r.text),title=await encoder.embed(r.title);
  const paired=applyPairedE5Input(fusion,{sourceId:r.id,sourceVersion:r.sourceInputHash,bodyVector:body.values,titleVector:title.values});
  const f={id:r.id,inputHash:r.sourceInputHash,bodyVector:body.values,titleVector:title.values,pairedVector:paired.vector,representationHash:representation.representationHash,encoderMs:performance.now()-at};
  features.push(f);casePins.push(await save(OUTPUT,r.id+'.json',f));
 }
 for(const r of available){const f=features.find(f=>f.id===r.id);need(f&&f.representationHash===representation.representationHash);
  const match=classifyRootedHierarchyMatcher(installed.matcher,{sourceId:r.id,sourceVersion:r.sourceInputHash,bodyVector:f.bodyVector,titleVector:f.titleVector});
  observations.push({sourceId:r.id,inputHash:r.sourceInputHash,materialHash:sha(JSON.stringify([r.bodySha256,r.titleSha256])),title:r.title,publisherKey:r.publisherKey,acceptedPath:match.semanticPath,vector:f.pairedVector});
  classification.push({sourceId:r.id,title:r.title,acceptedPath:match.semanticPath,reason:match.reason});
 }
}catch{failure={stage:'feature-preparation',completed:features.length};}
finally{if(encoder)try{await encoder.close();encoderClosed=true;}catch{failure??={stage:'encoder-close'};}}
const comparisons=[];
if(!failure)for(const [name,algorithm]of [['v1',v1],['v2',v2]]){
 const raw=JSON.stringify({representationHash:policy.representationHash,matcherHash:policy.matcherHash,minimumSimilarity:.8,observations}),output=algorithm(raw),timings=[];
 for(let i=0;i<100;i++){const at=performance.now();algorithm(raw);timings.push(performance.now()-at);}timings.sort((a,b)=>a-b);
 comparisons.push({name,output,covered:output.selections.filter(s=>s.preferredProposalKey!==null).length,timing:{repetitions:100,p50Ms:timings[49],p95Ms:timings[94]}});
}
try{await endPins(ledger,files,sourcePins);endPinsChecked=true;}catch{failure??={stage:'end-pins'};}
const result={schema:'general-web-subject-policy-comparison/v1',status:failure?'failed':'completed',failure,
 counts:{originalDeclared:12,originalAvailable:5,originalUnavailable:7,repairObservations:6,repairAvailable:4,repairUnavailable:2,uniqueAvailable:9},
 classification,comparisons,casePins,sourcePins,inputPins:ledger,endPinsChecked,encoderClosed,elapsedMs:performance.now()-started,
 originalOutcomesRetained:true,wikipediaRequired:false,providerUsed:false,liveChanged:false,registryChanged:false,assignmentAuthority:false,independentValidation:false,eventIdentityAsserted:false};
console.log(JSON.stringify({status:result.status,counts:result.counts,encoderClosed,endPinsChecked,
 comparisons:comparisons.map(c=>({name:c.name,covered:c.covered,names:c.output.proposals.map(p=>({label:p.label,members:p.members.map(m=>m.sourceId),publishers:p.publishers,parent:p.parentProposalKey})),timing:c.timing})),
 result:await save(OUTPUT,'result.json',result)}));if(result.status!=='completed')process.exitCode=1;
