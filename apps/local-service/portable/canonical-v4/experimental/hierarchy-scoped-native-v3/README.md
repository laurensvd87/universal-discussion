# Native scoped proof with distinct clear update identities

ADR175 corrects the clear-update test fixture, not database policy. Root and Trust
accept its source;122 guarded Node tests and112 Python AST checks pass. An
unminted seal still refuses before any connector call. ADR174 passed19 native cases and failed the
next fixture with P2302 because admission and update reused one operation ID.
Its frozen source and output are immutable and cannot be rerun.

The actual case now uses the existing newUpdate helper's distinct base/change
identities. Guarded tests exercise that same preparation helper, reproduce the
old collision in an invented registry, and check both update orderings, exact
Source/receipt references, bodyHash(9), unchanged enqueue/post preparation and
validation before collaborator access. The46 native cases, lifecycle ordering,
erasure/replay/absence checks and accepted SQL buffers stay unchanged.

New v3 paths and the adr175 driver use a fresh owned PostgreSQL instance on
port55433. The unchanged pure v1 controller is reused as a library only. No old
native entrypoint, stopped cluster, output or live55432 connection is used.

Complete root and Trust source acceptance, guarded tests and exact inventories
precede one metadata preparation. Both actual frozen audits must pass before a
separate ONE-native decision. No automatic retry, crawler action, HBA change,
provider call or hierarchical quality claim follows from this fixture repair.
