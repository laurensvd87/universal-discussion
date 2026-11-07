import test from 'node:test';import assert from 'node:assert/strict';
import {runWithRestoreProgress,projectRestoreProgress,RESTORE_PROGRESS_SQL} from './restore-progress.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const row=(extra={})=>({copy_backends:'0',copy_bytes:'0',copy_tuples:'0',index_backends:'0',
 index_blocks_total:'0',index_blocks_done:'0',index_tuples_total:'0',index_tuples_done:'0',...extra});
function fixture({query,write,closeClient,closeWriter,connect,openWriter}={}){
 const report={},events=[],restore=deferred(),timers=new Set();let n=0;
 const client={async query(sql){events.push(sql===RESTORE_PROGRESS_SQL?'query':sql);
  if(sql===RESTORE_PROGRESS_SQL)return query?query():{rows:[row({copy_backends:'1',copy_bytes:'9999999999999999'})]};
  return {rows:[{readonly:'on'}]};},async end(){events.push('client-close');if(closeClient)await closeClient();}};
 const writer={async write(v){events.push(v);if(write)await write(v);},async close(){events.push('writer-close');if(closeWriter)await closeWriter();}};
 const config={report,now:()=>n++,setTimeout(fn){timers.add(fn);return fn;},clearTimeout(fn){timers.delete(fn);},
  connect:connect??(async()=>client),openWriter:openWriter??(async()=>writer),restore:()=>{events.push('restore');return restore.promise;}};
 return {report,events,timers,restore,config};
}
test('projection retains exact int64 strings, rejects raw fields, negatives, unsafe numbers and overflow',()=>{
 assert.equal(projectRestoreProgress({rows:[row({copy_bytes:'9223372036854775807'})]}).copy_bytes,'9223372036854775807');
 for(const value of ['-1','01','9223372036854775808','1.5',3,null])assert.throws(()=>projectRestoreProgress({rows:[row({copy_bytes:value})]}));
 assert.throws(()=>projectRestoreProgress({rows:[{...row(),query:'secret'}]}));
 assert.throws(()=>projectRestoreProgress({rows:[]}));assert.throws(()=>projectRestoreProgress({rows:[row({index_backends:'33'})]}));
 assert.ok(!RESTORE_PROGRESS_SQL.includes('pg_stat_activity'));assert.ok(!RESTORE_PROGRESS_SQL.includes('query_text'));
});
test('original restore success joins a pending original query and closes both resources',async()=>{
 const pending=deferred(),f=fixture({query:()=>pending.promise});let settled=false;
 const run=runWithRestoreProgress(f.config).finally(()=>{settled=true;});await turn();
 f.restore.resolve({closed:true});await turn();assert.equal(settled,false);assert.ok(!f.events.includes('client-close'));
 pending.resolve({rows:[row({index_backends:'1',index_tuples_done:'42'})]});
 assert.deepEqual(await run,{closed:true});assert.equal(f.report.indexObserved,true);assert.equal(f.report.samples,1);
 assert.equal(f.report.writerClosed,true);assert.equal(f.report.clientClosed,true);assert.equal(f.timers.size,0);
});
test('original restore failure survives diagnostic query/write/close failures without raw error retention',async()=>{
 for(const kind of ['query','write','closeClient','closeWriter']){
  const secret=Error('private SQL and contents'),options={[kind]:async()=>{throw secret;}},f=fixture(options),original=Error('original restore failure');
  const run=runWithRestoreProgress(f.config);const observed=run.catch(e=>e);await turn();f.restore.reject(original);
  assert.equal(await observed,original);assert.ok(!JSON.stringify(f.report).includes('private SQL'));
  assert.ok(f.events.includes('client-close'));assert.ok(f.events.includes('writer-close'));
 }
});
test('diagnostic startup/query unavailability does not replace successful restore; owned close failure still refuses success',async()=>{
 for(const kind of ['connect','openWriter','query']){
  const f=fixture({[kind]:async()=>{throw Error('unavailable');}}),run=runWithRestoreProgress(f.config);await turn();f.restore.resolve(7);
  assert.equal(await run,7);assert.equal(f.report.unavailable,true);
 }
 const f=fixture({closeClient:async()=>{throw Error('not closed');}}),run=runWithRestoreProgress(f.config);await turn();f.restore.resolve(7);
 await assert.rejects(run,{code:'OWNED_RESTORE_DIAGNOSTIC'});assert.equal(f.report.clientClosed,false);
});
test('pending original write and close are joined, and a live pause is cancelled rather than abandoned',async()=>{
 const write=deferred(),close=deferred(),f=fixture({write:()=>write.promise,closeWriter:()=>close.promise});let settled=false;
 const run=runWithRestoreProgress(f.config).finally(()=>{settled=true;});await turn();f.restore.resolve(8);await turn();assert.equal(settled,false);
 write.resolve();await turn();assert.equal(settled,false);assert.ok(!f.events.includes('client-close'));close.resolve();assert.equal(await run,8);
 const g=fixture(),second=runWithRestoreProgress(g.config);await turn();assert.equal(g.timers.size,1);g.restore.resolve(9);
 assert.equal(await second,9);assert.equal(g.timers.size,0);
});
