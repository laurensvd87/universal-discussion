# ADR-236: Investigate fresh-cluster LZ4 TOAST compression

Date: 2026-10-30

Status: source design only; no successor files/catalog or actual decision yet.

The complete v3 archive process reaches restore-retired, then the combined test
hits300.1875 Job CPU seconds before the upgrade checkpoint. Exact consuming
phase/table is not retained, so do not attribute the limit solely to fingerprint
queries, decompression, PostgreSQL or any one process. Selected64-row live prefix
hash timings establish measurable verification cost, not full-table predictions.

The current fresh-cluster source retains PostgreSQL's default TOAST compression.
[PostgreSQL17 documentation](https://www.postgresql.org/docs/17/runtime-config-client.html#GUC-DEFAULT-TOAST-COMPRESSION)
describes pglz as the default and lz4 when compiled in. This is separate from the
zstd custom-archive codec and from NTFS compression. The installed runtime contains
liblz4.dll; pg_config --configure returns empty on this Windows build and is not
feature proof. Fixed live17 READ ONLY metadata explicitly confirms supported
enum[pglz,lz4], currentpglz and186 column attributes with default compression.
Eight-row samples from three fixed columns report uncompressed values; do not
generalize them to the whole database or prior restored copy. The query rolls
back/closes and changes no live setting.

Official17 [pg_dump source](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/bin/pg_dump/pg_dump.c)
emits explicit SET COMPRESSION only for column p/l overrides. Default attributes
have no such explicit override. This supports testing the fresh server default;
the historical archive's complete emitted DDL has not independently been read.

The hypothesis is that faster compression attempts/decompression can free CPU
budget for unchanged full-data checks. No measured speedup is claimed. LZ4 may
use more space, so retain the original6GiB logical/4GiB allocated bounds, C/D/
memory floors, Job1GiB/32,Node64MiB,8clients,300CPU and all original epochs.
No budget ladder, unsafe durability, skipped row comparison or partial dataset.

Review a NEW fixed root/source namespace copied from immutable v3. Change only
the fresh bulk server's default_toast_compression=lz4, verify the actual bootstrap
SQL reports it together with all previous durability/WAL settings, retain that
finite lifecycle witness and add missing/wrong-setting refusal tests. Ordinary
synthetic mode and the running server remain unchanged. Preserve complete29/55
inventory, original28 receipt+queuepre/post, all role/sequence/state checks,
original18 HTTP and genuine Chrome proof. After complete source review/tests,
new whole catalog/inputs/headroom, archival and separate ONE decision, actual
evidence must decide fit and correctness. Do not rerun/adopt consumed v3.
