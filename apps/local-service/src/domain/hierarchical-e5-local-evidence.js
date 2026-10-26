// Experimental paired-E5 LOCAL evidence, not a global linear head or probability.
// A group has exactly one explicit (node,kind) annotation, but may have multiple
// views. Group evidence is MAX(view cosine), never repeated votes. member/stop
// support their node+ancestors; only stop excludes strict descendants. outside
// excludes its explicitly scoped node+descendants, never the enclosing parent.
// All enabled independently supported nodes nominate approved paths. Remove
// ancestor nominations except separately plausible direct STOP nominations;
// return their LCA, or abstain across roots. Incompatible-node positive evidence
// is a separate rivalry signal, NEVER an outside annotation; zero rival margins
// retain ties for the set/LCA decoder. Disabled ancestors can be inherited
// from accepted descendants, not independently nominate. No parent-centroid gate,
// nearest fallback, caller features, index loss, calibration or write authority.
import {createHash} from 'node:crypto';
import {types} from 'node:util';

export const LOCAL_EVIDENCE_LIMITS=Object.freeze({dimensions:384,maxNodes:512,maxDepth:8,maxExamples:2048,
  maxDirectGroups:32,maxReportedGroups:8,maxStringUnits:160,normTolerance:1e-5,maxWork:4000000,maxCompileWork:12000000});
