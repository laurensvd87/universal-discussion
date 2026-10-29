// Bounded offline experiment. Public discussion text is independent evidence;
// erased Source names/vectors are never a recovery index. No IO or assignment.
import {createHash} from 'node:crypto';
const HASH=/^[a-f0-9]{64}$/u,ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const id=v=>typeof v==='string'&&ID.test(v);
const fail=()=>{throw new TypeError('Invalid published-topic recovery input');};
const shape=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const text=(v,max)=>typeof v==='string'&&v.isWellFormed()&&v.trim()===v&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(v);
const norm=v=>v.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const unit=v=>Array.isArray(v)&&v.length===384&&v.every(n=>typeof n==='number'&&Number.isFinite(n))&&Math.abs(Math.hypot(...v)-1)<1e-5;
const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
const words=new Intl.Segmenter('und',{granularity:'word'});
export const PUBLIC_RECOVERY_POLICY=freeze({schema:'public-topic-recovery-policy/v2',maximumCandidates:64,maximumMembers:64,
 minimumSimilarity:.88,minimumMargin:.03,minimumPublicWords:6,maximumPublicBody:2000,
 marginBaseline:'all-compatible-public-scopes-including-below-floor',
 strategies:['literal-name','public-semantic','literal-and-public-semantic'],productionValidated:false});
export const PUBLIC_RECOVERY_POLICY_HASH=sha(PUBLIC_RECOVERY_POLICY);

// Only expressly published caption/body are encoder inputs. No origin URL,
// Source digest, old Source vector, hidden accepted path or current page title.
// Normalize whitespace deterministically; both exact public strings are hashed.
export function publicTopicEncoderInput(rawJson){
 if(arguments.length!==1||typeof rawJson!=='string'||Buffer.byteLength(rawJson)>16384)fail();let a;
 try{a=JSON.parse(rawJson);}catch{fail();}
 if(!shape(a,['rootId','topicId','caption','body'])||!id(a.rootId)||!id(a.topicId)||!text(a.caption,200)||
    typeof a.body!=='string'||!a.body.isWellFormed()||!a.body.trim()||a.body.length>8000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(a.body))fail();
 let body=a.body.normalize('NFKC').replace(/\s+/gu,' ').trim().slice(0,PUBLIC_RECOVERY_POLICY.maximumPublicBody);
 if(!body.isWellFormed())body=body.slice(0,-1);
 const title=a.caption.normalize('NFKC');
 if(!text(title,512)||!norm(title))fail();
 return freeze({schema:'public-topic-encoder-input/v1',rootId:a.rootId,topicId:a.topicId,
  publicDigest:sha([a.rootId,a.topicId,a.caption,a.body]),caption:a.caption,titleInput:title,bodyInput:body,
  meaningful:[...words.segment(body)].filter(w=>w.isWordLike&&/\p{L}/u.test(w.segment)).length>=PUBLIC_RECOVERY_POLICY.minimumPublicWords,
  sourceUsed:false});
}

// Producer must compute each candidate vector from the returned public encoder
// input using this exact representation. This pure scorer does not attest an
// encoder/SQL issuer or establish identity from an embedding by itself.
export function comparePublishedTopicRecovery(rawJson){
 if(arguments.length!==1||typeof rawJson!=='string'||Buffer.byteLength(rawJson)>4194304)fail();let a;
 try{a=JSON.parse(rawJson);}catch{fail();}
 if(!shape(a,['representationHash','label','memberVectors','candidates'])||!HASH.test(a.representationHash)||!text(a.label,80)||!norm(a.label)||
   !Array.isArray(a.memberVectors)||a.memberVectors.length<2||a.memberVectors.length>64||!a.memberVectors.every(unit)||
   !Array.isArray(a.candidates)||a.candidates.length>64)fail();
 const evidence=[],seen=new Set();
 for(const raw of a.candidates){
  if(!shape(raw,['rootId','topicId','caption','body','publicDigest','representationHash','vector'])||
     raw.representationHash!==a.representationHash||!HASH.test(raw.publicDigest)||!unit(raw.vector)||seen.has(raw.rootId))fail();
  const input=publicTopicEncoderInput(JSON.stringify({rootId:raw.rootId,topicId:raw.topicId,caption:raw.caption,body:raw.body}));
  if(input.publicDigest!==raw.publicDigest)fail();seen.add(raw.rootId);
  evidence.push({topicId:raw.topicId,rootId:raw.rootId,publicDigest:raw.publicDigest,literal:norm(raw.caption)===norm(a.label),meaningful:input.meaningful,
   score:Math.min(...a.memberVectors.map(v=>dot(v,raw.vector)))});
 }
 const decisions=PUBLIC_RECOVERY_POLICY.strategies.map(strategy=>{
  const byTopic=new Map();
  for(const e of evidence){
   if(strategy==='literal-name'?!e.literal:!e.meaningful||strategy==='literal-and-public-semantic'&&!e.literal)continue;
   const old=byTopic.get(e.topicId);if(!old||e.score>old.score||e.score===old.score&&e.rootId<old.rootId)byTopic.set(e.topicId,e);
  }
  const ranked=[...byTopic.values()].sort((x,y)=>y.score-x.score||(x.topicId<y.topicId?-1:1));
  const qualifies=ranked.length>0&&(strategy==='literal-name'||ranked[0].score>=PUBLIC_RECOVERY_POLICY.minimumSimilarity);
  const ambiguous=qualifies&&ranked.length>1&&(strategy==='literal-name'||ranked[0].score-ranked[1].score<PUBLIC_RECOVERY_POLICY.minimumMargin);
  const chosen=qualifies&&!ambiguous?ranked[0]:null;
  return {strategy,status:ambiguous?'ambiguous':chosen?'recommended':'unresolved',topicId:chosen?.topicId??null,
   rootId:chosen?.rootId??null,publicDigest:chosen?.publicDigest??null,score:chosen?.score??null,
   eligibleTopics:ranked.filter(e=>strategy==='literal-name'||e.score>=PUBLIC_RECOVERY_POLICY.minimumSimilarity).length};
 });
 return freeze({schema:'public-topic-recovery-comparison/v2',policyHash:PUBLIC_RECOVERY_POLICY_HASH,representationHash:a.representationHash,decisions,
  work:{members:a.memberVectors.length,candidates:evidence.length,coordinateProducts:a.memberVectors.length*evidence.length*384},
  assignmentAuthority:false,registryChanged:false,sourceMetadataRetained:false,eventIdentityAsserted:false});
}
