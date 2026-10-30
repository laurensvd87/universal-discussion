import test from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';
import {LEGACY17_FINGERPRINT_TABLES,RESTORED17_TABLES,receiptFingerprintProfile} from './contract.js';
import {describeAutomaticTopicBackupTables} from '../../../src/ops/automatic-topics-backup-operator.js';
test('strict inventories cover actual migration DDL, including the independently missing preparation queue',async()=>{
 const directory=new URL('../../canonical-v4/migrations/',import.meta.url),before=new Set(['schema_migrations']),after=new Set();
 const index=await readFile(new URL('../../canonical-v4/index.js',import.meta.url),'utf8');
 assert.match(index,/CREATE TABLE IF NOT EXISTS canonical_v4\.schema_migrations/);
 for(const file of (await readdir(directory)).filter(name=>/^\d{3}.*\.sql$/u.test(name)).sort()){
  const version=Number(file.slice(0,3)),sql=await readFile(new URL(file,directory),'utf8');
  const names=[...sql.matchAll(/^CREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?canonical_v4\.([a-z_][a-z_0-9]*)/gimu)].map(m=>m[1]);
  for(const name of names){if(version<=17)before.add(name);else if(version===18)after.add(name);}
 }
 assert.equal(before.size,29);assert.equal(after.size,26);
 assert.deepEqual([...before].filter(name=>!Object.hasOwn(LEGACY17_FINGERPRINT_TABLES,name)),['semantic_preparation_requests']);
 assert.deepEqual(Object.keys(RESTORED17_TABLES).sort(),[...before].sort());
 assert.deepEqual(Object.keys(describeAutomaticTopicBackupTables()).sort(),[...after].sort());
});
test('only exact original28 or complete29 ordered receipt profiles are supported, without arbitrary table tolerance',()=>{
 const old=Object.keys(LEGACY17_FINGERPRINT_TABLES),full=Object.keys(RESTORED17_TABLES);
 assert.equal(receiptFingerprintProfile(old),'legacy28');assert.equal(receiptFingerprintProfile(full),'complete29');
 for(const bad of [full.slice(1),[...full,'other'],[...old,'other'],full.toReversed(),null,new Proxy(full,{})])assert.throws(()=>receiptFingerprintProfile(bad));
});
