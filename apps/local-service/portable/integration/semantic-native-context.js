// Ordinary production-SQL fixture on the existing owned native lifecycle.
// Imports are inert; no production connection, native witness or second queue.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createFixtureController} from './native-hierarchy-postgres-v2/context.js';
import {createExclusiveSession} from './native-hierarchy-postgres-v2/session.js';
import {runWithOwnedScopedPostgres,getOwnedIdentity,FIXED} from './hierarchy-native-cluster.js';
import {migrateCanonicalV4,initializeCanonicalV4Runtime} from '../canonical-v4/index.js';
import {SEMANTIC_CASES,runSemanticAssertions} from '../test/semantic-native-assertions.js';

const fail=code=>Object.assign(new Error('Owned semantic SQL check failed'),{code});
const sha=x=>createHash('sha256').update(x).digest('hex');
const SQL_SHA='2a647b0a83bb4e9c09bbd703dc4343788a4dd57dd7f52289f5b842afaeba8355';
const FEED_SQL_SHA='a2ccf69eb5c17bc4f64a950c053bae49dd82f9f13c913cf7fb5615602f945202';
const STORED_SQL_SHA='9af5affa2377d218df1b2ca9daa79eddbedd78fa3bf86ccf74f97c09acf574aa';
const roles=new Map([['postgres','observer'],['murmingle_app','app'],
 ['murmingle_ingest_worker','worker'],['murmingle_crawler_submitter','submitter']]);
function code(error){const value=error&&Object.getOwnPropertyDescriptor(error,'code');
 return value&&Object.hasOwn(value,'value')&&typeof value.value==='string'&&/^[A-Z0-9_]{1,64}$/u.test(value.value)?value.value:'SEMANTIC_ASSERTION_FAILED';}

function ledger(){
 const rows=[];let cursor=0,pending=0;
 async function test(name,body,depth=0){
  const expected=SEMANTIC_CASES[cursor++];
  if(!expected||expected.name!==name||expected.depth!==depth||typeof body!=='function')throw fail('SEMANTIC_LEDGER');
  const row={name,depth,status:'running'};rows.push(row);pending++;
  try{await body({test:(child,fn)=>test(child,fn,1)});row.status='passed';}
  catch(error){row.status='failed';throw error;}
  finally{pending--;}
 }
 return {test,snapshot:()=>({rows:rows.map(row=>({...row})),pending,cursor}),finish(){
  if(cursor!==25||pending||rows.some(row=>row.status!=='passed'))throw fail('SEMANTIC_LEDGER');
  return rows.map(row=>({...row}));
 }};
}

async function initialize(database,generation,sql,feedSql,storedSql){
 await database.exec('ALTER SCHEMA canonical_v4 OWNER TO murmingle_owner');
 await database.exec('SET ROLE murmingle_owner');
 await migrateCanonicalV4(database);
 await database.transaction(async tx=>{
  await tx.query(`INSERT INTO canonical_v4.meta
   (singleton,target_format,source_format,state_schema,generation,revision,logical_sha256,counts_text)
   VALUES(true,'canonical-postgresql/v4-slice1','canonical-relational/v2','demo-state/v4',$1,0,$2,$3)`,
   [generation,'0'.repeat(64),JSON.stringify({topics:1,discussions:1,sources:0,contributions:0})]);
  const title='Invented manual destination',createdAt='2026-10-26T00:00:00Z';
  await tx.query("INSERT INTO canonical_v4.id_registry VALUES('topic-semantic-manual','topics'),('discussion-semantic-manual','discussions')");
  await tx.query(`INSERT INTO canonical_v4.topics(id,ordinal,payload,kind,title,created_at,write_version)
   VALUES('topic-semantic-manual',0,$1,'general',$2,$3,1)`,
   [JSON.stringify({id:'topic-semantic-manual',kind:'general',title,createdAt,reference:null}),title,createdAt]);
  await tx.query(`INSERT INTO canonical_v4.discussions(id,topic_id,ordinal,payload,write_version)
   VALUES('discussion-semantic-manual','topic-semantic-manual',0,$1,0)`,
   [JSON.stringify({id:'discussion-semantic-manual',topicId:'topic-semantic-manual'})]);
  await tx.exec("INSERT INTO canonical_v4.fixed_references(topic_id,payload) VALUES('topic-semantic-manual','null')");
  await initializeCanonicalV4Runtime(tx);
  // Deliberately unregistered in schema_migrations: production startup remains
  // at9 until the complete hierarchy feature/cutover is validated.
  await tx.exec(sql);
  await tx.exec(feedSql);
  await tx.exec(storedSql);
 });
}

