// Posthoc DEV ablation: add public graph definitions; keep the original local
// linker, aliases, grouping and cutoffs unchanged. Reuse all12 saved query vectors.
// One serial local E5 session encodes only24 new descriptors. No SQL/HTTP/provider.
import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';import {open,lstat,realpath} from 'node:fs/promises';
import {benchmarkNeed as need,benchmarkSourcePins as pins,checkBenchmarkPins as endPins,createBenchmarkOutput as directory,
 saveBenchmarkJson as save,readBenchmarkJson as json} from './hierarchy-benchmark-files.js';
import {createPackagedCrawlerEmbedder} from '../src/crawler/packaged-e5.js';
import {PUBLIC_SUBJECT_CARDS} from '../experiments/automatic-topic-discovery-v4/public-subject-cohort.js';
import {parseSubjectProposal} from '../experiments/automatic-topic-discovery-v4/semantic-subjects.js';
import {buildCachedSemanticTopicBank,compileCachedSemanticTopicIndex} from '../experiments/automatic-topic-discovery-v4/cached-semantic-topic-index.js';
import {parseTopicDefinitions,buildDefinedCachedSemanticTopicBank} from '../experiments/automatic-topic-discovery-v4/semantic-topic-definitions.js';
import {PUBLIC_SEMANTIC_DEFINITION_NODES} from '../experiments/automatic-topic-discovery-v4/public-semantic-definition-nodes.js';
import {CACHED_TOPIC_TRANSFER_CARDS as cards,CACHED_TOPIC_TRANSFER_PROTOCOL as protocol} from '../experiments/automatic-topic-discovery-v4/cached-topic-transfer-cards.js';
import {scoreCachedTopicTransfer} from '../experiments/automatic-topic-discovery-v4/cached-topic-transfer-gold.js';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),DIR='apps/local-service/experiments/automatic-topic-discovery-v4/';
const FILES=['cached-semantic-topic-index.js','cached-semantic-topic-index.test.js','cached-topic-transfer-cards.js','cached-topic-transfer-gold.js',
 'cached-topic-transfer.test.js','public-subject-cohort.js','semantic-subjects.js','semantic-topic-definitions.js','semantic-topic-definitions.test.js',
 'public-semantic-definition-nodes.js'].map(name=>DIR+name).concat(['apps/local-service/harness/run-defined-cached-topic-development.js',
 'apps/local-service/harness/cached-topic-transfer-resources.py','apps/local-service/harness/hierarchy-benchmark-files.js',
 'apps/local-service/src/crawler/packaged-e5.js','spikes/topic-resolution/browser/embedding/embedding-contract.js',
 'spikes/topic-resolution/browser/embedding/.assets/manifest.json']);
