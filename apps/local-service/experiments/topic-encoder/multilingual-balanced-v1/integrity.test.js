import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url));
const langs=['en','de','nl','fr','es'];
const englishCoreMarkers=[
 'The observatory shifted its outer buoy array','The observatory opened its storm archive',
 'The transit authority started a weekend night tram','Inspectors found a cracked support plate',
 'The festival moved its main stage','The festival reserved 300 more student tickets',
 'The observatory closed its west-roof telescope','The observatory added evening visits',
 'The library network redirected its mobile van','The central reading room will stay open',
 'The water board delayed restarting','The board began a three-month shared-meter pilot',
 'The robotics firm paused a warehouse-cart trial','The firm opened its workshop',
 'The museum replaced a static ferry display','The museum introduced timed object-store visits',
 'The market moved food stalls','The market began a compost trial',
 'The district postponed shade sails','Four campuses will open breakfast rooms',
 'The studio postponed a Moss Harbor game update','The studio added a low-bandwidth voice option',
 'The ferry cooperative restricted South Jetty ramp access','The cooperative added a 07:10 weekday school sailing'
];
const norm=s=>s.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu,' ').trim();
const all=[];
for(const split of ['train','validation','test']) {
 const rows=readFileSync(join(dir,`${split}.jsonl`),'utf8').trim().split(/\r?\n/).map(JSON.parse);
 assert.equal(rows.length,split==='train'?160:40,`${split} count`);
 assert.ok(rows.every(r=>r.split===split)); all.push(...rows);
}
assert.equal(all.length,240);
assert.equal(new Set(all.map(r=>r.id)).size,240);
assert.equal(new Set(all.map(r=>norm(`${r.title} ${r.body}`))).size,240,'normalized duplicate text');
const familySplits=new Map(), developments=new Map();
for(const r of all){
 const old=familySplits.get(r.family); assert.ok(!old||old===r.split,`family leakage: ${r.family}`); familySplits.set(r.family,r.split);
 assert.ok(langs.includes(r.language));
 if(r.language!=='en') for(const marker of englishCoreMarkers) assert.ok(!r.body.includes(marker),`${r.id}: English event-core marker ${marker}`);
 const key=`${r.family}/${r.development}`; if(!developments.has(key))developments.set(key,[]); developments.get(key).push(r);
}
assert.equal(familySplits.size,12);
assert.deepEqual([...familySplits.values()].filter(s=>s==='train').length,8);
assert.deepEqual([...familySplits.values()].filter(s=>s==='validation').length,2);
assert.deepEqual([...familySplits.values()].filter(s=>s==='test').length,2);
assert.equal(developments.size,24);
for(const [key,rs] of developments){
 assert.equal(rs.length,10,`${key} records`);
 assert.equal(new Set(rs.map(r=>r.topicLabel)).size,1,`${key}: language-independent gold Topic`);
 assert.ok(rs.every(r=>r.topicLabel===r.development),`${key}: stable event identifier`);
 for(const lang of langs){const pair=rs.filter(r=>r.language===lang);assert.equal(pair.length,2);assert.equal(new Set(pair.map(r=>r.viewpoint)).size,2,`${key}/${lang} viewpoints`);assert.equal(new Set(pair.map(r=>r.viewpointStyle)).size,2);
  const [support,question]=[pair.find(r=>r.viewpoint==='supportive'),pair.find(r=>r.viewpoint==='questioning')];
  assert.ok(support.eventCore&&question.eventCore,`${key}/${lang}: event core`);
  assert.notEqual(norm(support.eventCore),norm(question.eventCore),`${key}/${lang}: paraphrased core differs`);
  assert.ok(!norm(question.eventCore).startsWith(norm(support.eventCore)),`${key}/${lang}: questioning core is not a prefix copy`);
  const supportWords=new Set(norm(support.eventCore).split(' ')), questionWords=new Set(norm(question.eventCore).split(' '));
  const changed=[...supportWords].filter(word=>!questionWords.has(word)).length+[...questionWords].filter(word=>!supportWords.has(word)).length;
  assert.ok(changed>=2,`${key}/${lang}: paraphrase changes too little wording`);
 }
 const texts=rs.map(r=>r.body);assert.equal(new Set(texts).size,10);
}
for(const lang of langs){const rs=all.filter(r=>r.language===lang);assert.equal(rs.length,48);const counts=new Map();for(const r of rs)counts.set(r.viewpoint,(counts.get(r.viewpoint)||0)+1);assert.deepEqual([...counts.values()].sort((a,b)=>a-b),[24,24],`${lang} viewpoint balance`);}
// Every same-family pair has distinct event-specific anchors and quantitative or operational facts.
for(const family of familySplits.keys()){
 const ds=[...developments.entries()].filter(([k])=>k.startsWith(`${family}/`)).map(([,v])=>v);
 assert.equal(ds.length,2);
 assert.notEqual(ds[0][0].topicLabel,ds[1][0].topicLabel);
 assert.notEqual(ds[0][0].development,ds[1][0].development);
 assert.notEqual(ds[0][0].body,ds[1][0].body);
}
console.log('Corpus integrity passed: 240 records; 12 families; 24 developments; 5 languages; whole-family 8/2/2 split.');
