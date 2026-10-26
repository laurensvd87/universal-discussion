# ADR182 Owned Job process list observation

Date: 2026-10-23. Status: Root and independent Trust accept the bounded source
implementation. Actual execution requires final fixed pins and a separate
one-attempt decision.

## Distinguish the process list refusal without a public study

ADR181 TRAIN/CAL failed before its first drain or E5 evaluation. The new finite
diagnostic identifies `job-pid-capacity` in the fixed class3 Job query after a
nonzero BOOL return. Its three possible predicates are assigned greater than128,
listed greater than128 or unequal assigned/listed counts. No failed values were
retained; the last successful peak14 cannot identify them. All consumed v1/v2/v3
CODE, maps, freezes, outputs and profiles remain unchanged.

Microsoft defines the required and returned identifier counts separately and
instructs callers to enlarge an insufficient list buffer. A short list must not
establish memory accounting or process absence. The documentation does not prove
that churn caused this actual refusal:
[process list structure](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_process_id_list),
[query contract](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-queryinformationjobobject).

Use a new fixed `native-job-list-observation-v1` namespace for a synthetic,
metadata-only experiment. There is no Chrome, public page, network, DNS, model,
package asset, database, account, provider, post or crawler action. Do not execute
an old wrapper or reuse a failed study workspace. This experiment does not grant
production membership, absence, memory or topic-assignment authority.

## Fixed children and owned handles

The Python controller stays outside a new held Job. Create only fixed Python
child invocations using `CreateProcessW` with `CREATE_SUSPENDED|CREATE_NO_WINDOW`.
The interpreter is the existing64-bit Python3.12.10 executable at the exact
reviewed local path; its104952-byte FILE SHA256 is
`4d6f5f81a4bca11191c4c7c6b43632694d0a4ce74e068619d8fdc161d469859a`.
`sys.executable` must agree with that literal identity; it cannot select another
runtime. Authenticate the executable before child creation and at endchecks.
This pin does not attest every Python DLL, standard-library or OS byte.

