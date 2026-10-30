// Posthoc DEV, no model/provider/SQL/network. Reuse the exact definition-bank
// and twelve query vectors. Only the named-subject evidence rule changes.
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {benchmarkNeed as need,benchmarkSourcePins as pins,checkBenchmarkPins as endPins,createBenchmarkOutput as directory,
 saveBenchmarkJson as save,readBenchmarkJson as json} from './hierarchy-benchmark-files.js';
import {compileCachedSemanticTopicIndex} from '../experiments/automatic-topic-discovery-v4/cached-semantic-topic-index-v2.js';
import {scoreCachedTopicTransfer} from '../experiments/automatic-topic-discovery-v4/cached-topic-transfer-gold.js';
const DIR='apps/local-service/experiments/automatic-topic-discovery-v4/',FILES=[DIR+'cached-semantic-topic-index-v2.js',DIR+'cached-semantic-topic-index-v2.test.js',
 DIR+'cached-topic-transfer-gold.js','apps/local-service/harness/run-paired-cached-topic-development.js','apps/local-service/harness/hierarchy-benchmark-files.js'];
const OUTPUT='apps/local-service/data/canonical-migration-backups/cached-topic-paired-development-20261030';
const distribution=values=>{const xs=[...values].sort((a,b)=>a-b);return {count:xs.length,p50:xs[Math.ceil(xs.length*.5)-1],p95:xs[Math.ceil(xs.length*.95)-1],max:xs.at(-1)};};
let consumed=false;
export async function comparePairedCachedTopicDevelopment(){
 need(arguments.length===0&&!consumed);consumed=true;const fresh=await pins(FILES),ledger=[];
 const previous=await json('apps/local-service/data/canonical-migration-backups/cached-topic-definitions-development-20261030/evaluation-result.json',
  {sha256:'bfdba1958be422649ed83aaa7b54bdd6b12dbee554afff3ae56949c40971e496'},ledger);
 need(previous.status==='completed'&&previous.failure===null&&previous.endPinsPassed&&previous.encoderClosed&&previous.queries.length===12&&previous.encoded.length===24);
 const sourcePins=[...previous.sourcePins],known=new Map(sourcePins.map(pin=>[pin.file,pin]));
 for(const pin of fresh){if(known.has(pin.file))need(JSON.stringify(known.get(pin.file))===JSON.stringify(pin));else sourcePins.push(pin);}
 const files=sourcePins.map(pin=>pin.file);await endPins(ledger,files,sourcePins);await directory(OUTPUT);
 const started=performance.now(),index=compileCachedSemanticTopicIndex(previous.bank,previous.encoded.map(({id,values})=>({id,values}))),rows=[];
 for(const query of previous.queries){const at=performance.now(),lookup=index.lookup(query.input);rows.push({id:query.id,lookup,lookupMs:performance.now()-at});}
 const repeated=[];for(let repeat=0;repeat<32;repeat++)for(let i=0;i<previous.queries.length;i++){
  const at=performance.now(),again=index.lookup(previous.queries[i].input);repeated.push(performance.now()-at);need(JSON.stringify(again)===JSON.stringify(rows[i].lookup));
 }
 const metrics=scoreCachedTopicTransfer(rows),timings={initialLookupMs:distribution(rows.map(row=>row.lookupMs)),repeatedLookupMs:distribution(repeated)};
 need(performance.now()-started<5000);await endPins(ledger,files,sourcePins);
 const result={schema:'cached-topic-paired-development-actual/v1',status:'completed',bankHash:previous.bank.bankHash,sourcePins,inputPins:ledger,
  rows,metrics,timings,baselineMetrics:previous.metrics,elapsedMs:performance.now()-started,sourceEndPinsPassed:true,
  scope:{postHocDevelopment:true,independentValidation:false,representativeQuality:false,providerUsed:false,modelUsed:false,
   queryReencoded:false,thresholdGrid:false,canonicalIdsAssigned:false,policySelected:false,publication:false,liveChanged:false,databaseOpened:false}};
 return {status:result.status,metrics,timings,elapsedMs:result.elapsedMs,sourceEndPinsPassed:true,result:await save(OUTPUT,'evaluation-result.json',result)};
}
export async function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length!==1||args[0]!=='--compare-cached-topic-paired-development')return 2;
 try{const result=await comparePairedCachedTopicDevelopment();process.stdout.write(JSON.stringify(result)+'\n');return 0;}
 catch{process.stderr.write('Cached paired-topic development unavailable; no live change.\n');return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(code=>{process.exitCode=code;});
