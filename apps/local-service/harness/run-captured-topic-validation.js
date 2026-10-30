// Explicit fixed public capture + cached v3/E5 + independent16-root diagnostic.
// No normal-service requests, provider, credentials, DB, topic publication or live change.
import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';import {open,lstat,realpath} from 'node:fs/promises';
import {benchmarkNeed as need,benchmarkSourcePins as pins,checkBenchmarkPins as endPins,createBenchmarkOutput as directory,
 saveBenchmarkJson as save,readBenchmarkJson as json} from './hierarchy-benchmark-files.js';
import {createPublicTopicPageCapture,publicTopicCaptureFailure} from './public-topic-page-capture.js';
import {PublicFetchError} from '../src/crawler/public-fetch.js';
import {createPackagedCrawlerEmbedder} from '../src/crawler/packaged-e5.js';
import {compileCachedSemanticTopicIndex} from '../experiments/automatic-topic-discovery-v4/cached-semantic-topic-index-v3.js';
import {parseSubjectKinds} from '../experiments/automatic-topic-discovery-v4/semantic-subject-kinds.js';
import {PUBLIC_SUBJECT_KIND_NODES} from '../experiments/automatic-topic-discovery-v4/public-subject-kind-nodes.js';
import {CAPTURED_TOPIC_URLS as cards} from '../experiments/automatic-topic-discovery-v4/captured-topic-validation-cohort.js';
import {scoreCapturedTopicValidation} from '../experiments/automatic-topic-discovery-v4/captured-topic-validation-gold.js';
import {loadInstalledHierarchyMatcher} from '../src/application/installed-hierarchy-matcher.js';
import {classifyRootedHierarchyMatcher} from '../src/domain/hierarchy-rooted-matcher.js';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),DIR='apps/local-service/',
 FILES=['harness/run-captured-topic-validation.js','harness/public-topic-page-capture.js','harness/public-topic-page-capture.test.js',
 'harness/hierarchy-benchmark-files.js','harness/cached-topic-transfer-resources.py','src/crawler/packaged-e5.js','src/crawler/public-fetch.js',
 'src/crawler/robots.js','src/crawler/static-capture.js','src/application/installed-hierarchy-matcher.js','src/domain/hierarchy-rooted-matcher.js',
 'src/domain/hierarchical-e5-paired-input.js','src/domain/hierarchical-e5-paired-linear-heads.js','src/domain/hierarchy-binary-detail.js','src/domain/hierarchical-e5-observed-head-policy.js',
 ...['root-model.json','root-policy.json','input-definition.json','gta-detail.json','animals-detail.json','koalas-detail.json'].map(n=>'assets/hierarchy/'+n),
 'experiments/topic-encoder/hierarchical-e5-pooled-root-rank-dev-v1/rank-policy.js',
 ...['cached-semantic-topic-index-v3.js','semantic-subject-kinds.js','public-subject-kind-nodes.js','captured-topic-validation-cohort.js','captured-topic-validation-gold.js','captured-topic-validation.test.js'].map(n=>'experiments/automatic-topic-discovery-v4/'+n)].map(n=>DIR+n),
 MANIFEST='spikes/topic-resolution/browser/embedding/.assets/manifest.json',MANIFEST_SHA='5766e675660a8fbe74842a69b670a84ce5f9eb457b77032337e4a69d6180b984',
 OUTPUT='apps/local-service/data/canonical-migration-backups/captured-topic-validation-20261030',python='C:/Users/Laurens/AppData/Local/Programs/Python/Python312/python.exe';
