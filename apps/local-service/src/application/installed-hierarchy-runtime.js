// Explicit trusted worker startup. Import starts no encoder, query, queue or
// background job. Registration/migration/head activation remain owner operations.
import {ServiceError} from '../domain/errors.js';
import {readId,readRecord} from '../domain/validation.js';
import {loadInstalledHierarchyMatcher} from './installed-hierarchy-matcher.js';
import {openInstalledHierarchyWorkerResources} from './hierarchy-worker-resources.js';
import {createStoredHierarchyCoordinator} from './stored-hierarchy-coordinator.js';
import {createCanonicalV4SemanticMetadataRepository} from '../../portable/canonical-v4/semantic-metadata-repository.js';

const CONTAINER='canonical_v4.semantic_apply_source_container(text,text,text,double precision[],text,text,text,text,text,text,boolean)';
const LEGACY='canonical_v4.ingest_apply(text,text,text,double precision[],text,text,text,text,text,text,boolean)';
const APPLY='canonical_v4.semantic_ingest_apply(text,text,text,double precision[],text,text,text,text,text,text,boolean,text,double precision[],text[])';
const PRIVILEGES=`SELECT pg_catalog.to_regprocedure($1) IS NOT NULL AS container_installed,
 pg_catalog.has_function_privilege(current_user,pg_catalog.to_regprocedure($2),'EXECUTE') AS semantic_execute,
 coalesce(pg_catalog.has_function_privilege(current_user,pg_catalog.to_regprocedure($1),'EXECUTE'),false) AS container_execute,
 coalesce(pg_catalog.has_function_privilege(current_user,pg_catalog.to_regprocedure($3),'EXECUTE'),false) AS legacy_execute`;
const unavailable=()=>new ServiceError('unavailable','Installed hierarchy startup unavailable');
function one(result,keys){if(!Array.isArray(result?.rows)||result.rows.length!==1)throw unavailable();return readRecord(result.rows[0],keys);}
async function generation(database){
 try{const row=one(await database.query('SELECT * FROM canonical_v4.semantic_read_revision()'),['generation','revision']);
  readId(row.generation);if(typeof row.revision!=='string'||!/^[a-f0-9]{64}$/u.test(row.revision))throw unavailable();return row.generation;
 }catch{throw unavailable();}
}
async function readiness(database,installed){
 try{
  const rights=one(await database.query(PRIVILEGES,[CONTAINER,APPLY,LEGACY]),['container_installed','semantic_execute','container_execute','legacy_execute']);
  if(rights.container_installed!==true||rights.semantic_execute!==true||rights.container_execute!==false||rights.legacy_execute!==false)throw unavailable();
  const currentGeneration=await generation(database),metadata=createCanonicalV4SemanticMetadataRepository({database});
  const topology=await metadata.topics({generation:currentGeneration});
  if(topology.matcherIdentityHash!==installed.descriptor.matcherIdentityHash)throw unavailable();
  const actual=topology.nodes.map(({id,parentId})=>({id,parentId}));
  const expected=[...installed.descriptor.matcherIdentity.nodes].sort((a,b)=>Buffer.compare(Buffer.from(a.id),Buffer.from(b.id)));
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw unavailable();
  return currentGeneration;
 }catch{throw unavailable();}
}
async function open(options,openResources,testComposition){
 const a=readRecord(options,['database','referenceMatcher','nextId','now','workerOptions'],['database','referenceMatcher','nextId','now']);
 if(!a.database||typeof a.database.query!=='function'||typeof a.referenceMatcher?.represent!=='function'||typeof a.nextId!=='function'||typeof a.now!=='function')throw unavailable();
 const installed=await loadInstalledHierarchyMatcher();
 // Cheap schema/role/head/topology checks precede encoder allocation and claims.
 // The final SQL apply head fence still guards a later owner model change.
 const initialGeneration=await readiness(a.database,installed);
 let resources=null,coordinator=null,closing=null;
 async function close(){
  if(!closing)closing=(async()=>{
   let failed=false,primary;
   try{await coordinator?.close();}catch(error){failed=true;primary=error;}
   try{await resources?.close();}catch(error){if(!failed){failed=true;primary=error;}}
   if(failed)throw primary;
  })();return closing;
 }
 try{
  resources=await openResources({database:a.database,referenceMatcher:a.referenceMatcher,nextId:a.nextId,now:a.now});
  if(resources.descriptor.installed.matcherIdentityHash!==installed.descriptor.matcherIdentityHash)throw unavailable();
  await resources.health();
  // An owner can change CURRENT during the encoder's asynchronous startup.
  // Recheck before creating any claim-capable loop; never repair/activate it here.
  await readiness(a.database,installed);
  resources.startWorker(a.workerOptions??{});
  coordinator=createStoredHierarchyCoordinator({resources,readGeneration:()=>generation(a.database)});coordinator.start();
  return Object.freeze({descriptor:resources.descriptor,
   describe:()=>Object.freeze({schema:'installed-hierarchy-runtime/v1',testComposition,initialGeneration,
    background:coordinator.describe(),nativeObservation:false,productionValidated:false,assignmentAuthority:false}),
   close,
  });
 }catch(error){try{await close();}catch{/* Preserve the startup failure. */}throw error;}
}
export async function openInstalledHierarchyRuntime(options){
 if(arguments.length!==1)throw unavailable();return open(options,openInstalledHierarchyWorkerResources,false);
}
// Trusted lifecycle test seam. Fixed readiness, metadata decoder and real paced
// coordinator are retained; injected resources are never a production binding.
export async function openInstalledHierarchyRuntimeForTest(options,{openResources}={}){
 if(arguments.length!==2||typeof openResources!=='function')throw unavailable();return open(options,openResources,true);
}
