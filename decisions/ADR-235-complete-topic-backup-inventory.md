# ADR-235: Complete same-snapshot topic backup fingerprints

Date: 2026-10-30

Status: unactivated two-file source successor Root reviewed; no actual backup,
new restore, service redirection or live activation.

The original schema17 receipt covers28 tables while migration DDL creates29.
ADR234 preserves the fixed old archive and truthfully verifies the missing queue
from the restored baseline before/after migration. Future receipts must cover it
independently as part of the original exported snapshot.

Separate source grant81f8ed2c...08e8bd precedes two new files:
`src/ops/complete-topic-backup-operator.js` and its corresponding test. Existing
live17 and unactivated18 backup operators/tests remain unchanged and none of
their callers is redirected. Preserve the original AES-GCM/DPAPI/archive format,
authentication, fixed manifest/roles, same exported snapshot, cursor settings,
binary64 wires, bounded streaming, expiry, disk floors, timers and original
physical retirement behavior.

The fixed descriptor exposes exactly19 tables for9,29 for16/17 and55 for18.
Preparation requests are appended after the original28 entries, matching the
complete29 profile accepted by ADR234; automatic18 adds its original26 afterward.
An actual same-snapshot pg_class census precedes fingerprints and dump launch.
Missing/extra tables, incorrect owners and a substituted partition, foreign table
or materialized view refuse. Thus a future omitted relation fails independently
of a loop derived from the same incomplete constant.

Tests independently parse actual bootstrap and migration DDL at each supported
profile. All original22 encrypted backup/restore, snapshot, tampering, failure,
cleanup, deadline and disk cases remain; three new cases prove whole DDL coverage,
actual census refusals before dump and queue fingerprint receipt binding. All25
pass64MiB/374.1217ms. Fake same-snapshot tests do not establish actual backup,
restore performance, live integration or complete private-data recovery.

Before live cutover, explicitly bind this source in the reviewed runtime, run an
actual complete coverage backup and authenticated full restore/migration/UI
rehearsal, then final fresh backup. The existing old receipt is not rewritten or
retroactively labelled complete. Full semantic quality/discovery and product
activation obligations remain active.
