// General-web named subjects. No Wikipedia/entity service, predefined child
// vocabulary, LLM, model load, database write or canonical discussion routing.
// Bounded retrieved candidates are inputs, not a full topic catalog. The SQL
// publisher must recheck all Source fences and existing revision CAS atomically.
import {randomUUID,createHash} from 'node:crypto';
import {proposeFocusedSubjects} from '../../experiments/automatic-topic-discovery-v1/focus-subjects.js';
import {proposeFocusedSubjects as proposeGeneralSubjects} from '../../experiments/automatic-topic-discovery-v2/focus-subjects.js';
const fail=()=>{throw new TypeError('Invalid general named subject publication');};
const shape=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const HASH=/^[a-f0-9]{64}$/u,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const counter=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/u.test(v)&&BigInt(v)<=9223372036854775807n;
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(v);
const freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
const vector=v=>Array.isArray(v)&&v.length===384&&v.every(n=>typeof n==='number'&&Number.isFinite(n))&&Math.abs(Math.hypot(...v)-1)<1e-5;
const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
function centroid(rows){const mean=Array(384).fill(0);for(const row of rows)for(let i=0;i<384;i++)mean[i]+=row.vector[i]/rows.length;const norm=Math.hypot(...mean);if(norm<1e-12)fail();return mean.map(n=>n/norm);}

// Explicit policy identity: a v1 caller must never silently acquire the relaxed
// publisher rule. This descriptor is data, not an activation or quality claim.
export const GENERAL_SUBJECT_POLICY_V2=freeze({schema:'general-named-subject-policy/v2',
 algorithmSchema:'automatic-focus-subjects/v2',
 algorithmSha256:'55d20893a961274cbaf122d60d1f1b6afda5fea453ddd9ac961aa004f6d32b92',
 minimumSimilarity:.8,minimumDistinctMaterials:2,independentPublishersRequired:false,
 maximumObservations:64,maximumCandidates:64,kind:'subject',eventIdentityAsserted:false});
export const GENERAL_SUBJECT_POLICY_V2_HASH=sha(GENERAL_SUBJECT_POLICY_V2);

export function planAutomaticNamedSubjects(rawJson){
 if(arguments.length!==1)fail();
 return plan(rawJson,proposeFocusedSubjects,false);
}

export function planAutomaticNamedSubjectsV2(rawJson){
 if(arguments.length!==1)fail();
 return plan(rawJson,proposeGeneralSubjects,true);
}

