import test from 'node:test';
import assert from 'node:assert/strict';
import {establishFixedClient,FIXED_CLIENT_LIMITS} from './client.js';

// Invented synchronous promise clients only; no pg, filesystem or network import.
const request=(database='murmingle_hierarchy_fixture_20261026_a',role='murmingle_app')=>({database,role,applicationName:'murmingle-native-hierarchy-test',statementTimeoutMs:5000,lockTimeoutMs:3000});
function fixture(options={}){
 const events=[],timers=new Map();let next=0,settings;
 const client={connect(){events.push('connect');return options.connect?.();},query(sql){events.push(sql);return options.query?.();},end(){events.push('end');return options.end?.();}};
 const deps={createClient(config){events.push('create');settings=config;return client;},passwordProvider(role){events.push('password-'+role);return ()=> 'invented-not-a-real-credential';},beforeDispatch(){events.push('guard');options.guard?.();},
 timers:{setTimeout(fn,ms){const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}}};
 return {events,timers,client,deps,get settings(){return settings;}};
}
test('fixed client handoff uses isolated identity and exact guarded session setup',async()=>{
 for(const db of ['murmingle_hierarchy_fixture_20261026_a','murmingle_hierarchy_fixture_20261026_b','postgres']){
  const f=fixture();assert.equal(await establishFixedClient(request(db,db==='postgres'?'postgres':'murmingle_app'),f.deps),f.client);
  assert.equal(f.settings.host,'127.0.0.1');assert.equal(f.settings.port,55433);assert.equal(f.settings.database,db);assert.equal(f.settings.ssl,false);
  assert.equal(f.settings.connectionTimeoutMillis,5000);assert.equal(f.settings.options,'-c statement_timeout=5000 -c lock_timeout=3000');
  assert.ok(f.events.includes('SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL READ COMMITTED'));
  assert.equal(f.events.includes('end'),false);assert.equal(f.timers.size,0);assert.ok(Object.isFrozen(FIXED_CLIENT_LIMITS));
 }
});
test('closed request allowlist refuses selectors and dangerous objects without accessors',async()=>{
 let reads=0;const getter=request();Object.defineProperty(getter,'role',{enumerable:true,get(){reads++;return 'postgres';}});
 for(const r of [null,{},new Proxy(request(),{}),getter,{...request(),database:'postgres'},{...request(),database:'live'},{...request(),port:55432},{...request(),applicationName:'foreign'},{...request(),statementTimeoutMs:1},{...request(),lockTimeoutMs:1}]){
  const f=fixture();await assert.rejects(establishFixedClient(r,f.deps),{code:'FIXED_CLIENT_REQUEST'});assert.equal(f.events.length,0);
 }assert.equal(reads,0);
});
test('guard failure before creation creates no client or credential disclosure',async()=>{
 const f=fixture({guard(){throw false;}});await assert.rejects(establishFixedClient(request(),f.deps),{code:'FIXED_CLIENT_ESTABLISH',cleanup:'not-created'});
 assert.deepEqual(f.events,['guard']);
});
test('falsy and nominal connect failures close exact owned client and never return it',async()=>{
 for(const value of [undefined,null,false,0,-0,NaN,'',new Error('private')]){
  const f=fixture({connect(){return Promise.reject(value);}});
  await assert.rejects(establishFixedClient(request(),f.deps),{code:'FIXED_CLIENT_ESTABLISH',cleanup:'closed'});assert.equal(f.events.filter(x=>x==='end').length,1);
  assert.equal(f.events.some(x=>x.startsWith('SET')),false);assert.equal(f.timers.size,0);
 }
});
test('setup failure remains failure after physical close and does not expose provider errors',async()=>{
 const f=fixture({query(){throw new Error('private-error');}});
 await assert.rejects(establishFixedClient(request(),f.deps),error=>error.code==='FIXED_CLIENT_ESTABLISH'&&!String(error).includes('private-error'));
 assert.equal(f.events.filter(x=>x==='end').length,1);
});
test('unsettled initial connect timeout cannot hand off late and close remains bounded',async()=>{
 let resolve;const held=new Promise(yes=>resolve=yes),f=fixture({connect(){return held;}});
 const p=establishFixedClient(request(),f.deps);for(let i=0;i<10;i++)await Promise.resolve();
 assert.equal(f.timers.size,1);[...f.timers.values()][0].fn();
 await assert.rejects(p,{code:'FIXED_CLIENT_ESTABLISH',cleanup:'closed'});resolve();for(let i=0;i<10;i++)await Promise.resolve();
 assert.equal(f.events.some(x=>x.startsWith('SET')),false);assert.equal(f.events.filter(x=>x==='end').length,1);
});
test('failed or timed-out original close cannot be labelled closed',async()=>{
 const failed=fixture({connect(){throw false;},end(){throw false;}});
 await assert.rejects(establishFixedClient(request(),failed.deps),{code:'FIXED_CLIENT_CLOSE',cleanup:'unsettled-or-failed'});
 const held=fixture({connect(){throw false;},end(){return new Promise(()=>{});}}),p=establishFixedClient(request(),held.deps);
 for(let i=0;i<20;i++)await Promise.resolve();const close=[...held.timers.values()].find(t=>t.ms===15000);assert.ok(close);close.fn();
 await assert.rejects(p,{code:'FIXED_CLIENT_CLOSE',cleanup:'unsettled-or-failed'});
});
test('invalid factory return with owned close is closed; missing close refuses',async()=>{
 const f=fixture();f.deps.createClient=()=>({end:f.client.end});await assert.rejects(establishFixedClient(request(),f.deps),{code:'FIXED_CLIENT_ESTABLISH',cleanup:'closed'});
 const g=fixture();g.deps.createClient=()=>({connect(){},query(){}});await assert.rejects(establishFixedClient(request(),g.deps),{code:'FIXED_CLIENT_CLOSE',cleanup:'unavailable'});
});

