// Independent observed-cutpoint calibration. No frozen cohort, fixed-grid policy,
// probability estimate, production or canonical assignment authority is used.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {compileHierarchyLinearHeads,scoreHierarchyLinearHeads} from './hierarchical-e5-paired-linear-heads.js';

export const OBSERVED_HEAD_POLICY_LIMITS=Object.freeze({maxRows:512,maxNodes:128,maxCalibrationWork:64000000});
const SCHEMA='hierarchical-e5-observed-head-policy-v1',MODE='observed-score-positive-sibling-margin-tie-group-sweep/v1';
const handles=new WeakMap(),hash=value=>createHash('sha256').update(value).digest('hex'),digest=value=>hash(JSON.stringify(value));
const invalid=()=>{throw new TypeError('Invalid experimental observed head policy');};
const capacity=()=>{throw Object.assign(new RangeError('Observed head policy capacity exceeded'),{code:'capacity'});};
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
const lexical=(a,b)=>a<b?-1:a>b?1:0;
function freeze(value){if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
function data(input){
  let units=0;
  function copy(value,depth){
    if(++units>1000000)capacity();if(depth>12)invalid();
    if(value===null||typeof value==='boolean')return value;
    if(typeof value==='string'){if(value.length>1024)capacity();return value;}
    if(typeof value==='number'){if(!Number.isFinite(value))invalid();return value;}
    if(!value||typeof value!=='object'||types.isProxy(value))invalid();
    const array=Array.isArray(value);if(Object.getPrototypeOf(value)!==(array?Array.prototype:Object.prototype))invalid();
    const keys=Reflect.ownKeys(value);if(keys.length>4097)capacity();const out=array?[]:{};
    if(array){
      const length=Object.getOwnPropertyDescriptor(value,'length').value;
      if(length>4096||keys.length!==length+1)invalid();
      for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out.push(copy(d.value,depth+1));}
    }else for(const key of keys){
      if(typeof key!=='string'||['__proto__','prototype','constructor'].includes(key))invalid();
      const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[key]=copy(d.value,depth+1);
    }
    return out;
  }
  return copy(input,0);
}
function exact(value,fields){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!==[...fields].sort().join('|'))invalid();return value;}
function identifier(value){if(typeof value!=='string'||!value.length||value.length>160||value.trim()!==value||/[\u0000-\u001f\u007f]/u.test(value))invalid();}
function finite(value){if(typeof value!=='number'||!Number.isFinite(value))invalid();}
function taxonomy(model){
  const nodes=model.nodes.map(n=>({...n})).sort((a,b)=>lexical(a.id,b.id)),byId=new Map(nodes.map(n=>[n.id,n]));
  const paths=new Map(),peers=new Map();
  for(const n of nodes){const path=[];let cursor=n;while(cursor){path.unshift(cursor.id);cursor=byId.get(cursor.parentId);}paths.set(n.id,path);
    const list=peers.get(n.parentId)??[];list.push(n.id);peers.set(n.parentId,list);}
  return {nodes,paths,peers,roots:nodes.filter(n=>n.parentId===null).map(n=>n.id),parents:new Set(nodes.map(n=>n.parentId).filter(v=>v!==null))};
}
// A conservative charged-work bound, including worst-case enabled head dots,
// vector checks, feature peer comparisons, deterministic sorting and 2D sweep.
// Bounded copying, model compilation, taxonomy traversal and hashing are excluded;
// this is NOT a total CPU or elapsed-time bound. Maximum Cartesian sizes may reject.
export function observedHeadPolicyWorkUpperBound(rows,nodes){
  if(!Number.isInteger(rows)||rows<1||rows>512||!Number.isInteger(nodes)||nodes<1||nodes>128)capacity();
  const logarithm=Math.ceil(Math.log2(rows+1));
  return rows*(nodes*384+768)+rows*10+rows*nodes*(nodes+10)+
    2*nodes*(rows+1)*logarithm+2*nodes*rows*(rows+1);
}
function mergeSort(input,compare,charge){
  let values=[...input];
  for(let width=1;width<values.length;width*=2){
    const next=new Array(values.length);
    for(let start=0;start<values.length;start+=2*width){
      let i=start,j=Math.min(start+width,values.length),end=Math.min(start+2*width,values.length),out=start;
      const leftEnd=j;
      while(i<leftEnd&&j<end){charge(1,'sortComparisons');next[out++]=compare(values[i],values[j])<=0?values[i++]:values[j++];}
      while(i<leftEnd)next[out++]=values[i++];while(j<end)next[out++]=values[j++];
    }
    values=next;
  }
  return values;
}
function featureRows(meta,packet,charge=()=>{}){
  const scores=new Map(packet.scores.map(s=>[s.nodeId,s.enabled?s.score:null]));
  return meta.nodes.map(node=>{
    const score=scores.get(node.id);let other=null;
    for(const peer of meta.peers.get(node.parentId)){
      if(peer===node.id)continue;charge(1,'featureComparisons');const value=scores.get(peer);
      if(value!==null&&(other===null||value>other))other=value;
    }
    const siblingMargin=score===null||other===null?null:score-other;if(siblingMargin!==null)finite(siblingMargin);
    return {nodeId:node.id,score,siblingMargin};
  });
}
function passes(feature,rule){return rule.enabled&&feature.score!==null&&feature.score>=rule.minScore&&
  (feature.siblingMargin===null||feature.siblingMargin>0&&feature.siblingMargin>=rule.minMargin);}