const distribution=values=>{if(!values.length)return null;const xs=[...values].sort((a,b)=>a-b);return{count:xs.length,p50:xs[Math.ceil(xs.length*.5)-1],p95:xs[Math.ceil(xs.length*.95)-1],max:xs.at(-1)};};
async function assetPins(manifest){const rows=[];for(const asset of manifest.assets){
 need(/^[a-z0-9_.-]+$/u.test(asset.filename)&&Number.isSafeInteger(asset.bytes)&&asset.bytes>0&&asset.bytes<=125829120);
 const file=path.resolve(ROOT,path.dirname(MANIFEST),asset.filename),before=await lstat(file,{bigint:true});
 need(before.isFile()&&!before.isSymbolicLink()&&before.size===BigInt(asset.bytes)&&(await realpath(file)).toLowerCase()===file.toLowerCase());
 const hash=createHash('sha256'),fd=await open(file,'r'),buffer=Buffer.alloc(1048576),same=s=>['dev','ino','size','mtimeNs','ctimeNs'].every(k=>s[k]===before[k]);
 try{need(same(await fd.stat({bigint:true})));let used=0;while(used<asset.bytes){const r=await fd.read(buffer,0,Math.min(buffer.length,asset.bytes-used),used);need(r.bytesRead>0);hash.update(buffer.subarray(0,r.bytesRead));used+=r.bytesRead;}
  need((await fd.read(buffer,0,1,used)).bytesRead===0&&same(await fd.stat({bigint:true}))&&same(await lstat(file,{bigint:true})));
 }finally{buffer.fill(0);await fd.close();}const sha256=hash.digest('hex');need(sha256===asset.sha256);rows.push({filename:asset.filename,bytes:asset.bytes,sha256});
 }return rows;}
