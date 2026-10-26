// Maintained SOURCE composition. Import creates no cluster or fixture authority.
import {types} from 'node:util';
import {createFixtureController} from './native-hierarchy-postgres-v2/context.js';
import {CASES,createAssertionLedger} from './native-hierarchy-postgres-v2/suite.js';
import {describeHierarchyFixtureFailure} from '../canonical-v4/hierarchy-repository.js';
const fail=code=>Object.assign(new Error('Owned native fixture refused'),{code});
function code(error){try{if(error&&typeof error==='object'&&!types.isProxy(error)){
 const d=Object.getOwnPropertyDescriptor(error,'code');if(d&&Object.hasOwn(d,'value')&&typeof d.value==='string'&&/^[A-Z0-9_]{1,64}$/u.test(d.value))return d.value;
}}catch{}return 'NATIVE_SQL_FAILURE';}
let activeScope=null,proofUsed=false;
export async function acquireNativeFixture(){
 if(arguments.length||activeScope===null||!activeScope.live)throw fail('NATIVE_NO_OWNED_SCOPE');
 const scope=activeScope,result=await scope.controller.acquire();
 if(activeScope!==scope||!scope.live){try{await result.close();}catch{}throw fail('NATIVE_SCOPE_RETIRED');}
 return result;
}

/** SOURCE-only no-options proof composition. No CLI calls this until a new
 * supervisor, exact catalog/binaries and separate actual decision are accepted. */
export async function runNativeSqlProof(){
 if(arguments.length||proofUsed||activeScope!==null)throw fail('NATIVE_PROOF_ONESHOT');proofUsed=true;
 const {runWithOwnedScopedPostgres,getOwnedIdentity}=await import('./hierarchy-native-cluster.js');
 const {runAssertions}=await import('../test/hierarchy-native-assertions.js');
 return runWithOwnedScopedPostgres(async connectFixedRole=>{
  let callbackOpen=true,hasPrimary=false,primary;
  const guard=()=>{if(!callbackOpen)throw fail('NATIVE_SCOPE_RETIRED');};
  const controller=createFixtureController({connectFixedRole,getOwnedIdentity,guard}),scope={live:true,controller};
  const ledger=createAssertionLedger({guard});let outer=0,cases=null,cleanup,fixtureFailure=null;
  try{
   await runAssertions(async(...args)=>{
    if(outer===1){if(args[0]!==CASES[1].name||ledger.snapshot().cursor!==1)throw fail('ASSERTION_INVENTORY');activeScope=scope;}
    outer++;return ledger.test(...args);
   });cases=ledger.finish();
  }catch(error){hasPrimary=true;primary=error;fixtureFailure=describeHierarchyFixtureFailure(error);}
  finally{
   scope.live=false;activeScope=null;cleanup=await controller.finish();callbackOpen=false;
  }
  const observed=ledger.snapshot();
  return {schema:'native-hierarchy-postgres-proof/v2',status:!hasPrimary&&cases?.length===25&&cleanup.status==='passed'&&observed.pending===0?'passed':'failed',
   primary:hasPrimary?code(primary):null,cases:cases??observed.rows,pendingAssertions:observed.pending,cleanup,
   ...(fixtureFailure?{fixtureFailure}:{}),
   nativeExecuted:true,concurrencyValidated:false,restrictedRoleValidated:false,semanticQualityMeasured:false};
 });
}
