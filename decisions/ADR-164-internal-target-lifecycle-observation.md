# ADR164 Internal target lifecycle observation

Date: 2026-10-20. Status: accepted after independent Trust design review,
with the explicit registry/lifetime clauses below. Source-only implementation
is authorized; no preparation or actual browser run yet.

## Evidence and scope

ADR162 is closed failed. Its actual first fault is target-created / browser-cdp
before / startup-fatal unexpected-target, with unknown-type, chrome-internal,
length1-128, context present and attached false. This identifies that attempt's
rejection, not its exact type, endpoint or ownership. Normal owned cleanup and
all204 source endchecks pass. Never replay or edit its frozen sources/output.

The [Chromium type definitions](https://raw.githubusercontent.com/chromium/chromium/main/content/browser/devtools/devtools_agent_host_impl.cc)
include browser_ui and assistive_technology, absent from the old finite observer.
The [Chrome delegate](https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/devtools/chrome_devtools_manager_delegate.cc)
classifies browser UI separately from tabs. These are hypotheses to observe,
not proof of the installed binary's target type. The [CDP contract](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Target.pdl)
leaves type open and includes non-tab infrastructure in default discovery.

Obtain the missing finite type/endpoint and lifecycle relations without changing
any existing target rejection, native command, launch option or network denial.
This diagnostic may correctly fail again. It neither authorizes internal targets
nor establishes extension compatibility, capture or semantic quality.

## Source boundary

Matcher owns only six new files under
`spikes/topic-resolution/harness/experimental/internal-target-lifecycle-v1/`:
`run.mjs`, `supervise.py`, `source-ledger.js`, `observed-variant.mjs`, `test.mjs`,
`README.md`. Root owns this ADR and later phase decisions. Mechanically retain
ADR162's204-source composition, replacing only its own six sources and decision
with the new namespace/handshake/identity. Keep all original187 sources, fixed
helpers and freeze dependencies unchanged. No old162 runtime-helper or output
dependency. Old CODE reads serve restricted independent diff review. The one
explicit test-only exception is the original162 `observed-variant.mjs` exported
variant for invented-client differential tests: verify its exact frozen SHA256
`f5494f7595acb5e302795d10cabf2b689affd2aa7b7a7fce27b9637bf3ec11c3`
BEFORE dynamic import. Never call its entrypoint or supply native clients; never
import it from the real run/guardian/ledger or add it to the204 runtime closure.
No other old162 CODE, output or artifact dependency is admitted by this exception.

Guardian, coordinator, census, settlement, source pins, resources, timings and
cleanup remain identical. Retain all original native callback actions/predicates.
New listeners are observation-only; no additional CDP requests, target attachment,
filter, permission, endpoint access or Playwright property/method read is allowed.

## Finite observation

Extend type categories only with browser_ui and assistive_technology. Unknown and
invalid types remain finite and rejected by the original predicates.
Keep the old URL class and add a separate finite endpoint category using EXACT
raw equality, before any normalization, to these source-backed literals:

- chrome://omnibox-popup.top-chrome/
- chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html
- chrome://omnibox-everywhere.top-chrome/
- chrome://tab-search.top-chrome/
- chrome://webui-browser/

These literals occur in [Chromium WebUI constants](https://chromium.googlesource.com/chromium/src/+/lkgr/chrome/common/webui_url_constants.h)
(observed blob d2c6a9873198d585bb416e1b8c05d1cc0fcd8f09).
The [omnibox README](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/resources/omnibox_popup/README.md)
describes a browser-window popup surface. No endpoint is asserted observed yet.
Nonmatching internal URLs use other-chrome-internal; query/fragment variants,
suffixes and lookalikes do not receive an exact endpoint category. Emit query
and fragment presence booleans only for bounded primitive URLs. No raw values,
origin, URL/ID hash, title or arbitrary error text may be retained.

Add local observation listeners for targetInfoChanged, targetDestroyed and
targetCrashed, registered before discovery. Preserve target-created's original
action exactly once even when the observer fails. Observation-only listeners
use the same fail-closed path without manufacturing an original action.

Maintain a per-variant private registry bounded to32 target IDs and32 context
IDs, each primitive nonempty string matching `[A-Za-z0-9._:-]{1,160}`.
Retain no raw URL/title/type string in the registry: use finite classifications
and primitive IDs only. IDs never escape into output. Keep tombstones until end;
enforce a32KiB private registry bound and release it after final projection.
Account retained ASCII key/value lengths and every finite state field with fixed
declared costs, including tombstones; no arbitrary serialization for accounting.
Destroyed/crashed-before-created reserves a bounded tombstoned identity. Later
create/change may be reported but never revives terminal state or erases history.

Emit only bounded local ordinals, created/duplicate-created/changed/destroyed/
crashed/unregistered lifecycle enums, type/endpoint/context changed booleans,
parent/opener absent/invalid/registered/unregistered relations, closing flag and
bounded registry counts. ID accessors/proxies/oversize values must not invoke
hooks or be silently admitted to a registry. Such input fails observation closed.
Ordinary missing/invalid primitive relations may have finite absent/invalid output;
accessors, proxies and oversized identities fail closed, with no registry insertion.

For context comparison, use the unique observed page/about:blank target only as
an OBSERVED comparison anchor. It is not an authenticated mapping to Playwright's
actual anchor. Context is absent, invalid, not-yet-comparable,
same-as-observed-blank or different-from-observed-blank. Before the blank event,
keep the relation unresolved; later emit bounded relation resolution for earlier
targets. Fix the first unique blank target/context as historical comparison;
never silently rebase after a change. A second blank identity or comparison-anchor
context mutation fails observation closed. Never label a first-seen context owned. Top-level UI need
not have a blank-page parent: the [Chromium enumeration test](https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/ui/webui_browser/webui_browser_browsertest.cc)
explicitly exercises top-level browser-UI targets.

All callback/lifecycle/relation rows share the original32-row budget. Keep one
first fault and final cleanup projection; emission exhaustion/failure fails
closed and never suppresses original denial or primary failure. Charge relation
resolution rows BEFORE emission/continuation under that same cap; even overflow
must still run the original target-created action once, preserving its failure.
Preserve exact
physical pending counters, not cleared bookkeeping. Continue descriptor-only,
proxy-rejecting projection, raw bounds before classification and finite errors.

## Gates and verification

Carry ADR162 limits unchanged:30s bootstrap, child175s/whole180s/wall195s/
cleanup10s, two45s variants, original15s residual subset and fresh exact census,
identity-bound ACK, heap256MiB/Job1536MiB, host1GiB/C768MiB/D512MiB reserves,
profile512MiB/8192entries, evidence1MiB/logs64KiB/metadata64KiB. Blank pages only.
No normal pass with emergency cleanup. Default imports remain inert.

Tests cover exact endpoints versus query/suffix/fragment/lookalikes; both added
types and unknowns; unknown-before-blank resolution; duplicate/reordered/later
events (including changed/destroyed/crashed before create and postterminal
create/change), tombstones and context/type/endpoint mutation; absent/invalid parents;
ambiguous blank identity or changed anchor context; proxy/getter/coercion zero-hook projection; registry
and shared emission limits; cleanup events; simultaneous observer/original
failure, relation-resolution overflow and exactly-once actions. Compare original162 and successor variants on
invented clients for native calls/arguments/actions, outcomes, cleanup and actual
pending-state equality except additional diagnostic-only listeners/rows.

Root/Trust full source reviews and executable tests precede ONE metadata
preparation. Both actual204-source freeze audits then precede a separate ONE
owned DEV decision. No public article, capture/E5/model artifact read, fit,
database, account, provider, live runtime or crawler action follows. Root records
actual findings separately; the complete original goal remains active.

## Source checks and preparation decision

Root and independent Trust each pass25 guarded tests. The one expected Python
subprocess skip is covered by separately executing the identical actual-namespace
pure AST suite. Both actual CODE-only204 inventories agree in each review, and
each language rejects all10 fixed freeze/helper byte-tamper negatives. Root's
restricted normalization confirms runner, guardian and ledger differ from162 only
by declared namespace/environment/handshake/decision substitutions. The variant's
native function body restores exactly after removing only local lifecycle
listeners and the closing observation field. No target rule was relaxed.

Reviewed SHA256 values:

- run.mjs: `5f4c1f3c5e93ce901c2e3a2933d3ff36eb47930d3ac4b17b1d9d61b54e243b2f`
- supervise.py: `07956654c89320a6c003f140db29f2e059471adedde5d612b1f2ffc6afb62e84`
- source-ledger.js: `4f9fb902ec79e3afd166774647bc51d57f6c5c38d6d7cdf7f95b813469fbbf2a`
- observed-variant.mjs: `b8c83d4881436046eba46ac48d9be547e1382f92bad22870b89de0df7b7f6799`
- test.mjs: `c5baca004560193c9b5ad7853201a1c5b92c017c83da60869e28e26fffb3caf5`
- README.md: `fce1e12c86527667528cbbda51c7049a3cf13ed9399c0fe0985db8a35de69843`

Root authorizes ONE metadata-only `supervise.py --prepare`, followed by both
actual freeze audits. This decision and all204 closure bytes then become
immutable. No browser permission follows from preparation. Actual outcomes must
be recorded outside this closed source composition.
