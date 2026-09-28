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

## S3b/c — client, session and UI review

- One injected fetch adapter fixes the endpoint/port, omits cookies, rejects
  redirects, limits request/response size and deadline, validates exact DTOs and
  cancels invalid-response streams. No vector, score, revision-history or observed
  page-field DTO is accepted. Reader modules do not import the service adapter.
- Pairing uses only the single trusted-context `storage.session` token key;
  queued reads/writes prevent old reads or clears overtaking a new pairing.
  No canonical browser database, local/sync token storage or idle logout.
- Manifest 0.5.0 adds only storage and the loopback host grant. The host pattern
  itself covers ports; exact-port CSP and adapter enforce 4174. No general host
  permissions, background script, content script or new capture path.
- The popup loads on open, sends only the validated bridge Source ID and lets
  unsupported contexts choose manually. It renders human roots/replies, ownership
  edit/withdraw, repository counts and fixture-only recommendations with English
  message keys. Old bundled counts stay collapsed and visibly diagnostic.
- Review corrected stale-401/session-read races, one-shot lifecycle observer
  rearming, manual-selection precedence, automatic context reattestation on reload,
  locked in-flight drafts, preservation/detachment when creating a Topic and
  uncertain mutation outcomes. No canceled/failed write is automatically retried.
- Separate read-only Trust review reproduced two later edge cases: typing before
  initial automatic selection could attach text without a deliberate target, and
  navigation after a settled uncertain write could re-enable mutations. Corrected:
  composer/controller accept text only when ready; a persistent fresh-read latch
  blocks mutations across navigation/selection until successful explicit reload
  after the write settles. Regression checks reproduce both cases and pass.

Qualified ACCEPT: the separate read-only Trust reviewer reproduced the fixes and
passed 40 focused denial-harness checks. The lead reviewed/integrated the changes
and independently reran the complete suites and actual Chrome flow afterward.
This does not make source-tab/DOM observations atomic: lifecycle delivery remains
asynchronous. Unsent drafts remain memory-only and disappear on popup close.

## Actual browser evidence

Installed **Chrome/153.0.8010.53**, fresh temporary profile and SQLite DB, CDP over
anonymous pipes with no TCP debug listener. No Playwright/package/browser download.
The harness loads the actual unpacked extension and triggers its action on a real
browser tab; it does not substitute a standalone extension-page navigation.
Chrome classifies this action popup as CDP `other`, so target interception includes
that type before resuming scripts. The initial attachment failure was a harness
issue, not a pairing pass; the corrected complete flow passed.

Nineteen covered categories: manual pairing; keyboard; service Source ranking;
selection invalidation; Topic creation; root; reply; edit; popup reopen; disconnect;
service unavailable; restart token rejection; withdrawal; reset; automatic fixture
lookup; two Sources sharing one Topic; inert hostile markup; session-only storage;
bounded extension network. Harbor shows four candidates (two confirmed same-Topic,
two related), the explicit hand-authored-model label, then the garden empty state
without stale Harbor content. Withdrawal leaves `Deleted` and preserves replies.
Restart retains SQLite content while requiring the new token.

Zero JavaScript runtime exceptions and zero unapproved extension requests were
observed. Exactly two reserved-domain documents were intercepted and fulfilled
with project-created HTML; no real page acquisition is evidence here. Background
suppression/resolver flags and interception are not a whole-browser firewall.
The tests use synthetic injected tokens, never print a production token, and
remove only their owned profile/DB/listener. Cleanup was independently checked.
The manual CLI's one-time token display was not run through the agent logs.

This smoke does not certify MDN/head extraction, another browser/mobile, real
semantic usefulness, real accounts or store compliance. The service default and
spike restricted suites remain network-denied; no normal or restricted test
command executes this separate browser command.

## Final verification after all corrections

- Spike `npm test`: 330 total, 329 pass, one expected restricted-only skip.
- Spike `npm run test:restricted`: 330/330 pass.
- Spike `npm run indicator:test`: 148/148 pass (overlaps full suite).
- Service `npm test`: 51/51 pass under the unchanged capability-denial guard.
- Service `npm run test:integration`: 2/2 actual loopback checks pass.
- Spike `npm run test:browser`: PASS, all 19 categories above, independently
  rerun by the lead on the final code, not inherited from the pre-fix smoke.
- Secret scans: spike 113 files and service 30 files; zero findings, six
  scanner self-tests each. These are high-confidence checks, not a complete audit.
- Focused syntax, package inventory/capability boundaries and `git diff --check`
  pass. The larger file inventory was updated without weakening executable
  ambient-network restrictions; the exact injected bindings are separately checked.

## Retained boundaries

Synthetic actors are a developer test device, not production authentication.
Manual demo text persists until local withdrawal/reset/removal; logical deletion
is not forensic erasure. No browser-history capture, real page payload, model,
provider, external search, other testers, spending, hosting or publication is
authorized by these tests. S3 completion returns to lead review; new boundaries
still stop for explicit owner approval.
