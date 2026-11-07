// Diagnostic only. No SQL/native/filesystem work occurs at import time.
// Only an already verified, lifetime-counted owned connection may be supplied.
export const RESTORE_PROGRESS_SQL = `SELECT
 c.backends::text AS copy_backends,c.bytes::text AS copy_bytes,c.tuples::text AS copy_tuples,
 i.backends::text AS index_backends,i.blocks_total::text AS index_blocks_total,
 i.blocks_done::text AS index_blocks_done,i.tuples_total::text AS index_tuples_total,
 i.tuples_done::text AS index_tuples_done
 FROM (SELECT count(*) AS backends,coalesce(max(bytes_processed),0) AS bytes,
 coalesce(max(tuples_processed),0) AS tuples FROM pg_catalog.pg_stat_progress_copy
 WHERE datid=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database())) c
 CROSS JOIN (SELECT count(*) AS backends,coalesce(max(blocks_total),0) AS blocks_total,
 coalesce(max(blocks_done),0) AS blocks_done,coalesce(max(tuples_total),0) AS tuples_total,
 coalesce(max(tuples_done),0) AS tuples_done FROM pg_catalog.pg_stat_progress_create_index
 WHERE datid=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database())) i`;
const FIELDS=Object.freeze(['copy_backends','copy_bytes','copy_tuples','index_backends',
 'index_blocks_total','index_blocks_done','index_tuples_total','index_tuples_done']);
const refuse=()=>Object.assign(new Error('Restore diagnostic unavailable'),{code:'OWNED_RESTORE_DIAGNOSTIC'});
export function projectRestoreProgress(result){
 if(!Array.isArray(result?.rows)||result.rows.length!==1)throw refuse();
 const row=result.rows[0];
 if(!row||Object.keys(row).length!==FIELDS.length)throw refuse();
 const out={};
 for(const key of FIELDS){const value=row[key];
  if(typeof value!=='string'||!/^(?:0|[1-9][0-9]{0,18})$/u.test(value)||BigInt(value)>9223372036854775807n)throw refuse();
  out[key]=value;
 }
 if(BigInt(out.copy_backends)>32n||BigInt(out.index_backends)>32n)throw refuse();
 return Object.freeze(out);
}

/** No race claims physical retirement. The original query, write, timer and
 * close promises are joined before this wrapper settles. A diagnostic failure
 * never replaces an original restore error. Normal lifecycle checks still
 * refuse an unclosed client or unsettled physical work.
 */
export async function runWithRestoreProgress({connect,restore,openWriter,now,setTimeout,clearTimeout,report}){
 let client=null,writer=null,monitor=null,stopped=false,wake=null,primary=null,primaryFailed=false,closeFailed=false;
 Object.assign(report,{schema:'owned-restore-progress-summary/v1',samples:0,copyObserved:false,
  indexObserved:false,unavailable:false,sampleLimitReached:false,clientClosed:false,writerClosed:false});
 const epoch=now();let last=epoch;
 const elapsed=()=>{const n=now();if(!Number.isFinite(n)||n<last||n-epoch>360000)throw refuse();last=n;return Math.floor(n-epoch);};
 function pause(){return new Promise((resolve,reject)=>{let timer,done=false;
  const finish=()=>{if(done)return;done=true;wake=null;try{clearTimeout(timer);}catch{}resolve();};
  wake=finish;try{timer=setTimeout(finish,1000);}catch(error){done=true;wake=null;reject(error);}
 });}
 async function observe(){
  try{
   while(!stopped&&report.samples<300){
    const snapshot=projectRestoreProgress(await client.query(RESTORE_PROGRESS_SQL));
    const sample={schema:'owned-restore-progress-sample/v1',ordinal:report.samples,elapsedMs:elapsed(),...snapshot};
    await writer.write(sample);
    report.samples++;report.copyObserved ||= snapshot.copy_backends!=='0';report.indexObserved ||= snapshot.index_backends!=='0';
    if(!stopped&&report.samples<300)await pause();
   }
   report.sampleLimitReached=report.samples===300;
  }catch{report.unavailable=true;}
 }
 let value;
 try{
  try{
   client=await connect();
   await client.query('SET default_transaction_read_only=on');
   const readonly=await client.query("SELECT current_setting('default_transaction_read_only') AS readonly");
   if(readonly?.rows?.length!==1||readonly.rows[0].readonly!=='on')throw refuse();
   writer=await openWriter();monitor=observe();monitor.catch(()=>{});
  }catch{report.unavailable=true;}
  value=await restore();
 }catch(error){primary=error;primaryFailed=true;}
 finally{
  stopped=true;if(wake)wake();
  if(monitor)try{await monitor;}catch{report.unavailable=true;}
  if(writer)try{await writer.close();report.writerClosed=true;}catch{closeFailed=true;}
  if(client)try{await client.end();report.clientClosed=true;}catch{closeFailed=true;}
 }
 if(primaryFailed)throw primary;
 if(closeFailed)throw refuse();
 return value;
}
