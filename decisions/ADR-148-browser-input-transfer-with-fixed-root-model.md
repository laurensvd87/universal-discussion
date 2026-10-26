# ADR148 Browser input transfer with fixed root model

Date: 2026-10-20. Status: accepted for source-only implementation and review.
Root authorizes receipt creation, freezing and each actual phase separately.

## Decision

Measure whether the unchanged selected root classifier transfers to the current
browser reader through the maintained Playwright client. The four consumed
controls in ADR147 established that this restricted capture path works, not that
its inputs receive correct topics. This new study supplies that missing semantic
check without another fit, calibration, fusion choice or numeric-cut change.

The full project still needs reliable crawler and browser assignment, useful
child specificity, unknown-topic rejection and actual fast canonical/UI
integration. A browser root-transfer pass alone cannot activate any of them.

## Cohort and acceptance

Reobserve exactly the32 article URLs, entity groups, positive root/path labels
and order already sealed for ADR143. Availability has been observed, so this is
not an untouched independent cohort. Preserve all32 rows, including refusals,
missing inputs and abstentions. No replacement, relabel, old input/vector splice,
prefix salvage, redirect rescue, request retry or post-score exclusion is allowed.

Keep the existing small root-feasibility gate: at least24 accepted, zero wrong
accepted and at least one accepted article per root, over the full32 denominator.
Report conditional correctness, availability, root/language/host counts and all
unavailable reasons separately. Positive path prefixes and four terminal anchors
do not establish general child or unknown-root quality.

ADR143 and ADR145 remain closed. In particular, ADR145's static refusals still
block its own paired browser branch and its incomplete study is never scored.
This new browser producer obtains its own current robots/TDM, response and DOM
rights evidence. It does not read or use old static results as permissions or
inputs, and does not require success from a different static extractor. This is
a separate producer assessment, not a claim that the old paired gate passed or
that browser capture repairs a refused static observation.

## Capture and document boundary

Use eight fixed batches of four articles. Reuse ADR147's installed, byte-pinned
playwright-core1.64.1 and installed Chrome with a fresh D: profile. Each article
gets a fresh context with no previous cookies, storage or HTTP credentials.
Install routes and socket denial before its sole page. Reserve one exact current
GET/HEAD main Document request synchronously; deny redirects, further navigation,
subresources, Service Workers, popups, sockets and downloads.

Verify the response belongs to the same admitted Playwright Request object.
Separately bind the CDP frame, loader, matching DOMContentLoaded, isolated world
and final current document. Take one current-reader snapshot two seconds after
that matching event within a20s absolute article lease. Only the maintained
page.goto navigation wait may use the remainder of that same20s deadline;
other coordinator/CDP operations retain the smaller of10s and the remaining
article lease. This prospectively replaces ADR147's10s wrapper around goto,
without resetting or extending the article deadline. Only an owned deadline
timer may produce article-timeout; arbitrary Playwright timeout exceptions do
not. Close the gate before cancellation and let global failures take precedence.
A matching DCL later than18s cannot gain another two seconds. A fresh complete origin
policy phase, public response peer, ordinary TLS, duplicate-preserving headers
and current DOM directives must pass before retaining an input. Unknown policy,
security, identity, source, protocol or resource failures never produce input.

The new witness explicitly sets networkRequestIdCorrelated:false and uses its
own schema. It cannot impersonate the old cross-API Network-ID witness or native
extension attestation. Inline scripts may execute, but external resources remain
blocked; ordinaryDynamicBrowserProducerValidated stays false.

Keep the existing title200/body4096 UTF16-unit limits without additional field
trimming, metadata pruning, Wikipedia lead extraction or title-only rescue.
Retain checked title/body only in an exclusive packet bounded128KiB/four rows;
all other results contain hashes, lengths and bounded evidence, not article text,
HTML, headers, addresses, credentials or arbitrary error strings.

Use only finite typed public-fetch refusal categories with global guards taking
precedence. For the pinned Chromium/Playwright path, allow precisely these full
Request.failure().errorText values on the exact currently admitted Request:
net::ERR_NAME_NOT_RESOLVED, net::ERR_CONNECTION_RESET,
net::ERR_CONNECTION_REFUSED, net::ERR_CONNECTION_CLOSED,
net::ERR_CONNECTION_TIMED_OUT, net::ERR_TIMED_OUT and
net::ERR_ADDRESS_UNREACHABLE. This is an exact error-text allowlist; Playwright
describes that field as human-readable, not a portable typed enum guarantee.

