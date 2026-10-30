import test from 'node:test';import assert from 'node:assert/strict';
import {CACHED_TOPIC_TRANSFER_CARDS as cards,CACHED_TOPIC_TRANSFER_PROTOCOL as protocol} from './cached-topic-transfer-cards.js';
import {CACHED_TOPIC_TRANSFER_GOLD as gold,scoreCachedTopicTransfer as score} from './cached-topic-transfer-gold.js';
test('score separates exact subjects, broader known answers, unknown ancestors, unknown refusals and wrong siblings',()=>{
 const rows=gold.map(row=>({id:row.id,lookup:{labels:[...row.path]}}));
 rows[0].lookup.labels=['Technology'];rows[1].lookup.labels=[];rows[7].lookup.labels=['Nature','Animals','Mammals'];
 const result=score(rows);assert.equal(result.knownExact,4);assert.equal(result.knownBroader,1);assert.equal(result.knownUnresolved,1);
 assert.equal(result.wrong,1);assert.equal(result.unknownValidAncestor,4);assert.equal(result.unknownUnresolved,1);
 assert.throws(()=>score(rows.slice(1)));assert.throws(()=>score(rows.map(()=>rows[0])));
});
test('prospective cards keep missing bodies explicit and a fixed protocol independent of query gold',()=>{
 assert.equal(cards.length,12);assert.equal(new Set(cards.map(row=>row.url)).size,12);
 assert.equal(cards.filter(card=>card.body==='').length,1);assert.equal(gold.filter(row=>row.known).length,6);
 assert.equal(protocol.primaryKnownSubjectTarget,4);assert.equal(protocol.maximumWrongAssignments,0);
 assert.equal(cards.some(card=>'path'in card||'expectedRoot'in card),false);
});
