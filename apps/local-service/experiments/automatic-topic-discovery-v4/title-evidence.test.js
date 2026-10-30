import test from 'node:test';import assert from 'node:assert/strict';
import {isolatePublisherTitleEvidence as clean} from './title-evidence.js';
test('publisher footer evidence is derived from the actual hostname in different languages',()=>{
 for(const [title,host,want]of [['Linux - Wikipedia, la enciclopedia libre','es.wikipedia.org','Linux'],['Photography – Wikipedia','de.wikipedia.org','Photography'],
  ['Monty Python — Wikipédia','fr.wikipedia.org','Monty Python — Wikipédia'],['Kapsalon maken | Leukerecepten.nl','www.leukerecepten.nl','Kapsalon maken'],
  ['Document title - example-news.org','example-news.org','Document title'],['Another title - Example-News','example-news.org','Another title']]){
  const r=clean(title,host);assert.equal(r.title,want);assert.equal(title.normalize('NFKC').slice(0,r.prefixEnd),r.title);
 }
 // An accented brand differs from the ASCII hostname. Refusal is deliberate:
 // this candidate performs no invented alias/translation/transliteration.
});
test('compound names and substantive title suffixes are preserved',()=>{
 for(const title of ['Tesla-Transformator','All Saints - new album','NASA - NASA launches a rocket','Kapsalon – with chicken','Linux.com'])
  assert.equal(clean(title,'nasa.gov').title,title);
 assert.equal(clean('A|B|publisher.test','publisher.test').title,'A|B');
});
test('normalization retains literal witness offsets and never interprets markup',()=>{
 const title='Ｋｏａｌａｓ — Wildlife.example',r=clean(title,'wildlife.example');assert.equal(r.title,'Koalas');
 assert.equal(title.normalize('NFKC').slice(0,r.prefixEnd),r.title);
 assert.equal(clean('<img src=x> | Wildlife.example','wildlife.example').title,'<img src=x>');
});
test('invalid publisher/title data refuses without coercing objects',()=>{
 let called=false;const object={toString(){called=true;return 'title';}};
 for(const args of [[object,'example.test'],['title',object],['a\nline','example.test'],['x','https://example.test'],['x'.repeat(201),'example.test']])assert.throws(()=>clean(...args));
 assert.equal(called,false);
});
