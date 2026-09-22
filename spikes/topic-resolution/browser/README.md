# Bundled-fixture read-only indicator

Status: P1.5a local proof-of-concept increment. This is not the completed P1.5
browser-observation gate.

## What it demonstrates

The Chromium action popup renders a strict local view of project-created
fixture outcomes:

```text
explicit popup choice
  -> in-memory bundled fixture lookup
  -> strict response validation
  -> latest-activation controller
  -> text-only resolved / unmapped / unsupported / unavailable view
```

Two synthetic Sources demonstrate that an exact reviewed fixture fingerprint
can map them to the same Topic and Discussion. Human and agent contribution
counts remain separate. Other scenarios demonstrate abstention and fail-closed
states. Every view is visibly marked `Bundled fixture` and `NO AUTO`.

The browser-neutral core has no browser, filesystem, process, network, DNS,
storage, credential, or provider imports. The Chromium package requests no
permissions or host permissions, has no content/background script, reads no
tab or page data, and makes no request. Its fixture lookup is not a service and
does not prove that semantic matching works on real content.

## Manual check

1. Open Chromium's extension management page and enable developer mode.
2. Choose **Load unpacked** and select the `browser` directory. The manifest
   lives at this package root so its popup can import the audited sibling
   `core` and `fixtures` modules without a build or copied runtime code.
3. Click the extension action.
4. Switch among the bundled scenarios and choose **Show fixture state**.
5. Confirm that resolved scenarios show the same Topic/Discussion for the two
   Sources, counts remain separate, and non-resolved scenarios never display a
   misleading zero-count discussion.

Loading an unpacked extension is a local developer action, not deployment,
publication, store submission, or approval for distribution.

## Verification

From `spikes/topic-resolution` run:

```powershell
node --test --test-isolation=none test/indicator-contract.test.js test/indicator-controller.test.js test/indicator-package.test.js
npm run test:restricted
npm run check:secrets
```

Package tests pin the complete extension inventory and manifest, forbid page
and network APIs, inspect the local content-security policy, exercise hostile
fixture text and malformed responses, and prove late completions cannot replace
the current activation.

## Firefox adapter gap

No Firefox manifest/package or compatibility result exists yet. The
browser-neutral contract and controller are reusable, but manifest behavior,
popup packaging, CSP, accessibility, and later user-invoked tab access must be
tested in Firefox before making a support claim. This gap does not block the
local Chromium fixture check and must remain visible at the full P1.5 gate.

## Stop boundary

Stop before adding `activeTab`, `tabs`, host permissions, content injection,
real page observation, extraction, a local or remote HTTP service, persistence,
telemetry, semantic suggestions, writes, deployment, or publication. The
official Chromium documentation confirms that `activeTab` grants temporary
access to sensitive tab properties after a user gesture; adding it changes this
slice's privacy boundary and requires the recorded owner/Trust checkpoint:

- <https://developer.chrome.com/docs/extensions/develop/concepts/activeTab>
- <https://developer.chrome.com/docs/extensions/reference/api/tabs>
- <https://developer.chrome.com/docs/extensions/develop/migrate/improve-security>

ADR-009 keeps the PoC on the NO-AUTO path. Any future candidate may be a local
reviewer suggestion only until the separate semantic-evidence gate passes.