const WORK_FIELDS=['preflightUpperBound','units','scoringCoordinateProducts','validationUnits','featureComparisons','sortComparisons','sweepVisits','ruleEvaluations','rows','nodes','marginCandidates'];
const POLICY_FIELDS=['schema','cutpointMode','decisionMode','representation','representationHash','modelArtifactHash','modelParameterHash',
  'modelTrainingHash','modelProvenanceHash','taxonomyHash','calibrationHash','calibrationIdHashes','calibrationGroupHashes',
  'minimumAcceptedGroups','targetPrecision','nodeObservations','rules','calibrationWork','experimental','productionValidated','assignmentAuthority','policyHash'];

/** Fresh, independent CALIBRATION rows only. Observed cutpoints are not quality
 * guarantees. No caller-supplied feature packets are accepted. */
export function calibrateHierarchyHeadPolicy(input){
  const {model,rows,minimumAcceptedGroups,targetPrecision}=exact(data(input),['model','rows','minimumAcceptedGroups','targetPrecision']);
  if(!Array.isArray(rows)||!rows.length||rows.length>512)capacity();
  if(!Number.isInteger(minimumAcceptedGroups)||minimumAcceptedGroups<3||minimumAcceptedGroups>512||targetPrecision!==1)invalid();
  const compiled=compileHierarchyLinearHeads(model),meta=taxonomy(model),preflightUpperBound=observedHeadPolicyWorkUpperBound(rows.length,meta.nodes.length);
  if(preflightUpperBound>OBSERVED_HEAD_POLICY_LIMITS.maxCalibrationWork)capacity();
  const work={preflightUpperBound,units:0,scoringCoordinateProducts:0,validationUnits:0,featureComparisons:0,
    sortComparisons:0,sweepVisits:0,ruleEvaluations:0,rows:rows.length,nodes:meta.nodes.length,marginCandidates:0};
  const charge=(count,kind)=>{work.units+=count;work[kind]+=count;if(work.units>preflightUpperBound||work.units>OBSERVED_HEAD_POLICY_LIMITS.maxCalibrationWork)capacity();};
  const ids=new Set(),groups=new Set(),trainingIds=new Set(model.trainingIdHashes),trainingGroups=new Set(model.trainingGroupHashes);
  const byNode=new Map(meta.nodes.map(n=>[n.id,[]]));
  // Validate EVERY split witness before any score operation.
  for(const row of rows){
    charge(10,'validationUnits');exact(row,['id','groupId','split','language','expectedTopicId','vector']);
    identifier(row.id);identifier(row.groupId);identifier(row.language);
    if(row.split!=='calibration'||ids.has(row.id)||groups.has(row.groupId)||trainingIds.has(hash(row.id))||trainingGroups.has(hash(row.groupId))||
        row.expectedTopicId!==null&&!meta.paths.has(row.expectedTopicId))invalid();
    ids.add(row.id);groups.add(row.groupId);
  }
  for(const row of rows){
    const packet=scoreHierarchyLinearHeads(compiled,{sourceId:row.id,sourceVersion:row.split,representation:model.representation,
      representationHash:model.representationHash,vector:row.vector});
    charge(packet.work.scalarProducts,'scoringCoordinateProducts');charge(768,'validationUnits');
    const positive=row.expectedTopicId===null?[]:meta.paths.get(row.expectedTopicId);
    for(const feature of featureRows(meta,packet,charge)){
      charge(positive.length+1,'featureComparisons');
      byNode.get(feature.nodeId).push({idHash:hash(row.id),groupHash:hash(row.groupId),score:feature.score,
        siblingMargin:feature.siblingMargin,correct:positive.includes(feature.nodeId)});
    }
  }
  const nodeObservations=[],rules=meta.nodes.map(node=>{
    const observations=byNode.get(node.id),active=observations.filter(r=>r.score!==null);
    const ordered=mergeSort(active,(a,b)=>b.score-a.score||lexical(a.idHash,b.idHash),charge);
    const scoreCutpoints=[];for(const row of ordered)if(!scoreCutpoints.length||scoreCutpoints.at(-1)!==row.score)scoreCutpoints.push(row.score===0?0:row.score);
    scoreCutpoints.reverse();
    const margins=mergeSort([0,...active.filter(r=>r.siblingMargin!==null&&r.siblingMargin>0).map(r=>r.siblingMargin)],(a,b)=>a-b,charge);
    const marginCutpoints=margins.filter((value,i)=>!i||value!==margins[i-1]);work.marginCandidates+=marginCutpoints.length;
    nodeObservations.push({nodeId:node.id,scoreCutpoints,marginCutpoints,observationHash:digest({nodeId:node.id,observations})});
    let best=null;
    for(const minMargin of marginCutpoints){
      let acceptedGroups=0,correctGroups=0;
      for(let i=0;i<ordered.length;){
        const minScore=ordered[i].score===0?0:ordered[i].score;let end=i;
        // Inclusive cutoff: equal-score rows ALWAYS enter as one whole group.
        while(end<ordered.length&&ordered[end].score===ordered[i].score){
          charge(1,'sweepVisits');const row=ordered[end++];
          if(row.siblingMargin===null||row.siblingMargin>0&&row.siblingMargin>=minMargin){acceptedGroups++;if(row.correct)correctGroups++;}
        }
        charge(1,'ruleEvaluations');i=end;
        if(acceptedGroups<minimumAcceptedGroups||correctGroups!==acceptedGroups)continue;
        const candidate={nodeId:node.id,enabled:true,minScore,minMargin,acceptedGroups,correctGroups};
        if(!best||correctGroups>best.correctGroups||correctGroups===best.correctGroups&&
          (acceptedGroups<best.acceptedGroups||acceptedGroups===best.acceptedGroups&&
            (minMargin>best.minMargin||minMargin===best.minMargin&&minScore>best.minScore)))best=candidate;
      }
    }
    return best??{nodeId:node.id,enabled:false,minScore:0,minMargin:0,acceptedGroups:0,correctGroups:0};
  });
  const body={schema:SCHEMA,cutpointMode:MODE,decisionMode:'single-path-root-contrast',representation:model.representation,
    representationHash:model.representationHash,modelArtifactHash:digest(model),modelParameterHash:model.parameterHash,
    modelTrainingHash:model.trainingHash,modelProvenanceHash:model.provenanceHash,taxonomyHash:model.taxonomyHash,
    calibrationHash:digest(rows),calibrationIdHashes:rows.map(r=>hash(r.id)).sort(),calibrationGroupHashes:rows.map(r=>hash(r.groupId)).sort(),
    minimumAcceptedGroups,targetPrecision,nodeObservations,rules,calibrationWork:work,
    experimental:true,productionValidated:false,assignmentAuthority:false};
  return freeze({...body,policyHash:digest(body)});
}

