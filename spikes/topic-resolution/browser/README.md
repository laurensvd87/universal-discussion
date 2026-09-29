# Local related-page, discussion-preview and metadata proof of concept

## On-device background matching (0.6.4)

The owner approved ADR-018's local-only package. Background matching defaults
off. Page text is sampled and embedded inside the extension; only URL, short
title, vector and versions go to the paired backend on this PC. It never sends
raw page text to a server/provider. URL/title/vectors remain sensitive and the
local SQLite database is not encrypted. No web search or crawler is included.

### Try the new browsing flow

1. From `spikes/topic-resolution`, run `npm run embedding:package`. It copies only
   already-acquired, pinned assets into ignored `browser/embedding/.assets/`;
   there is no download. On this owner's checkout these assets are already
   available. A fresh checkout without them stops; do not install/download a
   replacement automatically. The unpacked model/runtime payload is about 150 MB.
2. Reload `browser/` at `chrome://extensions` (Chrome 116+), then start the local
   service with your extension Origin as described in the service README. Pair
   using the terminal token. A service/browser restart requires a new pairing.
3. Use a dedicated non-sensitive browser profile. Visit an eligible public HTTPS
   article/product page. Open the popup, review its displayed site and disclosure,
   tick the consent checkbox and select **Enable matching for displayed site**.
   Accept Chrome's site-access prompt. Do not enable mail, banking, health/account
   dashboards or confidential sites. This uses one generic reader, not per-site
   integrations; missing structure or rights restrictions can make a page unsupported.
4. Browse normally on enabled sites, even with the popup closed. Only the active
   tab in the focused window is processed. Enable each additional site once.
   Reopen the popup: it shows processing, then selects the experimental Topic
   when ready. First model startup takes longer; it is not an instant lookup.
5. Visit two pages about the same specific topic and an unrelated page. Add a
   deliberate non-sensitive comment. If both similar pages resolve to the same
   Topic, that comment appears on both. Similar subject matter alone need not
   mean the same Topic; this is a fallible local heuristic, not validated accuracy.
6. Use **Wrong topic or retained page controls** to confirm another Topic or
   create a separate one. Existing comments stay in their original discussion.
   Navigation/re-resolution detaches unsent text; attach it explicitly after
   checking its destination. Unsent text disappears when the popup closes.
7. Test Pause/Resume and site removal. Pause stops new processing but retains data.
   **Forget retained page** removes its vector/link and preserves shared comments.
   Confirmed **Delete learned topic** / **Clear learned data** remove the described
   learned discussions and comments too. Processing pauses before those actions;
   resume explicitly. Revisiting afterward may recreate a page. Deletion is
   logical, not a promise about SQLite/OS forensic remnants or backups.

The reader samples at most 4,096 characters from rendered article/main content,
excludes forms/editables/navigation/comments/hidden regions and never falls back
to the whole document. E5 uses a versioned prefix of at most 512 tokens. This is
limited coverage, not full-page analysis. The exclusions are structural checks,
not reliable authentication/private-data/paywall detection or a website-rights
grant. Only process pages you may lawfully process.

The manifest adds an offscreen worker and optional HTTPS host grants. Requests
remain fixed loopback API or packaged extension assets, with no remote script or
model fetch. The extra CSP permission is WASM-only, not JavaScript `unsafe-eval`.
Site preferences persist in trusted local extension storage; the token is still
session-only, and raw text/vectors are not stored in extension storage.

### If the matching controls are disabled

Open the extension from its toolbar icon on a fully loaded public HTTPS article,
not from `chrome://extensions` or a tab containing `popup.html`. Read the context
message near **Enable matching for displayed site**. Version 0.6.1 distinguishes
unfocused/unsupported windows, loading or unavailable tabs, missing URL access,
incognito/unsupported URLs and worker failure. A checked retention checkbox alone
cannot enable an ineligible site. Keep the article's normal Chrome window focused;
close detached DevTools if the message reports lost focus, then reopen the popup.
Version 0.6.2 also accepts a freshly authenticated, visible and focused action
popup associated with that normal window if Chrome reports its parent unfocused.
Closing or blurring the popup invalidates that witness; an old last-focused
window alone never permits capture. Keep Chrome's **Developer mode** enabled
for the unpacked extension: that switch is unrelated to the DevTools window.
Before the first enabled site, disabled Pause/Resume/Retry controls are expected.
Disabled controls no longer use a loading cursor unless an action is pending.

