// Pure checks only. No explicit screen, PGlite/WASM/session/model or data read.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {phaseFor,run,SETTINGS,FLOOR,adjacent,buildFixture,expectedMatches,scoreBits,vectorText,mockSqlFrom007,fastValidatorSqlFrom004,fastScanSqlFrom007,VALIDATION_CASES} from './run.js';

test('default inert and exact fixed phase/heap/resource bounds',async()=>{
 assert.equal(phaseFor([]),null);assert.equal((await run([])).status,'inert');assert.equal(phaseFor(['--run-isolated']),'run-isolated');
 for(const args of [['--run'],['--run-isolated','extra'],['--dataDir','D:/anything'],['--sizes','64'],['--repeats','10']])assert.throws(()=>phaseFor(args));
 let calls=0;assert.throws(()=>phaseFor(new Proxy([],{get(){calls++;throw Error();}})));assert.equal(calls,0);
 const accessor=[];Object.defineProperty(accessor,'0',{enumerable:true,get(){calls++;throw Error();}});assert.throws(()=>phaseFor(accessor));assert.equal(calls,0);
 assert.deepEqual(SETTINGS.sizes,[64,256,1024]);assert.equal(SETTINGS.maxReferences,1024);assert.equal(SETTINGS.repeats,3);
 assert.equal(SETTINGS.cpuLimitMs,30000);assert.equal(SETTINGS.heapMiB,256);
});

test('fully validated invented fixtures retain threshold neighbors/ties/exact signed-zero literals',()=>{
 assert.equal(adjacent(FLOOR,-1)<FLOOR,true);assert.equal(adjacent(FLOOR,1)>FLOOR,true);
 for(const count of SETTINGS.sizes){
  const f=buildFixture(count),matches=expectedMatches(f);assert.equal(f.rows.length,count);assert.equal(matches.length,count/2);
  assert.equal(matches.some(x=>x.topic_id==='topic-cost-0000'),false);assert.equal(matches.some(x=>x.topic_id==='topic-cost-0001'),true);
  assert.equal(matches.find(x=>x.topic_id==='topic-cost-0001').similarity_bits,scoreBits(FLOOR));
  assert.equal(matches.find(x=>x.topic_id==='topic-cost-0003').similarity_bits,matches.find(x=>x.topic_id==='topic-cost-0004').similarity_bits);
  assert.ok(Object.is(JSON.parse(f.rows[0].referencePayload).values[2],-0));assert.ok(Object.is(JSON.parse(f.rows[0].topicPayload).reference.values[2],-0));
  assert.match(f.rows[0].valuesText,/,-0,/u);assert.match(vectorText(f.candidate),/,-0,/u);
  assert.ok(Buffer.byteLength(JSON.stringify(f.rows))<=8*1024*1024,'full1024 fixture must fit the bounded seed transport');
  assert.equal(new Set(f.rows.map(r=>r.sourceId)).size,count);assert.equal(new Set(f.rows.map(r=>r.operationId)).size,count);
 }
 for(const count of [-1,0,63,1025,Infinity])assert.throws(()=>buildFixture(count));
});

test('mock is exactly007 with only function/table rename and stored-reference validation removed',async()=>{
 const sql=await readFile(new URL('../../migrations/007-exact-ridge-scan-single-pass.sql',import.meta.url),'utf8'),mock=mockSqlFrom007(sql);
 assert.ok(mock.includes("OR NOT canonical_v4.ingest_valid_unit_vector(candidate)"));
 assert.ok(!mock.includes('Invalid stored Ridge reference'));assert.ok(mock.includes('ridge_cost_screen.mock_projection AS reference'));
 for(const fragment of ['dot_value := dot_value + candidate[axis]*reference_values[axis];','FOR axis IN 1..384 LOOP',
  'ORDER BY reference.topic_id COLLATE "C"','dot_value := greatest(-1.0,least(1.0,dot_value));','0.8639003810829322::double precision'])assert.ok(mock.includes(fragment));
 assert.throws(()=>mockSqlFrom007(sql.replace('Invalid stored Ridge reference','changed')));
 assert.throws(()=>mockSqlFrom007(sql+'\n'+sql));
});

test('ordered finite validator preserves all non-text arithmetic/shape guards and retains stored checks in fast scan',async()=>{
 const source=await readFile(new URL('../../migrations/004-ingestion-foundation.sql',import.meta.url),'utf8'),fast=fastValidatorSqlFrom004(source);
 assert.ok(!fast.includes('coordinate::text'));assert.ok(!fast.includes('norm_squared::text'));
 assert.ok(fast.includes("coordinate > '-Infinity'::double precision AND coordinate < 'Infinity'::double precision"));
 for(const fragment of ['candidate IS NULL OR array_ndims(candidate) <> 1','array_lower(candidate,1) <> 1 OR array_upper(candidate,1) <> 384',
  'norm_squared := norm_squared + coordinate*coordinate;','RETURN abs(sqrt(norm_squared)-1.0) <= 0.000001;','coordinate IS NULL'])assert.ok(fast.includes(fragment));
 const original=await readFile(new URL('../../migrations/007-exact-ridge-scan-single-pass.sql',import.meta.url),'utf8'),scan=fastScanSqlFrom007(original);
 assert.ok(scan.includes('Invalid stored Ridge reference'));assert.ok(scan.includes('canonical_v4.fixed_references AS reference'));
 assert.ok(scan.includes('ridge_cost_screen.fast_valid_unit_vector(reference_values)'));
 assert.ok(scan.includes('dot_value := dot_value + candidate[axis]*reference_values[axis];'));
 assert.ok(scan.includes("dot_value::text IN ('NaN','Infinity','-Infinity')"));
 assert.throws(()=>fastValidatorSqlFrom004(source.replace('rendered := coordinate::text;','changed;')));
 assert.equal(new Set(VALIDATION_CASES.map(x=>x.label)).size,VALIDATION_CASES.length);
 for(const label of ['signed-zero','nan','positive-infinity','negative-infinity','empty','null-array','null-coordinate','non-one-lower-bound','multidimensional','subnormal','underflow-product','overflow-product'])
  assert.ok(VALIDATION_CASES.some(x=>x.label===label));
 assert.equal(VALIDATION_CASES.filter(x=>x.label.startsWith('tolerance-edge-')).length,6);
});