const L=LOCAL_EVIDENCE_LIMITS,HEX=/^[a-f0-9]{64}$/u,handles=new WeakMap();
const sha=value=>createHash('sha256').update(value).digest('hex');
const lexical=(a,b)=>a<b?-1:a>b?1:0;
const BUILDER_HASH=sha('paired-local-evidence/v1|384binary64|scope-dedup-max|member-stop-ancestor-union|outside-subtree|strict-negative-ties|incompatible-positive-rival-inclusive-ties|direct-stop-preserved|accepted-path-lca');
export class LocalEvidenceError extends TypeError{constructor(code){super('Experimental local evidence refused: '+code);this.name='LocalEvidenceError';this.code=code;}}
function fail(code='invalid-input'){throw new LocalEvidenceError(code);}
function record(value,fields){
  if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==fields.length)fail();
  const out={};for(const f of fields){const d=Object.getOwnPropertyDescriptor(value,f);if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();out[f]=d.value;}return out;
}
function array(value,max){
  if(types.isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)fail();
  const n=Object.getOwnPropertyDescriptor(value,'length').value;if(n>max)fail('capacity');if(Reflect.ownKeys(value).length!==n+1)fail();
  return Array.from({length:n},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))fail();return d.value;});
}
function id(value){if(typeof value!=='string'||!value.length||value.length>L.maxStringUnits||value.trim()!==value||!value.isWellFormed()||/[\u0000-\u001f\u007f]/u.test(value))fail();return value;}
function hash(value){if(typeof value!=='string'||!HEX.test(value))fail();return value;}
function finite(value,min,max){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail();return value;}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function counter(max){return {units:0,add(n=1){this.units+=n;if(this.units>max)fail('capacity');}};}
function vector(input,work){
  const v=array(input,L.dimensions);if(v.length!==L.dimensions)fail();let norm=0;
  for(const x of v){work.add();finite(x,-1,1);norm+=x*x;}if(Math.abs(norm-1)>L.normTolerance)fail();return Object.freeze(v);
}
function vectorHash(v){const b=Buffer.alloc(L.dimensions*8);for(let i=0;i<v.length;i++)b.writeDoubleLE(v[i],i*8);return sha(b);}
const A_FIELDS=['schema','representation','representationHash','inputConstructionHash','taxonomyVersion','evidenceVersion','calibrationVersion','calibrationStatus','nodes','examples','nodePolicies'];
export function compileHierarchyLocalEvidence(input){
  const a=record(input,A_FIELDS),compileWork=counter(L.maxCompileWork);
  if(a.schema!=='hierarchical-e5-local-evidence/v1'||a.representation!=='paired-raw-e5-body-title-v1'||a.calibrationStatus!=='experimental')fail();
  hash(a.representationHash);hash(a.inputConstructionHash);for(const k of ['taxonomyVersion','evidenceVersion','calibrationVersion'])id(a[k]);
  const nodes=array(a.nodes,L.maxNodes).map(n=>record(n,['id','parentId'])).sort((x,y)=>lexical(id(x.id),id(y.id)));
  if(!nodes.length)fail();const byId=new Map();
  for(const n of nodes){if(n.parentId!==null)id(n.parentId);if(byId.has(n.id))fail();byId.set(n.id,{...n,path:[],pos:[],neg:[],stop:[]});}
  for(const n of byId.values()){
    let cursor=n;const seen=new Set();
    while(cursor){compileWork.add();if(seen.has(cursor.id))fail();seen.add(cursor.id);n.path.unshift(cursor.id);if(n.path.length>L.maxDepth)fail('capacity');
      if(cursor.parentId===null)break;cursor=byId.get(cursor.parentId);if(!cursor)fail();}
    n.ancestorSet=new Set(n.path);
  }
  const policies=array(a.nodePolicies,L.maxNodes).map(r=>record(r,['nodeId','enabled','minSupport','minSimilarity','minNegativeMargin','minRivalMargin'])).sort((x,y)=>lexical(id(x.nodeId),id(y.nodeId)));
  if(policies.length!==nodes.length)fail();const policyIds=new Set();
  for(const r of policies){if(!byId.has(r.nodeId)||policyIds.has(r.nodeId)||typeof r.enabled!=='boolean')fail();policyIds.add(r.nodeId);
    finite(r.minSupport,1,L.maxReportedGroups);if(!Number.isInteger(r.minSupport))fail();finite(r.minSimilarity,-1,1);finite(r.minNegativeMargin,0,2);finite(r.minRivalMargin,0,2);byId.get(r.nodeId).rule=r;}
  const groupScopes=new Map(),directGroups=new Map(),exampleIds=new Set();
  const examples=array(a.examples,L.maxExamples).map(value=>{
    const e=record(value,['id','groupId','nodeId','kind','vector']);id(e.id);id(e.groupId);id(e.nodeId);
    if(exampleIds.has(e.id)||!byId.has(e.nodeId)||!['member','stop','outside'].includes(e.kind))fail();exampleIds.add(e.id);
    const scope=JSON.stringify([e.nodeId,e.kind]);if(groupScopes.has(e.groupId)&&groupScopes.get(e.groupId)!==scope)fail();groupScopes.set(e.groupId,scope);
    const groups=directGroups.get(scope)??new Set();groups.add(e.groupId);if(groups.size>L.maxDirectGroups)fail('capacity');directGroups.set(scope,groups);
    return {...e,vector:vector(e.vector,compileWork)};
  }).sort((x,y)=>lexical(x.id,y.id));
  if(!examples.length)fail();
  for(let i=0;i<examples.length;i++){
    const e=examples[i],own=byId.get(e.nodeId);
    if(e.kind!=='outside')for(const ancestor of own.path){compileWork.add();byId.get(ancestor).pos.push(i);}
    if(e.kind==='stop')own.stop.push(i);
    if(e.kind!=='member')for(const n of byId.values()){
      compileWork.add();if(n.ancestorSet.has(e.nodeId)&&(e.kind==='outside'||n.id!==e.nodeId))n.neg.push(i);
    }
  }
  let scoringUpperBound=L.dimensions+examples.length*(L.dimensions+1)+nodes.length*(L.maxDepth*3+16)+2*nodes.length*nodes.length;
  for(const n of byId.values()){
    for(const key of ['pos','neg','stop']){
      const groupCount=new Set(n[key].map(i=>examples[i].groupId)).size;
      n[key+'GroupCount']=groupCount;scoringUpperBound+=n[key].length*3;
      if(key!=='neg')scoringUpperBound+=groupCount*(L.maxReportedGroups+3);
      else scoringUpperBound+=groupCount;
    }
  }
  const canonical={...a,nodes,examples:examples.map(e=>({id:e.id,groupId:e.groupId,nodeId:e.nodeId,kind:e.kind,vectorHash:vectorHash(e.vector)})),nodePolicies:policies,builderHash:BUILDER_HASH};
  const artifactHash=sha(JSON.stringify(canonical)),handle=Object.freeze({});
  const metadata=Object.fromEntries(A_FIELDS.filter(k=>!['nodes','examples','nodePolicies'].includes(k)).map(k=>[k,a[k]]));
  handles.set(handle,{a:metadata,byId,nodes,examples,artifactHash,compileUnits:compileWork.units,scoringUpperBound});return handle;
}
function stateFor(handle){const s=handles.get(handle);if(!s)fail('invalid-handle');return s;}
function identity(s){return {artifactHash:s.artifactHash,builderHash:BUILDER_HASH,representation:s.a.representation,representationHash:s.a.representationHash,
  inputConstructionHash:s.a.inputConstructionHash,taxonomyVersion:s.a.taxonomyVersion,evidenceVersion:s.a.evidenceVersion,calibrationVersion:s.a.calibrationVersion};}
