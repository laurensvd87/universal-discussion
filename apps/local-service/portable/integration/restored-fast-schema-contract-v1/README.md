# Unactivated semantic-input fingerprint successor

This new source retains the original schema contract, all28 receipt comparisons,
all27+queue post-migration comparisons, roles/ACL/state/manifests/sequences and
exact canonical JSONB-plus-binary64 hash algorithm. It reconstructs ONLY
semantic_inputs vector fields in local bounded32-row batches; every other table
keeps its original SQL SHA and128-row cursor. All rows/PK order remain checked.

Exact column names and the float8-array OIDs are checked before both snapshots
so explicit projection cannot omit a newly added/dropped/substituted column.
PostgreSQL-generated non-vector JSONB tokens remain byte-exact, including bigint
and scale; original binary array wires are appended unchanged. Output v3 records
the implementation separately. Old schema/prototype sources stay unchanged.

Every completed table comparison and the original/migrated sequences and owner
migration emit a fixed metadata checkpoint through a required awaited callback.
A new owner purpose must bind this to its existing bounded private phase writer;
the parent must require the same expanded list. No table row/hash/vector enters
these markers. A pending/failing original marker blocks progress and acceptance.

The prototype matched original SQL on192 live prefix rows and3 synthetic arrays;
selected semantic-input64-row warm timings were about14ms versus30ms, including
local hashing. This is not universal float-format equivalence, full-data fit,
migration/browser success or production latency. Full integration MUST compare
the original independent receipt hashes without fallback or contract replacement.
No service, writer, actual fixture or caller is redirected by importing this file.
