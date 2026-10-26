# Canonical hierarchy native PostgreSQL fixture

This experimental repository ports only the disposable database factory from
ADR220 to an owned native PostgreSQL fixture. It does not replace the canonical
SQL, enable production ingestion or grant authority to fabricated publications.

`repository.js` retains the original private fixture registration and operations.
The factory accepts no arguments and requires the private owned proof scope from
`integration/native-hierarchy-postgres-v1/context.js`. It uses the same physical
connection adapter, reports dialect `pg` and reads the unchanged neighboring
`hierarchy-native-scoped-ingestion-v2/schema.sql` and `boundary.sql` files. The
original PGlite factory and all earlier source/output remain unchanged.

`assertions.js` preserves all25 ADR220 assertion titles and bodies. Its only
orchestration changes remove top-level test registration, fix SQL enablement for
this separately gated proof and await all three outer checks through the strict
owned assertion ledger. A guarded source-inverse test authenticates the original
test-file hash and compares the complete expected transformation byte-for-byte.

These assertions cover canonical writes and signed-zero wires,143-node/depth8
topology, ancestor feeds, historical discussions and replies, owner-wide policy
CAS, explicit subtree overrides, source/principal/lease/publication fences,
attestation-only quarantine, rollback and actual mutation before late authority
expiry, erasure, family revisions and local-detail conflict/STOP. They use
fabricated semantic fixtures, not measured model quality.

Actual native SQL execution is still pending. The source checkpoint and guarded
fake tests do not establish SQL success, multi-user concurrency, role security,
hierarchical matching quality or live integration. See the integration fixture
README for fixed endpoint, ownership, cleanup and execution gates.
