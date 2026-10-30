import test from 'node:test';import assert from 'node:assert/strict';
import {createAutomaticSubjectCoordinatorForTest as create} from '../src/application/automatic-subject-coordinator.js';
import {createAutomaticNamedSubjectRepository} from '../portable/canonical-v4/automatic-named-subject-repository.js';
import {automaticCohortFixture as fixture} from './fixtures/automatic-subject-cohort.js';
import {GENERAL_SUBJECT_POLICY_V3_HASH} from '../src/application/automatic-named-subject-plan.js';
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function setup({namePolicyVersion}={}){
 const a=fixture(),events=[],waiting=defer();let published=null;
 const options={descriptorJson:JSON.stringify({matcherHash:a.matcherHash,representationHash:a.representationHash,inputDefinition:a.inputDefinition}),readGeneration:async()=>a.generation,
  ...(namePolicyVersion===undefined?{}:{namePolicyVersion}),
  retrieval:{indexTasks:async()=>[],index:async()=>{events.push('index');return 'indexed';},discoveryTasks:async()=>[{sourceId:a.seedSourceId,indexOrdinal:'1'}],
   neighbours:async()=>a.rows,complete:async()=>{events.push('complete');return true;}},
  subjects:createAutomaticNamedSubjectRepository({...(namePolicyVersion===undefined?{}:{namePolicyVersion}),database:{async query(sql,args){
   if(sql.includes('named_candidates')){events.push('candidates');return {rows:[{result:[]}]};}
   events.push('publish');published=JSON.parse(args[0]);return {rows:[{result:{generation:published.generation,policyHash:published.policyHash,
    subjects:published.updates.map(u=>({subjectId:u.subjectId,revision:'1'})),selections:published.selections}}]};
  }}})};
 const pause=(ms,signal)=>{waiting.resolve(ms);return new Promise(resolve=>{if(signal.aborted)resolve();else signal.addEventListener('abort',resolve,{once:true});});};
 return {a,options,events,waiting,pause,published:()=>published};
}

test('two public evidence tasks share the existing turn without blocking subsequent Source discovery',async()=>{
 const s=setup();s.options.publicEvidence={turn:async raw=>{assert.deepEqual(JSON.parse(raw),{generation:s.a.generation,matcherHash:s.a.matcherHash});s.events.push('public');return ['stored','deferred'];}};
 const loop=create(s.options,{wait:s.pause}).start();await s.waiting.promise;assert.equal(s.events[0],'public');assert(s.events.includes('publish'));
 assert.equal(loop.describe().counts.publicEvidenceCompleted,1);assert.equal(loop.describe().counts.publicEvidenceDeferred,1);assert.equal(loop.describe().limits.publicEvidenceTasks,2);await loop.close();
});

test('public search work is bounded in the existing loop and does not prevent independent discovery',async()=>{
 const s=setup();s.options.topicSearch={tasks:async()=>['1','2','3'],process:async raw=>{const a=JSON.parse(raw);assert.equal(a.generation,s.a.generation);s.events.push('search-'+a.eventId);return ['completed','busy','retired'][Number(a.eventId)-1];}};
 const loop=create(s.options,{wait:s.pause}).start();await s.waiting.promise;assert.deepEqual(s.events.slice(0,3),['search-1','search-2','search-3']);assert(s.events.includes('publish'));
 const d=loop.describe();assert.equal(d.limits.searchTasks,8);assert.equal(d.counts.searchCompleted,1);assert.equal(d.counts.searchBusy,1);assert.equal(d.counts.searchRetired,1);await loop.close();
});
test('invalid public search jobs and a failed search port leave independent Source work available',async()=>{
 for(const tasks of [['1','1'],Array.from({length:9},(_,i)=>String(i+1)),['0']]){
  const s=setup();s.options.topicSearch={tasks:async()=>tasks,process:async()=>assert.fail('Malformed list dispatched')};
  const loop=create(s.options,{wait:s.pause}).start();await s.waiting.promise;assert(s.events.includes('publish'));assert.equal(loop.describe().counts.failures,1);await loop.close();
 }
});
test('shutdown joins physical public search maintenance before dispatching any later work',async()=>{
 const s=setup(),entered=defer(),release=defer();s.options.topicSearch={tasks:async()=>['1'],process:async()=>{entered.resolve();return release.promise;}};
 const loop=create(s.options,{wait:s.pause}).start();await entered.promise;let closed=false;const closing=loop.close().then(()=>{closed=true;});await Promise.resolve();assert.equal(closed,false);
 release.resolve('completed');await closing;assert(!s.events.includes('publish'));
});

