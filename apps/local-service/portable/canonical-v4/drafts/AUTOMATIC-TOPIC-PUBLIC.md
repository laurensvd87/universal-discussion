# Named-topic public read and reply bridge

This component is unregistered and not live. It depends on named feeds and the
existing authored-context/AI-root components. A read facade must explicitly use
`automaticTopics:true`; application construction additionally requires semantic
discussions and the authored-topic repository. Existing schema17 startup supplies
neither flag. The HTTP capability `topicSearch:named-topics/v1` enables the new
client/panel path only when the service exposes it.

Named and page feed references hydrate the original canonical roots, topics and
discussions in one repeatable-read snapshot. One bounded SQL batch adds only the
immutable public author scope (kind, opaque ID, caption); it never exposes the
Source material digest or captures. Legacy roots receive no manufactured scope.
The panel displays that posted caption without changing reply destinations.
Search uses bounded server pages, query-bound cursors and a200ms input debounce.
Abort, account, service and navigation fences discard obsolete results. Missing
breadcrumb labels are omitted rather than replaced by opaque IDs.

The private reply predicate accepts either the original exact static snapshot or
a named feed edge joined to its public canonical root and original destination.
Three overrides are exact015/016/authored-root predecessors except this one
membership call. All actor, receipt/replay, Source/evidence, canonical lineage,
root/target revisions, body digests, visibility, expiry and watermark checks are
unchanged. No current head lock is acquired while entering canonical domains.
Derived topic membership is checked at the guarded SQL read; a concurrent
withdrawal of a derived association does not retarget the canonical thread.
Canonical root/target edits and withdrawal retain their original locked fences.
AI evidence has its separate existing locked Source freshness checks.

A worker-owned clock plus the maximum pending independent event ID extends the
old semantic read signature. A preferred selection change appends an opaque
context event, so callers after preparation cannot join an earlier pending
absence at the same canonical revision. Foreground writers never update the
clock. The worker acquires it first with SKIP LOCKED and never waits for it while
holding a context/head. Its old core remains unchanged. The public read stays
MVCC-only, including while background work is held.

The nine additional owned-native cases require normal HTTP clients, real read
facade/application/canonical SQL, a real AI job and completed-result proof issuer
(external provider stub only), direct/broad/nested replies, exact replay,
stale-body refusal, Unicode joined-emoji captions, revision signatures,
physical clock contention, execute-only roles and Source erasure. Both native
completion validators require all original91 plus these9 reports. Pure tests
are not evidence that these SQL assertions executed.

## Verification

Owned run `run-ee43e54eff7c8c497d42804960451134951b00a209ea657f` passed
all 100 reports on PostgreSQL 17.11 with source `ee396e78`, catalog commit
`e8d3bea5` and map
`71767d590bb24bb9eb072343ef817ff400e56f7a86def94e430b2ee4d324772e`.
Root separately reauthenticated all 2594 source/runtime pins, strict completion
ledgers, two scratch-database drops, exact owned smart stop, empty Job and all
handles. Stderr was empty and emergency cleanup was false. There was no
independent reviewer. 596 guarded Node tests, 68 pure Python controller tests
and the existing single-session AI causal regression also pass. The UI tests
use simulated DOM, not a genuine browser. No external-provider, representative
matching-quality, many-user or live-latency claim follows.

The preceding owned run `run-daaffa30186fb631211192a420f1f2e7487383ecd8d84198`
failed at `PUBLIC_6_RESULT_UNKNOWN`. Its smart stop/handles/end pins passed;
one scratch database was retained inside that stopped cluster and was not
dropped. The underlying HTTP/session error was not retained, so its exact cause
cannot be claimed from the saved output. Source review found that the new
fixture called result while async AI validation could still occupy its one
exclusive app connection. The existing pure regression reproduces
`SESSION_BUSY` under that ordering. The accepted fixture follows the prior
semantic-insight fixture: wait only for the real in-memory terminal event,
then use normal result HTTP; track and join physical background reads after
dispose. Production code, SQL assertions and limits were unchanged by that
correction. Saved failed catalog/output/database remain unadopted.

## Remaining activation requirements

Required before live activation: unite legacy/static and dynamic search
identities; preserve old named discussion identity across compatible model
changes/erasure and recapture; include previously posted page-scoped roots under
later confirmed subjects using their original protected material (never today's
Source material as a substitute); apply owner-wide/per-topic depth policy to
new scopes; complete the foreground Source context path, schema18 installation,
recovery/migration, genuine browser/provider, representative semantic quality
and latency checks. Current named search alone is not a complete replacement
for the legacy directory and must not be activated as one.
