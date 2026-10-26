# ADR147 Maintained browser client development proof

Date: 2026-10-20. Status: pinned dependency installed in a separate experimental
directory; development harness under construction. No browser phase has run.

## Decision

Test official playwright-core 1.64.1 as an alternative to the handwritten CDP
transport, using only the four previously consumed TRAIN controls. This is a
development compatibility check, not another independent quality cohort or a
resumption of ADR145. Its failed browser batch 05 and all frozen sources stay closed.

The separate experimental package will use the installed Chrome executable and a
fresh D: test profile. Its dependency has no package dependencies, and installation
disabled scripts and browser downloads, used empty npm credential configurations
and verified the application's existing manifests and lockfiles unchanged.
The pinned package integrity is recorded in its lockfile and README. Preserve
the installed package's license and notices.

## Document and privacy boundary

Each article gets a fresh browser context with no storage state or HTTP
credentials, and one known page. Close the entire context after that article so
cookies cannot pass between articles. Before navigation, verify its blank main
frame; synchronously reserve exactly one GET or HEAD Document request for the
fixed current URL and main-frame object. Deny other network requests, redirects,
popups, downloads and sockets, remove credentials, and block Service Workers.
Fresh robots/TDM checks, response header policy, TLS/public-peer checks and DOM
directives remain mandatory. A null peer cannot establish a public response.

Bind the response to the same admitted Playwright Request object. Separately
bind the CDP frame, loader, URL and isolated-world reader to the current article.
Public Playwright APIs do not provide the exact cross-API Network.requestId
mapping; the new witness must say networkRequestIdCorrelated:false and use its
own schema rather than pretending to reproduce the old witness.

After every awaited boundary and immediately before synchronous metadata
retention, recheck article identity, failure/refusal state, frame/loader and
deadline. Retain only bounded hashes and compatibility metadata, not article
text, HTML, raw errors, credentials or private application data. No pairing,
provider, post, canonical membership or classifier operation belongs in this test.

## Process and transport boundary

The supervisor must assign Node to its own Win32 Job before importing or launching
Playwright. Use a fresh D: profile/TEMP, credential-stripped environment,
chromiumSandbox:true, 180s absolute wall, 256MiB Node heap and 1536MiB Job commit,
RSS and private limits, with continuous host/drive reserves and confirmed drain.
Budget only its fresh output/TEMP tree at 512MiB and 8192 entries, without
following reparse points. Successful completion must not depend on killing
surviving browser descendants: emergency own-Job termination is failure and
must be reported as such.

Create the browser context and register routes before creating any page. The
package may create and clean its own ephemeral profile inside the verified fresh
D: TEMP directory; it must never select or clean the owner's existing profile.

Playwright's public API does not reproduce the old raw 4MiB IPC or 128 internal
command bounds. The new contract must disclose that difference, bound its own
coordinator operations and resource events, and rely on the stated process/Job
bounds for the underlying client. It does not claim complete OS egress isolation,
native extension attestation or ordinary dynamic-browser producer validation.

Review and pin all own sources, policy/reader dependencies, package lock and
the bounded complete installed playwright-core tree before the first phase.
Pure interleaving tests must cover stale Request objects, main-frame navigation,
late refusal, duplicate headers, null/private peers, deadline and cleanup races.
A successful development run is required before designing another prospective
capture study; it supplies no hierarchy-quality or production-activation claim.

## Official API references

[BrowserType](https://playwright.dev/docs/api/class-browsertype) documents the
installed-browser options and warns that compatibility is not guaranteed.
[BrowserContext](https://playwright.dev/docs/api/class-browsercontext) documents
request routing, Service Worker interception limits and socket routing.
[CDPSession](https://playwright.dev/docs/api/class-cdpsession) supplies raw protocol
access; [Response](https://playwright.dev/docs/api/class-response) supplies peer
information. These APIs support implementation choices, not the completed proof.
