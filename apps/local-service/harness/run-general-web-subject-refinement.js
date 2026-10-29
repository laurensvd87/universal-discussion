// Offline post-hoc DEV refinement. Reuse all9 original/repaired feature rows.
// No new capture/encoding/SQL, frozen v1 edit, publisher fabrication or TEST use.
import {benchmarkNeed as need,readBenchmarkJson as json,benchmarkSourcePins as pins,checkBenchmarkPins as endPins,
 createBenchmarkOutput as directory,saveBenchmarkJson as save} from './hierarchy-benchmark-files.js';
import {proposeFocusedSubjects} from '../experiments/automatic-topic-discovery-v2/focus-subjects.js';
const D='apps/local-service/data/',OUTPUT=D+'general-web-subject-refinement-20261029';
if(process.argv.length!==3||process.argv[2]!=='--refine-general-label-evidence')throw Error('Explicit offline general label refinement required');
const files=['apps/local-service/harness/run-general-web-subject-refinement.js','apps/local-service/harness/hierarchy-benchmark-files.js',
 'apps/local-service/experiments/automatic-topic-discovery-v2/focus-subjects.js','apps/local-service/experiments/automatic-topic-discovery-v2/focus-subjects.test.js'],sourcePins=await pins(files),ledger=[];
const prior=await json(D+'general-web-subject-variants-20261029/result.json',{sha256:'ed49a8b7b2a7241a405f0862c7a8cf16f88d9532bcdd7c0b9b0bd2ef630702f5'},ledger),
 original=await json(D+'general-web-subject-screen-capture-20261029/result.json',{sha256:'a464fc8d95c266e94d2ae50f6f3997e7f71e61311699b1d55ff35b39ef132d47'},ledger),
 originalFeatures=await json(D+'general-web-subject-screen-features-20261029/result.json',{sha256:'0ac97b6560ca5208f49667cb97a583d094ff3ed03e67db37d84f69e1fe670a06'},ledger),
 repair=await json(D+'general-web-subject-repair-capture-20261029/result.json',{sha256:'f1563c82dccb453f88ad8f9f835ec9e3538ab6910cebbb9fe71b2ab57436c41e'},ledger),
 policy=await json('apps/local-service/experiments/automatic-topic-discovery-v1/focus-policy.json',null,ledger);
need(prior.status==='completed'&&prior.encoderClosed&&prior.endPinsChecked);
const observations=[],available=[...original.rows.filter(r=>r.status==='available'),...repair.rows.filter(r=>r.status==='available')];need(available.length===9);
for(const r of available){const old=originalFeatures.casePins.find(p=>p.file===r.id+'.json'),pin=old??prior.casePins.find(p=>p.file===r.id+'.json');need(pin);
 const feature=await json(D+(old?'general-web-subject-screen-features-20261029/':'general-web-subject-variants-20261029/')+pin.file,pin,ledger);
 need(feature.inputHash===r.sourceInputHash&&feature.representationHash===policy.representationHash);
 observations.push({sourceId:r.id,inputHash:r.sourceInputHash,materialHash:r.bodySha256,title:r.title,publisherKey:r.publisherKey,
  acceptedPath:prior.classification.find(c=>c.sourceId===r.id).acceptedPath,vector:feature.pairedVector});
}
const raw=JSON.stringify({representationHash:policy.representationHash,matcherHash:policy.matcherHash,minimumSimilarity:.8,observations}),output=proposeFocusedSubjects(raw),timings=[];
for(let i=0;i<100;i++){const at=performance.now();proposeFocusedSubjects(raw);timings.push(performance.now()-at);}timings.sort((a,b)=>a-b);
await endPins(ledger,files,sourcePins);await directory(OUTPUT);
const result={schema:'general-web-subject-label-refinement/v1',status:'completed',counts:prior.counts,output,timing:{repetitions:100,p50Ms:timings[49],p95Ms:timings[94]},
 sourcePins,inputPins:ledger,endPinsChecked:true,developmentOnly:true,encoderOpened:false,providerUsed:false,wikipediaRequired:false,registryChanged:false,liveChanged:false,assignmentAuthority:false,independentValidation:false,
 note:'Post-hoc DEV correction after one-publisher support exposed publisher/instruction labels. All9 usable pages and all12+6 capture outcomes retained. Not a fresh quality or SQL/UI result.'};
console.log(JSON.stringify({status:result.status,covered:output.selections.filter(s=>s.preferredProposalKey!==null).length,
 names:output.proposals.map(p=>({label:p.label,members:p.members.map(m=>m.sourceId),publishers:p.publishers})),timing:result.timing,result:await save(OUTPUT,'result.json',result)}));
