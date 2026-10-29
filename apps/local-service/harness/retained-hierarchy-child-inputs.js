// Offline retained TRAIN/CAL projection only. No IO, encoding or registration.
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';

export const CHILD_TASKS=Object.freeze(['video-games','animals','koalas']);
const invalid=()=>{throw new TypeError('Invalid retained child inputs');};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
const text=value=>typeof value==='string'&&value.length>0&&value.length<=160&&value.trim()===value;
function binding(row){
 if(hash(row.sourceInputHash))return {kind:'source-input-hash',sha256:row.sourceInputHash};
 const p=row.casePin;
 if(row.sourceInputHash===null&&row.cohort==='gta-repaired-fit'&&p&&p.file===row.id+'.json'&&
  Number.isSafeInteger(p.bytes)&&p.bytes>0&&p.bytes<=4194304&&hash(p.sha256))return {kind:'pinned-case-file',casePin:{file:p.file,bytes:p.bytes,sha256:p.sha256}};
 invalid();
}

export function projectRetainedHierarchyChildRows({corpus,pairs,inputDefinition}){
 if(!corpus||!Array.isArray(corpus.reviewedArchivedRows)||corpus.reviewedArchivedRows.length>256||!(pairs instanceof Map))invalid();
 const adapter=compilePairedE5Input(inputDefinition),representation=describePairedE5Input(adapter);
 const rows=[],quarantined=[],ids=new Set(),groups=new Set();
 for(const row of corpus.reviewedArchivedRows){
  if(!row||!text(row.id)||!text(row.groupId)||typeof row.reuseEligible!=='boolean'||ids.has(row.id))invalid();
  const labelBinding=binding(row);
  ids.add(row.id);
  if(!row.reuseEligible){quarantined.push(row.id);continue;}
  if(!['training','calibration'].includes(row.split)||!Array.isArray(row.heldoutDocumentCollisions)||row.heldoutDocumentCollisions.length||
   !text(row.language)||!row.labels||Object.keys(row.labels).sort().join()!==[...CHILD_TASKS].sort().join()||
   CHILD_TASKS.some(node=>row.labels[node]!==null&&typeof row.labels[node]!=='boolean')||groups.has(row.groupId))invalid();
  if(!text(row.expectedRootId)||row.labels['video-games']===true&&row.expectedRootId!=='games'||
   row.labels.animals===true&&row.expectedRootId!=='nature'||row.labels.koalas===true&&row.labels.animals!==true)invalid();
  groups.add(row.groupId);const raw=pairs.get(row.id);
  if(!raw||raw.id!==row.id||!hash(raw.sourceInputHash))invalid();
  if(labelBinding.kind==='source-input-hash'){if(raw.sourceInputHash!==labelBinding.sha256)invalid();}
  else{const p=raw.labelCasePin,expected=labelBinding.casePin;if(!p||p.file!==expected.file||p.bytes!==expected.bytes||p.sha256!==expected.sha256)invalid();}
  const query={sourceId:row.id,sourceVersion:raw.sourceInputHash,bodyVector:raw.bodyVector,titleVector:raw.titleVector};
  const fused=applyPairedE5Input(adapter,query);if(fused.status!=='available')invalid();
  rows.push({...query,id:row.id,groupId:row.groupId,split:row.split,language:row.language,
   expectedRootId:row.expectedRootId,labels:{...row.labels},labelBinding,vector:fused.vector});
 }
 const omitted=corpus.unknownArchivedRoster;
 if(!omitted||!Array.isArray(omitted.training)||!Array.isArray(omitted.calibration))invalid();
 const unknown=[...omitted.training,...omitted.calibration];if(unknown.length>512||unknown.some(row=>!text(row.id)||ids.has(row.id))||new Set(unknown.map(row=>row.id)).size!==unknown.length)invalid();
 return {representation,rows,quarantined,unknownOmitted:unknown.map(row=>row.id)};
}

export function retainedChildTrainingArguments(projected,nodeId){
 if(!CHILD_TASKS.includes(nodeId)||!projected||!Array.isArray(projected.rows))invalid();
 const path=nodeId==='video-games'?['games','video-games']:nodeId==='animals'?['nature','animals']:['nature','animals','koalas'];
 return {nodeId,canonicalPath:path,representation:projected.representation.representation,
  representationHash:projected.representation.representationHash,trainingVersion:'retained-reviewed-child-subjects/20261029/'+nodeId,
  trainingRows:projected.rows.filter(r=>r.split==='training').map(r=>({id:r.id,groupId:r.groupId,label:r.labels[nodeId],vector:r.vector})),
  calibrationRows:projected.rows.filter(r=>r.split==='calibration').map(r=>({id:r.id,groupId:r.groupId,label:r.labels[nodeId],vector:r.vector,language:r.language}))};
}

// The root gate already supplies branch membership. A child can learn the
// distinction inside that branch instead of spending capacity relearning roots.
// These are editor-reviewed parent labels, never predictions or guessed labels.
export function parentConditionedChildTrainingArguments(projected,nodeId,mode){
 if(!['parent-training','parent-training-and-calibration'].includes(mode))invalid();
 const original=retainedChildTrainingArguments(projected,nodeId),inside=row=>nodeId==='koalas'?row.labels.animals===true:row.expectedRootId===original.canonicalPath[0];
 const trainingIds=new Set(projected.rows.filter(r=>r.split==='training'&&inside(r)).map(r=>r.id));
 const calibrationIds=new Set(projected.rows.filter(r=>r.split==='calibration'&&inside(r)).map(r=>r.id));
 return {...original,trainingVersion:'parent-conditioned-child/20261029/'+mode+'/'+nodeId,
  trainingRows:original.trainingRows.filter(r=>trainingIds.has(r.id)),
  calibrationRows:mode==='parent-training-and-calibration'?original.calibrationRows.filter(r=>calibrationIds.has(r.id)):original.calibrationRows};
}

// Off-branch examples cannot establish hard-negative performance within a parent.
export function summarizeParentConditionedChildRows(rows,nodeId){
 if(!CHILD_TASKS.includes(nodeId)||!Array.isArray(rows))invalid();
 const result={insideKnownPositive:0,insideKnownNegative:0,outsideKnownNegative:0,parentUnknownKnownNegative:0,
  acceptedInsidePositive:0,acceptedInsideNegative:0,acceptedOutsideNegative:0,omittedUnknownLabel:0};
 for(const row of rows){const label=row.labels[nodeId];if(label===null){result.omittedUnknownLabel++;continue;}if(typeof label!=='boolean')invalid();
  const parent=nodeId==='koalas'?row.labels.animals:row.expectedRootId===(nodeId==='video-games'?'games':'nature'),accepted=row.decisions[nodeId].accepted;
  if(typeof accepted!=='boolean')invalid();
  if(parent===true){result[label?'insideKnownPositive':'insideKnownNegative']++;if(accepted)result[label?'acceptedInsidePositive':'acceptedInsideNegative']++;}
  else if(label===false){result[parent===false?'outsideKnownNegative':'parentUnknownKnownNegative']++;if(parent===false&&accepted)result.acceptedOutsideNegative++;}
  else invalid();
 }return result;
}
