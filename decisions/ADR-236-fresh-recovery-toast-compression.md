# ADR-236: Investigate fresh-cluster LZ4 TOAST compression

Date: 2026-10-30

Status: new v4 source Root reviewed and readiness passes; no actual decision yet.

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

## Source and readiness evidence

Separate source grant80f8ad4c...89afb precedes34 new plain-owner-recovery-v4 files.
Exactly4 files differ beyond root/source namespace: cluster SQL/config/readback,
its tests, README and driver source-ready latch/two namespace-specific pins.
The other30 are exact namespace-only copies. All34 consumed predecessor source
pins and its catalog remain unchanged. No original API/queue/fingerprint/HTTP/
Chrome proof or budget changes. Source latches close during construction; after
review/tests only the two latches change to source-ready, not actual authority.

120 Node tests pass64MiB/474.6899ms,108 Python tests pass4.206s. Prior five settings
remain mandatory; new missing/wrong/pglz/type/accessor cases refuse, getters are
not called, actual bootstrap configuration is bound, ordinary mode omits LZ4.
Root preparer parses without errors and is namespace-only relative to v3.
These source/fake checks do not demonstrate actual PostgreSQL performance.

Root source review9198 bytes hashes
`1e7815e5c7d5df3bd545307f6e3c3133245267c62fc48f0a2bacdc98b347c6d7`.
New catalog419688 bytes hashes
`0eb4b2db5abd2b243eae54c4409974d755897356d05d256cef068f7dc6c3c1f3`,
authenticating2715 files/279896455 bytes. Whole authentication/end pins, all seven
runtime pins and all2715 predecessor pins pass. Three fixed backup/receipt/Chrome
inputs are held, authenticated and closed. Three fresh native samples meet all
original admission floors; minimum D4446392320 bytes. New root is absent.
Readiness1430 bytes hashes
`defa4f1522a93c30ee9f6cb7bc9733ff902bc8178b0347cec0717aa03d250223`.
Archive exact source, recheck live identities/ports/headroom and record ONE
separate actual decision before any fixed root setup or invocation.

## One actual LZ4 run

Source3925ba50 is committed/pushed before separate ONE decisioncf59bbf6...d33e6
and new protected root preparation. Session65294 closes exit1. Full authenticated
archive process reaches restore-retired at143504ms;123 closed diagnostic samples
observe COPY/index work. The combined upgrade checkpoint is absent. Parent
selects resource-limit/jobCpuSeconds300.203125. Last validated aggregate user/
kernel accounting is269.421875/30.78125 seconds, without process/phase attribution.
Sampled allocation peaks2702143488 bytes, logical2702063442. Compared with v3,
the observed restore section is shorter and allocation greater; two runs do not
isolate causal speedup or establish full-data fit/performance.

Owned-emergency parent retirement proves empty Job, all handles closed, both
EOFs and all end pins. No child lifecycle report/normal SQL-stop proof exists.
Do not claim complete fingerprints, migration, HTTP/browser or recovery success.
Root terminal audit5516 bytes hashes
`176a52c8398a4b8ca617815907de51cfea6e17618f0e34f9c8bda85c49bb5548`,
independently reauthenticating all2715 source/runtime pins and eight controls.
All consumed v4 source/catalog/output now immutable; no rerun/adoption/cap raise.
ADR237 investigates a measured exact-hash vector-row optimization independently.

Separate fixed scratch disposition passes20 pure refusal cases/native declaration
compile and readonly1457-entry/1428-file inventory2700662791 bytes. Root decision
5c92a172...6b746 precedes one removal after twice complete file/ACL/control and
fresh exact21424/42168/reference/listener absence checks. Retained PID-file start
1793375361 is cleanup-domain only, not SQL-start evidence. Only exact PGDATA is
removed. Preflight58fffe93...ad942/completion9a886479...13d25 are outside the run.
Independent post audit5e77c699...a8f24b verifies target absent/all8 controls
unchanged and all five original live process creation identities intact. No
original backup, service, crawler or live setting changes.
