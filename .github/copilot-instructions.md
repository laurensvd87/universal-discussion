# Universal Discussion Layer

Use the repository-wide workflow in `AGENTS.md` as the shared project contract. This file is the GitHub Copilot entry point.

Before implementation, read `PROJECT_CHARTER.md`, `README.md`, `plans/STATUS.md`
and `plans/IMPLEMENTATION_HANDOFF.md`, plus the relevant active product/domain/
security decisions they reference. Phase 0 and the synthetic 6/6 owner review are
complete; do not repeat them. ADR-016 supersedes IndexedDB-first with a local
service owning catalog, embeddings/matching and discussion state. External web
search is deferred. S1/S2 have passed Astra review with corrections. The owner
approved ADR-016's exact local S3 activation package on 2026-09-28. S3 is now
implemented with actual loopback/Chrome evidence. Do not repeat S3 or its approval.
ADR-017's approved synthetic embedding experiment is complete. The owner now
requests the real-page background matching/shared-comment loop; ADR-018 defines
its exact permissions/payload/retention/provisional-grouping package, explicitly
approved on 2026-09-29. B1–B5 are implemented and actual-Chrome tested; next is
owner feedback within that local-only scope. ADR-019 B's window-scoped session
was explicitly approved on 2026-09-29: Start once per normal browser window;
Stop/window closure/browser restart ends capture, independently of retained
native HTTPS access. Legacy enabled preferences cannot start capture. A/C remain
pending; do not implement durable pairing from B approval. Do not start S4 or acquire
another model. Keep STATUS current and
record consequential choices in `decisions/`.

The owner's current workflow is Astra orchestration/review with GPT-6 Sol Medium
coding subagents where supported. Assign bounded, non-overlapping work; return
checkpoint results to the lead without asking the owner to switch models. Do
not silently substitute an unavailable model or bypass an approval boundary.

Preserve these invariants: semantic topics sit between content and discussions; AI identity and provenance are explicit; private AI output never becomes public silently; browsing data and provider credentials are minimized and protected; and irreversible external actions require owner approval.

Prefer small, testable changes with focused validation. Do not invent a stack or provider before the relevant research and ADR exist.
