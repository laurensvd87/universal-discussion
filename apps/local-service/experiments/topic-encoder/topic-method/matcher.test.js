import test from 'node:test';
import assert from 'node:assert/strict';
import { matchTopicDocuments } from './matcher.js';

const source = (id, title, angle = 0, host = id) => ({ id, title,
  url: `https://${host}.example.test/story`, embedding: { values: [Math.cos(angle), Math.sin(angle)] } });
const memberships = result => result.partitions.map(group => group.sourceIds).sort((a, b) => a[0].localeCompare(b[0]));

test('two independent bridges support opposing descriptions; an adjacent action stays related', () => {
  const pages = [
    source('guardian', 'Perilous and chaotic, Trump\u2019s \u2018Liberation Day\u2019 endangers the economy', 0),
    source('fox', 'Trump touts American Dream in historic tariff announcement', 0.42),
    source('bridge1', 'Liberation Day tariff announcement draws global reactions', 0.15),
    source('bridge2', 'Liberation Day tariff announcement leaves markets divided', 0.22),
    source('exemption', 'Trump tariff exemptions prompt fresh market reaction', 0.30)
  ];
  const result = matchTopicDocuments(pages);
  assert.deepEqual(memberships(result), [['bridge1', 'bridge2', 'fox', 'guardian'], ['exemption']]);
  assert.equal(result.partitions.find(group => group.sourceIds.includes('guardian')).tier, 'corroborated-bridge');
  assert.ok(result.relatedEdges.some(edge => edge.sourceIds.includes('exemption')));
  assert.deepEqual(matchTopicDocuments([...pages].reverse()), result);
});

test('one bridge and same-host bridge copies cannot manufacture corroboration', () => {
  const core = [source('guardian', 'Trump Liberation Day shakes world economy', 0),
    source('fox', 'Trump tariff announcement promises American Dream', 0.42),
    source('bridge1', 'Liberation Day tariff announcement divides observers', 0.2)];
  assert.equal(memberships(matchTopicDocuments(core)).some(group => group.includes('fox') && group.includes('guardian')), false);
  const copies = [...core, source('bridge2', 'Liberation Day tariff announcement praised by leaders', 0.22, 'bridge1')];
  assert.equal(memberships(matchTopicDocuments(copies)).some(group => group.includes('fox') && group.includes('guardian')), false);
});

test('generic shared subject and a high cosine do not merge distinct developments', () => {
  const pages = [source('announce', 'Trump tariff announcement hits trade partners', 0),
    source('exempt', 'Trump tariff exemptions surprise trade partners', 0.1)];
  const result = matchTopicDocuments(pages);
  assert.deepEqual(memberships(result), [['announce'], ['exempt']]);
  assert.equal(result.relatedEdges[0].tier, 'related');
});

test('product versions conflict while incidental numeric figures do not', () => {
  const versions = [source('v16', 'Orion 16 launch draws praise', 0),
    source('v17', 'Orion 17 launch draws praise', 0.1)];
  assert.deepEqual(memberships(matchTopicDocuments(versions)), [['v16'], ['v17']]);
  const counts = [source('one', 'Orion launch draws 12 protesters', 0),
    source('two', 'Orion launch draws 24 protesters', 0.1)];
  assert.deepEqual(memberships(matchTopicDocuments(counts)), [['one', 'two']]);
});

test('curly punctuation, Unicode normalization, and publisher separators preserve title cues', () => {
  const pages = [
    source('plain', 'Trump\u2019s \u2018Liberation Day\u2019 announcement \u2014 The Guardian', 0),
    source('wide', '\uff2c\uff49\uff42\uff45\uff52\uff41\uff54\uff49\uff4f\uff4e \uff24\uff41\uff59 announced \u2013 Fox News', 0.1)
  ];
  assert.deepEqual(memberships(matchTopicDocuments(pages)), [['plain', 'wide']]);
});
