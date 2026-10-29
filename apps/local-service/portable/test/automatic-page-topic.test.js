// Source/authority regressions only; the separate owned ledger proves SQL.
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const read=async file=>(await readFile(new URL('../canonical-v4/drafts/'+file,import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const sql=await read('automatic-page-topic-membership.sql'),feeds=await read('automatic-topic-feeds.sql'),publicSql=await read('automatic-topic-public-reads.sql');
const body=(s,name,tag)=>s.match(new RegExp('CREATE (?:OR REPLACE )?FUNCTION canonical_v4\\.'+name+'\\([\\s\\S]*?\\n(?:END )?\\$'+tag+'\\$;','u'))?.[0];

test('page Source matching requires the captured material and current protected membership, without a legacy backfill',()=>{
 const index=body(sql,'named_index_root_feed','index');assert(index);
 for(const witness of ['r.operation_digest=w.material_digest',"r.operation_digest=s.payload::jsonb->>'operationDigest'",'m.source_version=s.write_version','m.operation_id=s.operation_id','m.source_stamp=st.stamp','st.postable','identity_.revision=h.revision','installation_.matcher_hash=h.matcher_hash'])assert(index.includes(witness),witness);
 assert(!/INSERT INTO canonical_v4\.named_page_root_material\s+SELECT/gu.test(sql));
 const capture=body(sql,'named_capture_page_material','capture');assert(capture.includes("NEW.scope_kind<>'page'"));assert(capture.includes('s.id=c.origin_source_id'));assert(capture.includes('s.title=NEW.caption'));
 assert(!/named_subject_heads|named_feed_clock|FOR UPDATE|FOR SHARE|named_publish/gu.test(capture));
});

test('scope repair retains its exact reviewed core except enumeration of actual current members',()=>{
 const current=body(sql,'named_process_feed_core','process').replace('CREATE OR REPLACE FUNCTION canonical_v4.named_process_feed_core(','CREATE FUNCTION canonical_v4.named_process_feed_event(')
  .replaceAll('FROM canonical_v4.named_feed_edges','FROM canonical_v4.named_feed_roots');
 assert.equal(current,body(feeds,'named_process_feed_event','process'));
});

test('search retains validation GIN and cursors while using the matched caption and independent occupation witness',()=>{
 let current=body(sql,'named_search_topics','search').replace('CREATE OR REPLACE FUNCTION','CREATE FUNCTION').replaceAll('d.activity_root_id IS NOT NULL','c.caption_root_id IS NOT NULL');
 current=current.replace(`    SELECT DISTINCT ON(c.generation,c.scope_kind,c.scope_id) c.generation,c.scope_kind,c.scope_id,c.caption
     FROM canonical_v4.named_topic_cards c WHERE c.generation=p_generation AND c.search@@q_
     ORDER BY c.generation,c.scope_kind,c.scope_id,c.human DESC,c.root_ordinal DESC,c.caption)`,
 `    SELECT DISTINCT c.generation,c.scope_kind,c.scope_id FROM canonical_v4.named_topic_cards c WHERE c.generation=p_generation AND c.search@@q_)`)
  .replace('SELECT d.scope_kind,d.scope_id,m.caption,c.path','SELECT d.scope_kind,d.scope_id,d.caption,c.path')
  .replace('JOIN canonical_v4.named_topic_cards c ON (c.generation,c.scope_kind,c.scope_id,c.caption)=(m.generation,m.scope_kind,m.scope_id,m.caption)','JOIN canonical_v4.named_topic_cards c USING(generation,scope_kind,scope_id,caption)');
 assert.equal(current,body(feeds,'named_search_topics','search'));
});

test('context events use the existing bounded repair core with the original nonblocking clock and generation fence',()=>{
 const current=body(sql,'named_process_feed_event','process');assert(current.includes('outcome_:=canonical_v4.named_process_feed_core(p_generation,p_event);'));
 for(const part of ['FOR UPDATE SKIP LOCKED','p_event IS NULL OR p_event<1','generation=p_generation','SET revision=revision+1'])assert(current.includes(part));
 assert(!current.includes("kind='context'"));assert(publicSql.includes("kind='context'"));
});

test('reindexing preserves unchanged edges, and Source labels never acquire a manufactured author-caption witness',()=>{
 const index=body(sql,'named_index_root_feed','index');assert(index.includes("basis='ancestor'\n  AND (scope_kind<>"));assert(index.includes('ON CONFLICT(root_id,scope_kind,scope_id) DO NOTHING'));
 assert(index.includes("root_.scope_kind='named' AND cardinality(ids_)>0"));
 assert(index.includes('head_.label,NULL,ids_[n_]'));assert(sql.includes('REFERENCES canonical_v4.named_feed_edges(root_id,scope_kind,scope_id) ON DELETE CASCADE'));
 assert(sql.includes('REFERENCES canonical_v4.named_scope_activity(generation,scope_kind,scope_id,root_id) ON UPDATE CASCADE ON DELETE CASCADE'));
});

test('new capture/activity functions are private and every grant signature matches its declaration',()=>{
 const declarations=new Map([...sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION canonical_v4\.(named_\w+)\(([^)]*)\)\s*RETURNS/gu)]
  .map(m=>[m[1],m[2].split(',').filter(p=>p.trim()).map(p=>p.trim().split(/\s+/u).at(-1))]));
 for(const m of sql.matchAll(/canonical_v4\.(named_\w+)\(([^()]*)\)/gu)){
  const args=m[2].split(',').filter(Boolean);if(declarations.has(m[1])&&args.every(v=>['text','text[]','jsonb','integer','bigint','uuid'].includes(v)))assert.deepEqual(args,declarations.get(m[1]),m[1]);
 }
 assert(sql.includes('named_page_root_material,canonical_v4.named_scope_activity FROM PUBLIC'));assert(!sql.includes('GRANT EXECUTE'));assert(sql.includes('murmingle_crawler_submitter'));
});
