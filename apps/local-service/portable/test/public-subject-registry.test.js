import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePublicWikipediaSubjects,createPublicSubjectRegistry} from '../canonical-v4/public-subject-registry.js';

const subjectId='12345678-1234-4123-8123-123456789abc';
const raw=()=>JSON.stringify({entities:{Q101:{id:'Q101',type:'item',lastrevid:123,
 labels:{en:{language:'en',value:'Atlas'},mul:{language:'mul',value:'Atlas'}},
 descriptions:{en:{language:'en',value:'programming language'}},
 sitelinks:{enwiki:{site:'enwiki',title:'Atlas (programming language)'}}}}});

test('public import sends normalized entity meaning separately from its response witness',async()=>{
 let calls=0;
 const registry=createPublicSubjectRegistry({database:{async query(sql,args){
  calls++;assert.equal(sql,'SELECT canonical_v4.subject_import_wikipedia($1,$2::jsonb) AS result');
  assert.match(args[0],/^[a-f0-9]{64}$/u);const records=JSON.parse(args[1]);
  assert.deepEqual(records,[{providerKey:'Q101',revision:'123',labels:{en:'Atlas',mul:'Atlas'},descriptions:{en:'programming language'},sitelinks:[{site:'enwiki',title:'Atlas (programming language)'}]}]);
  return {rows:[{result:[{providerKey:'Q101',revision:'123',subjectId}]}]};
 }}});
 assert.deepEqual(await registry.importWikipedia(raw()),[{providerKey:'Q101',revision:'123',subjectId}]);assert.equal(calls,1);
 const other=JSON.parse(raw());other.entities.Q101.lastrevid=124;
 assert.notEqual(preparePublicWikipediaSubjects(raw()).responseHash,preparePublicWikipediaSubjects(JSON.stringify(other)).responseHash);
});

test('labels never manufacture persistent IDs and unavailable batches never execute SQL',async()=>{
 let calls=0;const registry=createPublicSubjectRegistry({database:{async query(){calls++;throw Error();}}});
 for(const value of ['{"entities":{}}','{"entities":{"Q101":{"missing":""}}}','not-json'])await assert.rejects(registry.importWikipedia(value),TypeError);
 assert.equal(calls,0);assert(!Object.hasOwn(preparePublicWikipediaSubjects(raw()).records[0],'subjectId'));
});

test('duplicate, missing, changed revision or malformed stored IDs fail rather than granting a stable subject',async()=>{
 for(const result of [[{providerKey:'Q101',revision:'124',subjectId}],[],[{providerKey:'Q999',revision:'123',subjectId}],
  [{providerKey:'Q101',revision:'123',subjectId:'Atlas'}],[{providerKey:'Q101',revision:'123',subjectId,sourceId:'forged'}]]){
  const registry=createPublicSubjectRegistry({database:{async query(){return {rows:[{result}]};}}});
  await assert.rejects(registry.importWikipedia(raw()),TypeError);
 }
});

test('exact local lookup is parameterized and absence remains unresolved',async()=>{
 const registry=createPublicSubjectRegistry({database:{async query(sql,args){
  assert.equal(sql,'SELECT canonical_v4.subject_read_wikipedia($1,$2,$3) AS result');
  assert.deepEqual(args,['dewiki',"Atlas ' (Programmiersprache)",'de']);return {rows:[{result:null}]};
 }}});
 assert.equal(await registry.byWikipediaTitle('dewiki',"Atlas ' (Programmiersprache)",'de'),null);
});

test('lookup returns a translated or mul label and separate disambiguation without posting authority',async()=>{
 const row={subjectId,providerKey:'Q101',revision:'123',articleTitle:'Atlas (programming language)',label:'Atlas',labelLanguage:'mul',description:'programming language',descriptionLanguage:'en'};
 const registry=createPublicSubjectRegistry({database:{async query(){return {rows:[{result:row}]};}}});
 assert.deepEqual(await registry.byWikipediaTitle('enwiki',row.articleTitle),row);assert(Object.isFrozen(row));
 assert(!Object.hasOwn(row,'assignmentAuthority'));assert(!Object.hasOwn(row,'discussionId'));
});

test('unsupported site, language, noncanonical title and invalid database projections fail',async()=>{
 let calls=0;const registry=createPublicSubjectRegistry({database:{async query(){calls++;return {rows:[{result:{}}]};}}});
 for(const args of [['evilwiki','Atlas'],['enwiki',' Atlas'],['enwiki','Atlas','fr'],['enwiki','Atlas\n'],['enwiki','Cafe\u0301']])await assert.rejects(registry.byWikipediaTitle(...args),TypeError);
 assert.equal(calls,0);await assert.rejects(registry.byWikipediaTitle('enwiki','Atlas'),TypeError);assert.equal(calls,1);
});
