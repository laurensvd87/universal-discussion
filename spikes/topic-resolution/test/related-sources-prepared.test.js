import assert from 'node:assert/strict';
import test from 'node:test';
import { rankRelatedSources, prepareRelatedSources, prepareRelatedSource, createRelatedSourcesPreparation } from '../browser/core/related-sources.js';
import { rankRelatedSources as priorRank } from './fixtures/related-sources-prior.js';

function random(seed) { let state=seed>>>0;return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;}; }
function source(id,values,topicId=null) {
  return {id,url:`https://example.org/${id}`,title:`Fictional ${id}`,topicId,
    embedding:values===null ? null : {modelId:'synthetic-e5',values}};
}

test('prepared and ordinary retrieval exactly match frozen arithmetic, association, ties and deduplication',()=>{
  for(const seed of [3,17,209]) {
    const rng=random(seed);
    const candidates=Array.from({length:60},(_,i)=>source(`s-${String(i).padStart(3,'0')}`,
      Array.from({length:384},()=>rng()-.5),i%7===0 ? 'confirmed' : null));
    candidates[4]={...candidates[3],embedding:{...candidates[3].embedding,values:[...candidates[3].embedding.values]}};
    candidates[5].url=candidates[6].url+'#fragment';
    candidates[7].embedding=null;
    const prepared=prepareRelatedSources(candidates),before=JSON.stringify(candidates);
    assert.ok(Object.isFrozen(prepared));assert.deepEqual(Object.keys(prepared),['rank','rankPrepared']);
    const tokenPreparation=createRelatedSourcesPreparation();tokenPreparation.appendPrepared(candidates.map(prepareRelatedSource));
    const tokenPrepared=tokenPreparation.finish();
    for(const query of [candidates[0],source('query',Array.from({length:384},()=>rng()-.5),'confirmed')])
      for(const limit of [0,1,20,100])for(const minSimilarity of [-1,0,.88,1]) {
        const options={limit,minSimilarity},expected=priorRank(query,candidates,options);
        assert.deepEqual(rankRelatedSources(query,candidates,options),expected);
        assert.deepEqual(prepared.rank(query,options),expected);
        assert.deepEqual(tokenPrepared.rankPrepared(prepareRelatedSource(query),options),expected);
        assert.ok(Object.isFrozen(prepared.rank(query,options)));
      }
    assert.equal(JSON.stringify(candidates),before);
  }
});

test('preparation owns immutable copies and query/options validation remains strict on every use',()=>{
  const query=source('query',[1,0]),candidates=[source('a',[1,0]),source('b',[.9,.1],'confirmed')];
  const prepared=prepareRelatedSources(candidates),expected=priorRank(query,candidates);
  candidates[0].embedding.values[0]=-1;candidates[0].title='Changed';candidates.splice(1,1);
  assert.deepEqual(prepared.rank(query),expected);
  let accessed=false;
  const unsafe={...query};Object.defineProperty(unsafe,'embedding',{get(){accessed=true;return null;},enumerable:true});
  assert.throws(()=>prepared.rank(unsafe),TypeError);assert.equal(accessed,false);
  for(const options of [{limit:101},{minSimilarity:NaN},{unknown:true}])assert.throws(()=>prepared.rank(query,options),TypeError);
});

test('extreme/subnormal normalization and exact threshold decisions retain frozen results',()=>{
  for(const values of [[Number.MAX_VALUE,Number.MAX_VALUE/2],[Number.MIN_VALUE,Number.MIN_VALUE],[-0,1]]) {
    const query=source('q',values),candidates=[source('a',values),source('b',[1,0]),source('c',null,'confirmed')];
    const prepared=prepareRelatedSources(candidates);
    const tokenPreparation=createRelatedSourcesPreparation();tokenPreparation.appendPrepared(candidates.map(prepareRelatedSource));
    const tokenPrepared=tokenPreparation.finish();
    for(const minSimilarity of [.88-1e-12,.88,.88+1e-12,-1,1]) {
      const options={limit:100,minSimilarity},expected=priorRank(query,candidates,options);
      assert.deepEqual(rankRelatedSources(query,candidates,options),expected);
      assert.deepEqual(prepared.rank(query,options),expected);
      assert.deepEqual(tokenPrepared.rankPrepared(prepareRelatedSource(query),options),expected);
    }
  }
});

test('invalid arrays, getters, credentials and malformed vectors fail during preparation without private details',()=>{
  const a=source('a',[1,0]);let accessed=false;
  const getter={...a};Object.defineProperty(getter,'title',{get(){accessed=true;return 'Private';},enumerable:true});
  const sparse=Array(2);sparse[0]=1;
  for(const candidates of [[getter],[{...a,url:'https://secret:password@example.org/'}],[source('zero',[0,0])],
    [source('sparse',sparse)],[source('nan',[NaN,0])],Array(2)]) {
    assert.throws(()=>prepareRelatedSources(candidates),error=>error instanceof TypeError && error.message==='Invalid related-source input');
  }
  assert.equal(accessed,false);
});
