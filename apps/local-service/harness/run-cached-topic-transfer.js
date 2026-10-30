// Fixed prospective public-card transfer. One local E5 session; no HTTP, SQL,
// provider, crawl, canonical publication, package installation or live change.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {open,lstat,realpath} from 'node:fs/promises';
import {benchmarkNeed as need,benchmarkSourcePins as pins,checkBenchmarkPins as endPins,
 createBenchmarkOutput as directory,saveBenchmarkJson as save,readBenchmarkJson as json} from './hierarchy-benchmark-files.js';
import {createPackagedCrawlerEmbedder} from '../src/crawler/packaged-e5.js';
import {PUBLIC_SUBJECT_CARDS} from '../experiments/automatic-topic-discovery-v4/public-subject-cohort.js';
import {parseSubjectProposal} from '../experiments/automatic-topic-discovery-v4/semantic-subjects.js';
import {buildCachedSemanticTopicBank,compileCachedSemanticTopicIndex} from '../experiments/automatic-topic-discovery-v4/cached-semantic-topic-index.js';
import {CACHED_TOPIC_TRANSFER_CARDS as cards,CACHED_TOPIC_TRANSFER_PROTOCOL as protocol} from '../experiments/automatic-topic-discovery-v4/cached-topic-transfer-cards.js';
import {scoreCachedTopicTransfer} from '../experiments/automatic-topic-discovery-v4/cached-topic-transfer-gold.js';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const DIR='apps/local-service/experiments/automatic-topic-discovery-v4/';
const FILES=[DIR+'cached-semantic-topic-index.js',DIR+'cached-semantic-topic-index.test.js',DIR+'cached-topic-transfer-cards.js',DIR+'cached-topic-transfer-gold.js',
 DIR+'cached-topic-transfer.test.js',DIR+'public-subject-cohort.js',DIR+'semantic-subjects.js',
 'apps/local-service/harness/run-cached-topic-transfer.js','apps/local-service/harness/cached-topic-transfer-resources.py',
 'apps/local-service/harness/hierarchy-benchmark-files.js','apps/local-service/src/crawler/packaged-e5.js',
 'spikes/topic-resolution/browser/embedding/embedding-contract.js','spikes/topic-resolution/browser/embedding/.assets/manifest.json'];
const TEACHER='apps/local-service/data/public-semantic-subject-provider-actual-20261030.json',
 TEACHER_SHA='4e4c28f5b4acafd469b3057f6cc48b92383f169654327f67051e7f7f74ff15ee',
 MANIFEST='spikes/topic-resolution/browser/embedding/.assets/manifest.json',MANIFEST_SHA='5766e675660a8fbe74842a69b670a84ce5f9eb457b77032337e4a69d6180b984',
 OUTPUT='apps/local-service/data/canonical-migration-backups/cached-topic-transfer-20261030';
