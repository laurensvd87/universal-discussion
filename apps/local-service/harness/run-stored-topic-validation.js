// Closed two-phase validation on existing local E5 data. Import performs no IO.
// One fixed read-only capture; annotation and evaluation are separate actions.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {statfs} from 'node:fs/promises';
import {createWindowsDpapiPasswordProvider} from '../portable/src/windows-dpapi-password.js';
import {createWindowsBackupProtection} from '../src/ops/windows-backup-protection.js';
import {benchmarkNeed as need,benchmarkSourcePins as pins,checkBenchmarkPins as endPins,createBenchmarkOutput as directory,
 saveBenchmarkJson as save,readBenchmarkJson as json} from './hierarchy-benchmark-files.js';
import {STORED_VALIDATION_PROBES,STORED_VALIDATION_SQL,prepareStoredValidation,evaluateStoredValidation} from './stored-topic-validation.js';

const OUTPUT='apps/local-service/data/canonical-migration-backups/automatic18-new-domain-validation-20261030';
const MATCHER='4e9b3d3d2053327707d6ff395a8373e6e5ac3195333183ac8516f84195c45524';
const FILES=[
 'apps/local-service/harness/run-stored-topic-validation.js','apps/local-service/harness/stored-topic-validation.js',
 'apps/local-service/harness/stored-topic-validation.test.js','apps/local-service/harness/hierarchy-benchmark-files.js',
 'apps/local-service/src/domain/hierarchical-e5-paired-input.js','apps/local-service/portable/canonical-v4/embedding-binary-wire.js',
 'apps/local-service/experiments/automatic-topic-discovery-v3/focus-subjects.js',
 'apps/local-service/portable/src/windows-dpapi-password.js','apps/local-service/src/ops/windows-backup-protection.js',
 'apps/local-service/portable/package.json','apps/local-service/portable/package-lock.json',
];
const scope={newEncoder:false,databaseWrites:false,providerUsed:false,publication:false,liveChanged:false,
 rootOnlyReview:true,sourcePinScope:'listed-eleven-files-plus-paired-input-definition-not-complete-transitive-package-closure'};
let used=false;
export async function captureStoredTopicValidation(){
 need(arguments.length===0&&!used);used=true;const sourcePins=await pins(FILES),inputPins=[];
 await json('apps/local-service/assets/hierarchy/input-definition.json',{sha256:'2ec96c1244761b9688e5fea2a2dec168df1ac961aa2d440fcd42bdb085e6096c'},inputPins);
 need(sourcePins.find(p=>p.file.endsWith('automatic-topic-discovery-v3/focus-subjects.js')).sha256==='cfe889f1ebf9db8d9d40e2f9bc1495a8ac7865c792c23cd56163a9d112a642c6');
 const disk=await statfs('D:\\',{bigint:true});need(disk.bavail*disk.bsize>=4294967296n+8388608n);
 const protection=createWindowsBackupProtection();need(protection);
 await protection.prepareDirectory(fileURLToPath(new URL('../data/canonical-migration-backups/',import.meta.url)).replace(/[\\/]$/u,''));
 await directory(OUTPUT);
 await save(OUTPUT,'inputs.json',{schema:'stored-topic-prospective-inputs/v1',sourcePins,inputPins,probes:STORED_VALIDATION_PROBES,
  protocol:{perProbe:4,rows:64,queryTimeoutMs:5000,lockTimeoutMs:1000,matchingSimilarity:.8,
   preparationJoinsBeforeLimit:true,noTopicProposalsBeforeAnnotation:true,noReplacementOnUnavailable:true,
   sample:'Earliest current exact prepared rows per fixed title expression; not random web or current-user browsing population.'},...scope});
 const {Client}=createRequire(new URL('../portable/package.json',import.meta.url))('pg');
 const db=new Client({host:'127.0.0.1',port:55432,database:'murmingle_canonical',user:'murmingle_owner',
  password:createWindowsDpapiPasswordProvider({role:'murmingle_owner'}),ssl:false,connectionTimeoutMillis:5000,query_timeout:5000});
 let began=false,connected=false,closed=false,metadata=null,rows=[],failure=null,cohortPin=null;const started=performance.now();
 try{
  await db.connect();connected=true;await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');began=true;
  await db.query("SET LOCAL statement_timeout='5000ms'");await db.query("SET LOCAL lock_timeout='1000ms'");
  const result=await db.query(`SELECT current_database() AS database,current_user AS role,host(inet_server_addr()) AS address,inet_server_port() AS port,
   r.generation,h.matcher_hash,(SELECT count(*)::integer FROM canonical_v4.schema_migrations) AS schema_version,
   current_setting('transaction_read_only') AS readonly
   FROM canonical_v4.runtime_state r JOIN canonical_v4.semantic_installation h ON h.singleton WHERE r.singleton`);
  need(result.rows.length===1);metadata=result.rows[0];
  need(metadata.database==='murmingle_canonical'&&metadata.role==='murmingle_owner'&&metadata.address==='127.0.0.1'&&metadata.port===55432&&
   metadata.schema_version===17&&metadata.matcher_hash===MATCHER&&metadata.readonly==='on');
  rows=(await db.query(STORED_VALIDATION_SQL,[JSON.stringify(STORED_VALIDATION_PROBES),metadata.generation])).rows;need(rows.length<=64);
  await db.query('COMMIT');began=false;
 }catch{failure={stage:'readonly-capture',detailsRetained:false};}
 finally{
  if(began)try{await db.query('ROLLBACK');began=false;}catch{failure??={stage:'readonly-rollback'};}
  try{await db.end();closed=true;}catch{failure??={stage:'connection-close'};}
 }
 const readonlyCaptureMs=performance.now()-started;
 let sourceEndPinsPassed=false;
 try{await endPins(inputPins,FILES,sourcePins);sourceEndPinsPassed=true;}catch{failure??={stage:'end-pins'};}
 if(!failure)try{cohortPin=await save(OUTPUT,'cohort.json',{schema:'stored-topic-prospective-cohort/v1',metadata,rows,sourcePins,inputPins,
  sourceEndPinsPassed,annotationBeforeProposalsRequired:true,capturedAt:new Date().toISOString(),...scope});}catch{failure={stage:'cohort-persistence'};}
 const counts=STORED_VALIDATION_PROBES.map(p=>({id:p.id,rows:rows.filter(r=>r.probe===p.id).length}));
 const result={schema:'stored-topic-prospective-capture/v1',status:failure?'failed':'completed',failure,cohortPin,counts,
  sourcePins,inputPins,sourceEndPinsPassed,cleanup:{connected,transactionClosed:!began,connectionClosed:closed},readonlyCaptureMs,...scope};
 return {status:result.status,counts,sourceEndPinsPassed,cleanup:result.cleanup,readonlyCaptureMs,result:await save(OUTPUT,'capture-result.json',result)};
}

