import test from 'node:test';
import assert from 'node:assert/strict';
import { readCanonicalV4MigrationManifest } from '../canonical-v4/index.js';
import { CANONICAL_V4_INGESTION_SCHEMA_VERSION } from '../canonical-v4/ingestion-repository.js';
import { CANONICAL_V4_RUNTIME_SCHEMA_VERSION } from '../canonical-v4/runtime-repository.js';
import { CANONICAL_V4_LIFECYCLE_SCHEMA_VERSION } from '../canonical-v4/lifecycle-repository.js';

test('009 only makes fresh row-lock contention fail closed and preserves every legacy replay byte', async () => {
  const manifest = await readCanonicalV4MigrationManifest();
  assert.equal(manifest.length, 9);
  for (const version of [CANONICAL_V4_INGESTION_SCHEMA_VERSION, CANONICAL_V4_RUNTIME_SCHEMA_VERSION,
    CANONICAL_V4_LIFECYCLE_SCHEMA_VERSION]) assert.equal(version, 9);
  const old = manifest[7].sql, sql = manifest[8].sql;
  assert.doesNotMatch(sql, /\b(?:CREATE\s+TABLE|ALTER\s+TABLE|DROP|GRANT)\b/u);
  const legacy = '  SELECT * INTO lane FROM canonical_v4.catalog_ingest_lane';
  const legacyBody = value => value.slice(value.indexOf(legacy), value.lastIndexOf('$ingest_enqueue_job$;'));
  assert.equal(legacyBody(sql), legacyBody(old),
    'the lane-serialized exact replay/authority/repair/erased-operation path is immutable');
  const fresh = sql.slice(0, sql.indexOf(legacy));
  assert.equal((fresh.match(/FOR SHARE NOWAIT/gu) || []).length, 3);
  assert.equal((fresh.match(/EXCEPTION WHEN lock_not_available THEN/gu) || []).length, 3);
  assert.equal((fresh.match(/Source URL already queued/gu) || []).length, 2,
    'early rejection supplements rather than replaces the late current-state check');
  assert.ok(fresh.indexOf('Source URL already queued') < fresh.indexOf('SELECT * INTO source FROM'));
  assert.doesNotMatch(fresh, /FOR SHARE;/u);
  assert.match(fresh, /runtime\.source_absence_revision>p_expected_revision/u);
  assert.match(fresh, /source_catalog\.catalog_revision>p_expected_revision/u);
  assert.match(fresh, /pg_advisory_xact_lock\(914092008,1\)/u);
  assert.match(fresh, /BEGIN\s+PERFORM pg_advisory_xact_lock/u);
  assert.match(fresh, /ELSE[\s\S]*?RAISE EXCEPTION 'Internal admission replay transition' USING ERRCODE = 'P1299';\s+END IF;\s+EXCEPTION WHEN SQLSTATE 'P1299' THEN\s+NULL;\s+END;/u);
  assert.doesNotMatch(fresh, /pg_advisory_(?:lock|unlock)\(/u);
  assert.match(fresh, /source_witness_present,source_witness_id,source_witness_version/u);
});