export function compileHierarchyHeadAssignment(input){
  const {model,policy}=exact(data(input),['model','policy']);
  const compiled=compileHierarchyLinearHeads(model),meta=taxonomy(model);exact(policy,POLICY_FIELDS);
  const {policyHash,...body}=policy;
  if(!sha(policyHash)||digest(body)!==policyHash||policy.schema!==SCHEMA||policy.cutpointMode!==MODE||policy.decisionMode!=='single-path-root-contrast'||
      policy.experimental!==true||policy.productionValidated!==false||policy.assignmentAuthority!==false||
      policy.representation!==model.representation||policy.representationHash!==model.representationHash||policy.modelArtifactHash!==digest(model)||
      policy.modelParameterHash!==model.parameterHash||policy.modelTrainingHash!==model.trainingHash||policy.modelProvenanceHash!==model.provenanceHash||
      policy.taxonomyHash!==model.taxonomyHash||!sha(policy.calibrationHash)||policy.targetPrecision!==1||
      !Number.isInteger(policy.minimumAcceptedGroups)||policy.minimumAcceptedGroups<3||policy.minimumAcceptedGroups>512)invalid();
  for(const [key,training] of [['calibrationIdHashes',model.trainingIdHashes],['calibrationGroupHashes',model.trainingGroupHashes]]){
    const values=policy[key];if(!Array.isArray(values)||!values.length||values.length>512||values.some((v,i)=>!sha(v)||i>0&&lexical(values[i-1],v)>=0||training.includes(v)))invalid();
  }
  const n=policy.calibrationIdHashes.length;
  if(n!==policy.calibrationGroupHashes.length||!Array.isArray(policy.nodeObservations)||policy.nodeObservations.length!==meta.nodes.length||
      !Array.isArray(policy.rules)||policy.rules.length!==meta.nodes.length)invalid();
  const observations=new Map(),heads=new Map(model.heads.map(h=>[h.nodeId,h]));
  for(const o of policy.nodeObservations){
    exact(o,['nodeId','scoreCutpoints','marginCutpoints','observationHash']);
    if(!meta.paths.has(o.nodeId)||observations.has(o.nodeId)||!sha(o.observationHash)||!Array.isArray(o.scoreCutpoints)||o.scoreCutpoints.length>n||
        !Array.isArray(o.marginCutpoints)||!o.marginCutpoints.length||o.marginCutpoints.length>n+1||o.marginCutpoints[0]!==0)invalid();
    for(const values of [o.scoreCutpoints,o.marginCutpoints])for(let i=0;i<values.length;i++){
      finite(values[i]);if(i&&values[i]<=values[i-1])invalid();
    }
    if(heads.get(o.nodeId).enabled?o.scoreCutpoints.length===0:o.scoreCutpoints.length!==0||o.marginCutpoints.length!==1)invalid();
    observations.set(o.nodeId,o);
  }
  const rules=new Map();
  for(const rule of policy.rules){
    exact(rule,['nodeId','enabled','minScore','minMargin','acceptedGroups','correctGroups']);
    if(!meta.paths.has(rule.nodeId)||rules.has(rule.nodeId)||typeof rule.enabled!=='boolean')invalid();
    finite(rule.minScore);finite(rule.minMargin);if(rule.minMargin<0)invalid();
    if(!Number.isInteger(rule.acceptedGroups)||rule.acceptedGroups<0||rule.acceptedGroups>n||!Number.isInteger(rule.correctGroups)||
        rule.correctGroups<0||rule.correctGroups>rule.acceptedGroups)invalid();
    const observation=observations.get(rule.nodeId);
    if(rule.enabled?(!heads.get(rule.nodeId).enabled||rule.acceptedGroups<policy.minimumAcceptedGroups||rule.correctGroups!==rule.acceptedGroups||
      !observation.scoreCutpoints.includes(rule.minScore)||!observation.marginCutpoints.includes(rule.minMargin)):
      rule.minScore!==0||rule.minMargin!==0||rule.acceptedGroups!==0||rule.correctGroups!==0)invalid();
    rules.set(rule.nodeId,rule);
  }
  const work=exact(policy.calibrationWork,WORK_FIELDS),bound=observedHeadPolicyWorkUpperBound(n,meta.nodes.length);
  for(const key of WORK_FIELDS)if(!Number.isSafeInteger(work[key])||work[key]<0)invalid();
  if(bound>OBSERVED_HEAD_POLICY_LIMITS.maxCalibrationWork||work.preflightUpperBound!==bound||work.rows!==n||work.nodes!==meta.nodes.length||
      work.units>bound||work.units!==['scoringCoordinateProducts','validationUnits','featureComparisons','sortComparisons','sweepVisits','ruleEvaluations'].reduce((sum,k)=>sum+work[k],0)||
      work.scoringCoordinateProducts!==n*model.heads.filter(h=>h.enabled).length*384||
      work.marginCandidates!==policy.nodeObservations.reduce((sum,o)=>sum+o.marginCutpoints.length,0))invalid();
  const handle=Object.freeze({});handles.set(handle,{model,policy,compiled,meta,rules});return handle;
}

