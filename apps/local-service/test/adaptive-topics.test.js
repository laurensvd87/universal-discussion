import assert from 'node:assert/strict';
import test from 'node:test';
import { ADAPTIVE_TOPIC_POLICY, planAdaptiveTopics } from '../src/domain/adaptive-topics.js';

const normalize = values => {
  const norm=Math.hypot(...values);
  return [...values.map(value=>value/norm),...Array(384-values.length).fill(0)];
};
const source=(id,values,url=`https://example.com/${id}`)=>({id,url,provenance:'owner-local-page-embedding/v1',
  extractorVersion:'main-text-prefix/v1',embedding:{modelId:'e5-small-q8-browser-main-prefix-v1',values:normalize(values)}});
const link=(sourceId,topicId,method='learned-provisional')=>({sourceId,topicId,method});
const groups=result=>result.partitions.map(item=>item.sourceIds.join(',')).sort();
function dense() {
  const v=Math.sqrt(.985), e=Math.sqrt(.015), c=.94, s=Math.sqrt(1-c*c);
  return [source('a1',[v,0,e,0]),source('a2',[v,0,-e,0]),
    source('b1',[v*c,v*s,0,e]),source('b2',[v*c,v*s,0,-e])];
}

test('frozen rule constants and sparse .90 merge with competing-member veto',()=>{
  assert.deepEqual(ADAPTIVE_TOPIC_POLICY,{version:'adaptive-supported-partitions/v1',floor:.90,tight:.94,
    competingMargin:.04,duplicateSimilarity:.995,minimumSupport:2});
  const a=source('a',[1,0]),b=source('b',[.91,Math.sqrt(1-.91*.91)]);
  assert.deepEqual(groups(planAdaptiveTopics({sources:[a,b],sourceLinks:[link('a','first'),link('b','second')]})),['a,b']);
  // Two separately pinned competitors prevent an ambiguous nearby newcomer.
  const c=source('c',[1+.91,Math.sqrt(1-.91*.91)]);
  const pinned=[link('a','owner-a','manual-confirmed'),link('b','owner-b','manual-confirmed')];
  assert.deepEqual(groups(planAdaptiveTopics({sources:[a,b,c],sourceLinks:pinned})),['a','b','c']);
});

test('two independently supported .94-cohesive subgroups split, then remain split without support',()=>{
  const samples=dense();
  const links=samples.map(item=>link(item.id,'old-topic'));
  const first=planAdaptiveTopics({sources:samples,sourceLinks:links});
  assert.deepEqual(groups(first),['a1,a2','b1,b2']);
  assert.deepEqual(first.decisions,[{reason:'supported-tight-split',sourceIds:['a1','a2','b1','b2']}]);
  assert.ok(first.partitions.every(part=>part.retainTight));
  const splitLinks=[link('a1','topic-a'),link('a2','topic-a'),link('b1','topic-b'),link('b2','topic-b')];
  const repeat=planAdaptiveTopics({sources:[...samples].reverse(),sourceLinks:[...splitLinks].reverse(),previousPartitions:first.partitions});
  assert.deepEqual(repeat.partitions,first.partitions);
  const afterRemoval=planAdaptiveTopics({sources:[samples[0],samples[2]],sourceLinks:[splitLinks[0],splitLinks[2]],previousPartitions:repeat.partitions});
  assert.deepEqual(groups(afterRemoval),['a1','b1']);
  assert.ok(afterRemoval.partitions.every(part=>part.retainTight));
});

test('duplicate flooding and lone neighboring pages cannot manufacture split support',()=>{
  const samples=dense();
  const duplicates=[samples[0],source('a-copy',samples[0].embedding.values.slice(0,4)),samples[2],
    source('b-copy',samples[2].embedding.values.slice(0,4))];
  const oneTopic=duplicates.map(item=>link(item.id,'old-topic'));
  assert.deepEqual(groups(planAdaptiveTopics({sources:duplicates,sourceLinks:oneTopic})),['a-copy,a1,b-copy,b1']);
  const three=[samples[0],samples[1],samples[2]];
  assert.deepEqual(groups(planAdaptiveTopics({sources:three,sourceLinks:three.map(item=>link(item.id,'old-topic'))})),['a1,a2,b1']);
});

test('manual pins preserve their Topic and prevent incompatible merge/split',()=>{
  const samples=dense();
  const all=samples.map(item=>link(item.id,'pinned'));
  all[0]=link('a1','pinned','manual-confirmed'); all[2]=link('b1','pinned','manual-confirmed');
  const same=planAdaptiveTopics({sources:samples,sourceLinks:all});
  assert.deepEqual(groups(same),['a1,a2,b1,b2']);
  assert.deepEqual(same.decisions,[{reason:'manual-pin-preserved',sourceIds:['a1','a2','b1','b2']}]);
  const a=source('a',[1,0]),b=source('b',[.999,Math.sqrt(1-.999*.999)]);
  const different=planAdaptiveTopics({sources:[a,b],sourceLinks:[link('a','owner-a','manual-confirmed'),link('b','owner-b','manual-confirmed')]});
  assert.deepEqual(groups(different),['a','b']);
  assert.deepEqual(different.partitions.map(item=>item.pinnedTopicId),['owner-a','owner-b']);
});

