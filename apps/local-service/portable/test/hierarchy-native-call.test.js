// SOURCE-faithful causal tests only. The isolated VM is not a security sandbox.
// Its invented DB registration cannot reach the real ES module's WeakSets.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {types} from 'node:util';
import {compileFunction,createContext} from 'node:vm';
import {createExclusiveSession} from '../integration/native-hierarchy-postgres-v2/session.js';
import {describeHierarchyFixtureFailure as describeRealFailure} from '../canonical-v4/hierarchy-repository.js';

async function harness(db){
 const source=await readFile(new URL('../canonical-v4/hierarchy-repository.js',import.meta.url),'utf8');
 assert.equal(source.includes('import.meta'),false);
 const imports=[...source.matchAll(/^import [^\r\n]+;$/gm)];
 assert.ok(imports.length>0);
 assert.equal(imports.length,[...source.matchAll(/^import\b/gm)].length,'all static import declarations must be single lines');
 const exports=[...source.matchAll(/^export (?=(?:async )?function )/gm)];
 assert.equal(exports.length,[...source.matchAll(/^export\b/gm)].length,'only function declaration export keywords are stripped');
 const removals=[...imports,...exports].map(match=>({index:match.index,text:match[0]})).sort((a,b)=>a.index-b.index);
 let stripped='',cursor=0;const inverse=[];
 for(const removal of removals){stripped+=source.slice(cursor,removal.index);inverse.push({index:stripped.length,text:removal.text});cursor=removal.index+removal.text.length;}
 stripped+=source.slice(cursor);
 // Reconstruct every original byte, proving no function/private-body changes.
 let reconstructed=stripped;
 for(const removal of inverse.toReversed())reconstructed=reconstructed.slice(0,removal.index)+removal.text+reconstructed.slice(removal.index);
 assert.equal(reconstructed,source);
 const expected=source.replace(/^import [^\r\n]+;$/gm,'').replace(/^export (?=(?:async )?function )/gm,'');
 assert.equal(stripped,expected);
 const probe=`
fixtures.add(inventedDB);initialized.add(inventedDB);
const originalFreeze=Object.freeze;
return {
 invoke:(name,args=[])=>call(inventedDB,name,args),
 describe:error=>describeHierarchyFixtureFailure(error),
 setFreezeFault:on=>{Object.freeze=on?()=>{throw new Error('Invented VM freeze failure');}:originalFreeze;},
};`;
 const body="'use strict';\n"+stripped+probe;
 assert.equal(body.slice("'use strict';\n".length,-probe.length),expected);
 // No process/require or dynamic-import hook is supplied. Factories are never
 // exposed by the appended probe and no fixture factory is invoked here.
 const context=createContext({types,Buffer});
 assert.equal('process' in context,false);assert.equal('require' in context,false);
 return compileFunction(body,['inventedDB'],{parsingContext:context})(db);
}

async function rejectsIdentically(promise,expected){
 let rejected=false;
 try{await promise;}catch(actual){rejected=true;assert.ok(Object.is(actual,expected),'rejection must preserve the exact original value');}
 assert.equal(rejected,true);
}
const falsyValues=()=>[undefined,null,false,0,-0,NaN,0n,''];
function inventedSession(onSelect,{rollbackError,endError}={}){
 const events=[];
 const client={async query(sql,args=[]){
  events.push({sql,args});
  if(sql==='BEGIN')return {command:'BEGIN'};
  if(sql==='ROLLBACK'){if(rollbackError!==undefined)throw rollbackError;return {command:'ROLLBACK'};}
  if(sql==='COMMIT')return {command:'COMMIT'};
  return onSelect(sql,args);
 },async end(){events.push({end:true});if(endError!==undefined)throw endError;}};
 return {session:createExclusiveSession(client,()=>{}),events};
}

test('exact private call preserves every falsy rejection and object identity through the real inert session',async()=>{
 for(const primary of [...falsyValues(),Object.assign(new Error('private message'),{code:'42702',position:'42'})]){
  const {session,events}=inventedSession(()=>{throw primary;});const h=await harness(session);
  await rejectsIdentically(h.invoke('claim',['invented']),primary);
  assert.equal(events[0].sql,'BEGIN');assert.equal(events[1].sql,'SELECT hierarchy_native_scoped_ingestion_v2.claim($1) AS result');assert.equal(events[2].sql,'ROLLBACK');
  assert.equal(events.length,3);assert.equal(session.snapshot().pending,0);
  if(primary&&typeof primary==='object'){const observed=h.describe(primary);assert.equal(observed.stage,'rpc:claim');assert.equal(observed.sqlState,'42702');assert.equal(observed.position,'42');assert.ok(Object.isFrozen(observed));}
  else assert.equal(h.describe(primary),null);
  assert.equal(describeRealFailure(primary),null);await session.close();
 }
});

