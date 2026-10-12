# ADR-106: Authenticated ingestion response deadline

Date: 2026-10-12
Status: Owner approved; implemented, independently reviewed and active

## Context

The owner's crawler reports a complete HTTP 408 (`response-timeout`) during
Apply. Canonical ingestion is synchronous. The transport checks its five-second
absolute deadline after the handler completes, and can replace a successful
committed write's response with 408. The planner alone permits ten seconds of
CPU work. Read-only inspection finds one staged candidate with an exact accepted
operation ID and representation digest in canonical storage; a controlled-clock
six-second synthetic transport replay reproduces suppression of the success.
Live CPU/disk phase durations are not measured; this is not a capacity ceiling.

The owner explicitly approves a thirty-second response window only for
authenticated ingestion, corresponding crawler timeout and an idle service
restart. ADR-104's model-only lease is extended solely by this approval.

## Decision

Exact normalized `POST /v1/sources/ingest` may acquire a separate internal lease
after Host, existing Origin/pairing and any optional account checks, JSON and full
learned-ingestion input validation, before synchronous ingestion starts. Both
socket and handler clocks share thirty seconds total from socket acceptance,
not thirty seconds from authorization. Original expiry, abort/close or a prior
lease cannot be revived. Expiry before dispatch must prevent the write.

Raw header/body collection and unvalidated/unauthenticated/other requests retain
five seconds. Existing authenticated models keep their original separate lease.
HTTP input cannot request a timeout. Connection/header/body limits, canonical
generation/version/operation proofs, pairing, grouping thresholds and the
ten-second planner CPU budget remain unchanged. This does not make synchronous
work preemptible or guarantee a response for work exceeding thirty seconds.

Only crawler ingestion requests use a thirty-second client timer. Version and
catalog requests keep their existing ten-second default. Endpoint/token/payload,
operation ID/digest, conflict/ambiguity behavior and total attempt limits remain
unchanged. Complete 408 remains terminal; no new retry or background work follows.
An accepted write with an uncertain response remains staged until existing
manual-run canonical URL reconciliation. Current receipts can disappear after
replacement/deletion, so blanket 408 retries would not prove safe reconciliation.

An isolated remote fetch failure and a local canonical write failure are distinct:
the former can be skipped, while the latter stops the invocation to avoid driving
more work into a possibly unavailable service or losing write acknowledgment.
Queued/staged state persists; stopping is not deletion or loss of the frontier.

## Verification and activation

Controlled-clock tests must cover successful slow synchronous ingestion and
exact idempotent replay, original/leased absolute expiry, refusal to dispatch
after expiry, late/repeated leases and connection/abort handling. Invalid Host,
Origin, pairing/account, body/schema/representation and other routes cannot lease.
Capacity errors within the response window remain their actual error; rejected
or expired-before-dispatch requests cannot mutate canonical state.

Crawler tests cover ingestion-only timers, eleven-second success without retry,
exact conflict payloads, unchanged catalog deadlines and terminal complete 408.
Independent review accepts. Focused deadline tests57 and HTTP/service32 pass;
crawler client13 pass. Full final offline backend878 pass with five platform
skips; secret scan753 files/zero findings and diff checks pass. Implementation
d493eaa is committed/pushed. Verified idle normal restart activates the change;
canonical revision1568/941 Sources/982 total Topics/75 contributions stay exact.
Serialized canonical, private and crawler database SHA-256 values and pairing
file hash match before/after. Protected ChatGPT login restores connected/not
pending; read-only health/version/status checks pass. No agent owner ingestion,
provider inference or public fetch occurs. Service PTY27204. App account session
may need renewal; a newly started crawler loads its longer client timer.
Pairing, protected provider login, canonical/private/account state and crawler
ledger must remain intact. No root-run owner ingestion, provider inference, public
page fetch or expanded browser retry follows this correction.
