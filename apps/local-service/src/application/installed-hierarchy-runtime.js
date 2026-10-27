// Explicit trusted worker startup. Import starts no encoder, query, queue or
// background job. Registration/migration/head activation remain owner operations.
import {ServiceError} from '../domain/errors.js';
import {readId,readRecord} from '../domain/validation.js';
import {loadInstalledHierarchyMatcher} from './installed-hierarchy-matcher.js';
import {openInstalledHierarchyWorkerResources,verifyInstalledHierarchyWorkerReadiness} from './hierarchy-worker-resources.js';
import {createStoredHierarchyCoordinator} from './stored-hierarchy-coordinator.js';
const unavailable=()=>new ServiceError('unavailable','Installed hierarchy startup unavailable');
function one(result,keys){if(!Array.isArray(result?.rows)||result.rows.length!==1)throw unavailable();return readRecord(result.rows[0],keys);}
async function generation(database){
 try{const row=one(await database.query('SELECT * FROM canonical_v4.semantic_read_revision()'),['generation','revision']);
  readId(row.generation);if(typeof row.revision!=='string'||!/^[a-f0-9]{64}$/u.test(row.revision))throw unavailable();return row.generation;
 }catch{throw unavailable();}
}
async function readiness(database,installed){
 try{return await verifyInstalledHierarchyWorkerReadiness(database,installed);}catch{throw unavailable();}
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
