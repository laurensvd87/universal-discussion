// Default inert. Synthetic, owned-server-only native proof; no runtime activation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {readFile,lstat,realpath,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {SETTINGS as OLD_SETTINGS,PARAMETER,FLOOR,buildFixture,adjacent,vectorText,scoreBits,mockSqlFrom007,fastValidatorSqlFrom004,fastScanSqlFrom007,VALIDATION_CASES}
 from '../../canonical-v4/experimental/ridge-validation-cost-screen-v1/run.js';

export const HERE=dirname(fileURLToPath(import.meta.url)),REPO=resolve(HERE,'../../../../..');
export const SETTINGS=Object.freeze({schema:'ridge-finite-native-proof/v1',sizes:Object.freeze([64,256,1024]),families:Object.freeze(['sparse','dense']),
 dimensions:384,repeats:3,storedSources:1024,maximumChunkRows:32,maximumChunkBytes:2097152,heapMiB:256,treeMemoryMiB:768,
 aggregateCpuSeconds:60,wallSeconds:180,cleanupReserveSeconds:30,ownedBytes:536870912,ownedEntries:8192,maximumReportBytes:65536});
export const SOURCE_KEYS=Object.freeze([
 "apps/local-service/experiments/topic-encoder/hierarchical-e5-current-producer-transfer-evaluation-v2/supervise.py",
 "apps/local-service/portable/canonical-v4/experimental/ridge-validation-cost-screen-v1/README.md",
 "apps/local-service/portable/canonical-v4/experimental/ridge-validation-cost-screen-v1/run.js",
 "apps/local-service/portable/canonical-v4/experimental/ridge-validation-cost-screen-v1/test.js",
 "apps/local-service/portable/canonical-v4/index.js",
 "apps/local-service/portable/canonical-v4/migrations/001-canonical-v4.sql",
 "apps/local-service/portable/canonical-v4/migrations/002-runtime-core.sql",
 "apps/local-service/portable/canonical-v4/migrations/003-execute-only-command-boundary.sql",
 "apps/local-service/portable/canonical-v4/migrations/004-ingestion-foundation.sql",
 "apps/local-service/portable/canonical-v4/migrations/005-ingestion-apply-and-lifecycle.sql",
 "apps/local-service/portable/canonical-v4/migrations/006-lifecycle-command-boundary.sql",
 "apps/local-service/portable/canonical-v4/migrations/007-exact-ridge-scan-single-pass.sql",
 "apps/local-service/portable/canonical-v4/migrations/008-independent-new-ingestion-admission.sql",
 "apps/local-service/portable/canonical-v4/migrations/009-fail-fast-new-ingestion-locks.sql",
 "apps/local-service/portable/integration/hierarchy-shadow-isolated-postgres.js",
 "apps/local-service/portable/integration/ridge-finite-native-v1/README.md",
 "apps/local-service/portable/integration/ridge-finite-native-v1/run.js",
 "apps/local-service/portable/integration/ridge-finite-native-v1/supervise.py",
 "apps/local-service/portable/integration/ridge-finite-native-v1/test.js",
 "apps/local-service/portable/node_modules/pg-connection-string/index.js",
 "apps/local-service/portable/node_modules/pg-connection-string/package.json",
 "apps/local-service/portable/node_modules/pg-int8/index.js",
 "apps/local-service/portable/node_modules/pg-int8/package.json",
 "apps/local-service/portable/node_modules/pg-pool/index.js",
 "apps/local-service/portable/node_modules/pg-pool/package.json",
 "apps/local-service/portable/node_modules/pg-protocol/dist/buffer-reader.js",
 "apps/local-service/portable/node_modules/pg-protocol/dist/buffer-writer.js",
 "apps/local-service/portable/node_modules/pg-protocol/dist/index.js",
 "apps/local-service/portable/node_modules/pg-protocol/dist/messages.js",
 "apps/local-service/portable/node_modules/pg-protocol/dist/parser.js",
 "apps/local-service/portable/node_modules/pg-protocol/dist/serializer.js",
 "apps/local-service/portable/node_modules/pg-protocol/package.json",
 "apps/local-service/portable/node_modules/pg-types/index.js",
 "apps/local-service/portable/node_modules/pg-types/lib/arrayParser.js",
 "apps/local-service/portable/node_modules/pg-types/lib/binaryParsers.js",
 "apps/local-service/portable/node_modules/pg-types/lib/builtins.js",
 "apps/local-service/portable/node_modules/pg-types/lib/textParsers.js",
 "apps/local-service/portable/node_modules/pg-types/package.json",
 "apps/local-service/portable/node_modules/pg-types/test/index.js",
 "apps/local-service/portable/node_modules/pg-types/test/types.js",
 "apps/local-service/portable/node_modules/pg/esm/index.mjs",
 "apps/local-service/portable/node_modules/pg/lib/client.js",
 "apps/local-service/portable/node_modules/pg/lib/connection-parameters.js",
 "apps/local-service/portable/node_modules/pg/lib/connection.js",
 "apps/local-service/portable/node_modules/pg/lib/crypto/cert-signatures.js",
 "apps/local-service/portable/node_modules/pg/lib/crypto/sasl.js",
 "apps/local-service/portable/node_modules/pg/lib/crypto/utils.js",
 "apps/local-service/portable/node_modules/pg/lib/defaults.js",
 "apps/local-service/portable/node_modules/pg/lib/index.js",
 "apps/local-service/portable/node_modules/pg/lib/native/client.js",
 "apps/local-service/portable/node_modules/pg/lib/native/index.js",
 "apps/local-service/portable/node_modules/pg/lib/native/query.js",
 "apps/local-service/portable/node_modules/pg/lib/query.js",
 "apps/local-service/portable/node_modules/pg/lib/result.js",
 "apps/local-service/portable/node_modules/pg/lib/stream.js",
 "apps/local-service/portable/node_modules/pg/lib/type-overrides.js",
 "apps/local-service/portable/node_modules/pg/lib/utils.js",
 "apps/local-service/portable/node_modules/pg/package.json",
 "apps/local-service/portable/node_modules/pgpass/lib/helper.js",
 "apps/local-service/portable/node_modules/pgpass/lib/index.js",
 "apps/local-service/portable/node_modules/pgpass/package.json",
 "apps/local-service/portable/node_modules/postgres-array/index.js",
 "apps/local-service/portable/node_modules/postgres-array/package.json",
 "apps/local-service/portable/node_modules/postgres-bytea/index.js",
 "apps/local-service/portable/node_modules/postgres-bytea/package.json",
 "apps/local-service/portable/node_modules/postgres-date/index.js",
 "apps/local-service/portable/node_modules/postgres-date/package.json",
 "apps/local-service/portable/node_modules/postgres-interval/index.js",
 "apps/local-service/portable/node_modules/postgres-interval/package.json",
 "apps/local-service/portable/node_modules/split2/bench.js",
 "apps/local-service/portable/node_modules/split2/index.js",
 "apps/local-service/portable/node_modules/split2/package.json",
 "apps/local-service/portable/node_modules/split2/test.js",
 "apps/local-service/portable/node_modules/xtend/immutable.js",
 "apps/local-service/portable/node_modules/xtend/mutable.js",
 "apps/local-service/portable/node_modules/xtend/package.json",
 "apps/local-service/portable/node_modules/xtend/test.js",
 "apps/local-service/portable/package-lock.json",
 "apps/local-service/portable/package.json",
 "apps/local-service/portable/src/database.js",
 "apps/local-service/portable/test/hierarchy-shadow-native-default.test.js",
 "apps/local-service/src/accounts/account-principal.js",
 "apps/local-service/src/adapters/normalized-sqlite-repository.js",
 "apps/local-service/src/application/account-public-chats.js",
 "apps/local-service/src/domain/adaptive-topic-integration.js",
 "apps/local-service/src/domain/adaptive-topics.js",
 "apps/local-service/src/domain/alternate-topic-cache.js",
 "apps/local-service/src/domain/alternate-topic-planner-indexed.js",
 "apps/local-service/src/domain/alternate-topic-planner.js",
 "apps/local-service/src/domain/body-topic-metric.js",
 "apps/local-service/src/domain/bounded-evidence-graph.js",
 "apps/local-service/src/domain/demo-state.js",
 "apps/local-service/src/domain/diagonal-adapter.js",
 "apps/local-service/src/domain/discussion-view.js",
 "apps/local-service/src/domain/errors.js",
 "apps/local-service/src/domain/fixed-reference-topic-integration.js",
 "apps/local-service/src/domain/guarded-body-topic-planner.js",
 "apps/local-service/src/domain/learned-sources.js",
 "apps/local-service/src/domain/owner-topic-planner.js",
 "apps/local-service/src/domain/persisted-state.js",
 "apps/local-service/src/domain/reference-state-migration.js",
 "apps/local-service/src/domain/reference-topic-membership.js",
 "apps/local-service/src/domain/repository-contract.js",
 "apps/local-service/src/domain/ridge-topic-adapter.js",
 "apps/local-service/src/domain/ridge-topic-planner.js",
 "apps/local-service/src/domain/source-threads.js",
 "apps/local-service/src/domain/state-migration.js",
 "apps/local-service/src/domain/topic-radius-index.js",
 "apps/local-service/src/domain/validation.js",
 "decisions/ADR-146-exact-ridge-validation-performance.md",
 "spikes/topic-resolution/browser/core/page-content-policy.js",
 "spikes/topic-resolution/browser/embedding/embedding-contract.js"
]);
export const BINARY_PINS=Object.freeze({
 'D:/PostgreSQL/17/bin/postgres.exe':'f5dbfd059f8088b9511a02fc014e659369996fc7d3e88e47658b1cfa2fbb02d2',
 'D:/PostgreSQL/17/bin/initdb.exe':'d385519a50d2cd5e143e86c2c10acfe0d44d3039d714c8211b804011bca2409f',
 'D:/PostgreSQL/17/bin/pg_ctl.exe':'9885ac53af9d67c76c1ddde87c19e6b15539d7c482bca70cd5ead5dad0b7ce3c',
 'D:/PostgreSQL/17/lib/vector.dll':'459a1abcabd69c8092c3a7de998a18e2714b6676a7ba4f3bdd111fc610a440a0',
 'D:/PostgreSQL/17/share/extension/vector.control':'52c583fb0c22c616b21762c7b9d3079c02655b78b96d5689cd1e64449b9a575e',
 'D:/PostgreSQL/17/share/extension/vector--0.8.2.sql':'1e4d2de57f0a16c5c2b259d77655aecf9c740713beae4ac4b511549fceb6aafb',
});
export const MIGRATIONS=Object.freeze(['001-canonical-v4.sql','002-runtime-core.sql','003-execute-only-command-boundary.sql','004-ingestion-foundation.sql',
 '005-ingestion-apply-and-lifecycle.sql','006-lifecycle-command-boundary.sql','007-exact-ridge-scan-single-pass.sql','008-independent-new-ingestion-admission.sql','009-fail-fast-new-ingestion-locks.sql']);
