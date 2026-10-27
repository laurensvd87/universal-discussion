// Mechanical source checks only. Actual17 SQL/grants/counts require native QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=(await readFile(new URL('../canonical-v4/migrations/017-semantic-dashboard-counts.sql',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const feed=(await readFile(new URL('../canonical-v4/migrations/011-semantic-discussion-feeds.sql',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const compact=text=>text.replace(/\s+/g,' ').trim();
test('017 aggregate port is stable app-only metadata, with no table grants, writes, vector fields or perSourceRPC',()=>{
 assert.match(sql,/LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog/);
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|ALTER TABLE|CREATE TABLE|FOR SHARE|FOR UPDATE|pg_advisory)\b|body_values|title_values|array_send|semantic_read_source_context/);
 assert.match(sql,/REVOKE ALL ON FUNCTION canonical_v4\.semantic_read_dashboard_counts\(text\) FROM PUBLIC/);
 for(const role of ['murmingle_ingest_worker','murmingle_crawler_submitter','murmingle_adapter'])
  assert.ok(sql.includes('FROM '+role+';'));
 assert.match(sql,/GRANT EXECUTE ON FUNCTION canonical_v4\.semantic_read_dashboard_counts\(text\) TO murmingle_app/);
 assert.doesNotMatch(sql,/GRANT SELECT/);
});
test('017 distinct historical root predicate matches011 feed visibility and destinations without current-head filtering',()=>{
 const original=feed.match(/WHERE e\.node_id=p_node_id AND ([\s\S]*?)\n      AND \(p_before_ordinal/)[1];
 const root=sql.match(/SELECT count\(DISTINCT s\.root_id\)([\s\S]*?)\n      AND EXISTS\(SELECT 1 FROM canonical_v4\.semantic_root_edges/)[1];
 assert.equal(compact(root.slice(root.indexOf('WHERE ')+6)),compact(original));
 assert.doesNotMatch(root,/head_|matcher_hash/);assert.match(sql,/e\.root_id=s\.root_id AND e\.root_ordinal=s\.root_ordinal/);
});
test('017 scopes current states and historical preparations by generation, rejects invalid observations and bounds output',()=>{
 for(const literal of ['o.source_version=s.write_version','o.matcher_hash=head_','prepared.source_id=s.id',
  'receipt_digest IS DISTINCT FROM operation_digest','invalid_<>0',
  'cardinality(supported_path)>8','jsonb_array_length(paths_)>512','LIMIT 513','octet_length(result_::text)>524288',
  "'currentHeadClassifiedSources'","'currentHeadAbstainedSources'","'currentHeadExcludedSources'","'currentHeadPendingSources'"])
  assert.ok(sql.includes(literal),literal);
 assert.match(sql,/EXISTS\(SELECT 1 FROM canonical_v4\.semantic_inputs prepared WHERE prepared\.source_id=s\.id\)/);
 // Source payload embeds the384D array. Counters use protected version/op/receipt
 // metadata rather than decoding every page's vector on each dashboard refresh.
 const aggregate=sql.slice(sql.indexOf('WITH learned'),sql.indexOf('-- Same historical'));
 assert.doesNotMatch(aggregate,/payload|values_double|body_values|title_values/u);
 assert.equal((sql.match(/supported_path COLLATE "C"/gu)||[]).length,2);
});