Version 0.6.3 separates window/tab API failures, missing window, changed tab/window
and expired/changed popup focus. The former "Chrome could not identify the
current browser window" message also covered a loading page or expiring focus
proof; it did not establish a window failure. Loading guidance now reflects the
existing automatic retry. No deadline or capture rule was relaxed. Those
synthetic diagnostics did not establish the owner's exact failing condition;
the latest owner follow-up and instructions are below.

The owner now confirms Enable is clickable, but the unsupported status persists.
Version 0.6.4 fixes a reproduced stale foreground-failure state: if a fresh popup
status sees the previously enabled site again, the normal matching checks restart
once; ongoing polling does not keep resetting that timer. This is not a bypass of
consent, permissions, pairing or page eligibility. Genuine reader rejections do
not automatically retry. They now show specific English guidance and a bounded
code, for example `[missing-region]`, `[rights-restricted]` or `[capture-budget]`.
The restriction code describes the prototype's metadata check, not a legal ruling;
the capture-budget code can also mean a guarded extraction failure. The reader
and its rights/region/resource limits are unchanged. After reloading to 0.6.4,
reopen on the enabled article and, if still unsupported, report the message/code.
Do not repeat the checkbox/Enable sequence as a presumed fix.

Pairing and page eligibility are separate. **Choose a topic** means the local
catalog has loaded, and clearing the token input after Connect is intentional.
Never share that token or paste extension storage into a bug report. If the page
is still ineligible, report only the displayed context message and public domain.
No raw article content is needed to diagnose the Enable control.

From `spikes/topic-resolution`, separate real-Chrome checks are:

```sh
npm run test:browser:eligibility
npm run test:browser:embedding
npm run test:browser:matching
```

They use a fresh temporary browser profile, installed Chrome, project-created
intercepted documents and temporary SQLite state; no real site acquisition or
existing profile. Port 4174 must be free for the full matching check. Do not
repeat the finished owner 6/6 review or the older metadata manual checklist.
The eligibility check needs no service, pairing, model execution or free port:
it exercises the HTTPS action popup before an optional site grant. It does not
automate Chrome's permission confirmation or validate any real site's content.
Its popup-focus regression explicitly simulates a false parent-window focus
flag in headless Chrome; this does not reproduce the owner's OS focus behavior.
It also injects loading, pending-navigation, unavailable-URL and rejected-tab-query
results, verifying precise rejection guidance and recovery after each restoration.
An additional test seeds then removes synthetic site preferences only in its
disposable profile. A failed foreground query recovers without a new browser
event, but the real absent host grant still stops the flow before any capture,
pairing request or model load. No owner preferences or backend state are touched.
Actual current test evidence is in [STATUS](../../../plans/STATUS.md); the paragraphs below retain
the earlier feature-specific evidence, not current global capability limits.

## Historical local service discussion loop (0.5.0)

The approved S3 package adds session pairing and a service-owned discussion UI.
Start the local service using `apps/local-service/README.md`, configure the exact
unpacked-extension Origin, reload this unpacked `browser/` package and copy the
startup token into **Session pairing token**. The password field clears on submit;
only trusted extension `storage.session` retains the token. Restarting the browser
or service requires pairing again. Do not paste a token into chat or logs.

A paired popup loads the service catalog automatically. Only the existing validated
example.com/example.org mappings can auto-select their bridged synthetic service
Sources; observed URL/title/head/body fields never enter service requests. Other
tabs offer manual Topic or synthetic Source selection. Selecting a known Harbor
Source obtains service-ranked recommendations; unlinked Sources do not imply a
Topic. The catalog uses hand-authored vectors, with no real inference or search.