let consumed=false;
export async function validateCapturedTopics(){
 need(arguments.length===0&&!consumed&&process.platform==='win32');consumed=true;const fresh=await pins(FILES),ledger=[],resources=[];
 const previous=await json('apps/local-service/data/canonical-migration-backups/cached-topic-definitions-development-20261030/evaluation-result.json',{sha256:'bfdba1958be422649ed83aaa7b54bdd6b12dbee554afff3ae56949c40971e496'},ledger),
  kinds=await json('apps/local-service/data/public-topic-kinds-private-actual-20261030.json',{sha256:'c578c2d71969d7881465cfa9cf873fc8272dc9068d2665c2ca8f3b28dc01f6b7'},ledger),manifest=await json(MANIFEST,{sha256:MANIFEST_SHA},ledger);
 need(previous.status==='completed'&&previous.encoderClosed&&previous.endPinsPassed&&kinds.status==='passed'&&cards.length===8);
 const sourcePins=[],known=new Map();for(const pin of [...previous.sourcePins,...fresh]){if(known.has(pin.file))need(JSON.stringify(known.get(pin.file))===JSON.stringify(pin));else{known.set(pin.file,pin);sourcePins.push(pin);}}
 const files=sourcePins.map(p=>p.file),index=compileCachedSemanticTopicIndex(previous.bank,previous.encoded.map(({id,values})=>({id,values})),parseSubjectKinds(PUBLIC_SUBJECT_KIND_NODES,kinds.providerAnswer)),installed=await loadInstalledHierarchyMatcher();
 const started=performance.now(),check=()=>{const r=JSON.parse(execFileSync(python,['-I','-S','-B',path.join(ROOT,'apps/local-service/harness/cached-topic-transfer-resources.py')],{windowsHide:true,encoding:'utf8',timeout:5000,maxBuffer:4096}));
  need(['physicalFree','commitFree','cFree','dFree'].every(k=>Number.isSafeInteger(r[k])&&r[k]>=0));resources.push(r);
  need(r.physicalFree>=1073741824&&r.commitFree>=1073741824&&r.cFree>=2147483648&&r.dFree>=4294967296+1048576&&process.memoryUsage().rss<=1610612736&&performance.now()-started<450000);};
 await endPins(ledger,files,sourcePins);check();const assetsBefore=await assetPins(manifest);check();await directory(OUTPUT);
 await save(OUTPUT,'inputs.json',{sourcePins,inputPins:ledger,cards,index:index.describe(),installedDescriptor:installed.descriptor,assetsBefore,
  limits:{activeMs:450000,perPageMs:45000,rssSampledBytes:1610612736,heapMiB:512,outputFileBytes:1048576},scope:'fixed public static-prefix integration; overlapping publishers; no population/fresh-holdout/live authority'});
 const captures=[],rows=[],queries=[];let encoder=null,encoderClosed=false,failure=null,endPinsPassed=false,assetsAfter=null,initializationMs=null,stage='public-capture';
 try{
  const capture=createPublicTopicPageCapture();for(const card of cards){check();const at=performance.now();
   try{const value=await capture(card.url,Date.now()+Math.min(45000,450000-(performance.now()-started)));captures.push({id:card.id,status:'captured',...value,captureMs:performance.now()-at});}
   catch(error){const code=publicTopicCaptureFailure(error)??(error instanceof PublicFetchError?error.code:'policy-or-document-unavailable');captures.push({id:card.id,url:card.url,status:'capture-unavailable',failure:{code,...(error instanceof PublicFetchError&&Number.isInteger(error.status)?{httpStatus:error.status}:{})},captureMs:performance.now()-at});}
   check();
  }
  await save(OUTPUT,'captures.json',{captures});stage='encoder-initialization';check();const init=performance.now();encoder=await createPackagedCrawlerEmbedder({expectedManifestSha256:MANIFEST_SHA});initializationMs=performance.now()-init;check();
  stage='capture-encoding';for(const captured of captures){if(captured.status!=='captured'){rows.push({id:captured.id,status:'capture-unavailable',failure:captured.failure});continue;}
   check();let at=performance.now();const title=await encoder.embed(captured.title),titleEncodingMs=performance.now()-at;check();at=performance.now();const body=await encoder.embed(captured.body),bodyEncodingMs=performance.now()-at;check();
   need(title.modelId==='e5-small-q8-browser-main-prefix-v1'&&body.modelId===title.modelId);
   const input={title:captured.title,body:captured.body,titleVector:title.values,bodyVector:body.values,ownerGrouping:{defaultMaxDepth:8,overrides:[]}};
   at=performance.now();const lookup=index.lookup(input),lookupMs=performance.now()-at;at=performance.now();
   const rooted=classifyRootedHierarchyMatcher(installed.matcher,{sourceId:captured.id,sourceVersion:'1',bodyVector:body.values,titleVector:title.values}),rootedMs=performance.now()-at;
   rows.push({id:captured.id,status:'matched',lookup,rooted,lookupMs,rootedMs,titleEncodingMs,bodyEncodingMs});queries.push({id:captured.id,input});
  }check();
 }catch{failure={stage,captures:captures.length,matched:queries.length};}
 finally{if(encoder)try{await encoder.close();encoderClosed=true;}catch{failure??={stage:'encoder-close'};}}
 try{assetsAfter=await assetPins(manifest);need(JSON.stringify(assetsBefore)===JSON.stringify(assetsAfter));await endPins(ledger,files,sourcePins);endPinsPassed=true;}catch{failure??={stage:'end-pins'};}
 const metrics=rows.length===8?scoreCapturedTopicValidation(rows):null,matched=rows.filter(r=>r.status==='matched'),timings=Object.fromEntries(['lookupMs','rootedMs','titleEncodingMs','bodyEncodingMs'].map(k=>[k,distribution(matched.map(row=>row[k]))]));
 const result={schema:'captured-topic-validation-actual/v1',status:failure?'failed':'completed',failure,metrics,timings,rows,queries,captures,initializationMs,elapsedMs:performance.now()-started,sourcePins,inputPins:ledger,assetsBefore,assetsAfter,endPinsPassed,encoderClosed,resources,
  scope:{actualPublicHttp:true,actualStaticPrefixParser:true,fullRenderedPage:false,manualStressSet:true,freshIndependentHoldout:false,queriesAddedToBank:false,thresholdsChanged:false,providerUsed:false,canonicalIdsAssigned:false,productionPolicySelected:false,databaseOpened:false,publication:false,liveChanged:false}};
 return{status:result.status,failure,metrics,timings,initializationMs,elapsedMs:result.elapsedMs,endPinsPassed,encoderClosed,result:await save(OUTPUT,'evaluation-result.json',result)};
}
export async function main(args=process.argv.slice(2)){if(!Array.isArray(args)||args.length!==1||args[0]!=='--validate-captured-topics')return 2;
 try{const r=await validateCapturedTopics();process.stdout.write(JSON.stringify(r)+'\n');return r.status==='completed'?0:1;}catch{process.stderr.write('Captured topic validation unavailable; no live change.\n');return 1;}}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(code=>{process.exitCode=code;});
