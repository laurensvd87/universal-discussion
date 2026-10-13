import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,mkdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createDemoState,applyCommand,FIXED_REFERENCE_STATE_SCHEMA} from '../src/domain/demo-state.js';
import {readLearnedIngest,applyLearnedIngest,BROWSER_MODEL_ID} from '../src/domain/learned-sources.js';
import {operationDigestFor} from '../src/domain/source-threads.js';
import {migrateReferenceTopicState} from '../src/domain/reference-state-migration.js';
import {assertValidPersistedState} from '../src/domain/persisted-state.js';
import {createNormalizedSqliteRepository,migrateNormalizedReferenceStorage,assertNormalizedCatalogSchema,
  NORMALIZED_STORAGE_FORMAT,NORMALIZED_FIXED_REFERENCE_STORAGE_FORMAT} from '../src/adapters/normalized-sqlite-repository.js';
import {createCanonicalBackup,verifyCanonicalBackup} from '../src/ops/canonical-backup.js';

const stamp='2026-10-13T12:00:00Z';
const values=angle=>[Math.cos(angle),Math.sin(angle),...Array(382).fill(0)];
const version=state=>({generation:state.generation,revision:state.revision});
const actor={id:'account-11111111-1111-4111-8111-111111111111',accountId:'11111111-1111-4111-8111-111111111111',type:'human',demo:false,displayName:'Synthetic'};
function oldState() {
  let state=createDemoState({generation:'synthetic-fixed-storage',createdAt:stamp,sources:[],topicSeeds:[]}),serial=0;
  const dependencies={nextId:kind=>`${kind}-${++serial}`,now:()=>stamp};
  for(const [label,angle] of [['a',0],['b',.1],['c',1.5]]) {
    const input=readLearnedIngest({expected:version(state),operationId:`operation-${label}`,url:`https://example.org/fixed-storage/${label}`,
      title:`Synthetic ${label}`,extractorVersion:'main-text-prefix/v1',embedding:{modelId:BROWSER_MODEL_ID,values:values(angle)}});
    state=applyLearnedIngest(state,input,operationDigestFor(input),dependencies).state;
  }
  state=applyCommand(state,{type:'create-root',topicId:state.sourceLinks[0].topicId,originSourceId:state.sources[0].id,
    body:'Synthetic preserved account post'},actor,dependencies).state;
  return state;
}
function fixture(t) {
  const directory=mkdtempSync(path.join(tmpdir(),'murmingle-fixed-reference-storage-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const filename=path.join(directory,'canonical.sqlite'),state=oldState();
  const repository=createNormalizedSqliteRepository(filename,state);repository.close();
  return {filename,state};
}
const represent=source=>source.embedding.values;
test('explicit v4 conversion preserves all assignments, account posts, lineage and original policy stamps',t=>{
  const {filename,state}=fixture(t),before=structuredClone(state);
  let repository=createNormalizedSqliteRepository(filename,null,{readOnly:true});
  assert.equal(repository.storageFormat(),NORMALIZED_STORAGE_FORMAT);assert.deepEqual(repository.load(),before);repository.close();
  const after=migrateNormalizedReferenceStorage(filename,version(state),{represent});
  assert.equal(after.schema,FIXED_REFERENCE_STATE_SCHEMA);assert.deepEqual(version(after),{...version(state),revision:state.revision+1});
  assert.deepEqual(after.contributions,before.contributions);assert.deepEqual(after.discussions,before.discussions);assert.deepEqual(after.sourceLinks,before.sourceLinks);
  for(let index=0;index<after.sources.length;index++) {
    const {topicIds,...source}=after.sources[index];assert.deepEqual(source,before.sources[index]);
    assert.deepEqual(topicIds,[before.sourceLinks.find(link=>link.sourceId===source.id).topicId]);
  }
  repository=createNormalizedSqliteRepository(filename,null,{readOnly:true});
  assert.equal(repository.storageFormat(),NORMALIZED_FIXED_REFERENCE_STORAGE_FORMAT);assert.deepEqual(repository.load(),after);
  const membership=repository.readTopicMemberships({sourceId:after.sources[0].id});assert.deepEqual(membership.items,[{sourceId:after.sources[0].id,topicId:before.sourceLinks[0].topicId}]);
  assert.equal(repository.readTopicReferencesPage({limit:1}).items.length,1);repository.close();
  const raw=new DatabaseSync(filename,{readOnly:true});assert.equal(assertNormalizedCatalogSchema(raw),NORMALIZED_FIXED_REFERENCE_STORAGE_FORMAT);raw.close();
  const next=applyCommand(after,{type:'edit',contributionId:after.contributions[0].id,body:'Synthetic current v4 account post'},actor,
    {nextId:()=>{throw new Error('Unexpected ID');},now:()=>stamp}).state;
  assert.equal(next.schema,FIXED_REFERENCE_STATE_SCHEMA);assertValidPersistedState(next);
});
test('reference choice is earliest qualified provisional Source, never an automatic historical rematch',()=>{
  const state=oldState(),first=state.sources[0].id,second=state.sources[1].id;
  const migrated=migrateReferenceTopicState(state,{represent:source=>source.id===first?null:Float64Array.from(source.embedding.values)});
  const topic=migrated.topics.find(topic=>topic.id===state.sourceLinks[0].topicId);
  assert.equal(topic.reference.sourceId,second);assert.deepEqual(migrated.sourceLinks,state.sourceLinks);
  const allDisabled=migrateReferenceTopicState(state,{represent:()=>null});assert.ok(allDisabled.topics.every(topic=>topic.reference===null));
  assert.deepEqual(state,oldState(),'pure conversion never mutates its input');
});
test('overlapping mirrored memberships and recursive private-reference scopes preserve selected-only bodies',t=>{
  const {filename,state}=fixture(t);migrateNormalizedReferenceStorage(filename,version(state),{represent});
  const repository=createNormalizedSqliteRepository(filename,null);
  try {
    const before=repository.load(),after=structuredClone(before),source=after.sources[1];
    source.topicIds=after.topics.map(topic=>topic.id).sort();after.revision++;
    repository.save(version(before),after);
    const secondTopic=after.topics.find(topic=>topic.id!==after.sourceLinks[0].topicId).id;
    const read=repository.readTopicState(secondTopic);
    assert.ok(read.sources.some(value=>value.id===source.id));assert.equal(read.contributions.length,0);
    const scope=repository.readMetadataScope({sourceIds:[source.id]});assertValidPersistedState(scope,{largeScale:true});
    assert.equal(scope.contributions.length,0);assert.equal(scope.topics.length,after.topics.length);
    assert.equal(repository.readTopicMemberships({sourceId:source.id}).items.length,2);
    const next=structuredClone(scope);next.sources.find(value=>value.id===source.id).topicIds=[after.sourceLinks[1].topicId];next.revision++;
    repository.saveScoped(version(scope),scope,next);assert.equal(repository.readTopicMemberships({sourceId:source.id}).items.length,1);
    assert.deepEqual(repository.load().contributions,after.contributions);
  }finally{repository.close();}
});
test('disabled references erase witness vectors; reference replacement and schema downgrade fail closed',t=>{
  const {filename,state}=fixture(t);migrateNormalizedReferenceStorage(filename,version(state),{represent});
  const repository=createNormalizedSqliteRepository(filename,null);
  try {
    let before=repository.load(),changed=structuredClone(before);changed.revision++;
    const topic=changed.topics[0];topic.reference.values=values(.2);
    assert.throws(()=>repository.save(version(before),changed),error=>error.code==='conflict');
    const victim=before.sources[2].id;changed=structuredClone(before);changed.revision++;
    changed.sources=changed.sources.filter(source=>source.id!==victim);changed.sourceLinks=changed.sourceLinks.filter(link=>link.sourceId!==victim);
    for(const topic of changed.topics)if(topic.reference?.sourceId===victim)topic.reference=null;
    repository.save(version(before),changed);before=repository.load();assert.ok(!before.sources.some(source=>source.id===victim));
    assert.equal(before.topics.find(topic=>topic.id===state.sourceLinks[2].topicId).reference,null);
    changed=structuredClone(before);changed.schema='demo-state/v3';changed.revision++;
    for(const source of changed.sources)delete source.topicIds;for(const topic of changed.topics)delete topic.reference;
    assert.throws(()=>repository.save(version(before),changed),error=>error.code==='conflict');
    assert.deepEqual(repository.load(),before);
  }finally{repository.close();}
});
test('failed and stale explicit conversions retain v1 storage and any later accepted state',t=>{
  const {filename,state}=fixture(t);
  assert.throws(()=>migrateNormalizedReferenceStorage(filename,version(state),{represent,beforeCommit(){throw new Error('Synthetic rollback');}}));
  let repository=createNormalizedSqliteRepository(filename,null);assert.equal(repository.storageFormat(),NORMALIZED_STORAGE_FORMAT);assert.deepEqual(repository.load(),state);repository.close();
  let advanced=false;
  assert.throws(()=>migrateNormalizedReferenceStorage(filename,version(state),{represent:source=>{
    if(!advanced){advanced=true;const writer=createNormalizedSqliteRepository(filename,null);try{const current=writer.load(),next=structuredClone(current);next.revision++;writer.save(version(current),next);}finally{writer.close();}}
    return source.embedding.values;
  }}),error=>error.code==='conflict');
  repository=createNormalizedSqliteRepository(filename,null,{readOnly:true});assert.equal(repository.storageFormat(),NORMALIZED_STORAGE_FORMAT);
  assert.equal(repository.load().revision,state.revision+1);repository.close();
});
test('mirror corruption, unpinned coefficients and unknown relational objects never become read authority',t=>{
  const {filename,state}=fixture(t);const after=migrateNormalizedReferenceStorage(filename,version(state),{represent});
  const raw=new DatabaseSync(filename);raw.prepare('DELETE FROM canonical_topic_memberships WHERE source_id=?').run(after.sources[0].id);raw.close();
  assert.throws(()=>createNormalizedSqliteRepository(filename,null,{readOnly:true}),error=>error.code==='storage-corrupt');
  const malformed=structuredClone(after);malformed.topics[0].reference.parameterSha256='0'.repeat(64);assert.throws(()=>assertValidPersistedState(malformed));
  const omitted=structuredClone(after);delete omitted.sources[0].topicIds;assert.throws(()=>assertValidPersistedState(omitted));
});
test('v4 routing identity changes on secondary membership or disabled reference, never on posts/receipts',t=>{
  const {filename,state}=fixture(t);migrateNormalizedReferenceStorage(filename,version(state),{represent});
  const repository=createNormalizedSqliteRepository(filename,null);
  try {
    const initial=repository.readMatchingIdentity(),before=repository.load(),changed=structuredClone(before);
    changed.sources[1].topicIds=changed.topics.map(topic=>topic.id).sort();changed.revision++;
    repository.save(version(before),changed);const membership=repository.readMatchingIdentity();
    assert.equal(membership.grouping,initial.grouping);assert.equal(membership.ranking,initial.ranking);assert.notEqual(membership.routing,initial.routing);
    const disabled=structuredClone(changed);disabled.topics[0].reference=null;disabled.revision++;
    repository.save(version(changed),disabled);const reference=repository.readMatchingIdentity();
    assert.equal(reference.grouping,membership.grouping);assert.notEqual(reference.routing,membership.routing);
    const post=applyCommand(disabled,{type:'edit',contributionId:disabled.contributions[0].id,body:'Synthetic cache-current body'},actor,{now:()=>stamp,nextId:()=> 'unused'}).state;
    repository.save(version(disabled),post);const current=repository.readMatchingIdentity();
    for(const field of ['grouping','ranking','routing'])assert.equal(current[field],reference[field]);
  }finally{repository.close();}
});
test('v4 recovery image encrypts fixed reference vectors and preserves the exact live canonical file',async t=>{
  const dataDir=mkdtempSync(path.join(tmpdir(),'murmingle-fixed-backup-trust-'));
  t.after(()=>rmSync(dataDir,{recursive:true,force:true}));
  const state=migrateReferenceTopicState(oldState(),{represent}),filename=path.join(dataDir,'demo.sqlite');
  const repository=createNormalizedSqliteRepository(filename,state);repository.close();
  const before=readFileSync(filename);
  const protection={prepareDirectory:async directory=>mkdirSync(directory,{recursive:true,mode:0o700}),
    wrapKey:async key=>Buffer.from(key),unwrapKey:async key=>Buffer.from(key)};
  const options={dataDir,protection,now:stamp},result=await createCanonicalBackup(options);
  assert.equal(result.canonicalSchema,FIXED_REFERENCE_STATE_SCHEMA);assert.deepEqual(result.version,version(state));
  assert.equal(Date.parse(result.expiresAt)-Date.parse(result.createdAt),604800000);
  assert.deepEqual(await verifyCanonicalBackup({...options,filename:result.filename}),result);
  assert.deepEqual(readFileSync(filename),before);
  const ciphertext=readFileSync(path.join(dataDir,'canonical-migration-backups',result.filename));
  assert.equal(ciphertext.includes(Buffer.from(state.topics[0].reference.parameterSha256)),false);
  assert.equal(ciphertext.includes(Buffer.from('Synthetic preserved account post')),false);
});
test('secondary membership is never Source-anchored primary write authority',t=>{
  const {filename,state}=fixture(t);migrateNormalizedReferenceStorage(filename,version(state),{represent});
  const repository=createNormalizedSqliteRepository(filename,null);
  try {
    const before=repository.load(),after=structuredClone(before),root=after.contributions[0];after.revision++;
    const source=after.sources.find(source=>source.id===root.anchor.sourceId);source.topicIds=after.topics.map(topic=>topic.id).sort();
    root.discussionId=after.discussions.find(discussion=>discussion.topicId!==after.sourceLinks.find(link=>link.sourceId===source.id).topicId).id;
    assert.throws(()=>repository.save(version(before),after));assert.deepEqual(repository.load(),before);
  }finally{repository.close();}
});
test('new private fields reject accessors, malformed memberships and unrecognized relational objects',t=>{
  const {filename,state}=fixture(t),after=migrateReferenceTopicState(state,{represent});let hooks=0;
  for(const field of ['reference','topicIds']) {
    const changed=structuredClone(after),object=field==='reference'?changed.topics[0]:changed.sources[0];
    Object.defineProperty(object,field,{get(){hooks++;return field==='reference'?null:[];},enumerable:true});
    assert.throws(()=>assertValidPersistedState(changed));
  }
  assert.equal(hooks,0);
  for(const ids of [[],[after.sourceLinks[0].topicId,after.sourceLinks[0].topicId],['missing']]) {
    const changed=structuredClone(after);changed.sources[0].topicIds=ids;assert.throws(()=>assertValidPersistedState(changed));
  }
  const raw=new DatabaseSync(filename);raw.exec('CREATE TABLE unexpected_reference_extension(id TEXT)');raw.close();
  assert.throws(()=>createNormalizedSqliteRepository(filename,null,{readOnly:true}),error=>error.code==='storage-schema');
});
