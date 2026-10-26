# ADR183 Detached owned Job observation

Date: 2026-10-23. Status: Root and independent Trust accept the source design.
Actual execution requires complete source review, fixed pins and a separate
one-attempt decision.

## Test console creation without widening process access

ADR182 failed honestly: its suspended sample contained exactly eight known
children; after resumption a complete list contained15 identifiers, not all
known. Normal cleanup, empty Job and source endchecks passed. It did not
reproduce ADR181's count mismatch or identify the extra members. All consumed
source, maps and outputs remain immutable.

A Microsoft external-staff member reports a similar first-hand Windows11
experiment: CREATE_NO_WINDOW created an additional console host in the Job,
whereas DETACHED_PROCESS did not. This different Python/version/setup supports a
counterfactual test, not an identity claim about our saved unknown members.
[Reported experiment](https://learn.microsoft.com/en-gb/answers/questions/6034784/windows-job-object-reports-activeprocesses-1-after).

Use a fresh `native-job-list-observation-v2` namespace, mechanically copied from
the frozen v1 with only namespace/decision identifiers and the changes below.
No public pages, Chrome, network, local E5, provider, database, canonical data,
service or crawler action is included.

## Detached children and bounded observations

Replace CREATE_NO_WINDOW with DETACHED_PROCESS. The child creation flags must
be exactly CREATE_SUSPENDED|DETACHED_PROCESS|CREATE_UNICODE_ENVIRONMENT, or
0x40C. Do not combine NO_WINDOW, NEW_CONSOLE or BREAKAWAY. No console allocation
or other child workload is added. Preserve hidden startup, fixed pinned Python,
fixed arguments, sorted scrubbed environment, original process/thread handles,
assignment and exact Job verification before resume.
[Official creation flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags).

Read back the configured class9 limits immediately after setting them and before
the first child creation. Verify required kill-on-close, memory and active-limit
flags with no breakaway flags, active limit8 and Job committed-memory512MiB.
Retain finite values and ABI sizes/offsets; BOOL/length/shape failure refuses
execution. A successful setter alone is not a readback.

Retain bounded class1 accounting observations alongside the existing class3
stage rows: total associated processes, active processes, limit-terminated
processes, user and kernel CPU. These are separate non-atomic snapshots, not
equalities with the process list. Use the existing sampling calls when practical;
at most one additional accounting read per class3 query, within the same2048
query budget and64 retained-row ceiling. Failure remains a finite refusal.
[Accounting contract](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_accounting_information).

Keep full128-slot completeness, unique bounded prefix, exact known-child and
suspended-eight predicates unchanged. Any unknown member stops new spawning and
fails. The one-slot negative control is never membership/absence authority.
No OpenProcess, image lookup, ancestry query or global process enumeration is
added. Readbacks cannot authorize an otherwise rejected process list.

## Preserve limits and acceptance gates

Preserve ADR182's fixed workload and schedule: eight suspended initial children,
resumed/exited-held/handles-closed samples, seven eight-child churn waves,
64children total/eight active, original-handle cleanup and final complete-empty
proof. Keep45s active/60s wall including cleanup, observed20s user+kernel Job CPU,
hard512MiB Job commit, host physical/commit reserve1GiB, C2GiB/D4GiB free,
2048class3 queries,64 retained rows,128KiB/16 output entries,64KiB result and
1KiB generic stderr. No retry/adoption, replacement workload or old entrypoint.

Source authentication covers exactly four literal CODE files: this ADR and the
new run.py, run.test.mjs and README.md. The existing fixed Python binary pin
remains unchanged. Fresh exclusive output, source/interpreter endchecks and all
original failure/cleanup/physical-drain/publication checks remain mandatory.

Matcher owns only the new three implementation files. Root owns this ADR, map,
integration and actual decision. Trust independently reviews full source, exact
delta and pins. Pure tests must assert exact flags and absent conflicting flags,
limit readback success/failure/short-return/wrong-flags/wrong-active/wrong-memory,
class1 snapshot shape/CPU/count bounds, no per-process lookup and unchanged
strict unknown/count/cleanup/deadline branches. Run the exported Python AST suite
separately and the guarded Node suite before actual execution.

Root may record one synthetic attempt after independent source/pin acceptance.
Actual saved output requires independent audit. Success establishes only this
fixed Python-only schedule under detached creation. It neither identifies the
historical extra members nor proves ADR181's mismatch cause, changes enumeration
policy or authorizes another public study by itself. A future study successor
requires its own reviewed source and gates, including the legitimate no-reference
selection-branch repair. No automatic live activation follows.

## Source acceptance

Root and independent Trust accept the complete three-file implementation and
its narrow delta from frozen ADR182. The exported actual-source Python AST suite
passes22 tests independently; the guarded Node suite has one pass and one
expected offline-child skip. Tests cover the exact detached flags, native limit
readback before any child, separate accounting rows and unchanged strict list,
control, original-handle cleanup, resource and publication branches. There is no
new per-process metadata lookup. Root's literal four-CODE secret scan has zero
findings with all six scanner self-tests passing. Final map pins and a separate
one-attempt decision remain required before the synthetic native run.
