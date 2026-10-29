import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeArticlePublicationClaims as normalize} from './publication-metadata.js';
const claim=(value,kind='meta-article-published-time')=>({kind,value});
const run=values=>normalize(JSON.stringify(values));

test('calendar publication dates stay calendar dates without an invented timestamp or timezone',()=>{
 const r=run([claim('2024-10-08')]);assert.equal(r.status,'known');assert.equal(r.kind,'calendar-date');assert.equal(r.value,'2024-10-08');assert.equal(r.epochMs,null);assert.equal(r.resolutionMs,null);
});
test('equivalent timezone claims normalize to one UTC timestamp and retain publisher provenance kinds',()=>{
 const r=run([claim('2024-10-08T09:00:00-07:00'),claim('2024-10-08T16:00:00Z','jsonld-datepublished')]);assert.equal(r.status,'known');assert.equal(r.value,'2024-10-08T16:00:00.000Z');assert.equal(r.resolutionMs,1000);assert.deepEqual(r.claimKinds,['jsonld-datepublished','meta-article-published-time']);
});
test('unknown publisher-local offset does not erase a known UTC instant or invent a local calendar day',()=>{
 const r=run([claim('2024-10-08T16:00:00-00:00')]);assert.equal(r.status,'known');assert.equal(r.value,'2024-10-08T16:00:00.000Z');assert.equal(Object.hasOwn(r,'localOffsetMinutes'),false);
});
test('consistent coarse and precise claims keep the supported precision instead of adding zeroes as evidence',()=>{
 const r=run([claim('2024-10-08T16:00:00Z'),claim('2024-10-08T16:00:00.123Z','time-datepublished')]);assert.equal(r.status,'known');assert.equal(r.value,'2024-10-08T16:00:00.123Z');assert.equal(r.resolutionMs,1);
 assert.equal(run([claim('2024-10-08T16:00:00.1Z')]).resolutionMs,100);
});
test('invalid calendar rollovers, leap days, timezone offsets and clock components are refused',()=>{
 for(const d of ['2023-02-29','2024-04-31','0000-01-01','2024-00-10','2024-13-01','2024-01-00','2024-10-08T24:00:00Z','2024-10-08T12:60:00Z','2024-10-08T12:00:60Z','2024-10-08T12:00:00+14:01','2024-10-08T12:00:00-15:00'])assert.equal(run([claim(d)]).status,'invalid',d);
 assert.equal(run([claim('2024-02-29')]).status,'known');
});
test('unknown precision or missing timezone stays unknown rather than using the server clock or locale',()=>{
 for(const d of ['2024','October 8, 2024','2024-10-08T12:00:00','2024-10-08T12:00:00.123456Z','yesterday']){const r=run([claim(d)]);assert.equal(r.status,'unknown');assert.equal(r.value,null);assert.equal(r.epochMs,null);}
});
test('conflicting publication claims do not choose the newest, oldest or first one',()=>{
 for(const values of [[claim('2024-10-08'),claim('2024-10-09')],[claim('2024-10-08T12:00:00Z'),claim('2024-10-08T12:00:01Z')]]){
  const a=run(values),b=run([...values].reverse());assert.equal(a.status,'conflict');assert.deepEqual(a,b);assert.equal(a.value,null);
 }
});
test('bare calendar claims allow real timezone differences but reject genuinely inconsistent dates',()=>{
 const r=run([claim('2024-10-08'),claim('2024-10-09T01:00:00Z')]);assert.equal(r.status,'known');assert.equal(r.kind,'timestamp');assert.equal(r.value,'2024-10-09T01:00:00.000Z');
 assert.equal(run([claim('2024-10-08'),claim('2024-10-10T01:00:00Z')]).status,'conflict');
});
test('modified time, visits and unknown properties are never publication evidence',()=>{
 for(const kind of ['dateModified','article:modified_time','last-visit','http-date']){const r=run([claim('2024-10-08T12:00:00Z',kind)]);assert.equal(r.status,'invalid');assert.equal(r.value,null);}
 assert.equal(normalize('[{"kind":"meta-datepublished","value":"2024-10-08","__proto__":{"x":1}}]').status,'invalid');assert.equal({}.x,undefined);
});
test('finite JSON limits and opaque errors never return the invalid source value',()=>{
 assert.equal(normalize(' ').status,'invalid');assert.equal(normalize('x'.repeat(8193)).status,'capacity');assert.equal(run(Array.from({length:17},()=>claim('2024-10-08'))).status,'capacity');
 const r=run([claim('PRIVATE_INVALID_MARKER')]);assert.equal(JSON.stringify(r).includes('PRIVATE_INVALID_MARKER'),false);assert.equal(normalize('{').reason,'malformed-json');assert.equal(run([]).reason,'missing');assert.ok(Object.isFrozen(r.claimKinds));
});
test('untrusted objects cannot execute coercion, getter or proxy hooks',()=>{
 let hooks=0;const p=new Proxy({},{get(){hooks++;throw Error('hook');},ownKeys(){hooks++;throw Error('hook');}});assert.throws(()=>normalize(p),TypeError);assert.throws(()=>normalize({toString(){hooks++;return '[]';}}),TypeError);assert.equal(hooks,0);
});