export function describeHierarchyLocalEvidence(handle){const s=stateFor(handle);return freeze({schema:'hierarchical-e5-local-evidence-description/v1',...identity(s),
  nodes:s.nodes.map(n=>({...n,depth:s.byId.get(n.id).path.length})),examples:s.examples.length,independentGroups:new Set(s.examples.map(e=>e.groupId)).size,
  compileWork:s.compileUnits,scoringPreflightUpperBound:s.scoringUpperBound,limits:L,experimental:true,productionValidated:false,assignmentAuthority:false});}
function aggregate(s,refs,scores,work,rule,reportTop){
  const groups=new Map();let best=null,support=0;const top=[];
  for(const i of refs){work.add(3);const group=s.examples[i].groupId,old=groups.get(group),score=scores[i];if(old===undefined||score>old)groups.set(group,score);}
  if(!reportTop){for(const score of groups.values()){work.add();if(best===null||score>best)best=score;}
    return {best,support,top,groupCount:groups.size};}
  for(const [groupId,similarity] of groups){
    work.add(2);if(similarity>=rule.minSimilarity)support++;
    let position=0;while(position<top.length){work.add();const b=top[position];if(similarity>b.similarity||similarity===b.similarity&&lexical(groupId,b.groupId)<0)break;position++;}
    if(position<L.maxReportedGroups){top.splice(position,0,{groupId,similarity});if(top.length>L.maxReportedGroups)top.pop();}
  }
  best=top[0]?.similarity??null;
  return {best,support,top,groupCount:groups.size};
}
function eligible(rule,positive,negative,rival){return rule.enabled&&positive.support>=rule.minSupport&&positive.best!==null&&
  (negative===null||(positive.best-negative>0&&positive.best-negative>=rule.minNegativeMargin))&&
  (rival===null||positive.best-rival>=rule.minRivalMargin);}
