// Retained DEV control after rejecting v4's cosine-only over-refinements.
// This bank has no independently calibrated intermediate membership heads.
// V5 must preserve broad v3 decisions rather than manufacture missing evidence.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {benchmarkNeed as need,benchmarkSourcePins as pins,checkBenchmarkPins as endPins,
 createBenchmarkOutput as directory,saveBenchmarkJson as save,readBenchmarkJson as json} from './hierarchy-benchmark-files.js';
import {compileCachedSemanticTopicIndex as compileV3} from '../experiments/automatic-topic-discovery-v4/cached-semantic-topic-index-v3.js';
import {compileCachedSemanticTopicIndex as compileV5} from '../experiments/automatic-topic-discovery-v4/cached-semantic-topic-index-v5.js';
import {scoreCachedTopicTransfer} from '../experiments/automatic-topic-discovery-v4/cached-topic-transfer-gold.js';
import {scoreFreshCachedTopicTransfer} from '../experiments/automatic-topic-discovery-v4/cached-topic-fresh-gold.js';

const DIR='apps/local-service/experiments/automatic-topic-discovery-v4/';
const FILES=['cached-semantic-topic-index-v3.js','cached-semantic-topic-index-v5.js','cached-semantic-topic-index-v5.test.js',
 'semantic-subject-kinds.js','cached-topic-transfer-gold.js','cached-topic-fresh-gold.js'].map(file=>DIR+file).concat([
 'apps/local-service/src/domain/hierarchy-rooted-matcher.js','apps/local-service/src/domain/hierarchy-binary-detail.js',
 'apps/local-service/src/domain/hierarchical-e5-paired-input.js','apps/local-service/src/domain/hierarchical-e5-paired-linear-heads.js',
 'apps/local-service/src/domain/hierarchical-e5-observed-head-policy.js',
 'apps/local-service/experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js',
 'apps/local-service/harness/hierarchy-benchmark-files.js','apps/local-service/harness/run-supported-ancestor-cached-topic-development.js']);
const BASE='apps/local-service/data/canonical-migration-backups/';
const OUTPUT='apps/local-service/data/topic-supported-ancestor-development-20261107';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const projection=result=>Object.fromEntries(['supportedPath','selectedPath','labels','reason','aliasMatches','groupingHash','scope'].map(key=>[key,result[key]]));
let consumed=false;
export async function compareSupportedAncestorCachedTopics(){
 need(arguments.length===0&&!consumed);consumed=true;
 const sourcePins=await pins(FILES),inputPins=[];
 const original=await json(BASE+'cached-topic-definitions-development-20261030/evaluation-result.json',
  {sha256:'bfdba1958be422649ed83aaa7b54bdd6b12dbee554afff3ae56949c40971e496'},inputPins);
 const subsequent=await json(BASE+'cached-topic-fresh-validation-20261030/evaluation-result.json',
  {sha256:'1ec0ff6d41e0906fba09022301d711202c480d0a98d5556a4e650583d4016ee5'},inputPins);
 const previous=await json(BASE+'cached-topic-class-aware-development-20261030/evaluation-result.json',
  {sha256:'cf20843fc38c1886f6383399ed31d2241be38bd1512c0af8dbc6d7de60d1fec4'},inputPins);
 const rejected=await json('apps/local-service/data/topic-ancestor-fallback-development-20261107/evaluation-result.json',
  {bytes:39176,sha256:'8011622eda10a00382f8d68b547abfc85cdfe87d6455ecd331015385860597a2'},inputPins);
 need(original.status==='completed'&&original.encoderClosed&&original.endPinsPassed&&subsequent.status==='completed'&&
  subsequent.encoderClosed&&subsequent.endPinsPassed&&previous.status==='completed'&&previous.sourceEndPinsPassed&&
  original.bank.bankHash===subsequent.bankHash&&previous.index.bankHash===original.bank.bankHash&&
  rejected.sourceAndInputEndPinsPassed&&rejected.metrics.reduce((total,row)=>total+row.wrong,0)===2);
 const bank=original.bank,encoded=original.encoded.map(({id,values})=>({id,values}));
 const prior=compileV3(bank,encoded,previous.kinds),current=compileV5(bank,encoded,previous.kinds,null);
 const cohorts=[{id:'original12-now-development',queries:original.queries,score:scoreCachedTopicTransfer,count:12},
  {id:'fresh9-now-development',queries:subsequent.queries,score:scoreFreshCachedTopicTransfer,count:9}];
 need(previous.rows.length===21&&new Set(previous.rows.map(row=>row.cohort+'/'+row.id)).size===21);
 const retained=new Map(previous.rows.map(row=>[row.cohort+'/'+row.id,row.lookup])),rows=[];
 const started=performance.now();
 for(const cohort of cohorts){
  need(cohort.queries.length===cohort.count);
  for(const query of cohort.queries){
   const before=prior.lookup(query.input);need(same(before,retained.get(cohort.id+'/'+query.id)));
   const at=performance.now(),lookup=current.lookup(query.input),lookupMs=performance.now()-at;
   need(same(projection(before),projection(lookup)));
   rows.push({cohort:cohort.id,id:query.id,lookup,lookupMs});
  }
 }
 const metrics=cohorts.map(cohort=>({cohort:cohort.id,...cohort.score(rows.filter(row=>row.cohort===cohort.id))}));
 const elapsedMs=performance.now()-started;need(elapsedMs<5000);
 await endPins(inputPins,FILES,sourcePins);
 await directory(OUTPUT);
 const result={schema:'supported-ancestor-cached-topic-development/v1',status:'completed',sourcePins,inputPins,index:current.describe(),
  controls:{retainedV3ResultsEqual:21,noHeadProjectionsEqual:21},rows,metrics,elapsedMs,sourceAndInputEndPinsPassed:true,
  scope:{postHocDevelopment:true,freshHoldout:false,representativeQuality:false,membershipHeadsAvailable:false,
   modelUsed:false,providerUsed:false,queryReencoded:false,thresholdsChanged:false,aliasesChanged:false,treeChanged:false,
   canonicalIdsAssigned:false,publication:false,databaseOpened:false,backupCreated:false,liveChanged:false}};
 return {status:result.status,controls:result.controls,metrics,elapsedMs,sourceAndInputEndPinsPassed:true,
  result:await save(OUTPUT,'evaluation-result.json',result)};
}
export async function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length!==1||args[0]!=='--compare-supported-ancestor-cached-topics')return 2;
 try{process.stdout.write(JSON.stringify(await compareSupportedAncestorCachedTopics())+'\n');return 0;}
 catch{process.stderr.write('Supported ancestor DEV replay failed.\n');return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(code=>{process.exitCode=code;});