Select a synthetic actor, create/select a Topic and submit deliberate demo roots,
replies or own edits/withdrawals. These are local developer identities, not real
accounts. Contribution counts come from visible service data. Text persists in
the app-owned ignored SQLite database until withdrawal or explicit reset; reset
requires typing `RESET DEMO STATE`. Logical deletion is not forensic erasure.
Unsent contribution drafts remain in popup memory and disappear when it closes.
Do not enter secrets or private page material.

Topic/actor/source changes or source-tab update/removal/replacement detach unsent
text and cancel stale loads. Review the new selection and explicitly attach the
text before submitting. A failed write is never retried automatically: reload
service state first because the write may already have succeeded. A 401 clears
pairing and projections. Offline failure disables writes without a browser DB.

The manifest adds only `storage` and `http://127.0.0.1/*` host permission to the
existing `activeTab`/`scripting` set. CSP and the audited client restrict requests
to `http://127.0.0.1:4174`. The host grant itself cannot restrict ports. There is
no background/content script, captured-data transfer, provider, model download,
general host permission or external search. Metadata remains manual and unchanged.
The old 1-human/1-agent and related-page fixture panels are visibly diagnostic.

Controller/service-domain and inert-rendering checks pass under the restricted
network denial harness. The explicitly invoked real loopback suite and installed
Chrome 153.0.8010.53 smoke also pass after lead review of permissions/transport.
From `spikes/topic-resolution`, run `npm run test:browser` with port 4174 free.
The default path is the installed Windows Chrome path; optionally append
`-- "C:\path\to\chrome.exe"`. No download or package installation is required.
It uses pipe debugging (no debug TCP port), a fresh temporary profile/database,
synthetic test pairing and actual extension action popups. The reserved-domain
documents are fulfilled with project-created HTML before any website request.
All test-owned browser/profile/database/listener resources are closed/removed.

The smoke covers pairing, keyboard activation, Source ranking/clearing, Topic
create, root/reply/edit, popup reopen, disconnect, unavailable service, changed
restart token, withdrawal with surviving replies, reset, fixture auto-load/shared
Topic, inert markup, session-only storage and bounded extension requests. No
JavaScript exceptions or unapproved extension requests were observed. Browser
background suppression and interception are not a whole-browser firewall claim.
See [the S3 review](../../../research/S3_IMPLEMENTATION_REVIEW_2026-09-28.md).
The earlier 0.2–0.4 evidence and procedures below are historical.

Status: the exact local P1.5b URL slice passes automated checks, Trust/Quality
engineering review, and the owner-run Chromium smoke. The exact P1.5c bounded
metadata slice is implemented and automated checks pass; its separate AI
Trust/Security and Quality engineering review and owner-run Chromium smoke also
pass. Both exact local-processing slices are complete; the broader P1.5
browser-observation and content-extraction gate remains open.

2026-09-28 correction: the original checks missed a same-URL reload after
document attestation. The current package adds source-tab lifecycle invalidation
and passing regressions. The new event wiring has not received a fresh real-
browser smoke; earlier completed owner checks are historical evidence.

Extension 0.4.0 also adds an isolated related-page demo (ADR-015). Automated
ranker, rendering, package and restricted-I/O tests pass; separate AI Trust/Quality
review accepts this offline scope. This panel has not had a real-browser smoke.
That isolated panel does not implement a real embedding model, live search or
discussion posting; the new service discussion panel above is separate.

## Try the related-page demo

Reload the unpacked `browser/` extension and open its popup. No fixture server,
page capture or DevTools breakpoint is needed for this panel.

1. Expand **Offline fixture diagnostics**. In **Related pages · demo**,
   select **Harbor S2 sensor: product overview**.
   Expect four recommendations: two already associated with the same demo Topic,
   plus the S3 successor and a monitoring guide as related reading only.
2. Select **Starting seedlings in a community garden**. Expect an empty result
   with a small-catalog explanation and no stale Harbor recommendations.
