// Pure bounded DEV comparison. No gold labels, text, clock, IO, model or live
// assignment. Components are diagnostic groups, never persistent topic IDs.
const DIM=384,MAX=64,ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const bad=()=>{throw new TypeError('Invalid discovery strategy comparison');};
function keys(v,names){return v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...names].sort().join(',');}
const frozen=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))frozen(x);Object.freeze(v);}return v;};

export function compareDiscoveryStrategies(rawJson){
 if(arguments.length!==1||typeof rawJson!=='string'||rawJson.length>1048576)bad();
 let input;try{input=JSON.parse(rawJson);}catch{bad();}
 if(!keys(input,['observations','minimumSimilarity','minimumMargin'])||!Array.isArray(input.observations)||input.observations.length>MAX||
  !Number.isFinite(input.minimumSimilarity)||input.minimumSimilarity<.8||input.minimumSimilarity>.99||
  !Number.isFinite(input.minimumMargin)||input.minimumMargin<0||input.minimumMargin>.2)bad();
 const docs=input.observations;
 for(const d of docs){
  if(!keys(d,['sourceId','vector'])||typeof d.sourceId!=='string'||!ID.test(d.sourceId)||!Array.isArray(d.vector)||d.vector.length!==DIM)bad();
  let norm=0;for(const x of d.vector){if(typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>1)bad();norm+=x*x;}if(Math.abs(norm-1)>1e-5)bad();
 }
 if(new Set(docs.map(d=>d.sourceId)).size!==docs.length)bad();
 const n=docs.length,matrix=new Float64Array(n*n);let products=0,pairs=0;
 for(let i=0;i<n;i++){
  matrix[i*n+i]=1;for(let j=0;j<i;j++){
   let sum=0;for(let k=0;k<DIM;k++){sum+=docs[i].vector[k]*docs[j].vector[k];products++;}
   matrix[i*n+j]=matrix[j*n+i]=Math.max(-1,Math.min(1,sum));pairs++;
  }
 }
 const dot=(i,j)=>matrix[i*n+j];
 function project(groups){return groups.map(members=>{
  let minimum=1;for(let i=0;i<members.length;i++)for(let j=0;j<i;j++)minimum=Math.min(minimum,dot(members[i],members[j]));
  return {members:members.map(i=>docs[i].sourceId),minimumPairSimilarity:minimum};
 });}
 function incremental(centroid){
  const groups=[],centers=[];let scoreProducts=0,centerProducts=0,comparisons=0,ambiguous=0;
  for(let i=0;i<n;i++){
   const candidates=[];
   for(let c=0;c<groups.length;c++){
    let score=1;
    if(centroid){score=0;for(let k=0;k<DIM;k++){score+=docs[i].vector[k]*centers[c][k];scoreProducts++;}}
    else for(const j of groups[c]){score=Math.min(score,dot(i,j));comparisons++;}
    if(score>=input.minimumSimilarity)candidates.push({c,score});
   }
   candidates.sort((a,b)=>b.score-a.score||a.c-b.c);
   const tied=candidates.length>1&&candidates[0].score-candidates[1].score<=input.minimumMargin;
   if(tied)ambiguous++;
   const c=candidates.length&&!tied?candidates[0].c:groups.length;
   if(c===groups.length)groups.push([]);groups[c].push(i);
   if(centroid){
    const sum=new Float64Array(DIM);for(const j of groups[c])for(let k=0;k<DIM;k++){sum[k]+=docs[j].vector[k];centerProducts++;}
    let norm=0;for(const x of sum)norm+=x*x;norm=Math.sqrt(norm);if(norm<1e-12)bad();
    centers[c]=Array.from(sum,x=>x/norm);
   }
  }
  return {method:centroid?'incremental-centroid':'incremental-complete-link',groups:project(groups),ambiguous,
   work:{scoreProducts,centerCoordinateAdds:centerProducts,pairComparisons:comparisons}};
 }
 const parent=Array.from({length:n},(_,i)=>i),find=i=>{while(parent[i]!==i)i=parent[i];return i;};let edges=0;
 for(let i=0;i<n;i++)for(let j=0;j<i;j++)if(dot(i,j)>=input.minimumSimilarity){const a=find(i),b=find(j);parent[Math.max(a,b)]=Math.min(a,b);edges++;}
 const components=new Map();for(let i=0;i<n;i++){const root=find(i);if(!components.has(root))components.set(root,[]);components.get(root).push(i);}
 return frozen({schema:'automatic-topic-strategy-comparison/v1',minimumSimilarity:input.minimumSimilarity,minimumMargin:input.minimumMargin,
  results:[incremental(false),incremental(true),{method:'threshold-connected-components',groups:project([...components.values()]),ambiguous:null,work:{edges}}],
  work:{observations:n,pairs,coordinateProducts:products,matrixBytes:matrix.byteLength},assignmentAuthority:false,semanticQualityMeasured:false});
}
