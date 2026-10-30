// Fixed fresh nine-card validation. Reuse the frozen24-node definition bank
// and v2 linker; encode only18 new public title/body texts. No provider/SQL/HTTP.
import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';import {open,lstat,realpath} from 'node:fs/promises';
import {benchmarkNeed as need,benchmarkSourcePins as pins,checkBenchmarkPins as endPins,createBenchmarkOutput as directory,
 saveBenchmarkJson as save,readBenchmarkJson as json} from './hierarchy-benchmark-files.js';
import {createPackagedCrawlerEmbedder} from '../src/crawler/packaged-e5.js';
import {compileCachedSemanticTopicIndex} from '../experiments/automatic-topic-discovery-v4/cached-semantic-topic-index-v2.js';
import {CACHED_TOPIC_FRESH_CARDS as cards,CACHED_TOPIC_FRESH_PROTOCOL as protocol} from '../experiments/automatic-topic-discovery-v4/cached-topic-fresh-cards.js';
import {scoreFreshCachedTopicTransfer} from '../experiments/automatic-topic-discovery-v4/cached-topic-fresh-gold.js';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),DIR='apps/local-service/experiments/automatic-topic-discovery-v4/';
const FILES=['cached-semantic-topic-index-v2.js','cached-semantic-topic-index-v2.test.js','cached-topic-fresh-cards.js','cached-topic-fresh-gold.js',
 'cached-topic-fresh.test.js'].map(name=>DIR+name).concat(['apps/local-service/harness/run-fresh-cached-topic-validation.js',
 'apps/local-service/harness/cached-topic-transfer-resources.py','apps/local-service/harness/hierarchy-benchmark-files.js',
 'apps/local-service/src/crawler/packaged-e5.js','spikes/topic-resolution/browser/embedding/embedding-contract.js',
 'spikes/topic-resolution/browser/embedding/.assets/manifest.json']);
const MANIFEST='spikes/topic-resolution/browser/embedding/.assets/manifest.json',MANIFEST_SHA='5766e675660a8fbe74842a69b670a84ce5f9eb457b77032337e4a69d6180b984',
 OUTPUT='apps/local-service/data/canonical-migration-backups/cached-topic-fresh-validation-20261030',
 python='C:/Users/Laurens/AppData/Local/Programs/Python/Python312/python.exe';
