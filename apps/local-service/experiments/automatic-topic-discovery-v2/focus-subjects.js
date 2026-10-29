// New general SUBJECT policy candidate; v1 remains frozen. Same-publisher distinct material may support a subject.
// Pure bounded named SUBJECT proposal experiment. A shared headline phrase can
// describe a subject spanning different events; it never asserts event identity.
import {createHash} from 'node:crypto';
const MAX=64,DIM=384,MAX_PATTERNS=12288,MAX_WORDS=8,MAX_PROPOSALS=128;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u,SHA=/^[a-f0-9]{64}$/u;
const STOP=new Set('a an and as at by for from in into is it its of on or our that the their this to we with de den der des die ein eine einer en een het in met op te van voor und von zu zum zur le la les du des un une et au aux pour avec il lo gli da del della di el los las una unos unas y con por'.split(' '));
const TEMPLATE_START=new Set('how what why when where who learn fix repair help guide guides review reviews official introduction introducing welcome shop buy compare discover wie was warum wann wo wer lernen hilfe reparatur anleitung test offiziell willkommen kaufen entdecken hoe wat waarom wanneer waar wie leren reparatie handleiding kopen ontdek'.split(' '));
const INSTRUCTION_TAIL=new Set('help guide guides tutorial tutorials review reviews repair official site website news hilfe anleitung reparatur handleiding hulp'.split(' '));
const bad=()=>{throw new TypeError('Invalid named-subject proposal input');};
const shape=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const frozen=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))frozen(x);Object.freeze(v);}return v;};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const order=(a,b)=>a<b?-1:a>b?1:0;
const segmenter=new Intl.Segmenter('und',{granularity:'word'});
function titlePatterns(title){
 const normalized=title.normalize('NFKC');if(normalized.length>512)return null;
 const output=new Map();let wordsRead=0;
 for(const chunk of normalized.matchAll(/[^|:;!?,–—]+/gu)){
  const words=[];for(const part of segmenter.segment(chunk[0]))if(part.isWordLike){
   if(++wordsRead>64)return null;const raw=part.segment,key=raw.toLowerCase();
   if(!/^[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*$/u.test(raw))continue;
   words.push({raw,key,start:chunk.index+part.index,end:chunk.index+part.index+raw.length});
  }
  for(let i=0;i<words.length;i++)for(let length=1;length<=MAX_WORDS&&i+length<=words.length;length++){
   const span=words.slice(i,i+length),first=span[0],last=span.at(-1);
   if(STOP.has(first.key)||STOP.has(last.key)||span.every(w=>!/[\p{L}]/u.test(w.raw)||STOP.has(w.key)))continue;
   const label=normalized.slice(first.start,last.end);if(label.length>80)continue;
   // Collect all occurrences; focal/named evidence is checked for the whole
   // supported phrase, so a mid-title occurrence can corroborate a focal one.
   const named=span.some(w=>!STOP.has(w.key)&&/\p{L}/u.test(w.raw)&&(w.raw!==w.raw.toLowerCase()||w.raw.toUpperCase()===w.raw.toLowerCase()));
   const cleanStart=first.raw!==first.raw.toLowerCase()||first.raw.toUpperCase()===first.raw.toLowerCase();
   const next=words[i+1],namedSuffix=length===1&&next&&/^\p{Lu}\p{Ll}[\p{L}\p{M}'’-]*$/u.test(next.raw)&&!STOP.has(next.key)?next.key:null;
   const key=span.map(w=>w.key).join('\u001f');if(!output.has(key))output.set(key,{key,tokens:span.map(w=>w.key),label,start:first.start,end:last.end,named,cleanStart,namedSuffix,focal:first.start===0});
   else{const old=output.get(key);old.named||=named;old.cleanStart||=cleanStart;old.focal||=first.start===0;}
  }
 }
 return output;
}
const contains=(whole,part)=>whole.length>part.length&&whole.some((_,i)=>part.every((v,j)=>whole[i+j]===v));

export function proposeFocusedSubjects(rawJson){
 if(arguments.length!==1||typeof rawJson!=='string'||rawJson.length>1048576)bad();let a;
 try{a=JSON.parse(rawJson);}catch{bad();}
 if(!shape(a,['representationHash','matcherHash','minimumSimilarity','observations'])||typeof a.representationHash!=='string'||!SHA.test(a.representationHash)||typeof a.matcherHash!=='string'||!SHA.test(a.matcherHash)||
  !Number.isFinite(a.minimumSimilarity)||a.minimumSimilarity<.8||a.minimumSimilarity>.99||!Array.isArray(a.observations)||a.observations.length>MAX)bad();
 const docs=a.observations;
 for(const d of docs){
  if(!shape(d,['sourceId','inputHash','materialHash','title','publisherKey','acceptedPath','vector'])||typeof d.sourceId!=='string'||!ID.test(d.sourceId)||typeof d.inputHash!=='string'||!SHA.test(d.inputHash)||typeof d.materialHash!=='string'||!SHA.test(d.materialHash)||
   typeof d.title!=='string'||!d.title.isWellFormed()||!d.title.trim()||d.title.length>200||/[\u0000-\u001f\u007f]/u.test(d.title)||
   typeof d.publisherKey!=='string'||!/^[a-z0-9][a-z0-9.-]{0,159}$/u.test(d.publisherKey)||!Array.isArray(d.acceptedPath)||d.acceptedPath.length>8||d.acceptedPath.some(v=>typeof v!=='string'||!ID.test(v))||new Set(d.acceptedPath).size!==d.acceptedPath.length||!Array.isArray(d.vector)||d.vector.length!==DIM)bad();
  let norm=0;for(const x of d.vector){if(typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>1)bad();norm+=x*x;}if(Math.abs(norm-1)>1e-5)bad();
 }
 if(new Set(docs.map(d=>d.sourceId)).size!==docs.length)bad();docs.sort((x,y)=>order(x.sourceId,y.sourceId));
 const publisherBoundary=docs.map(d=>d.title.normalize('NFKC').indexOf('|'));
 const n=docs.length,matrix=new Float64Array(n*n);let pairs=0,products=0,patternsSeen=0;
 for(let i=0;i<n;i++){matrix[i*n+i]=1;for(let j=0;j<i;j++){let sum=0;for(let k=0;k<DIM;k++)sum+=docs[i].vector[k]*docs[j].vector[k];matrix[i*n+j]=matrix[j*n+i]=Math.max(-1,Math.min(1,sum));pairs++;products+=DIM;}}
 const duplicateParent=Array.from({length:n},(_,i)=>i),find=i=>{while(duplicateParent[i]!==i)i=duplicateParent[i];return i;};let duplicateRelations=0;
 for(let i=0;i<n;i++)for(let j=0;j<i;j++)if(docs[i].inputHash===docs[j].inputHash||docs[i].materialHash===docs[j].materialHash||matrix[i*n+j]>=.995){
  const x=find(i),y=find(j);duplicateParent[Math.max(x,y)]=Math.min(x,y);duplicateRelations++;
 }
 const patterns=new Map();let capacity=null;
 for(let i=0;i<n;i++){
  const found=titlePatterns(docs[i].title);if(found===null){capacity='title-work-bound';break;}
  for(const [key,witness]of found){
   patternsSeen++;if(!patterns.has(key)){if(patterns.size>=MAX_PATTERNS){capacity='pattern-bound';break;}patterns.set(key,{...witness,members:[],witnesses:new Map()});}
   patterns.get(key).members.push(i);
   patterns.get(key).witnesses.set(i,witness);
   patterns.get(key).named||=witness.named;patterns.get(key).cleanStart||=witness.cleanStart;patterns.get(key).focal||=witness.focal;
  }if(capacity)break;
 }
 const work={observations:n,pairs,coordinateProducts:products,matrixBytes:matrix.byteLength,patternOccurrences:patternsSeen,distinctPatterns:patterns.size,candidatePairChecks:0,duplicateRelations};
 const base={schema:'automatic-focus-subjects/v2',representationHash:a.representationHash,matcherHash:a.matcherHash,minimumSimilarity:a.minimumSimilarity,kind:'subject',work,
  assignmentAuthority:false,registryChanged:false,eventIdentityAsserted:false,semanticQualityMeasured:false};
 if(capacity)return frozen({...base,status:'capacity',reason:capacity,proposals:[],selections:[]});
 const scoped=[];
 for(const p of patterns.values()){
  const roots=new Set(p.members.map(i=>docs[i].acceptedPath[0]).filter(id=>id!==undefined));
  // An abstention is not a conflicting sense. Allow matching unknown evidence
  // alongside one known root, without inventing an accepted path for it.
  // With two known conflicting senses, unknowns cannot bridge either branch.
  const buckets=new Map();
  for(const i of p.members){const root=roots.size<=1?[...roots][0]??null:docs[i].acceptedPath[0]??null;if(!buckets.has(root))buckets.set(root,[]);buckets.get(root).push(i);}
  for(const [contextRootId,members]of buckets){
   if(scoped.length>=MAX_PATTERNS)return frozen({...base,status:'capacity',reason:'context-work-bound',proposals:[],selections:[]});
   const witnesses=members.map(i=>p.witnesses.get(i)),labelWitness=witnesses.find(w=>w.cleanStart)??witnesses[0];
   scoped.push({...p,...labelWitness,contextRootId,members,
    named:witnesses.some(w=>w.named),cleanStart:witnesses.some(w=>w.cleanStart),focal:witnesses.some(w=>w.focal),
    labelSourceIndex:members[witnesses.indexOf(labelWitness)]});
  }
 }
 const closed=new Map();let incoherent=0,insufficient=0,ambiguousNameComponents=0;
 for(const p of scoped){
  if(!p.named||!p.cleanStart||TEMPLATE_START.has(p.tokens[0])||p.tokens.length===1&&!p.focal){insufficient++;continue;}
  // A repeated first component cannot name two different full names. Keep the
  // distinct full subjects instead of publishing a shared first-name topic.
  if(p.tokens.length===1){const suffixes=p.members.map(i=>p.witnesses.get(i).namedSuffix);if(suffixes.every(v=>v!==null)&&new Set(suffixes).size>1){ambiguousNameComponents++;continue;}}
  const independent=new Map();for(const i of p.members)if(!independent.has(find(i)))independent.set(find(i),i);
  const publishers=new Set([...independent.values()].map(i=>docs[i].publisherKey));
  if(independent.size<2){insufficient++;continue;}
  // Repeated publisher branding and instruction suffixes are weak name
  // evidence on one site. They must not inherit its product/species clusters.
  // Concrete focal names retain the one-publisher subject policy above.
  if(publishers.size===1&&(INSTRUCTION_TAIL.has(p.tokens.at(-1))||p.members.every(i=>publisherBoundary[i]>=0&&p.witnesses.get(i).start>publisherBoundary[i]))){insufficient++;continue;}
  let minimum=1;for(let i=0;i<p.members.length;i++)for(let j=0;j<i;j++){
   if(++work.candidatePairChecks>131072)return frozen({...base,status:'capacity',reason:'cohesion-work-bound',proposals:[],selections:[]});
   minimum=Math.min(minimum,matrix[p.members[i]*n+p.members[j]]);
  }
  if(minimum<a.minimumSimilarity){incoherent++;continue;}
  const signature=p.members.join(','),old=closed.get(signature),candidate={...p,publishers:publishers.size,distinctInputs:independent.size,minimumPairSimilarity:minimum};
  if(!old||candidate.tokens.length>old.tokens.length||candidate.tokens.length===old.tokens.length&&(candidate.label.length>old.label.length||candidate.label.length===old.label.length&&order(candidate.key,old.key)<0))closed.set(signature,candidate);
 }
 const candidates=[...closed.values()].sort((x,y)=>x.tokens.length-y.tokens.length||order(x.key,y.key));
 if(candidates.length>MAX_PROPOSALS)return frozen({...base,status:'capacity',reason:'proposal-work-bound',proposals:[],selections:[]});
 const proposals=candidates.map(p=>({
  proposalKey:'subject-proposal-'+hash([a.representationHash,a.matcherHash,p.contextRootId,p.key,p.members.map(i=>[docs[i].sourceId,docs[i].inputHash])]),
  kind:'subject',label:p.label,labelBasis:'shared-literal-headline-focus',focusTokens:p.tokens,
  labelWitness:{sourceId:docs[p.labelSourceIndex].sourceId,inputHash:docs[p.labelSourceIndex].inputHash,titleNormalization:'NFKC',start:p.start,end:p.end},
  members:p.members.map(i=>({sourceId:docs[i].sourceId,inputHash:docs[i].inputHash,focusStart:p.witnesses.get(i).start,focusEnd:p.witnesses.get(i).end})),publishers:p.publishers,distinctInputs:p.distinctInputs,minimumPairSimilarity:p.minimumPairSimilarity,
  parentProposalKey:null,parentBasis:null,acceptedAncestorPath:docs[p.members[0]].acceptedPath.filter((id,depth)=>p.members.every(i=>docs[i].acceptedPath[depth]===id&&docs[i].acceptedPath.slice(0,depth).every((v,k)=>v===docs[p.members[0]].acceptedPath[k]))),
  status:'supported-subject-proposal',eventIdentityAsserted:false,
 }));
 for(let i=0;i<candidates.length;i++){
  const p=candidates[i],parents=candidates.map((q,j)=>({q,j})).filter(({q,j})=>j!==i&&contains(p.tokens,q.tokens)&&p.members.every(member=>q.members.includes(member)))
   .sort((x,y)=>y.q.tokens.length-x.q.tokens.length||order(x.q.key,y.q.key));
  if(parents.length){proposals[i].parentProposalKey=proposals[parents[0].j].proposalKey;proposals[i].parentBasis='literal-focus-containment-and-member-subset';}
 }
 const selections=docs.map(d=>{
  const matches=proposals.filter(p=>p.members.some(m=>m.sourceId===d.sourceId)),leaves=matches.filter(p=>!matches.some(q=>q.parentProposalKey===p.proposalKey));
  // Compare specificity along proven branches. Unrelated axes (a person and an
  // award, for example) have no inferred containment: prefer the earlier focal
  // headline phrase while retaining both explicit supported browsing contexts.
  const position=p=>p.members.find(m=>m.sourceId===d.sourceId).focusStart;
  leaves.sort((x,y)=>position(x)-position(y)||y.focusTokens.length-x.focusTokens.length||y.publishers-x.publishers||order(x.proposalKey,y.proposalKey));
  return {sourceId:d.sourceId,inputHash:d.inputHash,preferredProposalKey:leaves[0]?.proposalKey??null,supportedProposalKeys:matches.map(p=>p.proposalKey),
   reason:leaves.length?'most-specific-supported-headline-branch':'page-context-only'};
 });
 return frozen({...base,status:'proposed',proposals,selections,rejected:{incoherent,insufficient,ambiguousNameComponents},
  scope:'Bounded shared SUBJECT names and literal focus nesting, not event equality or a learned semantic taxonomy. Publisher keys/material identities supplied by trusted producer; source/version/erasure gates still required before live use.'});
}
