// SOURCE-only owned-session adapter. Injected clients/guards are trusted test
// seams, not database selectors. No import opens a socket or starts a process.
import {types} from 'node:util';
const fail=code=>Object.assign(new Error('Owned native session refused'),{code});
function errorCode(error){
 try{if(error&&typeof error==='object'&&!types.isProxy(error)){
  const d=Object.getOwnPropertyDescriptor(error,'code');
  if(d&&Object.hasOwn(d,'value')&&typeof d.value==='string'&&/^[A-Z0-9_]{1,64}$/u.test(d.value))return d.value;
 }}catch{}return 'SESSION_CLEANUP_UNKNOWN';
}

/** One physical owned client, never a pool. Repository authority is granted
 * separately by its private no-options fixture factory, not by this seam. */
export function createExclusiveSession(client,guard){
 if(!client||typeof client.query!=='function'||typeof client.end!=='function'||typeof guard!=='function')throw fail('SESSION_DEPENDENCIES');
 let state='open',busy=false,closing=null,guarding=false;const pending=new Set(),cleanupFailures=[];
 function available(){
  if(state!=='open')throw fail('SESSION_UNAVAILABLE');if(guarding)throw fail('SESSION_GUARD_REENTRY');
  guarding=true;try{guard();}finally{guarding=false;}if(state!=='open')throw fail('SESSION_UNAVAILABLE');
 }
 function free(){available();if(busy)throw fail('SESSION_BUSY');}
 function checkArgs(sql,parameters){if(typeof sql!=='string'||!sql.length||!Array.isArray(parameters))throw fail('SESSION_QUERY_CONTRACT');}
 function physical(sql,parameters=[]){
  let p;try{p=Promise.resolve(client.query(sql,parameters));}catch(e){p=Promise.reject(e);}
  pending.add(p);p.then(()=>pending.delete(p),()=>pending.delete(p));return p;
 }
 async function query(sql,parameters=[]){
  checkArgs(sql,parameters);free();busy=true;
  try{return await physical(sql,parameters);}finally{busy=false;}
 }
 async function transaction(work,commit='COMMIT'){
  if(typeof work!=='function'||commit!=='COMMIT')throw fail('SESSION_TRANSACTION_CONTRACT');
  free();busy=true;let begun=false,lease=true,txBusy=false,hadPrimary=false,primary,result;
  const tx=Object.freeze({dialect:'pg',query:async(sql,parameters=[])=>{
   checkArgs(sql,parameters);available();if(!lease)throw fail('SESSION_RETIRED_LEASE');if(txBusy)throw fail('SESSION_QUERY_BUSY');
   txBusy=true;try{return await physical(sql,parameters);}finally{txBusy=false;}
  },exec:sql=>tx.query(sql)});
  try{
   await physical('BEGIN');begun=true;available();
   result=await work(tx);lease=false;
   if(pending.size||txBusy){state='poisoned';await Promise.allSettled([...pending]);throw fail('SESSION_UNAWAITED_QUERY');}
   available();const committed=await physical(commit);
   if(committed?.command!=='COMMIT')throw fail('SESSION_COMMIT_NOT_COMMITTED');
   begun=false;return result;
  }catch(error){
   hadPrimary=true;primary=error;lease=false;
   // Physical settlement precedes rollback. No reconnect, renewal or retry.
   if(pending.size){state='poisoned';await Promise.allSettled([...pending]);}
   if(begun){try{await physical('ROLLBACK');}catch(cleanup){state='poisoned';cleanupFailures.push(errorCode(cleanup));}}
   else state='poisoned';
  }finally{lease=false;busy=false;}
  if(hadPrimary)throw primary;
 }
 function close(){
  if(closing)return closing;if(state==='closed')return Promise.resolve();
  if(busy||pending.size)return Promise.reject(fail('SESSION_CLOSE_BUSY'));
  state='closing';closing=Promise.resolve().then(()=>client.end()).then(()=>{state='closed';},error=>{
   state='poisoned';cleanupFailures.push(errorCode(error));throw error;
  });return closing;
 }
 return {dialect:'pg',query,exec:sql=>query(sql),transaction,close,
  snapshot:()=>Object.freeze({state,pending:pending.size,busy,closed:state==='closed',cleanupFailures:Object.freeze([...cleanupFailures])})};
}
