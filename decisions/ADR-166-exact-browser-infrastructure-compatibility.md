# ADR166 Exact browser infrastructure compatibility

Date: 2026-10-20. Status: independently accepted for bounded source-only
implementation with the conditions below. Preparation and native execution
remain separate gates.

## Actual incompatibility

ADR164's one run is closed failed. It rejected browser_ui at the exact
omnibox-popup-root endpoint, followed by omnibox-popup-aim. Both were unattached,
had no query, fragment, parent or opener, and later compared equal to the observed
blank target's context. All three targets were destroyed during close. Physical
work reached zero, but the guardian recorded emergency termination, so this is
not a normal success. All204 endchecks and independent failure audits pass.
Do not edit or replay that source closure/output, retroattribute162's unknown raw
values, or assume a compatibility change solves emergency process cleanup.

Permit only these two observed infrastructure tuples in the isolated empty-profile
startup diagnostic. Bind them to the actual supplied Playwright anchor before
discovery. Unknown internal URLs and public targets remain fatal; this is not an
exception for chrome:// generally or a change to application matching authority.

## Source composition and native delta

After design acceptance, Matcher owns six new files under
`spikes/topic-resolution/harness/experimental/exact-browser-infrastructure-v1/`:
`run.mjs`, `supervise.py`, `source-ledger.js`, `compatibility-variant.mjs`,
`test.mjs`, `README.md`. Root owns this decision and phase gates.
Keep the original187 plus17 composition, replacing only own six sources/decision.
All fixed helper and freeze pins remain. No old164 runtime helper/output dependency.

Reuse the reviewed observer mechanics by explicit source adaptation, not runtime
imports from164. One test-only injected-client differential may dynamically import
old164 `observed-variant.mjs` only AFTER verifying its exact CODE SHA256
`b8c83d4881436046eba46ac48d9be547e1382f92bad22870b89de0df7b7f6799`.
That exception adds nothing to the actual204 closure and executes no old entrypoint.

Keep all launch arguments, sandbox/TLS/network/download denials, coordinator,
physical settlement, stage bounds, resource limits, owned-Job baseline/ACK/drains
and exact cleanup counts. Authorize precisely four additional bounded coordinator
operations per variant: actual-anchor CDP session creation, anchor target-info
query, pre-load census and final pre-close census. The original post-load census
remains. Existing browser-cdp/target-census stage categories may describe these
operations without adding arbitrary strings or increasing deadlines.

## Actual anchor and allowed identities

After HTTP/WebSocket/download denials and before discovery, obtain
`context.newCDPSession(anchor)` on the actual already-checked single blank Page,
then send `Target.getTargetInfo` with no target ID. The pinned Playwright1.64.1
bundle selects the supplied Page's target; the [Chromium handler](https://raw.githubusercontent.com/chromium/chromium/main/content/browser/devtools/protocol/target_handler.cc)
defaults an omitted target ID to the session owner. Root inspected both code paths.
This is trusted browser/client identity, not binary/signature, account, canonical
write or native capture authority. Context close disposes the extra session.

Descriptor-check primitive target/context IDs against `[A-Za-z0-9._:-]{1,160}`;
require exact page/about:blank and a present valid context. Seal both privately.
Discovery's blank target must match these IDs; another same-URL page cannot
substitute for the authenticated anchor. No arbitrary string coercion or getters.

Only permit exactly one of each tuple, with raw exact URL equality:

- browser_ui / chrome://omnibox-popup.top-chrome/
- browser_ui / chrome://omnibox-popup.top-chrome/omnibox_popup_aim.html

Require context equal to the authenticated anchor, attached strictly false,
parent/opener absent, distinct valid target IDs, neither equal to the anchor.
Seal each tuple's first target identity. Reject duplicate creation, same-endpoint
second IDs, replacements, query/fragment/suffix/normalization variants, invalid
fields, type/URL/context/attachment mutation or unexpected parent/opener.
The other three source-backed164 observer endpoint categories are NOT allowed
infrastructure. Service-worker handling retains its original extension-ID/URL,
deferred identity and one-worker checks; no specialist-bot or provider permission.
The diagnostic additionally requires an admitted worker target identity to stay
live and retain its type/URL/context until owned closing. Early destruction,
identity mutation or any crash is fatal diagnostic refusal, not an ordinary API
incompatibility result. Legitimate idle MV3 shutdown may therefore be refused;
this does not establish general extension-lifecycle compatibility or imply that
normal worker shutdown is unsafe.

