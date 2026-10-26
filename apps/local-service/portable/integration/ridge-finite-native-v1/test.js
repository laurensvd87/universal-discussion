// Pure invented geometry/source checks. Never invoke the explicit native phase.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {createRequire,isBuiltin} from 'node:module';
import {dirname,resolve,relative,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {phaseFor,run,SETTINGS,SOURCE_KEYS,BINARY_PINS,MIGRATIONS,validateFreeze,denseVector,familyChunk,allScoreSql} from './run.js';
import {buildFixture,FLOOR,adjacent,scoreBits} from '../../canonical-v4/experimental/ridge-validation-cost-screen-v1/run.js';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),H='a'.repeat(64);
test('default inert/no native import or callback; fixed phase rejects hostile/extra args',async()=>{
 assert.equal((await run([])).databaseAccess,false);assert.equal(phaseFor([]),null);assert.equal(phaseFor(['--run-isolated-server']),'native');
 for(const a of [['--run-isolated'],['--run-isolated-server','extra'],['--port','55432'],['--database','owner']])assert.throws(()=>phaseFor(a));
 let calls=0;assert.throws(()=>phaseFor(new Proxy([],{get(){calls++;throw Error();}})));assert.equal(calls,0);
 const a=[];Object.defineProperty(a,'0',{enumerable:true,get(){calls++;throw Error();}});assert.throws(()=>phaseFor(a));assert.equal(calls,0);
 await assert.rejects(run(['--fit']));
});
test('source freeze exact settings/binary/map/hash fences use invented metadata only',()=>{
 const sources={invented:H},body={schema:'ridge-finite-native-source-freeze/v1',sourceHashes:sources,binaryHashes:BINARY_PINS,settings:SETTINGS};
 const freeze={...body,freezeHash:digest(body)};assert.equal(validateFreeze(freeze,sources),freeze);
 for(const change of [x=>x.extra=true,x=>x.freezeHash=H,x=>x.binaryHashes={},x=>x.settings={...SETTINGS,treeMemoryMiB:1024},x=>x.sourceHashes={other:H}]){
  const x=structuredClone(freeze);change(x);assert.throws(()=>validateFreeze(x,sources));}
 let calls=0;const accessor={...freeze};Object.defineProperty(accessor,'sourceHashes',{enumerable:true,get(){calls++;throw Error();}});
 assert.throws(()=>validateFreeze(accessor,sources));assert.throws(()=>validateFreeze(new Proxy({},{getPrototypeOf(){calls++;throw Error();}}),sources));assert.equal(calls,0);
});
test('dense construction preserves exact first-coordinate neighbors and signed zero with sequential unit guard',()=>{
 for(const c of [adjacent(FLOOR,-1),FLOOR,adjacent(FLOOR,1),1,-1,0,.5])for(const seed of [0,7,1023]){
  const v=denseVector(c,seed);assert.equal(v.length,384);assert.equal(scoreBits(v[0]),scoreBits(c));assert.ok(Object.is(v[2],-0));
  let norm=0;for(const n of v){assert.ok(Number.isFinite(n));norm+=n*n;}assert.ok(Math.abs(Math.sqrt(norm)-1)<=.000001);
  if(Math.abs(c)<1)assert.equal(v.filter(n=>n!==0).length,c===0?382:383);
 }
 for(const [c,seed]of [[NaN,0],[Infinity,0],[1.1,0],[0,-1],[0,1024]])assert.throws(()=>denseVector(c,seed));
});
test('all six views cover1024 stored Sources in bounded32-row chunks without dense graph/clipping',t=>{
 const base=buildFixture(1024).rows;let maximum=0;
 for(const family of SETTINGS.families)for(const activeCount of SETTINGS.sizes){let active=0,total=0;const ids=new Set();
  for(let start=0;start<1024;start+=32){const rows=familyChunk(base,family,activeCount,start);assert.equal(rows.length,32);
   const bytes=Buffer.byteLength(JSON.stringify(rows));assert.ok(bytes<=2097152);maximum=Math.max(maximum,bytes);
   for(const r of rows){total++;assert.ok(!ids.has(r.topicId));ids.add(r.topicId);const topic=JSON.parse(r.topicPayload),ref=JSON.parse(r.referencePayload);
    if(r.sourceId!==null){active++;assert.deepEqual(topic.reference,ref);assert.ok(Object.is(ref.values[2],-0));assert.match(r.valuesText,/,-0,/u);}
    else {assert.equal(ref,null);assert.equal(topic.reference,null);assert.equal(r.parameter,null);assert.equal(r.valuesText,null);}
   }
  }assert.equal(total,1024);assert.equal(active,activeCount);assert.equal(ids.size,1024);
 }
 t.diagnostic('Maximum invented32-row serialized view chunk: '+maximum+' / 2097152 bytes');
 for(const start of [-1,1,1024])assert.throws(()=>familyChunk(base,'dense',64,start));
});
test('all-score diagnostics change only threshold branch/name; original acceptance source remains immutable',async()=>{
 const source=await readFile(new URL('../../canonical-v4/migrations/007-exact-ridge-scan-single-pass.sql',import.meta.url),'utf8');
 for(const fast of [false,true]){const trace=allScoreSql(source,fast);assert.ok(trace.includes('IF true THEN'));assert.ok(trace.includes('Invalid stored Ridge reference'));
  assert.ok(trace.includes('dot_value := dot_value + candidate[axis]*reference_values[axis];'));assert.ok(trace.includes('canonical_v4.fixed_references AS reference'));
  assert.ok(trace.includes('dot_value := greatest(-1.0,least(1.0,dot_value));'));assert.ok(trace.includes(fast?'ridge_cost_screen.fast_valid_unit_vector(reference_values)':'canonical_v4.ingest_valid_unit_vector(reference_values)'));
 }
 assert.ok(source.includes('IF dot_value >= 0.8639003810829322::double precision THEN'));assert.throws(()=>allScoreSql(source.replace('0.8639003810829322','0.8')));
});
test('Node/Python literal closure/resources and Job CPU accounting/handshake/cleanup source contracts align',async()=>{
 const py=await readFile(new URL('./supervise.py',import.meta.url),'utf8'),js=await readFile(new URL('./run.js',import.meta.url),'utf8');
 assert.deepEqual(JSON.parse(py.slice(py.indexOf('SOURCE_NAMES = ')+15,py.indexOf('\nBINARY_PINS = '))),SOURCE_KEYS);
 assert.deepEqual(JSON.parse(py.slice(py.indexOf('BINARY_PINS = ')+14,py.indexOf('\nSETTINGS = '))),BINARY_PINS);
 assert.deepEqual(JSON.parse(py.slice(py.indexOf('SETTINGS = ')+11,py.indexOf('\nMIB = '))),SETTINGS);
 assert.equal(SOURCE_KEYS.length,112);assert.equal(new Set(SOURCE_KEYS).size,112);assert.deepEqual([...SOURCE_KEYS].sort(),SOURCE_KEYS);
 for(const name of MIGRATIONS)assert.ok(SOURCE_KEYS.includes('apps/local-service/portable/canonical-v4/migrations/'+name));
 assert.ok(SOURCE_KEYS.includes('decisions/ADR-146-exact-ridge-validation-performance.md'));assert.equal(Object.keys(BINARY_PINS).length,6);
 assert.ok(SOURCE_KEYS.every(x=>!/(?:accounts\.sqlite|root-model\.json|model\.onnx|output-test)/u.test(x)));
 assert.ok(js.indexOf('await handshake()')<js.indexOf("await import('../hierarchy-shadow-isolated-postgres.js')"));
 assert.ok(py.indexOf('AssignProcessToJobObject(job, handle)')<py.indexOf("child.stdin.write(b'RIDGE_NATIVE_OWN_JOB_ASSIGNED_V1"));
 assert.ok(py.includes('handle = kernel.OpenProcess(0x1000 | 0x0100 | 0x0001, False, child.pid)')); // QUERY_LIMITED_INFORMATION + SET_QUOTA + TERMINATE
 assert.ok(py.indexOf('    checked(RUN_PARENT)\nbaseline =')>=0); // never enumerate an unchecked parent
 assert.ok(py.includes('QueryInformationJobObject(job, 1, ctypes.byref(a)'));assert.ok(py.includes('return (user_ticks + kernel_ticks) / 10_000_000'));
 assert.ok(py.includes("('totalUserTime', 'totalKernelTime', 'periodUserTime', 'periodKernelTime')"));
 assert.ok(py.includes('kernel.TerminateJobObject(job, 1)'));assert.ok(!py.includes('taskkill'));assert.ok(!py.includes('pg_terminate_backend'));
 assert.ok(py.includes("'TEMP': str(temp), 'TMP': str(temp)"));assert.ok(py.includes('MEMORY_LIMIT, CPU_SECONDS, WALL_SECONDS, ACTIVE_SECONDS = 768 * MIB, 60, 180, 150'));
});

