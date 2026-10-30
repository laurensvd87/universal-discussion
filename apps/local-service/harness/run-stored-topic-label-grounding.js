// ONE local E5 model, single-threaded and serial; no SQL/provider/network or
// live worker change. Reused45-page DEV: no prospective validation claim.
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {statfs} from 'node:fs/promises';import {freemem} from 'node:os';
import {benchmarkNeed as need,benchmarkSourcePins as pins,checkBenchmarkPins as endPins,createBenchmarkOutput as directory,
 saveBenchmarkJson as save,readBenchmarkJson as json} from './hierarchy-benchmark-files.js';
import {createPackagedCrawlerEmbedder} from '../src/crawler/packaged-e5.js';
import {prepareStoredValidation} from './stored-topic-validation-v2.js';
import {decodeEmbeddingBase64Array} from '../portable/canonical-v4/embedding-binary-wire.js';
import {compareLabelGrounding,LABEL_GROUNDING_GRID} from '../experiments/automatic-topic-discovery-v4/label-grounding.js';
const ROOT='apps/local-service/data/canonical-migration-backups/',BASE=ROOT+'automatic18-new-domain-validation-20261030',
 PREVIOUS=ROOT+'automatic18-title-evidence-development-20261030',OUTPUT=ROOT+'automatic18-label-grounding-development-20261030';
const FILES=['apps/local-service/harness/run-stored-topic-label-grounding.js',
 'apps/local-service/experiments/automatic-topic-discovery-v4/label-grounding.js','apps/local-service/experiments/automatic-topic-discovery-v4/label-grounding.test.js',
 'apps/local-service/src/crawler/packaged-e5.js','spikes/topic-resolution/browser/embedding/embedding-contract.js',
 'spikes/topic-resolution/browser/embedding/.assets/manifest.json'];