function plan(rawJson,propose,v2){
 if(typeof rawJson!=='string'||Buffer.byteLength(rawJson)>1048576)fail();let input;
 try{input=JSON.parse(rawJson);}catch{fail();}
 if(!shape(input,['generation','policyHash','representationHash','matcherHash','minimumSimilarity','observations','sourceWitnesses','candidates'])||
    !id(input.generation)||!HASH.test(input.policyHash)||!Array.isArray(input.candidates)||input.candidates.length>64||
    !Array.isArray(input.sourceWitnesses)||input.sourceWitnesses.length>64)fail();
 if(v2&&(input.policyHash!==GENERAL_SUBJECT_POLICY_V2_HASH||input.minimumSimilarity!==GENERAL_SUBJECT_POLICY_V2.minimumSimilarity))fail();
 const proposal=propose(JSON.stringify({representationHash:input.representationHash,matcherHash:input.matcherHash,
  minimumSimilarity:input.minimumSimilarity,observations:input.observations}));
 const sourceMap=new Map(input.observations.map(row=>[row.sourceId,row])),witnessMap=new Map();
 for(const w of input.sourceWitnesses){
  if(!shape(w,['sourceId','sourceVersion','operationId','operationDigest','sourceStamp'])||!sourceMap.has(w.sourceId)||!counter(w.sourceVersion)||
     !id(w.operationId)||!HASH.test(w.operationDigest)||!HASH.test(w.sourceStamp)||witnessMap.has(w.sourceId))fail();witnessMap.set(w.sourceId,w);
 }
 if(witnessMap.size!==sourceMap.size)fail();
 const candidateIds=new Set();
 for(const c of input.candidates){
  if(!shape(c,['subjectId','revision','focusKey','contextRootId','prototypeValues','representationHash','parentId'])||typeof c.subjectId!=='string'||!UUID.test(c.subjectId)||
     !counter(c.revision)||c.revision==='0'||typeof c.focusKey!=='string'||!HASH.test(c.focusKey)||
     c.contextRootId!==null&&!id(c.contextRootId)||!vector(c.prototypeValues)||c.representationHash!==input.representationHash||
     c.parentId!==null&&(typeof c.parentId!=='string'||!UUID.test(c.parentId)||c.parentId===c.subjectId)||candidateIds.has(c.subjectId))fail();candidateIds.add(c.subjectId);
 }
 const updates=[],decisions=[],mapping=new Map(),used=new Set();
 for(const p of proposal.proposals){
  const rows=p.members.map(m=>sourceMap.get(m.sourceId)),roots=new Set(rows.map(r=>r.acceptedPath[0]).filter(Boolean));if(roots.size>1)fail();
  const contextRootId=[...roots][0]??null,focusKey=sha(p.focusTokens),prototypeValues=centroid(rows);
  const candidates=input.candidates.filter(c=>c.focusKey===focusKey&&c.contextRootId===contextRootId).map(c=>({c,score:Math.min(...rows.map(r=>dot(r.vector,c.prototypeValues)))}))
   .filter(x=>x.score>=input.minimumSimilarity).sort((a,b)=>b.score-a.score||a.c.subjectId.localeCompare(b.c.subjectId));
  if(candidates.length>1&&candidates[0].score-candidates[1].score<.01){decisions.push({proposalKey:p.proposalKey,status:'ambiguous-existing-scope',subjectId:null});continue;}
  const existing=candidates[0]?.c??null;let subjectId=existing?.subjectId??randomUUID();while(!existing&&candidateIds.has(subjectId))subjectId=randomUUID();candidateIds.add(subjectId);
  // A single stored subject cannot absorb two new distinct proposal branches in
  // one batch. Leave that conflict page-only rather than silently merging them.
  if(used.has(subjectId)){decisions.push({proposalKey:p.proposalKey,status:'conflicting-existing-scope',subjectId:null});continue;}
  used.add(subjectId);mapping.set(p.proposalKey,subjectId);
  updates.push({subjectId,expectedRevision:existing?.revision??null,kind:'subject',focusKey,contextRootId,label:p.label,labelWitness:p.labelWitness,
   parentId:existing?.parentId??null,parentProposalKey:p.parentProposalKey,acceptedAncestorPath:p.acceptedAncestorPath,
   prototypeValues,minimumPairSimilarity:p.minimumPairSimilarity,members:p.members.map(m=>({...m,...witnessMap.get(m.sourceId)}))});
  decisions.push({proposalKey:p.proposalKey,status:existing?'reuse-stable-subject':'create-new-subject',subjectId});
 }
 const byProposal=new Map(proposal.proposals.map(p=>[p.proposalKey,p]));
 for(const update of updates){
  let parent=update.parentProposalKey;while(parent&&!mapping.has(parent))parent=byProposal.get(parent)?.parentProposalKey??null;
  // A partial candidate cohort cannot remove an already established parent.
  // Existing reparenting requires its own owner/ancestry CAS, outside this plan.
  if(update.parentId===null)update.parentId=parent?mapping.get(parent):null;delete update.parentProposalKey;
 }
 if(v2){
  // Detect cycles visible in the retrieved cohort, including preserved parents.
  // The SQL transaction must still check ancestry outside this bounded input.
  const parents=new Map(input.candidates.map(c=>[c.subjectId,c.parentId]));
  for(const update of updates)parents.set(update.subjectId,update.parentId);
  for(const start of parents.keys()){
   const seen=new Set();let current=start;
   while(current!==null&&parents.has(current)){if(seen.has(current))fail();seen.add(current);current=parents.get(current);}
  }
 }
 const selections=proposal.selections.map(s=>{
  const matched=proposal.proposals.filter(p=>s.supportedProposalKeys.includes(p.proposalKey)&&mapping.has(p.proposalKey));
  const preferred=matched.find(p=>p.proposalKey===s.preferredProposalKey)??matched.filter(p=>!matched.some(q=>q.parentProposalKey===p.proposalKey))
   .sort((a,b)=>a.members.find(m=>m.sourceId===s.sourceId).focusStart-b.members.find(m=>m.sourceId===s.sourceId).focusStart||b.focusTokens.length-a.focusTokens.length)[0];
  return {sourceId:s.sourceId,sourceVersion:witnessMap.get(s.sourceId).sourceVersion,subjectId:preferred?mapping.get(preferred.proposalKey):null,
   reason:preferred?'most-specific-resolved-subject':'page-context-only'};
 });
 const usedSources=new Set(updates.flatMap(u=>u.members.map(m=>m.sourceId)));
 return freeze({schema:v2?'general-named-subject-publication-plan/v2':'general-named-subject-publication-plan/v1',generation:input.generation,policyHash:input.policyHash,
  representationHash:input.representationHash,matcherHash:input.matcherHash,updates,selections,decisions,
  commitWitnesses:[...witnessMap.values()].filter(w=>usedSources.has(w.sourceId)).sort((a,b)=>a.sourceId.localeCompare(b.sourceId)),
  proposalStatus:proposal.status,work:proposal.work,wikipediaRequired:false,providerUsed:false,registryChanged:false,
  assignmentAuthority:false,canonicalRoutesChanged:false,eventIdentityAsserted:false});
}
