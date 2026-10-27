// Explicit startup composition only. Import opens no files, SQL connections or
// encoder sessions; this module never registers or activates a matcher.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {loadInstalledHierarchyMatcher} from './installed-hierarchy-matcher.js';
import {createPackagedCrawlerEmbedder} from '../crawler/packaged-e5.js';
import {createHierarchyIngestionPreparation} from './hierarchy-ingestion-preparation.js';
import {createStoredSourceHierarchyPreparation} from '../../portable/canonical-v4/semantic-source-preparation.js';
import {createCanonicalV4IngestionRepository} from '../../portable/canonical-v4/ingestion-repository.js';
import {createCanonicalV4SemanticRepository} from '../../portable/canonical-v4/semantic-repository.js';
import {createCanonicalV4SemanticSourceRepository} from '../../portable/canonical-v4/semantic-source-repository.js';
import {startPostgresIngestionWorkerLoop} from './postgres-ingestion-worker-loop.js';
import {createCanonicalV4SemanticMetadataRepository} from '../../portable/canonical-v4/semantic-metadata-repository.js';
import {readId,readRecord} from '../domain/validation.js';
import {inputText} from '../../../../spikes/topic-resolution/browser/embedding/embedding-contract.js';

const LIMIT=8,MODEL='e5-small-q8-browser-main-prefix-v1';
const unavailable=()=>Object.assign(new Error('Hierarchy worker resources unavailable'),{code:'unavailable'});
const invalid=()=>{throw new TypeError('Invalid hierarchy worker resources');};
function fields(value,allowed,required=allowed){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)invalid();
 const out={};for(const key of Reflect.ownKeys(value)){
  if(typeof key!=='string'||!allowed.includes(key))invalid();const d=Object.getOwnPropertyDescriptor(value,key);
  if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[key]=d.value;
 }
 if(required.some(key=>!Object.hasOwn(out,key)))invalid();return out;
}
function workerOptions(value){
 const out=fields(value,['workerId','leaseSeconds','idleDelayMs','nextLeaseToken','onOutcome','onProgress','monotonicNow'],[]);
 if(Object.hasOwn(out,'workerId')&&(typeof out.workerId!=='string'||!out.workerId)||
  Object.hasOwn(out,'leaseSeconds')&&(!Number.isInteger(out.leaseSeconds)||out.leaseSeconds<5||out.leaseSeconds>30)||
  Object.hasOwn(out,'idleDelayMs')&&(!Number.isInteger(out.idleDelayMs)||out.idleDelayMs<5||out.idleDelayMs>1000))invalid();
 for(const key of ['nextLeaseToken','onOutcome','onProgress','monotonicNow'])if(Object.hasOwn(out,key)&&typeof out[key]!=='function')invalid();
 return out;
}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}

// Used by both explicit runtime composition and the direct production factory.
// This is verification only: it cannot migrate, register, activate or claim.
export async function verifyInstalledHierarchyWorkerReadiness(database,installed){
 try{
  await createCanonicalV4IngestionRepository({database,schemaProfile:'hierarchy17'}).health();
  const rows=(await database.query(`SELECT pg_catalog.to_regprocedure($1) IS NOT NULL AS container_installed,
   pg_catalog.has_function_privilege(current_user,pg_catalog.to_regprocedure($2),'EXECUTE') AS semantic_execute,
   coalesce(pg_catalog.has_function_privilege(current_user,pg_catalog.to_regprocedure($1),'EXECUTE'),false) AS container_execute,
   coalesce(pg_catalog.has_function_privilege(current_user,pg_catalog.to_regprocedure($3),'EXECUTE'),false) AS legacy_execute`,[
    'canonical_v4.semantic_apply_source_container(text,text,text,double precision[],text,text,text,text,text,text,boolean)',
    'canonical_v4.semantic_ingest_apply(text,text,text,double precision[],text,text,text,text,text,text,boolean,text,double precision[],text[])',
    'canonical_v4.ingest_apply(text,text,text,double precision[],text,text,text,text,text,text,boolean)'])).rows;
  if(rows.length!==1)throw unavailable();
  const rights=readRecord(rows[0],['container_installed','semantic_execute','container_execute','legacy_execute']);
  if(rights.container_installed!==true||rights.semantic_execute!==true||rights.container_execute!==false||rights.legacy_execute!==false)throw unavailable();
  const revisions=(await database.query('SELECT * FROM canonical_v4.semantic_read_revision()')).rows;
  if(revisions.length!==1)throw unavailable();const stamp=readRecord(revisions[0],['generation','revision']);
  readId(stamp.generation);if(typeof stamp.revision!=='string'||!/^[a-f0-9]{64}$/u.test(stamp.revision))throw unavailable();
  const topology=await createCanonicalV4SemanticMetadataRepository({database}).topics({generation:stamp.generation});
  const expected=[...installed.descriptor.matcherIdentity.nodes].sort((a,b)=>Buffer.compare(Buffer.from(a.id),Buffer.from(b.id)));
  if(topology.matcherIdentityHash!==installed.descriptor.matcherIdentityHash||
      JSON.stringify(topology.nodes.map(({id,parentId})=>({id,parentId})))!==JSON.stringify(expected))throw unavailable();
  return stamp.generation;
 }catch{throw unavailable();}
}