const distribution=values=>{const xs=[...values].sort((a,b)=>a-b);return {count:xs.length,p50:xs[Math.ceil(xs.length*.5)-1],p95:xs[Math.ceil(xs.length*.95)-1],max:xs.at(-1)};};
async function assetPins(manifest) {
 const rows=[];
 for(const asset of manifest.assets){
  need(/^[a-z0-9_.-]+$/u.test(asset.filename)&&Number.isSafeInteger(asset.bytes)&&asset.bytes>0&&asset.bytes<=125829120);
  const file=path.resolve(ROOT,path.dirname(MANIFEST),asset.filename),before=await lstat(file,{bigint:true});
  need(before.isFile()&&!before.isSymbolicLink()&&before.size===BigInt(asset.bytes)&&(await realpath(file)).toLowerCase()===file.toLowerCase());
  const hash=createHash('sha256'),handle=await open(file,'r'),buffer=Buffer.alloc(1048576);
  const unchanged=s=>['dev','ino','size','mtimeNs','ctimeNs'].every(key=>s[key]===before[key]);
  try{need(unchanged(await handle.stat({bigint:true})));let used=0;
   while(used<asset.bytes){const step=await handle.read(buffer,0,Math.min(buffer.length,asset.bytes-used),used);need(step.bytesRead>0);hash.update(buffer.subarray(0,step.bytesRead));used+=step.bytesRead;}
   need((await handle.read(buffer,0,1,used)).bytesRead===0&&unchanged(await handle.stat({bigint:true}))&&unchanged(await lstat(file,{bigint:true})));
  }finally{buffer.fill(0);await handle.close();}
  const sha256=hash.digest('hex');need(sha256===asset.sha256);rows.push({filename:asset.filename,bytes:asset.bytes,sha256});
 }return rows;
}
let consumed=false;
export async function validateFreshCachedTopics(){
 need(arguments.length===0&&!consumed&&process.platform==='win32');consumed=true;const fresh=await pins(FILES),ledger=[],resources=[];
 const previous=await json('apps/local-service/data/canonical-migration-backups/cached-topic-definitions-development-20261030/evaluation-result.json',
  {sha256:'bfdba1958be422649ed83aaa7b54bdd6b12dbee554afff3ae56949c40971e496'},ledger),
  manifest=await json(MANIFEST,{sha256:MANIFEST_SHA},ledger);
 need(previous.status==='completed'&&previous.failure===null&&previous.endPinsPassed&&previous.encoderClosed&&previous.bank.nodes.length===24&&cards.length===9&&
  previous.encoded.length===24&&!cards.some(card=>previous.queries.some(query=>query.input.title===card.title&&query.input.body===card.body)));
 const sourcePins=[...previous.sourcePins],known=new Map(sourcePins.map(pin=>[pin.file,pin]));
 for(const pin of fresh){if(known.has(pin.file))need(JSON.stringify(known.get(pin.file))===JSON.stringify(pin));else sourcePins.push(pin);}
 const files=sourcePins.map(pin=>pin.file),index=compileCachedSemanticTopicIndex(previous.bank,previous.encoded.map(({id,values})=>({id,values})));
 const checkResources=()=>{const r=JSON.parse(execFileSync(python,['-I','-S','-B',path.join(ROOT,'apps/local-service/harness/cached-topic-transfer-resources.py')],
  {windowsHide:true,encoding:'utf8',timeout:5000,maxBuffer:4096}));
  need(['physicalFree','commitFree','cFree','dFree'].every(key=>Number.isSafeInteger(r[key])&&r[key]>=0));resources.push(r);
  need(r.physicalFree>=1073741824&&r.commitFree>=1073741824&&r.cFree>=2147483648&&r.dFree>=4294967296+1048576&&process.memoryUsage().rss<=1610612736);};
 await endPins(ledger,files,sourcePins);checkResources();const assetsBefore=await assetPins(manifest);checkResources();await directory(OUTPUT);
 await save(OUTPUT,'inputs.json',{sourcePins,inputPins:ledger,protocol,bankHash:previous.bank.bankHash,assetsBefore,
  limits:{activeMs:75000,rssSampledBytes:1610612736,heapMiB:512,outputFileBytes:1048576},providerUsed:false,databaseOpened:false,liveChanged:false});
 const queries=[],rows=[],started=performance.now();let encoder=null,closed=false,failure=null,stage='initialization',initializationMs=null,metrics=null,timings=null,endPinsPassed=false,assetsAfter=null;
 const check=()=>{checkResources();need(performance.now()-started<75000);};
 try{check();encoder=await createPackagedCrawlerEmbedder({expectedManifestSha256:MANIFEST_SHA});initializationMs=performance.now()-started;check();stage='fresh-query-encoding';
  for(const card of cards){check();let at=performance.now();const title=await encoder.embed(card.title),titleEncodingMs=performance.now()-at;check();
   at=performance.now();const body=await encoder.embed(card.body),bodyEncodingMs=performance.now()-at;check();
   need(title.modelId==='e5-small-q8-browser-main-prefix-v1'&&body.modelId===title.modelId);
   const input={title:card.title,body:card.body,titleVector:title.values,bodyVector:body.values,ownerGrouping:{defaultMaxDepth:8,overrides:[]}};
   at=performance.now();const lookup=index.lookup(input);rows.push({id:card.id,lookup,lookupMs:performance.now()-at,titleEncodingMs,bodyEncodingMs});queries.push({id:card.id,input});
  }
  const repeated=[];for(let repeat=0;repeat<32;repeat++)for(let i=0;i<queries.length;i++){
   const at=performance.now(),again=index.lookup(queries[i].input);repeated.push(performance.now()-at);need(JSON.stringify(again)===JSON.stringify(rows[i].lookup));}
  check();stage='gold-scoring';metrics=scoreFreshCachedTopicTransfer(rows);timings={initialLookupMs:distribution(rows.map(row=>row.lookupMs)),
   repeatedLookupMs:distribution(repeated),titleEncodingMs:distribution(rows.map(row=>row.titleEncodingMs)),bodyEncodingMs:distribution(rows.map(row=>row.bodyEncodingMs))};
 }catch{failure={stage,completed:rows.length};}
 finally{if(encoder)try{await encoder.close();closed=true;}catch{failure??={stage:'encoder-close'};}}
 try{assetsAfter=await assetPins(manifest);need(JSON.stringify(assetsBefore)===JSON.stringify(assetsAfter));await endPins(ledger,files,sourcePins);endPinsPassed=true;}
 catch{failure??={stage:'end-pins'};}
 const result={schema:'cached-topic-fresh-validation-actual/v1',status:failure?'failed':'completed',failure,protocol,bankHash:previous.bank.bankHash,
  queries,rows,metrics,timings,sourcePins,inputPins:ledger,assetsBefore,assetsAfter,endPinsPassed,encoderClosed:closed,initializationMs,elapsedMs:performance.now()-started,resources,
  memory:process.memoryUsage(),scope:{freshQueries:true,publicManualStressCards:true,queriesAddedToBank:false,queryGoldUsedBeforeScoring:false,
   providerUsed:false,fullPageCapture:false,publisherIndependent:false,independentReview:false,populationQuality:false,
   thresholdsTunedAfterPredictions:false,productionPolicySelected:false,canonicalIdsAssigned:false,databaseOpened:false,publication:false,liveChanged:false}};
 return{status:result.status,failure,metrics,timings,initializationMs,elapsedMs:result.elapsedMs,encoderClosed:closed,endPinsPassed,
  result:await save(OUTPUT,'evaluation-result.json',result)};
}
export async function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length!==1||args[0]!=='--validate-fresh-cached-topics')return 2;
 try{const result=await validateFreshCachedTopics();process.stdout.write(JSON.stringify(result)+'\n');return result.status==='completed'?0:1;}
 catch{process.stderr.write('Fresh cached topic validation unavailable; no live change.\n');return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(code=>{process.exitCode=code;});
