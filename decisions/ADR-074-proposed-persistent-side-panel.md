# ADR-074: Persistent browser side panel and discussion-first redesign

Status: explicitly owner approved; implemented with independent Trust and actual Chrome verification (0.13.31).
Date: 2026-10-10.

## Owner request

The owner prefers Topic Atlas's polished visual language to the extension's
current popup, and requests a beautiful, compact discussion UI with icons and
animations, docked beside the webpage and retained across browsing.
The request authorizes redesign work, not an inferred new capture/provider scope.

## Proposed native surface

Use Chrome's MV3 Side Panel API rather than injecting an overlay into websites.
The extension icon opens a global panel for its normal browser window; the
same UI remains available across eligible tab and page changes. It does not
open itself without a user action. Chrome, not the extension, controls left/right
placement; configure the browser's panel placement to the right if necessary.

This requires one new manifest permission, `sidePanel`, and a packaged
`side_panel.default_path`. Opening the native panel replaces the action popup.
Bundled SVG/CSS icons require the narrowly reviewed CSP change from
`img-src 'none'` to `img-src 'self'`; remote fonts, images and assets remain blocked.
No new website host access, content retention, model, external service, provider
request, publication, or background private-page processing is proposed.
The existing owner-approved HTTPS grants/capture exclusions remain unchanged.

The owner explicitly approved the added API and longer-lived trusted extension
surface with "yes you may" on 2026-10-10 after the exact permission/scope question.
Before activation, Trust review must cover sender
allowlists, containing-window binding, tab navigation and stale response fences.
No broadening from a POPUP-only context check to arbitrary extension documents.
Any private/unsent text remains within existing memory/session retention policy;
navigating must not publish or rebind it silently to another page/thread.

Read-only Trust planning found that the current popup's `currentWindow` reader
and selected-tab-only lifecycle observer are insufficient for a persistent
panel. Use a distinct packaged panel entry, corroborated SIDE_PANEL runtime
context and owning normal window; bind active-tab reads, matching status and
pre/post extraction attestations to that window. Tab activation, navigation,
window focus/closure must invalidate stale Source/post/Insight targets before
actions. Keep the existing POPUP witness separate; no arbitrary-extension-entry
allowlist and no capture authorization based on panel blur/focus alone.

### Actual Chrome compatibility correction

Initial actual Chrome 154 QA rejected the proposed direct sender-document join:
`MessageSender.documentId` was absent, and native `SIDE_PANEL` contexts supplied
`windowId=-1`. Neither a last-focused-window fallback nor accepting a caller's
arbitrary RPC window ID is used. `history.replaceState` also failed as a proof:
the live context URL changed, but Chrome's message sender URL stayed original.

The trusted top-level panel first reads its containing normal/non-incognito
window via `windows.getCurrent()`, then performs one real `location.replace`
to its packaged path with a canonical window ID and fresh UUID. No pairing,
content read or provider boot occurs in the initial document. The worker requires
the exact extension sender ID/origin, no sender tab, a top frame when supplied,
canonical full URL and exactly one live native SIDE_PANEL context at that URL
(top frame, tab/window ID `-1`, non-incognito, a real document ID). An optional
sender document ID must agree. The worker validates the normal containing window
on every RPC; the panel checks its browser-observed containing window before
each active read, and service writes have two fresh context attestations.
Bare, malformed, duplicate, ordinary-tab and closed-instance URLs fail closed.
This replaces the unsupported proof within the approved trusted-entry package,
not the capture, provider or retention contract. Independent Trust review passed
after real two-window and closed-instance Chrome verification.

## Design and verification

Astra High supplied GUI orchestration/design; Sol Medium handles bounded coding
slices following approval. Borrow the dashboard's deliberate visual hierarchy,
using a resizable narrow layout, compact status/model controls, a clear composer,
thread-root cards and animated reply expansion. Keep Settings behind a gear;
retain accessible labels, keyboard focus, human/robot provenance, explicit Share,
delete/discard and matching Stop controls. Reduced-motion preference disables
decorative animation. No horizontal scrolling or remote fonts/assets.

Synthetic offline and actual-Chrome checks must cover panel persistence during
tab/navigation changes, source/window/context exclusions, late responses and
unsent text, authenticated pairing, unchanged posts/Insight authority, viewport
overflow, keyboard use, and no additional extension/provider egress. Screenshots
use fabricated/public synthetic content in a disposable Chrome profile.

First-use QA additionally required an explicit Grant-only UI path: native panel
opening does not grant readable tab URLs. A valid ungranted status may request
the already-approved Chrome HTTPS permission on a click even before URL/window
context is available; it never invents a Start ID. Permission-added scheduling
uses existing paired/healthy/focused-eligible-page/Stop guards. A ready learned
resolution now establishes a fresh matching active-tab observation before Ready
is writable. Independent Trust reviewed denial, late grant, Stop and unpaired
cases and this observation correction.

Actual Chrome 154 passes native pairing/Grant/Post, panel lifetime across tabs
and navigation, two simultaneous owning-window bindings, focus-away exclusions,
closed-instance and ordinary-extension-tab rejection, retained detached draft,
source links and no horizontal overflow. Synthetic data only; no provider
inference or added external extension request. Shared visual tests cover 320–480
pixels, zoom equivalent, keyboard focus and reduced motion; their companion
extension page is explicitly not native authentication evidence. Current exact
suite counts are maintained in STATUS.

Existing matching default and SQLite data stay unchanged. Owner permission gate,
implementation and Trust/native checks are complete; the owner still needs to
reload their installed extension and confirm its real-profile experience.
No foundation or 6/6 review is repeated, and no release/provider gate is waived.

## Primary platform reference

[Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
documents the permission, global panel, toolbar opening behavior, persistent
tab experience and user-controlled placement (checked 2026-10-10).
