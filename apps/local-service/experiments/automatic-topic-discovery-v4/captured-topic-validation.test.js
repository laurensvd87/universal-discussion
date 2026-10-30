import test from 'node:test';import assert from 'node:assert/strict';
import {CAPTURED_TOPIC_URLS as urls} from './captured-topic-validation-cohort.js';
import {CAPTURED_TOPIC_GOLD as gold,scoreCapturedTopicValidation as score} from './captured-topic-validation-gold.js';
test('fixed real captures retain failures in the denominator and never accept the publisher Nature as the nature topic',()=>{
 assert.equal(urls.length,8);assert.deepEqual(urls.map(v=>v.id),gold.map(v=>v.id));assert.equal(new Set(urls.map(v=>v.url)).size,8);
 const rows=urls.map(({id})=>({id,status:'capture-unavailable',failure:{code:'timeout'}}));
 let result=score(rows);assert.equal(result.total,8);assert.equal(result.captureUnavailable,8);
 rows[6]={id:'R7',status:'matched',lookup:{labels:['Nature']},rooted:{rootPath:['science']}};
 result=score(rows);assert.equal(result.wrong,1);assert.equal(result.rootCorrect,1);assert.equal(result.captureUnavailable,7);
 rows[6].lookup.labels=[];result=score(rows);assert.equal(result.unknownUnresolved,1);assert.equal(result.wrong,0);
 assert.throws(()=>score(rows.slice(1)));assert.throws(()=>score([...rows.slice(1),rows[1]]));
});
