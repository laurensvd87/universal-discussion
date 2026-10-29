// Background discovery experiment only. No IO, model loading, registry writes,
// page assignment or posting authority. A proposal is not an approved topic.
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {inspectPageUrl} from '../../../../spikes/topic-resolution/browser/core/page-content-policy.js';

export const DISCOVERY_LIMITS=Object.freeze({observations:64,dimensions:384,maximumDays:30,maximumPairs:2016});
const DAY=86400000,ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u,SHA=/^[a-f0-9]{64}$/u;
const bad=()=>{throw new TypeError('Invalid automatic topic proposal input');};
function record(value,keys){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)bad();
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();out[key]=d.value;}return out;
}
function dense(value,maximum,read){
 if(!value||types.isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)bad();
 const n=Object.getOwnPropertyDescriptor(value,'length').value;if(n>maximum||Reflect.ownKeys(value).length!==n+1)bad();
 const out=[];for(let i=0;i<n;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))bad();out.push(read(d.value));}return out;
}
function vector(v){let norm=0;const out=dense(v,384,n=>{if(typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>1)bad();norm+=n*n;return n;});if(out.length!==384||Math.abs(norm-1)>1e-5)bad();return out;}
const time=v=>Number.isSafeInteger(v)&&v>=0;
function observation(v){
 const a=record(v,['sourceId','inputHash','url','title','publisherKey','observedAt','publishedAt','vector']);
 if(typeof a.sourceId!=='string'||!ID.test(a.sourceId)||typeof a.inputHash!=='string'||!SHA.test(a.inputHash)||
  typeof a.title!=='string'||!a.title.isWellFormed()||!a.title.trim()||a.title.length>200||/[\u0000-\u001f\u007f]/u.test(a.title)||
  typeof a.publisherKey!=='string'||!/^[a-z0-9][a-z0-9.-]{0,159}$/u.test(a.publisherKey)||
  !time(a.observedAt)||a.publishedAt!==null&&!time(a.publishedAt))bad();
 const inspected=inspectPageUrl(a.url);if(!inspected.supported||inspected.url!==a.url)bad();
 return {...a,title:a.title.trim(),vector:vector(a.vector)};
}
function policy(v){
 const p=record(v,['minimumSimilarity','minimumMargin','minimumDistinctInputs','minimumPublishers','maximumObservedSpanMs','maximumPublishedSpanMs']);
 if(typeof p.minimumSimilarity!=='number'||!Number.isFinite(p.minimumSimilarity)||p.minimumSimilarity<.8||p.minimumSimilarity>.99||
  typeof p.minimumMargin!=='number'||!Number.isFinite(p.minimumMargin)||p.minimumMargin<0||p.minimumMargin>.2||
  !Number.isInteger(p.minimumDistinctInputs)||p.minimumDistinctInputs<2||p.minimumDistinctInputs>64||
  !Number.isInteger(p.minimumPublishers)||p.minimumPublishers<1||p.minimumPublishers>64||
  !time(p.maximumObservedSpanMs)||p.maximumObservedSpanMs<1||p.maximumObservedSpanMs>30*DAY||
  !time(p.maximumPublishedSpanMs)||p.maximumPublishedSpanMs<1||p.maximumPublishedSpanMs>30*DAY)bad();return p;
}
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const compare=(a,b)=>a<b?-1:a>b?1:0;