test('same exact error keeps its first actual RPC metadata after later fields and operation change',async()=>{
 const error=Object.assign(new Error('private'),{code:'42702',position:'17',internalPosition:'33'});
 const {session}=inventedSession(()=>{throw error;}),h=await harness(session);
 await rejectsIdentically(h.invoke('claim'),error);const first=h.describe(error);
 error.code='P2306';error.position='77';error.internalPosition='99';
 await rejectsIdentically(h.invoke('complete'),error);
 assert.equal(h.describe(error),first);assert.equal(first.stage,'rpc:claim');assert.equal(first.sqlState,'42702');assert.equal(first.position,'17');assert.equal(first.internalPosition,'33');
 assert.equal(describeRealFailure(error),null);await session.close();
});

test('a real private projection failure leaves its first null sentinel sticky after VM freeze restoration',async()=>{
 const error=Object.assign(new Error('private'),{code:'42702'});
 const {session}=inventedSession(()=>{throw error;}),h=await harness(session);
 h.setFreezeFault(true);await rejectsIdentically(h.invoke('claim'),error);assert.equal(h.describe(error),null);
 h.setFreezeFault(false);await rejectsIdentically(h.invoke('complete'),error);assert.equal(h.describe(error),null);
 assert.equal(describeRealFailure(error),null);await session.close();
});

test('actual call failure recording invokes no unknown accessor, proxy or coercion hooks',async()=>{
 let hooks=0;const accessor=Object.defineProperties({},Object.fromEntries(['code','position','internalPosition','where','message','detail','internalQuery'].map(name=>[name,{get(){hooks++;throw new Error('must not read');}}])));
 const proxy=new Proxy(accessor,{get(){hooks++;throw new Error('must not read');},getOwnPropertyDescriptor(){hooks++;throw new Error('must not inspect');},getPrototypeOf(){hooks++;throw new Error('must not inspect');}});
 for(const error of [accessor,proxy]){
  const {session}=inventedSession(()=>{throw error;}),h=await harness(session);
  await rejectsIdentically(h.invoke('claim'),error);
  const observed=h.describe(error);
  if(error===proxy)assert.equal(observed,null);else assert.deepEqual({...observed},{stage:'rpc:claim',sqlState:null,position:null,internalPosition:null,functionName:null,functionLine:null});
  await session.close();
 }
 assert.equal(hooks,0);
});

test('actual successful call forwards exact parameters and freezes the actual query row result',async()=>{
 const result={state:'invented',nested:{count:1}},parameters=['original',17,null];
 const {session,events}=inventedSession((sql,args)=>{assert.equal(args,parameters);return {rows:[{result}]};});
 const h=await harness(session),returned=await h.invoke('claim',parameters);
 assert.equal(returned,result);assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.nested));
 assert.deepEqual(events.map(e=>e.sql),['BEGIN','SELECT hierarchy_native_scoped_ingestion_v2.claim($1,$2,$3) AS result','COMMIT']);
 await assert.rejects(h.invoke('unknown_rpc'),/Invalid experimental/);assert.equal(events.length,3);
 await session.close();
});

test('real session rollback and end secondary failures cannot replace any original actual call rejection',async()=>{
 for(const primary of [...falsyValues(),Object.assign(new Error('original private'),{code:'42702'})]){
  const rollbackError=Object.assign(new Error('rollback secondary'),{code:'ROLLBACK_FAILED'}),endError=Object.assign(new Error('end secondary'),{code:'END_FAILED'});
  const {session,events}=inventedSession(()=>{throw primary;},{rollbackError,endError}),h=await harness(session);
  await rejectsIdentically(h.invoke('complete'),primary);
  assert.deepEqual(events.map(e=>e.sql),['BEGIN','SELECT hierarchy_native_scoped_ingestion_v2.complete() AS result','ROLLBACK']);
  assert.equal(session.snapshot().state,'poisoned');assert.equal(session.snapshot().pending,0);
  await rejectsIdentically(session.close(),endError);
  assert.deepEqual([...session.snapshot().cleanupFailures],['ROLLBACK_FAILED','END_FAILED']);
  assert.equal(session.snapshot().pending,0);assert.equal(events.at(-1).end,true);
  if(primary&&typeof primary==='object'){assert.equal(h.describe(primary).stage,'rpc:complete');assert.equal(h.describe(primary).sqlState,'42702');}
  else assert.equal(h.describe(primary),null);
  assert.equal(h.describe(rollbackError),null);assert.equal(h.describe(endError),null);
 }
});
