import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runRole } from '../src/main.js';
import { processOneJob, runWorker } from '../src/worker.js';
import { checkReady } from '../src/healthcheck.js';

const env={MURMINGLE_MODE:'synthetic-rehearsal',MURMINGLE_READ_TOKEN_FILE:'read',MURMINGLE_DATABASE_PASSWORD_FILE:'database'};
function deps(events, controller) {return {
  configOptions:{readSecret:async file=>file.padEnd(48,'x')},
  createDatabase:async()=>({close:async()=>events.push('close')}),createRepository:()=>({}),
  migrate:async()=>events.push('migrate'),seedFixture:async()=>events.push('seed'),
  createServer:()=>{events.push('server');const server=new EventEmitter();server.listen=(port,host,callback)=>{server.listening=true;events.push(`listen:${host}:${port}`);callback();controller.abort();};server.close=callback=>{events.push('shutdown');callback();};return server;},
};}
test('import does not listen; explicit roles never migrate or seed implicitly',async()=>{
  const events=[];const controller=new AbortController();
  await runRole('api',{env,dependencies:deps(events,controller),signal:controller.signal});
  assert.deepEqual(events,['server','listen:127.0.0.1:4185','shutdown','close']);
  events.length=0;
  await runRole('migrate',{env:{...env,MURMINGLE_DATABASE_USER:'murmingle_owner'},dependencies:deps(events,controller)});
  assert.deepEqual(events,['migrate','close']);
  await assert.rejects(runRole('api',{env:{...env,MURMINGLE_DATABASE_USER:'murmingle_owner'},dependencies:deps(events,controller)}),/database-role/);
  events.length=0;
  await assert.rejects(runRole('seed-fixture',{env:{...env,MURMINGLE_DATABASE_USER:'murmingle_owner'},dependencies:deps(events,controller)}),/fixture-tokens/);
  assert.deepEqual(events,['close']);
  await runRole('seed-fixture',{env:{...env,MURMINGLE_DATABASE_USER:'murmingle_owner',MURMINGLE_ALEX_TOKEN_FILE:'alex',MURMINGLE_BLAIR_TOKEN_FILE:'blair'},dependencies:deps(events,controller)});
  assert.deepEqual(events,['close','seed','close']);
});
test('worker only completes fixture bookkeeping with exact durable lease',async()=>{
  const calls=[];const repository={claimJob:async()=>({id:'job',kind:'bookkeeping',leaseToken:'lease'}),completeJob:async claim=>calls.push(claim),failJob:async claim=>calls.push({...claim,failed:true})};
  assert.equal(await processOneJob(repository,{workerId:'worker'}),true);
  assert.deepEqual(calls[0],{jobId:'job',workerId:'worker',leaseToken:'lease'});
  repository.claimJob=async()=>({id:'bad',kind:'ai',leaseToken:'lease'});
  await processOneJob(repository,{workerId:'worker'});assert.equal(calls[1].failed,true);
  repository.claimJob=async()=>null;assert.equal(await processOneJob(repository,{workerId:'worker'}),false);
});
test('worker polling has bounded backoff and aborts without network',async()=>{
  const waits=[];const controller=new AbortController();
  await runWorker({repository:{claimJob:async()=>null},signal:controller.signal,sleep:async ms=>{waits.push(ms);if(waits.length===10)controller.abort();}});
  assert.ok(waits.every(ms=>ms>=100&&ms<=5000));assert.equal(waits.length,10);
});
test('readiness probe is injectable and checks minimal loopback response',async()=>{
  let options;const request=(opts,callback)=>{options=opts;const probe=new EventEmitter();probe.end=()=>callback({statusCode:200,resume(){}});return probe;};
  assert.equal(await checkReady({request,port:4185}),true);assert.equal(options.host,'127.0.0.1');assert.equal(options.headers.host,'127.0.0.1:4185');
});