export async function compareStoredTopicValidation(cohortSha256,annotationsSha256){
 need(arguments.length===2&&!used&&[cohortSha256,annotationsSha256].every(s=>typeof s==='string'&&/^[a-f0-9]{64}$/u.test(s)));used=true;
 const sourcePins=await pins(FILES),inputPins=[];
 const cohort=await json(OUTPUT+'/cohort.json',{sha256:cohortSha256},inputPins),annotations=await json(OUTPUT+'/annotations.json',{sha256:annotationsSha256},inputPins),
  capture=await json(OUTPUT+'/capture-result.json',null,inputPins),definition=await json('apps/local-service/assets/hierarchy/input-definition.json',
   {sha256:'2ec96c1244761b9688e5fea2a2dec168df1ac961aa2d440fcd42bdb085e6096c'},inputPins);
 need(cohort.schema==='stored-topic-prospective-cohort/v1'&&cohort.sourceEndPinsPassed&&cohort.annotationBeforeProposalsRequired&&cohort.metadata.matcher_hash===MATCHER);
 need(capture.status==='completed'&&capture.cohortPin.sha256===cohortSha256&&capture.sourceEndPinsPassed&&capture.cleanup.connectionClosed&&capture.cleanup.transactionClosed);
 need(annotations.schema==='stored-topic-title-annotations/v1'&&annotations.cohortSha256===cohortSha256&&annotations.beforeProposals===true&&
  typeof annotations.annotatedAt==='string'&&Date.parse(annotations.annotatedAt)>=Date.parse(cohort.capturedAt));
 need(JSON.stringify(cohort.sourcePins)===JSON.stringify(sourcePins));
 const input=prepareStoredValidation({rows:cohort.rows,inputDefinition:definition,matcherHash:MATCHER});
 const evaluation=evaluateStoredValidation({input,annotations:annotations.rows});
 await endPins(inputPins,FILES,sourcePins);
 const result={schema:'stored-topic-prospective-evaluation-run/v1',status:'completed',evaluation,sourcePins,inputPins,sourceEndPinsPassed:true,
  titleAnnotationsBy:'Root-only review; no independent reviewer or body-content accuracy claim',...scope};
 return {status:'completed',counts:evaluation.counts,proposalElapsedMs:evaluation.proposalElapsedMs,sourceEndPinsPassed:true,...scope,
  result:await save(OUTPUT,'evaluation-result.json',result)};
}
export async function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||!(args.length===1&&args[0]==='--capture-fixed-cohort'||args.length===3&&args[0]==='--compare-fixed-cohort'&&
  args.slice(1).every(s=>typeof s==='string'&&/^[a-f0-9]{64}$/u.test(s))))return 2;
 try{const r=await(args[0]==='--capture-fixed-cohort'?captureStoredTopicValidation():compareStoredTopicValidation(args[1],args[2]));
  process.stdout.write(JSON.stringify(r)+'\n');return r.status==='completed'?0:1;
 }catch{process.stderr.write('Fixed stored-topic validation unavailable; no live changes.\n');return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(exitCode=>{process.exitCode=exitCode;});
