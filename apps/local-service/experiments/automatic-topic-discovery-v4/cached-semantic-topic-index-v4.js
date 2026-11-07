// Explicit successor to the consumed v3 experiment. No IO, encoder, provider,
// registry or canonical write. Structural category evidence is navigation only.
import {createHash} from 'node:crypto';
import {compileCachedSemanticTopicIndex as compileV3} from './cached-semantic-topic-index-v3.js';
export {buildCachedSemanticTopicBank} from './cached-semantic-topic-index-v3.js';

const need=value=>{if(!value)throw new TypeError('Invalid semantic category fallback');};
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const SEMANTIC_CATEGORY_FALLBACK_POLICY=Object.freeze({
 schema:'semantic-category-ancestor-fallback/v1',minimumBodySimilarity:.8,minimumPairedSimilarity:.8,
 minimumMargin:.015,minimumBodyCharacters:32,independentRootRequired:true,structuralCategoriesOnly:true,
 namedSubjectIdentityFromSimilarity:false,maximumNodes:512,maximumDepth:8,
 explicitClassMeaningsRequired:true,namedAncestorsNeedLexicalEvidence:true,
});
export const SEMANTIC_CATEGORY_FALLBACK_POLICY_HASH=sha(SEMANTIC_CATEGORY_FALLBACK_POLICY);
const dot=(a,b)=>{let sum=0;for(let i=0;i<384;i++)sum+=a[i]*b[i];return Math.max(-1,Math.min(1,sum));};
function common(paths){
 let result=[...paths[0]];
 for(const path of paths.slice(1)){let n=0;while(n<result.length&&result[n]===path[n])n++;result=result.slice(0,n);}
 return result;
}

export function compileCachedSemanticTopicIndex(bank,encoded,kindProposal,categoryKindsJson){
 need(arguments.length===4);
 // The prior parser, vector bounds, named-identity/type/context checks and owner
 // policy validation remain the first boundary for every lookup.
 const legacy=compileV3(bank,encoded,kindProposal),description=legacy.describe();
 const nodes=bank.nodes.map(node=>({id:node.id,label:node.label,parentId:node.parentId,
  rootId:node.rootId,path:[...node.path],kind:node.kind}));
 const byId=new Map(nodes.map(node=>[node.id,node])),vectors=new Map(encoded.map(row=>[row.id,[...row.values]]));
 need(nodes.length<=512&&byId.size===nodes.length);
 for(const node of nodes){
  need(['subject','category'].includes(node.kind)&&node.path.length>0&&node.path.length<=8&&
   node.path[0]===node.rootId&&node.path.at(-1)===node.id&&new Set(node.path).size===node.path.length);
  const parent=node.parentId===null?null:byId.get(node.parentId);
  need(node.parentId===null?node.path.length===1:parent&&JSON.stringify(node.path.slice(0,-1))===JSON.stringify(parent.path));
 }
 const categories=nodes.filter(node=>node.kind==='category');
 need(typeof categoryKindsJson==='string'&&categoryKindsJson.length<=131072);
 const categoryProposal=JSON.parse(categoryKindsJson);
 need(categoryProposal&&Object.keys(categoryProposal).sort().join(',')==='bankHash,rows,schema'&&
  categoryProposal.schema==='semantic-category-kinds/v1'&&categoryProposal.bankHash===description.bankHash&&
  Array.isArray(categoryProposal.rows)&&categoryProposal.rows.length===categories.length);
 const meanings=new Map();
 for(let i=0;i<categories.length;i++){
  const row=categoryProposal.rows[i];need(row&&Object.keys(row).sort().join(',')==='kind,nodeId'&&
   row.nodeId===categories[i].id&&['common-class','named-entity','unknown'].includes(row.kind));
  meanings.set(row.nodeId,row.kind);
 }
 const categoryKindsHash=sha(categoryProposal);
 const indexHash=sha({revision:'cached-semantic-topic-index-v4/structural-ancestors-v1',
  priorIndexHash:description.indexHash,categoryKindsHash,fallbackPolicyHash:SEMANTIC_CATEGORY_FALLBACK_POLICY_HASH});
 return Object.freeze({
  describe:()=>({...description,indexHash,categoryKindsHash,fallbackPolicyHash:SEMANTIC_CATEGORY_FALLBACK_POLICY_HASH}),
  lookup(input){
   const prior=legacy.lookup(input);let supportedPath=[...prior.supportedPath],reason=prior.reason,extraProducts=0;
   let considered=0,contenders=[];
   // Never replace accepted names, lexical conflicts, an abstained root or
   // evidence from a short body. Unknown names can nominate categories only.
   const root=byId.get(supportedPath[0]);
   if(prior.aliasMatches===0&&supportedPath.length===1&&meanings.get(root.id)!=='common-class'){
    supportedPath=[];reason='root-class-meaning-unavailable';
   }
   if(prior.aliasMatches===0&&supportedPath.length===1&&root?.kind==='category'&&
      input.body.length>=SEMANTIC_CATEGORY_FALLBACK_POLICY.minimumBodyCharacters){
    const bodies=new Map(nodes.map(node=>[node.id,dot(input.bodyVector,vectors.get(node.id))]));
    extraProducts+=nodes.length*384;
    const outside=Math.max(-1,...nodes.filter(node=>node.rootId!==root.id).map(node=>bodies.get(node.id)));
    const qualified=[];
    for(const node of categories)if(node.rootId===root.id&&node.path.length>1&&
      node.path.every(id=>meanings.get(id)==='common-class')){
     considered++;extraProducts+=384;
     const body=bodies.get(node.id),paired=.5*(body+dot(input.titleVector,vectors.get(node.id)));
     if(body>=SEMANTIC_CATEGORY_FALLBACK_POLICY.minimumBodySimilarity&&
        paired>=SEMANTIC_CATEGORY_FALLBACK_POLICY.minimumPairedSimilarity&&
        body-outside>=SEMANTIC_CATEGORY_FALLBACK_POLICY.minimumMargin)qualified.push({node,body});
    }
    // An admitted descendant implies its declared ancestry. A broad ancestor's
    // higher cosine must not suppress a separately supported deeper category.
    const maximal=qualified.filter(row=>!qualified.some(other=>other.node.id!==row.node.id&&other.node.path.includes(row.node.id)));
    if(maximal.length){
     const best=Math.max(...maximal.map(row=>row.body));
     contenders=maximal.filter(row=>best-row.body<SEMANTIC_CATEGORY_FALLBACK_POLICY.minimumMargin);
     supportedPath=common(contenders.map(row=>row.node.path));
     need(supportedPath[0]===root.id);
     reason=contenders.length===1?'semantic-category-ancestor':'semantic-category-common-ancestor';
    }
   }
   let depth=input.ownerGrouping.defaultMaxDepth;
   const overrides=new Map(input.ownerGrouping.overrides.map(rule=>[rule.nodeId,rule.maxDepth]));
   for(const id of supportedPath)if(overrides.has(id))depth=overrides.get(id);
   const selectedPath=supportedPath.slice(0,depth);
   return {...prior,indexHash,categoryKindsHash,fallbackPolicyHash:SEMANTIC_CATEGORY_FALLBACK_POLICY_HASH,supportedPath,selectedPath,
    labels:selectedPath.map(id=>byId.get(id).label),reason:selectedPath.length<supportedPath.length?'owner-depth-cut':reason,
    coordinateProducts:prior.coordinateProducts+extraProducts,
    categoryFallback:{considered,contenders:contenders.map(row=>row.node.id)}};
  },
 });
}
