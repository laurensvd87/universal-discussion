# ADR-104: Authenticated model deadline and confirmed matching-conflict recovery

Date: 2026-10-12
Status: Owner approved; implemented and independently reviewed

## Context

A read-only model-catalog diagnostic failed locally while the provider request
subsequently succeeded. The loopback socket and response handler both had an
absolute five-second lifetime, despite the provider's twenty-five-second and
model client's thirty-second limits. The OAuth catalog contract is distinct
from the API-key catalog; this correction changes neither its parser nor
provider request. See [official OpenAI models and inference documentation](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference).

Background matching captures the canonical version before reading/embedding a
page. A concurrent crawler or discussion write can therefore reject ingestion
with HTTP 409. Existing generic conflict errors did not prove a received,
non-writing server rejection. The owner's ThreadShift “Not verified” badge maps
to unavailable, not conflict; its exact transient transport cause is unproven.
The saved Source already exists. These are separate failure mechanisms.

The owner explicitly approved both corrections. This approval does not extend
provider inference budgets, data collection, browser permissions or publication.

## Decision

### Authenticated model response lease

Only a normalized empty GET `/v1/ai/models`, with AI available and successful
Host, existing Origin, pairing and any applicable account/provider-identity
checks, may obtain an internal response lease. The handler's second trusted
argument carries the callback; HTTP fields cannot choose or extend timeouts.
Existing native privileged GET Origin omission remains compatible.

Both socket and handler expire thirty seconds total from socket acceptance,
using a monotonic clock. A lease is single-use; expiry, abort or closure cannot
be revived, including when event-loop timers are late. Incoming headers/body,
unauthenticated and other-route limits remain five seconds. Existing byte caps,
sixteen-connection limit and one-request-per-socket restriction remain.

### One confirmed non-writing ingestion recovery

The client privately brands an error only after an exact `/sources/ingest`
HTTP 409 with a complete, bounded (256 bytes), valid UTF-8 JSON response matching
the canonical `{"error":"conflict"}` bytes. MIME and declared length are checked.
A module-private WeakSet, not a caller-controlled property or error code,
supplies this evidence. Malformed/partial/redirected/unavailable responses,
timeouts, generic 409s and local dispatch guards never authorize recovery.

For that evidence only, matching reads a fresh validated version, requires the
same generation and a strictly greater revision, and renews exact foreground
page/window/tab/session/permission/pairing/block/epoch checks plus attestation of
the originally captured document immediately before dispatch. It retries once
with the identical operation ID, normalized URL, title, vector/model and
extractor. Only expected version changes. No text reread or reembedding occurs.
Cache state uses the accepted version. Another conflict remains terminal.

Server conflict paths reject before commit or roll back their transaction;
post-commit listener failures cannot masquerade as 409. The operation digest
excludes expected version, so the stable operation remains consistent. An
accepted write whose response is lost is never automatically retried here.

## Verification and activation

Independent Trust accepts both final implementations. Controlled-clock tests
exercise slow successful models, absolute expiry, late/repeated/forged leases,
raw ingress, unauthenticated/other routes and existing Origin behaviour. Real
in-process service/client/matcher tests cover concurrent write recovery and
accepted-write/lost-response rejection; authority races and unproven conflicts
remain fail-closed. Full restricted extension suite: 1,488 pass. Full backend:
838 pass, five platform skips. Isolated Chrome community checks pass at
320/390/480 px with no uncaught errors or horizontal overflow. Secret scan:
750 files, zero findings.

Normal service activation used the standing restart approval only after the
crawler process was absent, the service had only its listening socket, and no
private generation was running. Canonical generation/revision 1200, 596 Sources,
637 Topics and 69 contributions, plus two private chats/three messages, stayed
exact. Pairing and protected ChatGPT login restored. One read-only live model
catalog returned seven models in 1,358 ms; no inference/page transfer or posting
was performed. Extension 0.13.60 requires reload. The restart also loads the
separately reviewed and committed ADR-102 exact-planner performance correction;
its files and grouping policy are not changed by this increment.

## Remaining limits

This is not unlimited retry, nor a cure for all canonical regrouping load or
provider outages. Other transport and client deadlines remain unchanged. The
sarcasm dispatch/style observation still awaits the owner's deliberate public
generation; no extra inference was authorized or made. Running crawlers are
never interrupted to activate this correction.
