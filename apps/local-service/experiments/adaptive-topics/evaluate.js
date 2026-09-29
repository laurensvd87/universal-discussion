import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { FIXTURES } from './fixtures.js';
import { ADAPTIVE_TOPIC_POLICY,planAdaptiveTopics } from '../../src/domain/adaptive-topics.js';

const groups=parts=>parts.map(part=>part.sourceIds.join(',')).sort();
export function evaluateFrozenAlgebraicFixtures() {
  assert.equal(FIXTURES.schema,'adaptive-topic-algebraic-fixtures/v1');
  assert.equal(createHash('sha256').update(JSON.stringify(FIXTURES)).digest('hex'),
    '777a67dd4c413be9bc758f304209343f8dbb1bd4f3cbcf321970116ea4de0ffc');
  const cases=[];
  for(const sample of FIXTURES.examples) {
    const original=planAdaptiveTopics({sources:sample.sources,sourceLinks:sample.links});
    const reversed=planAdaptiveTopics({sources:[...sample.sources].reverse(),sourceLinks:[...sample.links].reverse()});
    assert.deepEqual(original,reversed);
    assert.deepEqual(groups(original.partitions),sample.expected.map(part=>part.split(',').sort().join(',')).sort());
    const joined=original.partitions.flatMap(part=>part.sourceIds.flatMap((a,i)=>part.sourceIds.slice(i+1).map(b=>[a,b])));
    cases.push({id:sample.id,partitions:groups(original.partitions),supportedSplits:original.decisions.filter(d=>d.reason==='supported-tight-split').length,
      joinedPositivePairs:joined.filter(([a,b])=>sample.labels[a]===sample.labels[b]).length,
      joinedNegativePairs:joined.filter(([a,b])=>sample.labels[a]!==sample.labels[b]).length});
  }
  return {schema:'adaptive-topic-algebraic-report/v1',policyVersion:ADAPTIVE_TOPIC_POLICY.version,
    caveat:'Hand-built vector geometry demonstrates rule mechanics only. It is not a learned E5, event, viewpoint or accuracy evaluation.',cases};
}
if(process.argv[1] && import.meta.url===new URL(`file://${process.argv[1].replaceAll('\\','/')}`).href) {
  process.stdout.write(JSON.stringify(evaluateFrozenAlgebraicFixtures())+'\n');
}
