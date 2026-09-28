# Universal Discussion Layer

Use the repository-wide workflow in `AGENTS.md` as the shared project contract. This file is the GitHub Copilot entry point.

Before implementation, read `PROJECT_CHARTER.md`, `README.md`, `plans/STATUS.md`
and `plans/IMPLEMENTATION_HANDOFF.md`, plus the relevant active product/domain/
security decisions they reference. Phase 0 and the synthetic 6/6 owner review are
complete; do not repeat them. ADR-016 supersedes IndexedDB-first with a local
service owning catalog, embeddings/matching and discussion state. External web
search is deferred. Follow the handoff's next slice and explicit approval/model-
switch gates. Keep STATUS current and record consequential choices in `decisions/`.

Preserve these invariants: semantic topics sit between content and discussions; AI identity and provenance are explicit; private AI output never becomes public silently; browsing data and provider credentials are minimized and protected; and irreversible external actions require owner approval.

Prefer small, testable changes with focused validation. Do not invent a stack or provider before the relevant research and ADR exist.