test('literal pins cover the resolved installed pg transport/pool runtime without executing package code',()=>{
 const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../../../..');
 const require=createRequire(join(repo,'apps/local-service/portable/src/database.js'));
 const entry=require.resolve('pg'),pgRoot=dirname(dirname(entry));
 const pending=[entry,join(pgRoot,'esm/index.mjs')],seen=new Set(),metadata=new Set(),excluded=new Set();
 while(pending.length){
  const file=pending.pop();if(seen.has(file))continue;seen.add(file);
  let directory=dirname(file);
  while(directory!==dirname(directory)&&!existsSync(join(directory,'package.json')))directory=dirname(directory);
  if(existsSync(join(directory,'package.json')))metadata.add(join(directory,'package.json'));
  const source=readFileSync(file,'utf8'),localRequire=createRequire(file);
  for(const match of source.matchAll(/(?:require\s*\(\s*|from\s*|import\s*\(\s*)(['"])([^'"]+)\1/g)){
   const spec=match[2];if(isBuiltin(spec))continue;
   if(spec==='pg-native'||spec==='pg-cloudflare'){excluded.add(spec);continue;}
   const target=localRequire.resolve(spec);
   if(target.includes(sep+'pg'+sep+'lib'+sep+'native')){excluded.add('pg-native-branch');continue;}
   if(/\.(?:m?js|json)$/.test(target))pending.push(target);
  }
 }
 const keys=[...new Set([...seen,...metadata])].map(f=>relative(repo,f).replaceAll('\\','/')).sort();
 assert.equal(keys.length,49);assert.deepEqual([...excluded].sort(),['pg-cloudflare','pg-native-branch']);
 for(const key of keys)assert.ok(SOURCE_KEYS.includes(key),'Missing resolved runtime pin: '+key);
 assert.equal(SOURCE_KEYS.filter(key=>key.includes('/node_modules/')).length,58);
});
