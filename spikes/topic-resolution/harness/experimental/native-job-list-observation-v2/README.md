# ADR183 detached owned Job list observation - source-only

Default import and no-argument entry are inert. No native phase is authorized.
The only prospective command uses the literal pinned Python312 executable with
`-I -S -B run.py --run-owned-job-observation --source-map-sha256 <external FILE SHA256>` after Root/Trust source approval and
a separate actual decision. There is no prepare command or automatic retry.

Root owns `reviewed-source-map.json`: exact compact UTF8 JSON with schema
`native-job-list-reviewed-sources/v1` and `sourceHashes`, ASCII-sorted over the
three literal files here plus ADR183. Its external FILE hash is checked before
parsing; only those literal CODE paths are read. No JSON path selects an input.
The fixed Python312 executable is independently byte-pinned and rechecked at end;
`sys.executable` is an equality check, never an executable selector. This does
not attest every interpreter DLL, standard-library or OS byte. No old helper,
entrypoint, inventory, output, profile, package or semantic artifact is imported.

The controller remains outside one fresh unnamed Job. Hard limits are eight
active children, 512 MiB committed memory and kill-on-close. Observed cumulative
Job user plus kernel CPU, including exited children, is capped at 20 seconds;
this is not a kernel-inclusive hard CPU limit. Original epoch caps are 45 seconds
active and 60 including cleanup, with host physical/commit 1 GiB, C 2 GiB and D
4 GiB reserves. Sampling is not instantaneous enforcement or atomic confinement.

CreateProcessW always names the literal interpreter, mutable fixed command line
`-I -S -B <this run.py> --owned-child`, no inherited handles, hidden startup and
exact DETACHED_PROCESS|CREATE_SUSPENDED|CREATE_UNICODE_ENVIRONMENT (0x40C),
never NO_WINDOW, NEW_CONSOLE or BREAKAWAY, and an explicit scrubbed environment containing
only SystemRoot,TEMP,TMP,WINDIR in case-insensitive name order, with fixed Windows
and fresh owned-temp values and a double NUL. The child only
sleeps two seconds then exits; it does not spawn, navigate or perform app work.
Both returned original handles are retained before guards. Assignment success
is latched before membership verification; resume requires that exact Job proof
and previous suspend count one. Before assignment only the exact created process
handle may be terminated; afterwards emergency termination targets only this Job.

Immediately after setting limits, class9 readback must succeed with its exact
returned structure size, required flags, no breakaway flags, active limit eight
and 512 MiB Job memory before the first child. Finite readback values and x64 ABI
sizes/offsets are retained; a successful setter alone is insufficient.

The declared schedule is suspended eight, a full 128-slot query, one deliberately
one-slot negative control, resume/active sampling, actual exits while handles
remain held, then explicit handle close and another sample. Seven further waves
of eight give 64 total children, never more than eight live. Every exited group
is closed before replacement assignment. This deliberately observes whether
held references affect counts; it does not assume or prove the historical cause.
The suspended full query must privately equal all eight assigned, verified,
held suspended child identities. The control must actually demonstrate buffer
insufficiency; a BOOL-success prefix still must be bounded, unique/nonzero and
known, and written returned-length bounds must hold. Its incomplete list never
becomes authority merely because it is an expected negative control.

Full queries keep original nonzero BOOL, both counts <=128 and equality checks.
Valid PID prefixes must be bounded, unique/nonzero and privately match original
held children, never followed by external PID lookup. Returned-length consistency
is checked when written. BOOL0 output is diagnostic only and no prefix is read;
the immediate cached error is categorized before another API. The one-slot
control never establishes membership or absence. First unexpected full query
stops spawning with no acceptance retry. Normal exit0 plus a complete empty Job,
original physical exits and successful exactly-once handle closes are required.
Emergency termination or cleanup failure cannot yield success. Primary and
cleanup failures remain distinct; projection errors preserve the original fault.
Normal cleanup waits reserve the last five seconds of the same 60-second epoch
for emergency physical drain. Resource or query-budget refusal cannot free an
original process prematurely or turn an unverified exit into normal cleanup.

At most 2048 class3 calls, 64 retained output rows, and finite per-stage counts.
Privately reserve the first accepted observation per literal stage (at most
eight), first refusal and final complete query; fill remaining slots from the
bounded ordinary-row buffer in ordinal order, deduplicating ordinals. Thus early
poll saturation cannot hide the declared held/closed/churn comparisons. Dropped
rows equal total query attempts minus emitted unique rows. The ceiling is 64.
Each row includes the existing preceding resource guard's separate class1
snapshot: associated/active/limit-terminated counts and user/kernel 100ns CPU.
No additional class1 call is added per query. These are non-atomic observations,
not equality predicates against class3 and never authority for unknown members.
No persisted PIDs, arbitrary paths, environment, raw errors or contents.
Fresh exclusive output is retained: pending result plus exclusive hardlink final,
at most 64 KiB report, 128 KiB total and 16 entries; no deletion or adoption.
Generic stderr is one short fixed line, below 1 KiB. Full-source and interpreter
endchecks bind the report; no production authority or public-study repair follows.
Publication rechecks the original wall after pending close/before exclusive link
and after the final output scan; slow IO cannot create a fresh success lease.
An external observed exit0 is mandatory too: a file already linked before a
subsequent publication/scan refusal is failed-attempt evidence, not success.

Source-only tests:

```text
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none ./spikes/topic-resolution/harness/experimental/native-job-list-observation-v2/run.test.mjs
```

`PYTHON_AST_TEST` is exported for the identical separate `python -B -c` run when
the offline guard refuses child creation. It parses this actual CODE and injects
all WinAPI, clocks and source reads. It never loads a Windows DLL, starts a real
child, creates output or reads a real binary/map/profile/model. No test result
authorizes native execution or changes any frozen study.

The reported external console-host reproduction motivates this one-flag
counterfactual only. Even success does not identify ADR182's unknown members,
explain ADR181's mismatch, relax membership or authorize a public study.
