# ADR150 Native reader root transfer with transient inputs

Date: 2026-10-20. Status: accepted after root and independent review for one
prospective complete native-root study. Root permits one explicit fixed-artifact
preparation and source freeze. Actual collection requires a successful audit of
that preparation first; neither a preparation nor a study has run at acceptance.

## Decision

Evaluate the unchanged selected root classifier on inputs from the actual native
Chrome reader. Use a disposable minimal extension and the byte-identical
production `createPageContentReader`, not the full application background.
The latter would import account, pairing, service and ingestion capabilities
that this quality test does not need. ADR149's completed scheduling diagnostic
is a prerequisite, not evidence of semantic quality or repair of ADR148.

Keep the same32 sealed article URLs, labels and order, selected ADR143 model,
policy, .75 body/.25 title fusion and numeric cuts. No refit, recalibration,
replacement, relabel, retry, old input splice or partial quality assessment.
This is availability reobservation, not an untouched independent population.
Retain the full32 gate: at least24 correct accepted, zero wrong accepted and at
least one accepted per root. Report unavailable and abstained rows separately.
Child/sibling, generic-parent and unknown-root quality remain separate gates.

## Native capture and honest identity

The minimal extension packages only its reviewed study adapter, fixed manifest,
unchanged reader and URL policy. It has narrowly declared public host access and
scripting/tabs/window inspection, without app endpoints, storage, pairing,
credentials, model or provider code. There is no externally connectable or
web-accessible entry point. A private owned-browser automation channel calls the
study adapter. Do not grant permissions in the owner's existing profile.

Read only the owned active main tab of the browser-reported focused normal,
non-incognito window. Check actual tab/window/URL/permission observations before
and after capture and after native attestation. A headless or otherwise controlled
browser is not evidence of real user OS focus or a production capture session.
Failure of an actual foreground check cannot be replaced by an invented success.

Use `reader.read(tabId, sourceUrl, documentUrl)` then `reader.attest` targeting
the exact native documentId returned by Chrome. Preserve raw title identity and
explicitly use the actual matcher's `.trim() || hostname` effective title for the
paired input. Title remains200/body4096 UTF16 units. Validate both before either
is encoded; an overlong effective title is unavailable, never truncated. Bind
both title identities and the versioned fallback rule. Native attestation proves
document/URL continuity, not unchanged DOM
text, publisher permission or canonical Source freshness.

A new full native envelope binds study/case/observation nonce, native tab/window/
main-frame/document identity, exact URL identity, foreground checks, read and
attestation results, raw/effective title and body hashes, extractor and producer
construction. The nonce is an observation version, not a database revision.
Do not invent a CDP loader ID, substitute a Playwright witness, or relabel native
metadata as write authority. A new native wrapper reuses the exact paired-input,
linear-head and pooled-rank functions and unchanged predicates; its tests compare
numeric outcomes to the old candidate on invented vectors.

## Public navigation and processing boundary

ADR018's owner-local production assumption is distinct from the independently
checked corpus policy used in ADR148. This study keeps fresh main-article robots/
TDM preflight, response-header and current DOM checks before retaining or encoding
native text. Unknown or refused rights remain unavailable; no native rescue of
an ineligible main article. Response and DOM policy evidence must bind to the
same actual document observation, not only a URL that could have been reused.
No legal, platform or unrestricted-web clearance is
claimed. Publisher instructions and page content remain untrusted data.

Unlike the closed document-only producer, permit the script, stylesheet and
image resources needed for rendered input within a prospectively fixed public
origin/resource envelope. Block private/loopback/app/provider/authentication
destinations, non-read methods, sockets, downloads, popups and unrelated main
navigation. Keep normal TLS and sandboxing. Record bounded resource block counts;
do not log raw resource URLs or headers. The exact origin admission, DNS/peer
limits and treatment of blocked dependencies need review before execution.
If required resources cannot load, report restricted rendering or unavailable,
not ordinary-browser parity. Main-article processing checks do not imply that
every resource has independently verified processing rights. Page interception
is not complete OS egress isolation.

## Transient inputs and phase order

Prefer one supervised process with at most32 bounded title/body pairs in RAM.
Never write raw text, HTML, headers, screenshots, traces or HAR. Capture all32
accounted rows before E5; fatal capture stops without scoring. Browser processes
must drain before model initialization so Chrome and WASM do not compete for the
same memory budget; supervised Node remains alive, so this is not an empty whole
Job requirement before inference. No cross-producer input rescue or body-packet replay.

Validate actual frozen model/policy/input definition, original successful fit
evidence, source/package closure and a new native construction reuse receipt
before collection. Successful source/admission evidence precedes any model use.
Pre-collection model compilation/identity checks are allowed; embedding and
classification still wait for all32 accounted captures.
After complete capture, validate all available paired fields, then allow at most
64 local E5 calls, without retry or fallback. Encode both fields once; preserve
binary64/negative-zero identities. Close the embedder, recheck asset/source bytes
and only then assess all32 outcomes. Persist only bounded provenance hashes,
availability, vector/decision identities, quality counts and measured timings.

