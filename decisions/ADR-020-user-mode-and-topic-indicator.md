# ADR-020: User-facing popup and same-Topic toolbar indicator

Date: 2026-09-29.
Status: Owner-requested presentation increment implemented/reviewed and
full-service Chrome verified in 0.8.0. See STATUS for evidence and limitations.

2026-09-29 follow-up: the owner requests five toolbar states. Implemented in
0.10.0 with independent Trust/offline checks; actual Chrome session/reader and
full comments/native-color checks pass after owner shutdown of port 4174. This
supersedes the old two-color meaning below:

- Red: disconnected/unverified or the last relevant service read failed.
- Gray: last verified connection, no currently attested page Topic.
- Green: current page has a verified retained Topic but no distinct learned peer.
- Light blue: another distinct retained learned page shares that Topic.
- Dark blue: that shared Topic also contains a visible contribution or reply.

A singleton Topic stays green even when it has posts. Deleted tombstones and
unsent drafts do not count as posts; a visible reply under a Deleted root does.
No new AI identity or posting capability is introduced. Localized text tooltips
must explain the colors. Connection is last-observed, not a continuous health
guarantee. Reuse fixed authenticated catalog/discussion reads; no heartbeat,
new permission, endpoint, background capture or caller-supplied status assertion.
Popup connection/discussion changes may request a trusted background refresh;
only freshly validated Source/URL/Topic and coherent versioned read evidence may
paint a page-specific Topic state. All original invalidation/marker fences apply.

## Decision

The owner requests a small User/Developer switch, a Topic-first discussion view,
visible connection status and a blue extension icon when another page belongs to
the current page's Topic. This is presentation of the approved local prototype,
not authorization for new capture, matching, authentication or external scope.

- User mode is the default. Both modes use the same controller, selection, draft
  and contribution actions. Switching mode must not submit, discard or reattach
  a draft or enable capture. Developer mode exposes the existing diagnostics.
- Store only an inert User/Developer preference locally. Pairing remains in
  trusted session storage; this is not approval of ADR-019 C durable pairing.
- Show the selected Topic title above the discussion and distinguish manual
  selection from automatic experimental association. Do not show a stale Topic
  as the destination after navigation, failed reads or lost page resolution.
- Connection text reflects successful service reads, not just a saved token.
  Show connecting, disconnected and unavailable distinctly. This is the last
  observed connection state, not continuous monitoring of the backend.
- Keep connection setup, capture disclosure/consent, Start/Stop, site blocking,
  native access removal and correction/deletion accessible in User mode.
  No diagnostic toggle can grant authority. Human/demo identity and AI counts
  stay distinct; this does not add real accounts or an AI provider.
- All new copy is English in the existing locale dictionary. Use visible text,
  keyboard controls and focus styling; color is not the only status cue. The
  capture shortcut scrolls/focuses with a button, never a URL fragment: exact
  packaged popup URLs are part of the existing message/focus authentication.

## Toolbar evidence and lifetime

A blue per-tab icon means the current authorized, ready page has another
distinct retained learned Source assigned to the same Topic. A fresh bounded
catalog read checks the Source ID, URL and Topic against the current resolution.
Fixture-only entries, merely related vector neighbors, and a lone Source do not
qualify. Topic assignment is provisional or manually corrected, not proof of
semantic equivalence or a confidence score. Comments need not exist yet.

Use the existing paired loopback API and action permission surface. Do not scan
inactive tabs, crawl URLs, download images/models, add a listener or permission,
change the matching threshold/input, or expose vectors. Invalidating matching,
navigation/focus/permission/pairing changes and Stop clear the indicator. Late
catalog responses and queued icon writes must not restore an obsolete blue icon.

Chrome may retain a per-tab action override while the extension worker sleeps.
Keep at most one inert integer, `pageMatchingToolbarTabId`, in trusted session
storage so a reconstructed worker can clear its previous override without a tab
scan. Persist before painting blue; clear the override before removing the marker.
No URL, title, Topic, vector or browsing timeline is stored in this marker. It
cannot start capture or supply page-resolution authority. Storage/API errors fail
closed; inability to clear a Chrome-owned icon must not be represented as success.

Draw code-native neutral/blue speech bubbles using service-worker OffscreenCanvas.
The [Chrome action API](https://developer.chrome.com/docs/extensions/reference/api/action)
supports image data, per-tab icons and accessible tooltips without a new manifest
permission. This technical capability is not store or legal approval.

## Verification and unchanged gates

Require focused rendering/preference races, stale result and icon-write tests;
independent Trust review; restricted capability/package checks; actual Chrome
checks of User-mode pairing, comments, mode switching and same-Topic indication
on owned synthetic pages. Preserve existing session and discussion regressions.
Record exact results and limitations in STATUS before committing.

Checkpoint results: restricted 624/624, normal 623 plus one intentional skip,
indicator 436/436, backend 67/67; actual Chrome session 15 and eligibility/reader
32 checks pass. Separate AI Trust reviews accept the implementation and shortcut
correction. After the owner stopped their backend, the unchanged implementation
passed all 17 real-backend User/comment/native-bitmap Chrome checks, the 19-area
Developer discussion regression and 2/2 loopback transport tests. Six owned
intercepted documents produced ten real 384D vectors with no external extension
requests, runtime exceptions or fixture raw-text matches in inspected API bodies.
Owner data/profile/service were not used. The connected User discussion screenshot
was visually inspected; no product/harness correction was needed for these runs.
The harness observes completed native setIcon calls and exact 16/32px colors for
shared and subsequent neutral states; startup-neutral is default/tooltip plus
unit evidence, since instrumentation attaches after startup. Native API completion
is not a screenshot of Chrome's OS toolbar. Owned synthetic-page success does
not establish real-news matching accuracy, first native-dialog acceptance,
installed-extension reload/browser restart behavior, or store/legal clearance.

At the original 0.8.0 checkpoint ADR-019 A/C were pending. A was subsequently
approved and measured without input rollout; C remains pending. No change to private-input, provider, remote service,
deployment, spending, external tester/publication or provenance-review gates.
Completed Phase 0 and the 6/6 owner review remain complete.

0.10.0 continuation: full matching smoke passes 20 covered areas in Chrome 154,
including successful native bitmap submissions/tooltips for all five colors,
withdrawal to light blue, repost to dark blue, and red on 401/gray after re-pair.
The last two are checked with capture stopped and a manually selected Topic;
manual selection must not count as attested current-page evidence. Fourteen
384D vectors from eight owned documents, no external extension requests/runtime
exceptions/fixture raw-text matches in inspected API bodies. Legacy discussion
passes 19 areas after its strict storage whitelist is corrected to permit the
existing integer cleanup marker while unpaired; transport tests pass 2/2. No
production or owner-data changes. Native API completion is not an OS-toolbar
screenshot or complete transition-ordering trace. Withdrawal/repost ingestion
counts do not independently prove no reader/inference activity; restricted race
tests remain necessary. Earlier first-dialog/reload/restart/quality limits stand.
