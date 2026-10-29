// Explicit owner operations. Import/construction never installs, allocates an
// encoder, starts a worker or changes the currently installed matcher/policy.
import {types} from 'node:util';import {readRecord,frozenClone} from '../../src/domain/validation.js';
import {ServiceError} from '../../src/domain/errors.js';
import {migrateCanonicalV4} from './index.js';
import {loadInstalledHierarchyMatcher} from '../../src/application/installed-hierarchy-matcher.js';
import {installInstalledHierarchy} from './hierarchy-installation.js';
const conflict=()=>new ServiceError('conflict','Automatic topic installation state changed');
function input(value,fresh){if(types.isProxy(value))throw new TypeError('Invalid automatic topic installation');
 const a=readRecord(value,['database','expectedHeadRevision','expectedPolicyRevision',...(fresh?['policy']:[])]);
 if(!a.database||typeof a.database.query!=='function'||typeof a.database.transaction!=='function'||
  ![a.expectedHeadRevision,a.expectedPolicyRevision].every(n=>Number.isSafeInteger(n)&&n>=0&&n<Number.MAX_SAFE_INTEGER))throw new TypeError('Invalid automatic topic installation');return a;
}
function transactionPort(tx){if(tx?.dialect!=='pg'||typeof tx.query!=='function'||typeof tx.exec!=='function')throw new TypeError('Owner PostgreSQL transaction required');
 return Object.freeze({query:(...args)=>tx.query(...args),transaction:work=>work(tx)});}
async function owner(tx){
 // Same first lock as every existing migrator; no reverse head/policy order.
 await tx.query('SELECT pg_advisory_xact_lock(914092004)');
 const {rows}=await tx.query(`SELECT current_setting('transaction_isolation') isolation,current_setting('transaction_read_only') read_only,
  pg_get_userbyid(n.nspowner)=current_user AS owner FROM pg_namespace n WHERE n.nspname='canonical_v4'`);
 if(rows.length!==1||rows[0].isolation!=='read committed'||rows[0].read_only!=='off'||rows[0].owner!==true)
  throw new ServiceError('forbidden','Writable canonical migration owner required');
 const pending=await tx.query("SELECT count(*)::integer n FROM canonical_v4.ingestion_jobs WHERE state IN('pending','leased')");
 if(pending.rows.length!==1||pending.rows[0].n!==0)throw conflict();
}
async function upgrade(tx,a,installed){
 const port=transactionPort(tx);await owner(tx);
 const head=(await tx.query('SELECT revision::text revision,matcher_hash FROM canonical_v4.semantic_installation WHERE singleton FOR UPDATE')).rows;
 const policy=(await tx.query('SELECT revision::text revision,default_max_depth,overrides FROM canonical_v4.semantic_owner_policy WHERE singleton FOR UPDATE')).rows;
 if(head.length!==1||policy.length!==1||head[0].revision!==String(a.expectedHeadRevision)||policy[0].revision!==String(a.expectedPolicyRevision)||
  head[0].matcher_hash!==installed.descriptor.matcherIdentityHash)throw conflict();
 const migrated=await migrateCanonicalV4(port,'hierarchy18');
 const after=(await tx.query('SELECT revision::text revision,default_max_depth,overrides FROM canonical_v4.semantic_owner_policy WHERE singleton')).rows;
 if(JSON.stringify(after)!==JSON.stringify(policy))throw conflict();
 return frozenClone({schemaVersion:migrated.schemaVersion,matcherIdentityHash:head[0].matcher_hash,headRevision:a.expectedHeadRevision,policyRevision:a.expectedPolicyRevision});
}
export async function upgradeAutomaticTopics(value){
 if(arguments.length!==1)throw new TypeError('Invalid automatic topic installation');const a=input(value,false),installed=await loadInstalledHierarchyMatcher();
 return a.database.transaction(tx=>upgrade(tx,a,installed));
}
export async function installAutomaticTopics(value){
 if(arguments.length!==1)throw new TypeError('Invalid automatic topic installation');const a=input(value,true),installed=await loadInstalledHierarchyMatcher();
 return a.database.transaction(async tx=>{
  const port=transactionPort(tx);await owner(tx);
  const first=await installInstalledHierarchy({...a,database:port});
  return upgrade(tx,{expectedHeadRevision:first.headRevision,expectedPolicyRevision:first.policy.revision},installed);
 });
}
