// Mechanical source proof only: no PostgreSQL engine or SQL execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=new URL('../canonical-v4/migrations/',import.meta.url),sha=value=>createHash('sha256').update(value).digest('hex');
const raw005=await readFile(new URL('005-ingestion-apply-and-lifecycle.sql',base));
const raw010=await readFile(new URL('010-semantic-hierarchy.sql',base));
const sql=await readFile(new URL('014-semantic-source-containers.sql',base),'utf8');
const normalized=value=>value.toString('utf8').replace(/\r\n/g,'\n');
const original=normalized(raw005).match(/CREATE FUNCTION canonical_v4\.ingest_apply\([\s\S]*?\n\$ingest_apply\$;/)[0];
const helper=sql.match(/CREATE FUNCTION canonical_v4\.semantic_apply_source_container\([\s\S]*?\n\$ingest_apply\$;/)[0];
const oldWrapper=normalized(raw010).match(/CREATE FUNCTION canonical_v4\.semantic_ingest_apply\([\s\S]*?\nEND \$\$;/)[0];
const wrapper=sql.match(/CREATE OR REPLACE FUNCTION canonical_v4\.semantic_ingest_apply\([\s\S]*?\nEND \$\$;/)[0];
// Complete closed edit list: all other validation/transaction/cleanup lines
// must mechanically recover005, including unchanged cache invalidation logic.
const edits=[
 [
  `CREATE FUNCTION canonical_v4.ingest_apply(`,
  `CREATE FUNCTION canonical_v4.semantic_apply_source_container(`
 ],
 [
  `  -- first.  Expensive transformation happened before this call; the complete
  -- exact scan and every canonical mutation remain inside this transaction.`,
  `  -- first. Expensive transformation happened before this call; every canonical
  -- mutation remains inside this transaction. Routing uses Source containers.`
 ],
 [
  `    v_policy_version := CASE WHEN identical OR link.method='manual-confirmed'
      THEN source.policy_version ELSE 'ridge1-fixed-reference-radius/v1' END;`,
  `    v_policy_version := source.policy_version;`
 ],
 [
  `    v_policy_version := 'ridge1-fixed-reference-radius/v1';`,
  `    v_policy_version := 'hierarchy-source-container/v1';`
 ],
 [
  `  IF rematch THEN
    IF p_represented_values IS NULL THEN
      topic_ids := ARRAY[]::text[];
    ELSE
      SELECT COALESCE(array_agg(topic_id ORDER BY topic_id COLLATE "C"),ARRAY[]::text[])
        INTO topic_ids
        FROM canonical_v4.ingest_ridge_scan(p_represented_values,p_parameter_sha256);
    END IF;
    IF cardinality(topic_ids)=0 THEN
      topic_ids := ARRAY[p_new_topic_id];
      new_topic := true;
    END IF;
    primary_topic_id := CASE
      WHEN link.topic_id IS NOT NULL AND link.topic_id=ANY(topic_ids) THEN link.topic_id
      ELSE topic_ids[1]
    END;`,
  `  -- New pages own distinct canonical containers; semantic paths are not IDs.
  -- Existing routes/memberships remain intact, including manual destinations.
  -- rematch below retains only its original matching-cache invalidation role.
  IF NOT job.source_witness_present THEN
    topic_ids := ARRAY[p_new_topic_id];
    new_topic := true;
    primary_topic_id := p_new_topic_id;`
 ],
 [
  `  IF rematch THEN
    DELETE FROM canonical_v4.topic_memberships AS membership
      WHERE membership.source_id=v_source_id;
    INSERT INTO canonical_v4.topic_memberships(source_id,topic_id,ordinal)
      SELECT v_source_id,topic_id,(ordinal-1)::integer
      FROM unnest(topic_ids) WITH ORDINALITY AS membership(topic_id,ordinal);
    IF job.source_witness_present THEN
      UPDATE canonical_v4.source_links AS current SET topic_id=primary_topic_id,
        payload=jsonb_build_object('sourceId',v_source_id,'topicId',primary_topic_id,
          'method',current.method)::text
        WHERE current.source_id=v_source_id;
    ELSE
      INSERT INTO canonical_v4.source_links(source_id,topic_id,ordinal,payload,method)
        VALUES(v_source_id,primary_topic_id,nextval('canonical_v4.source_link_ordinal_sequence'),
          jsonb_build_object('sourceId',v_source_id,'topicId',primary_topic_id,
            'method','learned-provisional')::text,'learned-provisional');
    END IF;
  END IF;`,
  `  IF NOT job.source_witness_present THEN
    INSERT INTO canonical_v4.topic_memberships(source_id,topic_id,ordinal)
      SELECT v_source_id,topic_id,(ordinal-1)::integer
      FROM unnest(topic_ids) WITH ORDINALITY AS membership(topic_id,ordinal);
    INSERT INTO canonical_v4.source_links(source_id,topic_id,ordinal,payload,method)
      VALUES(v_source_id,primary_topic_id,nextval('canonical_v4.source_link_ordinal_sequence'),
        jsonb_build_object('sourceId',v_source_id,'topicId',primary_topic_id,
          'method','learned-provisional')::text,'learned-provisional');
  END IF;`
 ]
];
function replaceOnce(value,from,to){assert.equal(value.split(from).length,2,'declared edit occurs exactly once');return value.replace(from,to);}

test('private container helper mechanically recovers the exact005 apply body with only six declared edits',()=>{
 assert.equal(sha(raw005),'a47b304326aec8dcb6011675a66d6a051c95f15740e8d73a5f8e3696ebcddd97');
 let inverse=helper;for(const [from,to] of [...edits].reverse())inverse=replaceOnce(inverse,to,from);assert.equal(inverse,original);
 let forward=original;for(const [from,to] of edits)forward=replaceOnce(forward,from,to);assert.equal(forward,helper);
});

test('semantic wrapper mechanically recovers010 with only CREATE OR REPLACE and the private delegate renamed',()=>{
 assert.equal(sha(raw010),'2a647b0a83bb4e9c09bbd703dc4343788a4dd57dd7f52289f5b842afaeba8355');
 const inverse=replaceOnce(replaceOnce(wrapper,'CREATE OR REPLACE FUNCTION','CREATE FUNCTION'),
  'FROM canonical_v4.semantic_apply_source_container(','FROM canonical_v4.ingest_apply(');assert.equal(inverse,oldWrapper);
});

test('complete additive envelope contains only the declared helper, replacement wrapper and private execute revocations',()=>{
 const header=`-- Unregistered Source-container routing for the semantic ingestion port only.
-- The private helper is mechanically derived from migration005 ingest_apply;
-- lease, material, mirror, lock, unpin, Source and terminal fences are preserved.
-- Existing canonical routes (including all memberships/manual links) stay intact.
-- New Sources receive distinct canonical Topic/Discussion IDs. Their original
-- Ridge reference payload is retained as data, not a container-selection claim.
-- The semantic wrapper differs from010 only by CREATE OR REPLACE and delegate.
`;
 const signature='canonical_v4.semantic_apply_source_container(text,text,text,double precision[],text,text,text,text,text,text,boolean)';
 const footer=`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;
DO $semantic_source_container_permissions$
DECLARE role_ text;
BEGIN
  FOREACH role_ IN ARRAY ARRAY['murmingle_app','murmingle_ingest_worker','murmingle_crawler_submitter','murmingle_adapter'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION ${signature} FROM %I',role_);
    END IF;
  END LOOP;
END $semantic_source_container_permissions$;
`;
 assert.equal(sql,header+helper+'\n\n'+wrapper+'\n\n'+footer);
 assert.doesNotMatch(sql,/CREATE FUNCTION canonical_v4\.ingest_apply\(|GRANT|schema_migrations|set_config\(|current_setting\(/u);
});

test('routing delta keeps represented reference data and existing routes while preserving original rematch watermark semantics',()=>{
 assert.doesNotMatch(helper,/ingest_ridge_scan|DELETE FROM canonical_v4\.topic_memberships|UPDATE canonical_v4\.source_links/u);
 assert.equal((helper.match(/IF NOT job\.source_witness_present THEN/gu)||[]).length,2);
 assert.match(helper,/v_policy_version := source\.policy_version;/u);
 assert.match(helper,/v_policy_version := 'hierarchy-source-container\/v1';/u);
 for(const literal of [
  "rematch := NOT identical AND link.method<>'manual-confirmed';",
  'matching_version=matching_version+CASE WHEN rematch THEN 1 ELSE 0 END',
  "reference_payload := CASE WHEN p_represented_values IS NULL THEN 'null'::jsonb",
  'FROM canonical_v4.topic_memberships AS membership\n      WHERE membership.source_id=v_source_id;',
  'primary_topic_id := link.topic_id;',
  'IF job.source_witness_present AND NOT identical THEN',
  'OR p_represented_values IS NOT NULL\n        AND NOT canonical_v4.ingest_valid_unit_vector(p_represented_values) THEN',
 ])assert.ok(helper.includes(literal),literal);
});
