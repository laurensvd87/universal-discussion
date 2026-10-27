// Explicit installed-encoder component check over two authenticated public TRAIN
// rows. This is not a database claim, new quality evaluation, UI or live cutover.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat,readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {openInstalledHierarchyWorkerResources} from '../src/application/hierarchy-worker-resources.js';
import {sourceStamp,operationDigestFor} from '../src/domain/source-threads.js';

const hash=raw=>createHash('sha256').update(raw).digest('hex');
const FIT=new URL('../data/hierarchy-gta-detail-fit-parser-repair-20261026/',import.meta.url);
const OUTPUT=new URL('../data/hierarchy-worker-resources-actual-20261027.json',import.meta.url);
const INPUTS=[
 ['gta-train-01.json',25892,'668d8457fa9cb658e3cfb4d9abb2d2215902807a484600d14233a2007a5a8241',['games','video-games','gta']],
 ['gta-train-05.json',25827,'8f4a109d6aca19ab0aad10ce5df4f64bdb20e68ddf91860ee1fe6af080163e43',['games']],
];
const SOURCES=['./check-installed-hierarchy-worker.js','../src/application/hierarchy-worker-resources.js',
 '../src/application/installed-hierarchy-matcher.js','../src/application/hierarchy-ingestion-preparation.js',
 '../src/application/postgres-ingestion-worker-loop.js','../src/crawler/packaged-e5.js',
 '../portable/canonical-v4/semantic-source-preparation.js','../portable/canonical-v4/semantic-source-repository.js',
 '../portable/canonical-v4/semantic-repository.js','../src/domain/hierarchy-rooted-matcher.js',
 '../src/domain/hierarchy-binary-detail.js'];
async function bounded(url,maximum){const info=await lstat(url);assert.ok(info.isFile()&&!info.isSymbolicLink()&&info.size>0&&info.size<=maximum);
 const raw=await readFile(url);assert.equal(raw.length,info.size);return raw;}
async function sourcePins(){const pins={};for(const name of SOURCES){const raw=await bounded(new URL(name,import.meta.url),262144);pins[name]={bytes:raw.length,sha256:hash(raw)};}return pins;}
function binary(values){const raw=Buffer.alloc(20+384*12);for(const [offset,n] of [[0,1],[4,0],[8,701],[12,384],[16,1]])raw.writeInt32BE(n,offset);
 values.forEach((n,i)=>{raw.writeInt32BE(8,20+i*12);raw.writeDoubleBE(n,24+i*12);});return raw.toString('base64');}
