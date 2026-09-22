# User-invoked local discussion indicator

Status: P1.5b implementation with automated checks passing. The required
manual Chromium permission, traffic, storage, console, and accessibility smoke
is still pending, so this is not the completed P1.5 browser-observation gate.

## What it demonstrates

The Chromium action popup has two local paths:

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
```

The current-tab path supports only `https://example.com/` and
`https://example.org/`, after fragment removal. Every query is rejected. The
two URLs resolve to distinct synthetic Sources and one shared Topic and
Discussion. Their URL-to-Source receipt is explicitly
`exact-normalized-url`; the separate Source-to-Topic mapping remains the
pinned `exact-content-fingerprint` method. Human and agent contribution counts
remain separate and `NO AUTO` remains in force.

The package requests exactly `activeTab`: no `tabs`, `scripting`, host,
storage, history, cookie, web-request, identity, or incognito permission. It
has no content/background script and never accesses the page title, DOM,
canonical metadata, body, frames, cookies, or authentication state. It makes
no network request, writes no storage or log, and retains the tab ID and URL
only in popup memory for the activation. The restrictive extension-page CSP
also disables connections.

This is local contract and navigation-binding evidence. It does not prove
semantic matching on real content, authorize extraction, or establish that a
future extension/mobile client will satisfy store, website-terms, copyright,
or privacy rules.

## Required manual Chromium smoke

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
7. In popup DevTools, set a breakpoint immediately before the second
   `readActiveTab()` call in `core/active-tab-controller.js`. Start a supported
   check, navigate the source tab to the other supported URL while paused, and
   resume. Repeat by closing the source tab while paused. Confirm navigation
   produces unavailable with no stale resolved fields; closing the tab may
   close the popup, but must never display the stale result. Remove the
   breakpoint afterward.
8. Exercise a bundled resolved scenario, the hostile-title scenario, and each
   non-resolved scenario. Confirm markup-like text stays inert and no
   non-resolved state displays misleading zero counts.
9. Inspect the popup with DevTools while repeating supported, rejected, and
   repeated checks. Confirm the Network panel remains empty, Console has no
   output or error, and Application/extension storage remains empty.
10. Use only the keyboard to reach and activate the current-tab button, open
   the bundled-scenario disclosure, choose a scenario, and submit it. Confirm
   focus is visible and each state change has visible status text.

Do not perform this smoke on a signed-in, private, paywalled, or otherwise
sensitive page. Loading an unpacked extension is a local developer action, not
deployment, publication, store submission, or approval for distribution.

## Automated verification

From `spikes/topic-resolution` run:

```powershell
npm run indicator:test
npm test
npm run test:restricted
npm run check:secrets
```

The focused checks pin the complete package and exact manifest/CSP; permit
only the audited `chrome.tabs` binding and active/current-window query; prove
that only tab ID and URL are projected; cover URL eligibility, response and
lookup-receipt binding, two-read tab/navigation confirmation, stale operations,
malformed results, and hidden-DOM clearing; and forbid network, storage,
logging, dynamic code, unsafe HTML, content scripts, and broad permissions.

## Platform gaps

No Firefox, Android, or iOS package or compatibility result exists yet. The
browser-neutral policy and response contracts are reusable, but each client
needs a reviewed adapter, store-policy evidence, and platform security tests.
WebView DOM access is technically possible on Android and iOS, but technical
access is not permission to extract or reuse third-party material. The
standards-based metadata, website-terms, copyright, paywall, publisher-signal,
and store-review boundary remains a separate decision before any such adapter.

## Stop boundary

Stop before adding `tabs`, `scripting`, host permissions, content injection,
title/metadata/body extraction, a broader URL set, storage, network/service
egress, telemetry, semantic automatic joins, writes, deployment, store
submission, or publication. Each changes an accepted field, privacy,
platform-policy, provider, or release boundary and requires a new explicit
owner review. ADR-009 keeps the PoC on the `NO AUTO` path; ADR-010 authorizes
only the exact local URL slice implemented here.
