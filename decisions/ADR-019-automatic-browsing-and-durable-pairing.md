# ADR-019: Session-scoped browsing and durable local pairing

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

Owner clarification: "we need to find a solution to grant it for a session, not
for every website". This replaces the prior persistent automatic-mode proposal
with the session-scoped proposal in B. It is not blanket approval of persistent
credentials or the exact Chrome permission/security package below.

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

## B. Start one browsing session, then automatic cross-site processing

- Offer **Start browsing session** / **Stop session**. Start requests the already
  declared optional `https://*/*` grant from a user gesture after disclosure.
  Once granted, no per-page or per-domain button is required during the session.
  Native permission alone never starts processing; subsequent Start remains an
  explicit app action even if Chrome no longer displays a permission prompt.
- Recommended session scope is the normal browser window where Start was pressed:
  follow its active tab across eligible HTTPS sites and new tabs, only while that
  window is focused (including the existing attested-popup focus path). Other
  windows are outside that session. This is narrower than the earlier profile-wide
  proposal and avoids treating Chrome background-process lifetime as user consent.
  Keep the versioned session lease/window identity only in trusted
  `chrome.storage.session`. Popup closure and ordinary service-worker suspension
  do not end it; Stop, bound-window closure, browser restart, extension reload/
  update/disable, or lost access do. Window identity must still be live and match
  before each read/inference/ingestion; never silently bind a new window. No page
  processing is authorized when a required check fails, even with remembered
  pairing/host access. Temporary loss of focus pauses work, not the lease lifetime.
  No inactive-tab scan, history crawl, incognito, file/internal/intranet access,
  access-control bypass, remote fetch or new external endpoint.
- Chrome's documented optional host grant has no session-expiry parameter;
  `activeTab` expires on cross-origin navigation, so it cannot supply this flow.
  **The session boundary is enforced by the app, not a native expiring all-sites
  permission.** Stop invalidates the lease/start ticket and cancels work before
  any best-effort permission removal. Browser permission may remain after a crash
  or failed cleanup. On restart, session storage is empty and capture remains off;
  do not claim the native grant was revoked. Surface remaining access honestly and
  offer an explicit Chrome-access removal action. Do not promise that removing a
  wildcard leaves overlapping old individual grants untouched.
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
- Keep a prominent Stop and **Never process this site** control. Persist only
  inert configuration and the blocked-origin list locally without sync, not the
  live capture lease. A site block must
  override the broad Chrome grant at every authorization check: removing an
  individual Chrome grant cannot negate a retained wildcard grant. Stop/block/
  revocation wins against pending work and concurrent starts. Reject late grant
  completion against the current start ticket; a stopped session must not revive.
  Persistent legacy `enabled:true` must not authorize capture after migration.
  Preserve old configuration, grants and data without promoting them to a lease.
- Ending capture does not delete stored Sources/comments or end backend pairing.
  Session-scoped capture and durable authentication are independent controls;
  approval of B alone does not approve C.

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
before Start and no silent lease migration; same-window active-only/Stop/block/
revocation races under wildcard grants; late native grant after Stop; popup close,
worker reconstruction, bound-window closure/reopening, browser restart/reload and
native permission retained without a lease; persistent pairing across browser and
backend restart; verifier
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
The [activeTab documentation](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
describes its cross-origin expiry. A separate read-only session design review
supports an app-owned lease; the lead recommends a bound-window session rather
than relying on asynchronous detection that all normal windows have closed.
The proposed lifecycle guarantees still require implementation and actual-browser
tests; documentation is not proof that cleanup ran on a crashed process.

All later private-input, remote/provider, tester, deployment, spending, publication
and provenance-approved 200–250-pair gates remain. ADR-018's metadata working
assumption is unchanged and is not reopened by this proposal.
