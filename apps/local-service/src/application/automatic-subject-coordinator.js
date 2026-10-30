// Bounded optional background work. Construction/import do no IO. This loop
// consumes derived index/discovery requests; it never claims canonical ingestion
// jobs, captures pages, opens a model or changes canonical discussion routes.
import {types} from 'node:util';
import {compilePairedE5Input,describePairedE5Input} from '../domain/hierarchical-e5-paired-input.js';
import {buildAutomaticSubjectCohort,buildAutomaticSubjectCohortV3} from './automatic-subject-cohort.js';
import {planAutomaticNamedSubjectsV2,planAutomaticNamedSubjectsV3} from './automatic-named-subject-plan.js';
const bad=()=>{throw new TypeError('Invalid automatic topic coordinator');};
const unavailable=()=>Object.assign(Error('Automatic topic coordinator unavailable'),{code:'unavailable'});
const MAX=Number.MAX_SAFE_INTEGER;
function fields(v,keys){if(!v||types.isProxy(v)||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)bad();
 const r={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();r[k]=d.value;}return r;}
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(v);
function wait(ms,signal){if(signal.aborted)return Promise.resolve();return new Promise(resolve=>{const timer=setTimeout(done,ms);timer.unref?.();
 function done(){clearTimeout(timer);signal.removeEventListener('abort',done);resolve();}signal.addEventListener('abort',done,{once:true});});}
