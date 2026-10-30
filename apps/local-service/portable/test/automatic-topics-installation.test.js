import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {buildAutomaticTopicsMigrationSource,AUTOMATIC_TOPICS_COMPONENTS} from '../canonical-v4/automatic-topics-migration-source.js';
import {readCanonicalV4MigrationManifest,canonicalV4SchemaVersion} from '../canonical-v4/index.js';
import {upgradeAutomaticTopics,installAutomaticTopics} from '../canonical-v4/automatic-topics-installation.js';
import {loadInstalledHierarchyMatcher} from '../../src/application/installed-hierarchy-matcher.js';
import {AUTOMATIC_TOPICS_NATIVE_CAPABILITY} from './automatic-topics-migration-native-assertions.js';
import {createLocalServiceClient} from '../../../../spikes/topic-resolution/browser/core/local-service-client.js';
const code=c=>e=>e?.code===c;

test('the short invented fixture token fails before dispatch while its corrected token reaches transport',async()=>{
 let calls=0;const client=token=>createLocalServiceClient({getToken:()=>token,fetchImpl:async()=>{calls++;throw Error('Invented unavailable transport');}});
 const query={query:'Invented',limit:20,cursor:null};
 await assert.rejects(client('invented-automatic18-capability').semanticSearch(query),code('unauthorized'));assert.equal(calls,0);
 await assert.rejects(client(AUTOMATIC_TOPICS_NATIVE_CAPABILITY).semanticSearch(query),code('unavailable'));assert.equal(calls,1);
});
test('registered18 contains the exact reviewed component bytes in a fixed order',async()=>{
 const actual=await readFile(new URL('../canonical-v4/migrations/018-automatic-topics.sql',import.meta.url)),built=await buildAutomaticTopicsMigrationSource();assert.deepEqual(actual,built);
 assert.equal(createHash('sha256').update(actual.subarray(0,378431)).digest('hex'),'7ac32a90c8f904bf8f970704ebdf78cae88662e00ca0033d447a060c2ec0e725','the fifteen consumed components remain an exact byte prefix');
 assert.equal(createHash('sha256').update(actual.subarray(0,382386)).digest('hex'),'36e9400e216c77e77f383ba5bc4878098469bedff69b86a70896a63b8db84e1c','all sixteen consumed components remain an exact byte prefix');
 assert.equal(AUTOMATIC_TOPICS_COMPONENTS.length,17);assert(Object.isFrozen(AUTOMATIC_TOPICS_COMPONENTS));await assert.rejects(buildAutomaticTopicsMigrationSource('arbitrary.sql'),TypeError);
});
test('schema18 appends one migration without changing any existing migration or default profile',async()=>{
 const old=await readCanonicalV4MigrationManifest('hierarchy17'),now=await readCanonicalV4MigrationManifest('hierarchy18');assert.equal(canonicalV4SchemaVersion(),9);assert.equal(canonicalV4SchemaVersion('hierarchy18'),18);
 assert.equal(now.length,18);assert.deepEqual(now.slice(0,17),old);assert.equal(now[17].hash,createHash('sha256').update(now[17].sql).digest('hex'));
 assert.deepEqual((await readCanonicalV4MigrationManifest()).map(r=>r.hash),now.slice(0,9).map(r=>r.hash));
});
function fake({isolation='read committed',readOnly='off',owner=true,pending=0,headRevision='1',policyRevision='1',matcherHash}={}){
 const calls=[];let transactions=0;const tx={dialect:'pg',async exec(){assert.fail('Rejected upgrade must not execute DDL');},async query(sql){calls.push(sql);
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};if(sql.includes('current_setting'))return {rows:[{isolation,read_only:readOnly,owner}]};
  if(sql.includes('ingestion_jobs'))return {rows:[{n:pending}]};if(sql.includes('semantic_installation'))return {rows:[{revision:headRevision,matcher_hash:matcherHash}]};
  if(sql.includes('semantic_owner_policy'))return {rows:[{revision:policyRevision,default_max_depth:1,overrides:[]}]};assert.fail('Unreviewed SQL');
 }};
 return {database:{query:(...args)=>tx.query(...args),transaction:async work=>{transactions++;return work(tx);}},calls,count:()=>transactions};
}
test('owner writable read-committed and drained-job checks precede all upgrade DDL',async()=>{
 for(const changes of [{isolation:'repeatable read'},{readOnly:'on'},{owner:false}]){const f=fake(changes);await assert.rejects(upgradeAutomaticTopics({database:f.database,expectedHeadRevision:1,expectedPolicyRevision:1}),code('forbidden'));assert.equal(f.count(),1);assert(!f.calls.some(s=>s.includes('semantic_installation')));}
 const busy=fake({pending:1});await assert.rejects(upgradeAutomaticTopics({database:busy.database,expectedHeadRevision:1,expectedPolicyRevision:1}),code('conflict'));assert(!busy.calls.some(s=>s.includes('semantic_installation')));
});
test('stale head policy or unexpected installed model refuse before migration on one physical transaction',async()=>{
 const installed=await loadInstalledHierarchyMatcher();
 for(const changes of [{headRevision:'2'},{policyRevision:'2'},{matcherHash:'a'.repeat(64)}]){const f=fake({matcherHash:installed.descriptor.matcherIdentityHash,...changes});
  await assert.rejects(upgradeAutomaticTopics({database:f.database,expectedHeadRevision:1,expectedPolicyRevision:1}),code('conflict'));assert.equal(f.count(),1);assert(!f.calls.some(s=>s.includes('schema_migrations')));
 }
});
test('malformed owner installation input starts no transaction and never selects a caller path',async()=>{
 let calls=0;const database={query(){calls++;assert.fail('Invalid request ran SQL');},transaction(){calls++;assert.fail('Invalid request opened a transaction');}};
 await assert.rejects(upgradeAutomaticTopics({database,expectedHeadRevision:-1,expectedPolicyRevision:1}),TypeError);
 await assert.rejects(upgradeAutomaticTopics({database,expectedHeadRevision:1,expectedPolicyRevision:1,path:'other.sql'}),code('invalid'));
 await assert.rejects(installAutomaticTopics({database,expectedHeadRevision:0,expectedPolicyRevision:0}),code('invalid'));assert.equal(calls,0);
});
