# S3 implementation and integration review

Date: 2026-09-28. Scope: ADR-016's explicitly owner-approved local-only package.
Implementation: GPT-6 Sol Medium bounded subagents. Review/integration: lead agent
with Trust/Quality lens, in the same conversation. This is engineering evidence,
not independent-human, legal, hosting or store approval.

## S3a — accepted transport slice

- Listener binds only `127.0.0.1:4174`, fails if occupied and has no import-time
  effects. CLI fixes the app DB path, validates one unpacked extension Origin,
  generates process-random pairing/IDs and reveals the token only once in the
  developer's interactive terminal. No token appeared in agent/chat output.
- Existing exact Host/bearer/optional Origin rules remain. Transport caps raw
  headers, body bytes and connection/request lifetime, rejects duplicates before
  materializing bodies and closes upgraded/tunnel connections. No remote URL,
  model, path, proxy or provider endpoint was added.
- Review caught Node's header-count truncation risk. The parser now preserves
  all raw headers within 16 KiB, then explicitly rejects more than 32. Regression
  tests cover a duplicate after the former truncation boundary.
- The separate integration guard permits only the approved endpoint. Numeric
  bind resolution is supplied directly as `127.0.0.1`, without invoking DNS.
  Default tests still use the original socket/DNS/fetch/subprocess denial guard.
- Two new reserved-domain Sources have project-created bridge provenance and
  null embeddings. They share their own confirmed Topic, not a fabricated Harbor
  similarity. Old fixtures/review ledger are unchanged. Existing stored catalogs
  are not silently migrated/reseeded; explicit reset restores the current seeds.

Evidence: 51/51 offline service tests; 2/2 actual loopback integration; secret scan
30 files, zero findings, six self-tests. The lead independently reproduced the
loopback suite. Tests exercise the live auth/CORS/Host matrix, header/body caps,
deadline, occupied port, CRUD/conflict/persistence, restart token rejection,
withdrawal and reset. All listeners were closed and temporary DBs removed.

## S3b/c — review in progress, no browser pass yet

Client/session adapters and the UI are being checked separately. Initial review
requested cancellation of invalid response streams, stale-401 isolation,
session-read race protection, lifecycle observation independent of automatic
selection, detached drafts and no further writes after ambiguous failure until
reload. Final controller/panel and real-browser evidence will be recorded here.

The installed Chrome automation pipe was probed using a hidden temporary profile
and `about:blank` only; no extension was loaded by that probe. A working browser
pipe is not yet evidence of extension pairing, permissions or discussion UX.

## Retained boundaries

Synthetic actors are a developer test device, not production authentication.
Manual demo text persists until local withdrawal/reset/removal; logical deletion
is not forensic erasure. No browser-history capture, real page payload, model,
provider, external search, other testers, spending, hosting or publication is
authorized by these tests. S3 completion returns to lead review; new boundaries
still stop for explicit owner approval.
