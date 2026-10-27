// Explicit private composition only. Import opens no encoder, connection or IO.
// Retained public TRAIN material is supplied by the authenticated capture-input
// closure. This is a performance workload, not new child-quality evidence.
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual,types} from 'node:util';
import {openInstalledHierarchyWorkerResources} from '../../src/application/hierarchy-worker-resources.js';
import {readInstalledOwnerTopicConfiguration} from '../../src/application/owner-topic-configuration.js';
import {createInstalledFixedReferenceMatcher} from '../../src/domain/fixed-reference-topic-integration.js';
import {createCanonicalV4IngestionRepository} from '../canonical-v4/ingestion-repository.js';
import {createPostgresCrawlerClient} from '../../src/crawler/postgres-ingest-client.js';
import {operationDigestFor} from '../../src/domain/source-threads.js';
import {readLearnedIngest} from '../../src/domain/learned-sources.js';
import {readText} from '../../src/domain/validation.js';
import {readSemanticContext,readSemanticTopics,readVersion} from '../../../../spikes/topic-resolution/browser/core/local-service-contract.js';
import {inputText} from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

const MODEL='e5-small-q8-browser-main-prefix-v1',SHA=/^[a-f0-9]{64}$/u;
const MATCHER='eead1b2dcd6508ebf3d5c45358c71be95e81363da7c0b8325f7466ce487ed21c';
const TRAIN=Object.freeze([
 Object.freeze({id:'real-train-01',url:'https://en.wikipedia.org/wiki/Tetris',sourceInputHash:'aba50dd9302b5448b0e5b4f14792e681810e6238d45d7b524c772a21c4fd5115'}),
 Object.freeze({id:'real-train-04',url:'https://fr.wikipedia.org/wiki/Octopoda',sourceInputHash:'4c89c4fe4490894cd7877790a4d4021c8a1babd5accf91be0212411c7952b3ff'}),
]);
const fail=()=>Object.assign(new Error('Private model rehearsal unavailable'),{code:'PRIVATE_MODEL_REHEARSAL'});
const need=value=>{if(!value)throw fail();};
function database(value){need(value&&typeof value==='object'&&!types.isProxy(value));const d=Object.getOwnPropertyDescriptor(value,'query');need(d&&Object.hasOwn(d,'value')&&typeof d.value==='function');}
function record(value,keys){
 need(value&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype);
 need(Reflect.ownKeys(value).length===keys.length);const out={};
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);need(d?.enumerable&&Object.hasOwn(d,'value'));out[key]=d.value;}return out;
}
function captures(value){
 need(Array.isArray(value)&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length===2&&Reflect.ownKeys(value).length===3);
 return TRAIN.map((expected,i)=>{
  const d=Object.getOwnPropertyDescriptor(value,String(i));need(d?.enumerable&&Object.hasOwn(d,'value'));
  const row=record(d.value,['id','url','title','text','extractorVersion','sourceInputHash']);
  need(row.id===expected.id&&row.url===expected.url&&row.extractorVersion==='crawler-static-html-prefix/v1'&&
   typeof row.title==='string'&&row.title.trim().length>0&&row.title.length<=200&&typeof row.sourceInputHash==='string'&&SHA.test(row.sourceInputHash)&&row.sourceInputHash===expected.sourceInputHash);
  need(readText(row.title,200)===row.title);
  inputText(row.text);return row;
 });
}
const milliseconds=value=>{need(Number.isFinite(value)&&value>=0&&value<=360000);return Math.round(value*1000)/1000;};
function summary(values){const sorted=[...values].sort((a,b)=>a-b),at=p=>sorted.length?sorted[Math.ceil(sorted.length*p)-1]:null;
 return {count:sorted.length,p50:at(.5),p95:at(.95),max:sorted.at(-1)??null};}
const REAL=Object.freeze({openResources:openInstalledHierarchyWorkerResources,
 loadReference:()=>{const value=readInstalledOwnerTopicConfiguration();need(value.alternateRidgeAdapter!==null);return createInstalledFixedReferenceMatcher(value.alternateRidgeAdapter);},
 submitter:database=>createCanonicalV4IngestionRepository({database,schemaProfile:'hierarchy17'}),crawler:createPostgresCrawlerClient,
 now:()=>performance.now(),sleep:ms=>new Promise(resolve=>setTimeout(resolve,ms)),nextId:kind=>kind+'-'+randomUUID()});

