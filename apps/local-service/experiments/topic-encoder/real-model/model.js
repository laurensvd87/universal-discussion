// Offline dual-view low-rank metric encoder. One page in, one 384D vector out.
// Inputs are the two already-packaged E5 views of the same page; training never
// uses paired page text at inference time.
export const SCHEMA = 'topic-dual-view-low-rank/v1';
export const DIM = 384;
export const RANK = 8;
const PARAMETERS = 2 * DIM * RANK;

function unit(input) {
  if (!input || input.length !== DIM) throw new TypeError('Expected 384D E5 vector');
  let square = 0;
  for (const value of input) {
    if (!Number.isFinite(value)) throw new TypeError('Non-finite E5 vector');
    square += value * value;
  }
  if (square < 1e-12) throw new TypeError('Zero E5 vector');
  return Float64Array.from(input, value => value / Math.sqrt(square));
}

export function pageViews(bodyVector, titleLeadVector) {
  return { body:unit(bodyVector), titleLead:unit(titleLeadVector) };
}

function project(views, factors, titleLeadShare) {
  const delta = new Float64Array(DIM);
  const latent = new Float64Array(RANK);
  for (let k=0;k<DIM;k++) {
    delta[k]=views.titleLead[k]-views.body[k];
    for (let r=0;r<RANK;r++) latent[r]+=factors[PARAMETERS/2+k*RANK+r]*delta[k];
  }
  const raw = new Float64Array(DIM);
  let square=0;
  for (let k=0;k<DIM;k++) {
    let value=(1-titleLeadShare)*views.body[k]+titleLeadShare*views.titleLead[k];
    for (let r=0;r<RANK;r++) value+=factors[k*RANK+r]*Math.tanh(latent[r]);
    raw[k]=value;square+=value*value;
  }
  const norm=Math.sqrt(square);
  return { vector:Float64Array.from(raw,value=>value/norm),raw,norm,delta,latent };
}

export function encodeRealPage(_page, bodyVector, titleLeadVector, model) {
  if (model?.schema!==SCHEMA || model.rank!==RANK || model.dimensions!==DIM ||
    !Number.isFinite(model.titleLeadShare) || model.titleLeadShare<0 || model.titleLeadShare>1 ||
    model.factors?.length!==PARAMETERS ||
    [...model.factors].some(value=>!Number.isFinite(value)||Math.abs(value)>2))
    throw new TypeError('Invalid frozen real-model artifact');
  const result=project(pageViews(bodyVector,titleLeadVector),model.factors,model.titleLeadShare).vector;
  return Float32Array.from(result);
}

function dot(a,b) {
  let sum=0;
  for (let k=0;k<DIM;k++) sum+=a[k]*b[k];
  return sum;
}

function rankMetrics(documents, views, factors, share) {
  const embedded=views.map(view=>project(view,factors,share).vector);
  let hits=0,eligible=0,margin=0;
  for (let i=0;i<documents.length;i++) {
    let positive=-Infinity,negative=-Infinity;
    for (let j=0;j<documents.length;j++) if (i!==j) {
      const score=dot(embedded[i],embedded[j]);
      if (documents[i].topicLabel===documents[j].topicLabel) positive=Math.max(positive,score);
      else negative=Math.max(negative,score);
    }
    if (!Number.isFinite(positive)) continue;
    eligible++;hits+=Number(positive>negative);margin+=positive-negative;
  }
  if (!eligible) throw new TypeError('No positive validation query');
  return {hits,queries:eligible,meanMargin:margin/eligible};
}

function initialFactors() {
  const factors=new Float64Array(PARAMETERS);
  let state=0x4b1d2f39;
  for (let k=0;k<factors.length;k++) {
    state^=state<<13;state^=state>>>17;state^=state<<5;
    factors[k]=((state>>>0)/0xffffffff*2-1)*0.012;
  }
  return factors;
}

function pairRows(documents, views) {
  const rows=[];
  for (let a=0;a<documents.length;a++) {
    const positives=[],hard=[],global=[];
    for (let i=0;i<documents.length;i++) if (i!==a) {
      if (documents[i].topicLabel===documents[a].topicLabel) positives.push(i);
      else if (documents[i].family===documents[a].family) hard.push(i);
      else global.push(i);
    }
    global.sort((i,j)=>dot(views[a].titleLead,views[j].titleLead)-
      dot(views[a].titleLead,views[i].titleLead));
    for (const p of positives) {
      for (const n of hard) rows.push([a,p,n]);
      // Mine the four closest other-storyline pages as hard global negatives.
      for (const n of global.slice(0,4)) rows.push([a,p,n]);
    }
  }
  if (!rows.length || rows.length>12000) throw new TypeError('Invalid triplet count');
  return rows;
}

function accumulate(gradient, views, result, outputGradient, factors) {
  const projected=dot(outputGradient,result.vector);
  const rawGradient=new Float64Array(DIM), latentGradient=new Float64Array(RANK);
  for (let k=0;k<DIM;k++) {
    rawGradient[k]=(outputGradient[k]-projected*result.vector[k])/result.norm;
    for (let r=0;r<RANK;r++) gradient[k*RANK+r]+=rawGradient[k]*Math.tanh(result.latent[r]);
  }
  for (let r=0;r<RANK;r++) {
    for (let k=0;k<DIM;k++) latentGradient[r]+=factors[k*RANK+r]*rawGradient[k];
    latentGradient[r]*=1-Math.tanh(result.latent[r])**2;
  }
  for (let k=0;k<DIM;k++) for (let r=0;r<RANK;r++)
    gradient[PARAMETERS/2+k*RANK+r]+=latentGradient[r]*result.delta[k];
}

