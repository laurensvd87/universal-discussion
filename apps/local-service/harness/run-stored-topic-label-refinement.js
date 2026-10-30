// Post-hoc DEV correction on retained real material. Import is inert. This is
// not new validation, SQL publication, model inference or a live policy switch.
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {benchmarkNeed as need,benchmarkSha as sha,readBenchmarkJson as json,benchmarkSourcePins as pins,
 checkBenchmarkPins as endPins,createBenchmarkOutput as directory,saveBenchmarkJson as save} from './hierarchy-benchmark-files.js';
import {proposeFocusedSubjects as previous} from '../experiments/automatic-topic-discovery-v2/focus-subjects.js';
import {proposeFocusedSubjects as candidate} from '../experiments/automatic-topic-discovery-v3/focus-subjects.js';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';
import {decodeEmbeddingBase64Array} from '../portable/canonical-v4/embedding-binary-wire.js';
const D='apps/local-service/data/',CAPTURE=D+'canonical-migration-backups/automatic18-stored-topic-screen-20261030/',OUTPUT=D+'canonical-migration-backups/automatic18-stored-topic-label-refinement-20261030';
const FILES=['apps/local-service/harness/run-stored-topic-label-refinement.js','apps/local-service/harness/hierarchy-benchmark-files.js',
 'apps/local-service/experiments/automatic-topic-discovery-v2/focus-subjects.js','apps/local-service/experiments/automatic-topic-discovery-v3/focus-subjects.js',
 'apps/local-service/experiments/automatic-topic-discovery-v3/focus-subjects.test.js','apps/local-service/src/domain/hierarchical-e5-paired-input.js','apps/local-service/portable/canonical-v4/embedding-binary-wire.js'];