export function proposeAutomaticTopics(value){
 if(arguments.length!==1)bad();const a=record(value,['representationHash','parentId','kind','policy','observations']);
 if(typeof a.representationHash!=='string'||!SHA.test(a.representationHash)||typeof a.parentId!=='string'||!ID.test(a.parentId)||!['subject','event'].includes(a.kind))bad();
 const p=policy(a.policy),docs=dense(a.observations,64,observation).sort((x,y)=>x.observedAt-y.observedAt||compare(x.sourceId,y.sourceId));
 if(new Set(docs.map(d=>d.sourceId)).size!==docs.length)bad();
 const n=docs.length,matrix=new Float64Array(n*n);let products=0,pairs=0;
 for(let i=0;i<n;i++){matrix[i*n+i]=1;for(let j=0;j<i;j++){let dot=0;for(let k=0;k<384;k++)dot+=docs[i].vector[k]*docs[j].vector[k];products+=384;pairs++;matrix[i*n+j]=matrix[j*n+i]=Math.max(-1,Math.min(1,dot));}}
 const clusters=[],reasons=new Map();
 function similarity(i,j){return matrix[i*n+j];}
 function canJoin(index,members){
  const all=[...members,index],observed=all.map(i=>docs[i].observedAt);
  if(Math.max(...observed)-Math.min(...observed)>p.maximumObservedSpanMs)return null;
  if(a.kind==='event'){
   const published=all.map(i=>docs[i].publishedAt);if(published.some(t=>t===null)||Math.max(...published)-Math.min(...published)>p.maximumPublishedSpanMs)return null;
  }
  let minimum=1;for(const other of members)minimum=Math.min(minimum,similarity(index,other));
  return minimum>=p.minimumSimilarity?minimum:null;
 }
 for(let index=0;index<n;index++){
  const candidates=[];for(let c=0;c<clusters.length;c++){const score=canJoin(index,clusters[c]);if(score!==null)candidates.push({c,score});}
  candidates.sort((x,y)=>y.score-x.score||x.c-y.c);
  const ambiguous=candidates.length>1&&candidates[0].score-candidates[1].score<=p.minimumMargin;
  if(candidates.length&&!ambiguous)clusters[candidates[0].c].push(index);
  else{clusters.push([index]);reasons.set(index,ambiguous?'ambiguous-clusters':a.kind==='event'&&docs[index].publishedAt===null?'publication-time-unknown':'new-candidate');}
 }
 const proposals=clusters.map(members=>{
  let medoid=members[0],best=-Infinity,minimumPair=1;
  const duplicateParent=new Map(members.map(i=>[i,i]));
  const find=i=>{while(duplicateParent.get(i)!==i)i=duplicateParent.get(i);return i;};
  for(const i of members){let sum=0;for(const j of members){sum+=similarity(i,j);if(i!==j)minimumPair=Math.min(minimumPair,similarity(i,j));}
   if(sum>best){best=sum;medoid=i;}
   // Collapse the whole duplicate relation, not just greedy representatives:
   // a chain of syndicated near-copies must not manufacture a second vote.
   for(const j of members)if(j<i&&(docs[i].url===docs[j].url||docs[i].inputHash===docs[j].inputHash||similarity(i,j)>=.995)){
    const left=find(i),right=find(j);if(left!==right)duplicateParent.set(Math.max(left,right),Math.min(left,right));
   }
  }
  const independent=members.filter(i=>find(i)===i);
  const publishers=new Set(independent.map(i=>docs[i].publisherKey)),knownTime=a.kind!=='event'||members.every(i=>docs[i].publishedAt!==null);
  const supported=independent.length>=p.minimumDistinctInputs&&publishers.size>=p.minimumPublishers&&knownTime;
  const label=Array.from(docs[medoid].title.normalize('NFC')).slice(0,160).join('');
  return {proposalKey:'proposal-'+sha([a.representationHash,a.parentId,a.kind,docs[members[0]].sourceId,docs[members[0]].inputHash]),
   parentId:a.parentId,kind:a.kind,label,labelBasis:'representative-source-title',labelSourceId:docs[medoid].sourceId,
   members:members.map(i=>({sourceId:docs[i].sourceId,inputHash:docs[i].inputHash})),distinctInputs:independent.length,publishers:publishers.size,
   minimumPairSimilarity:minimumPair,status:supported?'supported-proposal':'provisional-proposal',
   reason:supported?'bounded-coherent-support':!knownTime?'publication-time-unknown':reasons.get(members[0])==='ambiguous-clusters'?'ambiguous-clusters':'insufficient-diverse-support'};
 });
 return freeze({schema:'automatic-topic-proposals/v1',representationHash:a.representationHash,parentId:a.parentId,kind:a.kind,policy:p,proposals,
  work:{observations:n,pairs,coordinateProducts:products,matrixBytes:matrix.byteLength},
  assignmentAuthority:false,registryChanged:false,semanticQualityMeasured:false,scope:'Bounded background proposal experiment; supplied publisher/date/parent identities are not independently attested. No new shared topic or canonical membership is created.'});
}