function validateSplit(documents, body, titleLead, label) {
  if (!Array.isArray(documents)||documents.length<8||documents.length>512||
    !(body instanceof Map)||!(titleLead instanceof Map)) throw new TypeError(`Invalid ${label}`);
  const ids=new Set();
  for (const doc of documents) {
    if (!doc || typeof doc.id!=='string'||!doc.id||ids.has(doc.id)||
      typeof doc.family!=='string'||!doc.family||typeof doc.topicLabel!=='string'||!doc.topicLabel)
      throw new TypeError(`Invalid ${label} document`);
    ids.add(doc.id);pageViews(body.get(doc.id),titleLead.get(doc.id));
  }
}

export function trainRealEncoder(train,trainBody,trainTitleLead,
    validation,valBody,valTitleLead,options={}) {
  validateSplit(train,trainBody,trainTitleLead,'training');
  validateSplit(validation,valBody,valTitleLead,'validation');
  const trainFamilies=new Set(train.map(doc=>doc.family));
  if (validation.some(doc=>trainFamilies.has(doc.family)||train.some(item=>item.id===doc.id)))
    throw new TypeError('Training/validation family or ID leakage');
  const maxMs=options.maxMs??20000;
  if (!Number.isInteger(maxMs)||maxMs<100||maxMs>30000) throw new TypeError('Invalid time budget');
  const started=performance.now();
  const trainViews=train.map(doc=>pageViews(trainBody.get(doc.id),trainTitleLead.get(doc.id)));
  const valViews=validation.map(doc=>pageViews(valBody.get(doc.id),valTitleLead.get(doc.id)));
  const rows=pairRows(train,trainViews);
  const candidates=[];
  for (const share of [0,0.5,1]) {
    const baseline=rankMetrics(validation,valViews,new Float64Array(PARAMETERS),share);
    candidates.push({share,baseline});
  }
  // Select the best untrained dual-view combination on validation before
  // updating the low-rank residual. This is one bounded hyperparameter choice.
  candidates.sort((a,b)=>b.baseline.hits-a.baseline.hits||
    b.baseline.meanMargin-a.baseline.meanMargin||b.share-a.share);
  const share=candidates[0].share;
  const initial=initialFactors(), factors=Float64Array.from(initial);
  const first=new Float64Array(PARAMETERS),second=new Float64Array(PARAMETERS);
  let best=new Float64Array(PARAMETERS),bestEpoch=0;
  let bestMetrics=candidates[0].baseline,epochsRun=0;
  for (let epoch=1;epoch<=80;epoch++) {
    if (performance.now()-started>maxMs) break;
    const embedded=trainViews.map(view=>project(view,factors,share));
    const gradient=new Float64Array(PARAMETERS);
    let active=0;
    for (const [a,p,n] of rows) {
      const va=embedded[a].vector,vp=embedded[p].vector,vn=embedded[n].vector;
      if (0.08+dot(va,vn)-dot(va,vp)<=0) continue;
      active++;
      const ga=new Float64Array(DIM),gp=new Float64Array(DIM),gn=new Float64Array(DIM);
      for (let k=0;k<DIM;k++) {ga[k]=vn[k]-vp[k];gp[k]=-va[k];gn[k]=va[k];}
      accumulate(gradient,trainViews[a],embedded[a],ga,factors);
      accumulate(gradient,trainViews[p],embedded[p],gp,factors);
      accumulate(gradient,trainViews[n],embedded[n],gn,factors);
    }
    if (!active) break;
    let square=0;
    for (let k=0;k<PARAMETERS;k++) {
      gradient[k]=gradient[k]/rows.length+0.002*factors[k];
      square+=gradient[k]*gradient[k];
    }
    const clip=Math.min(1,1/(Math.sqrt(square)||1));
    for (let k=0;k<PARAMETERS;k++) {
      const g=gradient[k]*clip;
      first[k]=0.9*first[k]+0.1*g;
      second[k]=0.999*second[k]+0.001*g*g;
      factors[k]-=0.005*(first[k]/(1-0.9**epoch))/(Math.sqrt(second[k]/(1-0.999**epoch))+1e-8);
      factors[k]=Math.max(-0.5,Math.min(0.5,factors[k]));
    }
    epochsRun=epoch;
    const metrics=rankMetrics(validation,valViews,factors,share);
    if (metrics.hits>bestMetrics.hits ||
      (metrics.hits===bestMetrics.hits&&metrics.meanMargin>bestMetrics.meanMargin+0.002)) {
      best=Float64Array.from(factors);bestMetrics=metrics;bestEpoch=epoch;
    }
    if (epoch-bestEpoch>=12) break;
  }
  return {schema:SCHEMA,dimensions:DIM,rank:RANK,titleLeadShare:share,
    factors:Array.from(best),bestEpoch,epochsRun,triplets:rows.length,
    validationBaseline:candidates[0].baseline,validation:bestMetrics,
    trainingMs:performance.now()-started};
}