The raw input can no longer be independently reconstructed from saved evidence;
state that limitation. Hashes bind the observed sample but do not independently
prove its semantic content. Reattesting a document before browser closure is not
fresh canonical or post-embedding authority. Live integration must separately
prove its own document, actor, generation, deletion and stale-result fences.

## Execution and rollout gates

### Accepted actual driver envelope

The bounded driver and guardian source gates have passed. The protocol permits
only the one complete frozen attempt after the preparation audit, never an
automatic repeat, subset, retune or live activation.
Use `launchPersistentContext('')` for one fresh anonymous, package-owned temporary
Chrome profile/window under D:TEMP for the ordered32,
with sandboxing and ordinary TLS, no owner state or account/consent automation.
Keep one blank anchor tab and at most one fresh article tab in that same window.
The anchor preserves the native adapter's bound window between cases and never
navigates or reads content. Admit only explicitly expected article-tab creation;
an unexpected popup is fatal, not another study page.
Only the minimal static-import extension loads. Browser-managed temporary cache
may exist within that bounded owned profile; the harness never saves article
text/HTML or a corpus packet. Temporary browser cache/IndexedDB may contain raw
responses on disk; RAM-only applies to harness-extracted text, not every browser
byte. No profile cleanup outside package-owned temporary cleanup is added.
Ignore exactly the installed client's `--disable-extensions` default and add
`--enable-unsafe-extension-debugging` only in the owned browser. Do not discard
all defaults or disable sandboxing. Closing the persistent context also closes
its browser; reserved context/browser close attempts are not independent owners.

Permit each exact article origin's GET/HEAD script, style, image, font, XHR and
fetch resources, plus the five literal public CDN origins in protocol.json.
Do not expand that list after an observed refusal or classification. Record
blocked resource categories and call this restricted-network native input,
not unrestricted ordinary-browser parity. Refuse subframes,
sockets, popups, downloads, unrelated navigation, credential/sensitive URLs and
authorization headers. Unknown or malformed callbacks fail the whole study.
Block page Service Workers through the context while allowing only the exact
byte-pinned study extension worker. An observed dedicated page worker makes that
case unavailable only after its owned page and callbacks have genuinely drained.
A shared or unknown worker without independently proved closure is study-fatal;
closing a page does not prove that a shared worker stopped. These observations
are not a guarantee of zero worker execution or pre-observation egress.
Method/origin interception covers owned page
requests, not a complete OS sandbox. Use one owned page CDP Fetch session for
request and main-Document response interception; do not combine it with a
competing Playwright HTTP route handler. Before article creation, the distinct
maintained WebSocket route closes observed sockets without connecting them to a
server. This is not an OS-wide socket block. Worker/unknown-target observations must never
produce a retained input.

Before Chrome starts, resolve only the29 fixed article hosts and five CDN hosts
with four parallel owned resolvers, at most eight physical A/AAAA queries and
one absolute30-second setup deadline. Each resolver has a five-second lease;
cancel only these owned resolvers and observe their pending settlement at the
global deadline. Mark unattempted/timed-out hosts unavailable, without a new
deadline. Reject any non-public address answer; use a fixed public
IP mapping and fail unknown browser names with host-resolver rules. Disable
proxy use only in this owned test browser, never system settings. Missing DNS
for an optional resource origin remains blocked; a missing article host remains
unavailable. Choose deterministically from all validated answers, IPv4 first,
then canonical lexical order. No retry or alternate address rescue. Actual main
response peers must equal the chosen pin, with normal hostname TLS. The policy
fetcher retains its own independently pinned DNS/TLS checks; it need not choose
the same CDN peer and does not supply the browser's response proof.
These controls are not a complete OS
egress sandbox or proof that installed Chrome honours every requested flag.

Check fresh main-article robots/TDM in eight four-case policy batches using the
unchanged reviewed fetch/pacing gates. Intercept and validate the exact main
response before permitting redirects. Bind its Request/frame/loader journey
and native same-document observations separately, never inventing an ID
correlation. Native DOM-policy checks target the actual document ID and bracket
the reader observation; both must permit and match its case/document identity.
The actual driver must reject intervening navigation/foreground changes before
retention. A matching URL alone is insufficient. Per-resource rights are not
independently established by the main-article checks.

