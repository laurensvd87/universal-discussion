import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createFixtureController,acquireNativeFixture} from './context.js';
import {createInputVersionFixtureDatabase} from '../../canonical-v4/experimental/hierarchy-native-postgres-fixture-v2/repository.js';
const NAMES=['murmingle_hierarchy_fixture_20261026_a','murmingle_hierarchy_fixture_20261026_b'];
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(options={}){
 const events=[],clients=[],owned=new WeakMap(),databases=new Map(options.existing??[]);let nextOid=100,active=true;
 function connectFixedRole(request,guard){
  guard();assert.deepEqual(Object.keys(request),['database','role','applicationName','statementTimeoutMs','lockTimeoutMs']);
  assert.ok([...NAMES,'postgres'].includes(request.database));assert.equal(request.role,'postgres');assert.equal(request.applicationName,'murmingle-native-hierarchy-sql');
  assert.equal(request.statementTimeoutMs,5000);assert.equal(request.lockTimeoutMs,3000);
  const id={database:request.database,role:'postgres',address:'127.0.0.1',port:55433,version:170011,started:12345.125,...options.registered},record={request,closed:false,ends:0};
  const raw={async query(sql,parameters=[]){
   assert.equal(record.closed,false);events.push([request.database,sql,parameters]);
   const special=options.query?.(sql,parameters,record,databases);if(special!==undefined)return special;
   if(sql.includes('current_database() AS database'))return {rows:[{...id,oid:request.database==='postgres'?'5':databases.get(request.database)?.oid,...options.identityRow}]};
   if(sql.startsWith('SELECT oid::text AS oid,')){const row=databases.get(parameters[0]);return {rows:row?[{...row}]:[]};}
   if(sql.startsWith('CREATE DATABASE ')){const name=sql.split(' ')[2];assert.equal(databases.has(name),false);databases.set(name,{oid:String(nextOid++),datname:name,owner:'postgres'});return {command:'CREATE'};}
   if(sql.startsWith('DROP DATABASE ')){const name=sql.slice(14);assert.ok(clients.filter(c=>c.request.database===name).every(c=>c.closed));databases.delete(name);return {command:'DROP'};}
   if(sql.includes('FROM pg_stat_activity'))return {rows:[{n:String(clients.filter(c=>!c.closed&&databases.get(c.request.database)?.oid===parameters[0]).length)}]};
   if(sql.includes('FROM pg_extension'))return {rows:[{extname:'vector',extversion:options.vectorVersion??'0.8.2'}]};
   return {rows:[],command:sql};
  },async end(){record.ends++;events.push([request.database,'CLOSE']);if(options.end)await options.end(record);record.closed=true;}};
  owned.set(raw,id);record.raw=raw;clients.push(record);return Promise.resolve(raw);
 }
 const controller=createFixtureController({connectFixedRole,getOwnedIdentity:client=>{const value=owned.get(client);if(!value)throw new Error('unregistered');return Object.freeze({...value});},guard:()=>{if(!active)throw Object.freeze({retired:true});}});
 return {controller,events,clients,databases,revoke:()=>{active=false;}};
}
test('noarg protected factory cannot acquire a caller DB or open a native cluster on import',async()=>{
 await assert.rejects(acquireNativeFixture(),{code:'NATIVE_NO_OWNED_SCOPE'});await assert.rejects(acquireNativeFixture({}),{code:'NATIVE_NO_OWNED_SCOPE'});
 await assert.rejects(createInputVersionFixtureDatabase());await assert.rejects(createInputVersionFixtureDatabase({query(){throw new Error('must not call');}}));
});
test('invented two sequential fresh OIDs use one admin+two original work clients and close before exact DROP',async()=>{
 const f=fixture();assert.equal(f.events.length,0);
 for(let i=0;i<2;i++){
  const db=await f.controller.acquire();assert.equal(db.dialect,'pg');assert.equal(f.clients.length,i+2);
  await db.transaction(tx=>tx.query('INVENTED'));await db.close();assert.equal(f.databases.has(NAMES[i]),false);
 }
 const out=await f.controller.finish();assert.equal(out.status,'passed');assert.equal(out.used,2);assert.equal(out.adminClosed,true);
 assert.deepEqual(out.databases.map(d=>d.oid),['100','101']);assert.ok(out.databases.every(d=>d.dropped&&d.closed&&d.pending===0));
 assert.deepEqual(f.clients.map(c=>c.ends),[1,1,1]);assert.deepEqual(f.events.filter(e=>e[1].startsWith('DROP ')).map(e=>e[1]),NAMES.map(n=>'DROP DATABASE '+n));
 assert.equal(f.events.some(e=>e[1].includes('FORCE')),false);await assert.rejects(f.controller.acquire(),{code:'NATIVE_SCOPE_RETIRED'});
 assert.deepEqual(await f.controller.finish(),out);
});
test('existing scratch names refuse without adoption, DROP or CREATE',async()=>{
 for(const name of NAMES){const f=fixture({existing:[[name,{oid:'99',datname:name,owner:'postgres'}]]});
  await assert.rejects(f.controller.acquire(),{code:'NATIVE_DATABASE_ALREADY_EXISTS'});const out=await f.controller.finish();assert.equal(out.status,'failed');
  assert.equal(f.databases.get(name).oid,'99');assert.equal(f.events.some(e=>/^(CREATE|DROP) DATABASE/u.test(e[1])),false);
 }
});
test('wrong registered server incarnation or returned OID refuses before schema/seed',async()=>{
 for(const options of [{registered:{address:'127.0.0.2'}},{registered:{version:170012}},{registered:{started:NaN}},{identityRow:{oid:'0'}},{identityRow:{database:'foreign'}}]){
  const f=fixture(options);await assert.rejects(f.controller.acquire());const out=await f.controller.finish();assert.equal(out.status,'failed');
  assert.equal(f.events.some(e=>e[1]==='CREATE EXTENSION vector'),false);
 }
});
test('replacement scratch OID is never dropped; known clients still settle',async()=>{
 const f=fixture(),db=await f.controller.acquire();f.databases.get(NAMES[0]).oid='333';
 await assert.rejects(db.close(),{code:'NATIVE_DATABASE_REPLACED'});const out=await f.controller.finish();assert.equal(out.status,'failed');
 assert.equal(f.databases.get(NAMES[0]).oid,'333');assert.equal(f.events.some(e=>e[1].startsWith('DROP DATABASE')),false);
 assert.ok(f.clients.every(c=>c.closed));
});
test('wrong vector extension fails before canonical schema and retires exact known scratch',async()=>{
 const f=fixture({vectorVersion:'0.8.1'});await assert.rejects(f.controller.acquire(),{code:'NATIVE_VECTOR_IDENTITY'});const out=await f.controller.finish();
 assert.equal(out.status,'failed');assert.equal(out.databases[0].dropped,true);assert.equal(f.events.some(e=>e[1].startsWith('CREATE SCHEMA')),false);
});
test('factory overlap, simultaneous live fixture and third acquisition refuse without more clients',async()=>{
 const d=deferred(),f=fixture({query(sql){if(sql==='CREATE EXTENSION vector')return d.promise;}}),first=f.controller.acquire();
 await new Promise(r=>setImmediate(r));await assert.rejects(f.controller.acquire(),{code:'NATIVE_FIXTURE_CAPACITY'});assert.equal(f.clients.length,2);
 d.resolve({});const a=await first;await assert.rejects(f.controller.acquire(),{code:'NATIVE_FIXTURE_CAPACITY'});await a.close();
 const b=await f.controller.acquire();await b.close();await assert.rejects(f.controller.acquire(),{code:'NATIVE_FIXTURE_CAPACITY'});assert.equal((await f.controller.finish()).status,'passed');
});
test('work close rejection blocks DROP and never replaces falsy initialization primary',async()=>{
 const cleanup=Object.freeze({end:true}),f=fixture({query(sql){if(sql==='CREATE EXTENSION vector')return Promise.reject(false);},end(record){if(record.request.database!== 'postgres')throw cleanup;}});
 let caught=false;try{await f.controller.acquire();}catch(e){caught=true;assert.equal(e,false);}assert.equal(caught,true);
 const out=await f.controller.finish();assert.equal(out.status,'failed');assert.equal(out.databases[0].dropped,false);
 assert.equal(f.events.some(e=>e[1].startsWith('DROP DATABASE')),false);assert.equal(out.adminClosed,true);
});
test('active backend prevents DROP; no termination or FORCE fallback',async()=>{
 const f=fixture({query(sql){if(sql.includes('FROM pg_stat_activity'))return {rows:[{n:'1'}]};}}),db=await f.controller.acquire();
 await assert.rejects(db.close(),{code:'NATIVE_CLIENT_UNSETTLED'});assert.equal((await f.controller.finish()).status,'failed');
 assert.equal(f.events.some(e=>e[1].startsWith('DROP DATABASE')||e[1].includes('pg_terminate_backend')),false);
});
test('scope retirement stops retained sessions before cleanup and one-use partial inventories cannot pass',async()=>{
 const f=fixture(),db=await f.controller.acquire();const out=await f.controller.finish();assert.equal(out.status,'failed');assert.equal(out.used,1);
 const n=f.events.length;await assert.rejects(db.query('LATE'));assert.equal(f.events.length,n);assert.equal(out.databases[0].dropped,true);
});
test('concurrent finish shares one physical admin close and the original settlement promise',async()=>{
 const d=deferred(),f=fixture({end(record){if(record.request.database==='postgres')return d.promise;}});
 for(let i=0;i<2;i++){const db=await f.controller.acquire();await db.close();}
 const first=f.controller.finish(),second=f.controller.finish();assert.equal(first,second);await new Promise(r=>setImmediate(r));
 assert.equal(f.clients[0].ends,1);assert.equal(f.controller.snapshot().adminClosed,false);assert.equal(f.controller.snapshot().accepting,false);
 d.resolve();assert.equal((await first).status,'passed');assert.equal(await second,await first);assert.equal(f.clients[0].ends,1);
});
test('finish during original acquisition cannot issue a fixture or pass after late CREATE settlement',async()=>{
 const d=deferred(),f=fixture({query(sql,_p,_r,dbs){if(sql.startsWith('CREATE DATABASE '))return d.promise.then(()=>{const name=sql.split(' ')[2];dbs.set(name,{oid:'100',datname:name,owner:'postgres'});return {command:'CREATE'};});}});
 const acquiring=f.controller.acquire();await new Promise(r=>setImmediate(r));const finish=f.controller.finish();
 const out=await finish;assert.equal(out.status,'failed');assert.equal(out.acquiring,true);assert.equal(out.adminClosed,false);
 assert.ok(out.failures.includes('NATIVE_ACQUISITION_UNSETTLED'));d.resolve();await assert.rejects(acquiring,{code:'NATIVE_SCOPE_RETIRED'});
 assert.equal(f.clients.length,1);assert.equal(f.databases.size,0);assert.equal((await f.controller.finish()).status,'failed');
});
test('finish with original work pending never drops or claims physical retirement',async()=>{
 const d=deferred(),f=fixture({query(sql){if(sql==='HELD')return d.promise;}}),db=await f.controller.acquire();
 const pending=db.query('HELD'),out=await f.controller.finish();assert.equal(out.status,'failed');assert.equal(out.databases[0].pending,1);
 assert.equal(out.databases[0].closed,false);assert.equal(out.databases[0].dropped,false);assert.equal(f.events.some(e=>e[1].startsWith('DROP DATABASE')),false);
 d.resolve({});await pending;assert.equal((await f.controller.finish()).status,'failed');
});
test('native assertion module retains all25 original SQL assertion bodies byte-for-byte after declared wrapper changes',async()=>{
 const oldUrl=new URL('../../canonical-v4/experimental/hierarchy-native-scoped-ingestion-v2/test.js',import.meta.url);
 const bytes=await readFile(oldUrl);assert.equal(createHash('sha256').update(bytes).digest('hex'),'e73133fc32a3cb340a2ef1184d6f5fa2214c12a4883e67b6664958c117e033c2');
 let expected=bytes.toString('utf8').replace(/\r\n/gu,'\n').replace("import test from 'node:test';\n",'');
 expected=expected.replace("const SQL_ENABLED=process.env.MURMINGLE_ADR220_SQL_FIXTURE==='root-approved-disposable-only';","const SQL_ENABLED=true; // Only the fixed owned-native proof runs this suite; no skip selector.");
 expected=expected.replace('// ADR220: real canonical SQL test SOURCE. Execution requires a separate Root\n// decision plus adequate reserves. This opt-in string IS NOT authority.','// Exact ADR220 assertion bodies, retargeted only to the protected native factory.\n// SOURCE only: import registers no tests and performs no database operation.');
 const first=expected.indexOf("\ntest('pure wire");assert.ok(first>0);
 expected=expected.slice(0,first)+"\nexport async function runAssertions(test){\n if(typeof test!=='function')throw new TypeError('Fixed assertion runner required');"+expected.slice(first).replace(/\ntest\(/gu,'\nawait test(')+'\n}\n';
 const actual=await readFile(new URL('../../canonical-v4/experimental/hierarchy-native-postgres-fixture-v2/assertions.js',import.meta.url),'utf8');assert.equal(actual,expected);
 const {CASES}=await import('./suite.js');assert.equal(CASES.length,25);const literalChildTitles=[...expected.matchAll(/await t\.test\('([^']+)'/gu)].map(x=>x[1]);
 assert.deepEqual(CASES.slice(2,22).map(x=>x.name),literalChildTitles);
});
