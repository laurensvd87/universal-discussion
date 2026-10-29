// Inert real PostgreSQL assertions. Only the maintained owned native composition
// supplies this database. No live connection, model, Source or provider requests.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPublicSubjectRegistry,preparePublicWikipediaSubjects} from '../canonical-v4/public-subject-registry.js';
import names from './public-subject-native-cases.json' with {type:'json'};
export const PUBLIC_SUBJECT_NATIVE_CASES=Object.freeze([...names]);
const subject=(id,title,description,titles)=>({id,type:'item',lastrevid:123,labels:{mul:{language:'mul',value:title}},
 descriptions:{en:{language:'en',value:description}},sitelinks:Object.fromEntries(Object.entries(titles).map(([site,title])=>[site,{site,title}]))});
const raw=()=>JSON.stringify({entities:{
 Q101:subject('Q101','Atlas','invented programming language',{enwiki:'Atlas (programming language)',dewiki:'Atlas (Programmiersprache)'}),
 Q202:subject('Q202','Atlas','invented mountain range',{enwiki:'Atlas Mountains',dewiki:'Atlas (Gebirge)'}),
}});
const code=expected=>error=>error?.code===expected;
const state=async db=>(await db.query(`SELECT
 (SELECT jsonb_agg(to_jsonb(s) ORDER BY provider_key) FROM canonical_v4.public_subjects s) subjects,
 (SELECT jsonb_agg(to_jsonb(v) ORDER BY subject_id,revision) FROM canonical_v4.public_subject_versions v) versions,
 (SELECT jsonb_agg(to_jsonb(l) ORDER BY site,title) FROM canonical_v4.public_subject_sitelinks l) links`)).rows[0];