test('a failed public evidence port does not acknowledge its jobs or prevent independent discovery',async()=>{
 const s=setup();s.options.publicEvidence={turn:async()=>{throw Error('temporary public index refusal');}};
 const loop=create(s.options,{wait:s.pause}).start();await s.waiting.promise;assert(s.events.includes('publish'));assert.equal(loop.describe().counts.failures,1);await loop.close();
});

test('bounded discovery uses the real cohort and general publisher without model, capture or canonical queue work',async()=>{
 const s=setup(),loop=create(s.options,{wait:s.pause});assert.deepEqual(s.events,[]);loop.start();assert.equal(await s.waiting.promise,100);
 assert.deepEqual(s.events,['candidates','publish','complete']);assert.equal(s.published().updates[0].label,'Kapsalon');
 assert.equal(loop.describe().counts.discoveries,1);assert.equal(loop.describe().testComposition,true);await loop.close();assert.equal(loop.describe().phase,'closed');
});
test('explicit V3 coordinator and repository agree on policy and exclude generic headline subjects',async()=>{
 const s=setup({namePolicyVersion:3});s.a.rows[0].title='Alle reden über GTA 6';s.a.rows[1].title='GTA 6: Alle neuen Screenshots';s.a.rows.forEach(r=>{r.supportedPath=['games'];});
 const loop=create(s.options,{wait:s.pause}).start();await s.waiting.promise;const sent=s.published();assert(sent);assert.equal(sent.policyHash,GENERAL_SUBJECT_POLICY_V3_HASH);
 assert.deepEqual(sent.updates.map(u=>u.label),['GTA 6']);assert.equal(loop.describe().namePolicyVersion,3);assert.equal(loop.describe().counts.failures,0);await loop.close();
});
test('policy mismatch never downgrades or acknowledges the unprocessed discovery',async()=>{
 const s=setup({namePolicyVersion:3});s.options.namePolicyVersion=2;const loop=create(s.options,{wait:s.pause}).start();assert.equal(await s.waiting.promise,1000);
 assert.equal(s.published(),null);assert.equal(s.events.includes('complete'),false);assert.equal(loop.describe().counts.failures,1);await loop.close();
 assert.throws(()=>create({...s.options,namePolicyVersion:true},{wait:s.pause}));
});
test('index tasks precede discovery and do not start another encoder or ingestion worker',async()=>{
 const s=setup();s.options.retrieval.indexTasks=async()=>[{sourceId:'source-a',queueOrdinal:'1',snapshot:null}];
 const loop=create(s.options,{wait:s.pause}).start();await s.waiting.promise;assert.equal(s.events[0],'index');assert.equal(loop.describe().counts.indexed,1);await loop.close();
});
test('existing topic matching runs immediately after indexing and again after broader discovery',async()=>{
 const s=setup();s.options.retrieval.indexTasks=async()=>[{sourceId:s.a.seedSourceId,queueOrdinal:'1',snapshot:null}];
 s.options.singleSourceTopics={match:async raw=>{assert.equal(JSON.parse(raw).sourceId,s.a.seedSourceId);s.events.push('single');return {status:'matched',subjectId:'a0000000-0000-4000-8000-000000000001',candidates:2};}};
 const loop=create(s.options,{wait:s.pause}).start();await s.waiting.promise;assert.deepEqual(s.events,['index','single','candidates','publish','single','complete']);
 assert.equal(loop.describe().counts.singleMatched,2);assert.equal(loop.describe().limits.singleSourceMatches,12);await loop.close();
});
test('a busy final single-page lookup leaves the durable discovery request unacknowledged',async()=>{
 const s=setup();s.options.singleSourceTopics={match:async()=>({status:'busy',subjectId:null,candidates:1})};
 const loop=create(s.options,{wait:s.pause}).start();assert.equal(await s.waiting.promise,1000);assert(!s.events.includes('complete'));assert.equal(loop.describe().counts.singleBusy,1);await loop.close();
});
test('close joins physical single-page work without dispatching later discovery or completion',async()=>{
 const s=setup(),entered=defer(),release=defer();s.options.singleSourceTopics={match:async()=>{entered.resolve();return release.promise;}};
 const loop=create(s.options,{wait:s.pause}).start();await entered.promise;let closed=false;const closing=loop.close().then(()=>{closed=true;});await Promise.resolve();assert.equal(closed,false);
 release.resolve({status:'unresolved',subjectId:null,candidates:0});await closing;assert(!s.events.includes('complete'));
});
test('an uncertain publication is not acknowledged; its durable request can be retried after backoff',async()=>{
 const s=setup();s.options.subjects={candidates:async()=>[],publish:async()=>{throw Object.assign(Error('stale Source'),{code:'conflict'});}};
 const loop=create(s.options,{wait:s.pause}).start();assert.equal(await s.waiting.promise,1000);
 assert.equal(s.events.includes('complete'),false);assert.equal(loop.describe().counts.conflicts,1);await loop.close();
});
test('closing waits for the physical publication and leaves its completion marker untouched',async()=>{
 const s=setup(),entered=defer(),physical=defer();s.options.subjects={candidates:async()=>[],publish:async()=>{entered.resolve();return physical.promise;}};
 const loop=create(s.options,{wait:s.pause}).start();await entered.promise;let closed=false;const close=loop.close().then(()=>{closed=true;});
 await Promise.resolve();assert.equal(closed,false);physical.resolve({status:'published',subjects:[],selections:[]});await close;
 assert.equal(s.events.includes('complete'),false);assert.equal(loop.describe().phase,'closed');
});
test('an unsupported normalization workload stays page-only and retires this derived attempt instead of spinning',async()=>{
 const s=setup();s.a.rows.forEach(r=>{r.title='\ufdfa'.repeat(40);});const loop=create(s.options,{wait:s.pause}).start();await s.waiting.promise;
 assert.deepEqual(s.events,['complete']);assert.equal(loop.describe().counts.capacity,1);assert.equal(loop.describe().counts.published,0);await loop.close();
});
test('a replaced cache seed is not reported as completed even if publication committed',async()=>{
 const s=setup();s.options.retrieval.complete=async()=>false;const loop=create(s.options,{wait:s.pause}).start();await s.waiting.promise;
 assert.equal(loop.describe().counts.published,1);assert.equal(loop.describe().counts.discoveries,0);assert.equal(loop.describe().lastOutcome,'published-seed-replaced');await loop.close();
});

