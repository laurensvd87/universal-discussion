# ADR-010: Local user-invoked active-tab URL observation

Status: Accepted for the exact local P1.5b boundary; implementation evidence
and post-implementation Trust/Quality review still required

Date: 2026-09-22

Owners: Lead / Product Orchestrator, Platform and Client, Trust, Privacy,
Quality

Owner disposition: accepted explicitly on 2026-09-22. This authorizes only the
field, permission, retention, and local lookup boundary below. It is not a
provider, deployment, spending, publication, real-user study, extraction, or
expanded browsing-data approval.

## Context

P1.5a proves the popup, response contract, rendering, and stale-activation
behavior with bundled scenarios and zero browser permissions. It cannot react
to the page a person is viewing because it deliberately reads no tab or page
data.

ADR-002 accepted a user-invoked `activeTab` direction in principle, but did not
authorize an implementation or settle its exact collected fields. The next
increment should expose the smallest useful privacy surface before considering
P1.3 extraction. Chrome documents that `activeTab` grants temporary access to
the invoked tab, including sensitive tab URL/title properties, after a user
gesture. The tabs API itself can be called without a broad `tabs` permission;
access to sensitive properties still depends on `activeTab` or matching host
access:

- <https://developer.chrome.com/docs/extensions/develop/concepts/activeTab>
- <https://developer.chrome.com/docs/extensions/reference/api/tabs>

## Decision

Authorize one local Chromium P1.5b experiment with this exact boundary:

- add only `activeTab` to the manifest permission array;
- do not request `tabs`, `scripting`, host, history, web-request, cookie,
  storage, identity, background, content-script, or incognito capability;
- observe only after the person clicks the extension action, and only the
  active top-level tab in the current window;
- read the browser-supplied tab ID and address-bar URL only; do not request or
  retain title, canonical metadata, DOM/head/body text, frames, referrer,
  selection, forms, cookies, storage, authentication state, or page messages;
- immediately discard the fragment, reject credentials and every non-HTTP(S),
  query-bearing, private/local/special-use, or non-allowlisted address, and
  never publish the rejected URL in an error or log;
- initially allow only an exact checked-in set of queryless reserved-domain
  demonstration URLs under `example.com`, `example.org`, or `example.net`;
- hold the tab ID and accepted normalized URL only in popup memory for the
  current activation, with no storage, cache, background worker, telemetry,
  console logging, or external request;
- perform only a bundled exact-normalized-URL lookup. Extend the strict
  contract with a separately tested URL-to-Source receipt while keeping the
  existing exact-fingerprint Source-to-Topic mapping distinct and
  `noAutomaticSemanticJoin: true`; do not add a semantic suggestion or join;
- re-check the same tab and normalized URL immediately before rendering. A
  closed tab, permission loss, navigation, newer activation, malformed result,
  or mismatch becomes unavailable and never displays a zero-count result; and
- continue rendering only in the extension popup with text-only DOM writes.

Opening a demonstration URL is a separate browser/user action. The extension
must not open, fetch, prefetch, resolve, or redirect to it.

## Explicit exclusions

This proposal does not accept ADR-006 or authorize extraction. It does not add
`scripting`, inject code, read the page title or canonical link, serialize the
DOM, hash page content, inspect a body, or process a general public URL. It
also authorizes no network egress, service, persistence, account, identity,
posting, AI/provider call, real-user study, analytics, passive observation,
deployment, store submission, spending, recruitment, or publication.

Any expansion of the exact URL allowlist, acceptance of queries, title/metadata
read, page injection/extraction, background observation, storage, or network
use requires a new field-level privacy/Trust review and owner approval.

## Security and privacy consequences

- The browser still discloses the full address-bar URL to extension code before
  the code can reject a query or fragment. That value can contain personal or
  secret data, so it must remain ephemeral and never be logged, persisted, or
  placed in an exception message.
- `activeTab` is narrower than standing host access but is still a meaningful
  permission and supply-chain target. Exact packaging, CSP, source capability,
  and effective-permission checks must be rerun.
- A real browser smoke must inspect the effective permission list, extension
  storage, console, and traffic while exercising supported, query-bearing,
  private/local, restricted, navigated, closed-tab, and repeated cases.
- Static Node tests cannot establish browser permission behavior or prove the
  absence of traffic; manual Chromium evidence is required before closing the
  P1.5b increment.

## Alternatives considered

- Keep only the fixture selector: safest, but it cannot test whether the popup
  reacts to an explicit browsing context.
- Read URL plus title: rejected for this first increment because exact URL
  lookup does not need title and titles can expose sensitive content.
- Add `scripting` and reuse the P1.3 HTML extractor: deferred pending owner
  disposition of ADR-006 and a separate field/content privacy review.
- Request broad `tabs` or host permissions: rejected; the user-invoked
  experiment does not need standing access.
- Start with a remote lookup: rejected; egress, logging, retention, abuse, and
  service controls remain undecided.

## Validation and rollback

Before claiming the increment complete:

- pin the exact manifest/package and browser-neutral adapter inventory;
- test supported/unsupported eligibility, fragment removal, query rejection,
  credential/private/special-use rejection, response cross-binding,
  navigation/tab-close/permission-loss races, repeated invocation, and generic
  errors without hostile-value echo;
- pass focused, full ordinary, full restricted, and secret-scan checks;
- perform a local Chromium manual smoke with traffic/storage inspection and a
  basic keyboard/visible-state accessibility check; and
- obtain a separate read-only Trust/Quality engineering review of the final
  tree without treating it as independent human or owner approval.

Rollback removes `activeTab` and the adapter, restoring the P1.5a
zero-permission manifest and fixture selector. No data migration or deletion is
needed because approved code must persist nothing.

## Owner / Trust / privacy disposition

Accepted on 2026-09-22 for implementation and local owner testing within the
exact boundary above. Trust/Quality engineering review remains required on the
finished code. Any broader permission, field, URL scope, retention, egress, or
release action returns to an explicit stop.
