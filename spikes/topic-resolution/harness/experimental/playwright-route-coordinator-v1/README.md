# Injected route coordinator prototype

Source-only scheduling experiment, not a Playwright adapter or a repair of any
closed capture. No browser, process, network, timer, model, or filesystem work.

`createRouteCoordinator(execute)` injects trusted Promise-returning infrastructure.
`deny`, `rpc`, and `cleanup` accept exact plain records `{method, ordinal}`;
methods are respectively `route-abort`, `coordinator-rpc`, `cleanup-rpc` and
ordinals are integers 0–4095. Results are completion only; no RPC values or errors
are retained. Diagnostic snapshots contain finite codes and counters only.

Denials run one at a time. At most 4096 normal submissions are admitted over the
handle's lifetime; the queued metadata is bounded by the same budget. Denials
and ordinary RPCs together occupy at most 126 physical in-flight slots. Two
additional slots are reserved for cleanup (at most two cleanup submissions over
the handle's lifetime), keeping the aggregate at 128. This is a new prospective
contract, not a claim about Playwright's internal command capacity.

Fatal failure closes normal admissions, rejects queued and active normal callers,
and drops queued metadata. It does not cancel injected promises or release their
physical slots early. Cleanup can still enter its two reserved slots even if a
denial never resolves. Cleanup failure is never silently accepted. `dispose`
also rejects active cleanup callers and prevents new cleanup. Every injected
rejection is observed; diagnostic failures contain no raw causes.

The future adapter must still enforce synchronous one-use document admission,
own deadlines, cleanup/drain proof, response identities, rights, and resources.
This core supplies no native authority, cancellation of hung work, or quality
evidence. Trusted injection may itself have side effects; these tests use only
invented promises. No integration or activation is included.
