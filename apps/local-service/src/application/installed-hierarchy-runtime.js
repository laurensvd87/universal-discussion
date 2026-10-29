// Explicit trusted worker startup. Import starts no encoder, query, queue or
// background job. Registration/migration/head activation remain owner operations.
import {ServiceError} from '../domain/errors.js';
import {readId,readRecord} from '../domain/validation.js';
import {loadInstalledHierarchyMatcher} from './installed-hierarchy-matcher.js';
import {openInstalledHierarchyWorkerResources,verifyInstalledHierarchyWorkerReadiness} from './hierarchy-worker-resources.js';
import {createStoredHierarchyCoordinator} from './stored-hierarchy-coordinator.js';
import {createAutomaticSubjectCoordinator} from './automatic-subject-coordinator.js';
import {createAutomaticSubjectRetrievalRepository} from '../../portable/canonical-v4/automatic-subject-retrieval-repository.js';
import {createAutomaticNamedSubjectRepository} from '../../portable/canonical-v4/automatic-named-subject-repository.js';
import {createAutomaticTopicFeedRepository} from '../../portable/canonical-v4/automatic-topic-feed-repository.js';
import {createPublishedTopicEvidenceRepository} from '../../portable/canonical-v4/published-topic-evidence-repository.js';
import {createSingleSourceTopicRepository} from '../../portable/canonical-v4/single-source-topic-repository.js';
import {createUnifiedTopicSearchMaintenance} from '../../portable/canonical-v4/unified-topic-search-maintenance.js';
import {createPublishedTopicMaintenance} from './published-topic-maintenance.js';
const unavailable=()=>new ServiceError('unavailable','Installed hierarchy startup unavailable');
function one(result,keys){if(!Array.isArray(result?.rows)||result.rows.length!==1)throw unavailable();return readRecord(result.rows[0],keys);}
async function generation(database){
 try{const row=one(await database.query('SELECT * FROM canonical_v4.semantic_read_revision()'),['generation','revision']);
  readId(row.generation);if(typeof row.revision!=='string'||!/^[a-f0-9]{64}$/u.test(row.revision))throw unavailable();return row.generation;
 }catch{throw unavailable();}
}
async function readiness(database,installed,schemaProfile){
 try{return await verifyInstalledHierarchyWorkerReadiness(database,installed,schemaProfile);}catch{throw unavailable();}
}
async function open(options,openResources,testComposition){
 const a=readRecord(options,['database','referenceMatcher','nextId','now','workerOptions','automaticTopics'],['database','referenceMatcher','nextId','now']);
 const automaticTopics=Object.hasOwn(a,'automaticTopics')?a.automaticTopics:false;if(typeof automaticTopics!=='boolean')throw unavailable();
 const schemaProfile=automaticTopics?'hierarchy18':'hierarchy17';
 if(!a.database||typeof a.database.query!=='function'||typeof a.referenceMatcher?.represent!=='function'||typeof a.nextId!=='function'||typeof a.now!=='function')throw unavailable();
 const installed=await loadInstalledHierarchyMatcher();
 // Cheap schema/role/head/topology checks precede encoder allocation and claims.
 // The final SQL apply head fence still guards a later owner model change.
 const initialGeneration=await readiness(a.database,installed,schemaProfile);
 let resources=null,coordinator=null,automatic=null,publicEvidence=null,closing=null;
 async function close(){
  if(!closing)closing=(async()=>{
   let failed=false,primary;
   // Signal every producer before waiting for a slow original SQL/model call.
   // Keep the shared encoder and pool alive until all those originals settle.
   const begin=work=>{try{return Promise.resolve(work());}catch(error){return Promise.reject(error);}};
   const stopped=await Promise.allSettled([
    ()=>automatic?.close(),()=>publicEvidence?.close(),()=>coordinator?.close(),()=>resources?.stopWorker?.(),
   ].map(begin));
   for(const result of stopped)if(result.status==='rejected'&&!failed){failed=true;primary=result.reason;}
   try{await resources?.close();}catch(error){if(!failed){failed=true;primary=error;}}
   if(failed)throw primary;
  })();return closing;
 }
 try{
  resources=await openResources({database:a.database,referenceMatcher:a.referenceMatcher,nextId:a.nextId,now:a.now,...(automaticTopics?{schemaProfile}:{})});
  if(resources.descriptor.installed.matcherIdentityHash!==installed.descriptor.matcherIdentityHash)throw unavailable();
  await resources.health();
  // An owner can change CURRENT during the encoder's asynchronous startup.
  // Recheck before creating any claim-capable loop; never repair/activate it here.
  await readiness(a.database,installed,schemaProfile);
  if(automaticTopics){
   // All ports share the existing worker pool; public text and Source titles
   // use the same owned serial E5 queue. No encoder or connection is added.
   const evidence=createPublishedTopicEvidenceRepository({database:a.database}),identity=installed.descriptor.matcherIdentity;
   publicEvidence=createPublishedTopicMaintenance({repository:evidence,resources});
   automatic=createAutomaticSubjectCoordinator({
    descriptorJson:JSON.stringify({matcherHash:installed.descriptor.matcherIdentityHash,representationHash:identity.representationHash,
     inputDefinition:{bodyWeight:identity.inputDefinition.bodyWeight,titleWeight:identity.inputDefinition.titleWeight,encoderHash:identity.inputDefinition.encoderHash}}),
    readGeneration:()=>generation(a.database),retrieval:createAutomaticSubjectRetrievalRepository({database:a.database}),
    subjects:createAutomaticNamedSubjectRepository({database:a.database,publicEvidence:evidence}),
    feeds:createAutomaticTopicFeedRepository({database:a.database}),publicEvidence,
    singleSourceTopics:createSingleSourceTopicRepository({database:a.database}),topicSearch:createUnifiedTopicSearchMaintenance({database:a.database}),
   });
  }
  resources.startWorker(a.workerOptions??{});
  coordinator=createStoredHierarchyCoordinator({resources,readGeneration:()=>generation(a.database)});coordinator.start();
  automatic?.start();
  return Object.freeze({descriptor:resources.descriptor,
   describe:()=>Object.freeze({schema:'installed-hierarchy-runtime/v1',testComposition,initialGeneration,
    background:coordinator.describe(),...(automaticTopics?{automatic:automatic.describe()}:{}),nativeObservation:false,productionValidated:false,assignmentAuthority:false}),
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
