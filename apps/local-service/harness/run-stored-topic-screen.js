// Closed readonly local development screen. Never imports a worker/publisher.
import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import path from 'node:path';
import {statfs} from 'node:fs/promises';
import {createWindowsDpapiPasswordProvider} from '../portable/src/windows-dpapi-password.js';
import {createWindowsBackupProtection} from '../src/ops/windows-backup-protection.js';
import {loadInstalledHierarchyMatcher} from '../src/application/installed-hierarchy-matcher.js';
import {benchmarkNeed as need,benchmarkSourcePins as pins,checkBenchmarkPins as endPins,createBenchmarkOutput as directory,
 saveBenchmarkJson as save,readBenchmarkJson as json} from './hierarchy-benchmark-files.js';
import {screenStoredTopics,STORED_TOPIC_SCREEN_PROBES,STORED_TOPIC_SCREEN_SQL} from './stored-topic-screen.js';
const OUTPUT='apps/local-service/data/canonical-migration-backups/automatic18-stored-topic-screen-20261030';
const SOURCES=[
 'apps/local-service/harness/run-stored-topic-screen.js','apps/local-service/harness/stored-topic-screen.js','apps/local-service/harness/stored-topic-screen.test.js',
 'apps/local-service/harness/hierarchy-benchmark-files.js','apps/local-service/src/domain/hierarchical-e5-paired-input.js',
 'apps/local-service/portable/canonical-v4/embedding-binary-wire.js',
 'apps/local-service/experiments/automatic-topic-discovery-v1/focus-subjects.js','apps/local-service/experiments/automatic-topic-discovery-v2/focus-subjects.js',
 'apps/local-service/src/application/installed-hierarchy-matcher.js','apps/local-service/src/domain/hierarchy-rooted-matcher.js',
 'apps/local-service/portable/src/windows-dpapi-password.js','apps/local-service/src/ops/windows-backup-protection.js',
];
let used=false;
export async function runStoredTopicScreen(){need(arguments.length===0&&!used);used=true;
 const sourcePins=await pins(SOURCES),inputPins=[],definition=await json('apps/local-service/assets/hierarchy/input-definition.json',
  {sha256:'2ec96c1244761b9688e5fea2a2dec168df1ac961aa2d440fcd42bdb085e6096c'},inputPins),installed=await loadInstalledHierarchyMatcher();
 const disk=await statfs('D:\\',{bigint:true});need(disk.bavail*disk.bsize>=4294967296n+4194304n);
 const protection=createWindowsBackupProtection();need(protection);await protection.prepareDirectory(fileURLToPath(new URL('../data/canonical-migration-backups/',import.meta.url)).replace(/[\\/]$/u,''));
 await directory(OUTPUT);await save(OUTPUT,'inputs.json',{sourcePins,inputPins,probes:STORED_TOPIC_SCREEN_PROBES,
  limits:{rows:48,perProbe:8,queryTimeoutMs:5000,readOnly:true},liveChanged:false});
 const {Client}=createRequire(new URL('../portable/package.json',import.meta.url))('pg');
 const database=new Client({host:'127.0.0.1',port:55432,database:'murmingle_canonical',user:'murmingle_owner',
  password:createWindowsDpapiPasswordProvider({role:'murmingle_owner'}),ssl:false,connectionTimeoutMillis:5000,query_timeout:5000});
 let began=false,connected=false,rows=[],metadata=null,failure=null,closed=false,screen=null,cohortPin=null;const at=performance.now();
 try{
  await database.connect();connected=true;await database.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');began=true;
  await database.query("SET LOCAL statement_timeout='5000ms'");await database.query("SET LOCAL lock_timeout='1000ms'");
  const r=await database.query(`SELECT current_database() AS database,current_user AS role,host(inet_server_addr()) AS address,inet_server_port() AS port,
   r.generation,r.revision::text AS revision,h.matcher_hash,(SELECT count(*)::integer FROM canonical_v4.schema_migrations) AS schema_version
   FROM canonical_v4.runtime_state r JOIN canonical_v4.semantic_installation h ON h.singleton WHERE r.singleton`);
  need(r.rows.length===1);metadata=r.rows[0];need(metadata.database==='murmingle_canonical'&&metadata.role==='murmingle_owner'&&metadata.address==='127.0.0.1'&&metadata.port===55432&&metadata.schema_version===17&&metadata.matcher_hash===installed.descriptor.matcherIdentityHash);
  const result=await database.query(STORED_TOPIC_SCREEN_SQL,[JSON.stringify(STORED_TOPIC_SCREEN_PROBES.map((p,i)=>({...p,ord:i}))),metadata.generation]);
  rows=result.rows;need(rows.length<=48);await database.query('COMMIT');began=false;
 }catch{failure={stage:'readonly-capture',detailsRetained:false};}
 finally{if(began)try{await database.query('ROLLBACK');began=false;}catch{failure??={stage:'readonly-rollback'};}try{await database.end();closed=true;}catch{failure??={stage:'connection-close'};}}
 const readonlyCaptureMs=performance.now()-at;
 if(!failure)try{
  cohortPin=await save(OUTPUT,'cohort.json',{schema:'stored-topic-development-cohort/v1',metadata,rows,readonly:true,assignmentAuthority:false});
  screen=screenStoredTopics({rows,inputDefinition:definition,matcherHash:metadata.matcher_hash});
 }catch{failure={stage:'screen-or-local-persistence'};}
 let sourceEndPinsPassed=false;try{await endPins(inputPins,SOURCES,sourcePins);sourceEndPinsPassed=true;}catch{failure??={stage:'end-pins'};}
 const result={schema:'stored-topic-development-screen-run/v1',status:failure?'failed':'completed',failure,screen,cohortPin,sourcePins,inputPins,sourceEndPinsPassed,
  cleanup:{connected,transactionClosed:!began,connectionClosed:closed},readonlyCaptureMs,elapsedMs:performance.now()-at,liveChanged:false,databaseWrites:false,newEncoder:false,newNetworkCapture:false};
 const resultPin=await save(OUTPUT,'result.json',result);
 return {status:result.status,rows:rows.length,variants:screen?.variants.map(v=>({id:v.id,status:v.status,assigned:v.assigned,proposedSubjects:v.proposedSubjects,timing:v.timing}))??[],
  sourceEndPinsPassed,connectionClosed:closed,liveChanged:false,result:resultPin};
}
export async function main(args=process.argv.slice(2)){if(!Array.isArray(args)||args.length!==1||args[0]!=='--screen-stored-topics')return 2;
 try{const result=await runStoredTopicScreen();process.stdout.write(JSON.stringify(result)+'\n');return result.status==='completed'?0:1;}catch{process.stderr.write('Stored-topic development screen unavailable; no live change.\n');return 1;}}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(exitCode=>{process.exitCode=exitCode;});
