import { performance } from 'node:perf_hooks';
import { ServiceError } from '../../src/domain/errors.js';

const TABLES = Object.freeze([['sources','id'], ['embeddings','source_id'], ['source_links','source_id'],
  ['topic_memberships','source_id'], ['operation_receipts','source_id']]);
const MAX_SOURCES = 131072;
const bad = () => { throw new ServiceError('storage-corrupt', 'Related catalog evidence unavailable'); };
const witnesses = TABLES.map(([table,key]) => `SELECT r.${key} AS source_id,'${table}'::text AS kind,
  r.tableoid::text AS rel,r.xmin::text AS xmin,r.cmin::text AS cmin,r.ctid::text AS tid
  FROM canonical_v4.${table} r JOIN eligible e ON e.id=r.${key}`).join(' UNION ALL ');

// Heap tuple versions attest that previously validated SQL rows have not
// changed. These are short-lived dependency witnesses, never logical row IDs.
// All referenced relations acquire AccessShare locks in this same statement,
// held by the caller's repeatable-read transaction until completion. No DDL,
// vectors, payloads, post bodies or credentials are returned here.
const SQL = `WITH eligible AS MATERIALIZED (
  SELECT id,ordinal FROM canonical_v4.sources WHERE provenance=$1 ORDER BY id COLLATE "C" LIMIT ${MAX_SOURCES+1}
), horizon AS MATERIALIZED (
  SELECT xmax,mod(xmax,4294967296)::bigint AS low32 FROM (
    SELECT pg_catalog.pg_snapshot_xmax(pg_catalog.pg_current_snapshot())::text::numeric AS xmax
  ) captured
), relations AS MATERIALIZED (
  SELECT string_agg(c.oid::text||':'||pg_catalog.pg_relation_filenode(c.oid)::text,',' ORDER BY c.relname COLLATE "C") AS identity,
    count(*) AS relation_count,array_agg(c.oid::text) AS relation_oids
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='canonical_v4' AND c.relkind='r' AND c.relname IN ('sources','embeddings','source_links','topic_memberships','operation_receipts')
), versions AS (${witnesses}), grouped AS (
  SELECT w.source_id,encode(sha256(convert_to(string_agg(w.kind||':'||w.rel||':'||w.xmin||':'||w.cmin||':'||w.tid,
    '|' ORDER BY w.kind COLLATE "C",w.rel,w.tid),'UTF8')),'hex') AS stamp,
    min((h.low32-w.xmin::bigint+4294967296)%4294967296)::text AS min_age,
    max((h.low32-w.xmin::bigint+4294967296)%4294967296)::text AS max_age,
    bool_and(w.rel=ANY(r.relation_oids)) AS valid_relations
    FROM versions w CROSS JOIN horizon h CROSS JOIN relations r GROUP BY w.source_id
) SELECT e.id,e.ordinal,g.stamp,g.min_age,g.max_age,g.valid_relations,h.xmax::text AS horizon,
  r.identity AS relations,r.relation_count,
  pg_catalog.pg_postmaster_start_time()::text||':'||current_database() AS server_identity
  FROM horizon h CROSS JOIN relations r LEFT JOIN eligible e ON true
    LEFT JOIN grouped g ON g.source_id=e.id ORDER BY e.id COLLATE "C"`;

export async function readRelatedCatalogEvidence(tx, generation) {
  // Keep this optional lane's one sort finite and avoid avoidable temp-file
  // spill. The existing SQL transaction deadline remains authoritative.
  await tx.query("SET LOCAL work_mem='16MB'");
  const { rows } = await tx.query(SQL, ['owner-local-page-embedding/v1']);
  if (!rows.length || rows.length > MAX_SOURCES) {
    if (rows.length > MAX_SOURCES) throw new ServiceError('capacity', 'Related catalog capacity reached');
    bad();
  }
  const first = rows[0];
  if (Number(first.relation_count)!==TABLES.length || typeof first.relations!=='string' ||
      !/^\d+:\d+(?:,\d+:\d+){4}$/u.test(first.relations) || typeof first.server_identity!=='string' ||
      first.server_identity.length>256 || typeof first.horizon!=='string' || !/^\d{1,20}$/u.test(first.horizon)) bad();
  const entries = [], ids = new Set(), ordinals = new Set();
  for (const row of rows) {
    if (row.horizon!==first.horizon || row.relations!==first.relations || row.server_identity!==first.server_identity ||
        Number(row.relation_count)!==TABLES.length) bad();
    if (row.id===null && rows.length===1) continue;
    const ordinal=Number(row.ordinal);
    if (typeof row.id!=='string' || !/^[A-Za-z0-9._:-]{1,128}$/u.test(row.id) || ids.has(row.id) ||
        !Number.isSafeInteger(ordinal) || ordinal<0 || ordinals.has(ordinal) ||
        row.valid_relations!==true || typeof row.stamp!=='string' || !/^[a-f0-9]{64}$/u.test(row.stamp) ||
        typeof row.min_age!=='string' || !/^\d{1,10}$/u.test(row.min_age) ||
        typeof row.max_age!=='string' || !/^\d{1,10}$/u.test(row.max_age)) bad();
    ids.add(row.id);ordinals.add(ordinal);
    entries.push(Object.freeze({id:row.id,ordinal,stamp:row.stamp,minAge:row.min_age,maxAge:row.max_age}));
  }
  return Object.freeze({generation,serverIdentity:first.server_identity,relations:first.relations,horizon:first.horizon,
    validatedAt:performance.now(),witnesses:Object.freeze(entries)});
}