3. Use Tab and arrow keys to change the selector. Check visible focus and status.
   URLs are example text, not links. No page opens and nothing is saved.

The six Sources and their vectors are hand-authored synthetic fixtures. The
ranker really computes cosine similarity over compatible vectors but does not
generate embeddings or infer confirmed Topics. The source selector is separate
from the active tab and never receives captured metadata. Showing zero posts
illustrates source-discovery utility; it does not establish real usefulness.
These optional checks are not a repeat of the owner's completed 6/6 review or
earlier URL/metadata checklist.

## What it demonstrates

Alongside the new fixture-only recommendations, the Chromium action popup
preserves its three existing separate local paths:

```text
explicit current-tab click
  -> read active/current-window tab ID + URL only
  -> exact queryless allowlist policy
  -> bundled exact-normalized-URL Source lookup
  -> strict Source receipt and Source -> Topic mapping validation
  -> read active/current-window tab again
  -> require the same tab ID + normalized URL
  -> text-only resolved / unsupported / unavailable view

explicit bundled-scenario choice
  -> in-memory synthetic fixture lookup
  -> strict response validation
  -> latest-activation controller
  -> text-only resolved / unmapped / unsupported / unavailable view

explicit bounded-metadata click
  -> fresh active/current-window tab ID + URL
  -> exact two-route and dated policy gate
  -> observe only source-tab lifecycle IDs while the popup lives
  -> isolated-world packaged function in top frame 0
  -> bounded direct-head candidates only
  -> strict immutable metadata envelope, with no semantic decision
  -> same-document-ID attestation + fresh final tab read
  -> text-only resolved / unsupported / unavailable metadata view
  -> clear pending/resolved metadata on source-tab update/removal/replacement
```

The current-tab path supports only `https://example.com/` and
`https://example.org/`, after fragment removal. Every query is rejected. The
two URLs resolve to distinct synthetic Sources and one shared Topic and
Discussion. Their URL-to-Source receipt is explicitly
`exact-normalized-url`; the separate Source-to-Topic mapping remains the
pinned `exact-content-fingerprint` method. Human and agent contribution counts
remain separate and `NO AUTO` remains in force.

The earlier capture-only package requested `activeTab` and `scripting`. Its
capture adapters still have no `tabs`, history, cookie, web-request, identity,
or incognito permission. The current session/loopback additions are above. It
has no content/background script. The P1.5b path still reads only the tab ID
and URL. The separate P1.5c path can inspect at most 256 direct children of
`document.head` and return at most 32 allowlisted candidates for title,
description, canonical, publication-time, and two in-head control selectors.
It never reads body, JSON-LD, images, authors, comments, forms, selections,
hidden/accessibility text, frames, cookies, storage, authentication, or paywall
state. It makes no network request, writes no storage or log, and keeps only a
validated envelope in popup memory. Only the new audited local-service client
may use the exact-port connection; no metadata enters that client.

P1.5c supports only `http://127.0.0.1:4173/p1-5c.html` and the exact reviewed
MDN metadata-reference route. It does not implement a general auth/paywall
detector. The owner directs this PoC to assume that public head metadata is
available for local processing; that working assumption is not a legal or
store-publication conclusion.

This is local contract and document-binding evidence. It does not prove
semantic matching on real content or establish that a future generalized
extension/mobile client will satisfy store, website-terms, copyright, or
privacy rules. `publishedAtHint` is displayed as context only and is never sent
to the resolver or used for Topic matching.

Every source-tab update conservatively invalidates the displayed metadata,
including non-navigation updates. Retry if needed. Event delivery is asynchronous;
this does not prove an atomic browser snapshot or detect every same-document DOM
mutation. Listeners are released on reset, retry, terminal failure or popup exit.

## Historical P1.5b manual Chromium smoke

The owner completed this checklist on 2026-09-22 against extension version
0.2.0 at commit `4be7a3b`, before P1.5c added `scripting`. It is retained as
historical evidence, not as a permission description for the current 0.4.0
package. The reported observations, limitations, and disposition are recorded
in `../../../research/P1_5B_MANUAL_SMOKE.md`.