let used=false;
export async function runSemanticNativeProof(){
 if(arguments.length||used)throw fail('SEMANTIC_PROOF_ONESHOT');used=true;
 const raw=await readFile(new URL('../canonical-v4/migrations/010-semantic-hierarchy.sql',import.meta.url));
 if(raw.length!==19578||sha(raw)!==SQL_SHA)throw fail('SEMANTIC_SCHEMA_PIN');
 const feedRaw=await readFile(new URL('../canonical-v4/migrations/011-semantic-discussion-feeds.sql',import.meta.url));
 if(feedRaw.length!==14949||sha(feedRaw)!==FEED_SQL_SHA)throw fail('SEMANTIC_FEED_SCHEMA_PIN');
 const storedRaw=await readFile(new URL('../canonical-v4/migrations/012-semantic-stored-source-preparation.sql',import.meta.url));
 if(storedRaw.length!==29092||sha(storedRaw)!==STORED_SQL_SHA)throw fail('SEMANTIC_STORED_SCHEMA_PIN');
 return runWithOwnedScopedPostgres(async connectFixedRole=>{
  let open=true,primary=null;
  const guard=()=>{if(!open)throw fail('SEMANTIC_SCOPE_RETIRED');};
  const controller=createFixtureController({connectFixedRole,getOwnedIdentity,guard}),fixtures=[],checks=ledger(),sqlFailures=[];
  function observed(database,role){
   async function query(sql,parameters=[]){
    const caseIndex=checks.snapshot().cursor-1;
    try{return await database.query(sql,parameters);}
    catch(error){const descriptor=error&&Object.getOwnPropertyDescriptor(error,'code');
     if(descriptor&&Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='string'&&/^[A-Z0-9]{5}$/u.test(descriptor.value)){
      sqlFailures.push({caseIndex,role,sqlState:descriptor.value});if(sqlFailures.length>64)sqlFailures.shift();
     }throw error;
    }
   }
   return {dialect:'pg',query,exec:sql=>query(sql),close:()=>database.close(),
    transaction:fn=>database.transaction(tx=>fn(observed(tx,role)))};
  }
  async function acquireFixture(){
   guard();const index=fixtures.length;if(index>1)throw fail('SEMANTIC_FIXTURE_CAPACITY');
   const database=observed(await controller.acquire(),'owner'),databaseName=index===0?FIXED.databaseA:FIXED.databaseB,
    generation='semantic-owned-fixture-'+(index===0?'a':'b'),sessions=new Set();
   let closed=false,closing=null;
   const fixture={database,databaseName,generation,
    async header(){guard();if(closed)throw fail('SEMANTIC_FIXTURE_RETIRED');
     const {rows}=await database.query('SELECT generation,revision FROM canonical_v4.runtime_state WHERE singleton=true');
     if(rows.length!==1||rows[0].generation!==generation)throw fail('SEMANTIC_GENERATION');
     return {generation,revision:Number(rows[0].revision)};
    },
    async connect(role){guard();if(closed||!roles.has(role))throw fail('SEMANTIC_ROLE');
     const client=await connectFixedRole({database:databaseName,role,applicationName:'murmingle-native-hierarchy-semantic-'+roles.get(role),
      statementTimeoutMs:5000,lockTimeoutMs:3000},guard);
     const session=createExclusiveSession(client,guard);sessions.add(session);return observed(session,role);
    },
    close(){if(closing)return closing;closed=true;
     closing=(async()=>{
      const settled=await Promise.allSettled([...sessions].map(session=>session.close()));
      if(settled.some(result=>result.status!=='fulfilled'))throw fail('SEMANTIC_ROLE_CLEANUP');
      await database.close();
     })();return closing;
    }};
   fixtures.push(fixture);await initialize(database,generation,raw.toString('utf8'),feedRaw.toString('utf8'),storedRaw.toString('utf8'));return fixture;
  }
  let rows=null,cleanup;
  try{await runSemanticAssertions(checks.test,{acquireFixture});rows=checks.finish();}
  catch(error){primary=code(error);}
  finally{
   for(const fixture of fixtures)try{await fixture.close();}catch(error){primary??=code(error);}
   cleanup=await controller.finish();open=false;
  }
  const state=checks.snapshot();
  const failedCase=state.rows.findLastIndex(row=>row.status==='failed'&&row.depth===1);
  return {schema:'canonical-semantic-postgres-proof/v1',status:primary===null&&rows?.length===25&&cleanup.status==='passed'&&state.pending===0?'passed':'failed',
   primary,cases:rows??state.rows,pendingAssertions:state.pending,cleanup,nativeExecuted:true,
   restrictedRoleValidated:primary===null&&rows?.length===25,concurrencyScope:'head-switch-vs-apply-and-mvcc-read',
   multiUserLoadValidated:false,semanticQualityMeasured:false,
   lastObservedSqlFailure:primary===null?null:sqlFailures.findLast(row=>row.caseIndex===failedCase)??null};
 });
}
