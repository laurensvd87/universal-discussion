import test from 'node:test';import assert from 'node:assert/strict';
import {createWikipediaEntitySubjectIndex as create} from './wiki-entity-subjects.js';
const field=(language,value)=>({language,value});
function item(id,name,description,titles){return {id,type:'item',lastrevid:12345,labels:{en:field('en',name)},descriptions:{en:field('en',description)},
 sitelinks:Object.fromEntries(Object.entries(titles).map(([l,title])=>[l+'wiki',{site:l+'wiki',title,badges:[]}]))};}
const input=()=>({entities:{Q101:item('Q101','Atlas','programming language',{en:'Atlas (programming language)',de:'Atlas (Programmiersprache)',nl:'Atlas (programmeertaal)'}),
 Q202:item('Q202','Atlas','mountain range',{en:'Atlas Mountains',de:'Atlas (Gebirge)',nl:'Atlasgebergte'})},success:1});
const url=(language,title)=>'https://'+language+'.wikipedia.org/wiki/'+encodeURIComponent(title.replaceAll(' ','_'));

test('exact multilingual sitelinks resolve one declared subject despite different words or scripts',()=>{
 const index=create(JSON.stringify(input()));for(const [language,title]of [['en','Atlas (programming language)'],['de','Atlas (Programmiersprache)'],['nl','Atlas (programmeertaal)']])assert.equal(index.resolve(url(language,title)).entityKey,'wikidata:Q101');
 assert.equal(index.describe().sitelinkCount,6);assert.equal(index.describe().parentRelationsImported,false);
});
test('same label is not identity and descriptions keep different senses readable',()=>{
 const index=create(JSON.stringify(input())),a=index.resolve(url('en','Atlas (programming language)')),b=index.resolve(url('en','Atlas Mountains'));
 assert.equal(a.label,b.label);assert.notEqual(a.entityKey,b.entityKey);assert.notEqual(a.description,b.description);assert.equal(a.assignmentAuthority,false);
});
test('a label mention or Wikipedia-like hostname cannot attach an arbitrary general page',()=>{
 const index=create(JSON.stringify(input()));for(const u of ['https://example.org/Atlas','https://en.wikipedia.org.evil.example/wiki/Atlas_Mountains','http://en.wikipedia.org/wiki/Atlas_Mountains','https://name:password@en.wikipedia.org/wiki/Atlas_Mountains','https://en.wikipedia.org/wiki/Atlas_Mountains?oldid=1','https://en.wikipedia.org/wiki/Atlas_Mountains#section','https://en.wikipedia.org/w/index.php?title=Atlas_Mountains','https://en.wikipedia.org/wiki/Atlas','https://en.wikipedia.org/wiki/%zz'])assert.equal(index.resolve(u).status,'unresolved');
});
test('URL title normalization respects underscores, Unicode and case without redirect guessing',()=>{
 const v=input();v.entities.Q101.sitelinks.enwiki.title='Café Atlas';const index=create(JSON.stringify(v));
 assert.equal(index.resolve(url('en','Café Atlas')).entityKey,'wikidata:Q101');assert.equal(index.resolve(url('en','café Atlas')).status,'unresolved');
});
test('duplicate sitelinks, revision/key mismatch, redirects and provider errors fail rather than selecting the first entity',()=>{
 for(const mutate of [v=>{v.entities.Q202.sitelinks.enwiki.title=v.entities.Q101.sitelinks.enwiki.title;},v=>{v.entities.Q101.lastrevid=0;},v=>{v.entities.Q101.id='Q202';},v=>{v.redirects=[];},v=>{v.error={code:'maxlag'};}]){const v=input();mutate(v);assert.throws(()=>create(JSON.stringify(v)));}
});
test('missing entities remain explicit and cannot manufacture an index entry',()=>{
 const v=input();v.entities.Q303={id:'Q303',missing:''};const d=create(JSON.stringify(v)).describe();assert.equal(d.entityCount,2);assert.deepEqual(d.unavailable,[{id:'Q303',reason:'missing-entity'}]);
});
test('configured language selects actual labels; shared default mul is retained without claiming translation',()=>{
 const v=input();v.entities.Q101.labels={mul:field('mul','Atlas')};v.entities.Q101.descriptions.de=field('de','Programmiersprache');
 const r=create(JSON.stringify(v)).resolve(url('de','Atlas (Programmiersprache)'),'de');assert.equal(r.labelLanguage,'mul');assert.equal(r.descriptionLanguage,'de');assert.equal(r.label,'Atlas');
});
test('bounds, controls and object hooks do not turn external metadata into executable behavior',()=>{
 let called=0;assert.throws(()=>create(new Proxy({}, {get(){called++;throw Error();}})));assert.equal(called,0);
 for(const raw of ['null','{}','not-json','x'.repeat(1048577)])assert.throws(()=>create(raw));
 const v=input();v.entities.Q101.labels.en.value='PRIVATE\u202eCONTROL';assert.throws(()=>create(JSON.stringify(v)));
 const many={entities:Object.fromEntries(Array.from({length:65},(_,i)=>['Q'+(i+1),item('Q'+(i+1),'a','b',{})]))};assert.throws(()=>create(JSON.stringify(many)));
});