1. Open Chromium's extension management page and enable developer mode.
2. Choose **Load unpacked** and select the version-0.2.0 `browser` directory.
3. Inspect that historical extension's details. Confirm its only requested permission is
   `activeTab`, it is not allowed in incognito, and it has no site-access list,
   background worker, or other capability.
4. Open `https://example.com/`, click the extension action, then choose
   **Check current tab URL**. Confirm the resolved Source URL is exactly
   `https://example.com/` and a nonzero human count and agent count are shown.
5. Repeat on `https://example.org/#manual-fragment`. Confirm it resolves to a
   distinct Source but the same Topic and Discussion.
6. Repeat on `https://example.com/?manual-probe=1`, a non-allowlisted public
   page, a safe local address such as `http://127.0.0.1/` with no local service
   running, and a restricted browser page such as `chrome://extensions/`.
   Confirm each shows unsupported or unavailable and clears every prior Source,
   Topic, Discussion, mapping, freshness, and count value. Do not substitute a
   private or authenticated page that contains real data.
7. Return the source tab to `https://example.com/`; a rejected page stops before
   the required breakpoint. In popup DevTools, set a breakpoint immediately
   before the second `readActiveTab()` call in
   `core/active-tab-controller.js`. Start the supported check, navigate the
   source tab to the other supported URL while paused, and resume. Repeat by
   closing the source tab while paused. Confirm navigation produces unavailable
   with no stale resolved fields; closing the tab may close the popup, but must
   never display the stale result. Remove the breakpoint afterward.
8. Exercise a bundled resolved scenario, the hostile-title scenario, and each
   non-resolved scenario. Confirm markup-like text stays inert and no
   non-resolved state displays misleading zero counts.
9. Inspect the popup with DevTools while repeating supported, rejected, and
   repeated checks. Clear the Network panel first and confirm the interactions
   add no external request; an initial or locally reloaded bundled
   `chrome-extension://` resource such as `popup.css` is expected and is not
   egress. Confirm Console has no output or error and Application/extension
   storage remains empty. If Application is hidden, open it from the `>>`
   overflow or **More tools** menu.
10. Use only the keyboard to reach and activate the current-tab button, open
   the bundled-scenario disclosure, choose a scenario, and submit it. Confirm
   focus is visible and each state change has visible status text.

Do not perform this smoke on a signed-in, private, paywalled, or otherwise
sensitive page. Loading an unpacked extension is a local developer action, not
deployment, publication, store submission, or approval for distribution.

## P1.5c manual Chromium smoke (completed 2026-09-22)

The owner reported that every check below worked. The evidence provenance,
explicitly unreported browser version/MDN values, limitations, and exact-scope
disposition are recorded in
`../../../research/P1_5C_MANUAL_SMOKE.md`. The checklist remains as historical
procedure and for controlled-fixture reproduction. Do not repeat the public
MDN invocation without fresh explicit owner and Policy/Rights approval.

The completed run occurred only after the implementation review was recorded.
No other public site was authorized.

1. From `spikes/topic-resolution`, run `npm run serve:p1-5c` and leave the
   loopback fixture server open. It must print only
   `http://127.0.0.1:4173/p1-5c.html`.
2. Reload the unpacked extension. Inspect its details and confirm permissions
   are exactly `activeTab` and `scripting`, incognito is disabled, and there is
   no site-access list, background worker, or content script.
3. Open the printed fixture URL, open the popup, and choose **Check bounded
   metadata**. Confirm title is `Harbor Barrier Sensor Product Overview`, the
   canonical and observed URLs are the exact fixture URL, description is the
   synthetic bounded description, publication is marked context-only, and no
   body-decoy text appears.
4. Change only the fragment and repeat; it may resolve. Add any query and
   repeat; it must show unsupported and clear all prior metadata values.
5. Open exactly
   `https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta`
   in a clean signed-out profile before `2026-10-23T00:00:00.000Z`. Invoke the
   metadata action. Confirm either a bounded resolved envelope with the fixed
   MDN/Mozilla/CC attribution or a clean unsupported/unavailable result. Do not
   copy or commit the observed MDN field values.