const MANIFEST='spikes/topic-resolution/browser/embedding/.assets/manifest.json',MANIFEST_SHA='5766e675660a8fbe74842a69b670a84ce5f9eb457b77032337e4a69d6180b984',
 TEACHER_SHA='4e4c28f5b4acafd469b3057f6cc48b92383f169654327f67051e7f7f74ff15ee',
 OUTPUT='apps/local-service/data/canonical-migration-backups/cached-topic-definitions-development-20261030',
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
export async function compareDefinedCachedTopicDevelopment(){
 need(arguments.length===0&&!consumed&&process.platform==='win32');consumed=true;
 const sourcePins=await pins(FILES),ledger=[],resources=[];
 const checkpoint=await json('apps/local-service/data/canonical-migration-backups/cached-topic-transfer-v3-20261030/evaluation-result.json',
  {sha256:'f516847bf6342b19e78bbbfd81f5bd46a853cf256925c03faff63e75ba70b5ef'},ledger),
  provider=await json('apps/local-service/data/public-topic-definitions-private-retained-answer-20261030.json',
  {sha256:'f0fceeac604b2416bab31175fe5b473ceb14e75ac37c1e5cc28e995d71e0557c'},ledger),
  teacher=await json('apps/local-service/data/public-semantic-subject-provider-actual-20261030.json',{sha256:TEACHER_SHA},ledger),
  manifest=await json(MANIFEST,{sha256:MANIFEST_SHA},ledger);
 need(checkpoint.status==='completed'&&checkpoint.failure===null&&checkpoint.queries.length===12&&checkpoint.endPinsPassed&&checkpoint.encoderClosed&&
  provider.status==='passed'&&provider.providerCompleted&&provider.cleanup.conversationRemoved&&provider.cleanup.sessionLoggedOut&&
  createHash('sha256').update(provider.providerAnswer).digest('hex')===provider.answerSha256&&teacher.status==='passed');
 const proposal=parseSubjectProposal(PUBLIC_SUBJECT_CARDS,teacher.providerAnswer),graphJson=JSON.stringify({teacherHash:TEACHER_SHA,
  cards:PUBLIC_SUBJECT_CARDS.map(({id,title,excerpt,url})=>({id,title,excerpt,url})),nodes:proposal.nodes,selections:proposal.selections.map(({id,leafKey})=>({id,leafKey}))}),
  before=buildCachedSemanticTopicBank(graphJson),definitions=parseTopicDefinitions(PUBLIC_SEMANTIC_DEFINITION_NODES,provider.providerAnswer),
  bank=buildDefinedCachedSemanticTopicBank(graphJson,JSON.stringify(definitions));
 need(JSON.stringify(checkpoint.bank)===JSON.stringify(before)&&JSON.stringify(checkpoint.protocol)===JSON.stringify(protocol)&&bank.nodes.length===24);
 const structural=nodes=>nodes.map(({id,parentId,path,rootId,kind,aliases})=>({id,parentId,path,rootId,kind,aliases}));
 need(JSON.stringify(structural(before.nodes))===JSON.stringify(structural(bank.nodes)));
 for(const pin of checkpoint.sourcePins)if(!pin.file.endsWith('/run-cached-topic-transfer-v3.js'))need(sourcePins.some(current=>JSON.stringify(current)===JSON.stringify(pin)));
 const checkResources=()=>{const r=JSON.parse(execFileSync(python,['-I','-S','-B',path.join(ROOT,'apps/local-service/harness/cached-topic-transfer-resources.py')],
  {windowsHide:true,encoding:'utf8',timeout:5000,maxBuffer:4096}));
  need(['physicalFree','commitFree','cFree','dFree'].every(key=>Number.isSafeInteger(r[key])&&r[key]>=0));resources.push(r);
  need(r.physicalFree>=1073741824&&r.commitFree>=1073741824&&r.cFree>=2147483648&&r.dFree>=4294967296+1048576&&process.memoryUsage().rss<=1610612736);};
 await endPins(ledger,FILES,sourcePins);checkResources();const assetsBefore=await assetPins(manifest);checkResources();await directory(OUTPUT);
 await save(OUTPUT,'inputs.json',{sourcePins,inputPins:ledger,protocol,bank,definitions,assetsBefore,
  limits:{activeMs:75000,rssSampledBytes:1610612736,heapMiB:512,outputFileBytes:1048576},
  protocolChange:'Only prepend the cached public node definition to each descriptor; no changed alias/cutoff/tree/query/policy',
  postHocDevelopment:true,providerUsed:false,databaseOpened:false,liveChanged:false});
 const encoded=[],queries=structuredClone(checkpoint.queries),rows=[],started=performance.now();let encoder=null,closed=false,stage='initialization',failure=null,
  initializationMs=null,metrics=null,timings=null,assetsAfter=null,endPinsPassed=false;
 const check=()=>{checkResources();need(performance.now()-started<75000);};
 try{check();encoder=await createPackagedCrawlerEmbedder({expectedManifestSha256:MANIFEST_SHA});initializationMs=performance.now()-started;check();stage='definition-descriptor-encoding';
  for(const node of bank.nodes){check();const at=performance.now(),value=await encoder.embed(node.descriptor);check();
   need(value.modelId==='e5-small-q8-browser-main-prefix-v1');encoded.push({id:node.id,values:value.values,encodingMs:performance.now()-at});}
  const index=compileCachedSemanticTopicIndex(bank,encoded.map(({id,values})=>({id,values})));stage='stored-query-lookup';
  for(let i=0;i<queries.length;i++){const query=queries[i],card=cards[i];need(query.id===card.id&&query.input.title===card.title&&query.input.body===card.body&&
   JSON.stringify(query.input.ownerGrouping)===JSON.stringify({defaultMaxDepth:8,overrides:[]}));
   const at=performance.now(),lookup=index.lookup(query.input);rows.push({id:query.id,lookup,lookupMs:performance.now()-at});}
  const repeated=[];for(let repeat=0;repeat<32;repeat++)for(let i=0;i<queries.length;i++){
   const at=performance.now(),again=index.lookup(queries[i].input);repeated.push(performance.now()-at);need(JSON.stringify(again)===JSON.stringify(rows[i].lookup));}
  check();stage='gold-scoring';metrics=scoreCachedTopicTransfer(rows);timings={initialLookupMs:distribution(rows.map(row=>row.lookupMs)),repeatedLookupMs:distribution(repeated)};
 }catch{failure={stage,encoded:encoded.length,completed:rows.length};}
 finally{if(encoder)try{await encoder.close();closed=true;}catch{failure??={stage:'encoder-close'};}}
 try{assetsAfter=await assetPins(manifest);need(JSON.stringify(assetsBefore)===JSON.stringify(assetsAfter));await endPins(ledger,FILES,sourcePins);endPinsPassed=true;}
 catch{failure??={stage:'end-pins'};}
 const result={schema:'cached-topic-definitions-development-actual/v1',status:failure?'failed':'completed',failure,bank,definitions,encoded,queries,rows,metrics,timings,
  baselineMetrics:checkpoint.metrics,sourcePins,inputPins:ledger,assetsBefore,assetsAfter,endPinsPassed,encoderClosed:closed,initializationMs,elapsedMs:performance.now()-started,
  resources,memory:process.memoryUsage(),scope:{postHocDevelopment:true,representative:false,independentReview:false,providerUsed:false,queryReencoding:false,
   rootDefinitionsNeedBroaderReview:true,productionPolicySelected:false,canonicalIdsAssigned:false,databaseOpened:false,publication:false,liveChanged:false}};
 return {status:result.status,failure,metrics,timings,initializationMs,elapsedMs:result.elapsedMs,encoderClosed:closed,endPinsPassed,
  result:await save(OUTPUT,'evaluation-result.json',result)};
}
export async function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length!==1||args[0]!=='--compare-cached-topic-definitions-development')return 2;
 try{const result=await compareDefinedCachedTopicDevelopment();process.stdout.write(JSON.stringify(result)+'\n');return result.status==='completed'?0:1;}
 catch{process.stderr.write('Cached topic definition development unavailable; no live change.\n');return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(code=>{process.exitCode=code;});
