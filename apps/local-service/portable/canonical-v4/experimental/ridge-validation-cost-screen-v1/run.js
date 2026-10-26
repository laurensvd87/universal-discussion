// Synthetic in-memory screen ONLY. Defaults do not instantiate a database.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {assertValidPersistedState} from '../../../../src/domain/persisted-state.js';
import {operationDigestFor} from '../../../../src/domain/source-threads.js';

export const SETTINGS=Object.freeze({schema:'ridge-validation-cost-screen/v1',sizes:Object.freeze([64,256,1024]),repeats:3,dimensions:384,
 maxReferences:1024,cpuLimitMs:30000,wallLimitMs:60000,heapMiB:256,maximumReportBytes:16384});
export const PARAMETER='593a52ba9a5495a49ef00f4dae38770684389632f961b60ec07067fd8784b3e4';
export const FLOOR=0.8639003810829322;
const hash=v=>createHash('sha256').update(v).digest('hex'),stamp='2026-10-20T00:00:00.000Z';
const bad=()=>{throw new TypeError('Invalid fixed synthetic cost-screen input');};
export function phaseFor(args){
 if(!Array.isArray(args)||types.isProxy(args)||Object.getPrototypeOf(args)!==Array.prototype||Reflect.ownKeys(args).length!==args.length+1)bad();
 if(args.length===0)return null;
 const d=Object.getOwnPropertyDescriptor(args,'0');if(args.length===1&&d?.enumerable&&Object.hasOwn(d,'value')&&d.value==='--run-isolated')return 'run-isolated';bad();
}
export function adjacent(value,direction){
 assert.ok(Number.isFinite(value)&&value>0&&(direction===1||direction===-1));
 const b=new ArrayBuffer(8),v=new DataView(b);v.setFloat64(0,value);v.setBigUint64(0,v.getBigUint64(0)+BigInt(direction));return v.getFloat64(0);
}
export const numberText=n=>Object.is(n,-0)?'-0':String(n);
export function vectorText(values){assert.equal(values.length,384);assert.ok(values.every(Number.isFinite));return '{'+values.map(numberText).join(',')+'}';}
export function scoreBits(n){const b=Buffer.alloc(8);b.writeDoubleBE(n);return b.toString('hex');}
function referencePayload(reference){return '{"sourceId":'+JSON.stringify(reference.sourceId)+',"values":['+reference.values.map(numberText).join(',')+'],"parameterSha256":'+JSON.stringify(PARAMETER)+'}';}
export function buildFixture(count){
 assert.ok(SETTINGS.sizes.includes(count));
 const state={schema:'demo-state/v4',generation:'synthetic-ridge-cost-screen',revision:0,topics:[],discussions:[],contributions:[],sources:[],sourceLinks:[]},rows=[];
 const cosines=[adjacent(FLOOR,-1),FLOOR,adjacent(FLOOR,1),1,1,-1,0,.5];
 for(let i=0;i<count;i++){
  const suffix=String(i).padStart(4,'0'),topicId='topic-cost-'+suffix,sourceId='source-cost-'+suffix,discussionId='discussion-cost-'+suffix;
  const c=cosines[i%cosines.length],values=[c,Math.sqrt(1-c*c),-0,...Array(381).fill(0)];
  const reference={sourceId,values,parameterSha256:PARAMETER},topic={id:topicId,kind:'general',title:'Synthetic '+suffix,createdAt:stamp,
   provenance:'owner-local-learned-topic/v1',retainTight:false,reference};
  const source={id:sourceId,url:'https://example.org/synthetic-ridge-cost/'+suffix,title:'Synthetic '+suffix,
   embedding:{modelId:'e5-small-q8-browser-main-prefix-v1',values:[1,...Array(383).fill(0)]},provenance:'owner-local-page-embedding/v1',
   extractorVersion:'main-text-prefix/v1',operationId:'operation-cost-'+suffix,operationDigest:'',policyVersion:'ridge1-fixed-reference-radius/v1',topicIds:[topicId]};
  source.operationDigest=operationDigestFor(source);
  const link={sourceId,topicId,method:'learned-provisional'},refPayload=referencePayload(reference),discussion={id:discussionId,topicId};
  state.topics.push(topic);state.sources.push(source);state.discussions.push(discussion);state.sourceLinks.push(link);
  rows.push({topicId,sourceId,discussionId,ordinal:i,topicPayload:JSON.stringify({...topic,reference:null}).replace('"reference":null','"reference":'+refPayload),
   sourcePayload:JSON.stringify(source),discussionPayload:JSON.stringify(discussion),linkPayload:JSON.stringify(link),referencePayload:refPayload,
   valuesText:vectorText(values),url:source.url,title:source.title,embeddingPayload:JSON.stringify(source.embedding),operationId:source.operationId,operationDigest:source.operationDigest});
 }
 assertValidPersistedState(state,{largeScale:true});
 return {state,rows,candidate:[1,0,-0,...Array(381).fill(0)]};
}
export function expectedMatches(fixture){
 const result=[];for(const topic of fixture.state.topics){let dot=0;for(let i=0;i<384;i++)dot+=fixture.candidate[i]*topic.reference.values[i];
  dot=Math.max(-1,Math.min(1,dot));if(dot>=FLOOR)result.push({topic_id:topic.id,similarity_bits:scoreBits(dot)});}
 return result.sort((a,b)=>a.topic_id<b.topic_id?-1:1);
}
// Exact mechanical adaptation of reviewed007; any source-shape drift refuses.
export function mockSqlFrom007(original){
 assert.equal(typeof original,'string');assert.ok(original.length>0&&original.length<16384);
 const validation=`    IF stored.parameter_sha256 IS DISTINCT FROM p_parameter_sha256\n        OR NOT canonical_v4.ingest_valid_unit_vector(reference_values) THEN\n      RAISE EXCEPTION 'Invalid stored Ridge reference' USING ERRCODE = 'P1204';\n    END IF;\n`;
 const sql=original.replaceAll('\r\n','\n');assert.equal(sql.split(validation).length,2);
 assert.equal(sql.split('canonical_v4.fixed_references AS reference').length,2);
 assert.equal(sql.split('canonical_v4.ingest_ridge_scan(').length,3);
 return sql.replace(validation,'').replaceAll('canonical_v4.ingest_ridge_scan(','ridge_cost_screen.mock_scan(')
  .replace('canonical_v4.fixed_references AS reference','ridge_cost_screen.mock_projection AS reference');
}
function summarize(samples){const sorted=[...samples].sort((a,b)=>a-b);return {samplesMs:samples,medianMs:sorted[1],minimumMs:sorted[0],maximumMs:sorted[2]};}
export function fastValidatorSqlFrom004(original){
 assert.equal(typeof original,'string');assert.ok(original.length>0&&original.length<131072);
 const sql=original.replaceAll('\r\n','\n'),start=sql.indexOf('CREATE FUNCTION canonical_v4.ingest_valid_unit_vector('),
  end=sql.indexOf('$ingest_valid_unit_vector$;',start);assert.ok(start>=0&&end>start);
 const body=sql.slice(start,end+'$ingest_valid_unit_vector$;'.length);
 const coordinate="    rendered := coordinate::text;\n    IF coordinate IS NULL OR rendered IN ('NaN','Infinity','-Infinity') THEN";
 const norm="    IF norm_squared::text IN ('NaN','Infinity','-Infinity') THEN";
 assert.equal(body.split(coordinate).length,2);assert.equal(body.split(norm).length,2);
 return body.replace('canonical_v4.ingest_valid_unit_vector(','ridge_cost_screen.fast_valid_unit_vector(')
  .replace(coordinate,"    IF coordinate IS NULL OR NOT (coordinate > '-Infinity'::double precision AND coordinate < 'Infinity'::double precision) THEN")
  .replace(norm,"    IF NOT (norm_squared > '-Infinity'::double precision AND norm_squared < 'Infinity'::double precision) THEN")+
  '\nREVOKE ALL ON FUNCTION ridge_cost_screen.fast_valid_unit_vector(double precision[]) FROM PUBLIC;';
}
export function fastScanSqlFrom007(original){
 // Reuse the mechanically checked shape but KEEP the stored-reference guard.
 mockSqlFrom007(original);
 return original.replaceAll('canonical_v4.ingest_ridge_scan(','ridge_cost_screen.fast_scan(')
  .replaceAll('canonical_v4.ingest_valid_unit_vector(','ridge_cost_screen.fast_valid_unit_vector(');
}
function scalarArray(first,second='0'){return `ARRAY[${first}::double precision,${second}::double precision]||array_fill(0::double precision,ARRAY[382])`;}
export const VALIDATION_CASES=Object.freeze([
 {label:'unit',expression:scalarArray('1')},{label:'negative-unit',expression:scalarArray('-1')},
 {label:'signed-zero',expression:scalarArray('1',"'-0'")},{label:'zero',expression:scalarArray('0')},
 {label:'nan',expression:scalarArray("'NaN'")},{label:'positive-infinity',expression:scalarArray("'Infinity'")},
 {label:'negative-infinity',expression:scalarArray("'-Infinity'")},{label:'null-array',expression:'NULL::double precision[]'},
 {label:'null-coordinate',expression:scalarArray('NULL')},{label:'empty',expression:'ARRAY[]::double precision[]'},
 {label:'wrong-length',expression:'ARRAY[1::double precision]'},
 {label:'non-one-lower-bound',expression:"'[0:383]={1,"+Array(383).fill('0').join(',')+"}'::double precision[]"},
 {label:'multidimensional',expression:'ARRAY[[1::double precision,0],[0,1]]'},
 ...[1-1e-6,1+1e-6].flatMap((n,i)=>[-1,0,1].map(direction=>({label:'tolerance-edge-'+i+'-'+(direction+1),expression:scalarArray(numberText(direction?adjacent(n,direction):n))}))),
 {label:'subnormal',expression:scalarArray('1','5e-324')},{label:'underflow-product',expression:scalarArray('1','1e-300')},
 {label:'overflow-product',expression:scalarArray('1e308')},
].map(Object.freeze));
const SEED_TYPE='"topicId" text,"sourceId" text,"discussionId" text,ordinal integer,"topicPayload" text,"sourcePayload" text,"discussionPayload" text,"linkPayload" text,"referencePayload" text,"valuesText" text,url text,title text,"embeddingPayload" text,"operationId" text,"operationDigest" text';
const seedFrom=body=>`WITH r AS MATERIALIZED(SELECT * FROM json_to_recordset($1::json) AS x(${SEED_TYPE})) ${body}`;
async function seed(database,rows){
 const input=JSON.stringify(rows);assert.ok(Buffer.byteLength(input)<=8*1024*1024);
 await database.transaction(async tx=>{
  await tx.query(seedFrom(`INSERT INTO canonical_v4.id_registry(id,kind)
   SELECT "topicId",'topics' FROM r UNION ALL SELECT "sourceId",'sources' FROM r UNION ALL SELECT "discussionId",'discussions' FROM r`),[input]);
  await tx.query(seedFrom(`INSERT INTO canonical_v4.topics(id,ordinal,payload,kind,title,created_at,provenance,retain_tight)
   SELECT "topicId",ordinal,"topicPayload",'general',title,'${stamp}','owner-local-learned-topic/v1',false FROM r`),[input]);
  await tx.query(seedFrom(`INSERT INTO canonical_v4.discussions(id,topic_id,ordinal,payload) SELECT "discussionId","topicId",ordinal,"discussionPayload" FROM r`),[input]);
  await tx.query(seedFrom(`INSERT INTO canonical_v4.sources(id,ordinal,payload,url,title,provenance,extractor_version,policy_version,operation_id,has_embedding)
   SELECT "sourceId",ordinal,"sourcePayload",url,title,'owner-local-page-embedding/v1','main-text-prefix/v1','ridge1-fixed-reference-radius/v1',"operationId",true FROM r`),[input]);
  await tx.query(seedFrom(`INSERT INTO canonical_v4.embeddings(source_id,payload,model_id,dimensions,values_double,vector_mirror)
   SELECT "sourceId","embeddingPayload",'e5-small-q8-browser-main-prefix-v1',384,ARRAY[1::double precision]||array_fill(0::double precision,ARRAY[383]),NULL FROM r`),[input]);
  await tx.query(seedFrom(`INSERT INTO canonical_v4.source_links(source_id,topic_id,ordinal,payload,method) SELECT "sourceId","topicId",ordinal,"linkPayload",'learned-provisional' FROM r`),[input]);
  await tx.query(seedFrom(`INSERT INTO canonical_v4.topic_memberships(source_id,topic_id,ordinal) SELECT "sourceId","topicId",0 FROM r`),[input]);
  await tx.query(seedFrom(`INSERT INTO canonical_v4.fixed_references(topic_id,payload,source_id,parameter_sha256,values_double,vector_mirror)
   SELECT "topicId","referencePayload","sourceId",'${PARAMETER}',"valuesText"::double precision[],NULL FROM r`),[input]);
  await tx.query(seedFrom(`INSERT INTO canonical_v4.operation_receipts(source_id,operation_id,operation_digest) SELECT "sourceId","operationId","operationDigest" FROM r`),[input]);
 });
}
async function screen(){
 assert.equal(globalThis[Symbol.for('murmingle.offline-capability-guard')]?.version,'offline-capability-guard/1.0.0');
 const {createPGliteDatabase}=await import('../../../src/database.js');
 const {migrateCanonicalV4,readCanonicalV4MigrationManifest}=await import('../../index.js');
 const cpuStarted=process.cpuUsage(),started=performance.now(),database=await createPGliteDatabase();let stage='migrate';
 const guard=()=>{const cpu=process.cpuUsage(cpuStarted);assert.ok((cpu.user+cpu.system)/1000<30000&&performance.now()-started<60000);};
 try{
  await database.exec("SET statement_timeout='8s'");const migration=await migrateCanonicalV4(database);assert.equal(migration.schemaVersion,9);guard();
  const migrations=await readCanonicalV4MigrationManifest(),original=migrations[6].sql,mock=mockSqlFrom007(original),
   fastValidator=fastValidatorSqlFrom004(migrations[3].sql),fastScan=fastScanSqlFrom007(original);
  stage='install-experimental-functions';
  await database.exec('CREATE SCHEMA ridge_cost_screen; CREATE TABLE ridge_cost_screen.mock_projection(topic_id text PRIMARY KEY,source_id text,parameter_sha256 text,values_double double precision[])');
  await database.exec(mock);await database.exec(fastValidator);await database.exec(fastScan);
  await database.query(`INSERT INTO canonical_v4.runtime_state(singleton,generation,revision) VALUES(true,'synthetic-ridge-cost-screen',0)`);
  const validationDifferentials=[];
  stage='validation-differentials';
  for(const item of VALIDATION_CASES){
   const outcomes=[];for(const name of ['canonical_v4.ingest_valid_unit_vector','ridge_cost_screen.fast_valid_unit_vector']){
    guard();try{const {rows}=await database.query(`SELECT ${name}(${item.expression}) AS valid`);outcomes.push({valid:rows[0].valid,sqlstate:null});}
    catch(error){assert.match(error.code??'',/^[A-Z0-9]{5}$/u);outcomes.push({valid:null,sqlstate:error.code});}
   }
   assert.deepEqual(outcomes[0],outcomes[1]);
   const scanOutcomes=[];for(const name of ['canonical_v4.ingest_ridge_scan','ridge_cost_screen.fast_scan']){
    guard();try{const {rows}=await database.query(`SELECT count(*)::integer AS n FROM ${name}((${item.expression}),$1)`,[PARAMETER]);scanOutcomes.push({matches:rows[0].n,sqlstate:null});}
    catch(error){assert.match(error.code??'',/^[A-Z0-9]{5}$/u);scanOutcomes.push({matches:null,sqlstate:error.code});}
   }
   assert.deepEqual(scanOutcomes[0],scanOutcomes[1]);validationDifferentials.push({case:item.label,...outcomes[0],scan:scanOutcomes[0],equal:true});
  }
  const measurements=[];let prior=0;
  const query=async(name,candidate)=>{guard();const start=performance.now();const {rows}=await database.query(`SELECT topic_id,encode(float8send(similarity),'hex') AS similarity_bits
    FROM ${name}($1::double precision[],$2) ORDER BY topic_id COLLATE "C"`,[vectorText(candidate),PARAMETER]);guard();return {rows,ms:performance.now()-start};};
  for(const count of SETTINGS.sizes){
   stage='seed-'+count;
   const fixture=buildFixture(count);await seed(database,fixture.rows.slice(prior));prior=count;guard();
   stage='prevalidate-'+count;
   const {rows:audit}=await database.query(`SELECT count(*)::integer AS n,bool_and(canonical_v4.ingest_valid_unit_vector(values_double)) AS valid,
    bool_and(encode(float8send(values_double[3]),'hex')='8000000000000000') AS signed_zero FROM canonical_v4.fixed_references`);
   assert.deepEqual(audit,[{n:count,valid:true,signed_zero:true}]);
   const {rows:sourceAudit}=await database.query('SELECT count(canonical_v4.ingest_source_response(id))::integer AS n FROM canonical_v4.sources');assert.equal(sourceAudit[0].n,count);
   await database.exec('TRUNCATE ridge_cost_screen.mock_projection; INSERT INTO ridge_cost_screen.mock_projection SELECT topic_id,source_id,parameter_sha256,values_double FROM canonical_v4.fixed_references');
   const expected=expectedMatches(fixture),samples={original:[],mock:[],fast:[]},variants=['original','fast','mock'];
   stage='measure-'+count;
   for(let repeat=0;repeat<3;repeat++)for(const variant of [...variants.slice(repeat),...variants.slice(0,repeat)]){
    const measured=await query(variant==='original'?'canonical_v4.ingest_ridge_scan':variant==='fast'?'ridge_cost_screen.fast_scan':'ridge_cost_screen.mock_scan',fixture.candidate);
    assert.deepEqual(measured.rows,expected);samples[variant].push(measured.ms);
   }
   const originalTiming=summarize(samples.original),mockTiming=summarize(samples.mock),fastTiming=summarize(samples.fast);
   measurements.push({references:count,repeatsPerVariant:3,matches:expected.length,orderedBinary64OutputsEqual:true,outputDigest:hash(JSON.stringify(expected)),
    original:originalTiming,fullValidationOrderedFiniteComparisons:fastTiming,mockAlreadyValidatedProjection:mockTiming,
    medianRatioOriginalOverMock:originalTiming.medianMs/mockTiming.medianMs,medianRatioOriginalOverFast:originalTiming.medianMs/fastTiming.medianMs,
    dotCoordinateProductsPerQuery:count*384,fullValidationVariants:['original','fast'],unsafeMockSkipsStoredValidation:true});guard();
  }
  // Deliberate corruption ONLY in this disposable synthetic engine. The stale
  // unchecked mock still returns matches: never mistake it for a certificate.
  stage='corruption-demonstration';await database.query("UPDATE canonical_v4.fixed_references SET parameter_sha256=$1 WHERE topic_id='topic-cost-1023'",['0'.repeat(64)]);
  let rejected=false;try{await query('canonical_v4.ingest_ridge_scan',buildFixture(64).candidate);}catch(error){assert.equal(error.code,'P1204');rejected=true;}
  assert.equal(rejected,true);const stale=await query('ridge_cost_screen.mock_scan',buildFixture(64).candidate);assert.ok(stale.rows.length>0);
  let fastRejected=false;try{await query('ridge_cost_screen.fast_scan',buildFixture(64).candidate);}catch(error){assert.equal(error.code,'P1204');fastRejected=true;}assert.equal(fastRejected,true);
  const cpu=process.cpuUsage(cpuStarted);
  return {schema:SETTINGS.schema,status:'complete',settings:SETTINGS,migrations:migrations.map(m=>({version:m.version,sha256:m.hash})),
   original007Sha256:hash(original),mockSqlSha256:hash(mock),fastValidatorSqlSha256:hash(fastValidator),fastScanSqlSha256:hash(fastScan),measurements,validationDifferentials,
   corruption:{originalRejected:true,fastFullValidationRejected:true,sqlstate:'P1204',unsafeMockMissedCorruption:true},signedZeroTransportChecked:true,
   scope:'synthetic-in-memory-PGlite-not-native-or-endpoint-performance',integrityCertificateImplemented:false,activation:false,
   timings:{workerCpuMs:(cpu.user+cpu.system)/1000,workerWallMs:performance.now()-started},productionValidated:false};
 }catch(error){return {schema:SETTINGS.schema,status:'failed',stage,sqlstate:typeof error.code==='string'&&/^[A-Z0-9]{5}$/u.test(error.code)?error.code:null,
   failureKind:error.code==='ERR_ASSERTION'?'assertion':'synthetic-screen-failed',activation:false};}
 finally{await database.close();}
}
export async function run(args){
 if(phaseFor(args)===null)return {schema:SETTINGS.schema,status:'inert',activation:false};
 assert.equal(isMainThread,true);assert.ok(process.execArgv.includes('--max-old-space-size=256'));
 assert.equal(globalThis[Symbol.for('murmingle.offline-capability-guard')]?.version,'offline-capability-guard/1.0.0');
 const started=performance.now(),cpu=process.cpuUsage(),worker=new Worker(new URL(import.meta.url),{
  workerData:{schema:'ridge-cost-screen-owned-worker/v1'},resourceLimits:{maxOldGenerationSizeMb:256,maxYoungGenerationSizeMb:16}});
 let message=null,failure=null,reason=null;
 const timer=setInterval(()=>{const used=process.cpuUsage(cpu);if((used.user+used.system)/1000>=30000||performance.now()-started>=60000){
  reason='owned-worker-budget-exceeded';void worker.terminate();}},20);
 await new Promise(resolveExit=>{worker.on('message',value=>{if(message!==null){reason='duplicate-worker-result';void worker.terminate();}else message=value;});
  worker.on('error',()=>{failure=true;});worker.on('exit',code=>{if(code!==0)failure=true;resolveExit();});});clearInterval(timer);
 const used=process.cpuUsage(cpu);if((used.user+used.system)/1000>=30000||performance.now()-started>=60000)reason='owned-worker-budget-exceeded';
 const result=reason||failure||!message?{schema:SETTINGS.schema,status:'failed',reason:reason??'owned-worker-failed',activation:false}:
  {...message,guardian:{totalCpuMs:(used.user+used.system)/1000,totalWallMs:performance.now()-started,ownWorkerExitConfirmed:true}};
 assert.ok(Buffer.byteLength(JSON.stringify(result))<=16384);return result;
}
if(!isMainThread&&workerData?.schema==='ridge-cost-screen-owned-worker/v1'){
 try{parentPort.postMessage(await screen());}catch{parentPort.postMessage({schema:SETTINGS.schema,status:'failed',reason:'synthetic-screen-failed',activation:false});}
}else if(isMainThread&&process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const result=await run(process.argv.slice(2));console.log(JSON.stringify(result));if(result.status==='failed')process.exitCode=1;}
 catch{console.log(JSON.stringify({schema:SETTINGS.schema,status:'refused',activation:false}));process.exitCode=1;}
}
