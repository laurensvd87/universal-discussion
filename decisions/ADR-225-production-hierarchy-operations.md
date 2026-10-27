# ADR-225: Production hierarchy operations and dashboard aggregates

Date: 2026-10-27

Status: Source implemented and independently reviewed. Actual isolated017 SQL,
runtime package/preflight and production encrypted backup authentication pass.
Real-data restore, combined application/load checks and live cutover remain open.

The live runtime uses registered schema9, an older sealed source tree, a
standalone ingestion worker and a crawler with saved progress. The tested
hierarchy code needs a reproducible runtime package, consistent recovery and a
dashboard that notices classification changes independent of canonical writes.

Append migration017 for one protected dashboard aggregate read function. Preserve
all migration1-16 bytes and the exact legacy9/hierarchy16 profiles; add the closed
hierarchy17 profile for trusted startup, worker readiness and owner installation.
Never accept arbitrary later migrations. The aggregate grants only app execution,
keeps protected table SELECT denied, exports no vectors or bodies and grants no
classification or posting authority. Current-head classified, abstained,
excluded and pending counters partition alive learned Sources. Prepared means
an alive learned Source has any retained paired input; it is separate from
current-head readiness. Historical visible discussion roots are counted once,
using the feed's canonical destination and surviving-edge predicates.

The hierarchy dashboard reads one repeatable-read summary without loading full
state, vectors or a Ridge preview. Its refresh key joins canonical and semantic
revisions, including head, owner policy and background classification changes.
Semantic counts and configured/occupied display groups are separate from legacy
container counts. Existing strict growth history keeps its original meaning.

Promote the local runtime and backup operators into tracked `src/ops` modules.
Imports are inert; operation selection is explicit and closed. Keep old ignored
operators, seals, account stores, tokens and crawler state untouched during
preparation. The ordinary new snapshot is `data/hierarchy-runtime`, with its own
manifest. Preparation copies selected tracked source paths plus the nine fixed
encoder assets into the snapshot-relative paths expected by the loader. It
never copies owner data as source. Seal checks retain the original limits of
5000 files,512MiB source/assets,2MiB manifest and128MiB per file. Hash files in
bounded chunks. The manifest and hash-bound embedding contract retain raw bytes
in Git; downloaded weights remain ignored. File integrity checks are sampled,
not an atomic filesystem sandbox.

The API uses pools32+4 and enables hierarchy reads without creating another
worker. The standalone hierarchy worker shares pool2 and one title encoder with
paced existing-page preparation. Crawler2 reuses the original state/token flow;
dashboard2 remains an app-role reader. The permanent pool maxima sum to42.
Status and installation use owner1 individually; backup reserves one exporter
and one dump connection. No PostgreSQL max_connections or Windows settings
change is implied. Owner installation requires explicit head/policy CAS values
and an explicit grouping policy on stdin; it is never an HTTP/startup migration.

Backups retain the encrypted container and DPAPI key protection, using bounded
streams and an encrypted spool rather than plaintext files or whole-dump
buffers. Metadata, current-state fingerprints and pg_dump share one exported
repeatable-read snapshot. The import baseline digest remains explicitly a
baseline. Authenticate the archive before consuming it in restore. The restore
rehearsal accepts only a trusted fresh-owned fixture port with exact database,
OID and server identity; there is no arbitrary or live/in-place restore target.
An original operation deadline, bounded child drain and honest retirement
results apply. Preserve encrypted evidence when retirement is unconfirmed.

Before live activation, verify actual SQL aggregates and a restore of existing
data, complete combined browser/database/provider and crawler/user load checks,
and review the new seal. Drain accepted ingestion and stop old components before
installation; do not run schema9 workers against the new schema. Restart the
crawler once with the same saved progress, as already authorized. Ordinary
source may evolve while consumed run snapshots and Git history remain retained.
