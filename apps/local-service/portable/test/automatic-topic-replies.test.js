// Mechanical predecessor and authority checks; no PostgreSQL execution.
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const read=async name=>(await readFile(new URL('../canonical-v4/'+name,import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const sql=await read('drafts/automatic-topic-replies.sql');
const predecessors=[['runtime_prepare_command','migrations/015-semantic-reply-witness.sql'],['runtime_lifecycle_command','migrations/016-semantic-insight-reply.sql'],['named_share_insight','drafts/automatic-author-insight.sql']];
const body=(value,name)=>value.match(new RegExp('CREATE (?:OR REPLACE )?FUNCTION canonical_v4\\.'+name+'\\([\\s\\S]*?\\n\\$'+name+'\\$;','u'))?.[0];
const predicate=`NOT EXISTS(SELECT 1 FROM canonical_v4.semantic_root_snapshots s
          JOIN canonical_v4.semantic_root_edges e ON e.root_id=s.root_id AND e.root_ordinal=s.root_ordinal
          WHERE s.root_id=v_root.id AND s.generation=p_generation AND s.root_ordinal=v_root.ordinal
            AND s.topic_id=v_topic.id AND s.discussion_id=v_discussion.id AND e.node_id=v_semantic_target->>'nodeId')`;
const named="NOT canonical_v4.named_reply_member(p_generation,v_semantic_target->>'nodeId',v_root.id,v_root.ordinal,v_topic.id,v_discussion.id)";

for(const [name,file] of predecessors)test(name+' retains its entire original body except the exact scope membership predicate',async()=>{
 const original=body(await read(file),name),current=body(sql,name);assert(original&&current);
 assert.equal(current.split(named).length,2);assert.equal(original.split(predicate).length,2);
 const inverse=current.replace(named,predicate).replace('CREATE OR REPLACE FUNCTION','CREATE FUNCTION');
 assert.equal(inverse,original.replace('CREATE OR REPLACE FUNCTION','CREATE FUNCTION'));
 assert(current.indexOf(named)>current.indexOf('SELECT * INTO v_root'));
});

test('private membership retains old exact snapshots and independently joins named scope to the protected canonical destination',()=>{
 const helper=sql.slice(0,sql.indexOf('-- Exact predecessor inverse'));
 for(const fragment of ['s.generation=p_generation','s.root_ordinal=p_ordinal','s.topic_id=p_topic','s.discussion_id=p_discussion',
  'ctx.generation=e.generation','c.ordinal=e.root_ordinal','c.root_id IS NULL','NOT c.withdrawn',"c.visibility='local-public'",'c.discussion_id=p_discussion','d.topic_id=p_topic',"p_node='subject-'||e.scope_id","p_node='page-'||e.scope_id"])
  assert(helper.includes(fragment),fragment);
 assert(!/FOR (SHARE|UPDATE|KEY SHARE)|GRANT EXECUTE|CREATE TABLE/gu.test(helper));assert(helper.includes('FROM PUBLIC'));assert(helper.includes('murmingle_crawler_submitter'));
});