An allowed failure immediately marks that article unavailable with zero retained
input. Recheck it after every awaited boundary and before publication. A rejected
goto may consume an already-observed exact-current refusal, never infer a code
from its exception message. Global or simultaneous unknown failure wins. Null,
malformed, suffixed, TLS/certificate, blocked, aborted and every unlisted value
remain fatal. Ignore only explicitly retired/stopping owned requests, never a
broad set of request IDs. A fatal stops and closes the entire new study; never
retry or continue a later batch to obtain a favourable subset.

## Fixed artifacts and producer identities

Reuse precisely ADR143's selected .75 body/.25 title model, policy, input
definition, original training identity, successful fit proof and numeric cuts.
Create a new browser artifact-reuse receipt after checking those actual bytes.
It binds the new collector, policy, reader, package tree and observation recipe;
it does not claim that the original fit targeted this new code.

The unchanged root scorer requires two target profiles. Carry the original
static target profile only as an explicitly unexercised compile dependency and
bind a new browser profile. The receipt and report state that only browser-current
is evaluated; no new static transfer, capture or acceptance is asserted. Do not
invent a static observation or alter the scorer just to hide its interface.

A new packet envelope binds the full Request/response and frame/loader/reader
witness, exact title/body hashes, extractor, source incarnation, producer profile
and input construction. Only after validating that envelope may the evaluator
project its reduced browser-document fields into the old scorer. Bind the full
envelope hash into input identity so the reduced DTO cannot discard its proof.

Profile construction excludes the receipt and freeze to avoid a hash cycle.
The separate source freeze includes their actual byte identities, all transitive
own/policy/reader dependencies and the complete bounded installed package tree.
Paths are fixed in reviewed code, never taken from JSON input.

## Phase gates and resources

Review the new collector and reuse helper before root creates the receipt and
freeze. Defaults remain inert. Each batch verifies the same source/receipt bytes
and successful prior batch metadata, packet hashes and owned-process drain.
Source drift, uncertain completion or fatal failure prevents later phases.

An evaluator must verify all eight complete capture results and successful
supervisors before opening any new body packet. It independently checks and
compiles the actual reused artifacts and publishes successful supervised
admission before input access. Validate both fields before encoding either;
allow at most64 local E5 encodings, without reuse, fallback or retry. Require all
eight successful encoding receipts before vector reads and final classification.

Preserve ADR147's per-batch180s wall,60s complete policy phase,80s aggregate
article leases,256MiB Node heap,1536MiB Job commit/RSS/private and continuous
host/drive reserves. Assign the owned Job before importing the client or spawning
Chrome. Keep the fresh output/TEMP/profile tree within512MiB/8192 entries,
results64KiB, combined logs64KiB and non-profile evidence256KiB. Success requires
an empty Job without emergency termination. Retain failed evidence; no custom
recursive deletion, process-name kill or owner-profile access is permitted.

The public Playwright API cannot enforce the old raw4MiB IPC or128 internal
command bounds. Disclose that difference, bound coordinator operations128 and
resource events4096, and retain the stated process/Job limits. This is not a
complete OS egress sandbox.

## Implementation and rollout boundary

New collector namespace:
`spikes/topic-resolution/harness/browser-root-transfer-v1/`.
New evaluator namespace:
`apps/local-service/experiments/topic-encoder/hierarchical-e5-browser-root-transfer-v1/`.
Keep every earlier frozen source, receipt, artifact and result unchanged.

Tests must cover exact schemas and cohort order, stale Request/frame/loader
events, refusal after awaited boundaries, both-field validation, metadata-before-
body admission, all-batch completion, source/package mutation and honest failure
cleanup. Invented pure tests do not establish real browser transfer.

No canonical migration, historical regroup, provider inference, account/owner
bootstrap, protected-login change, post, live runtime update or crawler restart
belongs in this study. Preserve existing discussions and the running crawler.
