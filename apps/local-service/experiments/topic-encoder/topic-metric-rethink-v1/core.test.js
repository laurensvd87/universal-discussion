import test from 'node:test';
import assert from 'node:assert/strict';
import { DIM, cholesky, covarianceFit, cosine, makeMetric, metricVector, selectDevelopment, unit } from './core.js';

const vector = (values) => { const v = new Float64Array(DIM); values.forEach((x,i) => v[i] = x); return unit(v); };
const fixture = () => {
  const rows = [], vectors = new Map();
  for (let event = 0; event < 3; event++) for (let language = 0; language < 4; language++) {
    const id = `${event}-${language}`; rows.push({ id, eventKey: `e${event}` });
    const v = new Float64Array(DIM); v[0] = 8; v[event + 1] = 1; v[5 + language] = .3; vectors.set(id, unit(v));
  }
  return { rows, vectors };
};
test('Cholesky reconstructs a nontrivial SPD matrix and rejects a singular one', () => {
  const a = [4,2,2,3], l = cholesky(a,2);
  assert.deepEqual([...l], [2,0,1,Math.sqrt(2)]);
  assert.throws(() => cholesky([1,1,1,1],2), /NOT_POSITIVE_DEFINITE/u);
});
test('regularized metrics remain finite, unit length and deterministic', () => {
  const { rows, vectors } = fixture(), fit = covarianceFit(rows,vectors);
  for (const name of ['centered','global-shrink-50','global-shrink-90','within-shrink-50','within-shrink-90']) {
    const metric = makeMetric(fit,name), a = metricVector(vectors.get(rows[0].id),metric);
    assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-12);
    assert.deepEqual(a,metricVector(vectors.get(rows[0].id),metric));
  }
});
test('within-event whitening improves event versus language geometry on a controlled fixture', () => {
  const { rows,vectors } = fixture(), metric = makeMetric(covarianceFit(rows,vectors),'within-shrink-50');
  const a=metricVector(vectors.get('0-0'),metric), p=metricVector(vectors.get('0-1'),metric), n=metricVector(vectors.get('1-0'),metric);
  assert.ok(cosine(a,p) > cosine(a,n));
  assert.ok(cosine(a,p)-cosine(a,n) > cosine(vectors.get('0-0'),vectors.get('0-1'))-cosine(vectors.get('0-0'),vectors.get('1-0')));
});
test('invalid vectors and malformed fits fail closed', () => {
  assert.throws(() => unit(new Float64Array(DIM)), /VECTOR_NORM/u);
  assert.throws(() => metricVector(vector([1]),{}), /METRIC/u);
  const { rows,vectors }=fixture(); vectors.set(rows[0].id,vector([1])); vectors.get(rows[0].id)[0]=NaN;
  assert.throws(() => covarianceFit(rows,vectors), /VECTOR/u);
});
test('development budget chooses useful pure coverage without hiding false exposure', () => {
  const summary=(pages,pairs,falsePairs=0,mixed=0)=>({coverage:{grouped:{articlesInPureNonSingletonGroups:pages,truePairs:pairs,falsePairs,articlesInMixedGroups:mixed}}});
  assert.equal(selectDevelopment({'raw-body-E5':summary(99,200),centered:summary(20,50),'within-shrink-50':summary(30,200,3,4),'global-shrink-50':summary(50,300,7,10)}),'within-shrink-50');
  assert.equal(selectDevelopment({centered:summary(30,20,2,2)}),null);
});
