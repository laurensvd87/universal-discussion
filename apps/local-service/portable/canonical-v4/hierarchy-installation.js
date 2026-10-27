// Explicit owner operation. Import performs no IO, encoder allocation or SQL.
// No application route or startup path calls this installer automatically.
import {readRecord,frozenClone} from '../../src/domain/validation.js';
import {types} from 'node:util';
import {loadInstalledHierarchyMatcher} from '../../src/application/installed-hierarchy-matcher.js';
import {compileSemanticTopicGrouping} from '../../src/domain/semantic-topic-grouping.js';
import {migrateCanonicalV4} from './index.js';
import {createCanonicalV4SemanticRepository} from './semantic-repository.js';
import {createCanonicalV4SemanticDiscussionRepository} from './semantic-discussion-repository.js';

export async function installInstalledHierarchy(value) {
  if(arguments.length!==1||types.isProxy(value))throw new TypeError('Invalid hierarchy installation');
  const input=readRecord(value,['database','expectedHeadRevision','expectedPolicyRevision','policy']);
  if(types.isProxy(input.policy))throw new TypeError('Invalid hierarchy policy');
  const policy=readRecord(input.policy,['defaultMaxDepth','overrides']);
  if(!input.database||typeof input.database.transaction!=='function'||typeof input.database.query!=='function'||
      ![input.expectedHeadRevision,input.expectedPolicyRevision].every(n=>Number.isSafeInteger(n)&&n>=0&&n<Number.MAX_SAFE_INTEGER))
    throw new TypeError('Invalid hierarchy installation');
  if(!Number.isInteger(policy.defaultMaxDepth)||policy.defaultMaxDepth<1||policy.defaultMaxDepth>8||
      types.isProxy(policy.overrides)||!Array.isArray(policy.overrides)||Object.getPrototypeOf(policy.overrides)!==Array.prototype)
    throw new TypeError('Invalid hierarchy policy');
  const length=Object.getOwnPropertyDescriptor(policy.overrides,'length').value,rules=[];
  if(length>512||Reflect.ownKeys(policy.overrides).length!==length+1)throw new TypeError('Invalid hierarchy policy');
  for(let i=0;i<length;i++){
    const descriptor=Object.getOwnPropertyDescriptor(policy.overrides,String(i));
    if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value')||types.isProxy(descriptor.value))throw new TypeError('Invalid hierarchy policy');
    const rule=readRecord(descriptor.value,['nodeId','maxDepth']);
    if(typeof rule.nodeId!=='string'||rule.nodeId.length>160||!Number.isInteger(rule.maxDepth)||rule.maxDepth<1||rule.maxDepth>8)
      throw new TypeError('Invalid hierarchy policy');
    rules.push({nodeId:rule.nodeId,maxDepth:rule.maxDepth});
  }
  // Fixed numeric assets only. Packaged E5 sessions, claims and background work
  // are deliberately outside this owner operation.
  const installed=await loadInstalledHierarchyMatcher();
  const selected={revision:input.expectedPolicyRevision,defaultMaxDepth:policy.defaultMaxDepth,overrides:rules};
  compileSemanticTopicGrouping({nodes:installed.descriptor.matcherIdentity.nodes,policy:selected});
  const selectedPolicy=frozenClone(selected);
  return input.database.transaction(async tx=>{
    if(tx.dialect!=='pg'||typeof tx.query!=='function'||typeof tx.exec!=='function')throw new TypeError('Owner PostgreSQL transaction required');
    const {rows}=await tx.query("SELECT current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS read_only");
    if(rows.length!==1||rows[0].isolation!=='read committed'||rows[0].read_only!=='off')
      throw new Error('Hierarchy installation requires a writable READ COMMITTED transaction');
    // Adapt only the transaction port: migrator and both existing CAS adapters
    // use this exact physical connection, with no nested BEGIN or pool checkout.
    const migrated=await migrateCanonicalV4({transaction:work=>work(tx)},'hierarchy17');
    const semantic=createCanonicalV4SemanticRepository({database:tx});
    const registration=await semantic.registerMatcher(installed.matcher);
    const head=await semantic.activateMatcher({matcherIdentityHash:registration.matcherIdentityHash,expectedRevision:input.expectedHeadRevision});
    const ownerPolicy=await createCanonicalV4SemanticDiscussionRepository({database:tx}).setOwnerPolicy({
      expectedRevision:input.expectedPolicyRevision,defaultMaxDepth:selectedPolicy.defaultMaxDepth,overrides:selectedPolicy.overrides});
    return frozenClone({schemaVersion:migrated.schemaVersion,matcherIdentityHash:registration.matcherIdentityHash,
      headRevision:head.revision,policy:ownerPolicy});
  });
}
