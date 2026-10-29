// Public identity recovery is an explicit publication composition. No IO/model,
// Source retention or authority: SQL must recheck this entire public snapshot,
// current protected Source vectors and the identity revision in its transaction.
import {createHash} from 'node:crypto';
import {planAutomaticNamedSubjectsV2} from './automatic-named-subject-plan.js';
import {publishedTopicInput,PUBLISHED_TOPIC_INPUT_HASH} from './published-topic-evidence.js';
const bad=()=>{throw new TypeError('Invalid public topic recovery publication');};
const shape=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v);
const count=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/u.test(v)&&BigInt(v)<=9223372036854775807n;
const unit=v=>Array.isArray(v)&&v.length===384&&v.every(n=>typeof n==='number'&&Number.isFinite(n))&&Math.abs(Math.hypot(...v)-1)<1e-5;
const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),order=(a,b)=>a<b?-1:a>b?1:0;
const freeze=v=>{if(v&&typeof v==='object'){for(const c of Object.values(v))freeze(c);Object.freeze(v);}return v;};
export const PUBLIC_IDENTITY_RECOVERY_POLICY=freeze({schema:'public-identity-recovery-policy/v1',
 minimumSimilarity:.88,minimumMargin:.03,maximumCandidates:64,maximumMembers:64,
 marginBaseline:'all-current-compatible-public-scopes-including-below-floor',
 identityRule:'current-public-root-and-absent-head-with-opaque-identity-revision-CAS',
 existingPublishedHeads:'no-automatic-merge-or-reparent',inputHash:PUBLISHED_TOPIC_INPUT_HASH});
export const PUBLIC_IDENTITY_RECOVERY_POLICY_HASH=createHash('sha256').update(JSON.stringify(PUBLIC_IDENTITY_RECOVERY_POLICY)).digest('hex');
export const publicRecoveryWitness=c=>({rootId:c.rootId,topicId:c.topicId,rootVersion:c.rootVersion,
 publicDigest:c.publicDigest,identityRevision:c.identityRevision,focusKey:c.focusKey,headPresent:c.headPresent});

export function planPublishedTopicRecovery(raw){
 if(arguments.length!==1||typeof raw!=='string'||Buffer.byteLength(raw)>6291456)bad();let a;
 try{a=JSON.parse(raw);}catch{bad();}
 if(!shape(a,['input','publicCandidates'])||!Array.isArray(a.publicCandidates)||a.publicCandidates.length>64)bad();
 const original=planAutomaticNamedSubjectsV2(JSON.stringify(a.input)),plan=structuredClone(original),seen=new Set();
 const focusKeys=[...new Set(plan.updates.map(u=>u.focusKey))].sort();
 const candidates=a.publicCandidates.map(c=>{
  if(!shape(c,['rootId','topicId','caption','body','rootVersion','publicDigest','representationHash','focusKey','inputHash','vector','identityRevision','headPresent'])||
    !uuid(c.topicId)||!count(c.rootVersion)||!count(c.identityRevision)||c.identityRevision==='0'||!hash(c.publicDigest)||
    c.representationHash!==a.input.representationHash||c.inputHash!==PUBLISHED_TOPIC_INPUT_HASH||!unit(c.vector)||
    typeof c.headPresent!=='boolean'||seen.has(c.topicId)||!focusKeys.includes(c.focusKey))bad();
  const input=publishedTopicInput(JSON.stringify({rootId:c.rootId,topicId:c.topicId,caption:c.caption,body:c.body}));
  if(!input.meaningful||input.publicDigest!==c.publicDigest||input.focusKey!==c.focusKey)bad();seen.add(c.topicId);return c;
 });
 const rows=new Map(a.input.observations.map(r=>[r.sourceId,r])),remap=new Map(),removed=new Set(),proofs=[],claimed=new Set();
 for(const u of plan.updates){
  // Existing current heads already have a revision-checked publication path.
  // Independent text cannot silently merge two already published identities.
  if(u.expectedRevision!==null)continue;
  const ranked=candidates.filter(c=>c.focusKey===u.focusKey).map(c=>({c,score:Math.min(...u.members.map(m=>dot(rows.get(m.sourceId).vector,c.vector)))}))
   .sort((x,y)=>y.score-x.score||order(x.c.topicId,y.c.topicId));
  if(!ranked.length||ranked[0].score<PUBLIC_IDENTITY_RECOVERY_POLICY.minimumSimilarity)continue;
  const {c}=ranked[0];let refusal=null;
  if(ranked.length>1&&ranked[0].score-ranked[1].score<PUBLIC_IDENTITY_RECOVERY_POLICY.minimumMargin)refusal='ambiguous-public-subject';
  else if(c.headPresent)refusal='public-subject-has-unresolved-active-head';
  else if(claimed.has(c.topicId))refusal='conflicting-public-subject';
  if(refusal){removed.add(u.subjectId);const d=plan.decisions.find(d=>d.subjectId===u.subjectId);if(d){d.status=refusal;d.subjectId=null;}continue;}
  claimed.add(c.topicId);remap.set(u.subjectId,c.topicId);proofs.push(publicRecoveryWitness(c));u.expectedRevision=c.identityRevision;
  const d=plan.decisions.find(d=>d.subjectId===u.subjectId);if(d)d.status='recover-published-subject';
 }
 const parents=new Map(plan.updates.map(u=>[u.subjectId,u.parentId]));
 plan.updates=plan.updates.filter(u=>!removed.has(u.subjectId)).map(u=>{
  while(u.parentId!==null&&removed.has(u.parentId))u.parentId=parents.get(u.parentId)??null;
  u.subjectId=remap.get(u.subjectId)??u.subjectId;u.parentId=remap.get(u.parentId)??u.parentId;return u;
 });
 for(const d of plan.decisions)if(d.subjectId!==null)d.subjectId=remap.get(d.subjectId)??d.subjectId;
 for(const s of plan.selections){
  // Refusing a narrow identity must not discard a still-confident broader
  // proposal. Follow only the already-proved parent chain in this same plan.
  while(s.subjectId!==null&&removed.has(s.subjectId))s.subjectId=parents.get(s.subjectId)??null;
  s.subjectId=remap.get(s.subjectId)??s.subjectId;
  if(s.subjectId===null)s.reason='page-context-only';
 }
 plan.publicRecovery={policyHash:PUBLIC_IDENTITY_RECOVERY_POLICY_HASH,focusKeys,
  candidates:candidates.map(publicRecoveryWitness).sort((x,y)=>order(x.topicId,y.topicId)),proofs:proofs.sort((x,y)=>order(x.topicId,y.topicId))};
 return freeze(plan);
}
