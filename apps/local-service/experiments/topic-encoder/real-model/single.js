// One packaged E5 title+lead pass, then a trained rank-8 residual head.
export const SINGLE_SCHEMA='topic-single-e5-low-rank/v1';
const DIM=384,RANK=8,SIZE=DIM*RANK*2;

function unit(input) {
  if (!input||input.length!==DIM) throw new TypeError('Expected 384D E5 title+lead vector');
  let square=0;
  for (const value of input) {if(!Number.isFinite(value)) throw new TypeError('Non-finite vector');square+=value*value;}
  if(square<1e-12) throw new TypeError('Zero vector');
  return Float64Array.from(input,value=>value/Math.sqrt(square));
}
function dot(a,b) {let sum=0;for(let k=0;k<DIM;k++) sum+=a[k]*b[k];return sum;}
function project(x,factors) {
  const latent=new Float64Array(RANK);
  for(let k=0;k<DIM;k++) for(let r=0;r<RANK;r++)
    latent[r]+=factors[DIM*RANK+k*RANK+r]*x[k];
  const raw=new Float64Array(DIM);let square=0;
  for(let k=0;k<DIM;k++) {
    let value=x[k];
    for(let r=0;r<RANK;r++) value+=factors[k*RANK+r]*Math.tanh(latent[r]);
    raw[k]=value;square+=value*value;
  }
  const norm=Math.sqrt(square);
  return {vector:Float64Array.from(raw,value=>value/norm),norm,latent};
}
export function encodeSinglePage(_page,titleLeadVector,artifact) {
  if(artifact?.schema!==SINGLE_SCHEMA||artifact.dimensions!==DIM||artifact.rank!==RANK||
    artifact.factors?.length!==SIZE||artifact.factors.some(value=>!Number.isFinite(value)||Math.abs(value)>2))
    throw new TypeError('Invalid single-pass model');
  return Float32Array.from(project(unit(titleLeadVector),artifact.factors).vector);
}
function initialFactors() {
  const result=new Float64Array(SIZE);let state=0x104afe3b;
  for(let k=0;k<SIZE;k++) {state^=state<<13;state^=state>>>17;state^=state<<5;
    result[k]=((state>>>0)/0xffffffff*2-1)*0.012;}
  return result;
}
function metrics(documents,x,factors) {
  const mapped=x.map(vector=>project(vector,factors).vector);
  let hits=0,queries=0,margin=0;
  for(let i=0;i<documents.length;i++) {
    let positive=-Infinity,negative=-Infinity;
    for(let j=0;j<documents.length;j++) if(i!==j) {
      const score=dot(mapped[i],mapped[j]);
      if(documents[i].topicLabel===documents[j].topicLabel) positive=Math.max(positive,score);
      else negative=Math.max(negative,score);
    }
    if(!Number.isFinite(positive)) continue;
    hits+=Number(positive>negative);margin+=positive-negative;queries++;
  }
  if(!queries) throw new TypeError('No positive validation queries');
  return {hits,queries,meanMargin:margin/queries};
}
function triplets(documents,x) {
  const result=[];
  for(let a=0;a<documents.length;a++) {
    const positives=[],hard=[],others=[];
    for(let j=0;j<documents.length;j++) if(j!==a) {
      if(documents[a].topicLabel===documents[j].topicLabel) positives.push(j);
      else if(documents[a].family===documents[j].family) hard.push(j);
      else others.push(j);
    }
    others.sort((i,j)=>dot(x[a],x[j])-dot(x[a],x[i]));
    for(const p of positives) for(const n of [...hard,...others.slice(0,4)])
      result.push([a,p,n]);
  }
  if(!result.length||result.length>16000) throw new TypeError('Invalid triplet count');
  return result;
}
function derivative(gradient,x,result,outputGradient,factors) {
  const projected=dot(outputGradient,result.vector);
  const raw=new Float64Array(DIM),latent=new Float64Array(RANK);
  for(let k=0;k<DIM;k++) {
    raw[k]=(outputGradient[k]-projected*result.vector[k])/result.norm;
    for(let r=0;r<RANK;r++) gradient[k*RANK+r]+=raw[k]*Math.tanh(result.latent[r]);
  }
  for(let r=0;r<RANK;r++) {
    for(let k=0;k<DIM;k++) latent[r]+=factors[k*RANK+r]*raw[k];
    latent[r]*=1-Math.tanh(result.latent[r])**2;
  }
  for(let k=0;k<DIM;k++) for(let r=0;r<RANK;r++)
    gradient[DIM*RANK+k*RANK+r]+=latent[r]*x[k];
}
function validate(documents,vectors) {
  if(!Array.isArray(documents)||documents.length<8||documents.length>512||!(vectors instanceof Map))
    throw new TypeError('Invalid corpus');
  const ids=new Set();
  return documents.map(doc=>{
    if(typeof doc?.id!=='string'||!doc.id||ids.has(doc.id)||
      typeof doc.family!=='string'||!doc.family||typeof doc.topicLabel!=='string'||!doc.topicLabel)
      throw new TypeError('Invalid label');
    ids.add(doc.id);return unit(vectors.get(doc.id));
  });
}
export function trainSingleEncoder(train,trainVectors,validations,maxMs=20000) {
  const x=validate(train,trainVectors);
  if(!Array.isArray(validations)||validations.length!==2||
    !Number.isInteger(maxMs)||maxMs<100||maxMs>30000) throw new TypeError('Invalid training options');
  const families=new Set(train.map(doc=>doc.family));
  const val=validations.map(split=>{
    const vectors=validate(split.documents,split.vectors);
    if(split.documents.some(doc=>families.has(doc.family))) throw new TypeError('Family leakage');
    return {documents:split.documents,vectors};
  });
  if(val[0].documents.some(doc=>val[1].documents.some(other=>other.family===doc.family)))
    throw new TypeError('Validation family leakage');
  const rows=triplets(train,x),zero=new Float64Array(SIZE);
  const baseline=val.map(split=>metrics(split.documents,split.vectors,zero));
  const factors=initialFactors(),first=new Float64Array(SIZE),second=new Float64Array(SIZE);
  let best=zero,bestEpoch=0,bestMetrics=baseline,epochsRun=0;
  const started=performance.now();
  for(let epoch=1;epoch<=80;epoch++) {
    if(performance.now()-started>maxMs) break;
    const embedded=x.map(vector=>project(vector,factors));
    const gradient=new Float64Array(SIZE);let active=0;
    for(const [a,p,n] of rows) {
      const va=embedded[a].vector,vp=embedded[p].vector,vn=embedded[n].vector;
      if(0.08+dot(va,vn)-dot(va,vp)<=0) continue;
      active++;
      const ga=new Float64Array(DIM),gp=new Float64Array(DIM),gn=new Float64Array(DIM);
      for(let k=0;k<DIM;k++){ga[k]=vn[k]-vp[k];gp[k]=-va[k];gn[k]=va[k];}
      derivative(gradient,x[a],embedded[a],ga,factors);
      derivative(gradient,x[p],embedded[p],gp,factors);
      derivative(gradient,x[n],embedded[n],gn,factors);
    }
    if(!active) break;
    let square=0;
    for(let k=0;k<SIZE;k++){gradient[k]=gradient[k]/rows.length+0.002*factors[k];square+=gradient[k]*gradient[k];}
    const clip=Math.min(1,1/(Math.sqrt(square)||1));
    for(let k=0;k<SIZE;k++) {
      const g=gradient[k]*clip;
      first[k]=0.9*first[k]+0.1*g;second[k]=0.999*second[k]+0.001*g*g;
      factors[k]-=0.005*(first[k]/(1-0.9**epoch))/(Math.sqrt(second[k]/(1-0.999**epoch))+1e-8);
      factors[k]=Math.max(-0.5,Math.min(0.5,factors[k]));
    }
    epochsRun=epoch;
    const current=val.map(split=>metrics(split.documents,split.vectors,factors));
    const noRetrievalRegression=current.every((item,i)=>item.hits>=baseline[i].hits);
    const currentTotal=current.reduce((sum,item)=>sum+item.hits,0);
    const bestTotal=bestMetrics.reduce((sum,item)=>sum+item.hits,0);
    const currentMargin=Math.min(...current.map(item=>item.meanMargin));
    const bestMargin=Math.min(...bestMetrics.map(item=>item.meanMargin));
    if(noRetrievalRegression&&(currentTotal>bestTotal||
      (currentTotal===bestTotal&&currentMargin>bestMargin+0.002))) {
      best=Float64Array.from(factors);bestMetrics=current;bestEpoch=epoch;
    }
    if(epoch-bestEpoch>=12) break;
  }
  return {schema:SINGLE_SCHEMA,dimensions:DIM,rank:RANK,factors:Array.from(best),
    bestEpoch,epochsRun,triplets:rows.length,validationBaseline:baseline,
    validation:bestMetrics,trainingMs:performance.now()-started};
}