## Lifecycle and census agreement

Register discovery and lifecycle checks before unfiltered discovery. All new
policy failures use finite literal codes and the original fail/first-fault path;
observer failure still cannot suppress original denials or cleanup.
Preserve registry caps32targets/32contexts/32KiB and shared32 observation rows,
bounded events/trace, tombstones, private ID lifetime and finite output only.
Never emit IDs, raw URLs or their hashes. Known internal endpoint enums are enough.

Infrastructure destruction before closing is fatal. During closing, retain its
tombstone; any postterminal revival is fatal. Crashes are always fatal. Anchor
type/URL/context may never change; its ordinary detach/attached-false transition
is allowed only while closing. Unknown lifecycle identities remain fatal rather
than being silently learned from a changed or destroyed callback.

Immediately after discovery and before Extensions.loadUnpacked, require a census
with the authenticated anchor and both sealed infrastructure IDs, exactly once.
Keep the post-load census and add a final census before closing, with identical
infrastructure identities. Cross-check callback registry and current census, not
just type/URL counts. Copy census arrays and records through bounded descriptor
checks without invoking getters; compare actual target-ID sets to the callback
registry. Any disagreement fails before further normal native work.
Preserve the old permitted zero-or-one exact extension worker, zero other targets
and existing empty-browser census behavior; no infrastructure attachment occurs.

Result census metadata extends only with finite infrastructure count/equality and
anchor equality, and distinguishes pre-load, original post-load and final checks.
The guardian independently validates the exact revised result/census schema,
phase requirements and equality/count invariants. Failed early phases may retain
null unreached censuses, never fabricated success. Native errors and API absence
remain explicit incompatibility, not a successful native begin/end claim.

## Tests and phase gates

Invented-client tests must prove the exact two tuples now reach extension loading,
while each missing/duplicate/changed tuple, wrong context, forged anchor, second
blank page, crash, early destruction, postterminal event and unknown/public target
fails. Test callback/census disagreement, mutation during each await, cleanup-time
events, proxy/accessor/malformed data with zero projection hooks, logging/capacity
failure preserving original actions, unsettled physical work and both close counts.
Compare old164 and successor outcomes/actions with only the declared new calls,
two-tuple acceptance and stricter worker-lifetime diagnostic condition differing.
Do not demand byte-identical policy predicates;
require a restricted reviewed diff identifying every consequential change.

Root/Trust complete source review, tests, identical separate pure Python checks,
actual204 CODE inventories and fixed-pin negatives precede ONE metadata-only
preparation. Both actual freeze audits precede a separate ONE owned blank-browser
DEV decision. No retry, rescue profile, discovery filter, timeout increase, public
article navigation, capture/E5/model artifact/fit, account/provider/post or owner
runtime/crawler action follows. Normal process drain remains mandatory for a pass.
Actual semantic quality and full canonical/UI goal remain open.

## Accepted implementation conditions

Independent Trust accepted this design on2026-10-20. Seal the anchor and both
infrastructure identities before loading any extension, and recheck the first
fatal state after each of the four added awaits. Run the final pre-close census
also on nonfatal API-incompatibility outcomes. Only a genuinely unreached fatal
path may retain a null census. Set closing immediately before owned cleanup,
never to excuse an earlier identity change. Preserve the old browser/empty-URL
census exception exactly; it does not authorize a new discovery callback target.
The extra session must settle through existing context cleanup without another
detach/native operation. Tests cover all four await races, strict ID-set equality,
descriptor-safe parsing, first-fault dominance and extra-session settlement.
Root and Trust also accept the explicitly stricter worker lifetime condition.
Test destruction of the exact admitted worker during native API/begin/end and
final-census awaits: preserve the finite first fault, stop later normal actions
and attempt both closes once. Replacement/unknown identities remain fatal;
known-worker destruction during closing is tombstoned and cannot revive.
