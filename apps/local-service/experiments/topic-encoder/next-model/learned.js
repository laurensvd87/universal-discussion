import { pageParts, cosine, SCHEMA as FEATURE_SCHEMA } from './model.js';

export const LEARNED_SCHEMA = 'topic-diagonal-fusion/v1';
const DIM = 384;

function normalize(raw) {
  let square = 0;
  for (const value of raw) square += value * value;
  if (square < 1e-12) throw new TypeError('Degenerate learned embedding');
  const norm = Math.sqrt(square);
  return { vector: Float32Array.from(raw, value => value / norm), norm };
}

function project(parts, denseWeights, lexicalWeights) {
  const raw = new Float64Array(DIM);
  for (let k = 0; k < DIM; k++) raw[k] =
    denseWeights[k] * parts.dense[k] + lexicalWeights[k] * parts.sparse[k];
  return normalize(raw);
}

export function encodeLearnedPage(document, e5Vector, learned) {
  if (learned?.schema !== LEARNED_SCHEMA || learned?.features?.schema !== FEATURE_SCHEMA ||
    learned.denseWeights?.length !== DIM || learned.lexicalWeights?.length !== DIM ||
    [...learned.denseWeights, ...learned.lexicalWeights].some(value => !Number.isFinite(value) || Math.abs(value) > 3))
    throw new TypeError('Invalid learned model');
  return project(pageParts(document,e5Vector,learned.features),
    learned.denseWeights,learned.lexicalWeights).vector;
}

function quality(documents, parts, denseWeights, lexicalWeights) {
  const vectors = parts.map(part => project(part,denseWeights,lexicalWeights).vector);
  let correct=0, count=0, margin=0;
  for (let i=0;i<documents.length;i++) {
    let positive=-Infinity, negative=-Infinity;
    for (let j=0;j<documents.length;j++) if (i!==j) {
      const score=cosine(vectors[i],vectors[j]);
      if (documents[i].topicLabel===documents[j].topicLabel &&
        documents[i].viewpoint!==documents[j].viewpoint) positive=Math.max(positive,score);
      else if (documents[i].topicLabel!==documents[j].topicLabel) negative=Math.max(negative,score);
    }
    if (!Number.isFinite(positive)) continue;
    correct+=Number(positive>negative); margin+=positive-negative; count++;
  }
  return { correct, count, meanMargin:margin/count };
}

function rows(documents) {
  const result=[];
  for (let i=0;i<documents.length;i++) {
    const positive=[],hard=[];
    for (let j=0;j<documents.length;j++) if (i!==j) {
      if (documents[i].topicLabel===documents[j].topicLabel &&
        documents[i].viewpoint!==documents[j].viewpoint) positive.push(j);
      else if (documents[i].family===documents[j].family &&
        documents[i].topicLabel!==documents[j].topicLabel) hard.push(j);
    }
    for (const p of positive) for (const n of hard) result.push([i,p,n]);
  }
  return result;
}

function derivative(gradient, parts, embedded, outputGradient, denseWeights, lexicalWeights) {
  let scalar=cosine(outputGradient,embedded.vector);
  for (let k=0;k<DIM;k++) {
    const g=(outputGradient[k]-scalar*embedded.vector[k])/embedded.norm;
    gradient[k]+=g*parts.dense[k];
    gradient[DIM+k]+=g*parts.sparse[k];
  }
}

// Actual supervised metric learning: every update differentiates a cosine
// triplet objective through L2 normalization. Family-disjoint validation
// selects an epoch; the untouched test corpus never enters this function.
export function trainLearnedEncoder(train, trainVectors, validation, validationVectors,
  features={schema:FEATURE_SCHEMA,lexicalShare:0.5,titleWeight:3,secondSentenceWeight:0.5}) {
  if (train.length>512 || validation.length>512 ||
    validation.some(doc=>train.some(item=>item.family===doc.family))) throw new TypeError('Invalid split');
  const trainParts=train.map(doc=>pageParts(doc,trainVectors.get(doc.id),features));
  const valParts=validation.map(doc=>pageParts(doc,validationVectors.get(doc.id),features));
  const triplets=rows(train);
  if (!triplets.length || triplets.length>10000) throw new TypeError('Invalid training pairs');
  const weights=new Float64Array(DIM*2);
  weights.fill(1,0,DIM);
  weights.fill(0.25,DIM);
  const initial=Float64Array.from(weights);
  const first=new Float64Array(weights.length),second=new Float64Array(weights.length);
  const initialQuality=quality(validation,valParts,weights.subarray(0,DIM),weights.subarray(DIM));
  let best=Float64Array.from(weights), bestQuality=initialQuality, bestEpoch=0;
  const started=performance.now();
  let epochsRun=0;
  for (let epoch=1;epoch<=60;epoch++) {
    if (performance.now()-started>20000) break;
    const dense=weights.subarray(0,DIM),lex=weights.subarray(DIM);
    const embedded=trainParts.map(part=>project(part,dense,lex));
    const gradient=new Float64Array(DIM*2);
    for (const [a,p,n] of triplets) {
      const va=embedded[a].vector,vp=embedded[p].vector,vn=embedded[n].vector;
      const violation=0.06+cosine(va,vn)-cosine(va,vp);
      if (violation<=0) continue;
      const ga=new Float64Array(DIM),gp=new Float64Array(DIM),gn=new Float64Array(DIM);
      for (let k=0;k<DIM;k++) { ga[k]=vn[k]-vp[k];gp[k]=-va[k];gn[k]=va[k]; }
      derivative(gradient,trainParts[a],embedded[a],ga,dense,lex);
      derivative(gradient,trainParts[p],embedded[p],gp,dense,lex);
      derivative(gradient,trainParts[n],embedded[n],gn,dense,lex);
    }
    let norm=0;
    for (let k=0;k<weights.length;k++) {
      gradient[k]=gradient[k]/triplets.length+0.002*(weights[k]-initial[k]);
      norm+=gradient[k]*gradient[k];
    }
    const clip=Math.min(1,2/(Math.sqrt(norm)||1));
    for (let k=0;k<weights.length;k++) {
      const g=gradient[k]*clip;
      first[k]=0.9*first[k]+0.1*g;
      second[k]=0.999*second[k]+0.001*g*g;
      weights[k]-=0.01*(first[k]/(1-0.9**epoch))/(Math.sqrt(second[k]/(1-0.999**epoch))+1e-8);
      weights[k]=Math.max(-2,Math.min(2,weights[k]));
    }
    epochsRun=epoch;
    const val=quality(validation,valParts,weights.subarray(0,DIM),weights.subarray(DIM));
    if (val.correct>bestQuality.correct ||
      (val.correct===bestQuality.correct && val.meanMargin>bestQuality.meanMargin+0.005)) {
      best=Float64Array.from(weights);bestQuality=val;bestEpoch=epoch;
    }
    if (epoch-bestEpoch>=15) break;
  }
  return { schema:LEARNED_SCHEMA,features,denseWeights:Array.from(best.subarray(0,DIM)),
    lexicalWeights:Array.from(best.subarray(DIM)),bestEpoch,epochsRun,triplets:triplets.length,
    initialValidation:initialQuality,validation:bestQuality,trainingMs:performance.now()-started };
}