Each article keeps20 seconds, a snapshot two seconds after matching DCL and
10-second ordinary RPCs, with owned2-second fatal close operations. Keep126
ordinary physical operations and two reserved closes within128 total; wrapper
expiry never frees unsettled native work. Bound each article1024/batch4096/
whole-study32768 resource events and32MiB observed encoded resource bytes per
article. An observation-triggered byte limit may overshoot by an incoming event;
do not describe it as a network wire-byte hard cap. Every article must finish
or close its callbacks before the next can consume fresh per-article capacity.
An article lease expiring while native work is still pending is study-fatal;
generic Chrome error text is never reinterpreted as a benign timeout. Casewise
unavailability requires actual owned-page and callback settlement first.

The complete supervised32-case process has1800-second wall,1700-second active
and1650-second Node limits, eight60-second policy batches and at most180 seconds
for the model phase. Memory stays1536MiB/Node heap256MiB, with the established
host/drive reserves. The owned profile/output remains512MiB/8192 entries;
non-profile evidence1MiB, result512KiB, logs64KiB. The longer lease covers the
whole32-case RAM-only study, not a larger per-article timeout or provider call.
Source keys remain256 and the installed package tree128 files/16MiB/4MiB per file.

The supervisor owns Node/Chrome before its exact startup handshake. After all32
capture rows, Node requests a separate drain acknowledgement: the supervisor
must see only its original Node in the owned Job before allowing model loading.
The request contains hashes/counts, never text. The final native process tree
must drain normally; emergency termination is failure. Freeze full source,
package, protocol and artifact-reuse evidence before the first collection.
Request and acknowledgement metadata are fully written and closed in fixed owned
pending files before exclusive atomic hardlink publication. Retain the tiny
pending metadata files; neither reader accepts a partially written JSON file.
An external180-second model-phase cutoff starts when the supervisor first
observes the drain request, including its30-second acknowledgement wait. This
cutoff does not depend on cooperative Node callbacks. A vanished sampled process
may be skipped only after a fresh list of the same owned Job proves its PID
absent. After acknowledgement, an empty Job plus a fresh confirmed original-Node
exit proceeds to the ordinary exit-zero, empty-Job and result checks; it never
permits remaining descendants or an unconfirmed exit.
Model/source rechecks and successful close precede the only full-denominator
quality assessment. A fatal closes the entire study without partial scores.

The source-only native adapter, transient phase ledger, numeric wrapper and
joined contract now pass43 guarded synthetic tests in root and independent
review. Components live in
`spikes/topic-resolution/harness/experimental/native-reader-transfer-v1/` and
`apps/local-service/experiments/topic-encoder/native-root-rank-candidate-v1/`.
The former includes a separate static-import MV3 entrypoint: Chrome does not
support dynamic `import()` in extension service workers. Its metadata-only
`skipUnavailable` command consumes a refused case without visiting it or invoking
the native reader. The same one-use sequence covers skips and observations.

The ledger retains32 bounded pairs privately, rejects reentrant capture
admission, and preserves cancellation across every awaited encoding/cleanup
boundary. It observes accidental rejected async callbacks while refusing their
synchronous contracts. The wrapper validates and canonicalizes full native,
raw/effective field and separate rights-evidence identities before vectors are
available. Joined tests use invented rights records, coefficients, text and
unit vectors, not actual Chrome or semantic examples.

That earlier11-file checkpoint is historical component evidence, not an executed
study or the current complete source inventory. Component evidence is
`apps/local-service/data/native-root-transfer-component-review-20261020.json`.
The complete driver now has72 fixed CODE sources and115 package files,187 total.
Actual guarded inventory checks their existence, path/layout and package byte
bounds; a separate test checks every literal relative runtime import. Both real
nearest ESM package contexts are included. The fixed11 artifact files, original
fit and target source aliases, new native recipe/reuse receipt, six staged files,
actual local assets and guardian must pass their independent phase checks.
Preparation refuses an existing receipt, freeze or output before artifact reads,
and rechecks all11 artifact identities after async compilation before exclusive
publication. Source gates and extracted pure Python guardian tests pass; actual
browser compatibility and semantic quality remain the purpose of the next run.
Defaults remain inert. A source gate alone never supplies actual native or model
evidence. Root must audit preparation before issuing the single supervised run.

Do not edit frozen studies or applied migrations, activate the dirty worktree,
change owner depth, regroup history, send provider requests or posts, access
credentials, change login, restart the crawler or mutate canonical data. Keep
the application, dashboard and crawler running. A root-transfer pass alone does
not establish a workable full hierarchy or justify live activation.

Chrome's native scripting contract documents returned document IDs and targeting
those same IDs in [the scripting API reference](https://developer.chrome.com/docs/extensions/reference/api/scripting).
The [DevTools Extensions domain](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/)
documents experimental unpacked-extension loading; actual installed-Chrome
compatibility remains an execution check, not a documentation guarantee.
Chrome's [extension service worker basics](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics)
specifies the static module-import route used by the new worker.
The maintained [WebSocket routing API](https://playwright.dev/docs/api/class-websocketroute)
keeps routed sockets disconnected from their server unless the handler explicitly
connects; this study never invokes that operation.