test('same evidence is order independent; support removal does not undo tighter routing',()=>{
  const samples=dense(),links=samples.map(item=>link(item.id,'old-topic'));
  const expected=planAdaptiveTopics({sources:samples,sourceLinks:links});
  for(const order of [[2,0,3,1],[3,2,1,0],[1,3,0,2]]) {
    const actual=planAdaptiveTopics({sources:order.map(i=>samples[i]),sourceLinks:order.map(i=>links[i])});
    assert.deepEqual(actual,expected);
  }
  // Earlier separate singletons can join at .90; a prior supported split is sticky.
  const adjacent=[samples[0],samples[2]];
  assert.deepEqual(groups(planAdaptiveTopics({sources:adjacent,sourceLinks:[link('a1','A'),link('b1','B')]})),['a1,b1']);
  const sticky=planAdaptiveTopics({sources:adjacent,sourceLinks:[link('a1','A'),link('b1','B')],previousPartitions:expected.partitions});
  assert.deepEqual(groups(sticky),['a1','b1']);
});

test('fixture vectors and malformed learned vectors cannot enter learned partition',()=>{
  const a=source('a',[1,0]);
  const fixture={id:'fixture',provenance:'project-created-hand-authored-demo/1'};
  assert.deepEqual(groups(planAdaptiveTopics({sources:[a,fixture],sourceLinks:[link('fixture','demo','fixture-confirmed')]})),['a']);
  for(const patch of [{embedding:{...a.embedding,values:[1]}},{extractorVersion:'future'},
    {embedding:{...a.embedding,values:normalize([0,0])}},{id:'invalid id'}]) {
    assert.throws(()=>planAdaptiveTopics({sources:[{...a,...patch}],sourceLinks:[]}));
  }
});

test('old incoherent provisional group splits at floor and cannot expand through one close member',()=>{
  const a=source('a',[1,0]),b=source('b',[.96,.28]),c=source('c',[-1,0]);
  const old=[link('a','old'),link('b','old'),link('c','old')];
  const result=planAdaptiveTopics({sources:[a,b,c],sourceLinks:old});
  assert.deepEqual(groups(result),['a,b','c']);
  assert.ok(result.decisions.some(item=>item.reason==='incompatible-representation-split'));
  const ambiguous=planAdaptiveTopics({sources:[a,b,c,source('d',[.91,Math.sqrt(1-.91*.91)])],sourceLinks:old});
  assert.ok(ambiguous.partitions.every(part=>!part.sourceIds.includes('c') || part.sourceIds.length===1));
});

test('manual owner destination never expands automatically and conflicting pinned geometry stays fixed',()=>{
  const a=source('a',[1,0]),b=source('b',[.99,Math.sqrt(1-.99*.99)]);
  const preserved=planAdaptiveTopics({sources:[a,b],sourceLinks:[link('a','owner','manual-confirmed')]});
  assert.deepEqual(groups(preserved),['a','b']);
  const far=source('far',[-1,0]);
  const pinned=planAdaptiveTopics({sources:[a,far],sourceLinks:[link('a','owner','manual-confirmed'),link('far','owner','manual-confirmed')]});
  assert.deepEqual(groups(pinned),['a,far']);
  assert.equal(pinned.partitions[0].pinnedTopicId,'owner');
});

test('bounded learned Sources terminate without unbounded result or order drift',()=>{
  const sources=Array.from({length:200},(_,i)=>source(`s${String(i).padStart(3,'0')}`,i<100 ? [1,0] : [-1,0]));
  const started=performance.now();
  const first=planAdaptiveTopics({sources,sourceLinks:[]});
  assert.ok(performance.now()-started<10000,'local planner budget exceeded');
  assert.equal(first.partitions.flatMap(part=>part.sourceIds).length,200);
  assert.ok(first.decisions.length<=200);
  const reversed=planAdaptiveTopics({sources:[...sources].reverse(),sourceLinks:[]});
  assert.deepEqual(reversed,first);
});

test('incoherent manual pins remain fixed without absorbing a neighboring provisional member',()=>{
  const a=source('a',[1,0]),b=source('b',[-1,0]),c=source('c',[.99,Math.sqrt(1-.99*.99)]);
  const links=[link('a','owner','manual-confirmed'),link('b','owner','manual-confirmed'),link('c','owner')];
  const result=planAdaptiveTopics({sources:[a,b,c],sourceLinks:links});
  assert.deepEqual(groups(result),['a,b','c']);
  assert.equal(result.partitions.find(part=>part.sourceIds.includes('a')).pinnedTopicId,'owner');
});

test('staged growth reaches the same supported split across arrival permutations, then stays tight',()=>{
  const samples=dense();
  for(const order of [[0,2,1,3],[2,0,3,1],[0,1,2,3]]) {
    const seen=[]; let links=[],previous=[];
    for(const index of order) {
      seen.push(samples[index]);
      const plan=planAdaptiveTopics({sources:seen,sourceLinks:links,previousPartitions:previous});
      const again=planAdaptiveTopics({sources:seen,sourceLinks:links,previousPartitions:previous});
      assert.deepEqual(plan,again);
      links=plan.partitions.flatMap(part=>part.sourceIds.map(sourceId=>link(sourceId,`topic-${part.sourceIds[0]}`)));
      previous=plan.partitions;
    }
    assert.deepEqual(groups({partitions:previous}),['a1,a2','b1,b2']);
    assert.ok(previous.every(part=>part.retainTight));
    const reduced=planAdaptiveTopics({sources:[samples[0],samples[2]],sourceLinks:links.filter(item=>['a1','b1'].includes(item.sourceId)),previousPartitions:previous});
    assert.deepEqual(groups(reduced),['a1','b1']);
  }
});