function create(options,pause,testComposition){
 if(!options||types.isProxy(options))bad();const hasFeeds=Object.hasOwn(options,'feeds');
 const hasPublic=Object.hasOwn(options,'publicEvidence');
 const hasSingle=Object.hasOwn(options,'singleSourceTopics');
 const hasSearch=Object.hasOwn(options,'topicSearch');
 const hasPolicy=Object.hasOwn(options,'namePolicyVersion');
 const {retrieval,subjects,readGeneration,descriptorJson,feeds=null,publicEvidence=null,singleSourceTopics=null,topicSearch=null,namePolicyVersion=2}=fields(options,['retrieval','subjects','readGeneration','descriptorJson',...(hasFeeds?['feeds']:[]),...(hasPublic?['publicEvidence']:[]),...(hasSingle?['singleSourceTopics']:[]),...(hasSearch?['topicSearch']:[]),...(hasPolicy?['namePolicyVersion']:[])]);
 if(![2,3].includes(namePolicyVersion))bad();
 const buildCohort=namePolicyVersion===3?buildAutomaticSubjectCohortV3:buildAutomaticSubjectCohort;
 const planSubjects=namePolicyVersion===3?planAutomaticNamedSubjectsV3:planAutomaticNamedSubjectsV2;
 if(typeof readGeneration!=='function'||typeof descriptorJson!=='string'||Buffer.byteLength(descriptorJson)>2048)bad();let descriptor;
 try{descriptor=fields(JSON.parse(descriptorJson),['matcherHash','representationHash','inputDefinition']);}catch{bad();}
 if(typeof descriptor.matcherHash!=='string'||typeof descriptor.representationHash!=='string'||!/^[a-f0-9]{64}$/u.test(descriptor.matcherHash)||!/^[a-f0-9]{64}$/u.test(descriptor.representationHash)||
   describePairedE5Input(compilePairedE5Input(descriptor.inputDefinition)).representationHash!==descriptor.representationHash)bad();
 for(const name of ['indexTasks','index','discoveryTasks','neighbours','complete'])if(typeof retrieval?.[name]!=='function')bad();
 for(const name of ['candidates','publish'])if(typeof subjects?.[name]!=='function')bad();
 if(hasFeeds&&(!feeds||typeof feeds.tasks!=='function'||typeof feeds.process!=='function'))bad();
 if(hasPublic&&(!publicEvidence||typeof publicEvidence.turn!=='function'))bad();
 if(hasSingle&&(!singleSourceTopics||typeof singleSourceTopics.match!=='function'))bad();
 if(hasSearch&&(!topicSearch||typeof topicSearch.tasks!=='function'||typeof topicSearch.process!=='function'))bad();
 let started=false,closed=false,running=null,closing=null,generation=null,phase='idle',lastOutcome='not-started';const abort=new AbortController();
 const counts={turns:0,indexed:0,indexRetired:0,discoveries:0,published:0,retained:0,capacity:0,conflicts:0,failures:0,generationChanges:0,
  feedCompleted:0,feedAdvanced:0,feedBusy:0,feedRetired:0};
 if(hasPublic)Object.assign(counts,{publicEvidenceCompleted:0,publicEvidenceDeferred:0});
 if(hasSingle)Object.assign(counts,{singleMatched:0,singleRetained:0,singleUnresolved:0,singleCapacity:0,singleBusy:0,singleRetired:0});
 if(hasSearch)Object.assign(counts,{searchCompleted:0,searchBusy:0,searchRetired:0});
 const bump=key=>{counts[key]=Math.min(MAX,counts[key]+1);};
 function failure(error){bump(error?.code==='conflict'?'conflicts':'failures');lastOutcome=phase+'-unavailable';}
 async function matchSingle(scope,sourceId){
  phase='single-source';const r=await singleSourceTopics.match(JSON.stringify({...scope,sourceId}));if(closed)return null;
  const s=fields(r,['status','subjectId','candidates']);if(!['matched','retained','unresolved','capacity','busy','retired'].includes(s.status)||
   !Number.isSafeInteger(s.candidates)||s.candidates<0||s.candidates>65||(['matched','retained'].includes(s.status)?
    typeof s.subjectId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(s.subjectId):s.subjectId!==null))bad();
  bump({matched:'singleMatched',retained:'singleRetained',unresolved:'singleUnresolved',capacity:'singleCapacity',busy:'singleBusy',retired:'singleRetired'}[s.status]);return s.status;
 }
 async function turn(){
  bump('turns');phase='generation';const next=await readGeneration();if(closed)return false;if(!validId(next))bad();
  if(generation!==next){if(generation!==null)bump('generationChanges');generation=next;}
  const scope={generation,matcherHash:descriptor.matcherHash},rawScope=JSON.stringify(scope);let work=false;
  if(feeds){phase='feed-tasks';try{
   const tasks=await feeds.tasks(JSON.stringify({generation}));if(closed)return work;
   if(!Array.isArray(tasks)||tasks.length>8||new Set(tasks).size!==tasks.length||tasks.some(t=>typeof t!=='string'||!/^[1-9][0-9]{0,18}$/u.test(t)||BigInt(t)>9223372036854775807n))bad();
   for(const eventId of tasks){if(closed)return work;phase='feed';try{
    const status=await feeds.process(JSON.stringify({generation,eventId}));if(closed)return work;
    if(!['completed','advanced','busy','retired'].includes(status))bad();
    const key={completed:'feedCompleted',advanced:'feedAdvanced',busy:'feedBusy',retired:'feedRetired'}[status];bump(key);
    if(status!=='busy')work=true;
   }catch(error){failure(error);}}
  }catch(error){failure(error);}}
  if(topicSearch){phase='search-tasks';try{
   const tasks=await topicSearch.tasks(JSON.stringify({generation}));if(closed)return work;
   if(!Array.isArray(tasks)||tasks.length>8||new Set(tasks).size!==tasks.length||tasks.some(t=>typeof t!=='string'||!/^[1-9][0-9]{0,18}$/u.test(t)||BigInt(t)>9223372036854775807n))bad();
   for(const eventId of tasks){if(closed)return work;phase='search';try{
    const status=await topicSearch.process(JSON.stringify({generation,eventId}));if(closed)return work;
    if(!['completed','busy','retired'].includes(status))bad();bump({completed:'searchCompleted',busy:'searchBusy',retired:'searchRetired'}[status]);if(status!=='busy')work=true;
   }catch(error){failure(error);}}
  }catch(error){failure(error);}}
  if(publicEvidence){phase='public-evidence';try{
   const outcomes=await publicEvidence.turn(rawScope);if(closed)return work;
   if(!Array.isArray(outcomes)||outcomes.length>2||outcomes.some(s=>!['stored','retained','excluded','busy','retired','completed','advanced','deferred'].includes(s)))bad();
   for(const outcome of outcomes){if(outcome==='deferred')bump('publicEvidenceDeferred');else if(outcome!=='busy'){bump('publicEvidenceCompleted');work=true;}}
  }catch(error){failure(error);}}
  phase='index-tasks';const tasks=await retrieval.indexTasks(rawScope);if(closed)return false;
  if(!Array.isArray(tasks)||tasks.length>8)bad();
  for(const task of tasks){if(closed)return work;work=true;phase='index';try{
   const status=await retrieval.index(JSON.stringify({...scope,task}));if(closed)return work;
   if(status==='indexed'){bump('indexed');if(singleSourceTopics)await matchSingle(scope,task.sourceId);}
   else if(['retired','obsolete','zero-paired-norm'].includes(status))bump('indexRetired');else bad();
  }catch(error){failure(error);}}
  if(closed)return work;phase='discovery-tasks';const seeds=await retrieval.discoveryTasks(rawScope);if(closed)return work;
  if(!Array.isArray(seeds)||seeds.length>4)bad();
  for(const seed of seeds){if(closed)return work;work=true;phase='neighbours';try{
   const request=JSON.stringify({...scope,...fields(seed,['sourceId','indexOrdinal'])}),rows=await retrieval.neighbours(request);if(closed)return work;
   if(rows===null){await retrieval.complete(request);continue;}
   phase='cohort';const cohort=buildCohort(JSON.stringify({...descriptor,generation,seedSourceId:seed.sourceId,rows})),input=cohort.input;
   const first=planSubjects(JSON.stringify(input));if(first.proposalStatus==='capacity'){
    await retrieval.complete(request);if(closed)return work;bump('capacity');lastOutcome='cohort-capacity-page-context';continue;
   }
   const scopes=[...new Map(first.updates.map(u=>[JSON.stringify([u.focusKey,u.contextRootId]),{focusKey:u.focusKey,contextRootId:u.contextRootId}])).values()];
   phase='candidates';if(scopes.length){const candidates=await subjects.candidates(JSON.stringify({generation,representationHash:descriptor.representationHash,scopes}));if(closed)return work;
    // The cohort result is immutable. Copy only the outer publication envelope.
    phase='publishing';const result=await subjects.publish(JSON.stringify({...input,candidates}));if(closed)return work;
    if(result?.status!=='published')throw unavailable();bump('published');for(const s of result.selections)if(s.reason==='retained-supported-subject')bump('retained');
   }else{phase='publishing';const result=await subjects.publish(JSON.stringify(input));if(closed)return work;if(result?.status!=='published')throw unavailable();bump('published');}
   // Initial index matching makes an existing topic available before the more
   // expensive neighbourhood work. Recheck afterwards so a broad cohort cannot
   // leave this page below a still-confident existing leaf.
   if(singleSourceTopics){const matched=await matchSingle(scope,seed.sourceId);if(closed)return work;
    if(matched==='busy')throw Object.assign(unavailable(),{code:'conflict'});}
   phase='complete';const completed=await retrieval.complete(request);if(closed)return work;
   if(completed===true){bump('discoveries');lastOutcome='published';}else lastOutcome='published-seed-replaced';
  }catch(error){failure(error);}}
  return work;
 }
 async function run(){while(!closed){let worked=false;const before=counts.failures+counts.conflicts;try{worked=await turn();}catch(error){if(!closed)failure(error);}
   if(closed)break;phase='waiting';await pause(worked&&before===counts.failures+counts.conflicts?100:1000,abort.signal);
  }phase='closed';}
 const api=Object.freeze({start(){if(started||closed)throw unavailable();started=true;running=run();return api;},
  describe:()=>Object.freeze({schema:'automatic-topic-coordinator/v1',phase,lastOutcome,counts:Object.freeze({...counts}),testComposition,...(hasPolicy?{namePolicyVersion}:{}),
   limits:Object.freeze({indexTasks:8,discoveryTasks:4,feedTasks:feeds?8:0,...(hasPublic?{publicEvidenceTasks:2}:{}),...(hasSingle?{singleSourceMatches:12}:{}),...(hasSearch?{searchTasks:8}:{}),rawNeighbours:128,cohort:64}),assignmentAuthority:false,nativeObservation:false}),
  close(){if(!closing){closed=true;abort.abort();closing=(async()=>{if(running)await running;phase='closed';})();}return closing;}
 });return api;
}
export function createAutomaticSubjectCoordinator(options){if(arguments.length!==1)bad();return create(options,wait,false);}
export function createAutomaticSubjectCoordinatorForTest(options,{wait:pause}={}){if(arguments.length!==2||typeof pause!=='function')bad();return create(options,pause,true);}
