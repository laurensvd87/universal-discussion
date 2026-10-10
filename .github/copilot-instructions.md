# Universal Discussion Layer

Use the repository-wide workflow in `AGENTS.md` as the shared project contract. This file is the GitHub Copilot entry point.

Current Insight approval (2026-10-10, ADR-075): an explicit generation/robot click
may immediately share its exact completed result locally, including the existing
strict stream fallback. Per-invocation intent only; existing proof, fresh Source,
Topic, account and reply-target checks remain. No background calls, retries,
automatic sharing of old/resumed jobs or remote publication. Recovered jobs stay
private. Read top STATUS/HANDOFF before historical separate-Share instructions.

Current surface (2026-10-10, 0.13.31): ADR-074's explicitly approved native Chrome
side panel replaces the action popup. Read top STATUS/HANDOFF for verification.
The unique real-document URL must join one live SIDE_PANEL context; native
browser-observed containing-window checks fence reads and writes. Do not relax
to arbitrary extension tabs, last-focused-window binding or caller-selected
window IDs. Existing capture, provider, privacy and release gates remain.

Current override (2026-10-10): extension 0.13.30 defaults to owner-approved
Ridge1 Topic matching, with Chrome-session-only Legacy E5 rollback and the
same-snapshot dashboard comparison. Read the top STATUS/HANDOFF and ADR-073
before historical instructions below. Exact pinned coefficients are ignored
local service data; existing E5 vectors suffice. Read/presentation grouping
does not migrate canonical Topic links, writes, posts or Insight authority.
The frozen safety failure remains failed, not retuned or rewritten. Broad
BODY stays inactive. Existing persistent pairing and protected provider login
are approved/implemented; do not extract bearer tokens from Chrome files.
No additional provider, private-scope, rights, deployment or release authority.

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
native HTTPS access. Legacy enabled preferences cannot start capture. A's bounded
article-first/title-plus-lead single-vector upgrade was separately explicitly
approved on 2026-09-29; see ADR-019. Measured false joins keep the input proposal
experiment-only; active reader/input remain unchanged. The owner declined
ADR-022's extra Qwen model experiment because of size/latency; defer it. Lightweight
embedding alternatives remain proposals; ADR-023 now implements experimental
0.90 sparse grouping with supported 0.94 refinement, not validated semantic identity.
C remains pending; do not implement durable pairing or extra retained vectors/facts.
The owner approved ADR-023's local source-link/migration/whole-thread regrouping
package, with clickable per-post source icons. Version 0.11.0 is implemented and
reviewed; read STATUS for tests. SQLite v2 pins legacy roots; do not guess their
historical page associations.
Do not start S4 or acquire
another model. Keep STATUS current and
record consequential choices in `decisions/`.

The owner's current workflow is Astra orchestration/review with GPT-6 Sol Medium
coding subagents where supported. Assign bounded, non-overlapping work; return
checkpoint results to the lead without asking the owner to switch models. Do
not silently substitute an unavailable model or bypass an approval boundary.

ADR-024 now records the approved owner-local ChatGPT insights PoC: explicitly
invoked public-page/source research, private preview and separately confirmed
AI-labelled local sharing. Version 0.12.0 and compact User Mode are implemented;
read STATUS for current verification and remaining owner login. No automatic
AI call/post, private-page expansion, paid fallback, persistent provider tokens,
new permissions/model, remote service or release is authorized.

Preserve these invariants: semantic topics sit between content and discussions; AI identity and provenance are explicit; private AI output never becomes public silently; browsing data and provider credentials are minimized and protected; and irreversible external actions require owner approval.

ADR-053/054 supersede the historical statement above that external web search
is deferred: explicit owner-local Get insights may use connected ChatGPT hosted
web_search for up to five selected eligible related URLs, without locally
fetching those related pages. A completed search with no accessible related
evidence may produce a private current-page-only draft. Do not infer wider
provider use, automatic publication, store clearance, or deployment approval.

Prefer small, testable changes with focused validation. Do not invent a stack or provider before the relevant research and ADR exist.
