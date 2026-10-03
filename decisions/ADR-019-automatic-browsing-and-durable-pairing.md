# ADR-019: Session-scoped browsing and durable local pairing

Date: 2026-09-29.
Status: **B explicitly approved on 2026-09-29; implemented in 0.7.0. A's bounded
matching upgrade separately explicitly approved on 2026-09-29; measured proposal
retained experiment-only after false joins. C remains pending.**
No durable credential change is authorized by A or B.

Later amendment: owner-approved [ADR-023](ADR-023-adaptive-topics-source-anchored-subthreads.md)
implements experimental adaptive grouping/source-anchored subthreads in 0.11.0.
It supersedes the historical stable-assignment/no-regrouping boundary only;
the measured input proposal remains inactive, and C is still pending.

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

The owner answered **"approved"** to the lead's explicit question about the
app-enforced window session including the underlying broad Chrome permission.
That question expressly left persistent token storage pending. This approves B
only; do not interpret it as approval of C or of a new matching/input policy in A.
Do not infer a private-page, remote-service, publication or spending approval.

## A. Bounded matching-quality implementation

The owner separately answered **"approved"** to an explicit A activation request:
prefer the actual article within current limits, embed its title plus leading
text using the already installed multilingual model, and measure revised grouping
rules on new project-created opposing-opinion and confusing-event/product examples.
URL/title/one vector/versions remain the only retained page payload; raw text
remains transient on-device. Existing Topic links/comments remain untouched.
This is not approval of a second vector, structured page facts, private inputs,
new model/provider/permission, bulk recapture or historical discussion merging.

The discussion target is the underlying issue/event/product, not agreement with
the author. Opposite answers to one question can share a Topic. Merely mentioning
the same public figure or broad subject is insufficient. Event identity concerns
the referenced occurrence, not the article publication date; later commentary
can discuss an old event. Product/evergreen discussions do not get a universal
publication-age cutoff. Disputed quantities alone must not be treated as proof
of different events. No reliable event/stance classifier is presumed to exist.

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

### Measured outcome: no automatic-matching rollout

The bounded reader/title-input proposal was implemented and passed 74 isolated
checks. A fixed 32-document synthetic experiment made 96 local inferences using
the existing packaged E5 runtime. Token-only audit establishes proposed-input
parity on those 32 samples. Positives and hard negatives overlap; no frozen
threshold supports a useful safe automatic join rule. See [full evidence and
limitations](../apps/local-service/experiments/topic-identity/RESULTS.md).

Preserve that code under `spikes/topic-resolution/experiments/topic-input`, outside
the extension. Production reader/input/policy and backend are restored exactly
to the preceding checkpoint; do not relabel changed input as legacy or accept
new experimental tags in live ingestion. This preserves existing behavior, not a
claim that the old heuristic is accurate. No historical data was accessed/changed.
Candidate retrieval plus a separately measured subject verifier was proposed in
[ADR-022](ADR-022-subject-verifier-experiment.md); the owner subsequently declines
its additional Qwen model because of size/latency. Keep it deferred and consider
lighter embedding-side options. A approval remains recorded and is not repeated;
the fallback 0.90 cutoff is under discussion, not activated by this advisory turn.

## B. Start one browsing session, then automatic cross-site processing

- Offer **Start browsing session** / **Stop session**. Start requests the already
  declared optional `https://*/*` grant from a user gesture after disclosure.
  Once granted, no per-page or per-domain button is required during the session.
  Native permission alone never starts processing; subsequent Start remains an
  explicit app action even if Chrome no longer displays a permission prompt.
- The approved session scope is the normal browser window where Start was pressed:
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
  permission.** Stop invalidates the lease/start ticket and cancels work. Ordinary
  Stop retains the native grant; a separate **Remove broad HTTPS access** action
  stops first, then removes it. This avoids asynchronous Stop cleanup revoking a
  newly started session. Browser permission may also remain after a crash or
  failed removal. On restart, session storage is empty and capture remains off;
  do not claim the native grant was revoked. Surface remaining access honestly.
  Do not promise that removing a
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
- Block-list changes first persist a stopped lease, then configuration, then may
  restore only the unchanged still-live session. Starts are gated during this
  transaction. Capacity failure stops capture and preserves the existing bounded
  list. A completed Stop requires successful stopped-lease persistence; the UI
  shows pending until confirmation. Storage failure keeps the running worker
  off and attempts session-key removal. If storage both rejects writes and cannot
  remove the old key, durable cleanup cannot be guaranteed; do not claim atomic
  cancellation across abrupt process/storage failure. Browser restart clears
  this session-only authority; native access remains independently removable.
- Ending capture does not delete stored Sources/comments or end backend pairing.
  Session-scoped capture and durable authentication are independent controls;
  approval of B alone does not approve C.

### B clarification: same-window tabs and visible session status — 0.9.1

Owner feedback says opening a new tab appears to require consent again. This is
already covered by the approved window session; **no new permission or scope is
needed**. Read-only diagnosis found no per-tab lease: tab events invalidate pending
page work but do not stop/rebind capture. However, the popup always showed a new
unchecked checkbox and Start, even when the existing window session was active.
This reproduced presentation defect does not establish what state the owner saw.

Show a separate, language-pack session status independent of page eligibility,
pairing, reader success or Topic assignment. Hide/disable consent and Start while
the same-window session is active; reject redundant programmatic Start clicks too.
When an enabled session temporarily has no eligible current context (blank/loading/
internal tab), explain that it remains active in its original window, not that the
current window was authenticated. Keep Stop available. Unknown worker state is
unavailable/checking, not an assertion that a session is off or active. Only a
confirmed stopped state or a known other eligible window exposes fresh explicit
Start; moving to another window is labeled explicitly. Do not persist or auto-check
consent, issue Start from polling, or widen authority to inactive tabs/other windows.
Extension reload still ends the session and requires one fresh Start.

New deterministic adapter tests cover a distinct tab ID, blank/loading -> eligible,
inactive-tab exclusion, switching back, closing a non-last tab, and canceling a
pending embedding when a second tab has the same URL. Actual Chrome adds real new
tab creation, navigation, switchback/forward and active non-last-tab closure;
the exact lease revision/window persists without Start. All 19 session checks pass,
with zero external requests, runtime errors, model loads or backend contact. This
is routing/UI evidence to the unpaired gate, not full vector ingestion evidence.
Existing manual reload/browser-restart/native-dialog gaps and all A/C gates remain.

Independent Trust review accepts the presentation-only correction (181 scoped
tests). Final restricted 675/675, normal 674 plus one intentional skip, indicator
487/487 and actual Chrome eligibility/reader 47/47 pass; secret scan finds zero
issues across 153 files. The separate full-service 0.9.x browser regression is
still pending owner shutdown of port 4174; do not treat unpaired routing checks as
end-to-end embedding/shared-comment evidence.

## C. Persistent, revocable local pairing

Owner approval: 2026-10-02, explicitly granted after the 0.12.11 local
insight test. This activates only the exact local package below; it does not
approve importing a ChatGPT stream item absent from the provider's final
response. That separate question was subsequently approved under ADR-028.
This local pairing package is implemented with synthetic checks and independent
Trust review; owner-browser restart behavior remains to be confirmed.

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

Use bounded Sol Medium implementation slices and a separate Trust review. For
the B-only approval, implement the session core and controls in parallel with
distinct ownership. Leave matching and pairing unchanged. Lead integrates
cross-cutting contracts, documentation and release; A/C require later decisions.

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
