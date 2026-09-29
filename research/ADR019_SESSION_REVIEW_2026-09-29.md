# ADR-019 B: window-scoped capture implementation review

Date: 2026-09-29. Extension: 0.7.0. Scope: owner-local B only.

## Approval and delivered behavior

The owner explicitly approved the lead's question about app-enforced window
sessions and the underlying broad HTTPS permission. That question expressly
excluded durable token storage. ADR-019 A/C remain pending. No new model, input
version, automatic grouping rule, payload, server endpoint or credential store.

Start requests the already-declared optional HTTPS permission, then establishes
a trusted `storage.session` lease for the exact normal foreground window under
a current revision ticket. Native permission, old local enabled preferences and
pairing alone cannot authorize capture. Each authorization fence checks the
lease/window, focused active page, site block, native access and pairing.

Stop invalidates pending work/start tickets immediately; successful completion
requires persistence of the inactive lease. Its pending UI does not claim success.
Popup closure and worker reconstruction retain a valid lease. Window closure,
native access removal, browser restart or extension lifecycle loss ends it.
Temporary focus loss does not rebind it. Stop retains native permission; Remove
broad HTTPS access stops first then removes that grant. Existing grants/data are
not reset or silently promoted during migration.

Persistent blocked origins override broad access. Changing configuration first
persists a stopped lease, then the block list, then restores only an unchanged,
valid session; concurrent Starts are gated. Raw text remains transient; the
unchanged URL/title/384D vector payload goes only to the paired local service.
Public/non-sensitive operating scope and imperfect private-page detection remain
explicit. This is engineering review, not legal/store approval.

## Separate Trust review and corrections

The Astra lead integrated bounded GPT-6 Sol Medium core/UI slices. A separate
Sol Medium Trust reviewer reproduced two defects before accepting production:

- A 101st blocked origin could overflow the DTO and disable useful UI while the
  lease remained active. Capacity failure now stops capture, preserves existing
  blocks and maintains a valid bounded status, including initialization races.
- Committing a live lease before its block list allowed reconstruction between
  writes to omit the block. The inactive-first transaction above removes this
  ordering defect; tests interrupt each stage and exercise Stop/close/revocation.

Final independent focused restricted checks: **191/191 pass**. The lead also
reviewed permission/session/UI contracts and changed Stop's pending wording.
Storage failures keep the current worker off and attempt session-key removal;
simultaneous write/removal failure cannot guarantee durable cleanup of an old
record. No claim of atomic cancellation across abrupt process/storage failure.
Closed-window tombstones currently last for the worker lifetime; future bounded
cleanup is resource hygiene, not a demonstrated capture bypass.

## Executable evidence

- Restricted spike suite after the test-only follow-up: **577/577**.
- Normal spike suite: **576 pass, one intentional guard-only skip**.
- Indicator/package suite: **389/389**.
- Unchanged service regression: **67/67**, socket-denied.
- Secret scanner: **146 files, zero findings**, six scanner self-tests.
- Chrome 154 eligibility/reader regression: **32 checks**, one owned intercepted
  document, seven exact synthetic collector captures, zero external attempts,
  runtime exceptions, inference targets or model loads. Legacy enabled preferences
  remain inert. This test does not grant optional host access or contact a service.

- Session lifecycle smoke: **14 actual Chrome 154 checks** covering Start, native
  request, second origin without new Start, popup close/reopen, block/unblock,
  other-window exclusion, bound-window closure, fresh Start, Stop retaining access,
  explicit native removal and forced worker reconstruction with retained revision.
  Three intercepted documents; zero blocked requests, runtime exceptions, model
  requests or inference targets. The lead independently reran and passed this
  smoke against the final reviewed implementation.

That separate test routes owned intercepted HTTPS documents up to the real unpaired gate;
it does not claim an embedding or ingestion pass. Test-only permission setup
uses Chrome's internal management API for the exact created management target,
then the product's real permission request. Other targets retain interception.
It does not automate native permission-dialog acceptance. No production
authorization API is mocked by the session smoke.

## Remaining gates and test gaps

Actual extension reload and browser restart are unverified by this headless
harness. Attempts to reopen the action after runtime.reload ended its Chrome
pipe/process; a same-profile restart did not restore the CDP-loaded worker/action
registration. Tests did not weaken production guards to mask those failures.
Empty-session reconstruction is unit-tested, not an actual OS restart proof.
Forced worker reconstruction does not establish natural idle suspension or crash
cleanup. Manual first native-dialog acceptance and reload/restart default-off
checks remain in the browser README.

The updated full matching harness uses two owned HTTPS origins so the second
page demonstrates automatic grouping/shared comments without another grant.
The initial invocation was blocked at listener bind. **After the owner stopped
their service, the full matching smoke passed all 15 checks twice in Chrome 154**.
Each run used six owned intercepted documents, sent ten real packaged 384D E5
vectors, and counted one canceled setup of an actually detached target. The comment
is visible on the second domain without another Start, while unrelated content
remains separate. Stop/new Start, metadata acceptance, form exclusion, service
restart/re-pairing, correction, Forget and confirmed deletion also pass.
There were zero external extension requests/runtime exceptions and no fixture
raw-text body matches in inspected API requests. Exact fixture titles, payload
fields, model/version, dimensions and normalization are asserted; this does not
prove absence of arbitrary leakage or real-web semantic accuracy.

The S3 discussion Chrome regression passes 19 covered areas (zero extension
egress/runtime exceptions); the loopback transport regression passes 2/2. Every
run uses disposable profiles/databases and closes only its own listener. No
existing service or owner database/profile was accessed or stopped by agents.
The S3 storage assertion now permits only an inactive capture record beside the
existing session-only pairing key; persistent credentials are still forbidden.

### Test-harness follow-up correction

Early full-loop attempts failed on a delayed `Runtime.enable` timeout. Sanitized
diagnostics established that the same CDP session had already detached before
setup finished. The helper now cancels only unfinished setup for that exact
detached session, prevents subsequent setup/resume, and observes late rejected
commands. Live failures and Fetch/payload assertions still fail the test. The
PASS summary reports abandoned setup attempts and checks remaining tasks/errors.
This does not relax production permissions or browser capture/egress guards.

Separate Sol Medium QA/Trust review reproduced and corrected an initial helper
edge where same-turn rejection-before-detach could be hidden by promise ordering.
Six restricted lifecycle regressions pass independently; the lead reviewed and
ran actual Chrome. Start waits for confirmed lease/access and settled UI before
popup closure; access removal waits for authoritative stopped/no-access state.
Only the harness, helper/tests and records changed; extension version stays 0.7.0.

Do not claim real-news matching quality improved. Thresholds, extractor/model
versions and existing Source/Topic links are unchanged. No model acquisition,
provider/search, private capture, remote service, tester, spending or publication
approval follows. The finished 6/6 review remains finished; later 200–250-pair
provenance-approved evaluation still needs an explicit owner gate.