async function openResources(options,dependencies,productionBinding){
 const a=fields(options,['database','referenceMatcher','nextId','now']);
 if(!a.database||typeof a.database.query!=='function'||typeof a.referenceMatcher?.represent!=='function'||typeof a.nextId!=='function'||typeof a.now!=='function')invalid();
 const represent=a.referenceMatcher.represent.bind(a.referenceMatcher);
 const installed=await dependencies.loadInstalled();let encoder=null;
 try{
  const ingest=dependencies.createIngestionRepository({database:a.database,nextId:a.nextId,now:a.now,schemaProfile:'hierarchy17'});
  if(productionBinding)await verifyInstalledHierarchyWorkerReadiness(a.database,installed);
  else await ingest.health(); // Trusted test composition never claims production readiness.
  // Packaged production opener verifies all nine encoder assets and creates
  // its fixed runtime before any loop, claim or externally callable prep exists.
  encoder=await dependencies.openEncoder(installed);
  if(encoder?.modelId!==MODEL||typeof encoder.embed!=='function'||typeof encoder.close!=='function')throw unavailable();
  if(productionBinding)await verifyInstalledHierarchyWorkerReadiness(a.database,installed);
  const semantic=dependencies.createSemanticRepository({database:a.database,nextId:a.nextId,now:a.now});
  const stored=dependencies.createStoredRepository({database:a.database});
  let closed=false,started=false,worker=null,closing=null,admitted=0,firstClaimChecked=false,tail=Promise.resolve();
  const encoding=new Map(),preparations=new Set(),sqlCalls=new Set();
  async function embedTitle(title){
   if(closed)throw unavailable();
   const key=createHash('sha256').update(title).digest('hex');let work=encoding.get(key);
   if(!work){
    if(encoding.size>=LIMIT)throw unavailable();let text=title;
    work=tail.then(async()=>{try{if(closed)throw unavailable();const result=await encoder.embed(text);if(closed)throw unavailable();return result;}finally{text=null;}});
    encoding.set(key,work);tail=work.then(()=>undefined,()=>undefined);
    void work.then(()=>encoding.delete(key),()=>encoding.delete(key));
   }
   const result=await work;if(closed)throw unavailable();return result;
  }
  const livePrep=createHierarchyIngestionPreparation({matcher:installed.matcher,embedTitle});
  const storedPrep=createStoredSourceHierarchyPreparation({matcher:installed.matcher,embedTitle});
  // Captured body text uses the very same serial queue and fixed encoder as
  // titles. The resource owns its lifetime; callers receive no close/selector
  // capability, and identical text shares work only while encoding is pending.
  const bodyPrep=Object.freeze({prepare:embedTitle});
  async function prepare(prep,value){
   if(closed||admitted>=LIMIT)throw unavailable();admitted++;
   const work=prep.prepare(value);preparations.add(work);
   try{const result=await work;if(closed)throw unavailable();return result;}
   finally{preparations.delete(work);admitted--;}
  }
  async function prepareClaim(claim){
   // The durable repository owns the larger lease envelope. Numeric prep accepts
   // exactly these four material fields and independently checks their digest.
   return prepare(livePrep,{operationId:claim.operationId,operationDigest:claim.operationDigest,requestMaterial:claim.requestMaterial,input:claim.input});
  }
  const repository=Object.freeze({
   claim:async value=>{
    if(closed)throw unavailable();
    if(productionBinding&&!firstClaimChecked){await verifyInstalledHierarchyWorkerReadiness(a.database,installed);if(closed)throw unavailable();firstClaimChecked=true;}
    return ingest.claim(value);
   },
   failClaim:(...args)=>ingest.failClaim(...args),
   apply:(claim,value)=>{if(closed)throw unavailable();return semantic.apply(claim,value);},
  });
  async function sqlCall(call){
   if(closed||sqlCalls.size>=LIMIT)throw unavailable();
   // Retain the physical original, even when closing suppresses delivery to its
   // caller. Closing neither retries nor cancels/claims rollback of SQL work.
   const original=Promise.resolve(call()),entry={original};sqlCalls.add(entry);
   try{const result=await original;if(closed)throw unavailable();return result;}
   finally{sqlCalls.delete(entry);}
  }
  const descriptor=freeze({schema:'hierarchy-worker-resources/v1',productionBinding,installed:installed.descriptor,
   titleEncoder:{modelId:MODEL,sharedSingleFlight:true,maximumPendingPreparations:LIMIT,
    packagedAssetsVerified:productionBinding},nativeObservation:false,productionValidated:false,assignmentAuthority:false});
  return Object.freeze({descriptor,
   async embedCapturedBody(text){
    if(arguments.length!==1)invalid();inputText(text);
    return prepare(bodyPrep,text);
   },
   health:()=>sqlCall(()=>ingest.health()),
   prepareStoredSource:value=>prepare(storedPrep,value),
   storedSources:Object.freeze({candidates:value=>sqlCall(()=>stored.candidates(value)),reclassify:value=>sqlCall(()=>stored.reclassify(value))}),
   startWorker(options={}){
    const selected=workerOptions(options);if(closed||started)throw unavailable();started=true;
    worker=startPostgresIngestionWorkerLoop({...selected,repository,referenceMatcher:Object.freeze({represent}),prepareClaim});
    return worker;
   },
   close(){
    if(!closing){
     closed=true;
     closing=(async()=>{
      let failed=false,primary;const settle=async work=>{try{await work();}catch(error){if(!failed){failed=true;primary=error;}}};
      await settle(async()=>{if(worker)await worker.close();});
      await settle(()=>Promise.all([livePrep.close(),storedPrep.close()]));
      await settle(()=>Promise.allSettled([...preparations]));
      await settle(()=>Promise.allSettled([...sqlCalls].map(entry=>entry.original)));
      await settle(()=>tail);
      await settle(()=>encoder.close());
      if(failed)throw primary;
     })();
    }
    return closing;
   },
  });
 }catch(error){try{if(encoder&&typeof encoder.close==='function')await encoder.close();}catch{/* Preserve startup failure. */}throw error;}
}

export async function openInstalledHierarchyWorkerResources(options){
 if(arguments.length!==1)invalid();
 return openResources(options,{loadInstalled:loadInstalledHierarchyMatcher,openEncoder:installed=>createPackagedCrawlerEmbedder({
   expectedManifestSha256:installed.descriptor.assets['encoder-manifest.json'].sha256}),
  createIngestionRepository:createCanonicalV4IngestionRepository,createSemanticRepository:createCanonicalV4SemanticRepository,
  createStoredRepository:createCanonicalV4SemanticSourceRepository},true);
}
// Trusted pure composition seam; it is explicitly NOT a production encoder or
// SQL binding. The real numeric preparations and real worker loop remain fixed.
export async function openHierarchyWorkerResourcesForTest(options,dependencies){
 if(arguments.length!==2)invalid();const d=fields(dependencies,['loadInstalled','openEncoder','createIngestionRepository','createSemanticRepository','createStoredRepository']);
 if(Object.values(d).some(value=>typeof value!=='function'))invalid();return openResources(options,d,false);
}