function candidate(row,matcherIdentityHash){
 assert.equal(row.split,'training');assert.equal(row.evaluationStatus,'scored');assert.equal(row.bodyVector.length,384);
 const sourceId='component-'+row.id,operationId='component-operation-'+row.id;
 const input={url:row.url,title:row.title,embedding:{modelId:row.modelId,values:row.bodyVector},extractorVersion:row.observation.extractorVersion};
 const operationDigest=operationDigestFor(input),provenance='owner-local-page-embedding/v1',policyVersion='ridge1-fixed-reference-radius/v1';
 return {sourceId,ordinal:'0',sourceVersion:'0',generation:'component-generation',matcherIdentityHash,
  url:input.url,title:input.title,provenance,extractorVersion:input.extractorVersion,policyVersion,operationId,hasEmbedding:true,
  sourcePayload:JSON.stringify({id:sourceId,...input,provenance,policyVersion,operationId,operationDigest,topicIds:['component-canonical-topic']}),
  embedding:{sourceId,modelId:row.modelId,dimensions:384,payload:JSON.stringify(input.embedding),valuesBase64:binary(row.bodyVector),values:row.bodyVector},
  receipt:{sourceId,operationId,operationDigest},stamp:{sourceId,stamp:sourceStamp(input),postable:true},reuse:null};
}
export async function checkInstalledHierarchyWorker(){
 if(arguments.length)throw new TypeError('Component check accepts no selectors');
 const start=performance.now(),pins=await sourcePins(),inputs=[],rows=[];
 let sqlCalls=0,resources=null,closed=false,cleanupAttempted=false,cleanupFailed=false;
 let stage='input-authentication',currentId=null,initializationMilliseconds=null,failure=null;
 // Exclusive final output is a permanent record; never overwrite a prior run.
 try{await lstat(OUTPUT);throw Error('Component output already exists');}catch(error){if(error?.code!=='ENOENT')throw error;}
 try{
  for(const [file,bytes,sha256,path] of INPUTS){currentId=file;const raw=await bounded(new URL(file,FIT),32768);assert.equal(raw.length,bytes);assert.equal(hash(raw),sha256);
   inputs.push({row:JSON.parse(raw),pin:{file,bytes,sha256},expectedPath:path});}
  stage='encoder-initialization';currentId=null;
  const opening=performance.now();resources=await openInstalledHierarchyWorkerResources({
   database:{query(){sqlCalls++;throw Error('Component check prohibits all SQL');}},
   referenceMatcher:{represent(){throw Error('Component check starts no ingestion loop');}},
   nextId:kind=>'component-'+kind,now:()=> '2026-10-27T00:00:00.000Z',
  });
  initializationMilliseconds=performance.now()-opening;
  assert.equal(resources.descriptor.productionBinding,true);assert.equal(resources.descriptor.titleEncoder.packagedAssetsVerified,true);
  for(const {row,expectedPath} of inputs){
   stage='stored-preparation';currentId=row.id;
   const value=candidate(row,resources.descriptor.installed.matcherIdentityHash),started=performance.now();
   const prepared=await resources.prepareStoredSource(value),preparationMilliseconds=performance.now()-started;
   assert.deepEqual(prepared.supportedPath,expectedPath);
   const maxTitleVectorDifference=Math.max(...prepared.titleValues.map((n,i)=>Math.abs(n-row.titleVector[i])));assert.equal(maxTitleVectorDifference,0);
   stage='cached-preparation';const cached=performance.now();assert.deepEqual(await resources.prepareStoredSource(value),prepared);
   rows.push({id:row.id,path:prepared.supportedPath,sourceVersion:prepared.sourceVersion,preparationMilliseconds,
    cachedMilliseconds:performance.now()-cached,maxTitleVectorDifference});
  }
  stage='encoder-close';currentId=null;cleanupAttempted=true;await resources.close();closed=true;
  stage='end-pins';assert.equal(sqlCalls,0);assert.deepEqual(await sourcePins(),pins);
  for(const {pin} of inputs){const raw=await bounded(new URL(pin.file,FIT),32768);assert.equal(hash(raw),pin.sha256);}
 }catch{
  failure={stage,currentId};
 }finally{
  if(resources&&!cleanupAttempted){cleanupAttempted=true;try{await resources.close();closed=true;}catch{cleanupFailed=true;}}
  else if(resources&&cleanupAttempted&&!closed)cleanupFailed=true;
 }
 const result={schema:'installed-hierarchy-worker-component/v1',status:failure||cleanupFailed?'failed':'passed',failure,
   inputs:inputs.map(x=>x.pin),sourcePins:pins,
   matcherIdentityHash:resources?.descriptor.installed.matcherIdentityHash??null,encoderHash:resources?.descriptor.installed.matcherIdentity.inputDefinition.encoderHash??null,
   initializationMilliseconds,cases:rows,elapsedMilliseconds:performance.now()-start,sqlCalls,
   externalFetchRequested:false,networkActivityMeasured:false,
   encoderClosed:closed,cleanupAttempted,cleanupFailed,productionFactory:true,
   packagedEncoderAssetsVerified:resources?.descriptor.titleEncoder.packagedAssetsVerified===true,
   scope:'Two saved public TRAIN bodies in diagnostic stored-Source envelopes, actual installed title E5; no SQL claims, background loop, browser or new quality evaluation.',
   heldoutUsed:false,semanticQualityMeasured:false,multiUserLoadValidated:false,nativeObservation:false,productionValidated:false,assignmentAuthority:false};
 const raw=Buffer.from(JSON.stringify(result)+'\n');assert.ok(raw.length<=32768);await writeFile(OUTPUT,raw,{flag:'wx'});
 return {status:result.status,bytes:raw.length,sha256:hash(raw),initializationMilliseconds,cases:rows,failure,cleanupFailed};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==2)throw Error('Arguments refused');const result=await checkInstalledHierarchyWorker();
  process.stdout.write(JSON.stringify(result)+'\n');if(result.status!=='passed')process.exitCode=1;}
 catch{process.stderr.write('Installed hierarchy worker component check failed.\n');process.exitCode=1;}
}
