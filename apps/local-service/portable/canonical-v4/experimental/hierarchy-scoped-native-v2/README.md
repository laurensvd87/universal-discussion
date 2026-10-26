# Native scoped proof with corrected server address

ADR174 successor source is accepted by root and Trust, with119 guarded Node tests
and112 Python AST checks passing. Metadata and native execution remain separate
gates; an unminted seal still requires zero connector calls. ADR173's one failed
attempt,131 sources, freeze and output are immutable; do not rerun that version.

The actual SQL case protocol, canonical001–009 and accepted ADR165 buffers are
unchanged. This check is mechanically derived from167/173 with new174 driver,
source and isolated-cluster paths. It reuses only the unchanged pure v1
run-control library and its source-only tests. It does not execute the closed
v1 native runner or guardian.

The new cluster query uses pg_catalog.host(pg_catalog.inet_server_addr()) to
compare exactly with127.0.0.1, instead of inet::text which includes a netmask.
Other identity, role, database, port, version, startup and isolation fences stay
strict. The actual first identity refusal may retain only fixed stage/boolean
predicates; unavailable queries retain no invented comparison bits or raw values.

The original eight-client, statement/lock/barrier, private controller, physical
settlement, exact scratch-OID and no-FORCE cleanup requirements remain unchanged.
This source alone grants no native execution, public collection, inference,
model access, HBA change, crawler action or production activation.

Before preparation, root and Trust must review the whole successor and declared
mechanical deltas, run guarded tests including actual memory-only PGlite inet
semantics through the connector, and authenticate the complete source/package/
binary inventory. One metadata preparation and both actual frozen audits precede
a separate decision for ONE owned native attempt. Never modify predecessor bytes.
