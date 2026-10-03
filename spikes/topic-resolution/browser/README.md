# Local related-page, discussion-preview and metadata proof of concept

## Current insight check (0.12.13)

The owner's first Create attempt after 0.12.12 still returned
`response-final-item-missing`. Version 0.12.13 makes the separately approved
completed assistant item sufficient without requiring an additional finalized
text event; any such event that is present must still agree. Restart the local
service and reload the unpacked extension before a new check. On one public
article, click **Create insight** once. Report only whether a private editable
draft appeared, or the fixed `response-*` code. The new `response-item-*`
codes indicate an identity, contradiction, missing-prefix or text-consistency
boundary without showing provider text. No automatic retry or sharing occurs.

## Current local setup (0.12.12)

The pairing token now persists in this browser profile after one fresh
connection. With the old service stopped, initialize durable pairing in an
interactive terminal as described in the [service README](../../../apps/local-service/README.md#durable-local-pairing-01212),
then start the updated service and reload the unpacked extension. Enter the
one-time token once. On later service/browser restarts, start the service
normally and the popup should reconnect automatically; no new token is printed.
If the saved key is rejected, ask for a new token by explicitly rotating
pairing with the service stopped. An outage does not discard the key. **Forget
connection** removes this browser's key; it does not revoke other copies or
delete discussions. Never share the token, callback URL, profile storage or
private page text.

After pairing, public-page matching still needs Chrome HTTPS access in the
separate non-sensitive profile. ChatGPT sign-in is independent. One deliberate
**Create insights** click may now produce a private editable draft from a
strictly finalized provider stream even if its terminal output omitted that
assistant item. It never shares or retries automatically. Please report only
whether the private draft appeared, or the fixed `response-*` code. Live
success is not yet verified; avoid repeated provider calls. Older sections
below describe earlier versions and their then-current session-only behavior.

## Completed response without assistant message (2026-10-02)

The owner selected model “5.5” and a deliberate Create returned
`response-no-message`. That means the final completed response contained no
assistant message; it does not identify why. The next version reports only a
fixed shape category (`response-output-empty`, `response-search-only`,
`response-reasoning-only`, `response-final-item-missing`, or
`response-stream-text-unfinalized`) without showing provider material.
In Insight settings, **Search linked pages with ChatGPT** is on by default;
turning it off for a separate deliberate test still sends the current public
page and selected related titles/URLs as context, but does not request the
provider's web-search tool. Each click is a new provider request; do not
repeat automatically. Report only the fixed result code or whether a private
draft appeared, never tokens or page/provider content.

## Completed stream without a usable answer (2026-10-02)

The owner's last deliberate Create returned `response-empty-output` after the
completed-stream check. The response content was not logged or retained, so
the cause is not yet known. Restart the backend and reload the unpacked
extension for fixed, non-content categories such as `response-no-message`,
`response-refusal` or `response-blank-text`. Make at most one deliberate Create
attempt on a public article, then report only the fixed code or whether a
private editable draft appeared. Do not send provider output, page text or
credentials. No automatic retry or sharing occurs.

## Headerless research and sign-in restart check (2026-10-02)

Restart the local service, then pair the extension using its **new** local
pairing token. On Windows, an existing ChatGPT authorization will resume if a
valid rotating refresh token was protected by this version of the service;
earlier RAM-only sign-ins cannot be recovered retroactively, so sign in once
more if prompted. After that, you can verify persistence by restarting the
service and pairing again. Do not share the local token, callback URL, page
text or account details. Disconnect removes the protected local credential
and attempts provider revocation. On non-Windows or without secure storage,
ChatGPT sign-in still ends with the process.

The owner-approved HTTP-200/no-format-header fallback accepts only a bounded,
complete SSE research response. If you choose to test it, make **one**
deliberate Create attempt on a public article and report only the fixed result
code or that a private editable draft appeared. Do not repeat on failure;
provider usage may be charged according to your account settings. No draft is
automatically shared.

## Live research response diagnosis (0.12.9)

The owner's first deliberate Create attempt returned `response-content-type`:
the local service got a 2xx response, but it was not an accepted SSE stream.
This alone does not identify the returned format or the cause. Restart the
local service, reload the unpacked extension, pair with the new local token and
sign in to ChatGPT again if prompted. Then make at most one deliberate Create
attempt on a public article. If it fails, report only the new fixed
`response-content-json`, `response-content-html`, `response-content-text`,
`response-content-missing` or `response-content-other` code. Do not share the
response body, raw headers, page text, token or account details; do not keep
retrying. The app still imports an insight only after a completed SSE response.

## ChatGPT insights (0.12.8)

User Mode shows the current Topic, discussion and a fixed **Create insights**
button/model selector. Matching starts automatically after local pairing when
Chrome's HTTPS grant already exists; AI inference still runs only when you click.
Use a separate public-only, non-sensitive browser profile: the extension cannot
reliably recognize signed-in or private pages. Stop and site-block controls remain
in Browsing session settings.

Restart the backend using your existing extension Origin and reload the unpacked
extension. Pair using the new local-service token as usual. Existing SQLite
Topics/comments are retained; no model download or new extension permission is
needed. On older builds a service restart also ends ChatGPT authorization;
the 2026-10-02 Windows follow-up can restore it after a new sign-in.

For a first test:

1. Start the local service with your extension Origin, reload the unpacked
   extension, and open a public article in the separate non-sensitive profile.
   Paste the new local-service pairing token if prompted. If Chrome HTTPS access
   is not yet granted, choose **Grant browser access** once in Browsing session
   settings. Matching then runs on eligible active pages in that window; a new
   browser session still needs a new service pairing token under the current
   session-only design. Stop prevents automatic restart until explicit Resume or
   a new browser session. A blocked site remains excluded.
2. If ChatGPT is not connected, choose **Continue with ChatGPT** and finish the
   official sign-in. Return to the public article and reopen the popup. The
   callback only confirms receipt; the popup checks actual sign-in and lists
   available models automatically. The last listed model is selected by default;
   change it in the bottom selector if desired. If the list fails, use the
   visible retry in ChatGPT setup. No model download or API key is needed.
3. In [ChatGPT usage settings](https://chatgpt.com/settings/usage), keep this app
   within your intended included-plan/paid-credit limits. The app cannot enforce
   provider billing settings. On a matched public article, click **Create
   insights** once. This reads and reattests at most 4,096 characters of that
   current page, then sends it with up to ten same-Topic/related source titles
   and URLs through the local service to OpenAI. The other pages' bodies and
   your browser cookies are not sent. Use **Insight settings** to uncheck
   related pages you do not want included. Keep the popup open during research.
4. Read and edit the private draft and citations. It is not a discussion post.
   Choose **Preview insight** and then **Share insight locally** only if you want
   to add it. Visit another stored page in the same Topic to see the shared post.
   Merely related pages in another Topic do not share its thread.

The model and Create action stay visible while the conversation scrolls; the
popup should not scroll horizontally. Create remains disabled until the current
page has a usable Topic and account/model connection. If research fails, no
partial answer is imported or retried automatically. A fixed `response-*` code
may appear beside the failure or under Developer Mode > Local diagnostics.
Report only that code. Never share a callback URL, token, account identity,
page text or raw provider response; the code identifies a boundary, not the
underlying cause. The owner's first live research failure predates these new
diagnostics, so its exact cause remains unknown.

The provider may inspect public pages on the supplied domains, including paths
other than the specific candidate links. It receives no browser cookies/login
session, so reachable-in-your-browser does not guarantee provider access. Unread
pages and provisional grouping must not be treated as verified evidence. There
is no remote crawler or background AI research. Eligible visited pages may be
ingested automatically for local matching after pairing and Chrome access.

Unshared context/drafts are memory-only and cleared on context change or popup
closure. The service briefly holds an in-flight request/result, not a page-text
archive; completed results have a two-minute fallback expiry and are purged after
retrieval/cancellation. Closing the popup cancels pending work on a best-effort
basis, not with a billing guarantee. `store:false` does not mean zero OpenAI
retention. Sign-in tokens remain in service memory, never extension storage;
the non-secret account registration remains in its ignored local data folder.

Automated validation uses synthetic provider responses and isolated Chrome, not
your account. The first owner sign-in failed identity verification; after
0.12.3, the owner reported a connected ChatGPT account. An explicit real model
request then failed at `catalog-body`, which points to reading the catalog
response, not to model eligibility. Version 0.12.6 raises only the catalog's
bounded response limit and separates body size, stream and encoding codes.
After that update, the owner reports a successful live model list. Web search,
completed inference and insight quality remain unverified. Manual
AI-assisted draft entry works without a
connected provider. No hosted/commercial/store eligibility is implied.
The connection and model list are account-specific; a listed model can still
reject web research or reach a plan usage limit. The popup reports these as
bounded status messages without importing partial output or retrying silently.
See [ADR-024](../../../decisions/ADR-024-local-ai-insights-and-chatgpt-poc.md).

## Source icons and adaptive Topics (0.11.0)

New page-linked posts have a small **↗** icon: click it (or focus it and press
Enter) to open that post's source in a new tab. Hover shows the destination;
the link sends no referrer and grants no opener access. No page is fetched until
you activate it. Replies can link a different source from their root. The composer
names the linked page; Topic-only and legacy posts have no invented origin.
These are live pages, not archived copies, and the association is local-only.

The experimental adaptive rule uses the existing one-vector E5 representation:
0.90 for sparse grouping, tightening to 0.94 only with supported subgroups, with
all-member and 0.04 competing-group guards. It uses structure, not raw page counts;
duplicates cannot supply independent split support. Tightened groups stay tight
when support is removed, limiting split/merge oscillation. Automatic changes or
manual correction move a page-anchored root and its entire reply tree together.
Reply origins never control routing. Manual Source pins override automatic grouping.
Legacy/manual Topic-only threads stay fixed. Changed page vectors pin old threads
conservatively; merely changing the display title does not.

Stop/restart the backend and reload the extension, then pair. In 0.12.8,
matching starts automatically after the native Chrome HTTPS grant; the older
manual Start instruction for 0.11.0 no longer applies.
First open migrates SQLite atomically without guessing old post origins or resetting
comments. Forget removes every post link to that Source, keeps comments and pins
its threads. Withdrawal removes the withdrawn post's link; other replies survive.
Clear learned data includes learned-source threads later moved to manual/fixture
Topics. Deleted data cannot be resurrected by regrouping.

Invented-vector and lifecycle tests verify mechanics, not general news/event or
opposing-viewpoint accuracy. No new model, capture permission or remote scope.
See [ADR-023](../../../decisions/ADR-023-adaptive-topics-source-anchored-subthreads.md)
and [STATUS](../../../plans/STATUS.md) for measured evidence and limits.

## Connection, Topic and posts at a glance (0.10.0)

| Icon | Meaning |
| --- | --- |
| Red | Disconnected, connection unverified, or last relevant service read failed |
| Gray | Last verified connection; no current page Topic |
| Green | Current page has a Topic without another learned page |
| Light blue | Another distinct learned page shares the Topic; no visible posts |
| Dark blue | Shared Topic also has a visible post or reply |

A Topic with one learned page stays green even with posts. Deleted placeholders
and drafts do not count; visible replies under a Deleted root do. Hover for a
text explanation. Color reflects fresh bounded catalog/discussion evidence and
last-observed connection, not a live server heartbeat or semantic confidence.
No permission, pairing retention, capture or backend change is introduced.
Posting/withdrawing refreshes the icon without recapturing the page. Navigation,
Stop and failed evidence clear page-specific Topic colors. The focused active
tab's base state is repainted on activation/focus/startup without scanning tabs.

Reload the unpacked extension, reconnect if its session pairing was cleared,
and Start one browsing session as usual. The full Chrome smoke passes all 20
covered areas, including five native icon colors, post withdrawal/repost and
red/gray across test-service restart/re-pairing. The legacy discussion smoke and
2/2 loopback tests also pass. Only disposable profiles/databases and owned pages
were used. See [STATUS](../../../plans/STATUS.md) for evidence limitations.

The title/article-lead matching proposal remains **experiment-only** after
synthetic tests found false joins. Active reader/input remain unchanged;
new experimental tags are not accepted by the production backend. Existing
Topics/comments are preserved. [Results](../../../apps/local-service/experiments/topic-identity/RESULTS.md)
explain the limitations. The owner declined the extra local verifier model;
0.11.0 changes grouping only under ADR-023, as described above.

## One session across tabs (0.9.1)

Start once in a normal browser window. Switching to an existing or newly opened
eligible tab in that window uses the same session; only its active page is sampled,
not every background tab. A blank/loading/internal tab temporarily cannot match,
but does not end the session. Closing one tab does not end it while the window
remains open. Other windows still require an explicit move/Start.

The popup now shows session status separately from page/connection status and
hides the unchecked consent/Start controls while that session is active. Stop
remains available. Previously those controls stayed visible and misleadingly
looked like another required approval. No lease, permission or pairing change.
After reloading/updating the extension, Start once again: reload deliberately
ends the previous session. Actual Chrome verifies new-tab/switch/close routing;
see [STATUS](../../../plans/STATUS.md) for evidence and remaining manual checks.

## Bounded article detection (0.9.0)

The reader stops scanning metadata once it has the first nonempty bounded title
and reads sibling nodes lazily. Pages with hundreds of later metadata tags or a
complete leading sample followed by thousands of unused siblings can now succeed.
The existing first eligible main/article/main-role region retains priority and
its `main-text-prefix/v1` sample. If none exists, the owner-approved ADR-021 fallback
requires a DIV/SECTION marked with both article/story/post/entry and body/content/text
tokens, multiple substantial paragraphs, low link density and mostly paragraph
text. Ambiguous independent containers are rejected; body text is never a fallback.
The heuristic may choose the wrong section. Existing exclusions still apply.

Fallback samples use `article-container-prefix/v1`; the unchanged E5 model,
tokenizer, prefix, pooling and normalization make these two explicitly allowlisted
capture policies vector-compatible. Unknown versions are rejected. No model
download, bulk recapture, data reset or Topic/comment movement occurs. Restart
the local backend as well as reloading the extension so both accept the new tag.
The sample remains at most 4,096 characters/512 tokens; raw text stays on-device.

Instead of one ambiguous `capture-budget`, diagnostics distinguish:

- `capture-time-budget`: the checked 40 ms extraction deadline was exceeded.
- `capture-node-budget`: 10,000 shared traversal/evidence/extraction work steps were exhausted.
- `capture-head-budget`: title lookup exceeded 256 head elements.
- `capture-attribute-budget`: a checked attribute exceeded 1,024 characters.
- `capture-failed`: an unexpected extraction error; no raw error detail is shown.

These failures occur before embedding, not after a search finds no matching Topic.
Wait for loading to settle and use **Retry current page** for a time failure; a
deterministic structural rejection may need a reader change or manual Topic choice.
The legacy generic code remains accepted. Previously stored data is unaffected.

The unmodified reader now succeeds 3/3 on the supplied GameStar anonymous static
snapshot: 3,796 sample characters, 8.4/6.4/4.9 ms. Actual Chrome passes 47 reader/
eligibility checks and 15 session checks. Restricted tests pass 659/659; backend
tests 69/69 at the fallback checkpoint. The subsequent 0.10.0 full-service Chrome
regression verifies a shared Topic/comment between semantic and generic layouts,
including mixed-policy SQLite restart. Static diagnostics do not reproduce the
owner's live CSS, scripts or consent state, and are not semantic-quality validation. See
[ADR-021](../../../decisions/ADR-021-bounded-article-container-fallback.md).

## User-facing discussion popup (0.8.0)

The small **User / Developer** switch is at the top; User is the default. The
selection is remembered on this device, without saving the connection token.
User mode puts the selected Topic and discussion first. A visible cue distinguishes
manual selection, provisional matching and synthetic diagnostics. Changing mode
preserves the current draft and never enables capture or sends a comment.

The top connection label reports the latest observed service state, not just a
stored credential or a continuous heartbeat. Open **Connection settings** to pair,
reconnect, refresh or disconnect. **Browsing session · Start / Stop** jumps to the
unchanged capture disclosure, consent and controls without changing the popup URL.
**Choose Topic, demo identity & data controls** contains manual selection, wrong-
Topic correction, Forget and confirmed deletion. These are available in User mode.

The current toolbar meanings are listed above; the original 0.8.0 blue icon meant
only shared Topic, without a post requirement. Related recommendations or demo
fixtures alone still do not qualify. These are provisional local associations,
not validated semantic accuracy. Chrome API/storage failures can prevent clearing
a previous icon; the cleanup marker is retained and further Topic updates stop.

Local storage adds only `discussionUiModeV1` (`user`/`developer`). Trusted session
storage may hold one inert `pageMatchingToolbarTabId` integer, allowing a restarted
worker to clear its previous per-tab icon without scanning tabs. Neither setting
grants capture, stores content or makes pairing persistent. No new permissions.

Historical 0.8.0 evidence in actual Chrome on owned synthetic pages: 17 full matching/User-mode
checks, including shared comments and successful native blue/neutral bitmap
updates; 19 Developer discussion regression areas; 15 session and 32 eligibility/
reader checks. The connected User popup was visually inspected. These tests use
temporary profiles/databases, not the owner's data, and do not validate general
matching accuracy or replace the manual first-dialog/reload/restart checks below.

## On-device background matching

The owner approved ADR-018's local-only package and ADR-019 B's window-scoped
browsing session. Capture defaults off. Text is embedded inside the extension; only URL, short
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
   using the terminal token under **Connection settings**. A service/browser restart
   requires a new pairing. The popup's Developer switch is unrelated to Chrome's
   **Developer mode**, which must remain enabled for an unpacked extension.
3. Use a dedicated non-sensitive browser profile. Visit an eligible public HTTPS
   article/product page. Open the popup, review the cross-site session disclosure,
   tick the consent checkbox and select **Start browsing session**.
   Accept Chrome's broad HTTPS-access prompt if shown. Do not browse mail,
   banking, health/account dashboards or confidential pages in this profile:
   private/authenticated pages cannot be reliably identified. This uses one generic reader, not per-site
   integrations; missing structure or resource limits can make a page unsupported.
4. Browse eligible sites in that same window, even with the popup closed. Only
   its active tab while focused is processed. No additional domain grant is
   needed. Other windows are excluded. Popup closure/worker suspension keep the
   session; Stop, closing its window, browser restart or extension reload ends it.
   Start a new session explicitly after that; stored Chrome access is not consent.
   Reopen the popup: it shows processing, then selects the experimental Topic
   when ready. First model startup takes longer; it is not an instant lookup.
5. Visit two pages about the same specific topic and an unrelated page. Add a
   deliberate non-sensitive comment. If both similar pages resolve to the same
   Topic, that comment appears on both. Similar subject matter alone need not
   mean the same Topic; this is a fallible local heuristic, not validated accuracy.
6. Use **Wrong topic or retained page controls** to confirm another Topic or
   create a separate one. Source-anchored roots and all replies follow the source;
   legacy/manual Topic-only threads remain in their original discussion.
   Navigation/re-resolution detaches unsent text; attach it explicitly after
   checking its destination. Unsent text disappears when the popup closes.
7. Test **Stop session**, a new explicit Start, and **Never process this site**.
   Blocks survive browser restart; **Allow site again** removes a block. Stop
   stops processing but retains data, pairing and Chrome's native grant. The
   separate **Remove broad HTTPS access** action stops then removes that grant
   (overlapping old individual grants can also be affected). Chrome has no native
   session-expiring all-sites grant; the app enforces the session boundary.
   **Forget retained page** removes its vector/link and preserves shared comments.
   Confirmed **Delete learned topic** / **Clear learned data** remove the described
   learned discussions and comments too. Processing stops before those actions;
   Start explicitly afterward. Revisiting may recreate a page. Deletion is
   logical, not a promise about SQLite/OS forensic remnants or backups.
8. Check the session boundary: while a session is active, reload the extension
   from `chrome://extensions`; reopen on the public article. Matching must be off
   until a fresh Start, even if Chrome's HTTPS grant remains. Repeat with a full
   Chrome restart. Pairing is still session-only and may need reconnecting.
   These reload/restart checks and first native-dialog acceptance remain manual;
   the headless test harness could not verify them reliably.

The reader samples at most 4,096 characters from a rendered article/main region or
the approved bounded article-container fallback,
excludes forms/editables/navigation/comments/hidden regions and never falls back
to the whole document. E5 uses a versioned prefix of at most 512 tokens. This is
limited coverage, not full-page analysis. The exclusions are structural checks,
not reliable authentication/private-data/paywall detection or a website-rights
grant. Only process pages you may lawfully process.

For this owner-only prototype, 0.6.5 implements the owner's permission working
assumption: robots/googlebot/TDM metadata does not block matching, including
negative, unknown or malformed declarations. This is not legal/store clearance,
and vectors do not establish permission. The [ADR-018 amendment](../../../decisions/ADR-018-background-page-matching-local-poc.md)
records the unresolved legal/policy assessment before any external tester,
distribution or remote use. ADR-019 B changes only the explicit capture session
and use of the existing optional broad grant, not private-page scope or access
controls. The frozen older metadata-only
experiment remains unchanged.

The manifest adds an offscreen worker and optional HTTPS host grants. Requests
remain fixed loopback API or packaged extension assets, with no remote script or
model fetch. The extra CSP permission is WASM-only, not JavaScript `unsafe-eval`.
Blocked sites persist in trusted local extension storage; the live window lease
and token are session-only. Legacy enabled-site preferences remain inert and do
not start a session. Raw text/vectors are not stored in extension storage.

### If the matching controls are disabled

Open the extension from its toolbar icon on a fully loaded public HTTPS article,
not from `chrome://extensions` or a tab containing `popup.html`. Read the context
message near **Start browsing session**. Version 0.6.1 distinguishes
unfocused/unsupported windows, loading or unavailable tabs, missing URL access,
incognito/unsupported URLs and worker failure. A checked retention checkbox alone
cannot enable an ineligible site. Keep the article's normal Chrome window focused;
close detached DevTools if the message reports lost focus, then reopen the popup.
Version 0.6.2 also accepts a freshly authenticated, visible and focused action
popup associated with that normal window if Chrome reports its parent unfocused.
Closing or blurring the popup invalidates that witness; an old last-focused
window alone never permits capture. Keep Chrome's **Developer mode** enabled
for the unpacked extension: that switch is unrelated to the DevTools window.
Before Start, disabled Stop/Retry controls are expected. Stop remains available
while a Start or permission request is pending.
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
code, for example `[missing-region]` or `[capture-budget]`. The capture-budget
code can also mean a guarded extraction failure. The owner's later
`[rights-restricted]` report identified the metadata veto, not a legal ruling.
Version 0.6.5 removes that veto under the explicit local working assumption
above; the legacy reason remains accepted for compatibility. Region/resource,
identity and privacy guards stay unchanged. After reloading to 0.8.0, start a
session on the public article and select **Retry current page** if needed. If another
unsupported reason remains, report only that message/code, not private data.
Do not repeat the checkbox/Enable sequence as a presumed fix.

Pairing and page eligibility are separate. **Choose a topic** means the local
catalog has loaded, and clearing the token input after Connect is intentional.
Never share that token or paste extension storage into a bug report. If the page
is still ineligible, report only the displayed context message and public domain.
No raw article content is needed to diagnose the Enable control.

From `spikes/topic-resolution`, separate real-Chrome checks are:

```sh
npm run test:browser:eligibility
npm run test:browser:session
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
An additional test seeds then removes legacy enabled-site preferences only in its
disposable profile. They cannot start a session, even after failed foreground
queries recover. No owner preferences or backend state are touched.
The 0.6.5 regression additionally invokes the packaged real-page reader on owned
synthetic content through temporary action access. It checks metadata acceptance
and retained content exclusions without enabling background capture, loading a
model or accessing a backend. This is not a real-site or matching-quality test.
The session/matching harnesses prepare Chrome's native site-access setting in
their own disposable profile through its internal extension-management API,
then exercise the real product permission request. They do not automate the
native permission-confirmation dialog; first-time acceptance is a manual check.
The session smoke verifies forced worker reconstruction, not natural idle or
crash cleanup. Actual reload/restart headless attempts lost the CDP-loaded
worker/action connection; they are reported as gaps, not passes.
The 0.8.0 full matching check now passes 17 checks across two intercepted HTTPS
origins with actual packaged E5 inference, a shared comment, User-mode state and
successful native toolbar bitmap updates. The separate
discussion regression and loopback transport checks also pass. A test-only fix
cancels debug setup for sessions Chrome has actually detached; live-target and
network/payload failures remain fatal. This is not real-news accuracy evidence.
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
