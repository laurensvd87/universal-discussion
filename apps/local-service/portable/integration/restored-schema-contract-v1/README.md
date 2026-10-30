# Complete restored schema inventory and derived-queue preservation

The fixed schema17 DDL creates29 tables including schema_migrations. The earlier
28-table receipt/restore inventory omitted semantic_preparation_requests. That
queue is part of migration12 and the live17 read-only catalog, and must remain
part of the strict restored schema/owner/public-ACL checks. Migration18 adds26
tables. An independent test compares these inventories against the actual DDL,
instead of deriving fake database expectations from the same incomplete constant.

This new source component leaves all consumed original files unchanged. It keeps
every original28 receipt fingerprint and27 post-migration equality comparisons,
then adds a queue fingerprint before/after migration. Strict schema identity is
29 before and55 after; owner, ACL, manifest, runtime, policy and sequence checks
stay intact. Unknown/missing/extra tables and wrong owners still refuse.

The existing fixed17 backup has a correctly authenticated legacy28 receipt. Its
queue has no independent row fingerprint in that receipt. The new result makes
this explicit: queue equality is measured across migration from the restored
baseline, not retrospectively claimed against the old receipt. Complete29 future
receipts are supported and additionally verify original queue rows. The new proof
schema reports29 restored tables and28 preserved original tables, receipt scope,
queue equality and whether that queue is independently covered by the receipt.

No queue is deleted, reset, omitted or treated as posting authority. This is
source only: it does not open a socket, restore data, mutate a live schema, change
backup creation or activate a new proof consumer. A future complete protected
rehearsal must explicitly bind this v2 proof in its owner projector and parent
validator, preserve all original limits and tests and obtain separate review/
catalog/held-input/actual authority. Actual migration/HTTP/browser acceptance
remains unproven. Future live cutover also needs complete backup coverage.
