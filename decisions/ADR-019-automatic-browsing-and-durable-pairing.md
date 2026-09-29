# ADR-019: Automatic browsing and durable local pairing

Date: 2026-09-29.
Status: **Proposed exact owner package; awaiting explicit privacy/security approval.**
No runtime, permission, credential, owner-data or matching-policy change yet.

## Request and current behavior

The owner requests implementation of the viewpoint-independent matching direction,
automatic vectorization on visits without repeated buttons, and a connection token
remembered across sessions. Existing ADR-018 matching already runs with the popup
closed on each enabled site; the remaining consent is per new site, not per page.
ADR-016 pairing is deliberately session-only and the backend generates a new
capability each process. Browser-only persistence would not survive backend restart.

The owner has requested these outcomes. The following concrete expansion still
requires their explicit approval under the standing security/privacy gates.
Do not infer a private-page, remote-service, publication or spending approval.

## A. Bounded matching-quality implementation

1. Prefer an eligible article within a main region over unrelated main-region
   chrome/teasers. Preserve excluded ancestors/subtrees, main-only fallback,
   document/focus fences and current traversal/time/text/token bounds. Evaluate
   the already collected bounded title plus article-leading context without
   increasing the total embedding input or collecting new metadata fields.
2. Use the already packaged model on a small, frozen project-created fixture set:
   opposite framings of one event, contested figures, later commentary on that
   event, and closely worded reports of different events. No real corpus purchase,
   third-party acquisition, model download, provider or repeat of the 6/6 review.
3. Separate candidate ranking from automatic Topic identity. Improve relevant
   suggestions within the current URL/title/one-vector contract; use measured
   positive/hard-negative evidence before proposing a revised automatic rule.
   Topic count alone must not drive the cutoff. E5 is not a reliable event/stance
   extractor; cleaner input and top-k retrieval do not complete an event verifier.
   If a further model or richer server input is needed, stop with that exact design
   and approval request rather than claim an unimplemented verification stage.
4. Version changed sampling/model-input policy. Accept old persisted records,
   keep old links/comments valid and replace only a page's current vector on an
   ordinarily authorized revisit. Never compare incompatible input versions.
   No bulk recapture, automatic existing-discussion merge, post move, manual-link
   override or database reset. Existing split links still need explicit correction.

## B. One-time setup, then automatic browsing

- Offer **Automatic matching on eligible HTTPS sites** as the recommended setup
  choice. After a clear in-app disclosure and one user gesture, request the already
  declared optional `https://*/*` host grant. Thereafter no per-page or per-domain
  button is required. Before setup completes, capture remains off. Existing
  selected-site preferences are not silently converted to global consent.
- Process only the current active tab in the focused normal window, including
  when the popup is closed; resume the chosen mode across browser sessions.
  No inactive-tab scan, history crawl, incognito, file/internal/intranet access,
  access-control bypass, remote fetch or new external endpoint.
- Keep existing URL/DOM exclusions and public article/product operating scope.
  **These checks cannot reliably detect authenticated or private pages.** Broad
  grants can therefore cause accidental processing of confidential content in a
  mixed-use profile. This owner-local experiment requires a dedicated non-sensitive
  browser profile; private inboxes, banking, health/account/confidential contexts
  remain out of scope. The UI must state this limitation, not promise detection.
- Raw sampled text remains transient in the extension. The same URL, short title,
  one 384D vector and versions go only to the paired `127.0.0.1:4174` service and
  remain until manual deletion. Automatic mode expands which sites may create
  retained Sources; no separate navigation timeline is added. Existing bounded
  catalog/state limits remain and must fail visibly, without silent eviction.
- Keep a prominent Pause and **Never process this site** control. Persist the
  global mode and blocked-origin list locally without sync. A site block must
  override the broad Chrome grant at every authorization check: removing an
  individual Chrome grant cannot negate a retained wildcard grant. Pause/block/
  revocation wins against pending work and concurrent enable operations.

## C. Persistent, revocable local pairing

- One fresh pairing after upgrade; no idle expiry or automatic logout on browser
  or service restart. The owner still starts the service manually; this package
  does not install OS auto-start, a background service, native messaging or accounts.
- Generate a random 256-bit bearer in an explicit local interactive initialization
  or rotation step. Show it once in that terminal, never agent/chat/log output,
  URLs, command arguments, environment variables or committed files.
- Store the bearer in versioned `chrome.storage.local`, restricted to
  `TRUSTED_CONTEXTS` before access, never sync. Retain until Forget, current-key
  rejection, extension/profile deletion or explicit replacement. Keep it out of
  page-reader/offscreen/status messages. A trusted background owner serializes
  changes; a late failure for an old credential must not erase a newly paired one.
- Store only a bounded versioned verifier record at the fixed ignored path
  `apps/local-service/data/pairing.json`, bound to the exact extension Origin.
  Use a domain-separated SHA-256 verifier and constant-time digest comparison.
  Preserve bearer/Host/Origin checks on every endpoint and fixed loopback access.
  No unauthenticated recovery/admin endpoint or cookie authentication.
- Restart loads the verifier without revealing/regenerating a token. Explicit
  local rotation invalidates old copies; revoke persists a revoked state. Enforce
  stopped-service/concurrent-start exclusion for administrative changes. Validate
  bounded atomic writes; missing/corrupt/unknown/revoked files fail closed with
  explicit initialization/recovery, never silently recreate credentials.
- Browser **Forget connection** cancels capture/requests and removes this browser's
  key, but does not revoke stolen copies or erase discussion data. Backend rotation/
  revocation invalidates copies. Data reset/learned-data deletion preserves pairing.
  Backend outages keep the saved key; confirmed rejection clears only the key used
  by that request. Do not automatically retry ambiguous mutations.
- Do not silently promote the old per-process session token. Require one new
  durable pairing, clear the legacy value and preserve page preferences, permissions,
  vectors, Topics and comments. An extension-Origin change requires explicit rotation.
- **Persistent storage is not an OS keychain or an encryption-at-rest promise.**
  Someone controlling the browser profile/local account may obtain the bearer and
  exercise the existing paired demo read/write/reset authority. Backend verifier
  storage uses restrictive modes where supported; Windows mode bits do not prove
  private ACLs. Existing directory ACLs/local-admin limitations remain disclosed.

## Execution and verification after approval

Use bounded Sol Medium implementation slices and a separate Trust review. Start
with matching fixtures/design evidence, then compatible extraction; persistent
pairing and automatic-mode modules can proceed in parallel with distinct file
ownership. Lead integrates cross-cutting contracts, documentation and release.

Required checks include input bounds/ancestry/version compatibility; default-off
before setup and no silent global migration; active-only/Pause/block/revocation
races under wildcard grants; persistent browser and backend restart; verifier
corruption/rotation/revocation/concurrent administration; stale-401 versus new
pairing; unchanged data-reset and deletion semantics; no raw text/secret egress.
Use temporary profiles/databases, owned pages and injected test credentials.
Do not read/reset/stop the owner's backend to run tests. Ask for its manual shutdown
when full fixed-port evidence requires it. No new model or dependency acquisition.

Separate read-only Sol Medium reviews verified the present behavior and proposed
pairing/permission boundaries. They are engineering input, not owner consent or
legal/store certification. [Chrome permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)
documents gesture-based optional grants; [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
distinguishes persistent local storage from memory-only session storage and its
trusted-context access control. These capabilities do not establish store approval.

All later private-input, remote/provider, tester, deployment, spending, publication
and provenance-approved 200–250-pair gates remain. ADR-018's metadata working
assumption is unchanged and is not reopened by this proposal.
