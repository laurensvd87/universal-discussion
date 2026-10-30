// Read-only in-memory calculation on retained DEV vectors and local label
// embeddings. No file output, SQL, encoder, provider, browser or network.
// This is NOT the native/private fixture and does not change its resource floors.
import path from 'node:path';import {fileURLToPath} from 'node:url';import {freemem} from 'node:os';
import {benchmarkNeed as need,benchmarkSha as sha,benchmarkSourcePins as pins,checkBenchmarkPins as endPins,
 readBenchmarkJson as json} from './hierarchy-benchmark-files.js';
import {decodeEmbeddingBase64Array} from '../portable/canonical-v4/embedding-binary-wire.js';
import {compareNamedSenseResiduals,SENSE_RESIDUAL_GRID} from '../experiments/automatic-topic-discovery-v4/sense-residual.js';
const ROOT='apps/local-service/data/canonical-migration-backups/',BASE=ROOT+'automatic18-new-domain-validation-20261030',
 PREVIOUS=ROOT+'automatic18-label-grounding-development-20261030';
const FILES=['apps/local-service/harness/run-stored-topic-residual-development.js',
 'apps/local-service/experiments/automatic-topic-discovery-v4/sense-residual.js','apps/local-service/experiments/automatic-topic-discovery-v4/sense-residual.test.js'];
const canonical=s=>s.normalize('NFKC').trim().toLowerCase();
export function scoreResidualDevelopment(comparison,annotations){
 need(Array.isArray(comparison?.variants)&&Array.isArray(annotations));const gold=new Map();
 for(const a of annotations){need(a&&typeof a.sourceId==='string'&&!gold.has(a.sourceId)&&Array.isArray(a.subjects));gold.set(a.sourceId,a);}
 return comparison.variants.map(variant=>{
  need(variant.selections.length===gold.size&&new Set(variant.selections.map(s=>s.sourceId)).size===gold.size);
  const names=new Map(variant.groups.map(g=>[g.key,g.label]));
  let correct=0,wrong=0,unknownAssigned=0,abstained=0,correctPairs=0,wrongPairs=0,missedPairs=0;
  for(const s of variant.selections){const a=gold.get(s.sourceId);need(a);
   if(s.key===null){if(a.subjects.length)abstained++;continue;}need(names.has(s.key));if(!a.subjects.length){unknownAssigned++;continue;}
   if(a.subjects.some(t=>t.labels.some(l=>canonical(l)===canonical(names.get(s.key)))))correct++;else wrong++;
  }
  const reviewed=variant.selections.filter(s=>gold.get(s.sourceId).subjects.length);
  for(let i=0;i<reviewed.length;i++)for(let j=0;j<i;j++){
   const a=reviewed[i],b=reviewed[j],same=gold.get(a.sourceId).subjects.some(s=>gold.get(b.sourceId).subjects.some(t=>t.key===s.key)),merged=a.key!==null&&a.key===b.key;
   if(merged){if(same)correctPairs++;else wrongPairs++;}else if(same)missedPairs++;
  }
  return {mode:variant.mode,threshold:variant.threshold,assigned:variant.selections.filter(s=>s.key!==null).length,correct,wrong,unknownAssigned,abstained,
   correctPairs,wrongPairs,missedPairs,groups:variant.groups.length,unavailableResiduals:variant.unavailableResiduals};
 });
}
let used=false;
export async function compareStoredTopicResidualDevelopment(){
 need(arguments.length===0&&!used&&freemem()>=1073741824);used=true;const newPins=await pins(FILES),ledger=[];
 const cohort=await json(BASE+'/cohort.json',{sha256:'9c44028aec78038ccec0c0e9a9baa8e3167f987153e69df180ad6f66be23d350'},ledger),
  annotations=await json(BASE+'/annotations.json',{sha256:'f5418127816b5bbed01808fa327aac01286af45096e95c4cf23af116a4fbeb72'},ledger),
  previous=await json(PREVIOUS+'/evaluation-result.json',{sha256:'aad69eda9ad457438fd761741e9776a77239807ba0d133d6b8cf3b3761948048'},ledger);
 need(previous.status==='completed'&&previous.encoderClosed&&previous.sourceEndPinsPassed&&cohort.rows.length===45&&previous.labels.length===10);
 const sourcePins=[...previous.sourcePins,...newPins],files=sourcePins.map(p=>p.file);need(new Set(files).size===files.length);
 await endPins(ledger,files,sourcePins);
 const observations=cohort.rows.map(r=>({sourceId:r.sourceId,body:decodeEmbeddingBase64Array(r.bodyBase64)})),at=performance.now();
 const comparison=compareNamedSenseResiduals(observations,previous.labels),computationMs=performance.now()-at;
 const metrics=scoreResidualDevelopment(comparison,annotations.rows);
 await endPins(ledger,files,sourcePins);need(freemem()>=1073741824);
 return {schema:'stored-topic-residual-development-result/v1',status:'completed',rows:45,labels:10,grid:SENSE_RESIDUAL_GRID,metrics,computationMs,
  sourcePinsSha256:sha(JSON.stringify(sourcePins)),sourcePinCount:sourcePins.length,inputPins:ledger,sourceEndPinsPassed:true,memory:process.memoryUsage(),
  scope:{postHocDevelopment:true,prospectiveQuality:false,policySelected:false,parenthoodAsserted:false,newEncoder:false,
   filesWritten:false,databaseOpened:false,providerUsed:false,networkOpened:false,publication:false,liveChanged:false}};
}
export async function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length!==1||args[0]!=='--compare-residual-development')return 2;
 try{const result=await compareStoredTopicResidualDevelopment();process.stdout.write(JSON.stringify(result)+'\n');return 0;}
 catch{process.stderr.write('Read-only residual development unavailable; no live changes.\n');return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(exitCode=>{process.exitCode=exitCode;});