const canonical=s=>s.normalize('NFKC').trim().toLowerCase();
function score(variants,labels,annotations){
 const gold=new Map(annotations.map(a=>[a.sourceId,a])),names=new Map(labels.map(p=>[p.key,p.label]));
 return variants.map(variant=>{
  let correct=0,wrong=0,unknownAssigned=0,abstained=0,correctPairs=0,wrongPairs=0,missedPairs=0;
  for(const s of variant.selections){const a=gold.get(s.sourceId);need(a);
   if(s.key===null){if(a.subjects.length)abstained++;continue;}if(!a.subjects.length){unknownAssigned++;continue;}
   if(a.subjects.some(t=>t.labels.some(l=>canonical(l)===canonical(names.get(s.key)))))correct++;else wrong++;
  }
  const reviewed=variant.selections.filter(s=>gold.get(s.sourceId).subjects.length);
  for(let i=0;i<reviewed.length;i++)for(let j=0;j<i;j++){
   const a=reviewed[i],b=reviewed[j],same=gold.get(a.sourceId).subjects.some(s=>gold.get(b.sourceId).subjects.some(t=>t.key===s.key)),merged=a.key!==null&&a.key===b.key;
   if(merged){if(same)correctPairs++;else wrongPairs++;}else if(same)missedPairs++;
  }
  return {view:variant.view,threshold:variant.threshold,margin:variant.margin,assigned:variant.assigned,correct,wrong,unknownAssigned,abstained,correctPairs,wrongPairs,missedPairs};
 });
}
let used=false;
export async function compareStoredTopicLabelGrounding(){
 need(arguments.length===0&&!used);used=true;const newPins=await pins(FILES),ledger=[];
 const cohort=await json(BASE+'/cohort.json',{sha256:'9c44028aec78038ccec0c0e9a9baa8e3167f987153e69df180ad6f66be23d350'},ledger),
  annotations=await json(BASE+'/annotations.json',{sha256:'f5418127816b5bbed01808fa327aac01286af45096e95c4cf23af116a4fbeb72'},ledger),
  previous=await json(PREVIOUS+'/evaluation-result.json',{sha256:'5be9200cbe31f1e1ef858f85ae3fdcb9253e0c70b83ddcbd285d9d8c8b28509e'},ledger),
  definition=await json('apps/local-service/assets/hierarchy/input-definition.json',{sha256:'2ec96c1244761b9688e5fea2a2dec168df1ac961aa2d440fcd42bdb085e6096c'},ledger);
 need(previous.status==='completed'&&previous.sourceEndPinsPassed&&cohort.rows.length===45&&previous.evaluation.algorithmOutput.proposals.length===10);
 const oldFiles=new Set(previous.sourcePins.map(p=>p.file)),sourcePins=[...previous.sourcePins,...newPins.filter(p=>!oldFiles.has(p.file))],files=sourcePins.map(p=>p.file);
 for(const p of newPins)if(oldFiles.has(p.file))need(previous.sourcePins.some(old=>JSON.stringify(old)===JSON.stringify(p)));
 const checkResources=async()=>{const d=await statfs('D:\\',{bigint:true});need(d.bavail*d.bsize>=4294967296n+1048576n&&freemem()>=1073741824);};
 await endPins(ledger,files,sourcePins);await checkResources();await directory(OUTPUT);
 await save(OUTPUT,'inputs.json',{sourcePins,inputPins:ledger,grid:LABEL_GROUNDING_GRID,
  protocol:{labels:'Exactly10 names from unmodified retained title-evidence proposals; no gold names or extra sense descriptions',
   labelEmbeddings:10,model:'Same packaged multilingual-e5-small/query prefix, one serial model, one WASM thread',
   sampledActiveBudgetMs:45000,heapMiB:512,sampledFreePhysicalBytes:1073741824,sampledFreeDBytes:4294967296,
   selection:'Top label must also be lexical-supported; require two surviving members for a new head',
   scope:'Reused DEV only; no cutoff or production policy selected; Node heap cap is not a total native-memory quota.'},
  databaseOpened:false,providerUsed:false,liveChanged:false});
 const labels=[],started=performance.now();let encoder=null,encoderClosed=false,failure=null,comparison=null,metrics=null,sourceEndPinsPassed=false,initializationMs=null;
 try{
  await checkResources();encoder=await createPackagedCrawlerEmbedder({expectedManifestSha256:'5766e675660a8fbe74842a69b670a84ce5f9eb457b77032337e4a69d6180b984'});initializationMs=performance.now()-started;
  for(const p of previous.evaluation.algorithmOutput.proposals){await checkResources();need(performance.now()-started<45000);const at=performance.now(),encoded=await encoder.embed(p.label);
   await checkResources();need(performance.now()-started<45000);
   need(encoded.modelId==='e5-small-q8-browser-main-prefix-v1');labels.push({key:p.proposalKey,label:p.label,vector:encoded.values,members:p.members.map(m=>m.sourceId),encodingMs:performance.now()-at});
  }
 }catch{failure={stage:'local-label-encoding',completed:labels.length};}
 finally{if(encoder)try{await encoder.close();encoderClosed=true;}catch{failure??={stage:'encoder-close'};}}
 if(!failure)try{
  const paired=prepareStoredValidation({rows:cohort.rows,inputDefinition:definition,matcherHash:cohort.metadata.matcher_hash});
  const observations=cohort.rows.map((r,i)=>({sourceId:r.sourceId,body:decodeEmbeddingBase64Array(r.bodyBase64),title:decodeEmbeddingBase64Array(r.titleBase64),paired:paired.observations[i].vector}));
  comparison=compareLabelGrounding(observations,labels);metrics=score(comparison.variants,labels,annotations.rows);
 }catch{failure={stage:'geometry-or-scoring'};}
 try{await endPins(ledger,files,sourcePins);sourceEndPinsPassed=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'stored-topic-label-grounding-development/v1',status:failure?'failed':'completed',failure,labels,comparison,metrics,
  sourcePins,inputPins:ledger,sourceEndPinsPassed,encoderClosed,initializationMs,elapsedMs:performance.now()-started,memory:process.memoryUsage(),
  scope:{postHocDevelopment:true,representativeQuality:false,policySelected:false,publication:false,liveChanged:false,providerUsed:false,networkOpened:false,databaseOpened:false,
   modelAssetsVerifiedAtLoad:true,modelAssetsEndPins:'Require separate terminal manifest-asset audit before any source edit'}};
 return {status:result.status,encoded:labels.length,metrics,encoderClosed,sourceEndPinsPassed,initializationMs,elapsedMs:result.elapsedMs,memory:result.memory,
  result:await save(OUTPUT,'evaluation-result.json',result)};
}
export async function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length!==1||args[0]!=='--compare-label-grounding-development')return 2;
 try{const r=await compareStoredTopicLabelGrounding();process.stdout.write(JSON.stringify(r)+'\n');return r.status==='completed'?0:1;}
 catch{process.stderr.write('Local label-grounding development unavailable; no live changes.\n');return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(exitCode=>{process.exitCode=exitCode;});
