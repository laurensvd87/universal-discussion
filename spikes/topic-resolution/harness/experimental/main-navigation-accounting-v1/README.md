# Owned main navigation accounting (ADR210)

Standalone SOURCE-only component; not integrated into any study, runtime or
native-read path. Import performs no IO, registration, listener installation,
browser/model operation or publication. All consumed v18 sources remain unchanged.

`createMainNavigationAccounting(config)` is the sole export. Configuration has
exactly page, mainFrame, session, token, frameId, blankLoaderId, caseUrl, until,
clock, guard, owner, journey and journeyCall. Capabilities/operators are supplied
by trusted composition, NOT authenticated by this factory. Owner/journey methods
are captured from own data descriptors; subsequent caller mutation cannot replace
them. The future source-reviewed capture wiring must bind actual maintained
objects and event subscriptions. No accepted/fresh boolean or setter is admitted.

The nine synchronous methods are freshCommit(session,page,token,projection),
sameDocument(session,page,token,payload), pageNavigation(page,token,frame,url),
status(), assertBalanced(), seal(), retire(), retainedBytes() and release().
Every method requires its exact argument count. No successful work operation
returns a permission flag; accounting status is not native-read authority.

## Two streams, no reconstructed causal pairing

Create the helper synchronously after actual owner.navigate succeeds and before
Page.navigate. Earlier public notifications continue through the unchanged owner,
including its one initial-blank exception. Blank notifications also delegate to
the owner after construction, without adding any credit; late blank remains fatal.

The first nonblank public notification invokes original owner.pageNavigation
once. Subsequent exact-page/token/main-frame, exact-case-URL notifications only
increment a public counter. freshCommit copies the COMPLETE {frame} projection,
preserving all fields under the existing4096-value/32768-unit/depth12/array64/
properties24/string32768 limits. Future raw-CDP wiring must separately retain its
exact {frame,type:'Navigation'} validation. Both owner and journey receive the
SAME frozen detached projection. The actual owner commit runs first; the actual
journey commit/witness wrapper runs second. Both calls preserve first-error
presence, including all seven falsy values and ownerCaught suppression. Actual
owner/action failures latch immediately before later wrapper side effects can
reenter. If release occurs while propagating a failure, a separate synchronous
invocation-local outcome preserves that original throw; it grants no retained
helper association and is cleared before the invocation finishes.

Only after both operations return their exact synchronous successful values does
the private fresh frame/nonblank-loader association become available. A second
fresh commit is fatal even if totals could balance. The witness wrapper cannot
swallow an actual action failure, omit/duplicate the action or dispatch it later.
Escaped actions use cleared revocable projection/operator slots; delayed dispatch
poisons a still-live helper without touching the old journey, and released
dispatch refuses without borrowing old failures.

sameDocument accepts exactly enumerable own-data {frameId,url,navigationType}
from the original session/page/token, AFTER that private fresh commit. The exact
main frame and sealed case URL without # are required; navigationType is precisely
fragment, historyApi or other. No normalization, changed-URL exception, new
document, loader, seven-fact, TLS/peer/header, rights or native-document authority
is provided. Unknown/unsafe fields and proxies invoke no hooks.

Expected public count is freshCount + sameDocumentCount. Prefix imbalance may
exist during the initial existing readiness loop under its ORIGINAL20s lease.
`status().matched` means freshCount===1 and balanced counts. Counters establish
multiplicity consistency, NOT event-by-event causal identity: indistinguishable
public callbacks can mathematically compensate for missing counterparts. This
helper does not establish the cause of v18's actual repeat refusal.

## Fences, lifecycle and retention

assertBalanced also invokes actual journey.assertComplete(token) and
owner.assertReading, requiring exact true/undefined returns. Native/final/
post-await fences fail sticky when debt is pending; the helper adds no recovery
wait or timer. seal performs these checks before publication. ANY subsequent
main-navigation event is whole-phase fatal, never a row rewrite or a compensating
wait. retire requires zero debt but permits0fresh/0public for unavailable/aborted
transport, without fabricating journey completion. Close/destroy supplies no
credits, and terminal main-navigation refusal is not relaxed.

release is idempotent, bypasses failure/deadline, and invokes NO guard, clock,
owner release, journey retirement or cleanup. It clears only this helper's
references, strings and exact-first-error association. The shared four-article
owner survives. Post-operator fences prevent state/counter writes after reentrant
release, including owner reading and first/blank public callbacks. Work calls
after release refuse nominally. Pure accounting readers
remain available and never call operators/guard/clock; released status is frozen
{state:'released',failed:false,publicCount:0,freshCount:0,sameDocumentCount:0,
matched:false}.

Maximum1024 navigation notifications includes fresh, public/blank and
same-document calls, alongside unchanged external callback limits. Overflow is
checked before increment. No payload/event queue or URL diagnostic is retained.
Logical bytes are1024 + 2*(caseUrl.length+frameId.length+blankLoaderId.length) +320
reserved upfront for one fresh loader. After release1024 remains. This is logical
accounting, not a V8 allocation claim. Future integration MUST reserve all FOUR
slots/tombstones before launch, with known URLs and maximum unknown ID slots,
inside the unchanged32768 aggregate; no new allowance or duplicate charge.

## Tests and unresolved integration

Run from repository root:

```powershell
& 'C:\Program Files\nodejs\node.exe' --max-old-space-size=64 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test-isolation=none --test --test-concurrency=1 ./spikes/topic-resolution/harness/experimental/main-navigation-accounting-v1/test.mjs
```

Before ANY helper/baseline import, tests authenticate externally accepted v18 map
FILE1f4ff5c2bc5dffbb9feeecfff010873450e9dc5974c65a586e4d09909840b609,
then all128 fixed CODE files/2302583 bytes. They recheck all128 endpins. No model,
artifact, output/profile or public input is read. Actual accepted owner/journey/
witness factories are used with invented cases and synthetic seven-fact evidence;
such evidence is NOT real TLS, rights or native provenance.

Coverage includes exhaustive small stream interleavings,81 owner/journey outcome
combinations, falsy guards/actions, wrapper abuse and reentry/release matrices,
post-owner release resurrection regressions, unsafe descriptors, complete
projection limits, wrong capabilities, initial blank, duplicate commit, deadlines,
pending post-await fences, sealed/retiring/released lifetimes and logical caps.
The32768/32769 test is an INVENTED aggregate guard composition, not actual capture
integration. Source tests establish neither real compatibility, semantic quality
nor latency. Actual full-capture aggregate tests, causal integration fakes,
complete review/pins and separate phase decisions remain required. No successor
study copy or actual attempt follows this component.

Future listener wiring must also route observed child-frame same-document events
through its separately reviewed existing LIVE/rooted-child restricted-rendering
and terminal-child rules; unknown children remain fatal. This standalone helper
is main-frame ONLY and rejects child IDs. It supplies no child admission or main
credit, and does not alter terminal main-navigation refusal.

The exported factory's only module lexical dependencies are types, dataCopy and
inspectPageUrl. Private helper definitions are inside the factory. A separately
reviewed future local-function port can use its fresh namespace's equivalent
imports; no frozen-v18 runtime import is implied or authorized by this README.
