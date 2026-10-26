# ADR157 Bounded growing owned Job census

Date: 2026-10-20. Status: implemented and independently reviewed as a pure
injected library. No actual execution or guardian-integration permission.

## Evidence and scope

ADR155's one Node-only run failed at census before READY. Its finite underlying
CensusFailure code was discarded, so the exact cause remains unknown. Preserve
all208 source bytes and output; no retry or historical cause attribution.

Separately, source review proves the older inspector fails when a new same-Job
PID appears between its initial and final fresh snapshots. A newly starting Job
can grow. Add a composable pure inspector in
`spikes/topic-resolution/harness/experimental/growing-owned-job-census-v1/`
with `census.py`, `test.mjs` and `README.md`. Matcher owns these three files;
root owns this decision. This does not implement another complete guardian or
grant browser, content, model, canonical or process-execution authority.

## Algorithm contract

The function receives one owned Job and trusted infrastructure callbacks for
fresh membership, opening an enumerated member, same-Job verification, exact
handle identity/projection, closing handles and policy validation of each row.
The actual guardian must supply the original Node/optional exact-console policy;
an injected callback or supplied record is not an authority attestation.

Start with freshly enumerated same-Job PIDs only. Extend the observed union when
later fresh snapshots contain new PIDs, inspect each new member and continue
until one final fresh live set is fully covered. Validate each confirmed identity
immediately, before waiting for an eventually stable set. A transient confirmed
unknown process must not disappear into success. Do not sleep or retry an open,
membership, creation or image failure while that exact member remains live.

Retain opened handles through the final coherence check. Recheck every final live
member against its same opened handle, original PID, exact creation string, image
identity and actual same-Job membership, preventing PID reuse from masquerading
as the original process. If the PID disappears, only a fresh list of this same
Job can establish absence; never a later global PID lookup. A gone unknown member
cannot become an allowed console without an inspected identity. Previously known
console absence may be accepted only by the original immutable-identity policy;
the first helper identity remains consumed even if it exits before sealing.

The held-handle assumption follows Microsoft's documented process-object
lifetime: PID reuse becomes possible after the handles close and the process
object is freed. See the [PROCESS_INFORMATION contract](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/ns-processthreadsapi-process_information)
and [Microsoft's process-ID explanation](https://devblogs.microsoft.com/oldnewthing/20110107-00/?p=11803).
This supports retaining the same handles, not accepting a stale identity without
fresh same-Job membership or claiming an OS sandbox.

Every final live PID needs a current confirmed row. Keep historical confirmed
identities separate from current live membership. The caller still checks normal
original-child exit and completion proof before accepting Node absence. No count-
only success, name whitelist, fixed sleep, broad process scan or raw path logging.

Use one absolute two-second cooperative census deadline, at most eight distinct
observed identities/PIDs, at most nine growth/coherence rounds and32 retained
rows. A later guardian's baseline may impose the tighter two-member scope.
Every handle receives one close attempt on success or failure. Deadline/capacity and
unverifiable live records are finite fatal failures, not retry opportunities.
Retain allowlisted finite census/policy failure codes and bounded partial rows;
never echo arbitrary exception messages, raw paths, arguments or environments.
False or numeric-zero close results and exceptions are failures; retain the
original finite failure code and a distinct cleanup code when both fail.

## Required checks and later integration

Invented callbacks cover a console born between snapshots, successive bounded
growth, transient unknown rejection, PID/creation replacement, gone known versus
gone unknown, failed-open live versus freshly absent, changed Job membership,
deadline/capacity exhaustion, exact FILETIME and close-once behavior on every
exit. Default imports and tests perform no native or process operations.

Root and Trust must review source and tests before any prospective guardian
integration. That later integration must retain finite codes, exact startup
baseline, READY/ACK/completion binding, source checks and identity-aware normal
drain. Neither these pure tests nor a new policy assumption convert ADR155 into
a pass or establish actual model quality. Fresh actual-producer child/STOP/
sibling/outside validation and full application/crawler/UI integration remain.

## Checks

Root and Trust each pass the guarded source test, with its expected subprocess
skip covered by the identical separately executed Python AST/injected suite.
Scenarios include growth from one to eight members, immediate transient unknown
rejection, same-handle identity changes, known versus unknown disappearance,
still-live failed opens, deadline/capacity failures, aliased handles, close-all
on failure and detached evidence. Exact source hashes and review bounds are in
`apps/local-service/data/growing-owned-job-census-review-20261020.json`.
The final reviewed delta covers false/zero close returns and simultaneous policy
and cleanup failures; cleanup no longer hides the primary diagnostic code.