export function classifyHierarchyHeads(handle,witness){
  if(arguments.length!==2)invalid();const state=handles.get(handle);if(!state)invalid();
  const packet=scoreHierarchyLinearHeads(state.compiled,witness),features=featureRows(state.meta,packet).map(f=>({...f,accepted:passes(f,state.rules.get(f.nodeId))}));
  const byId=new Map(features.map(f=>[f.nodeId,f])),accepted=features.filter(f=>f.accepted);
  const deepest=accepted.filter(f=>!accepted.some(other=>other.nodeId!==f.nodeId&&state.meta.paths.get(other.nodeId).includes(f.nodeId)));
  const roots=new Map();for(const f of deepest){const root=state.meta.paths.get(f.nodeId)[0],ids=roots.get(root)??[];ids.push(f.nodeId);roots.set(root,ids);}
  const candidates=[];
  for(const [root,ids]of roots){
    const contrast=byId.get(root),rule=state.rules.get(root);
    if(state.meta.roots.length>1&&(contrast.score===null||contrast.siblingMargin!==null&&!(contrast.siblingMargin>0&&contrast.siblingMargin>=rule.minMargin)))continue;
    if(ids.length===1){candidates.push(ids[0]);continue;}
    const paths=ids.map(id=>state.meta.paths.get(id));let length=0;
    while(length<paths[0].length&&paths.every(p=>p[length]===paths[0][length]))length++;
    for(let i=length-1;i>=0;i--)if(byId.get(paths[0][i]).accepted){candidates.push(paths[0][i]);break;}
  }
  const primaryNodeId=candidates.length===1?candidates[0]:null;
  return freeze({schema:'hierarchical-e5-observed-head-decision-v1',algorithmVersion:'observed-heads-single-path-root-contrast/v1',
    sourceId:packet.sourceId,sourceVersion:packet.sourceVersion,representation:packet.representation,representationHash:packet.representationHash,
    trainingHash:state.model.trainingHash,modelArtifactHash:state.policy.modelArtifactHash,modelParameterHash:state.model.parameterHash,
    taxonomyHash:state.model.taxonomyHash,calibrationHash:state.policy.calibrationHash,policyHash:state.policy.policyHash,
    status:primaryNodeId===null?'unresolved':'assigned',primaryNodeId,paths:primaryNodeId===null?[]:[[...state.meta.paths.get(primaryNodeId)]],
    reason:primaryNodeId!==null?state.meta.parents.has(primaryNodeId)?'supported-parent-stop':'supported-specific-node':roots.size?'ambiguous-branches':'insufficient-evidence',
    features,work:packet.work,experimental:true,productionValidated:false,assignmentAuthority:false});
}
export function describeHierarchyHeadAssignment(handle){
  const state=handles.get(handle);if(!state)invalid();return freeze({schema:SCHEMA,cutpointMode:MODE,policyHash:state.policy.policyHash,
    modelArtifactHash:state.policy.modelArtifactHash,representation:state.model.representation,representationHash:state.model.representationHash,
    nodes:state.meta.nodes.map(n=>({...n})),experimental:true,productionValidated:false,assignmentAuthority:false});
}