6. On a non-allowlisted public page, `chrome://extensions/`, a nearby loopback
   URL/port/path, and either approved route with a query, confirm the action
   fails closed and all old metadata fields are blank.
7. In popup DevTools, pause immediately before the document-attestation call in
   `core/page-metadata-controller.js`; reload or navigate the source tab and
   resume. Repeat by closing it. Confirm no stale metadata renders.
8. Clear Network first, repeat local/MDN/rejected checks, and confirm no added
   external request from the extension; the page's own requests and local
   `chrome-extension://` resources are not extension egress. Confirm Console
   has no extension error/output and extension storage remains empty.
9. Use only the keyboard to activate the metadata button and confirm visible
   focus and visible status text. Stop the fixture server with Ctrl+C.

## Automated verification

The 2026-09-28 navigation correction adds mocked-browser regressions for changes
during collection/attestation/final tab lookup, already rendered metadata,
obsolete callbacks and listener cleanup. See
`../../../research/P1_5C_ENGINEERING_REVIEW.md` for the follow-up evidence.

A future controlled-fixture smoke should additionally keep the inspected popup
open after a successful metadata read, reload/close the source tab, and confirm
the values clear. Also pause before the final active-tab read, reload the same
fixture URL, resume, and check that no old resolved result survives the event.
This is a pending check, not another request to repeat the completed owner review
or the one-off real MDN exercise.

From `spikes/topic-resolution` run:

```powershell
npm run indicator:test
npm test
npm run test:restricted
npm run check:secrets
```

The focused checks pin the complete package and exact manifest/CSP; permit only
the audited `chrome.tabs` and `chrome.scripting` bindings; cover exact route and
expiry eligibility, direct-head field precedence, duplicates, bounds, hostile
structures/control text, canonical origin, supported in-head controls,
same-document attestation, navigation/reload races, timeouts, temporal non-use,
and hidden-DOM clearing; and forbid network, storage, logging, dynamic code,
unsafe HTML, content scripts, and broad permissions.

Related-source checks additionally cover model/dimension compatibility, bounded
and extreme vectors, query-preserving deduplication, deterministic ordering,
same-versus-related separation, inert rendering, language-pack fallback and
empty/error cleanup. All new runtime files are included in the package audit.

## Platform gaps

No Firefox, Android, or iOS package or compatibility result exists yet. The
browser-neutral policy and response contracts are reusable, but each client
needs a reviewed adapter, store-policy evidence, and platform security tests.
WebView DOM access is technically possible on Android and iOS, but no mobile
adapter is approved. The generalized metadata, website-terms, copyright,
publisher-signal, and store-review boundary remains a separate decision before
any such adapter or public release.

## Stop boundary

ADR-018's approved selected-site public main-content/local-vector package above
now supersedes the older diagnostic-only limits below **within that scope only**.
Its offscreen/WASM permissions, URL/title/vector retention and experimental local
provisional grouping do not require another approval. Private contexts, broader
capture, remote transfer, new assets/providers, deployment and release still do.

The diagnostic capture paths still have no general capture or persistence. ADR-014
now permits the successor R1 local discussion demo, fixture state and tests
without a per-module questionnaire. Such code must not silently weaken the old
capture/package boundary; it needs separately explicit capability tests.
ADR-015 adds the implemented fixture-only recommendation path within that local
envelope; neither its HTTP(S) data validator nor its vectors authorize live inputs.

Outside ADR-018, stop before broader real-page fields/selectors/routes, body/JSON-LD processing,
new capture permissions, captured-context retention, expanded network/telemetry,
provider/model activation, deployment, store submission or public posting.
Present the relevant exact approval package. The old metadata button remains
limited to the exact P1.5c routes. ADR-009/014 retain production/shared NO AUTO;
ADR-010/011 govern those old capture paths. Local mobile/domain work follows the active roadmap, not this
historical experiment's former blanket stop on all future implementation.