function compare(input){const raw=JSON.stringify(input),before=previous(raw),after=candidate(raw),times=[];
 for(let i=0;i<30;i++){const at=performance.now();candidate(raw);times.push(performance.now()-at);}times.sort((a,b)=>a-b);
 const assigned=out=>out.selections.filter(s=>s.preferredProposalKey!==null).length;
 return {before,after,counts:{rows:input.observations.length,beforeAssigned:assigned(before),afterAssigned:assigned(after),beforeSubjects:before.proposals.length,afterSubjects:after.proposals.length},
  timing:{repetitions:30,p50Ms:times[14],p95Ms:times[28]}};
}
let used=false;
export async function refineStoredTopicLabels(){need(arguments.length===0&&!used);used=true;const sourcePins=await pins(FILES),ledger=[];
 const captured=await json(CAPTURE+'result.json',{sha256:'5011ea1799632f0d6c9c60c14160274f1eb26095a460e68d00b9ff6ecb49ef39'},ledger);need(captured.status==='completed'&&captured.sourceEndPinsPassed);
 const cohort=await json(CAPTURE+'cohort.json',{sha256:'fcc3713557eedea761befd57f2217a49e40c9e1d4bebdbba8f26d930be293f9b'},ledger);
 const definition=await json('apps/local-service/assets/hierarchy/input-definition.json',{sha256:'2ec96c1244761b9688e5fea2a2dec168df1ac961aa2d440fcd42bdb085e6096c'},ledger),paired=compilePairedE5Input(definition),representationHash=describePairedE5Input(paired).representationHash;
 const storedInput={representationHash,matcherHash:cohort.metadata.matcher_hash,minimumSimilarity:.8,observations:cohort.rows.map(r=>{
  need(sha(Buffer.from(r.bodyBase64,'base64'))===r.bodyWireHash&&sha(Buffer.from(r.titleBase64,'base64'))===r.titleWireHash);
  const inputHash=sha(JSON.stringify([r.sourceId,r.sourceVersion,r.operationId,r.operationDigest,r.sourceStamp])),v=applyPairedE5Input(paired,{sourceId:r.sourceId,sourceVersion:inputHash,bodyVector:decodeEmbeddingBase64Array(r.bodyBase64),titleVector:decodeEmbeddingBase64Array(r.titleBase64)});need(v.status==='available');
  return {sourceId:r.sourceId,inputHash,materialHash:sha(JSON.stringify([r.bodyWireHash,r.titleWireHash])),title:r.title,publisherKey:new URL(r.url).hostname.replace(/^www\./u,''),acceptedPath:r.acceptedPath,vector:v.vector};
 })};
 const stored=compare(storedInput);need(stored.before.proposals.some(p=>p.label==='Alle')&&!stored.after.proposals.some(p=>p.label==='Alle'));
 need(stored.after.proposals.some(p=>p.label==='Kapsalon')&&stored.after.proposals.some(p=>p.label==='GTA 6')&&stored.counts.afterAssigned===stored.counts.beforeAssigned);
 // Recheck every retained usable general-site page, not just the two groups
 // that exposed the defect. All original unavailable captures stay unavailable.
 const original=await json(D+'general-web-subject-screen-capture-20261029/result.json',{sha256:'a464fc8d95c266e94d2ae50f6f3997e7f71e61311699b1d55ff35b39ef132d47'},ledger),
  oldFeatures=await json(D+'general-web-subject-screen-features-20261029/result.json',{sha256:'0ac97b6560ca5208f49667cb97a583d094ff3ed03e67db37d84f69e1fe670a06'},ledger),
  repair=await json(D+'general-web-subject-repair-capture-20261029/result.json',{sha256:'f1563c82dccb453f88ad8f9f835ec9e3538ab6910cebbb9fe71b2ab57436c41e'},ledger),
  variants=await json(D+'general-web-subject-variants-20261029/result.json',{sha256:'ed49a8b7b2a7241a405f0862c7a8cf16f88d9532bcdd7c0b9b0bd2ef630702f5'},ledger);
 const usable=[...original.rows.filter(r=>r.status==='available'),...repair.rows.filter(r=>r.status==='available')];need(usable.length===9);const observations=[];
 for(const row of usable){const old=oldFeatures.casePins.find(p=>p.file===row.id+'.json'),pin=old??variants.casePins.find(p=>p.file===row.id+'.json');need(pin);
  const f=await json(D+(old?'general-web-subject-screen-features-20261029/':'general-web-subject-variants-20261029/')+pin.file,pin,ledger);need(f.inputHash===row.sourceInputHash&&f.representationHash===representationHash);
  observations.push({sourceId:row.id,inputHash:row.sourceInputHash,materialHash:row.bodySha256,title:row.title,publisherKey:row.publisherKey,acceptedPath:variants.classification.find(r=>r.sourceId===row.id).acceptedPath,vector:f.pairedVector});
 }
 const regression=compare({representationHash,matcherHash:cohort.metadata.matcher_hash,minimumSimilarity:.8,observations});
 need(regression.counts.beforeAssigned===8&&regression.counts.afterAssigned===8);for(const label of ['Steam Deck','Nintendo Switch','Red panda','Giant panda'])need(regression.after.proposals.some(p=>p.label===label));
 await endPins(ledger,FILES,sourcePins);await directory(OUTPUT);
 const result={schema:'stored-topic-label-refinement/v1',status:'completed',stored,regression,sourcePins,inputPins:ledger,sourceEndPinsPassed:true,
  scope:{developmentOnly:true,postHocRefinement:true,prospectiveValidation:false,representativeAccuracy:false,encoderOpened:false,databaseOpened:false,networkOpened:false,publication:false,liveChanged:false},
  remaining:['Fresh language/domain validation','Explicit new publication policy and SQL integration before runtime use','Independent full-data/application/load/cold-URL gates']};
 return {status:'completed',stored:stored.counts,regression:regression.counts,timing:stored.timing,names:stored.after.proposals.map(p=>p.label),sourceEndPinsPassed:true,liveChanged:false,result:await save(OUTPUT,'result.json',result)};
}
export async function main(args=process.argv.slice(2)){if(!Array.isArray(args)||args.length!==1||args[0]!=='--refine-stored-labels')return 2;try{const r=await refineStoredTopicLabels();process.stdout.write(JSON.stringify(r)+'\n');return 0;}catch{process.stderr.write('Stored label refinement unavailable; no live change.\n');return 1;}}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(exitCode=>{process.exitCode=exitCode;});