export async function runPublicSubjectNativeAssertions({database,cases}){
 const registry=createPublicSubjectRegistry({database});let ids;
 const test=async(index,fn)=>{const row={name:names[index],status:'running'};cases.push(row);try{await fn();row.status='passed';}catch(error){row.status='failed';throw error;}};
 await test(0,async()=>{
  const absent=await database.query("SELECT to_regclass('canonical_v4.public_subjects') AS value");assert.equal(absent.rows[0].value,null);
  await database.exec(await readFile(new URL('../canonical-v4/drafts/public-subject-registry.sql',import.meta.url),'utf8'));
  const s=await state(database);assert.equal(s.subjects,null);assert.equal(s.versions,null);assert.equal(s.links,null);
 });
 await test(1,async()=>{
  ids=await registry.importWikipedia(raw());assert.equal(ids.length,2);assert.notEqual(ids[0].subjectId,ids[1].subjectId);
  const en=await registry.byWikipediaTitle('enwiki','Atlas (programming language)'),de=await registry.byWikipediaTitle('dewiki','Atlas (Programmiersprache)','de'),other=await registry.byWikipediaTitle('enwiki','Atlas Mountains');
  assert.equal(en.subjectId,de.subjectId);assert.notEqual(en.subjectId,other.subjectId);assert.equal(en.label,other.label);assert.notEqual(en.description,other.description);assert.equal(de.labelLanguage,'mul');
 });
 await test(2,async()=>{
  const before=await state(database),different=JSON.parse(raw());different.entities={Q202:different.entities.Q202,Q101:different.entities.Q101};
  different.entities.Q101.sitelinks=Object.fromEntries(Object.entries(different.entities.Q101.sitelinks).reverse());
  assert.notEqual(preparePublicWikipediaSubjects(raw()).responseHash,preparePublicWikipediaSubjects(JSON.stringify(different)).responseHash);
  assert.deepEqual(await registry.importWikipedia(JSON.stringify(different)),ids);assert.deepEqual(await state(database),before);
 });
 const changed=JSON.parse(raw());changed.entities.Q101.lastrevid=124;changed.entities.Q101.labels.mul.value='Atlas language';changed.entities.Q101.sitelinks.enwiki.title='Atlas language';
 await test(3,async()=>{
  const next=await registry.importWikipedia(JSON.stringify(changed));assert.equal(next[0].subjectId,ids[0].subjectId);
  assert.equal(await registry.byWikipediaTitle('enwiki','Atlas (programming language)'),null);
  const current=await registry.byWikipediaTitle('enwiki','Atlas language');assert.equal(current.label,'Atlas language');assert.equal(current.revision,'124');
  const s=await state(database);assert.equal(s.versions.length,3);assert.equal(s.subjects.length,2);
  assert.equal(s.versions.find(v=>v.subject_id===ids[0].subjectId&&v.revision===123).record.labels.mul,'Atlas');
 });
 await test(4,async()=>{
  const before=await state(database);await assert.rejects(registry.importWikipedia(raw()),code('P1261'));
  const conflict=structuredClone(changed);conflict.entities.Q101.labels.mul.value='Conflicting label';
  await assert.rejects(registry.importWikipedia(JSON.stringify(conflict)),code('P1261'));assert.deepEqual(await state(database),before);
 });
 await test(5,async()=>{
  const before=await state(database),collision=structuredClone(changed);collision.entities.Q101.lastrevid=125;collision.entities.Q101.labels.mul.value='Must roll back';
  // Q202 already owns this title in PostgreSQL. It must be absent from this
  // incoming batch: duplicating its sitelink inside one API response would be
  // rejected by provider validation before the SQL rollback boundary is tested.
  delete collision.entities.Q202;
  collision.entities.Q404=subject('Q404','Another entity','invented collision',{enwiki:'Atlas Mountains'});
  await assert.rejects(registry.importWikipedia(JSON.stringify(collision)),code('P1261'));assert.deepEqual(await state(database),before);
 });
 await test(6,async()=>{
  for(const role of ['murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker']){
   for(const sql of ['SELECT * FROM canonical_v4.public_subjects',
    "INSERT INTO canonical_v4.public_subjects(provider_key,current_revision) VALUES('Q999',1)",
    'UPDATE canonical_v4.public_subjects SET current_revision=1 WHERE false',
    'DELETE FROM canonical_v4.public_subjects WHERE false'])
    await assert.rejects(database.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query(sql);}),code('42501'));
   await assert.rejects(database.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await createPublicSubjectRegistry({database:tx}).importWikipedia(JSON.stringify(changed));}),code('42501'));
   if(role!=='murmingle_app')await assert.rejects(database.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await createPublicSubjectRegistry({database:tx}).byWikipediaTitle('enwiki','Atlas language');}),code('42501'));
  }
  await database.transaction(async tx=>{await tx.exec('SET LOCAL ROLE murmingle_app');assert.equal((await createPublicSubjectRegistry({database:tx}).byWikipediaTitle('enwiki','Atlas language')).subjectId,ids[0].subjectId);});
 });
 await test(7,async()=>{
  const before=await state(database),request=preparePublicWikipediaSubjects(JSON.stringify(changed));
  for(const value of [null,[],[{}],[{...request.records[0],revision:'0'}],[{...request.records[0],labels:{en:'bad\u202econtrol'}}]])
   await assert.rejects(database.query('SELECT canonical_v4.subject_import_wikipedia($1,$2::jsonb)',[request.responseHash,JSON.stringify(value)]),code('P1263'));
  assert.deepEqual(await state(database),before);
  await database.exec(`DROP FUNCTION canonical_v4.subject_import_wikipedia(text,jsonb),canonical_v4.subject_read_wikipedia(text,text,text);
   DROP TABLE canonical_v4.public_subject_sitelinks;
   ALTER TABLE canonical_v4.public_subjects DROP CONSTRAINT public_subject_current_version;
   DROP TABLE canonical_v4.public_subject_versions;DROP TABLE canonical_v4.public_subjects;`);
  assert.equal((await database.query("SELECT to_regclass('canonical_v4.public_subjects') AS value")).rows[0].value,null);
 });
}
