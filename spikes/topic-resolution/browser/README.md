# User-invoked local discussion and metadata proof of concept

Status: the exact local P1.5b URL slice passes automated checks, Trust/Quality
engineering review, and the owner-run Chromium smoke. The exact P1.5c bounded
metadata slice is implemented and automated checks pass; independent
Trust/Quality review and its separate owner-run Chromium smoke are pending.
The broader P1.5 browser-observation and content-extraction gate remains open.

## What it demonstrates

The Chromium action popup has three separate local paths:

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
  -> isolated-world packaged function in top frame 0
  -> bounded direct-head candidates only
  -> strict immutable metadata envelope, with no semantic decision
  -> same-document-ID attestation + fresh final tab read
  -> text-only resolved / unsupported / unavailable metadata view
```

The current-tab path supports only `https://example.com/` and
`https://example.org/`, after fragment removal. Every query is rejected. The
two URLs resolve to distinct synthetic Sources and one shared Topic and
Discussion. Their URL-to-Source receipt is explicitly
`exact-normalized-url`; the separate Source-to-Topic mapping remains the
pinned `exact-content-fingerprint` method. Human and agent contribution counts
remain separate and `NO AUTO` remains in force.

The package requests exactly `activeTab` and `scripting`: no `tabs`, host,
storage, history, cookie, web-request, identity, or incognito permission. It
has no content/background script. The P1.5b path still reads only the tab ID
and URL. The separate P1.5c path can inspect at most 256 direct children of
`document.head` and return at most 32 allowlisted candidates for title,
description, canonical, publication-time, and two in-head control selectors.
It never reads body, JSON-LD, images, authors, comments, forms, selections,
hidden/accessibility text, frames, cookies, storage, authentication, or paywall
state. It makes no network request, writes no storage or log, and keeps only a
validated envelope in popup memory. The restrictive extension-page CSP also
disables connections.

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

## Reproducible manual Chromium smoke

The owner completed this checklist on 2026-09-22. The reported observations,
limitations, and disposition are recorded in
`../../../research/P1_5B_MANUAL_SMOKE.md`.

1. Open Chromium's extension management page and enable developer mode.
2. Choose **Load unpacked** and select this `browser` directory.
3. Inspect the extension details. Confirm its only requested permission is
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

## P1.5c manual Chromium smoke (pending)

Run this only after the implementation review is recorded. Do not substitute
another public site for the one exact approved MDN route.

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

## Platform gaps

No Firefox, Android, or iOS package or compatibility result exists yet. The
browser-neutral policy and response contracts are reusable, but each client
needs a reviewed adapter, store-policy evidence, and platform security tests.
WebView DOM access is technically possible on Android and iOS, but no mobile
adapter is approved. The generalized metadata, website-terms, copyright,
publisher-signal, and store-review boundary remains a separate decision before
any such adapter or public release.

## Stop boundary

Stop before adding `tabs`, host permissions, content/background scripts,
another field/selector/route, body or JSON-LD extraction, a mobile adapter,
storage, network/service egress, telemetry, semantic matching, writes,
deployment, store submission, or publication. `scripting` is approved only for
the exact P1.5c path above. Each broader capability changes an accepted
security/privacy/policy/provider or release boundary and requires a new
explicit owner review. ADR-009 keeps the PoC on the `NO AUTO` path; ADR-010 and
ADR-011 authorize only the exact two slices implemented here.