test('feed work is bounded and precedes independent discovery in the existing coordinator',async()=>{
 const s=setup();s.options.feeds={tasks:async()=>['1','2','3','4'],process:async raw=>{const a=JSON.parse(raw);assert.equal(a.generation,s.a.generation);
  s.events.push('feed-'+a.eventId);return ['completed','advanced','busy','retired'][Number(a.eventId)-1];}};
 const loop=create(s.options,{wait:s.pause}).start();await s.waiting.promise;
 assert.deepEqual(s.events.slice(0,4),['feed-1','feed-2','feed-3','feed-4']);assert(s.events.includes('publish'));
 const d=loop.describe();assert.equal(d.limits.feedTasks,8);for(const k of ['feedCompleted','feedAdvanced','feedBusy','feedRetired'])assert.equal(d.counts[k],1);await loop.close();
});

test('a contended or failing feed does not starve Source indexing and discovery',async()=>{
 const s=setup();s.options.feeds={tasks:async()=>['1','2'],process:async raw=>{if(JSON.parse(raw).eventId==='1')return 'busy';throw Object.assign(Error('unavailable feed'),{code:'conflict'});}};
 const loop=create(s.options,{wait:s.pause}).start();assert.equal(await s.waiting.promise,1000);assert(s.events.includes('complete'));
 assert.equal(loop.describe().counts.feedBusy,1);assert.equal(loop.describe().counts.conflicts,1);assert.equal(loop.describe().counts.discoveries,1);await loop.close();
});

test('closing waits for physical feed SQL and dispatches no later work',async()=>{
 const s=setup(),entered=defer(),sql=defer();s.options.feeds={tasks:async()=>['1'],process:async()=>{entered.resolve();return sql.promise;}};
 const loop=create(s.options,{wait:s.pause}).start();await entered.promise;let done=false;const closing=loop.close().then(()=>{done=true;});await Promise.resolve();assert.equal(done,false);
 sql.resolve('completed');await closing;assert.deepEqual(s.events,[]);assert.equal(loop.describe().phase,'closed');
});

test('invalid feed lists dispatch no event while independent discovery can proceed',async()=>{
 for(const tasks of [Array.from({length:9},(_,i)=>String(i+1)),['1','1'],['0'],['9223372036854775808']]){
  const s=setup();s.options.feeds={tasks:async()=>tasks,process:async()=>assert.fail('invalid task dispatch')};
  const loop=create(s.options,{wait:s.pause}).start();await s.waiting.promise;assert.equal(loop.describe().counts.failures,1);assert.equal(loop.describe().counts.discoveries,1);await loop.close();
 }
});