async function run(value,ports,testComposition){
 const a=record(value,['workerDatabase','submitterDatabase','readHttp','readCapturedTrainingInputs','foregroundSourceId','deadline','checkDeadline']);
 database(a.workerDatabase);database(a.submitterDatabase);
 need(a.workerDatabase!==a.submitterDatabase&&
  typeof a.readHttp==='function'&&typeof a.readCapturedTrainingInputs==='function'&&typeof a.checkDeadline==='function'&&
  typeof a.foregroundSourceId==='string'&&/^[A-Za-z0-9._:-]{1,128}$/u.test(a.foregroundSourceId)&&Number.isFinite(a.deadline));
 const started=ports.now(),phases=[],completed=[],pending=new Set();let rows=null,resources=null,stage='capture-validation',primary=null,hadFailure=false,resourcesClosed=false,installationVerified=false;
 let maximumPending=0;
 const check=()=>{a.checkDeadline();need(ports.now()<a.deadline);};
 async function original(work){check();need(pending.size<8);const promise=Promise.resolve().then(work);pending.add(promise);maximumPending=Math.max(maximumPending,pending.size);
  try{const result=await promise;check();return result;}finally{pending.delete(promise);}}
 async function http(kind,input){return original(()=>a.readHttp(kind,input));}
 async function version(){const row=record(await http('version',null),['version']);return readVersion(row.version);}
 async function probe(samples){
  for(const kind of ['context','topics']){const before=ports.now(),response=await http(kind,kind==='context'?{sourceId:a.foregroundSourceId}:{});
   if(kind==='context')readSemanticContext(response,{sourceId:a.foregroundSourceId});else readSemanticTopics(response);
   samples[kind].push(milliseconds(ports.now()-before));}
 }
 async function measured(name,work){
  stage=name;check();const before=ports.now(),samples={context:[],topics:[]};let settled=false,overlap=0,workFailure=false,workError,result;
  const workOriginal=original(work).then(value=>{result=value;},error=>{workFailure=true;workError=error;}).finally(()=>{settled=true;});
  const sampling=(async()=>{await Promise.resolve();for(let i=0;i<8&&!settled;i++){check();overlap++;await probe(samples);if(!settled)await ports.sleep(25);}})();
  const observed=await Promise.allSettled([workOriginal,sampling]);
  phases.push({stage:name,elapsedMs:milliseconds(ports.now()-before),pendingWorkProbeCount:overlap,context:summary(samples.context),topics:summary(samples.topics)});
  if(workFailure)throw workError;if(observed[1].status==='rejected')throw observed[1].reason;check();return result;
 }
 // This port implements real bounded HTTP pagination. Staged apply does not
 // invoke it, so this rehearsal makes no inventory/discovery measurement claim.
 async function knownSourceUrls(){let cursor=null,expected=null;const urls=[],seen=new Set();
  for(let page=0;page<1000;page++){
   const row=record(await http('source-urls',{limit:100,cursor}),['version','urls','nextCursor']),current=readVersion(row.version);
   need(!expected||current.generation===expected.generation&&current.revision>=expected.revision);expected=current;
   need(Array.isArray(row.urls)&&!types.isProxy(row.urls)&&Object.getPrototypeOf(row.urls)===Array.prototype&&row.urls.length<=100&&Reflect.ownKeys(row.urls).length===row.urls.length+1);
   for(let i=0;i<row.urls.length;i++){
    const d=Object.getOwnPropertyDescriptor(row.urls,String(i));need(d?.enumerable&&Object.hasOwn(d,'value'));const url=d.value;
    need(typeof url==='string'&&url.length>0&&url.length<=2048&&!/[\p{Cc}\p{Cf}]/u.test(url));const parsed=new URL(url);need(['http:','https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password);urls.push(url);
   }need(urls.length<=100000);
   if(row.nextCursor===null)return {version:expected,urls};need(typeof row.nextCursor==='string'&&/^[A-Za-z0-9_-]{1,2048}$/u.test(row.nextCursor)&&!seen.has(row.nextCursor));
   cursor=row.nextCursor;seen.add(cursor);
  }throw fail();
 }
 try{
  rows=captures(await original(()=>a.readCapturedTrainingInputs()));
  stage='baseline';const samples={context:[],topics:[]},baselineStart=ports.now();for(let i=0;i<3;i++)await probe(samples);
  phases.push({stage,elapsedMs:milliseconds(ports.now()-baselineStart),pendingWorkProbeCount:0,context:summary(samples.context),topics:summary(samples.topics)});
  stage='reference-configuration';check();const referenceMatcher=ports.loadReference();check();
  // Admission margin only, not a cancellation or completion guarantee.
  need(a.deadline-ports.now()>=45000);
  resources=await measured('encoder-initialization',async()=>{const opened=await ports.openResources({database:a.workerDatabase,referenceMatcher,nextId:ports.nextId,now:()=>new Date().toISOString()});resources=opened;return opened;});
  need(resources.descriptor.productionBinding===!testComposition&&resources.descriptor.titleEncoder.modelId===MODEL&&
   resources.descriptor.titleEncoder.packagedAssetsVerified===!testComposition&&resources.descriptor.installed.matcherIdentityHash===MATCHER);
  installationVerified=true;
  const submitter=ports.submitter(a.submitterDatabase),crawler=ports.crawler({readClient:{version,knownSourceUrls},ingestionRepository:submitter,timeoutMs:30000});
  resources.startWorker({workerId:'private-model-worker',idleDelayMs:10});
  for(const [i,row]of rows.entries()){
   const embedded=await measured('body-encoding-'+(i+1),()=>resources.embedCapturedBody(row.text));row.text=null;
   need(embedded.modelId===MODEL&&Array.isArray(embedded.values)&&embedded.values.length===384&&embedded.values.every(Number.isFinite)&&Math.abs(Math.hypot(...embedded.values)-1)<=1e-5);
   const operationId=ports.nextId('private-model-operation'),expected=await version(),representation={url:row.url,title:row.title,embedding:embedded,extractorVersion:row.extractorVersion};
   // Match the crawler/repository's one canonicalization, while submitting the
   // original encoder coordinates. Resubmitting normalized coordinates would
   // normalize twice and can change binary64 material/digest identity.
   const operationDigest=operationDigestFor(readLearnedIngest({...representation,operationId,expected}));
   const outcome=await measured('queue-application-'+(i+1),()=>crawler.ingest(representation,operationId,expected));
   stage='completion-verification';const status=await original(()=>submitter.status({operationId,operationDigest}));need(status.state==='complete'&&isDeepStrictEqual(status.result,outcome));
   const context=readSemanticContext(await http('context',{sourceId:outcome.sourceId}),{sourceId:outcome.sourceId});
   need(context.version.generation===outcome.version.generation&&context.version.revision>=outcome.version.revision&&context.status==='classified');
   completed.push({id:row.id,sourceInputHash:row.sourceInputHash,operationId,operationDigest,sourceId:outcome.sourceId,sourceVersion:context.sourceVersion,
    topicId:outcome.topicId,supportedPath:context.supportedPath});row.title=null;
  }
 }catch(error){hadFailure=true;primary=error;}
 finally{
  // Observe originals before resource retirement. No deadline race is treated
  // as cancellation, and this helper never closes caller-owned SQL adapters.
  await Promise.allSettled([...pending]);
  if(resources)try{await resources.close();resourcesClosed=true;}catch(error){if(!hadFailure){hadFailure=true;primary=error;stage='closing';}}
  rows=null;
 }
 void primary;
 const proof={schema:'private-model-contention-proof/v1',status:hadFailure?'failed':'passed',failure:hadFailure?{stage,code:'PRIVATE_MODEL_REHEARSAL_FAILED'}:null,
  testComposition,elapsedMs:milliseconds(ports.now()-started),completed,phases,maximumPending,
  installed:installationVerified?{matcherIdentityHash:MATCHER,encoderModelId:MODEL,packagedAssetsVerified:!testComposition}:null,
  cleanup:{resourcesClosed,originalsSettled:pending.size===0,callerDatabasesClosed:false},
  scope:{realE5:!testComposition,realQueuedApply:!testComposition,realHttp:!testComposition,sharedEncoder:true,stagedCrawlerClient:true,
   fullCrawlerDiscovery:false,storedBackfill:false,browser:false,provider:false,qualityEvaluation:false,productionValidated:false,assignmentAuthority:false}};
 need(Buffer.byteLength(JSON.stringify(proof))<=32768);return proof;
}
export async function runPrivateModelRehearsal(context){need(arguments.length===1);return run(context,REAL,false);}
// Trusted pure ports only; its returned proof explicitly disclaims real IO.
export async function runPrivateModelRehearsalForTest(context,dependencies){
 need(arguments.length===2);const ports=record(dependencies,Object.keys(REAL));need(Object.values(ports).every(value=>typeof value==='function'));return run(context,ports,true);
}
