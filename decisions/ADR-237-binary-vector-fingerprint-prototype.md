# ADR-237: Test cheaper vector-row fingerprints without changing their contract

Date: 2026-10-30

Status: standalone prototype and new upgrade source Root reviewed; one bounded
READ ONLY oracle comparison passes. No restored migration/live caller is
redirected. No successor actual run or CPU-cap increase is authorized here.

Both whole-archive runs hit300 Job CPU seconds after restore-retired and before
the combined upgrade checkpoint. LZ4's observed restore section is143504ms versus
212434ms in v3; these are single runs, not a controlled per-phase CPU benchmark.
No exact consuming table is retained. Warm live64-row original fingerprint samples
show meaningful cost for embedding/semantic-input rows. Investigate numeric JSONB
conversion before retrying a full archive again.

The original per-row hash is SHA256 of UTF8 canonical JSONB row text followed by
the original binary64 array_send wires; table SHA aggregates ordered row hashes
with newlines. Preserve that exact algorithm, every original28 receipt comparison
and all27+queue post-migration comparisons. Never substitute a smaller key image,
new backup hash or archive-only authenticity for the existing row comparisons.

Build a separate pure prototype for only embeddings/fixed_references/
semantic_inputs. PostgreSQL emits canonical JSONB for the fixed non-vector
columns, plus array_send binary wires. Reconstruct the missing vector entries
locally, preserving raw base JSONB numeric/string tokens and key ordering; append
the original wires unchanged. Avoid parsing bigint base values through JavaScript
Number. Handle bounded one-dimensional float8 arrays, empty/null values and
negative zero. Unknown/nonfinite/oversized shapes refuse. Do not claim JavaScript
float printing globally equivalent to PostgreSQL without proof: compare actual
row hashes against the original SQL oracle on bounded samples, including edge
cases. Any full integration still requires exact old receipt aggregate equality;
unsupported formatting must fail, without replacing the checksum contract.

[PostgreSQL17 JSON documentation](https://www.postgresql.org/docs/17/datatype-json.html)
explains JSONB numeric output expands exponent notation and preserves fractional
scale. Preserve all PostgreSQL-generated non-vector tokens verbatim. A future
integration must census the exact column names (including omitted array columns)
so an unexpected added column cannot be silently ignored by explicit projection.
Array element OID/dimensions/length/null layout and original binary bytes remain
checked. No schema, row, ownership or migration setting changes follow.

First pure tests and bounded normal-auth READ ONLY oracle comparison/performance
samples, with only numeric results persisted. No row content, vectors, hashes or
credentials in logs/reports. Keep Node64MiB and all original client/CPU/memory/
storage/time limits for any future complete actual purpose. The prototype is
diagnostic evidence, not restore success or an activated backup implementation.

## Actual bounded comparison

The prototype's five pure tests pass64MiB/20.9234ms. One fixed normal-auth READ
ONLY transaction compares192 original live row hashes (64 per fixed table) and
three synthetic arrays, including zero/signed zero, exponent forms, null/empty
and768 deterministic trigonometric values. All match. Exact column names and
float8-array OIDs are checked before reads. No private projection or row hash is
persisted or printed; only source pins/counts/timings are saved. Rollback/client
close pass, no live data/setting changes. The entire diagnostic takes under2s.

Three paired warm64-row timings include the client query and local hashing.
Semantic inputs: original30.08-30.24ms versus projected13.81-14.12ms. Embeddings:
original16.92-18.75ms versus projected15.26-15.37ms. Fixed references: original
18.71-22.14ms versus projected17.88-18.93ms. These selected prefixes are not full
table/corpus timings, per-process CPU measurements or population format proof.
Retain prototype source unchanged after this consumed diagnostic.

## New unactivated verifier source

NEW restored-fast-schema-contract-v1 copies the accepted verifier separately.
Only semantic_inputs uses the measured local path, bounded32-row cursor batches.
Every other table retains original SQL hash/128-row cursor. All28 receipt and
27+queue post-migration comparisons remain exact, including original algorithm
identity and PK order. Before both snapshots, exact projected-column names and
array OIDs are checked; hidden added/dropped/substituted columns refuse. Binary
array lower-bound changes refuse even when reconstructed JSON numbers match.
Output v3 explicitly records semantic-input-binary64-jsonb/v1 implementation.

The required awaited checkpoint callback reports60 completed table/sequence/
migration checks, with no rows/hashes/vectors in markers. A future owner purpose
must join it to the existing bounded private phase writer and expand its parent
list from13 to73, retaining all13 original stages in order. Await original writes;
a pending/failing marker cannot authorize migration or acceptance.

All19 pure tests pass64MiB/395.651ms, including original preservation/state/owner/
sequence/falsy-failure cases, both-snapshot column/type refusals, original binary
wire sensitivity,32-row batch bound and original marker promise/failure ordering.
Fake fixtures use computed hashes for orchestration and are explicitly not an
independent SQL oracle; the separate actual sample supplies that limited evidence.
No actual full archive or migration is exercised by these tests.

Root-only whole source review of all five files/43607 bytes hashes
`ad211bba65498f62e3ceb568be1909c27c24da58aeccc1c59bb8df5978a553c1`.
All five old schema component pins and both consumed prototype pins remain
unchanged. Saved actual diagnostic hashes
`f057aaa44a4287b3f109cd10d218102b7ab1819725ec3a24e24dc465f2ae1ffd`.
No new caller is activated. ADR238 separately specifies the whole-purpose wiring
and new actual gates.