Invoke that fixed executable with `-I -S -B` and the fixed owned child mode. The
child only waits for a fixed short interval and exits; it cannot spawn children,
read arbitrary inputs or perform application work. No caller supplies executable,
script, command, environment-derived path, workload, schedule or output location.
The explicit Unicode environment contains only the four fixed variables in
case-insensitive name order: SystemRoot, TEMP, TMP, WINDIR. Both temporary paths
name the fresh owned output. Preserve double-NUL termination and the Unicode
creation flag; do not inherit the controller environment. This follows the
[Windows environment-block contract](https://learn.microsoft.com/en-us/windows/win32/procthread/changing-environment-variables).

Retain both original process and thread handles immediately on creation. Latch
successful Job assignment before later membership or resume checks. Require
`IsProcessInJob` on the held process handle to confirm the exact Job before
`ResumeThread`; DWORD(-1) is failure. Never resume an unassigned or unverified
child. Any preassignment refusal must terminate only that exact retained owned
process handle. Later emergency cleanup may terminate only this held Job. Never
look up or terminate a PID from an untrusted or partial process list.

Observe exit using each original process handle and check the exit result. Retain
exited process handles for the declared observation, then close them explicitly.
Close every original process/thread handle exactly once, including failed-create,
assignment and resume branches. Missing or failed cleanup makes the experiment
unsuccessful; it never establishes empty Job or valid samples.

## Predeclared schedules and observations

The first group has eight successfully assigned suspended children; the controller
does not count toward this eight-child Job. Query the original full128-slot list,
then a deliberately one-slot list as an explicit negative control. Resume the
known children, sample while active, wait for physical exits with handles held,
sample again, close the handles and sample again. Do not assume in advance how
exited-but-held handles affect assigned/listed fields.

Then run bounded spawn/exit churn with at most eight simultaneously live owned
children and64 total children across the whole experiment. Stop new spawning at
the first unexpected full-buffer inconsistency or resource/identity refusal.
No failed observation causes an automatic repeat, replacement or acceptance
retry. Normal exit of already-owned children and bounded cleanup may continue.

Instrument the exact copied class3 query/validation seam. Keep the original
128-slot success and completeness predicates unchanged. Retain the query ordinal,
fixed schedule, BOOL result, buffer capacity/bytes, assigned/listed DWORD counts,
returned byte count, ABI sizes/offsets, finite immediate OS category on BOOL0,
and distinct oversized/mismatch flags. Capture cached last error immediately
after BOOL0, with `use_last_error=True`, before another API or cleanup call.
No stale error is attached to a successful BOOL.

Retain no PID, arbitrary path, environment, exception message, stack, page content
or raw process memory. Returned PIDs may be compared privately against the finite
known held-child set, never followed through an external process lookup. An
unexpected identifier is fatal. A partial list remains diagnostic only; it cannot
establish absence, permit memory sampling or satisfy a normal-empty-Job proof.
The small-buffer control is labelled separately and never enters an acceptance
path. Refusals keep their original outcome; projected diagnostics cannot rescue
failed execution or failed cleanup.

Reserve the first accepted observation of each fixed schedule stage, the first
unexpected refusal and the final complete-empty observation within the retained
row ceiling. Include an expected BOOL-false small-buffer control as an accepted
diagnostic observation, not a complete list. Repeated active polling must not
displace the declared exited-held and handles-closed comparisons. Deduplicate
by query ordinal and fill remaining slots with ordinary samples; include every
query in bounded stage/drop counts.

Use at most2048 class3 queries and256 retained rows; cap any aggregate counters
to that same query budget. Output is at most128KiB in at most16 fixed files;
stderr is at most1KiB and contains closed generic codes only. The new output must
be fresh and exclusive; retain it after success or failure without deletion.

## Resource and source gates

Use one original epoch: at most45s active and60s total including cleanup. Observed
cumulative Job user plus kernel CPU is limited to20s; a user-only Windows Job
time limit must not be described as a kernel-inclusive hard limit. Enforce a hard
512MiB Job committed-memory limit and eight active child processes. Require host
physical and commit reserves1GiB, C free2GiB and D free4GiB before creation and
while sampling. Sampling and timeout enforcement are best-effort scheduling
checks, not instantaneous CPU/RSS or a kernel-atomic filesystem sandbox.

Keep all waits and physical operations charged until actual settlement. Verify
normal child exits and complete empty owned Job using full valid enumeration
plus the known original handles. If normal cleanup cannot complete, terminate
only the held owned Job and report emergency cleanup as failure. No global process,
service, paging, Windows Update, permission or sandbox change is permitted.

Matcher owns `run.py`, `run.test.mjs` and `README.md` in the new namespace. Root
owns this decision, fixed source inventory/map, integration, source acceptance
and any actual decision. Trust independently reviews the complete native wiring,
finite observations and cleanup before execution. Authenticate every literal
CODE dependency and the fixed interpreter before native child creation; recheck
source at end. Evidence JSON never selects an executable or arbitrary read path.

Pure injected tests must distinguish all three original capacity predicates,
BOOL failure/error projection, expected small-buffer control, unchanged full
success, returned-byte bounds, known/exited/unknown children, counter limits,
assignment latch, no resume before verification, both retained handles, failed
resume/close, primary/cleanup failures and zero-hook diagnostic projection.
Run the identical exported Python AST suite separately from guarded Node tests.
No source test authorizes native execution. Actual count metadata must pass an
independent saved-evidence audit before proposing a new complete-list algorithm
or another public study. No automatic production-policy relaxation follows.

## Source acceptance and one observational run

Root and independent Trust accept the complete three-file implementation. The
identical exported Python AST suite passes20 tests; the guarded Node suite has
one pass and one expected offline child skip. Actual adapter tests cover the
known-child schedule and native parameters, all original count predicates,
small-buffer isolation, sorted scrubbed environment, handle ownership/cleanup,
failed final samples, original deadline checks and bounded stage retention.
These are injected source tests, not a native reproduction or topic-quality result.

Root permits one separately recorded fixed synthetic observational attempt after
the final four-CODE map, unchanged frozen study inventories, literal secret scan,
fresh output and resource reserves pass independent review. Retain its result
and all output on success or refusal without retry/adoption. The expected
negative control or an observed count inconsistency must not grant membership
authority. Audit actual exit, rows, source/endchecks, cleanup and bounds before
using the evidence to propose another algorithm. No public collection, local E5,
provider, canonical, service or crawler action is authorized. Consumed source,
map and output become immutable at their original paths.
