/* Inert fixed-client seam derived from the immutable ADR175 establishment implementation. */
import {types} from 'node:util';
const DATABASES=Object.freeze(['murmingle_hierarchy_fixture_20261026_a','murmingle_hierarchy_fixture_20261026_b']);
const ROLES=new Set(['postgres','murmingle_app','murmingle_crawler_submitter','murmingle_ingest_worker']);
const FIELDS=['applicationName','database','lockTimeoutMs','role','statementTimeoutMs'];
export const FIXED_CLIENT_LIMITS=Object.freeze({establishmentMs:5000,closeMs:15000});
const REAL_TIMERS=Object.freeze({setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)});
function fixedFailure(code,cleanup){const error=new Error('Fixed native client establishment refused or failed');error.code=code;if(cleanup)error.cleanup=cleanup;return error;}
function checkedRequest(request){
  if(!request||typeof request!=='object'||types.isProxy(request)||Object.getPrototypeOf(request)!==Object.prototype||Reflect.ownKeys(request).length!==FIELDS.length)throw fixedFailure('FIXED_CLIENT_REQUEST');
  const value={};for(const key of FIELDS){const d=Object.getOwnPropertyDescriptor(request,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))throw fixedFailure('FIXED_CLIENT_REQUEST');value[key]=d.value;}
  if(!ROLES.has(value.role)||!(DATABASES.includes(value.database)||value.role==='postgres'&&value.database==='postgres')||
    typeof value.applicationName!=='string'||!/^murmingle-native-hierarchy(?:-[a-z0-9-]{1,32})?$/u.test(value.applicationName)||
    value.statementTimeoutMs!==5000||value.lockTimeoutMs!==3000)throw fixedFailure('FIXED_CLIENT_REQUEST');
  return value;
}
async function bounded(promise,ms,timers){
  let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=timers.setTimeout(()=>reject(fixedFailure('FIXED_CLIENT_TIMEOUT')),ms);})]);}
  finally{if(timer!==undefined)timers.clearTimeout(timer);}
}

/** Inert injectable establishment seam. Only invented dependencies in tests;
 * production supplies fixed pg factories and owned-cluster RAM credentials. Timers are
 * injectable for virtual-time tests, not an execution/deadline option in request.
 * No provider failure or original error/cause escapes this boundary. */
export async function establishFixedClient(request,{createClient,passwordProvider,beforeDispatch=()=>{},timers=REAL_TIMERS}={}){
  const value=checkedRequest(request);
  if(typeof createClient!=='function'||typeof passwordProvider!=='function'||typeof beforeDispatch!=='function'||typeof timers?.setTimeout!=='function'||typeof timers?.clearTimeout!=='function')throw fixedFailure('FIXED_CLIENT_REQUEST');
  let client,abandoned=false;
  try{
    beforeDispatch();
    const password=passwordProvider(value.role);
    if(typeof password!=='function')throw fixedFailure('FIXED_CLIENT_REQUEST');
    client=createClient({host:'127.0.0.1',port:55433,database:value.database,user:value.role,password,
      ssl:false,connectionTimeoutMillis:5000,application_name:value.applicationName,
      options:'-c statement_timeout=5000 -c lock_timeout=3000'});
    if(!client||typeof client.connect!=='function'||typeof client.query!=='function'||typeof client.end!=='function')throw fixedFailure('FIXED_CLIENT_REQUEST');
    const establishment=Promise.resolve().then(()=>{beforeDispatch();return client.connect();}).then(()=>{
      if(abandoned)throw fixedFailure('FIXED_CLIENT_TIMEOUT');
      beforeDispatch();
      return client.query('SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL READ COMMITTED');
    });
    await bounded(establishment,FIXED_CLIENT_LIMITS.establishmentMs,timers);
    // Success is the sole ownership handoff. Never close the runner's client.
    return client;
  }catch{
    abandoned=true;
    if(!client)throw fixedFailure('FIXED_CLIENT_ESTABLISH','not-created');
    // An invalid factory result cannot hide an otherwise owned close method.
    if(typeof client.end!=='function')throw fixedFailure('FIXED_CLIENT_CLOSE','unavailable');
    try{await bounded(Promise.resolve().then(()=>client.end()),FIXED_CLIENT_LIMITS.closeMs,timers);}
    catch{throw fixedFailure('FIXED_CLIENT_CLOSE','unsettled-or-failed');}
    throw fixedFailure('FIXED_CLIENT_ESTABLISH','closed');
  }
}


