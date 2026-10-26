# Parent publication settlement causal tests

This is the bounded ADR217 SOURCE diagnosis harness, not a production fix or a
new actual study. The ADR216 preparation failed; its partial freeze and result
are not admissible and may not be reused. The exact runtime cause is unknown.

The harness exercises the authenticated actual v20 IO, proof wire and selected
Python parent methods with invented capabilities. A visible final file is not
proof that its original publication, final read or response write has settled.
The shared scenarios couple two SOURCE tests; they are not one concurrent native
IPC run. Node milliseconds and Python seconds are separate fake clock domains.

## Run the isolated source checks

Run from the repository root, sequentially:

```powershell
node --max-old-space-size=96 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test-isolation=none --test --test-concurrency=1 ./spikes/topic-resolution/harness/experimental/native-finish-publication-causal-v1/publication.test.mjs
python -B ./spikes/topic-resolution/harness/experimental/native-finish-publication-causal-v1/parent_test.py
```

Both tests authenticate and end-check128 frozen CODE files,115 fixed package
files, the source list/map and FILE-authenticated historical package baseline.
Only the baseline's fixed package subtree is followed; no failed output is read.
The Node test uses injected in-memory filesystem and pipe capabilities. Python
executes only selected authenticated pure AST definitions; it does not initialize
the native parent, start a process or load a native helper library. Neither test
reads assets, artifacts, private profiles, page bodies or model vectors, or writes
a study output. Existing consumed source and output remain immutable.

## Required interpretation

A fake clock advance alone cannot settle an original operation. Tests must keep
the same held original pending, then settle it and observe the actual wire or
write helper outcome. Write/flush/commit checks use actual tracked_pipe_write;
parser claims use actual ProofFrames methods. Any fake-frame injection is labelled
as an injection rather than parser execution.

The counterexample and contrast change schedules, not the actual parent finish
method. An empty queue, visible file, fixed sequence offset or caller flag does
not prove publication complete. No positive test authorizes weaker checkpoints,
new deadlines, an actual retry or adoption of the failed preparation.

## Executed causal checks

Native's sequential run passes9 Node reports at96MiB and15 Python tests, with
no skips. Root independently reran both:9/9 Node reports in292.0047ms and15/15
Python tests in1.438s. These times measure this invented SOURCE harness, not
application latency, physical IPC or semantic quality. Independent Trust review
is pending; the three implementation files are held.

The shared invented chronology starts the pending exchange at0. The parent
observes the visible finish request at6 seconds and source validation takes10
seconds. Its unmodified finish method can serve the queued response and ACK at16
seconds: that is the parent's outcome, not a successful phase. Separately, the
actual Node wire keeps the same original pending through clock advancement and
rejects when that original reply is delivered at16 seconds, beyond its original
15-second exchange lease. No synthetic process exit forces these outcomes to
match. The contrast services the same original at6 seconds, before validation;
neither implementation nor deadline is changed.

Another actual-finish schedule injects a final-read frame after its empty-drain
observation. The parent can ACK while that frame remains queued; the test later
services those same requests through the actual pump. This shows why transient
queue emptiness cannot establish complete publication. Node independently shows
that an idle proof wire can coexist with a pending original final read or close.

The other executed checks cover rejected and held original writes, physical
write/flush versus service commit, unchanged deadlines, drift and checkpoint
refusals, parser EOF/overflow/duplicate input, separately injected unexpected
exit, sampler masking with reverse handle cleanup, and actual run_session's
primary/cleanup report selection. Its constructor, run/close failures and report
publication are deliberately fake capabilities. A deliberately unresolved Node
original remains retained through final bounded observations; this proves
neither infinite liveness nor successful physical cleanup.

## Acceptance boundary

The actual IO/wire and selected parent AST bodies are unchanged. Fake filesystem,
freeze validation, process, sampler/resource and publication capabilities do not
prove the actual ADR216 environment or cause. The original generic failed report
still has no retained exact predicate. Any production repair, new protocol or
bounded first-site/predicate observation needs a separate design and review;
no new preparation or model run follows from these tests. Semantic quality and
live hierarchy integration remain unfinished.
