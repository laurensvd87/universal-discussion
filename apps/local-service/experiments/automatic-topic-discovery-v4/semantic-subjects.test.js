import test from 'node:test'; import assert from 'node:assert/strict';
import {buildSubjectQuestion,parseSubjectProposal,scoreSubjectProposal} from './semantic-subjects.js';
import {PUBLIC_SUBJECT_CARDS as cards,PUBLIC_SUBJECT_GOLD as gold} from './public-subject-cohort.js';

test('fixed public cards fit one normal question and gold labels or browsing identifiers are not sent', () => {
  const question = buildSubjectQuestion(cards); assert.ok(question.length <= 2000);
  assert.equal(question.includes('python-language'),false); assert.equal(question.includes('source-'),false);
  assert.equal(question.includes('https://'),false); assert.equal(question.includes('koalas'),false);
  assert.equal(cards.length,12); assert.equal(gold.length,12);
});
test('same label in different semantic branches stays separate and coherent paths share ancestors', () => {
  const input = cards.slice(0,3), proposal = parseSubjectProposal(input,JSON.stringify({
    P1:['Technology','Programming','Python'],P2:['Technology','Programming','Python'],P3:['Culture','Comedy','Python']}));
  assert.equal(proposal.selections[0].leafKey,proposal.selections[1].leafKey);
  assert.notEqual(proposal.selections[0].leafKey,proposal.selections[2].leafKey);
  assert.equal(proposal.nodes.length,6); assert.equal(proposal.scope.assignmentAuthority,false);
});
test('duplicate or escaped keys, invented IDs, cycles, invalid roots, code fences and oversize paths are refused', () => {
  const one = cards.slice(0,1);
  for (const body of ['{"P1":[],"P1":[]}','{"\\u00501":[]}','{"P2":[]}',
    '{"P1":["Nature","Animals","Nature"]}','{"P1":["Unknown"]}',
    '```json\n{"P1":[]}\n```','{"P1":["Nature","A","B","C","D"]}'])
    assert.throws(() => parseSubjectProposal(one,body));
  assert.equal(parseSubjectProposal(one,'{"P1":[]}').selections[0].leafKey,null);
});
test('scoring counts false and missed same-subject pairs rather than rewarding abstention or title copying', () => {
  const proposal = parseSubjectProposal(cards,JSON.stringify(Object.fromEntries(cards.map(card => [card.id,[]]))));
  const score = scoreSubjectProposal(proposal,gold); assert.equal(score.abstentions,12);
  assert.equal(score.correctSubjects,0); assert.equal(score.missedPairs,4); assert.equal(score.falsePairs,0);
  assert.deepEqual(score.requiredHierarchyChecks,{gtaFamily:false,koalaAnimals:false});
  const merged = parseSubjectProposal(cards,JSON.stringify(Object.fromEntries(cards.map(card => [card.id,['Other','Topic']]))));
  const wrong = scoreSubjectProposal(merged,gold); assert.equal(wrong.correctSubjects,0);
  assert.equal(wrong.correctPairs,4); assert.equal(wrong.falsePairs,62);
});
