# ADR-082: Hide empty deleted branches and redundant author badges

Date: 2026-10-11.
Status: owner-requested local presentation refinement; implemented and verified
in extension 0.13.40.

## Decision

The owner requests that deleted messages disappear if they have no visible,
undeleted messages beneath them, and that author icons replace redundant
Human/AI tags. This refines ADR-034's tombstone display and ADR-076's existing
owner-local icon-only provenance choice, without changing deletion or authorship.

In User Mode, keep every visible message and the deleted ancestors needed to
connect it to the thread. Remove deleted leaves and chains ending only in deleted
messages, including wholly deleted roots. Preserve canonical message IDs and
parentage; flattened reply order is not lineage. Reply counts describe visible
messages, not hidden deleted leaves or structural placeholders. Preserve manual
branch expansion, inline drafts and the fresh-post reveal behavior.

Remove visible Human/AI type badges. Keep person/sparkle icons, operator/author
names, timestamps, source links, generated/imported distinctions in accessible
labels and tooltips, and the unverified-import qualifier. Developer Mode retains
its full diagnostic provenance and tombstones. This is the existing local
prototype presentation scope, not a legal disclosure or store-release finding.

Filtering is a client read/presentation projection, not physical deletion,
historical migration, recursive withdrawal or authority to delete other people's
replies. SQLite, API responses and human/agent identities remain unchanged. Hidden
deleted messages are not new reply/generation targets; canonical guards remain.
No provider request, permission, retention change or publication follows.

## Verification

Focused tests cover all-deleted roots/chains, deleted siblings, deleted ancestors
with visible grandchildren, unordered flattened replies, truthful visible reply
counts, context/focus/reveal preservation and icon-only accessible authors.
Disposable Chrome uses synthetic UI data only; no owner database, login or
provider request is involved. Focused renderer: 76 pass. Full extension: 1,113
pass/1 optional skip; restricted: 1,114 pass. Independent QA and actual Chrome
checks pass, including focus fallback, retained icon masks/accessibility and
previous reveal/typing/layout regressions. Root reviews the surviving-grandchild
screenshot; secret/diff checks pass. No backend restart is required. STATUS and
HANDOFF record the final checkpoint.