function scoreInternal(handle,input){
  const s=stateFor(handle),work=counter(L.maxWork);
  // This topology/evidence-dependent bound is checked before any query cosine.
  if(s.scoringUpperBound>L.maxWork)fail('capacity');
  const q=record(input,['sourceId','sourceVersion','representation','representationHash','inputConstructionHash','vector']);id(q.sourceId);id(q.sourceVersion);
  if(q.representation!==s.a.representation||q.representationHash!==s.a.representationHash||q.inputConstructionHash!==s.a.inputConstructionHash)fail('identity-mismatch');
  const v=vector(q.vector,work),scores=[];
  for(const e of s.examples){let dot=0;work.add();for(let i=0;i<L.dimensions;i++){work.add();dot+=v[i]*e.vector[i];}if(!Number.isFinite(dot))fail();scores.push(dot);}
  const features=[];
  for(const n of s.byId.values()){
    work.add();const positive=aggregate(s,n.pos,scores,work,n.rule,true),negative=aggregate(s,n.neg,scores,work,n.rule,false),stop=aggregate(s,n.stop,scores,work,n.rule,true);
    features.push({nodeId:n.id,bestSimilarity:positive.best,positiveSimilarities:positive.top,positiveGroupCount:positive.groupCount,support:positive.support,
      negativeSimilarity:negative.best,negativeGroupCount:negative.groupCount,negativeMargin:positive.best===null||negative.best===null?null:positive.best-negative.best,
      bestStopSimilarity:stop.best,stopSimilarities:stop.top,stopGroupCount:stop.groupCount,stopSupport:stop.support,
      accepted:false,plausibleStop:false});
  }
  for(const f of features){
    const n=s.byId.get(f.nodeId);let rival=null;
    for(const other of features){work.add(2);const p=s.byId.get(other.nodeId);
      if(!n.ancestorSet.has(p.id)&&!p.ancestorSet.has(n.id)&&other.bestSimilarity!==null&&(rival===null||other.bestSimilarity>rival))rival=other.bestSimilarity;
    }
    f.bestIncompatiblePositive=rival;f.rivalMargin=f.bestSimilarity===null||rival===null?null:f.bestSimilarity-rival;
    f.stopRivalMargin=f.bestStopSimilarity===null||rival===null?null:f.bestStopSimilarity-rival;
    work.add(16); // Two bounded eight-comparison rule evaluation budgets.
    f.accepted=eligible(n.rule,{support:f.support,best:f.bestSimilarity},f.negativeSimilarity,rival);
    f.plausibleStop=eligible(n.rule,{support:f.stopSupport,best:f.bestStopSimilarity},f.negativeSimilarity,rival);
  }
  return {s,work,features,source:{sourceId:q.sourceId,sourceVersion:q.sourceVersion}};
}
function outputMeta(r){return {...identity(r.s),source:{...r.source},work:{countedUnits:r.work.units,preflightUpperBound:r.s.scoringUpperBound,
  coordinateProducts:r.s.examples.length*L.dimensions,queryNormProducts:L.dimensions,dotProducts:r.s.examples.length,
  scope:'query norm/dot products, evidence/group visits, top/rival comparisons, rule budgets and path resolution; compile/record validation separate'},
  experimental:true,calibrationStatus:'external-experimental',productionValidated:false,assignmentAuthority:false};}
export function scoreHierarchyLocalEvidence(handle,input){const r=scoreInternal(handle,input);return freeze({schema:'hierarchical-e5-local-evidence-features/v1',...outputMeta(r),nodes:r.features});}
export function classifyHierarchyLocalEvidence(handle,input){
  const r=scoreInternal(handle,input),ancestorNominations=new Set();
  for(const f of r.features)if(f.accepted){const path=r.s.byId.get(f.nodeId).path;for(let i=0;i<path.length-1;i++){r.work.add();ancestorNominations.add(path[i]);}}
  const candidates=[];
  for(const f of r.features){r.work.add();if(f.accepted&&(!ancestorNominations.has(f.nodeId)||f.plausibleStop))candidates.push({nodeId:f.nodeId,path:[...r.s.byId.get(f.nodeId).path],explicitStop:f.plausibleStop});}
  let path=candidates.length?[...candidates[0].path]:[];
  for(const c of candidates){let common=0;while(common<path.length&&common<c.path.length){r.work.add();if(path[common]!==c.path[common])break;common++;}path=path.slice(0,common);}
  const reason=!candidates.length?'unsupported':!path.length?'cross-root-ambiguity':candidates.length===1?'supported-path':'supported-common-ancestor';
  return freeze({schema:'hierarchical-e5-local-evidence-decision/v1',...outputMeta(r),status:path.length?'assigned':'unresolved',selectedPath:path,
    primaryNodeId:path.at(-1)??null,reason,plausiblePaths:candidates});
}
