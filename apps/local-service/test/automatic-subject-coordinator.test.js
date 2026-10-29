import test from 'node:test';import assert from 'node:assert/strict';
import {createAutomaticSubjectCoordinatorForTest as create} from '../src/application/automatic-subject-coordinator.js';
import {createAutomaticNamedSubjectRepository} from '../portable/canonical-v4/automatic-named-subject-repository.js';
import {automaticCohortFixture as fixture} from './fixtures/automatic-subject-cohort.js';
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function setup(){
 const a=fixture(),events=[],waiting=defer();let published=null;
 const options={descriptorJson:JSON.stringify({matcherHash:a.matcherHash,representationHash:a.representationHash,inputDefinition:a.inputDefinition}),readGeneration:async()=>a.generation,
  retrieval:{indexTasks:async()=>[],index:async()=>{events.push('index');return 'indexed';},discoveryTasks:async()=>[{sourceId:a.seedSourceId,indexOrdinal:'1'}],
   neighbours:async()=>a.rows,complete:async()=>{events.push('complete');return true;}},
  subjects:createAutomaticNamedSubjectRepository({database:{async query(sql,args){
   if(sql.includes('named_candidates')){events.push('candidates');return {rows:[{result:[]}]};}
   events.push('publish');published=JSON.parse(args[0]);return {rows:[{result:{generation:published.generation,policyHash:published.policyHash,
    subjects:published.updates.map(u=>({subjectId:u.subjectId,revision:'1'})),selections:published.selections}}]};
  }}})};
 const pause=(ms,signal)=>{waiting.resolve(ms);return new Promise(resolve=>{if(signal.aborted)resolve();else signal.addEventListener('abort',resolve,{once:true});});};
 return {a,options,events,waiting,pause,published:()=>published};
}

test('bounded discovery uses the real cohort and general publisher without model, capture or canonical queue work',async()=>{
 const s=setup(),loop=create(s.options,{wait:s.pause});assert.deepEqual(s.events,[]);loop.start();assert.equal(await s.waiting.promise,100);
 assert.deepEqual(s.events,['candidates','publish','complete']);assert.equal(s.published().updates[0].label,'Kapsalon');
 assert.equal(loop.describe().counts.discoveries,1);assert.equal(loop.describe().testComposition,true);await loop.close();assert.equal(loop.describe().phase,'closed');
});
test('index tasks precede discovery and do not start another encoder or ingestion worker',async()=>{
 const s=setup();s.options.retrieval.indexTasks=async()=>[{sourceId:'source-a',queueOrdinal:'1',snapshot:null}];
 const loop=create(s.options,{wait:s.pause}).start();await s.waiting.promise;assert.equal(s.events[0],'index');assert.equal(loop.describe().counts.indexed,1);await loop.close();
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
