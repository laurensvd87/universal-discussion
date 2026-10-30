import test from 'node:test';import assert from 'node:assert/strict';
import {CACHED_TOPIC_FRESH_CARDS as cards,CACHED_TOPIC_FRESH_PROTOCOL as protocol} from './cached-topic-fresh-cards.js';
import {CACHED_TOPIC_FRESH_GOLD as gold,scoreFreshCachedTopicTransfer as score} from './cached-topic-fresh-gold.js';
test('fresh query cards carry no annotations; same-name browser/emulator and snake remain explicit negative cases',()=>{
 assert.equal(cards.length,9);assert.equal(new Set(cards.map(row=>row.url)).size,9);assert.equal(cards.some(row=>'paths'in row||'known'in row),false);
 assert.equal(protocol.knownSubjectTotal,6);assert.equal(protocol.maximumWrong,0);assert.equal(cards.find(row=>row.id==='F8').title.startsWith('Dolphin Browser'),true);
});
test('scoring accepts either reviewed emulator ancestor but rejects a same-word file-manager leaf or programming-language snake',()=>{
 const rows=gold.map(row=>({id:row.id,lookup:{labels:[...row.paths[0]]}}));assert.equal(score(rows).wrong,0);
 rows[8].lookup.labels=['Games','Video games'];assert.equal(score(rows).unknownValidAncestor,3);
 rows[7].lookup.labels=['Technology','Software','File managers','Dolphin'];rows[6].lookup.labels=['Technology','Software','Programming languages','Python'];
 assert.equal(score(rows).wrong,2);assert.throws(()=>score(rows.slice(1)));
});
