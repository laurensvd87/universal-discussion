// Experimental numerical composition. Cosine prototypes never grant deeper
// membership. Only an actual opaque rooted matcher can support refinement.
// No IO, encoder allocation, registry publication or canonical assignment authority.
import {createHash} from 'node:crypto';
import {compileCachedSemanticTopicIndex as compileV3} from './cached-semantic-topic-index-v3.js';
import {describeRootedHierarchyMatcher,classifyRootedHierarchyMatcher} from '../../src/domain/hierarchy-rooted-matcher.js';
export {buildCachedSemanticTopicBank} from './cached-semantic-topic-index-v3.js';

const need=value=>{if(!value)throw new TypeError('Invalid membership topic fallback');};
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same=(a,b)=>a.length===b.length&&a.every((value,i)=>value===b[i]);
export const MEMBERSHIP_TOPIC_FALLBACK_POLICY=Object.freeze({schema:'membership-topic-ancestor-fallback/v1',
 independentRootAgreementRequired:true,cosineOnlyRefinement:false,namedAndClassMembershipSameGate:true,
 acceptedAncestryOnlyRefinement:true,maximumLexicalMatchesForRefinement:1,
 maximumNodes:512,maximumDepth:8,assignmentAuthority:false});
export const MEMBERSHIP_TOPIC_FALLBACK_POLICY_HASH=sha(MEMBERSHIP_TOPIC_FALLBACK_POLICY);

export function compileCachedSemanticTopicIndex(bank,encoded,subjectKinds,membershipMatcherOrNull){
 need(arguments.length===4);
 const legacy=compileV3(bank,encoded,subjectKinds),description=legacy.describe();
 const nodes=bank.nodes.map(node=>({id:node.id,label:node.label,parentId:node.parentId,rootId:node.rootId,kind:node.kind,path:[...node.path]}));
 const byId=new Map(nodes.map(node=>[node.id,node]));
 need(nodes.length<=512&&byId.size===nodes.length);
 for(const node of nodes){
  need(typeof node.id==='string'&&['subject','category'].includes(node.kind)&&node.path.length>0&&node.path.length<=8&&
   node.path[0]===node.rootId&&node.path.at(-1)===node.id&&
   new Set(node.path).size===node.path.length);
  const parent=node.parentId===null?null:byId.get(node.parentId);
  need(node.parentId===null?node.path.length===1:parent&&same(node.path.slice(0,-1),parent.path));
 }
 let membershipMatcherIdentityHash=null;
 if(membershipMatcherOrNull!==null){
  // This lookup accepts only the domain compiler's private WeakMap capability;
  // neither an identity DTO nor a caller classification function can replace it.
  const identity=describeRootedHierarchyMatcher(membershipMatcherOrNull);
  const roots=nodes.filter(node=>node.parentId===null).map(node=>node.id).sort();
  need(same(roots,[...identity.roots].sort()));
  for(const node of identity.nodes){const expected=byId.get(node.id);need(expected&&expected.parentId===node.parentId);}
  for(const artifact of identity.detailArtifacts){const expected=byId.get(artifact.nodeId);need(expected&&same(expected.path,artifact.canonicalPath));}
  membershipMatcherIdentityHash=sha(identity);
 }
 const encodedHash=sha([...encoded].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0));
 const indexHash=sha({revision:'cached-semantic-topic-index-v5/rooted-membership-v1',priorIndexHash:description.indexHash,encodedHash,
  membershipMatcherIdentityHash,policyHash:MEMBERSHIP_TOPIC_FALLBACK_POLICY_HASH});
 return Object.freeze({
  describe:()=>({...description,indexHash,encodedHash,membershipMatcherIdentityHash,policyHash:MEMBERSHIP_TOPIC_FALLBACK_POLICY_HASH}),
  lookup(input){
   // Keep v3 validation and accepted exact names. Independently supported
   // descendants may refine an accepted broad path, never jump to a sibling.
   const prior=legacy.lookup(input);let supportedPath=[...prior.supportedPath],reason=prior.reason;
   let evaluated=false,membershipReason=membershipMatcherOrNull===null?'not-configured':'not-needed';
   const hasDescendants=supportedPath.length>0&&nodes.some(node=>node.path.length>supportedPath.length&&
    supportedPath.every((id,i)=>node.path[i]===id));
   // V3 exposes only a match count, not the accepted lexical branches. Multiple
   // matches can encode a sibling conflict; retain that common ancestor.
   if(membershipMatcherOrNull!==null&&supportedPath.length>0&&
      (prior.aliasMatches===0||prior.aliasMatches===1&&hasDescendants)){
    evaluated=true;
    const decision=classifyRootedHierarchyMatcher(membershipMatcherOrNull,{sourceId:'cached-topic-query',
     sourceVersion:sha([input.bodyVector,input.titleVector]),bodyVector:input.bodyVector,titleVector:input.titleVector});
    if(!decision.rootPath.length)membershipReason='root-abstained';
    else if(!same(decision.rootPath,[supportedPath[0]]))membershipReason='root-disagreed';
    else{
     const expected=byId.get(decision.semanticPath.at(-1));
     need(expected&&same(expected.path,decision.semanticPath));
     if(supportedPath.every((id,i)=>decision.semanticPath[i]===id)){
      membershipReason=decision.reason;
      if(decision.semanticPath.length>supportedPath.length){
       supportedPath=[...decision.semanticPath];reason='membership-'+decision.reason;
      }
     }else membershipReason='path-disagreed';
    }
   }
   let depth=input.ownerGrouping.defaultMaxDepth;
   const rules=new Map(input.ownerGrouping.overrides.map(rule=>[rule.nodeId,rule.maxDepth]));
   for(const id of supportedPath)if(rules.has(id))depth=rules.get(id);
   const selectedPath=supportedPath.slice(0,depth);
   return {...prior,indexHash,membershipMatcherIdentityHash,policyHash:MEMBERSHIP_TOPIC_FALLBACK_POLICY_HASH,
    supportedPath,selectedPath,labels:selectedPath.map(id=>byId.get(id).label),
    reason:selectedPath.length<supportedPath.length?'owner-depth-cut':reason,
    coordinateProductsScope:'cached-prototypes-only-excludes-rooted-matcher',
    membership:{evaluated,reason:membershipReason},
    membershipScope:{experimentalNumericalComposition:true,encoderBindingVerified:false,assignmentAuthority:false}};
  },
 });
}
