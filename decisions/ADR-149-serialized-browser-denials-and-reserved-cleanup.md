# ADR149 Serialized browser denials and reserved cleanup

Date: 2026-10-20. Status: accepted for source-only implementation after review.
Root authorizes any later source freeze and actual Chrome run separately.

## Decision

Validate bounded route-denial scheduling and cleanup admission with real Chrome
on an invented local fixture before another public topic-transfer attempt.
Use the reviewed injected coordinator as the scheduling core, not a claim that
the previous capture is repaired. No public article, retained packet, embedding,
model, account, provider or canonical database belongs in this diagnostic.

ADR148 stopped at its fifth batch with a confirmed request-denial capacity
failure. The source also permits128 unresolved ordinary RPCs to starve cleanup
before close is invoked. That explains a possible failure mechanism; the saved
trace does not establish the exact historical cleanup state. Its frozen sources,
results and unavailable rows remain closed, without later batches or scoring.

## Scheduling and cleanup ownership

Allow at most126 physical ordinary operations, including one denial in flight,
and reserve two additional slots for fatal teardown. The total remains128.
Queue denial metadata within4096 lifetime normal submissions. Process denials
serially; an abort rejection is a fatal error, never successful denial.

An admission handle privately owns its actual operations. Caller timeout,
failure or disposal may reject waiting callers but cannot free a physical slot
until the underlying promise settles. Keep rejection handlers attached after
failure. Stop normal admissions and release queued metadata on fatal failure.

The two lifetime cleanup submissions belong only to the current owned context
and owned browser. Normal per-article/context closure uses the ordinary lane;
it must not consume these reserved submissions ahead of fatal teardown. If an
ordinary close is already issued, observe that same operation rather than
inventing a second independent cancellation. A cleanup failure keeps the run
failed. An outer owned Job remains the final guardian for genuinely stuck work.

## Controlled Chrome fixture

Use ADR147's unchanged byte-pinned playwright-core1.64.1 and installed Chrome
with sandboxing enabled and a fresh D: profile/context. Install request and socket
denial before creating the page. The only document is an invented HTML string
installed into about:blank; there is no public navigation.

The normal case creates1000 unique image references under one fixed .invalid
hostname. Reject every resource through the coordinator before continuation;
admit no page request. Verify exact owned main-frame GET/image identity and
the fixed ordinal URL set. Unexpected requests or duplicate ordinals fail.
Record counts and hashes, not fixture DOM, raw URLs or error strings.

Wait for all1000 actual abort operations and callbacks to settle. Require one
denial in flight, bounded queue/physical operation counts and no hidden abort
failure. Close this context through the ordinary lane, leaving both fatal
cleanup submissions unused.

A second fresh context tests controlled failure with256 invented image
references. Execute and observe its first actual route.abort normally, then hold
only that adapter operation's completion on an explicit injected barrier. Count
native abort settlement separately from adapter physical settlement. Never
invoke a delayed native abort after teardown or count its rejection as success.
Wait for at least one further route to queue. Do not require all256 routes
to dispatch before failure: browser scheduling may limit that concurrency.
Fill the remaining125 ordinary slots with explicit injected barrier operations,
then declare a fatal condition. These125 operations are not Chrome commands.

Require normal caller rejection without pretending the126 held adapter
operations settled. Admit and await only the owned context/browser teardown
through the reserved lanes, once each, attempting both even if the first fails.
Release invented barriers in bounded finally after the close attempts/deadlines;
a successful case requires actual closure and drained physical accounting. An
expired wrapper cannot release live native work. Observed route/queue counts
must remain exact and bounded. This tests real cleanup under a full adapter
quota, not a demonstrated set of126 hung Chrome protocol commands.

The intentionally injected fatal has a private unique identity and stage. It is
the only expected failure. Any earlier, simultaneous or later unknown callback,
native abort rejection, deadline, resource, source or cleanup failure fails the
diagnostic, even if the coordinator already retains the injected failure code.

The normal and controlled-failure cases may share one owned browser sequentially.
The latter must finish last because it closes that browser. Both must leave no
owned descendants after normal Node exit. Emergency Job termination is failure,
including in the intentionally triggered scheduling case.

## Bounds and evidence

Keep the established180s outer wall,170s active guardian,256MiB Node heap and
1536MiB Job commit/RSS/private limits. Keep host1GiB, C:768MiB and D:512MiB
reserves, fresh output/profile512MiB/8192 entries, result/log64KiB separately and
all non-temp evidence256KiB. Use at most45s for each controlled burst and at most
10s for ordinary client operations, all inside the same absolute job deadline.
Fatal context/browser close each has a bounded2s wrapper; wrapper expiry does
not release underlying slots or establish cancellation.

The supervisor assigns its owned Job before the explicit stdin handshake permits
the client import or Chrome spawn. It retains bounded failed evidence and
rechecks the complete fixed source/package closure before reporting completion.
Installed package traversal remains128 files/16MiB/4MiB per file; source keys
remain bounded256. Neither input JSON nor receipts supply filesystem paths.

The result must distinguish the successful normal burst from the expected
controlled failure, report physical and caller counts separately, and bind the
actual source/package bytes, fixture recipe and supervisor cleanup/resource
evidence. No claim of complete OS egress isolation or Playwright internal IPC
capacity follows from page-level request denial.

## Review and rollout

The scheduling primitive lives in
`spikes/topic-resolution/harness/experimental/playwright-route-coordinator-v1/`.
The new diagnostic namespace is
`spikes/topic-resolution/harness/experimental/playwright-route-burst-dev-v1/`.
It must default to inert and expose only one explicit supervised DEV command.

Independent source review must cover actual callback integration, one-use task
ownership, failure priority, timeout versus physical settlement, reserved cleanup
ownership, exact resource bounds and honest Job drain. Synthetic tests alone do
not authorize the real run. Root reviews and freezes source bytes only after
those checks pass, then authorizes one run and independently audits its saved
evidence. No automatic repeat or public website visit follows a failure.

A diagnostic pass permits considering a new prospective public capture version;
it does not resume ADR148 or validate semantic matching. A future version still
needs fresh producer identities, unchanged-model reuse proof, complete capture
and encoding gates and full-denominator topic evaluation. Live API, worker,
dashboard, discussions and crawler remain unchanged throughout this diagnostic.