const PREFIX='apps/local-service/portable/canonical-v4/migrations/',sha=b=>createHash('sha256').update(b).digest('hex'),digest=v=>sha(JSON.stringify(v));
export function phaseFor(args){
 if(!Array.isArray(args)||types.isProxy(args)||Object.getPrototypeOf(args)!==Array.prototype||Reflect.ownKeys(args).length!==args.length+1)throw Error('invalid-phase');
 if(!args.length)return null;const d=Object.getOwnPropertyDescriptor(args,'0');if(args.length===1&&d?.enumerable&&Object.hasOwn(d,'value')&&d.value==='--run-isolated-server')return 'native';throw Error('invalid-phase');
}
async function fixedBytes(file,maximum=4194304){
 const s=await lstat(file);assert.ok(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=maximum);assert.equal((await realpath(file)).toLowerCase(),resolve(file).toLowerCase());
 const b=await readFile(file),after=await lstat(file);assert.equal(b.length,s.size);assert.equal(after.size,s.size);assert.equal(after.mtimeMs,s.mtimeMs);assert.equal(after.ctimeMs,s.ctimeMs);return b;
}
export function validateFreeze(value,sources){
 assert.ok(value&&typeof value==='object'&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype);
 for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);assert.ok(typeof key==='string'&&d.enumerable&&Object.hasOwn(d,'value'));}
 assert.deepEqual(Object.keys(value),['schema','sourceHashes','binaryHashes','settings','freezeHash']);const {freezeHash,...body}=value;
 assert.equal(value.schema,'ridge-finite-native-source-freeze/v1');assert.deepEqual(value.sourceHashes,sources);assert.deepEqual(value.binaryHashes,BINARY_PINS);
 assert.deepEqual(value.settings,SETTINGS);assert.equal(digest(body),freezeHash);return value;
}
async function sourceContext(){
 const buffers=new Map(),sourceHashes={};for(const key of SOURCE_KEYS){const b=await fixedBytes(resolve(REPO,key));buffers.set(key,b);sourceHashes[key]=sha(b);}
 for(const [file,pin]of Object.entries(BINARY_PINS))assert.equal(sha(await fixedBytes(file,16*1024*1024)),pin);
 const freezeBytes=await fixedBytes(join(HERE,'freeze.json'),65536),freeze=validateFreeze(JSON.parse(freezeBytes),sourceHashes);
 assert.equal(process.env.MURMINGLE_RIDGE_NATIVE_FREEZE_SHA256,sha(freezeBytes));
 return {buffers,sourceHashes,freeze,freezeFileSha256:sha(freezeBytes),async recheck(){
  assert.equal(sha(await fixedBytes(join(HERE,'freeze.json'),65536)),sha(freezeBytes));
  for(const [key,b]of buffers)assert.equal(sha(await fixedBytes(resolve(REPO,key))),sha(b));
  for(const [file,pin]of Object.entries(BINARY_PINS))assert.equal(sha(await fixedBytes(file,16*1024*1024)),pin);
 }};
}
async function handshake(){
 assert.equal(process.platform,'win32');assert.ok(process.execArgv.includes('--max-old-space-size=256'));
 assert.equal(process.env.MURMINGLE_RIDGE_NATIVE_SUPERVISED,'v1');
 await new Promise((yes,no)=>{let text='',done=false;const timer=setTimeout(()=>finish(Error('job-handshake-timeout')),5000);
  const finish=e=>{if(done)return;done=true;clearTimeout(timer);process.stdin.off('data',data);process.stdin.off('end',end);process.stdin.pause();e?no(e):yes();};
  const data=b=>{text+=b.toString('ascii');if(text==='RIDGE_NATIVE_OWN_JOB_ASSIGNED_V1\n')finish();else if(text.length>=33)finish(Error('job-handshake-invalid'));};
  const end=()=>finish(Error('job-handshake-missing'));process.stdin.on('data',data);process.stdin.on('end',end);process.stdin.resume();});
}
export function denseVector(c,seed=0){
 assert.ok(Number.isFinite(c)&&Math.abs(c)<=1&&Number.isSafeInteger(seed)&&seed>=0&&seed<1024);
 const tail=Array.from({length:382},(_,i)=>((i+seed)%2?-1:1)*(1+((i*17+seed)%29)/29));
 const scale=Math.max(...tail.map(Math.abs)),scaled=tail.map(v=>v/scale),norm=Math.hypot(...scaled),radius=Math.sqrt(1-c*c);
 const values=[c,scaled[0]/norm*radius,-0,...scaled.slice(1).map(v=>v/norm*radius)];
 let sum=0;for(const v of values){assert.ok(Number.isFinite(v));sum+=v*v;}assert.ok(Math.abs(Math.sqrt(sum)-1)<=.000001);return values;
}
const refJson=(sourceId,values)=>'{"sourceId":'+JSON.stringify(sourceId)+',"values":['+values.map(n=>Object.is(n,-0)?'-0':String(n)).join(',')+'],"parameterSha256":'+JSON.stringify(PARAMETER)+'}';
export function familyChunk(baseRows,family,activeCount,start){
 assert.ok(SETTINGS.families.includes(family)&&SETTINGS.sizes.includes(activeCount)&&Number.isInteger(start)&&start>=0&&start<1024&&start%32===0);
 assert.equal(baseRows.length,1024);const rows=baseRows.slice(start,start+32).map((r,j)=>{
  const i=start+j,active=i<activeCount,old=JSON.parse(r.referencePayload),values=family==='dense'?denseVector(old.values[0],i):old.values;
  const referencePayload=active?refJson(r.sourceId,values):'null',topic=JSON.parse(r.topicPayload);topic.reference=null;
  return {topicId:r.topicId,sourceId:active?r.sourceId:null,parameter:active?PARAMETER:null,valuesText:active?vectorText(values):null,referencePayload,
   topicPayload:JSON.stringify(topic).replace('"reference":null','"reference":'+referencePayload)};
 });
 assert.equal(rows.length,32);assert.ok(Buffer.byteLength(JSON.stringify(rows))<=SETTINGS.maximumChunkBytes);return rows;
}
export function allScoreSql(original,fast=false){
 mockSqlFrom007(original);const name=fast?'fast_trace':'original_trace';
 const sql=original.replaceAll('canonical_v4.ingest_ridge_scan(',`ridge_cost_screen.${name}(`);
 const threshold='IF dot_value >= 0.8639003810829322::double precision THEN';assert.equal(sql.split(threshold).length,2);
 return (fast?sql.replaceAll('canonical_v4.ingest_valid_unit_vector(','ridge_cost_screen.fast_valid_unit_vector('):sql).replace(threshold,'IF true THEN');
}
const seedType='"topicId" text,"sourceId" text,"discussionId" text,ordinal integer,"topicPayload" text,"sourcePayload" text,"discussionPayload" text,"linkPayload" text,"referencePayload" text,"valuesText" text,url text,title text,"embeddingPayload" text,"operationId" text,"operationDigest" text';
const seedFrom=s=>`WITH r AS MATERIALIZED(SELECT * FROM json_to_recordset($1::json) AS x(${seedType})) ${s}`;
async function seedChunk(db,rows){
 assert.ok(rows.length<=32);const input=JSON.stringify(rows);assert.ok(Buffer.byteLength(input)<=2097152);
 await db.transaction(async tx=>{
  const statements=[
   `INSERT INTO canonical_v4.id_registry(id,kind) SELECT "topicId",'topics' FROM r UNION ALL SELECT "sourceId",'sources' FROM r UNION ALL SELECT "discussionId",'discussions' FROM r`,
   `INSERT INTO canonical_v4.topics(id,ordinal,payload,kind,title,created_at,provenance,retain_tight) SELECT "topicId",ordinal,"topicPayload",'general',title,'2026-10-20T00:00:00.000Z','owner-local-learned-topic/v1',false FROM r`,
   `INSERT INTO canonical_v4.discussions(id,topic_id,ordinal,payload) SELECT "discussionId","topicId",ordinal,"discussionPayload" FROM r`,
   `INSERT INTO canonical_v4.sources(id,ordinal,payload,url,title,provenance,extractor_version,policy_version,operation_id,has_embedding) SELECT "sourceId",ordinal,"sourcePayload",url,title,'owner-local-page-embedding/v1','main-text-prefix/v1','ridge1-fixed-reference-radius/v1',"operationId",true FROM r`,
   `INSERT INTO canonical_v4.embeddings(source_id,payload,model_id,dimensions,values_double,vector_mirror) SELECT "sourceId","embeddingPayload",'e5-small-q8-browser-main-prefix-v1',384,ARRAY[1::double precision]||array_fill(0::double precision,ARRAY[383]),NULL FROM r`,
   `INSERT INTO canonical_v4.source_links(source_id,topic_id,ordinal,payload,method) SELECT "sourceId","topicId",ordinal,"linkPayload",'learned-provisional' FROM r`,
   `INSERT INTO canonical_v4.topic_memberships(source_id,topic_id,ordinal) SELECT "sourceId","topicId",0 FROM r`,
   `INSERT INTO canonical_v4.fixed_references(topic_id,payload,source_id,parameter_sha256,values_double,vector_mirror) SELECT "topicId","referencePayload","sourceId",'${PARAMETER}',"valuesText"::double precision[],NULL FROM r`,
   `INSERT INTO canonical_v4.operation_receipts(source_id,operation_id,operation_digest) SELECT "sourceId","operationId","operationDigest" FROM r`,
  ];for(const sql of statements)await tx.query(seedFrom(sql),[input]);
 });
}
async function applyFamily(db,base,family,count){
 await db.transaction(async tx=>{for(let start=0;start<1024;start+=32){const input=JSON.stringify(familyChunk(base,family,count,start));
  const cte=`WITH r AS(SELECT * FROM json_to_recordset($1::json) AS x("topicId" text,"sourceId" text,parameter text,"valuesText" text,"referencePayload" text,"topicPayload" text)) `;
  await tx.query(cte+`UPDATE canonical_v4.fixed_references f SET source_id=r."sourceId",parameter_sha256=r.parameter,values_double=r."valuesText"::double precision[],payload=r."referencePayload" FROM r WHERE f.topic_id=r."topicId"`,[input]);
  await tx.query(cte+`UPDATE canonical_v4.topics t SET payload=r."topicPayload" FROM r WHERE t.id=r."topicId"`,[input]);
 }});
}
const compare=(a,b)=>assert.deepEqual(a,b),median=a=>[...a].sort((x,y)=>x-y)[1];
async function nativeChecks(db,context){
 let stage='scratch-identity';const metadata={schema:'ridge-finite-native-measurements/v1',settings:SETTINGS,activation:false};
 try{
  const identity=(await db.query(`SELECT current_database() AS name,current_user AS role,
   EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema NOT IN('pg_catalog','information_schema')) AS occupied`)).rows[0];
  assert.deepEqual(identity,{name:'murmingle_v4_native_test',role:'postgres',occupied:false});stage='apply-captured-migrations';
  await db.exec("CREATE EXTENSION vector VERSION '0.8.2'; CREATE SCHEMA canonical_v4; CREATE TABLE canonical_v4.schema_migrations(version integer PRIMARY KEY,hash text NOT NULL)");
  await db.transaction(async tx=>{for(let i=0;i<9;i++){const bytes=context.buffers.get(PREFIX+MIGRATIONS[i]);await tx.exec(bytes.toString('utf8'));
   await tx.query('INSERT INTO canonical_v4.schema_migrations VALUES($1,$2)',[i+1,sha(bytes)]);}});
  await db.query("INSERT INTO canonical_v4.runtime_state(singleton,generation,revision) VALUES(true,'synthetic-ridge-cost-screen',0)");
  const original=context.buffers.get(PREFIX+MIGRATIONS[6]).toString('utf8'),validator=fastValidatorSqlFrom004(context.buffers.get(PREFIX+MIGRATIONS[3]).toString('utf8'));
  stage='install-experimental-clones';await db.exec('CREATE SCHEMA ridge_cost_screen');await db.exec(validator);await db.exec(fastScanSqlFrom007(original));
  await db.exec(allScoreSql(original));await db.exec(allScoreSql(original,true));
  metadata.cloneHashes={validator:sha(validator),fastScan:sha(fastScanSqlFrom007(original)),originalTrace:sha(allScoreSql(original)),fastTrace:sha(allScoreSql(original,true))};
  metadata.validationDifferentials=[];stage='validator-error-differentials';
  for(const item of VALIDATION_CASES){const validators=[],scans=[];
   for(const name of ['canonical_v4.ingest_valid_unit_vector','ridge_cost_screen.fast_valid_unit_vector']){
    try{const {rows}=await db.query(`SELECT ${name}(${item.expression}) AS valid`);validators.push({valid:rows[0].valid,sqlstate:null});}
    catch(e){assert.match(e.code??'',/^[A-Z0-9]{5}$/u);validators.push({valid:null,sqlstate:e.code});}}
   for(const name of ['canonical_v4.ingest_ridge_scan','ridge_cost_screen.fast_scan']){
    try{const {rows}=await db.query(`SELECT count(*)::integer AS n FROM ${name}((${item.expression}),$1)`,[PARAMETER]);scans.push({matches:rows[0].n,sqlstate:null});}
    catch(e){assert.match(e.code??'',/^[A-Z0-9]{5}$/u);scans.push({matches:null,sqlstate:e.code});}}
   compare(validators[0],validators[1]);compare(scans[0],scans[1]);metadata.validationDifferentials.push({case:item.label,validator:validators[0],scan:scans[0],equal:true});
  }
  stage='bounded-synthetic-seeding';const base=buildFixture(1024).rows;for(let start=0;start<1024;start+=32)await seedChunk(db,base.slice(start,start+32));
  assert.equal((await db.query('SELECT count(canonical_v4.ingest_source_response(id))::integer AS n FROM canonical_v4.sources')).rows[0].n,1024);
  const candidates={threshold:[1,0,-0,...Array(381).fill(0)],dense:denseVector(.5,7)};metadata.measurements=[];
  for(const candidate of Object.values(candidates))assert.equal((await db.query("SELECT encode(float8send(($1::double precision[])[3]),'hex') AS bits",[vectorText(candidate)])).rows[0].bits,'8000000000000000');
  metadata.signedZeroCandidateTransportChecked=true;
  const query=async(name,candidate)=>{const started=performance.now(),{rows}=await db.query(`SELECT topic_id,encode(float8send(similarity),'hex') AS similarity_bits FROM ${name}($1::double precision[],$2) ORDER BY topic_id COLLATE "C"`,[vectorText(candidate),PARAMETER]);return {rows,ms:performance.now()-started};};
  for(const family of SETTINGS.families)for(const count of SETTINGS.sizes){stage='view-'+family+'-'+count;await applyFamily(db,base,family,count);
   const audit=(await db.query(`SELECT count(*)::integer AS n,bool_and(canonical_v4.ingest_valid_unit_vector(values_double)) AS valid,
    bool_and(encode(float8send(values_double[3]),'hex')='8000000000000000') AS signed_zero FROM canonical_v4.fixed_references WHERE source_id IS NOT NULL`)).rows[0];
   compare(audit,{n:count,valid:true,signed_zero:true});
   for(const [candidateKind,candidate]of Object.entries(candidates)){stage='measure-'+family+'-'+count+'-'+candidateKind;const samples={original:[],fast:[]};let expected=null;
    for(let repeat=0;repeat<3;repeat++)for(const variant of repeat%2?['fast','original']:['original','fast']){
     const measured=await query(variant==='original'?'canonical_v4.ingest_ridge_scan':'ridge_cost_screen.fast_scan',candidate);
     if(expected===null)expected=measured.rows;else compare(measured.rows,expected);samples[variant].push(measured.ms);}
    const originalTrace=await query('ridge_cost_screen.original_trace',candidate),fastTrace=await query('ridge_cost_screen.fast_trace',candidate);compare(originalTrace.rows,fastTrace.rows);assert.equal(originalTrace.rows.length,count);
    if(candidateKind==='threshold'){assert.equal(expected.length,count/2);assert.ok(!expected.some(x=>x.topic_id==='topic-cost-0000'));
     assert.equal(expected.find(x=>x.topic_id==='topic-cost-0001').similarity_bits,scoreBits(FLOOR));}
    metadata.measurements.push({family,candidateKind,storedSources:1024,activeReferences:count,repeatsPerVariant:3,orderedMatchBitsEqual:true,
     allScoreBitsEqual:true,matches:expected.length,matchHash:digest(expected),allScoreHash:digest(originalTrace.rows),samplesMs:samples,
     medianMs:{original:median(samples.original),fast:median(samples.fast)},medianOriginalOverFast:median(samples.original)/median(samples.fast)});
   }
  }
  stage='corruption-equivalence';metadata.corruption=[];
  for(const name of ['canonical_v4.ingest_ridge_scan','ridge_cost_screen.fast_scan']){
   await db.transaction(async tx=>{await tx.query("UPDATE canonical_v4.fixed_references SET parameter_sha256=$1 WHERE topic_id='topic-cost-1023'",['0'.repeat(64)]);
    let code=null;try{await tx.query(`SELECT * FROM ${name}($1::double precision[],$2)`,[vectorText(candidates.threshold),PARAMETER]);}catch(e){code=e.code;}
    assert.equal(code,'P1204');metadata.corruption.push({variant:name.startsWith('canonical')?'original':'fast',sqlstate:code});
    // A rejected statement aborts this transaction; rollback is deliberate.
    throw Object.assign(Error('synthetic-corruption-rollback'),{code:'SYNTHETIC_ROLLBACK'});
   }).catch(e=>{if(e.code!=='SYNTHETIC_ROLLBACK')throw e;});
  }
  await context.recheck();metadata.sourceHashesRechecked=true;metadata.productionValidated=false;metadata.certificateImplemented=false;return metadata;
 }catch(e){throw Object.assign(Error('Synthetic native proof failed'),{code:'NATIVE_PROOF_FAILED',safeStage:stage,sqlstate:/^[A-Z0-9]{5}$/u.test(e.code??'')?e.code:null});}
}
export async function run(args){
 if(phaseFor(args)===null)return {schema:SETTINGS.schema,status:'inert',databaseAccess:false};
 await handshake();const context=await sourceContext();
 // Deliberate dynamic import only AFTER assignment and complete source/binary pins.
 const {runWithIsolatedHierarchyShadowPostgres}=await import('../hierarchy-shadow-isolated-postgres.js');
 let proofFailure=null;
 const report=await runWithIsolatedHierarchyShadowPostgres(db=>nativeChecks(db,context).catch(e=>{proofFailure={stage:e.safeStage??'unknown',sqlstate:e.sqlstate??null};throw e;}));
 await context.recheck();const result={schema:SETTINGS.schema,status:report.status,freezeHash:context.freeze.freezeHash,freezeFileSha256:context.freezeFileSha256,
  sourceHashes:context.sourceHashes,binaryHashes:BINARY_PINS,lifecycle:report,proofFailure,experimental:true,activation:false,productionValidated:false};
 assert.ok(Buffer.byteLength(JSON.stringify(result))<=65536);await writeFile(join(HERE,'output','result.json'),JSON.stringify(result),{flag:'wx'});return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const result=await run(process.argv.slice(2));console.log(JSON.stringify(result));if(!['inert','passed'].includes(result.status))process.exitCode=1;}
 catch{console.log(JSON.stringify({schema:SETTINGS.schema,status:'refused-or-failed',activation:false}));process.exitCode=1;}
}
