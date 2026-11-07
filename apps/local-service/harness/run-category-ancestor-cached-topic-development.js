// Replay retained DEV vectors only. No encoder, provider, network, SQL or backup.
// Categories and thresholds are fixed in source before this comparison.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {benchmarkNeed as need,benchmarkSourcePins as pins,checkBenchmarkPins as endPins,
 createBenchmarkOutput as directory,saveBenchmarkJson as save,readBenchmarkJson as json} from './hierarchy-benchmark-files.js';
import {compileCachedSemanticTopicIndex as compileV3} from '../experiments/automatic-topic-discovery-v4/cached-semantic-topic-index-v3.js';
import {compileCachedSemanticTopicIndex as compileV4} from '../experiments/automatic-topic-discovery-v4/cached-semantic-topic-index-v4.js';
import {PUBLIC_SEMANTIC_CATEGORY_KINDS} from '../experiments/automatic-topic-discovery-v4/public-semantic-category-kinds.js';
import {scoreCachedTopicTransfer} from '../experiments/automatic-topic-discovery-v4/cached-topic-transfer-gold.js';
import {scoreFreshCachedTopicTransfer} from '../experiments/automatic-topic-discovery-v4/cached-topic-fresh-gold.js';

const DIR='apps/local-service/experiments/automatic-topic-discovery-v4/';
const FILES=['cached-semantic-topic-index-v3.js','cached-semantic-topic-index-v4.js','cached-semantic-topic-index-v4.test.js',
 'semantic-subject-kinds.js','public-semantic-category-kinds.js','public-semantic-category-kinds.test.js',
 'cached-topic-transfer-gold.js','cached-topic-fresh-gold.js'].map(file=>DIR+file).concat([
 'apps/local-service/harness/hierarchy-benchmark-files.js','apps/local-service/harness/run-category-ancestor-cached-topic-development.js']);
const BASE='apps/local-service/data/canonical-migration-backups/';
const OUTPUT='apps/local-service/data/topic-ancestor-fallback-development-20261107';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
let consumed=false;
export async function compareCategoryAncestorCachedTopics(){
 need(arguments.length===0&&!consumed);consumed=true;
 const sourcePins=await pins(FILES),inputPins=[];
 const original=await json(BASE+'cached-topic-definitions-development-20261030/evaluation-result.json',
  {sha256:'bfdba1958be422649ed83aaa7b54bdd6b12dbee554afff3ae56949c40971e496'},inputPins);
 const subsequent=await json(BASE+'cached-topic-fresh-validation-20261030/evaluation-result.json',
  {sha256:'1ec0ff6d41e0906fba09022301d711202c480d0a98d5556a4e650583d4016ee5'},inputPins);
 const previous=await json(BASE+'cached-topic-class-aware-development-20261030/evaluation-result.json',
  {sha256:'cf20843fc38c1886f6383399ed31d2241be38bd1512c0af8dbc6d7de60d1fec4'},inputPins);
 need(original.status==='completed'&&original.encoderClosed&&original.endPinsPassed&&subsequent.status==='completed'&&
  subsequent.encoderClosed&&subsequent.endPinsPassed&&previous.status==='completed'&&previous.sourceEndPinsPassed&&
  original.bank.bankHash===subsequent.bankHash&&previous.index.bankHash===original.bank.bankHash);
 const bank=original.bank,encoded=original.encoded.map(({id,values})=>({id,values}));
 const categoryKinds={schema:'semantic-category-kinds/v1',bankHash:bank.bankHash,rows:PUBLIC_SEMANTIC_CATEGORY_KINDS};
 const prior=compileV3(bank,encoded,previous.kinds),current=compileV4(bank,encoded,previous.kinds,JSON.stringify(categoryKinds));
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
   if(before.aliasMatches>0)for(const key of ['supportedPath','selectedPath','labels','reason','aliasMatches'])need(same(lookup[key],before[key]));
   need(lookup.supportedPath.every(id=>bank.nodes.some(node=>node.id===id)));
   rows.push({cohort:cohort.id,id:query.id,beforeLabels:before.labels,lookup,lookupMs});
  }
 }
 const metrics=cohorts.map(cohort=>({cohort:cohort.id,...cohort.score(rows.filter(row=>row.cohort===cohort.id))}));
 const changes=rows.filter(row=>!same(row.beforeLabels,row.lookup.labels)).map(row=>({cohort:row.cohort,id:row.id,
  before:row.beforeLabels,after:row.lookup.labels,reason:row.lookup.reason}));
 const elapsedMs=performance.now()-started;need(elapsedMs<5000);
 await endPins(inputPins,FILES,sourcePins);
 await directory(OUTPUT);
 const result={schema:'category-ancestor-cached-topic-development/v1',status:'completed',sourcePins,inputPins,index:current.describe(),categoryKinds,
  controls:{retainedV3ResultsEqual:21,acceptedLexicalResultsUnchanged:rows.filter(row=>row.lookup.aliasMatches>0).length},rows,changes,metrics,elapsedMs,
  sourceAndInputEndPinsPassed:true,scope:{postHocDevelopment:true,freshHoldout:false,representativeQuality:false,
   modelUsed:false,providerUsed:false,queryReencoded:false,thresholdsChanged:false,aliasesChanged:false,treeChanged:false,
   canonicalIdsAssigned:false,publication:false,databaseOpened:false,backupCreated:false,liveChanged:false}};
 return {status:result.status,controls:result.controls,changes,metrics,elapsedMs,sourceAndInputEndPinsPassed:true,
  result:await save(OUTPUT,'evaluation-result.json',result)};
}
export async function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length!==1||args[0]!=='--compare-category-ancestor-cached-topics')return 2;
 try{process.stdout.write(JSON.stringify(await compareCategoryAncestorCachedTopics())+'\n');return 0;}
 catch{process.stderr.write('Category ancestor DEV replay failed.\n');return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(code=>{process.exitCode=code;});