const python='C:/Users/Laurens/AppData/Local/Programs/Python/Python312/python.exe';
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
export async function runCachedTopicTransfer() {
 need(arguments.length===0&&!consumed&&process.platform==='win32');consumed=true;
 const sourcePins=await pins(FILES),ledger=[],resources=[];
 const teacher=await json(TEACHER,{sha256:TEACHER_SHA},ledger),manifest=await json(MANIFEST,{sha256:MANIFEST_SHA},ledger);
 need(teacher.status==='passed'&&teacher.counts.correct===12&&cards.length===12);
 const proposal=parseSubjectProposal(PUBLIC_SUBJECT_CARDS,teacher.providerAnswer);
 need(JSON.stringify(proposal.nodes)===JSON.stringify(teacher.proposedNodes)&&JSON.stringify(proposal.selections)===JSON.stringify(teacher.selections));
 const bank=buildCachedSemanticTopicBank(JSON.stringify({teacherHash:TEACHER_SHA,
  cards:PUBLIC_SUBJECT_CARDS.map(({id,title,excerpt,url})=>({id,title,excerpt,url})),nodes:proposal.nodes,
  selections:proposal.selections.map(({id,leafKey})=>({id,leafKey}))}));
 need(bank.nodes.length===25&&!cards.some(card=>PUBLIC_SUBJECT_CARDS.some(old=>old.url===card.url)));
 const checkResources=()=>{
  const r=JSON.parse(execFileSync(python,['-I','-S','-B',path.join(ROOT,'apps/local-service/harness/cached-topic-transfer-resources.py')],
   {windowsHide:true,encoding:'utf8',timeout:5000,maxBuffer:4096}));
  need(['physicalFree','commitFree','cFree','dFree'].every(key=>Number.isSafeInteger(r[key])&&r[key]>=0));resources.push(r);
  need(r.physicalFree>=1073741824&&r.commitFree>=1073741824&&r.cFree>=2147483648&&r.dFree>=4294967296+1048576);
  need(process.memoryUsage().rss<=1610612736);return r;
 };
 await endPins(ledger,FILES,sourcePins);checkResources();const assetsBefore=await assetPins(manifest);checkResources();
 await directory(OUTPUT);await save(OUTPUT,'inputs.json',{sourcePins,inputPins:ledger,protocol,teacherSha256:TEACHER_SHA,bank,
  modelManifestSha256:MANIFEST_SHA,assetsBefore,limits:{activeMs:75000,rssSampledBytes:1610612736,heapMiB:512,outputFileBytes:1048576},
  sampledCountersNotNativeQuota:true,databaseOpened:false,providerUsed:false,liveChanged:false});
 let encoder=null,closed=false,failure=null,stage='initialization',initializationMs=null,metrics=null,performance=null,endPinsPassed=false;
 const encoded=[],queries=[],rows=[],started=globalThis.performance.now();let assetsAfter=null;
 const elapsed=()=>globalThis.performance.now()-started;
 const check=()=>{checkResources();need(elapsed()<75000);};
 try{
  check();encoder=await createPackagedCrawlerEmbedder({expectedManifestSha256:MANIFEST_SHA});initializationMs=elapsed();check();stage='descriptor-encoding';
  for(const node of bank.nodes){check();const at=elapsed(),result=await encoder.embed(node.descriptor);check();
   need(result.modelId==='e5-small-q8-browser-main-prefix-v1');encoded.push({id:node.id,values:result.values,encodingMs:elapsed()-at});}
  const index=compileCachedSemanticTopicIndex(bank,encoded.map(({id,values})=>({id,values})));stage='query-encoding';
  for(const card of cards){check();let at=elapsed();const title=await encoder.embed(card.title),titleEncodingMs=elapsed()-at;check();
   at=elapsed();const body=card.body?await encoder.embed(card.body):title,bodyEncodingMs=card.body?elapsed()-at:0;check();
   const input={title:card.title,body:card.body,titleVector:title.values,bodyVector:body.values,ownerGrouping:{defaultMaxDepth:8,overrides:[]}};
   at=elapsed();const lookup=index.lookup(input),lookupMs=elapsed()-at;
   rows.push({id:card.id,lookup,titleEncodingMs,bodyEncodingMs,bodyAvailable:!!card.body,lookupMs});queries.push({id:card.id,input});
  }
  stage='cached-lookup-repetition';const repeated=[];
  for(let repeat=0;repeat<32;repeat++)for(let i=0;i<queries.length;i++){
   const at=elapsed(),again=index.lookup(queries[i].input);repeated.push(elapsed()-at);need(JSON.stringify(again)===JSON.stringify(rows[i].lookup));
  }
  check();stage='gold-scoring';metrics=scoreCachedTopicTransfer(rows);
  performance={initialLookupMs:distribution(rows.map(row=>row.lookupMs)),repeatedLookupMs:distribution(repeated),
   titleEncodingMs:distribution(rows.map(row=>row.titleEncodingMs)),bodyEncodingMs:distribution(rows.filter(row=>row.bodyAvailable).map(row=>row.bodyEncodingMs)),
   cachedLookupPolicy:'32 repetitions of each already encoded query, identical projection required',
   acceptance:{knownSubjectTarget:metrics.knownExact>=protocol.primaryKnownSubjectTarget,noWrong:metrics.wrong===0,
    repeatedP95Target:distribution(repeated).p95<protocol.lookupP95TargetMs}};
 }catch{failure={stage,encoded:encoded.length,completed:rows.length};}
 finally{if(encoder)try{await encoder.close();closed=true;}catch{failure??={stage:'encoder-close'};}}
 try{assetsAfter=await assetPins(manifest);need(JSON.stringify(assetsBefore)===JSON.stringify(assetsAfter));
  await endPins(ledger,FILES,sourcePins);endPinsPassed=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'cached-topic-transfer-actual/v1',status:failure?'failed':'completed',failure,protocol,bank,encoded,queries,rows,metrics,performance,
  sourcePins,inputPins:ledger,assetsBefore,assetsAfter,endPinsPassed,encoderClosed:closed,initializationMs,elapsedMs:elapsed(),resources,memory:process.memoryUsage(),
  scope:{publicManualCards:true,prospectiveQueries:true,fullPageCapture:false,independentReview:false,populationQuality:false,
   trainingGoldUsed:false,queryGoldUsedBeforeScoring:false,thresholdsTunedAfterPredictions:false,modelNetwork:false,providerUsed:false,
   canonicalIdentityAssigned:false,databaseOpened:false,publication:false,liveChanged:false}};
 return {status:result.status,failure,encoded:encoded.length,queries:queries.length,metrics,performance,initializationMs,elapsedMs:result.elapsedMs,
  encoderClosed:closed,endPinsPassed,result:await save(OUTPUT,'evaluation-result.json',result)};
}
export async function main(args=process.argv.slice(2)) {
 if(!Array.isArray(args)||args.length!==1||args[0]!=='--run-cached-topic-transfer')return 2;
 try{const result=await runCachedTopicTransfer();process.stdout.write(JSON.stringify(result)+'\n');return result.status==='completed'?0:1;}
 catch{process.stderr.write('Cached public topic transfer unavailable; no live change.\n');return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(code=>{process.exitCode=code;});
